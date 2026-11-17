/* WrapNote core: a small ZIP writer and reader for Word files (.docx is a ZIP of XML parts).
 * Writing stores each part either as-is or compressed by a deflate function the caller passes in, so
 * this module stays free of platform code: the browser passes CompressionStream('deflate-raw'), Node passes zlib.
 * Reading lists the central directory and inflates with a caller-supplied function the same way.
 * Only what .docx needs is supported: no encryption, no ZIP64, no multi-disk archives. */
(function (g) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;

  // Eight 256-entry tables ("slicing by 8"): eight bytes per step instead of one. Pictures make up most of a .docx,
  // and this cut the checksum time for 4.7 MB of pictures by about three quarters (see docs/QUALITY.md, 1.2.0).
  var T = (function () {
    var t = new Uint32Array(256 * 8), n, k, c;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    for (n = 0; n < 256; n++) for (k = 1; k < 8; k++) t[k * 256 + n] = (t[(k - 1) * 256 + n] >>> 8) ^ t[t[(k - 1) * 256 + n] & 0xFF];
    return t;
  })();
  /** CRC-32 (the checksum ZIP uses), as an unsigned 32-bit number. "123456789" gives 0xCBF43926. */
  function crc32(b) {
    var c = 0xFFFFFFFF, i = 0, n = b.length, lo, hi;
    for (; i + 8 <= n; i += 8) {
      lo = (c ^ (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24)) >>> 0;
      hi = (b[i + 4] | b[i + 5] << 8 | b[i + 6] << 16 | b[i + 7] << 24) >>> 0;
      c = T[1792 + (lo & 0xFF)] ^ T[1536 + ((lo >>> 8) & 0xFF)] ^ T[1280 + ((lo >>> 16) & 0xFF)] ^ T[1024 + (lo >>> 24)] ^
        T[768 + (hi & 0xFF)] ^ T[512 + ((hi >>> 8) & 0xFF)] ^ T[256 + ((hi >>> 16) & 0xFF)] ^ T[hi >>> 24];
    }
    for (; i < n; i++) c = T[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return new Uint8Array(Buffer.from(s, 'utf8'));
  }
  function fromUtf8(b) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(b);
    return Buffer.from(b).toString('utf8');
  }
  function bytesOf(data) { return typeof data === 'string' ? utf8(data) : data instanceof Uint8Array ? data : new Uint8Array(data); }

  // MS-DOS date and time of 01/01/2026 00:00 for every entry: a fixed stamp keeps builds byte-for-byte repeatable.
  var DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

  /**
   * Build a ZIP. files: [{ name, data (string or bytes) }]. deflate: optional function(bytes) -> Promise<bytes>
   * returning raw DEFLATE data; parts that do not get smaller are stored. Resolves to a Uint8Array.
   */
  function zip(files, deflate) {
    var names = new Set();
    files.forEach(function (f) {
      if (!f || typeof f.name !== 'string' || !f.name || /^\/|\\|\.\.(\/|$)/.test(f.name)) throw new Error('Bad part name: ' + (f && f.name));
      if (names.has(f.name)) throw new Error('Duplicate part name: ' + f.name);
      names.add(f.name);
    });
    return Promise.all(files.map(function (f) {
      var raw = bytesOf(f.data);
      var crc = crc32(raw);
      var tryDeflate = deflate && raw.length > 64 && !f.store;
      return (tryDeflate ? Promise.resolve(deflate(raw)) : Promise.resolve(null)).then(function (comp) {
        var useComp = comp && comp.length < raw.length;
        return { name: utf8(f.name), raw: raw, body: useComp ? comp : raw, method: useComp ? 8 : 0, crc: crc };
      });
    })).then(function (parts) {
      var size = 22, offset = 0, i;
      parts.forEach(function (p) { size += 30 + p.name.length + p.body.length + 46 + p.name.length; });
      var out = new Uint8Array(size), dv = new DataView(out.buffer), pos = 0;
      function u16(v) { dv.setUint16(pos, v, true); pos += 2; }
      function u32(v) { dv.setUint32(pos, v >>> 0, true); pos += 4; }
      function put(b) { out.set(b, pos); pos += b.length; }
      parts.forEach(function (p) {
        p.offset = pos;
        u32(0x04034b50); u16(20); u16(0x0800); u16(p.method); u16(DOS_TIME); u16(DOS_DATE);
        u32(p.crc); u32(p.body.length); u32(p.raw.length); u16(p.name.length); u16(0);
        put(p.name); put(p.body);
      });
      var cdStart = pos;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(p.method); u16(DOS_TIME); u16(DOS_DATE);
        u32(p.crc); u32(p.body.length); u32(p.raw.length); u16(p.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(p.offset);
        put(p.name);
      }
      var cdSize = pos - cdStart;
      u32(0x06054b50); u16(0); u16(0); u16(parts.length); u16(parts.length); u32(cdSize); u32(cdStart); u16(0);
      offset = pos;
      return offset === size ? out : out.slice(0, offset);
    });
  }

  /**
   * Read a ZIP. inflate: function(bytes) -> Promise<bytes> for raw DEFLATE. Resolves to an object
   * { 'word/document.xml': Uint8Array, ... }. Rejects with a clear message for files that are not ZIPs,
   * are encrypted, or are larger than the limit (100 MB unpacked) so a hostile file cannot exhaust memory.
   */
  function unzip(bytes, inflate, limit) {
    limit = limit || 100 * 1024 * 1024;
    var b = bytesOf(bytes), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error('This is not a Word (.docx) file: no ZIP directory was found.'));
    var count = dv.getUint16(eocd + 10, true), cd = dv.getUint32(eocd + 16, true), total = 0, jobs = [];
    var pos = cd;
    for (var n = 0; n < count; n++) {
      if (pos + 46 > b.length || dv.getUint32(pos, true) !== 0x02014b50) return Promise.reject(new Error('The file is damaged: its ZIP directory is incomplete.'));
      var flags = dv.getUint16(pos + 8, true), method = dv.getUint16(pos + 10, true);
      var csize = dv.getUint32(pos + 20, true), usize = dv.getUint32(pos + 24, true);
      var nlen = dv.getUint16(pos + 28, true), xlen = dv.getUint16(pos + 30, true), clen = dv.getUint16(pos + 32, true), loc = dv.getUint32(pos + 42, true);
      var name = fromUtf8(b.subarray(pos + 46, pos + 46 + nlen));
      pos += 46 + nlen + xlen + clen;
      if (flags & 1) return Promise.reject(new Error('The file is password-protected. Save an unprotected copy and try again.'));
      total += usize;
      if (total > limit) return Promise.reject(new Error('The file unpacks to more than ' + Math.round(limit / 1048576) + ' MB, which is too large.'));
      if (/\/$/.test(name)) continue;
      var lnlen = dv.getUint16(loc + 26, true), lxlen = dv.getUint16(loc + 28, true);
      var data = b.subarray(loc + 30 + lnlen + lxlen, loc + 30 + lnlen + lxlen + csize);
      jobs.push({ name: name, method: method, data: data });
    }
    var out = {};
    return Promise.all(jobs.map(function (j) {
      if (j.method === 0) { out[j.name] = j.data.slice(); return null; }
      if (j.method !== 8) throw new Error('Part ' + j.name + ' uses an unsupported compression method.');
      return Promise.resolve(inflate(j.data)).then(function (r) { out[j.name] = r instanceof Uint8Array ? r : new Uint8Array(r); });
    })).then(function () { return out; });
  }

  var api = { crc32: crc32, zip: zip, unzip: unzip, utf8: utf8, fromUtf8: fromUtf8 };
  if (isNode) module.exports = api; else { g.WN = g.WN || {}; g.WN.zip = api; }
})(typeof window !== 'undefined' ? window : globalThis);

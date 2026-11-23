/* WrapNote Word engine: Word (.docx) export and template import. Loaded on first use as word.js (with the
 * ZIP and Office Open XML core modules) so the first page load stays small; the app's own modules reach it
 * through WN.app. */
/* Word (.docx) export. Reads the live page (so it can use the same computed layout the
 * person sees), turns it into the plain model WN.ooxml writes, and zips it.
 *   - Headings, title, subtitle, quotes, captions and lists become Word styles and Word numbering.
 *   - Formatting differences from the paragraph's style (bold, colour, size, font) become run formatting.
 *   - Tables keep borders, shading, merged header rows (repeated on each page) and rows that never split.
 *   - Pictures, charts and shapes become PNG pictures; equations become Office Math.
 *   - Contents, table of figures, captions and page numbers become Word fields with the current values cached.
 * Templates: the personal look (fonts mapped to Word fonts), the built-in office template, or a Word template
 * the person imported in Settings (its styles, theme, numbering, headers and footers are used). */
var Docx = (function () {
  var A = WN.app, Layout = A.Layout, Ed = A.Ed, S = A.S, D = A.D, settings = A.settings, timings = A.timings, logError = A.logError,
    Store = A.Store, Review = A.Review, download = A.download;
  var O = WN.ooxml, OT = WN.officeTemplate, Z = WN.zip;
  var TW_PER_PX = 15; // 1 px = 0.75 pt = 15 twips

  function deflateRaw(bytes) {
    if (typeof CompressionStream !== 'function') return Promise.resolve(null); // stored instead: still a valid .docx
    return new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }
  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') return Promise.reject(new Error('This browser cannot read compressed files. Use a current Chrome, Edge, Firefox or Safari.'));
    return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  /* ---------- Pictures ---------- */
  /** Base64 to bytes. The built-in decoder (current browsers) is about three times faster than the loop. */
  function b64ToBytes(b64) {
    if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(b64);
    var s = atob(b64), out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out;
  }
  function canvasPng(draw, w, h) {
    var scale = 2, c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
    var x = c.getContext('2d'); x.scale(scale, scale); draw(x);
    return new Promise(function (res, rej) { c.toBlob(function (b) { b ? b.arrayBuffer().then(function (a) { res(new Uint8Array(a)); }) : rej(new Error('picture could not be converted')); }, 'image/png'); });
  }
  function loadImage(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('picture could not be read')); }; im.src = src; });
  }
  function imageBytes(img) {
    var src = img.getAttribute('src') || '', m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(src);
    if (m) return Promise.resolve({ data: b64ToBytes(m[2].replace(/\s+/g, '')), ext: /png/i.test(m[1]) ? 'png' : 'jpeg' });
    // Other formats (WebP, AVIF, GIF, BMP) are redrawn as PNG, which every Word version shows.
    return loadImage(src).then(function (im) {
      return canvasPng(function (x) { x.drawImage(im, 0, 0, im.naturalWidth / 2, im.naturalHeight / 2); }, im.naturalWidth / 2, im.naturalHeight / 2);
    }).then(function (d) { return { data: d, ext: 'png' }; });
  }
  var SVG_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-family', 'font-weight', 'opacity', 'fill-opacity', 'text-anchor', 'dominant-baseline', 'display', 'visibility'];
  /** An SVG chart or shape as PNG. Page CSS does not travel with a serialised SVG, so computed styles are inlined first. */
  function svgBytes(svg) {
    var r = svg.getBoundingClientRect(), w = Math.max(1, r.width / Layout.zoom()), h = Math.max(1, r.height / Layout.zoom());
    var clone = svg.cloneNode(true), src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
    for (var i = 0; i < src.length; i++) {
      var cs = getComputedStyle(src[i]), st = '';
      SVG_PROPS.forEach(function (p) { var v = cs.getPropertyValue(p); if (v) st += p + ':' + v + ';'; });
      dst[i].setAttribute('style', st + (dst[i].getAttribute('style') || ''));
    }
    clone.setAttribute('width', w); clone.setAttribute('height', h);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    var url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    return loadImage(url).then(function (im) {
      return canvasPng(function (x) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h); }, w, h);
    }).then(function (d) { URL.revokeObjectURL(url); return { data: d, ext: 'png', w: w, h: h }; }, function (e) { URL.revokeObjectURL(url); throw e; });
  }

  /* ---------- Equations ---------- */
  function mathTree(n) {
    if (n.nodeType === 3) return n.data.trim() ? { n: '#text', t: n.data.trim() } : null;
    if (n.nodeType !== 1) return null;
    var tag = n.localName, kids = Array.prototype.map.call(n.childNodes, mathTree).filter(Boolean);
    if (/^(mi|mn|mo|mtext|ms)$/.test(tag)) return { n: tag, t: n.textContent };
    return { n: tag, c: kids };
  }

  /* ---------- Walk ---------- */
  function Conv(look, opts) {
    this.look = look; this.opts = opts; this.jobs = []; this.lists = 0; this.comments = new Map(); this.cs = new Map();
    this.textWidthPx = (look.textWidth || 9026) / TW_PER_PX;
  }
  Conv.prototype.style = function (el) { var s = this.cs.get(el); if (!s) { s = getComputedStyle(el); this.cs.set(el, s); } return s; };

  var SKIP = '.wn-slot, .wn-chart-toggle, .wn-hit-ui, script, style, template, .wn-ocr-raw-ui';
  var BLOCK = /^(P|H[1-6]|DIV|SECTION|ARTICLE|HEADER|FOOTER|ASIDE|BLOCKQUOTE|UL|OL|LI|TABLE|FIGURE|NAV|DL|DT|DD|PRE|HR|FIGCAPTION|MAIN|FORM)$/;
  function isBlock(el) { return el.nodeType === 1 && (BLOCK.test(el.tagName) || el.classList.contains('wn-eq') && el.classList.contains('block')); }
  function hasBlockKids(el) { return Array.prototype.some.call(el.children, function (c) { return isBlock(c) && !c.matches(SKIP); }); }
  function ptHalf(px) { return Math.round(parseFloat(px) * 0.75 * 2); } // CSS px → half-points (1 px = 0.75 pt)
  function isoOf(ms) { var n = +ms; return n > 0 ? new Date(n).toISOString().replace(/\.\d+Z$/, 'Z') : undefined; }

  /** Expected look of each Word style, so only real differences are written as run formatting. */
  Conv.prototype.expect = function (style) {
    var L = this.look;
    if (/^(Normal|BodyText|ListParagraph)$/.test(style || 'Normal')) return { size: L.size, color: L.color, font: L.bodyFont, b: false, i: false, override: true };
    if (style === 'TableText') return { size: L.table.size, color: L.color, font: L.bodyFont, b: false, i: false, override: true };
    return { override: false };
  };

  Conv.prototype.runs = function (node, para, inh) {
    var self = this, out = [];
    inh = inh || {};
    Array.prototype.forEach.call(node.childNodes, function (c) {
      if (c.nodeType === 3) {
        var t = c.data.replace(/[\s ]+/g, function (m) { return m.indexOf(' ') >= 0 && m.length === 1 ? ' ' : ' '; });
        if (!t) return;
        out.push(self.textRun(t, c.parentNode, para, inh));
        return;
      }
      if (c.nodeType !== 1 || c.matches(SKIP)) return;
      var tag = c.tagName, x = Object.assign({}, inh);
      if (c.classList.contains('wn-fnref')) { out.push({ t: 'fnref', text: c.getAttribute('data-text') || '', ins: inh.ins }); return; }
      if (c.classList.contains('wn-capnum')) {
        var kind = (c.textContent.match(/^\s*(\S+)/) || [])[1] || 'Figure', n = (c.textContent.match(/(\d+)\s*$/) || [])[1] || '1';
        out.push(self.textRun(kind + ' ', c, para, inh)); out.push(Object.assign({ t: 'field', instr: 'SEQ ' + kind + ' \\* ARABIC', result: n }, self.fmt(c, para, inh))); return;
      }
      if (c.classList.contains('wn-eq')) { var m = c.querySelector('math'); if (m) out.push({ t: 'math', omml: '<m:oMath>' + O.omml(mathTree(m)) + '</m:oMath>' }); return; }
      if (tag === 'BR') { out.push({ t: 'br' }); return; }
      if (tag === 'IMG') { out.push(self.picture(c)); return; }
      if (tag === 'svg' || tag === 'SVG') { out.push(self.svg(c)); return; }
      if (tag === 'INS' && c.classList.contains('wn-ins')) x.ins = { author: c.getAttribute('data-author') || 'WrapNote', date: isoOf(c.getAttribute('data-time')) };
      if (tag === 'DEL' && c.classList.contains('wn-del')) x.del = { author: c.getAttribute('data-author') || 'WrapNote', date: isoOf(c.getAttribute('data-time')) };
      if (tag === 'U' || /underline/.test(c.style.textDecoration || '')) x.u = true;
      if (tag === 'S' || tag === 'STRIKE' || (tag === 'DEL' && !x.del) || /line-through/.test(c.style.textDecoration || '')) x.s = true;
      if (tag === 'SUP') x.sup = true;
      if (tag === 'SUB') x.sub = true;
      if (tag === 'A') {
        var href = c.getAttribute('href') || '';
        if (/^#[\w-]+$/.test(href)) x.link = '#_Toc' + href.slice(1);
        else if (/^(https?:|mailto:)/i.test(href) && S.isSafeUrl(href)) x.link = href;
      }
      if (c.classList.contains('wn-label')) { out.push(Object.assign(self.textRun('[' + c.textContent.trim() + ']', c, para, inh), { b: true })); out.push(self.textRun(' ', c, para, inh)); return; }
      var cid = c.classList.contains('wn-comment') && c.getAttribute('data-cid');
      if (cid && self.comments.has(cid)) out.push({ t: 'commentStart', id: self.comments.get(cid) });
      if (c.classList.contains('wn-pagebreak')) { out.push({ t: 'pagebreak' }); return; }
      // A citation tag shows on its own line under the note text (1.3.0).
      if (c.classList.contains('wn-cite') && out.length) out.push({ t: 'br' });
      out = out.concat(self.runs(c, para, x));
      if (cid && self.comments.has(cid)) out.push({ t: 'commentEnd', id: self.comments.get(cid) });
    });
    return out;
  };
  /** Run formatting = what the screen shows minus what the Word style already gives. */
  // Screen-only marks: tracked-change colours, comment and search highlights. Word draws its own, so they are not copied.
  var UI_MARK = '.wn-ins, .wn-del, .wn-comment, .wn-hit, .wn-similar, .wn-flash, .wn-selected';
  Conv.prototype.fmt = function (el, para, inh) {
    var src = el.nodeType === 1 ? el : el.parentNode;
    while (src && src !== para.el && src.matches && src.matches(UI_MARK)) src = src.parentNode;
    var cs = this.style(src || para.el), ex = para.expect, f = {};
    var bold = (parseInt(cs.fontWeight, 10) || 400) >= 600, ital = cs.fontStyle === 'italic';
    if (ex.override) {
      if (bold) f.b = true;
      if (ital) f.i = true;
      var sz = ptHalf(cs.fontSize); if (Math.abs(sz - ex.size) >= 1) f.size = sz;
      var col = O.hex(cs.color); if (col && col !== ex.color) f.color = col;
      var fam = O.mapFont(cs.fontFamily); if (fam && fam !== ex.font) f.font = fam;
    } else {
      // Styled paragraphs (headings, title, caption): keep only explicit inline emphasis.
      var e = el.nodeType === 1 ? el : el.parentNode;
      if (e !== para.el && e.closest && para.el.contains(e)) {
        if (e.closest('b, strong') && para.el.contains(e.closest('b, strong'))) f.b = true;
        if (e.closest('i, em') && para.el.contains(e.closest('i, em'))) f.i = true;
        var span = e.closest('[style*="color"]'); if (span && para.el.contains(span)) { var c2 = O.hex(cs.color); if (c2) f.color = c2; }
      }
    }
    // Highlight and shading from an inline element between the text and its paragraph.
    var n = el.nodeType === 1 ? el : el.parentNode;
    while (n && n !== para.el && n.nodeType === 1) {
      if (n.matches(UI_MARK)) { n = n.parentNode; continue; }
      var bg = O.hex(this.style(n).backgroundColor);
      if (bg && bg !== 'FFFFFF') { f.fill = bg; break; }
      n = n.parentNode;
    }
    ['u', 's', 'sup', 'sub', 'link', 'ins', 'del'].forEach(function (k) { if (inh[k]) f[k] = inh[k]; });
    if (f.sup || f.sub) delete f.size;
    return f;
  };
  Conv.prototype.textRun = function (t, el, para, inh) { return Object.assign({ t: 'text', text: t }, this.fmt(el, para, inh)); };

  Conv.prototype.picture = function (img) {
    var z = Layout.zoom() || 1, r = img.getBoundingClientRect();
    var w = r.width / z || img.naturalWidth || 200, h = r.height / z || img.naturalHeight || 150;
    var cap = Math.min(1, this.textWidthPx / w); w *= cap; h *= cap;
    var run = { t: 'img', w: w, h: h, alt: img.getAttribute('alt') || '' };
    this.jobs.push(imageBytes(img).then(function (b) { run.data = b.data; run.ext = b.ext; }, function (e) { logError(e, 'docx picture'); run.t = 'text'; run.text = '[picture]'; }));
    return run;
  };
  Conv.prototype.svg = function (svg) {
    var run = { t: 'img', w: 10, h: 10, alt: svg.getAttribute('aria-label') || '' }, self = this;
    this.jobs.push(svgBytes(svg).then(function (b) { var cap = Math.min(1, self.textWidthPx / b.w); run.data = b.data; run.ext = 'png'; run.w = b.w * cap; run.h = b.h * cap; },
      function (e) { logError(e, 'docx svg'); run.t = 'text'; run.text = '[chart]'; }));
    return run;
  };

  function trimRuns(runs) {
    // Leading and trailing spaces of a paragraph are not visible on the page; Word would show them.
    var first = runs.filter(function (r) { return r.t === 'text'; })[0], last = runs.filter(function (r) { return r.t === 'text'; }).slice(-1)[0];
    if (first) first.text = first.text.replace(/^ +/, '');
    if (last) last.text = last.text.replace(/ +$/, '');
    return runs.filter(function (r) { return r.t !== 'text' || r.text; });
  }

  Conv.prototype.para = function (el, style, extra) {
    var cs = this.style(el), p = Object.assign({ t: 'p', style: style || 'Normal' }, extra || {});
    var para = { el: el, expect: this.expect(p.style) };
    p.runs = trimRuns(this.runs(el, para, {}));
    var ta = cs.textAlign;
    if (!p.align && (ta === 'center' || ta === 'right' || ta === 'justify')) p.align = ta;
    if (!p.fill) { var bg = O.hex(cs.backgroundColor); if (bg && bg !== 'FFFFFF' && !el.closest('td,th')) p.fill = bg; }
    if (!p.border && parseFloat(cs.borderLeftWidth) >= 2 && cs.borderLeftStyle !== 'none' && p.style !== 'Quote') p.border = O.hex(cs.borderLeftColor) || '047857';
    if (el.getAttribute && el.getAttribute('data-wn-id') && /^H[1-4]$/.test(el.tagName)) p.bookmark = '_Toc' + el.getAttribute('data-wn-id');
    if (/^(Heading\d|Title|Subtitle|TOCHeading)$/.test(p.style)) p.keepNext = true;
    return p;
  };

  Conv.prototype.blocks = function (root, out, ctx) {
    var self = this;
    ctx = ctx || {};
    var inline = [];
    function flushInline() {
      if (!inline.length) return;
      // Loose inline content (text directly inside a block container) becomes one paragraph. The nodes are read, not moved.
      var p = { t: 'p', style: ctx.cellStyle || 'Normal' }, para = { el: root, expect: self.expect(p.style) };
      var runs = [];
      inline.forEach(function (n) {
        if (n.nodeType === 3) { var t = n.data.replace(/[\s ]+/g, ' '); if (t.trim() || runs.length) runs.push(self.textRun(t, root, para, {})); }
        else runs = runs.concat(self.runs({ childNodes: [n] }, para, {}));
      });
      runs = trimRuns(runs);
      if (runs.length) { p.runs = runs; var ta = self.style(root).textAlign; if (ta === 'center' || ta === 'right') p.align = ta; out.push(p); }
      inline = [];
    }
    Array.prototype.forEach.call(root.childNodes, function (n) {
      if (n.nodeType === 3) { if (n.data.trim()) inline.push(n); else if (inline.length) inline.push(n); return; }
      if (n.nodeType !== 1 || n.matches(SKIP)) return;
      if (!isBlock(n) && !n.classList.contains('wn-pagebreak') && !n.classList.contains('wn-colbreak') && !n.classList.contains('wn-images') && !n.classList.contains('wn-obj') && !n.classList.contains('wn-cols')) { inline.push(n); return; }
      flushInline();
      self.block(n, out, ctx);
    });
    flushInline();
    return out;
  };

  Conv.prototype.block = function (n, out, ctx) {
    var self = this, tag = n.tagName, cl = n.classList;
    if (cl.contains('wn-pagebreak')) { out.push({ t: 'p', runs: [{ t: 'pagebreak' }] }); return; }
    if (cl.contains('wn-colbreak')) { out.push({ t: 'p', runs: [{ t: 'colbreak' }] }); return; }
    if (cl.contains('wn-cols')) {
      var cols = parseInt(this.style(n).columnCount, 10) || 2;
      out.push({ t: 'section', sect: { continuous: out.length > 0, cols: 1, first: true } });
      this.blocks(n, out, ctx);
      out.push({ t: 'section', sect: { continuous: true, cols: cols } });
      return;
    }
    if (/^H[1-6]$/.test(tag)) {
      var lvl = Math.min(4, +tag[1]);
      var style = cl.contains('wn-doc-title') || cl.contains('wn-cover-title') ? 'Title' : 'Heading' + lvl;
      if (n.closest('.wn-cover') && style !== 'Title') style = 'Subtitle';
      out.push(this.para(n, style)); return;
    }
    if (tag === 'P' || tag === 'FIGCAPTION' || tag === 'PRE' || tag === 'DT' || tag === 'DD') {
      if (hasBlockKids(n)) { this.blocks(n, out, ctx); return; }
      var st = cl.contains('wn-title') || cl.contains('wn-cover-title') ? 'Title' : cl.contains('wn-subtitle') || cl.contains('wn-cover-sub') ? 'Subtitle' : cl.contains('wn-caption') ? 'Caption'
        : cl.contains('wn-toc-title') ? 'TOCHeading' : n.closest('blockquote, .wn-quote') ? 'Quote' : ctx.cellStyle || (this.look.bodyStyle && !n.closest('.wn-gen, .wn-cover, .wn-off-cover') && !cl.length ? this.look.bodyStyle : 'Normal');
      var p = this.para(n, st, tag === 'DD' ? { indent: 320 } : null);
      if (tag === 'DT') p.runs.forEach(function (r) { r.b = true; });
      if (p.runs.length || !ctx.skipEmpty) out.push(p);
      return;
    }
    if (tag === 'BLOCKQUOTE' || cl.contains('wn-quote')) {
      if (!hasBlockKids(n)) { out.push(this.para(n, 'Quote')); return; }
      this.blocks(n, out, Object.assign({}, ctx, { cellStyle: 'Quote' })); return;
    }
    if (tag === 'UL' || tag === 'OL') { this.list(n, out, 0, null); return; }
    if (tag === 'TABLE') { out.push(this.table(n)); return; }
    if (tag === 'HR') { out.push({ t: 'p', runs: [] }); return; }
    if (tag === 'NAV' && cl.contains('wn-toc')) { out.push(this.toc(n)); return; }
    if (cl.contains('wn-images')) { this.pictureGrid(n, out); return; }
    if (tag === 'FIGURE' || cl.contains('wn-obj')) { this.figure(n, out, ctx); return; }
    if (cl.contains('wn-eq') && cl.contains('block')) {
      var m = n.querySelector('math');
      if (m) out.push({ t: 'p', align: 'center', runs: [{ t: 'math', omml: '<m:oMathPara><m:oMath>' + O.omml(mathTree(m)) + '</m:oMath></m:oMathPara>' }] });
      return;
    }
    if (tag === 'DL') { this.blocks(n, out, ctx); return; }
    // Containers (generated section, blocks, cover, callouts, text boxes): their content, in order.
    if (hasBlockKids(n)) {
      var before = out.length;
      this.blocks(n, out, ctx);
      // A callout or highlight box shades and borders every paragraph it holds.
      var cs = this.style(n), fill = O.hex(cs.backgroundColor), bl = parseFloat(cs.borderLeftWidth) >= 2 && cs.borderLeftStyle !== 'none' ? O.hex(cs.borderLeftColor) : '';
      if ((fill && fill !== 'FFFFFF') || bl) out.slice(before).forEach(function (b) { if (b.t === 'p') { if (fill && fill !== 'FFFFFF' && !b.fill) b.fill = fill; if (bl && !b.border) b.border = bl; } });
      return;
    }
    out.push(this.para(n, ctx.cellStyle || 'Normal'));
  };

  Conv.prototype.list = function (el, out, lvl, numId) {
    var self = this, ordered = el.tagName === 'OL';
    var id = ordered ? (numId && lvl > 0 ? numId : 3 + (this.lists++)) : 2;
    Array.prototype.forEach.call(el.children, function (li) {
      if (li.tagName !== 'LI') { self.block(li, out, {}); return; }
      // The item's own text, without its nested lists (those follow one level deeper).
      var para = { el: li, expect: self.expect('ListParagraph') };
      var runs = [];
      Array.prototype.forEach.call(li.childNodes, function (c) {
        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) return;
        if (c.nodeType === 1 && c.tagName === 'P') { if (runs.length) runs.push({ t: 'br' }); runs = runs.concat(self.runs(c, para, {})); return; }
        runs = runs.concat(self.runs({ childNodes: [c] }, para, {}));
      });
      var p = { t: 'p', style: 'ListParagraph', num: { id: id, lvl: Math.min(8, lvl) }, runs: trimRuns(runs) };
      var ta = self.style(li).textAlign; if (ta === 'center' || ta === 'right') p.align = ta;
      out.push(p);
      Array.prototype.forEach.call(li.children, function (c) { if (c.tagName === 'UL' || c.tagName === 'OL') self.list(c, out, lvl + 1, c.tagName === 'OL' ? (ordered ? id : null) : null); });
    });
  };

  Conv.prototype.table = function (t) {
    var self = this, rows = [], z = Layout.zoom() || 1;
    var trs = Array.prototype.slice.call(t.rows);
    var headCount = t.tHead ? t.tHead.rows.length : 0;
    if (!headCount && trs.length > 1 && Array.prototype.every.call(trs[0].cells, function (c) { return c.tagName === 'TH'; })) headCount = 1;
    var widest = trs.reduce(function (a, r) { return r.cells.length > a.cells.length ? r : a; }, trs[0] || { cells: [] });
    var cols = Array.prototype.map.call(widest.cells || [], function (c) { return Math.max(20, c.getBoundingClientRect().width / z); });
    var colspanSum = Array.prototype.reduce.call(widest.cells || [], function (s, c) { return s + (c.colSpan || 1); }, 0);
    if (colspanSum !== cols.length) cols = [];
    var pending = {}; // column index -> remaining rowspan
    trs.forEach(function (tr, ri) {
      var cells = [], col = 0;
      var addMerged = function () { while (pending[col] > 0) { pending[col]--; cells.push({ vmerge: 'continue', blocks: [] }); col++; } };
      Array.prototype.forEach.call(tr.cells, function (td) {
        addMerged();
        var cs = self.style(td), fill = O.hex(cs.backgroundColor);
        var blocks = self.blocks(td, [], { cellStyle: 'TableText', skipEmpty: true });
        if (td.tagName === 'TH') blocks.forEach(function (b) { (b.runs || []).forEach(function (r) { if (r.t === 'text') r.b = true; }); });
        var c = { blocks: blocks, fill: fill && fill !== 'FFFFFF' ? fill : '', span: td.colSpan > 1 ? td.colSpan : 0, valign: cs.verticalAlign === 'middle' ? 'center' : '' };
        if (td.rowSpan > 1) { c.vmerge = 'restart'; for (var k = 0; k < (td.colSpan || 1); k++) pending[col + k] = td.rowSpan - 1; }
        cells.push(c); col += td.colSpan || 1;
      });
      addMerged();
      rows.push({ header: ri < headCount, cells: cells });
    });
    var cs = self.style(t.rows[0] && t.rows[0].cells[0] || t);
    var noBorders = t.classList.contains('wn-style-borderless') || cs.borderTopStyle === 'none' && cs.borderLeftStyle === 'none';
    return { t: 'table', cols: cols, rows: rows, borders: !noBorders, width: Math.min(this.look.textWidth, Math.round(t.getBoundingClientRect().width / z * TW_PER_PX)) };
  };

  Conv.prototype.toc = function (nav) {
    var src = nav.getAttribute('data-source') || 'headings', lv = +(nav.getAttribute('data-levels') || 3), label = nav.getAttribute('data-label') || '';
    var titleEl = nav.querySelector('.wn-toc-title');
    var entries = Array.prototype.map.call(nav.querySelectorAll('li:not(.empty)'), function (li) {
      var a = li.querySelector('a'), num = li.querySelector('.tnum'), pg = li.querySelector('.pg');
      var text = a ? Array.prototype.filter.call(a.childNodes, function (c) { return !(c.nodeType === 1 && c.classList.contains('tnum')); }).map(function (c) { return c.textContent; }).join('').trim() : li.textContent.trim();
      var href = a ? a.getAttribute('href') || '' : '';
      return { lvl: +(/lvl-(\d)/.exec(li.className) || [0, 1])[1], num: num ? num.textContent.trim() : '', text: text, page: pg ? pg.textContent.trim() : '', anchor: /^#[\w-]+$/.test(href) ? '_Toc' + href.slice(1) : '' };
    });
    if (src === 'figures') return { t: 'toc', figures: true, title: titleEl ? titleEl.textContent.trim() : '', instr: 'TOC \\h \\z \\c "' + (label || 'Figure') + '"', entries: entries };
    if (src === 'labels') return { t: 'toc', title: titleEl ? titleEl.textContent.trim() : 'Contents', instr: 'TOC \\h \\z \\f L', entries: entries };
    // \o "1-3": heading levels 1–3; \h: entries are links; \z: no page numbers in web view; \u: outline levels too.
    return { t: 'toc', title: titleEl ? titleEl.textContent.trim() : 'Contents', instr: 'TOC \\o "1-' + Math.max(1, Math.min(9, lv)) + '" \\h \\z \\u', entries: entries };
  };

  Conv.prototype.figure = function (f, out, ctx) {
    var self = this, cap = f.querySelector(':scope > figcaption.wn-caption');
    var align = f.classList.contains('float-right') ? 'right' : f.classList.contains('float-left') ? 'left' : 'center';
    if (cap && cap === f.firstElementChild) out.push(this.para(cap, 'Caption'));
    if (f.classList.contains('wn-chart') && f.getAttribute('data-display') === 'table') {
      var tbl = f.querySelector('.wn-chart-data table, table.wn-chart-data'); if (tbl) out.push(this.table(tbl));
    } else if (f.classList.contains('wn-textbox')) {
      var before = out.length; this.blocks(f.querySelector('.wn-textbox-inner') || f, out, ctx);
      out.slice(before).forEach(function (b) { if (b.t === 'p') { b.fill = b.fill || 'F8FAFC'; b.border = b.border || '94A3B8'; } });
    } else {
      var runs = [];
      var img = f.querySelector('img'), svg = f.querySelector('svg');
      if (img) runs.push(this.picture(img)); else if (svg) runs.push(this.svg(svg));
      var other = Array.prototype.filter.call(f.children, function (c) { return c !== cap && !c.matches('img, svg, .wn-chart-data, .wn-chart-toggle, .wn-slot') && !c.querySelector('img, svg'); });
      if (runs.length) out.push({ t: 'p', align: align, keepNext: !!(cap && cap !== f.firstElementChild), runs: runs });
      other.forEach(function (c) { self.block(c, out, ctx); });
    }
    if (cap && cap !== f.firstElementChild) out.push(this.para(cap, 'Caption'));
  };

  /** A picture grid becomes a borderless table: one picture per cell, the same columns as on the page. */
  Conv.prototype.pictureGrid = function (g, out) {
    var self = this, figs = Array.prototype.filter.call(g.children, function (c) { return c.tagName === 'FIGURE' || c.classList.contains('wn-img'); });
    var n = (this.style(g).gridTemplateColumns || '').split(' ').filter(Boolean).length || 1;
    if (g.classList.contains('wn-lay-stack')) n = 1;
    if (n === 1) { figs.forEach(function (f) { self.figure(f, out, {}); }); return; }
    var rows = [];
    for (var i = 0; i < figs.length; i += n) {
      rows.push({ cells: figs.slice(i, i + n).map(function (f) { var b = []; self.figure(f, b, {}); return { blocks: b }; }) });
    }
    out.push({ t: 'table', borders: false, rows: rows });
  };

  /* ---------- Headers, footers, page ---------- */
  function hfText(text, align, style) {
    var runs = [];
    String(text || '').split(/(\{page\}|\{pages\}|\{title\}|\{date\})/).forEach(function (part) {
      if (!part) return;
      if (part === '{page}') runs.push({ t: 'field', instr: 'PAGE', result: '1' });
      else if (part === '{pages}') runs.push({ t: 'field', instr: 'NUMPAGES', result: String(Layout.pages()) });
      else if (part === '{title}') runs.push({ t: 'text', text: Ed.doc.title || '' });
      else if (part === '{date}') runs.push({ t: 'text', text: D.formatDMY(D.localISO()) });
      else runs.push({ t: 'text', text: part });
    });
    return { t: 'p', style: style, align: align || 'center', runs: runs };
  }
  function pageNumberPara(pn, style) {
    var pages = String(Layout.pages());
    var f = pn.format, P = { t: 'field', instr: 'PAGE', result: '1' }, N = { t: 'field', instr: 'NUMPAGES', result: pages };
    var runs = f === 'X' ? [P] : f === 'X / Y' ? [P, { t: 'text', text: ' / ' }, N] : f === 'Page X' ? [{ t: 'text', text: 'Page ' }, P] : [{ t: 'text', text: 'Page ' }, P, { t: 'text', text: ' of ' }, N];
    return { t: 'p', style: style, align: pn.pos === 'margin-left' ? 'left' : pn.pos === 'margin-right' ? 'right' : pn.align || 'center', runs: runs };
  }
  function personalHF(conv) {
    var L = Ed.doc.layout, br = L.branding, head = [], foot = [];
    var ht = L.header.text || (br.on ? br.headerText : ''), ft = L.footer.text || (br.on ? br.footerText : '');
    if (br.on && S.isSafeImageSrc(br.logo)) {
      var img = new Image(); img.src = br.logo; img.alt = 'Logo';
      var run = { t: 'img', w: 120, h: 40, alt: 'Logo' };
      conv.jobs.push(imageBytes(img).then(function (b) { run.data = b.data; run.ext = b.ext; return loadImage(br.logo); }).then(function (im) { run.h = Math.round(120 * im.naturalHeight / Math.max(1, im.naturalWidth)); }, function () { run.t = 'text'; run.text = ''; }));
      head.push({ t: 'p', style: 'Header', align: br.logoPos === 'right' ? 'right' : br.logoPos === 'center' ? 'center' : 'left', runs: [run] });
    }
    if (ht) head.push(hfText(ht, L.header.align, 'Header'));
    if (ft) foot.push(hfText(ft, L.footer.align, 'Footer'));
    if (L.pageNumbers.show) (L.pageNumbers.pos === 'top' ? head : foot).push(pageNumberPara(L.pageNumbers, L.pageNumbers.pos === 'top' ? 'Header' : 'Footer'));
    return { header: head.length ? { default: head } : null, footer: foot.length ? { default: foot } : null };
  }

  /* ---------- Imported template ---------- */
  var TPL_KEY = 'wordTemplate';
  function storedTemplate() { return Store.kvGet(TPL_KEY).then(function (t) { return t && t.parts ? t : null; }); }
  function fromImported(tpl, model) {
    var P = tpl.parts, txt = function (n) { return P[n] || ''; };
    var styles = OT.completeStyles(txt('word/styles.xml'), model.look);
    model.styleMap = styles.map;
    var au = OT.audit(P), fonts = au.fonts.concat([model.look.bodyFont]);
    // A template whose headings are not numbered: the contents entries must not show the app's numbers either.
    if (!au.headingsNumbered) model.blocks.forEach(function (b) { if (b.t === 'toc') b.entries.forEach(function (e) { e.num = ''; }); });
    model.parts = { styles: styles.xml, numbering: txt('word/numbering.xml') || null, theme: txt('word/theme/theme1.xml') || null, fontTable: txt('word/fontTable.xml') ? OT.completeFonts(txt('word/fontTable.xml'), fonts).xml : null };
    model.numBase = O.maxNumId(txt('word/numbering.xml')) + 10;
    var pg = OT.pageOf(txt('word/document.xml'));
    model.page = Object.assign(model.page, { w: pg.w, h: pg.h, top: pg.top, right: pg.right, bottom: pg.bottom, left: pg.left, header: pg.header, footer: pg.footer, landscape: pg.landscape, textWidth: pg.w - pg.left - pg.right });
    model.look.textWidth = model.page.textWidth;
    model.titlePg = pg.titlePg;
    // Headers and footers come from the template as they are (already cleaned when it was imported).
    var rels = txt('word/_rels/document.xml.rels'), docXml = txt('word/document.xml');
    var sect = (docXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g) || []).pop() || '';
    model.rawHF = [];
    sect.replace(/<w:(header|footer)Reference w:type="(\w+)" r:id="([^"]+)"\/>/g, function (all, kind, type, rid) {
      if (type === 'even') return all;
      var m = new RegExp('<Relationship [^>]*Id="' + rid + '"[^>]*Target="([^"]+)"').exec(rels) || new RegExp('<Relationship [^>]*Target="([^"]+)"[^>]*Id="' + rid + '"').exec(rels);
      if (!m) return all;
      var part = 'word/' + m[1].replace(/^\/?word\//, ''), xml = txt(part);
      if (!xml) return all;
      var hrels = txt(part.replace(/word\/(.*)$/, 'word/_rels/$1.rels'));
      var list = []; hrels.replace(/<Relationship\b[^>]*\/>/g, function (r) {
        var id = /Id="([^"]+)"/.exec(r)[1], ty = /Type="([^"]+)"/.exec(r)[1], tg = /Target="([^"]+)"/.exec(r)[1];
        list.push({ id: id, type: ty, target: tg, external: /TargetMode="External"/.test(r) }); return r;
      });
      model.rawHF.push({ kind: kind, type: type, xml: xml, rels: list });
      return all;
    });
    model.header = null; model.footer = null;
    return model;
  }

  /* ---------- Build ---------- */
  function build() {
    var d = Ed.doc, office = d.template === 'office', L = d.layout, g = Layout.geo();
    var look = office ? OT.look() : O.personalLook(getComputedStyle(Ed.el()).fontFamily);
    var tw = function (mm) { return Math.round(mm * O.TW_PER_MM); };
    var page = office && L.margins === 'custom' && L.custom.t === OT.PAGE_MM.t ? Object.assign({}, OT.PAGE) :
      { w: tw(g.wmm), h: tw(g.hmm), top: tw(g.mm[0]), right: tw(g.mm[1]), bottom: tw(g.mm[2]), left: tw(g.mm[3]), header: 709, footer: 709 };
    page.landscape = L.orientation === 'landscape';
    page.textWidth = page.w - page.left - page.right; look.textWidth = page.textWidth;
    page.color = L.pageColor && L.pageColor.toLowerCase() !== '#ffffff' ? L.pageColor : '';
    if (L.border && L.border.style !== 'none') page.border = L.border;
    var conv = new Conv(look, {});
    (d.comments || []).forEach(function (c, i) { conv.comments.set(c.id, i); });
    var tw0 = performance.now();
    var blocks = conv.blocks(Ed.el(), [], {});
    timings.docxWalkMs = Math.round(performance.now() - tw0);
    var model = { look: look, page: page, blocks: blocks, lists: conv.lists, trackRevisions: Review.tracking(), updateFields: !!Ed.el().querySelector('nav.wn-toc, .wn-caption'),
      watermark: L.watermark && L.watermark.type === 'text' && L.watermark.text ? L.watermark : null,
      comments: (d.comments || []).filter(function (c) { return Ed.el().querySelector('[data-cid="' + c.id + '"]'); }).map(function (c) {
        var text = c.text + (c.replies || []).map(function (r) { return '\n' + (r.author || '') + ': ' + r.text; }).join('');
        return { id: conv.comments.get(c.id), author: c.author, date: isoOf(c.t), text: text };
      }),
      props: office ? OT.props(d.title, new Date().toISOString()) : { title: d.title || '', subject: '', creator: settings.get('author', ''), keywords: '', description: '', lastModifiedBy: '', category: d.category || '',
        created: new Date(d.created || Date.now()).toISOString(), modified: new Date(d.u || Date.now()).toISOString() } };
    model.props.created = String(model.props.created).replace(/\.\d+Z$/, 'Z'); model.props.modified = String(model.props.modified).replace(/\.\d+Z$/, 'Z');
    if (office) {
      var hf = OT.headerFooter(Object.assign({}, d.office || {}, { docTitle: (d.office && d.office.docTitle && d.office.docTitle !== '[DOCUMENT TITLE]') ? d.office.docTitle : (d.title || '[DOCUMENT TITLE]') }));
      model.titlePg = true; model.header = hf.header; model.footer = hf.footer;
    } else {
      var p = personalHF(conv); model.header = p.header; model.footer = p.footer;
    }
    var useImported = office && settings.get('useImportedTemplate', false);
    return (useImported ? storedTemplate() : Promise.resolve(null)).then(function (tpl) {
      if (tpl) fromImported(tpl, model);
      return Promise.all(conv.jobs);
    }).then(function () { return model; });
  }

  function exportDocx(name) {
    var t0 = performance.now();
    var t1, t2;
    return build().then(function (model) {
      t1 = performance.now();
      var parts = O.buildDocx(model);
      t2 = performance.now();
      return Z.zip(parts, deflateRaw);
    }).then(function (bytes) {
      // Where the time goes: reading the page and pictures, writing XML, compressing.
      timings.docxReadMs = Math.round(t1 - t0); timings.docxXmlMs = Math.round(t2 - t1); timings.docxZipMs = Math.round(performance.now() - t2);
      timings.docxMs = Math.round(performance.now() - t0);
      download(name + '.docx', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      return bytes;
    });
  }

  /* ---------- Import a Word template (Settings) ---------- */
  function importTemplate(file) {
    if (!file) return Promise.reject(new Error('Choose a .docx or .dotx file.'));
    if (!/\.(docx|dotx)$/i.test(file.name)) return Promise.reject(new Error('Choose a Word file that ends in .docx or .dotx.'));
    if (file.size > 30 * 1024 * 1024) return Promise.reject(new Error('The file is over 30 MB. Use the template file itself, not a long document.'));
    return file.arrayBuffer().then(function (buf) { return Z.unzip(new Uint8Array(buf), inflateRaw); }).then(function (raw) {
      if (!raw['word/document.xml'] || !raw['word/styles.xml']) throw new Error('This file has no Word document or styles inside. Is it a Word file?');
      var parts = {};
      Object.keys(raw).forEach(function (n) { if (/\.(xml|rels)$/i.test(n)) parts[n] = Z.fromUtf8(raw[n]); else parts[n] = raw[n]; });
      var before = OT.audit(parts);
      var clean = OT.sanitize(parts, new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
      var kept = {}; Object.keys(clean.parts).forEach(function (n) { if (typeof clean.parts[n] === 'string') kept[n] = clean.parts[n]; });
      var after = OT.audit(kept);
      var completed = OT.completeStyles(kept['word/styles.xml'], OT.look());
      var rec = { name: file.name.slice(0, 120), at: Date.now(), parts: kept, audit: { before: before, after: after, removed: clean.removed, addedStyles: completed.added } };
      return Store.kvSet(TPL_KEY, rec).then(function () { return rec; });
    });
  }
  function removeTemplate() { return Store.kvSet(TPL_KEY, null); }

  return { exportDocx: exportDocx, build: build, importTemplate: importTemplate, removeTemplate: removeTemplate, storedTemplate: storedTemplate, inflateRaw: inflateRaw, deflateRaw: deflateRaw };
})();
WN.Docx = Docx;

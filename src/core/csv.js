/* WrapNote core: CSV export (UTF-8 BOM, quoted when needed) and import (header after preamble, aliases). */
(function (g) {
  'use strict';

  var BOM = '﻿';

  // Spreadsheet apps run cells that start with = + @ as formulas (CSV injection).
  // A leading apostrophe makes them text; import strips it again so the round trip is exact.
  function guardFormula(s) {
    if (/^[=+@\t\r]/.test(s) || /^-[^0-9.]/.test(s)) return "'" + s;
    return s;
  }
  function unguardFormula(s) {
    return /^'[=+@\-\t\r]/.test(s) ? s.slice(1) : s;
  }

  function quoteField(v) {
    var s = v === null || v === undefined ? '' : String(v);
    s = guardFormula(s);
    if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /** rows: array of arrays. Returns text with BOM and CRLF line ends (what Excel expects). */
  function toCSV(header, rows) {
    var lines = [header.map(quoteField).join(',')];
    for (var i = 0; i < rows.length; i++) lines.push(rows[i].map(quoteField).join(','));
    return BOM + lines.join('\r\n') + '\r\n';
  }

  function detectDelimiter(text) {
    var sample = text.split(/\r?\n/).slice(0, 10).join('\n');
    var best = ',', bestCount = -1;
    [',', ';', '\t'].forEach(function (d) {
      var c = sample.split(d).length;
      if (c > bestCount) { best = d; bestCount = c; }
    });
    return best;
  }

  /** RFC 4180 parser. O(n) over characters. Handles quotes, doubled quotes and newlines in fields. */
  function parseCSV(text, delimiter) {
    var s = String(text || '');
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    var d = delimiter || detectDelimiter(s);
    var rows = [], row = [], field = '', i = 0, inQ = false, n = s.length;
    while (i < n) {
      var c = s[i];
      if (inQ) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { inQ = true; i++; continue; }
      if (c === d) { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.map(function (r) { return r.map(unguardFormula); });
  }

  function norm(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9₹]+/g, ' ').trim(); }

  /**
   * Find the header row after any preamble lines.
   * aliases: { field: ['alias', ...] }. required: fields that must be present.
   * Lookup is a hash map from normalised alias to field, so matching is O(rows x cols).
   */
  function findHeader(rows, aliases, required) {
    var lookup = new Map();
    Object.keys(aliases).forEach(function (f) {
      lookup.set(norm(f), f);
      aliases[f].forEach(function (a) { lookup.set(norm(a), f); });
    });
    var limit = Math.min(rows.length, 30);
    for (var r = 0; r < limit; r++) {
      var map = {}, hits = 0;
      for (var c = 0; c < rows[r].length; c++) {
        var f = lookup.get(norm(rows[r][c]));
        if (f && map[f] === undefined) { map[f] = c; hits++; }
      }
      var ok = required.every(function (f) { return map[f] !== undefined; });
      if (ok && hits >= Math.min(2, required.length || 2)) return { index: r, map: map };
    }
    return null;
  }

  var api = { BOM: BOM, toCSV: toCSV, parseCSV: parseCSV, findHeader: findHeader, quoteField: quoteField, detectDelimiter: detectDelimiter };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).csv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

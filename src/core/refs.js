/* WrapNote core: source references ("Context Reference & Citation", 1.3.0).
 * A note (a block on the page) can say where its content came from: document name, heading, sub-heading,
 * article or section, and page or page range. This module holds every rule about that data, with no
 * browser or storage code, so the rules can be tested alone in Node.
 *
 * Stored shape, inside the existing document record (older records simply have no "refs" and keep working):
 *   doc.refs = { "<block id>": { v: 1, source, heading, sub, section, pages: { from, to } | null, t } }
 * Keying by block id keeps a reference with its note when the note is moved, and needs no change to the
 * document body format. The page shows each reference as a citation tag drawn from this map.
 */
(function (g) {
  'use strict';

  var LIMITS = { source: 200, heading: 200, sub: 200, section: 40 };
  var MAX_PAGE = 99999;
  var BLOCK_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

  function squash(s) { return String(s == null ? '' : s).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim(); }

  /** Comparison key: case, accents and spacing do not make a different document ("IEC  61400" = "iec 61400"). */
  function key(s) {
    var t = squash(s).toLowerCase();
    if (t.normalize) t = t.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return t;
  }

  /**
   * Page or page range as typed: "42", "42-45", "42–45", "42 to 45", "p. 42", "pp. 42-45".
   * Returns { ok, value: { from, to } | null } or { ok: false, error }. Blank means "no page".
   */
  function parsePages(raw) {
    var s = squash(raw).toLowerCase();
    if (!s) return { ok: true, value: null };
    s = s.replace(/^(pages?|pp?)\.?\s*/, '');
    var m = /^(\d+)(?:\s*(?:-|–|—|to)\s*(\d+))?$/.exec(s);
    if (!m) return { ok: false, error: 'Page: use a number like 42 or a range like 42-45.' };
    var from = parseInt(m[1], 10), to = m[2] === undefined ? from : parseInt(m[2], 10);
    if (from < 1 || to < 1) return { ok: false, error: 'Page: page numbers start at 1.' };
    if (from > MAX_PAGE || to > MAX_PAGE) return { ok: false, error: 'Page: use a number up to ' + MAX_PAGE + '.' };
    if (to < from) return { ok: false, error: 'Page: the range ends before it starts (' + from + '-' + to + '). Write the smaller page first.' };
    return { ok: true, value: { from: from, to: to } };
  }

  /**
   * Check a reference typed in the form or read from a file.
   * Returns { ok: true, value } (value null when every field is blank, which means "no reference")
   * or { ok: false, errors: [...] } with one plain message per problem.
   */
  function validate(raw) {
    raw = raw || {};
    var errors = [], v = { v: 1 };
    [['source', 'Document name'], ['heading', 'Heading'], ['sub', 'Sub-heading'], ['section', 'Article / section']].forEach(function (f) {
      var t = squash(raw[f[0]]);
      if (t.length > LIMITS[f[0]]) errors.push(f[1] + ' is longer than ' + LIMITS[f[0]] + ' characters. Shorten it.');
      v[f[0]] = t.slice(0, LIMITS[f[0]]);
    });
    var pages = raw.pages && typeof raw.pages === 'object' ? pagesFromObject(raw.pages) : parsePages(raw.pages);
    if (!pages.ok) errors.push(pages.error); else v.pages = pages.value;
    var any = v.source || v.heading || v.sub || v.section || v.pages;
    if (!any && !errors.length) return { ok: true, value: null };
    // A heading or page without the document it belongs to cannot be found again later.
    if (!v.source) errors.push('Document name is needed when any other reference field is filled in.');
    if (errors.length) return { ok: false, errors: errors };
    v.t = Number.isFinite(raw.t) ? raw.t : 0;
    return { ok: true, value: v };
  }
  function pagesFromObject(p) {
    if (p === null) return { ok: true, value: null };
    if (!Number.isInteger(p.from) || !Number.isInteger(p.to)) return { ok: false, error: 'Page: the stored range is not two whole numbers.' };
    return parsePages(p.from === p.to ? String(p.from) : p.from + '-' + p.to);
  }

  /** "p. 12" or "pp. 42–45" (en dash, as in printed citations). */
  function formatPages(p) { return !p ? '' : p.from === p.to ? 'p. ' + p.from : 'pp. ' + p.from + '–' + p.to; }
  /** A bare number is shown as an article ("4" → "Art. 4"); anything typed with words ("Clause 5.3", "§ 2") stays as typed. */
  function formatSection(s) { s = squash(s); return !s ? '' : /^\d/.test(s) ? 'Art. ' + s : s; }
  /** Pages typed back into the form: "42" or "42-45". */
  function pagesInput(p) { return !p ? '' : p.from === p.to ? String(p.from) : p.from + '-' + p.to; }

  /** The citation parts in order, skipping blanks: Doc › Heading › Sub-heading › Art. 4 › p. 12. */
  function citationParts(r) {
    if (!r) return [];
    return [r.source, r.heading, r.sub, formatSection(r.section), formatPages(r.pages)].filter(function (x) { return x; });
  }
  function citation(r) { return citationParts(r).join(' › '); }

  /** Clean a whole refs map from storage or a file. Bad entries are skipped and reported, never kept silently. */
  function cleanMap(map) {
    var out = {}, skipped = [];
    if (map == null) return { refs: out, skipped: skipped };
    if (typeof map !== 'object' || Array.isArray(map)) return { refs: out, skipped: ['Source references are not in the expected form and were left out.'] };
    Object.keys(map).forEach(function (id) {
      if (!BLOCK_ID_RE.test(id)) { skipped.push('A source reference has an invalid note id and was left out.'); return; }
      var r = validate(map[id]);
      if (!r.ok) { skipped.push('Source reference for note ' + id + ' was left out: ' + r.errors.join(' ')); return; }
      if (r.value) out[id] = r.value;
    });
    return { refs: out, skipped: skipped };
  }

  /** Bring a stored document up to date. Documents saved before 1.3.0 have no refs; they get an empty map. */
  function upgrade(doc) {
    var c = cleanMap(doc.refs);
    doc.refs = c.refs;
    return c.skipped;
  }

  /**
   * The summary kept with each document's list entry, so the Sources page can search every document
   * without opening any of them. previews: { blockId: plain text of that note }. Notes no longer on the
   * page (deleted blocks) are left out, but their reference stays in doc.refs so Undo can bring it back.
   */
  function index(refs, previews) {
    return Object.keys(refs || {}).filter(function (b) { return previews && Object.prototype.hasOwnProperty.call(previews, b); }).map(function (b) {
      var r = refs[b];
      return { b: b, source: r.source, heading: r.heading, sub: r.sub, section: r.section, pages: r.pages, t: r.t || 0, preview: String(previews[b] || '').slice(0, 200) };
    });
  }

  /** Flatten document summaries into one list of referenced notes. metas: [{ id, title, u, refs }]. */
  function notes(metas) {
    var out = [];
    (metas || []).forEach(function (m) {
      (m.refs || []).forEach(function (r) { out.push({ docId: m.id, docTitle: m.title, u: m.u || 0, b: r.b, ref: r, preview: r.preview || '' }); });
    });
    return out;
  }

  /**
   * Every document name used so far, with how often and how recently, and the headings used under it.
   * Spelling shown is the most recently used one, so a corrected spelling wins over an old typo.
   */
  function sources(list) {
    var map = new Map();
    list.forEach(function (n) {
      var r = n.ref, k = key(r.source); if (!k) return;
      var e = map.get(k);
      var t = Math.max(r.t || 0, 0) || n.u || 0;
      if (!e) { e = { key: k, name: r.source, count: 0, last: -1, headings: new Map() }; map.set(k, e); }
      e.count++;
      if (t >= e.last) { e.last = t; e.name = r.source; }
      [r.heading, r.sub].forEach(function (hd) {
        var hk = key(hd); if (!hk) return;
        var he = e.headings.get(hk) || { key: hk, name: hd, count: 0, last: -1 };
        he.count++; if (t >= he.last) { he.last = t; he.name = hd; }
        e.headings.set(hk, he);
      });
    });
    return Array.from(map.values()).map(function (e) {
      return { key: e.key, name: e.name, count: e.count, last: e.last, headings: Array.from(e.headings.values()).sort(byUse) };
    }).sort(byUse);
  }
  function byUse(a, b) { return (b.count - a.count) || (b.last - a.last) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }

  /**
   * Autocomplete: names that match what is typed, best first.
   * Rank: whole name starts with the text, then a word in it starts with the text, then the text appears anywhere;
   * within a rank, more-used names first, then more recent, then alphabetical. Blank text lists the most used.
   */
  function suggest(typed, entries, limit) {
    limit = limit || 8;
    var q = key(typed);
    var scored = [];
    (entries || []).forEach(function (e) {
      var k = e.key || key(e.name), rank;
      if (!q) rank = 3;
      else if (k === q) return; // already typed in full: nothing to suggest
      else if (k.indexOf(q) === 0) rank = 0;
      else if ((' ' + k).indexOf(' ' + q) >= 0 || new RegExp('[^a-z0-9]' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(k)) rank = 1;
      else if (k.indexOf(q) > 0) rank = 2;
      else return;
      scored.push({ e: e, rank: rank });
    });
    scored.sort(function (a, b) { return (a.rank - b.rank) || byUse(a.e, b.e); });
    return scored.slice(0, limit).map(function (s) { return s.e.name; });
  }

  /** The existing spelling of a document name typed in another case or spacing, or null. */
  function existingName(typed, entries) {
    var k = key(typed); if (!k) return null;
    var hit = (entries || []).filter(function (e) { return (e.key || key(e.name)) === k; })[0];
    return hit && hit.name !== squash(typed) ? hit.name : null;
  }

  /**
   * Check a filter taken from the Sources page or its address. Returns { ok, value } or { ok: false, errors }.
   * page accepts the same forms as the reference form; a range finds notes whose pages overlap it.
   */
  function validateFilter(raw) {
    raw = raw || {};
    var errors = [];
    var source = squash(raw.source).slice(0, LIMITS.source), heading = squash(raw.heading).slice(0, LIMITS.heading), q = squash(raw.q).slice(0, 200);
    var p = parsePages(raw.page);
    if (!p.ok) errors.push(p.error);
    if (errors.length) return { ok: false, errors: errors };
    return { ok: true, value: { source: source, heading: heading, page: p.value, q: q } };
  }

  /**
   * Notes matching a checked filter. source and heading match whole names (any case); heading also matches
   * a sub-heading; page matches overlapping ranges; q searches the citation and the note text.
   * Result order: document name, then first page (notes without pages last), then heading, then newest.
   */
  // Comparison keys are worked out once per stored reference and reused while it is unchanged (summaries are
  // replaced, not edited, when a document is saved). Before this, sorting 2,000 notes normalised text about
  // 40,000 times per keystroke; measured figures are in docs/QUALITY.md, 1.3.0.
  var keyCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function keysOf(n) {
    var r = n.ref, k = keyCache && keyCache.get(r);
    if (!k || k.title !== n.docTitle || k.preview !== n.preview) {
      k = { title: n.docTitle, preview: n.preview, source: key(r.source), heading: key(r.heading), sub: key(r.sub),
        hay: key(citation(r) + ' ' + n.preview + ' ' + n.docTitle) };
      if (keyCache) keyCache.set(r, k);
    }
    return k;
  }
  function filter(list, f) {
    var sk = key(f.source), hk = key(f.heading), qk = key(f.q), p = f.page;
    var words = qk ? qk.split(' ') : [];
    return list.map(function (n) { return { n: n, k: keysOf(n) }; }).filter(function (x) {
      var r = x.n.ref, k = x.k;
      if (sk && k.source !== sk) return false;
      if (hk && k.heading !== hk && k.sub !== hk) return false;
      if (p && (!r.pages || r.pages.to < p.from || r.pages.from > p.to)) return false;
      for (var i = 0; i < words.length; i++) if (k.hay.indexOf(words[i]) < 0) return false;
      return true;
    }).sort(function (x, y) {
      var a = x.n, b = y.n, ra = a.ref, rb = b.ref;
      return compare(x.k.source, y.k.source) ||
        ((ra.pages ? ra.pages.from : Infinity) - (rb.pages ? rb.pages.from : Infinity) || 0) ||
        compare(x.k.heading, y.k.heading) || (b.u - a.u) || compare(a.b, b.b);
    }).map(function (x) { return x.n; });
  }
  function compare(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  /** Rows for a CSV of referenced notes. Pages are written "p. 12" / "pp. 3–4": a bare "3-4" is turned into a
   * date (03-Apr) by spreadsheet programs, and the page numbers cannot be recovered from it. */
  function csvRows(list) {
    return [['Document name', 'Heading', 'Sub-heading', 'Article / section', 'Pages', 'Citation', 'Note', 'In WrapNote document']].concat(list.map(function (n) {
      var r = n.ref;
      return [r.source, r.heading, r.sub, r.section, formatPages(r.pages), citation(r), n.preview, n.docTitle];
    }));
  }

  var api = {
    LIMITS: LIMITS, key: key, parsePages: parsePages, validate: validate, formatPages: formatPages, formatSection: formatSection, pagesInput: pagesInput,
    citationParts: citationParts, citation: citation, cleanMap: cleanMap, upgrade: upgrade, index: index, notes: notes, sources: sources,
    suggest: suggest, existingName: existingName, validateFilter: validateFilter, filter: filter, csvRows: csvRows, BLOCK_ID_RE: BLOCK_ID_RE
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).refs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

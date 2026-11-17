/* WrapNote core: picture grids and OCR text clean-up. Pure functions, no browser APIs.
 * Grid rules decide how many empty slots a block shows and whether a new picture joins it,
 * so a screenshot taken later can fill slot 2 of an existing 2 x 2 grid.
 */
(function (g) {
  'use strict';

  // per = pictures per "page" of the layout. A 2 x 2 grid holds 4, a 3-column grid fills rows of 3,
  // side-by-side holds 2. Stacked has no slots: it simply grows.
  var LAYOUTS = { grid2: { cols: 2, per: 4 }, grid3: { cols: 3, per: 3 }, side: { cols: 2, per: 2 }, stack: { cols: 1, per: 0 } };

  function isLayout(l) { return Object.prototype.hasOwnProperty.call(LAYOUTS, l); }

  /** Empty slots to show after `count` pictures. 2 x 2 with 1 picture -> 3; with 4 -> 0; with 5 -> 3. */
  function freeSlots(layout, count) {
    var L = LAYOUTS[layout];
    if (!L || !L.per) return 0;
    var n = Math.max(0, Math.floor(count) || 0);
    if (layout === 'side') return n < L.per ? L.per - n : 0;
    if (n === 0) return L.per;
    return (L.per - (n % L.per)) % L.per;
  }

  /**
   * How many of `n` new pictures go into an existing block. target = { layout, count } or null.
   * Returns { join, rest }. Only grid layouts with room accept pictures; a stacked block never does,
   * so the earlier behaviour (one picture -> its own block) is kept unless the user chose a grid.
   */
  function placement(target, n) {
    var k = Math.max(0, Math.floor(n) || 0);
    if (!target || !isLayout(target.layout)) return { join: 0, rest: k };
    var room = freeSlots(target.layout, target.count);
    var join = Math.min(room, k);
    return { join: join, rest: k - join };
  }

  /**
   * Cell shape (width / height) for a block, from its pictures' shapes. The median resists one odd picture.
   * Clamped to 9:16 .. 16:9 so a long receipt or a panorama cannot make a cell absurdly tall or flat.
   * The result is rounded to 3 decimals so it is stable across reloads.
   */
  function cellRatio(ratios) {
    var r = (ratios || []).filter(function (x) { return isFinite(x) && x > 0; }).sort(function (a, b) { return a - b; });
    if (!r.length) return 1;
    var mid = Math.floor(r.length / 2);
    var med = r.length % 2 ? r[mid] : (r[mid - 1] + r[mid]) / 2;
    var clamped = Math.min(16 / 9, Math.max(9 / 16, med));
    return Math.round(clamped * 1000) / 1000;
  }

  /**
   * Clean OCR lines: drop low-confidence noise, collapse spaces, keep reading order.
   * lines: [{ text, confidence }] with confidence 0..100. A line is kept when the engine is reasonably sure
   * (>= minConf) or when it still contains a real word (3+ letters or digits), so short headings survive.
   */
  function cleanOcr(lines, minConf) {
    var min = minConf === undefined ? 45 : minConf, kept = [], dropped = 0;
    (lines || []).forEach(function (l) {
      var t = String(l && l.text || '').replace(/[\s ]+/g, ' ').trim();
      if (!t) return;
      var conf = +l.confidence;
      var wordy = /[\p{L}\p{N}]{3,}/u.test(t);
      if ((isFinite(conf) && conf >= min) || wordy && (!isFinite(conf) || conf >= min / 2)) kept.push(t); else dropped++;
    });
    return { text: kept.join('\n'), kept: kept.length, dropped: dropped };
  }

  var api = { LAYOUTS: LAYOUTS, isLayout: isLayout, freeSlots: freeSlots, placement: placement, cellRatio: cellRatio, cleanOcr: cleanOcr };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).pictures = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

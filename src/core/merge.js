/* WrapNote core: per-record merge used by sync.
 * Rule: newer update time u wins. On an exact tie the larger canonical JSON text wins,
 * so every device settles on the same record without talking to the others.
 * A deletion is a tombstone {id, d:1, u} so it travels like any other record.
 * The rule is a total order on records, which makes merge commutative, associative and idempotent.
 */
(function (g) {
  'use strict';

  /** JSON with object keys sorted at every level. Raw JSON differs when key order differs. O(n log n) in keys. */
  function canonical(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    var keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
  }

  function winner(a, b) {
    if (!a) return b;
    if (!b) return a;
    var ua = +a.u || 0, ub = +b.u || 0;
    if (ua !== ub) return ua > ub ? a : b;
    var ca = canonical(a), cb = canonical(b);
    return ca >= cb ? a : b;
  }

  /** Merge two id->record maps (plain objects). O(n + m) with hash lookups. Inputs are not mutated. */
  function mergeMaps(a, b) {
    var out = {};
    var k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = winner(out[k], b[k]);
    return out;
  }

  function tombstone(id, u) { return { id: id, d: 1, u: u }; }

  function toMap(list) {
    var m = {};
    for (var i = 0; i < list.length; i++) m[list[i].id] = winner(m[list[i].id], list[i]);
    return m;
  }

  var api = { canonical: canonical, winner: winner, mergeMaps: mergeMaps, tombstone: tombstone, toMap: toMap };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).merge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

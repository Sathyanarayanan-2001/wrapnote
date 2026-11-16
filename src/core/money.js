/* WrapNote core: money held as whole paise (integers).
 * Why integers: 0.1 + 0.2 !== 0.3 in floating point, so rupee totals drift.
 * Unit conversion used everywhere: 1 rupee = 100 paise (multiply by 100; divide by 100 only for display).
 */
(function (g) {
  'use strict';

  // Thirteen rupee digits keeps paise below Number.MAX_SAFE_INTEGER (9,007,199,254,740,991).
  var MAX_RUPEE_DIGITS = 13;

  /** Parse "₹1,23,456.78", "123456.7" or "-50" into integer paise. O(n) in string length. */
  function parseRupees(input) {
    if (input === null || input === undefined) return { ok: false, error: 'Enter an amount.' };
    var s = String(input).trim();
    if (s === '') return { ok: true, paise: 0, empty: true };
    s = s.replace(/^₹/, '').replace(/^Rs\.?/i, '').replace(/[\s,]/g, '');
    var neg = false;
    if (s.charAt(0) === '-') { neg = true; s = s.slice(1); }
    if (!/^\d+(\.\d{1,2})?$/.test(s)) {
      return { ok: false, error: 'Use digits with up to 2 decimals, for example 1,23,456.78.' };
    }
    var parts = s.split('.');
    var rupees = parts[0].replace(/^0+(?=\d)/, '');
    if (rupees.length > MAX_RUPEE_DIGITS) return { ok: false, error: 'Amount is too large.' };
    var p = ((parts[1] || '') + '00').slice(0, 2);
    // String digits -> integers; never multiply a float.
    var paise = Number(rupees) * 100 + Number(p);
    if (!Number.isSafeInteger(paise)) return { ok: false, error: 'Amount is too large.' };
    return { ok: true, paise: neg && paise !== 0 ? -paise : paise };
  }

  /** Insert Indian (lakh) grouping into a digit string: 12345678 -> 1,23,45,678. */
  function groupLakh(digits) {
    var s = String(digits);
    if (s.length <= 3) return s;
    var last3 = s.slice(-3);
    var rest = s.slice(0, -3);
    return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }

  /** Format integer paise as ₹1,23,456.78. Throws on non-integers so float bugs surface early. */
  function formatPaise(paise, opts) {
    if (!Number.isSafeInteger(paise)) throw new TypeError('formatPaise expects integer paise');
    var symbol = !opts || opts.symbol !== false;
    var neg = paise < 0;
    var abs = Math.abs(paise);
    var rupees = Math.floor(abs / 100);
    var ps = abs % 100;
    var out = groupLakh(String(rupees)) + '.' + (ps < 10 ? '0' : '') + ps;
    return (neg ? '-' : '') + (symbol ? '₹' : '') + out;
  }

  /** Exact sum of integer paise values. O(n). */
  function sumPaise(values) {
    var total = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i] || 0;
      if (!Number.isSafeInteger(v)) throw new TypeError('sumPaise expects integers');
      total += v;
      if (!Number.isSafeInteger(total)) throw new RangeError('Total exceeds safe range');
    }
    return total;
  }

  /** en-IN integer grouping for counts, e.g. 123456 -> 1,23,456. */
  function formatCount(n) {
    if (!Number.isFinite(n)) return '0';
    var neg = n < 0;
    return (neg ? '-' : '') + groupLakh(String(Math.round(Math.abs(n))));
  }

  var api = { parseRupees: parseRupees, formatPaise: formatPaise, sumPaise: sumPaise, groupLakh: groupLakh, formatCount: formatCount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).money = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

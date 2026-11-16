/* WrapNote core: dates. Day-first typing (28/10), 24-hour times, ISO weeks (CW47), FY 2026-27.
 * Month, week and financial year are always derived from the date, never typed.
 * Calendar maths runs in UTC so daylight-saving or zone offsets cannot shift a day.
 */
(function (g) {
  'use strict';

  var MS_PER_DAY = 86400000; // 24 h x 60 min x 60 s x 1,000 ms
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
  function daysInMonth(y, m) { return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]; }

  function toISO(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

  function splitISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
    return { y: y, m: mo, d: d };
  }

  function isValidISO(iso) { return splitISO(iso) !== null; }

  /** Parse a day-first date: 28/10/2026, 28-10-26, 28.10 (year defaults to refYear). */
  function parseDMY(str, refYear) {
    var s = String(str || '').trim();
    if (!s) return { ok: false, error: 'Enter a date as day/month/year, for example 28/10/2026.' };
    var m = /^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/.exec(s);
    if (!m) return { ok: false, error: 'Use day/month/year, for example 28/10/2026.' };
    var d = +m[1], mo = +m[2];
    var y = m[3] ? +m[3] : (refYear || new Date().getFullYear());
    if (m[3] && m[3].length === 2) y = 2000 + y;
    if (mo < 1 || mo > 12) return { ok: false, error: 'Month must be 1 to 12.' };
    var dim = daysInMonth(y, mo);
    if (d < 1 || d > dim) {
      return { ok: false, error: MONTHS[mo - 1] + ' ' + y + ' has ' + dim + ' days. Check the day.' };
    }
    return { ok: true, iso: toISO(y, mo, d) };
  }

  function formatDMY(iso) {
    var p = splitISO(iso);
    return p ? pad2(p.d) + '/' + pad2(p.m) + '/' + p.y : '';
  }

  function utc(iso) { var p = splitISO(iso); return p ? Date.UTC(p.y, p.m - 1, p.d) : NaN; }

  function addDays(iso, n) {
    var t = utc(iso) + n * MS_PER_DAY;
    var dt = new Date(t);
    return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  function daysBetween(a, b) { return Math.round((utc(b) - utc(a)) / MS_PER_DAY); }

  /** ISO 8601 week: weeks start Monday; week 1 holds the year's first Thursday. */
  function isoWeek(iso) {
    var t = utc(iso);
    if (isNaN(t)) return null;
    var dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
    var thursday = t + (3 - dow) * MS_PER_DAY;
    var year = new Date(thursday).getUTCFullYear();
    var week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * MS_PER_DAY));
    return { year: year, week: week, label: 'CW' + pad2(week), key: year + '-CW' + pad2(week) };
  }

  /** Monday of the ISO week containing iso. */
  function weekStart(iso) {
    var dow = (new Date(utc(iso)).getUTCDay() + 6) % 7;
    return addDays(iso, -dow);
  }

  /** Indian financial year: 1 April to 31 March. */
  function financialYear(iso) {
    var p = splitISO(iso);
    if (!p) return null;
    var start = p.m >= 4 ? p.y : p.y - 1;
    var end2 = String((start + 1) % 100);
    return { start: start, label: 'FY ' + start + '-' + (end2.length < 2 ? '0' : '') + end2 };
  }

  function monthLabel(iso) {
    var p = splitISO(iso);
    return p ? MONTHS[p.m - 1] + ' ' + p.y : '';
  }

  /** "23:30" -> 1410 minutes since midnight. Rejects 24:00 and 12-hour forms. */
  function parseTime(str) {
    var m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(str || '').trim());
    if (!m) return { ok: false, error: 'Use 24-hour time, for example 09:30 or 17:45.' };
    return { ok: true, minutes: +m[1] * 60 + +m[2], text: pad2(+m[1]) + ':' + m[2] };
  }

  /** Meeting length; a meeting that ends earlier than it starts crossed midnight. */
  function durationMinutes(from, to) {
    var a = parseTime(from), b = parseTime(to);
    if (!a.ok || !b.ok) return null;
    var diff = b.minutes - a.minutes;
    return diff >= 0 ? diff : diff + 1440; // 1440 = 24 h x 60 min
  }

  function formatDuration(mins) {
    if (mins === null || mins === undefined) return '';
    var h = Math.floor(mins / 60), m = mins % 60;
    if (!h) return m + ' min';
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  function localISO(date) {
    var d = date || new Date();
    return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  function formatDateTime(date) {
    var d = date || new Date();
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** ms timestamp -> "28/10/2026 14:05" (local time). */
  function formatStamp(ms) { return formatDateTime(new Date(ms)); }

  var api = {
    pad2: pad2, isLeap: isLeap, daysInMonth: daysInMonth, toISO: toISO, splitISO: splitISO, isValidISO: isValidISO,
    parseDMY: parseDMY, formatDMY: formatDMY, addDays: addDays, daysBetween: daysBetween, isoWeek: isoWeek,
    weekStart: weekStart, financialYear: financialYear, monthLabel: monthLabel, parseTime: parseTime,
    durationMinutes: durationMinutes, formatDuration: formatDuration, localISO: localISO,
    formatDateTime: formatDateTime, formatStamp: formatStamp, MS_PER_DAY: MS_PER_DAY
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).dates = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

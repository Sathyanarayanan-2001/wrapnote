'use strict';
// Each test lists its input and the expected value worked out by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const money = require('../../src/core/money.js');
const dates = require('../../src/core/dates.js');

test('money: parse lakh-grouped rupees to paise', () => {
  // 1,23,456.78 rupees = 123456 x 100 + 78 = 12,345,678 paise
  assert.equal(money.parseRupees('1,23,456.78').paise, 12345678);
  assert.equal(money.parseRupees('₹ 0.1').paise, 10);
  assert.equal(money.parseRupees('Rs. 5').paise, 500);
  assert.equal(money.parseRupees('-50').paise, -5000);
  assert.equal(money.parseRupees('').paise, 0);
  assert.equal(money.parseRupees('12.345').ok, false);
  assert.equal(money.parseRupees('abc').ok, false);
  assert.equal(money.parseRupees('99999999999999').ok, false); // 14 rupee digits is over the safe limit
});

test('money: 0.1 + 0.2 is exact in paise', () => {
  // Floats give 0.30000000000000004; paise give 10 + 20 = 30 -> ₹0.30
  const t = money.sumPaise([money.parseRupees('0.1').paise, money.parseRupees('0.2').paise]);
  assert.equal(t, 30);
  assert.equal(money.formatPaise(t), '₹0.30');
});

test('money: hand-worked totals match to the paisa', () => {
  // 1,23,456.78 + 0.05 + 999.95 = 1,24,456.78
  const vals = ['1,23,456.78', '0.05', '999.95'].map((s) => money.parseRupees(s).paise);
  assert.deepEqual(vals, [12345678, 5, 99995]);
  assert.equal(money.sumPaise(vals), 12445678);
  assert.equal(money.formatPaise(money.sumPaise(vals)), '₹1,24,456.78');
});

test('money: lakh grouping format', () => {
  assert.equal(money.formatPaise(12345678), '₹1,23,456.78');
  assert.equal(money.formatPaise(100), '₹1.00');
  assert.equal(money.formatPaise(5), '₹0.05');
  assert.equal(money.formatPaise(-12345), '-₹123.45');
  assert.equal(money.formatPaise(100000000), '₹10,00,000.00');
  assert.equal(money.formatPaise(12345678, { symbol: false }), '1,23,456.78');
  assert.equal(money.formatCount(123456), '1,23,456');
  assert.throws(() => money.formatPaise(1.5));
});

test('money: grouping agrees with Intl en-IN (second method) on 2,000 random values', () => {
  const nf = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 2000; i++) {
    const paise = Math.floor(rnd() * 1e12);
    // Intl receives the exact decimal string, so no float rounding sneaks into the reference.
    const ref = nf.format(`${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`);
    assert.equal(money.formatPaise(paise, { symbol: false }), ref);
  }
});

test('dates: day-first parsing and leap years', () => {
  assert.equal(dates.parseDMY('28/10', 2026).iso, '2026-10-28');
  assert.equal(dates.parseDMY('28-10-26').iso, '2026-10-28');
  assert.equal(dates.parseDMY('29/02/2024').iso, '2024-02-29');
  assert.equal(dates.parseDMY('29/02/2000').iso, '2000-02-29');
  assert.equal(dates.parseDMY('29/02/2026').ok, false);
  assert.equal(dates.parseDMY('29/02/1900').ok, false);
  assert.equal(dates.parseDMY('31/04/2026').ok, false);
  assert.equal(dates.parseDMY('10/28/2026').ok, false); // month 28 rejected: day comes first
  assert.equal(dates.formatDMY('2026-03-05'), '05/03/2026');
});

test('dates: month ends and leap day arithmetic', () => {
  assert.equal(dates.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(dates.addDays('2023-02-28', 1), '2023-03-01');
  assert.equal(dates.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(dates.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dates.daysBetween('2024-02-01', '2024-03-01'), 29);
});

test('dates: ISO weeks including week 53', () => {
  // 1 Jan 2026 is a Thursday, so week 1 runs 29 Dec 2025 - 4 Jan 2026.
  // 16 Nov 2026 is 322 days after 29 Dec 2025: 322 / 7 = 46 full weeks -> CW47.
  assert.equal(dates.isoWeek('2026-11-16').label, 'CW47');
  assert.deepEqual([dates.isoWeek('2026-12-31').year, dates.isoWeek('2026-12-31').week], [2026, 53]);
  assert.deepEqual([dates.isoWeek('2027-01-01').year, dates.isoWeek('2027-01-01').week], [2026, 53]);
  assert.deepEqual([dates.isoWeek('2027-01-04').year, dates.isoWeek('2027-01-04').week], [2027, 1]);
  assert.deepEqual([dates.isoWeek('2021-01-03').year, dates.isoWeek('2021-01-03').week], [2020, 53]);
  assert.deepEqual([dates.isoWeek('2025-12-29').year, dates.isoWeek('2025-12-29').week], [2026, 1]);
  assert.equal(dates.weekStart('2026-11-22'), '2026-11-16');
});

test('dates: ISO week agrees with a brute-force second method for 2000-2035', () => {
  // Second method: week 1 starts on the Monday on or before 4 January.
  const mondayOfWeek1 = (y) => { const d = new Date(Date.UTC(y, 0, 4)); return Date.UTC(y, 0, 4) - ((d.getUTCDay() + 6) % 7) * 864e5; };
  for (let t = Date.UTC(2000, 0, 1); t <= Date.UTC(2035, 11, 31); t += 864e5) {
    const d = new Date(t);
    const iso = d.toISOString().slice(0, 10);
    let y = d.getUTCFullYear();
    if (t >= mondayOfWeek1(y + 1)) y += 1; else if (t < mondayOfWeek1(y)) y -= 1;
    const week = Math.floor((t - mondayOfWeek1(y)) / (7 * 864e5)) + 1;
    const got = dates.isoWeek(iso);
    assert.equal(got.year, y, iso);
    assert.equal(got.week, week, iso);
  }
});

test('dates: financial year boundary 31 March to 1 April', () => {
  assert.equal(dates.financialYear('2027-03-31').label, 'FY 2026-27');
  assert.equal(dates.financialYear('2027-04-01').label, 'FY 2027-28');
  assert.equal(dates.financialYear('2026-04-01').label, 'FY 2026-27');
  assert.equal(dates.financialYear('2000-01-15').label, 'FY 1999-00');
  assert.equal(dates.monthLabel('2026-10-28'), 'Oct 2026');
});

test('dates: 24-hour times and midnight crossings', () => {
  assert.equal(dates.durationMinutes('23:30', '00:45'), 75); // 30 min to midnight + 45 min
  assert.equal(dates.durationMinutes('09:00', '17:30'), 510); // 8 h 30 min = 510 min
  assert.equal(dates.durationMinutes('10:00', '10:00'), 0);
  assert.equal(dates.formatDuration(75), '1 h 15 min');
  assert.equal(dates.parseTime('24:00').ok, false);
  assert.equal(dates.parseTime('9:05').text, '09:05');
  assert.equal(dates.parseTime('7 pm').ok, false);
});

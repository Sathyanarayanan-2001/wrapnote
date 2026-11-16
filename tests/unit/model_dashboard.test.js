'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../../src/core/model.js');
const dashboard = require('../../src/core/dashboard.js');
const money = require('../../src/core/money.js');

function momDoc(over) {
  const d = model.newDoc('mom', 1000, '2026-10-28', 'dtest1');
  d.title = 'Weekly sync (made-up)';
  Object.assign(d.fields.mom, over || {});
  return d;
}

test('model: MoM header shows derived weekday, week, FY and duration', () => {
  const html = model.renderGenerated(momDoc({ from: '10:00', to: '11:30', date: '2026-10-28' }));
  // 28/10/2026 is a Wednesday in ISO week 44 of FY 2026-27; 10:00-11:30 is 90 min.
  assert.ok(html.includes('28/10/2026 (Wed) · CW44 · FY 2026-27'));
  assert.ok(html.includes('10:00–11:30 (1 h 30 min)'));
});

test('model: midnight-crossing meeting is labelled', () => {
  const html = model.renderGenerated(momDoc({ from: '23:30', to: '00:45' }));
  assert.ok(html.includes('23:30–00:45 (1 h 15 min, ends next day)'));
});

test('model: typed text is escaped, unsafe links are not linked', () => {
  const d = momDoc({ location: 'javascript:alert(1)', present: ['<img src=x onerror=alert(1)>'] });
  d.title = '<b>Hi</b>';
  const html = model.renderGenerated(d);
  assert.ok(!html.includes('<b>Hi</b>'));
  assert.ok(html.includes('&lt;b&gt;Hi&lt;/b&gt;'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('href="javascript'));
  const ok = model.renderGenerated(momDoc({ location: 'https://meet.example.org/abc' }));
  assert.ok(ok.includes('<a href="https://meet.example.org/abc">'));
});

test('model: action table sorts by due, then owner, and totals cost exactly', () => {
  const html = model.actionsTable([
    { task: 'Task B', owner: 'Ravi', due: '2026-11-05', cost: 150050, done: false },
    { task: 'Task A', owner: 'Asha', due: '2026-11-05', cost: 99950, done: true },
    { task: 'Task C', owner: 'Zed', due: '', cost: 0, done: false }
  ]);
  // Same due date: Asha before Ravi. No due date sorts last. 1,500.50 + 999.50 = 2,500.00
  assert.ok(html.indexOf('Task A') < html.indexOf('Task B') && html.indexOf('Task B') < html.indexOf('Task C'));
  assert.ok(html.includes('₹2,500.00'));
});

test('model: mind map nests by indentation', () => {
  assert.equal(model.mindMap('A\n  B\nC'), '<ul class="wn-map"><li>A<ul class="wn-map"><li>B</li></ul></li><li>C</li></ul>');
});

test('model: validateAction accepts day-first dates, rupees and status words', () => {
  assert.deepEqual(model.validateAction({ task: ' Draft memo ', owner: 'Asha', due: '05/11/2026', cost: '1,500.50', status: 'Done' }).value,
    { task: 'Draft memo', owner: 'Asha', due: '2026-11-05', cost: 150050, done: true });
  assert.equal(model.validateAction({ task: '', due: '' }).ok, false);
  assert.match(model.validateAction({ task: 'x', due: '31/02/2026' }).error, /Feb 2026 has 28 days/);
  assert.match(model.validateAction({ task: 'x', cost: '12.345' }).error, /^Cost:/);
  assert.match(model.validateAction({ task: 'x', status: 'maybe' }).error, /not recognised/);
});

test('model: route and backup validation reject bad input with clear messages', () => {
  assert.deepEqual(model.parseRoute('#edit/d123'), { page: 'edit', id: 'd123' });
  assert.equal(model.parseRoute('#edit/<x>').error, 'That document link is not valid.');
  assert.equal(model.parseRoute('#nope').page, 'home');
  assert.equal(model.validateBackup(null).ok, false);
  assert.equal(model.validateBackup({ app: 'other', records: [] }).ok, false);
  const good = model.newDoc('book', 5, '2026-01-01', 'dgood');
  const res = model.validateBackup({ app: 'wrapnote', records: [good, { id: 'bad id!', u: 1 }, { id: 'dt', d: 1, u: 9 }] });
  assert.equal(res.records.length, 2);
  assert.deepEqual(res.errors, ['Record 2: id is missing or has invalid characters.']);
});

test('dashboard: every figure matches an independent hand count', () => {
  const metas = [
    { id: 'a', u: 5, title: 'Alpha', mode: 'mom', category: 'Meetings', status: 'draft', date: '2026-11-16', words: 120,
      actions: [{ task: 't1', due: '2026-11-10', cost: 10050, done: false }, { task: 't2', due: '2026-11-20', cost: 0, done: false }, { task: 't3', due: '2027-04-02', cost: 2000, done: true }] },
    { id: 'b', u: 9, title: 'Beta', mode: 'book', category: 'Study', status: 'final', date: '2026-11-09', words: 300, actions: [] },
    { id: 'c', u: 7, title: 'Gamma', mode: 'mom', category: 'Meetings', status: 'final', date: '2026-08-03', words: 80,
      actions: [{ task: 't4', due: '', cost: 99999, done: false }] }
  ];
  const d = dashboard.aggregate(metas, '2026-11-16');
  // Hand counts: 3 documents; 2 mom + 1 book; Meetings 2, Study 1; Final 2, Draft 1; words 120 + 300 + 80 = 500.
  assert.equal(d.total, 3);
  assert.deepEqual(d.byMode.map((x) => [x.key, x.count]), [['mom', 2], ['book', 1]]);
  assert.deepEqual(d.byCategory.map((x) => [x.key, x.count]), [['Meetings', 2], ['Study', 1]]);
  assert.deepEqual(d.byStatus.map((x) => [x.key, x.count]), [['Final', 2], ['Draft', 1]]);
  assert.equal(d.words, 500);
  // Actions: 4 total, 1 done, 3 open; t1 overdue (10/11 < 16/11); t2 due within 7 days; t4 has no date.
  assert.deepEqual(d.actions, { total: 4, open: 3, done: 1, overdue: 1, dueNext7: 1 });
  // Cost 100.50 + 20.00 + 999.99 = 1,120.49; FY: t1 -> FY 2026-27, t3 (02/04/2027) -> FY 2027-28, t4 uses doc date 03/08/2026 -> FY 2026-27.
  assert.equal(d.costTotal, 112049);
  assert.equal(money.formatPaise(d.costTotal), '₹1,120.49');
  assert.deepEqual(d.costByFY.map((x) => [x.label, x.value]), [['FY 2026-27', 110049], ['FY 2027-28', 2000]]);
  // Weeks: CW40..CW47; Alpha in CW47, Beta in CW46, Gamma (CW32) outside the window.
  assert.equal(d.weeks.length, 8);
  assert.equal(d.weeks[7].label, 'CW47');
  assert.deepEqual(d.weeks.map((w) => w.count), [0, 0, 0, 0, 0, 0, 1, 1]);
  assert.deepEqual(d.recent.map((r) => r.id), ['b', 'c', 'a']);
});

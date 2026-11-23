// WrapNote 1.4.0: the person's ribbon arrangement. Expected values worked out by hand before running.
const test = require('node:test');
const assert = require('node:assert');
const L = require('../../src/core/ribbonLayout.js');

const RIBBON = [
  { id: 'home', groups: [{ id: 'styles', items: ['sel:style', 'customLabel'] }, { id: 'font', items: ['bold', 'italic', 'underline'] }, { id: 'clipboard', items: ['cut', 'copy'] }] },
  { id: 'insert', groups: [{ id: 'tables', items: ['table', 'chart'] }] },
  { id: 'view', groups: [{ id: 'zoom', items: ['zoom', 'z100'] }, { id: 'show', items: ['ruler'] }] }
];
const QAT = ['home/styles/sel:style', 'home/font/bold'];

test('ribbon layout: nothing saved gives the standard ribbon and quick access bar', () => {
  const r = L.normalize(null, RIBBON, QAT);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.layout.tabs, ['home', 'insert', 'view']);
  assert.deepEqual(r.layout.qat, QAT);
  assert.deepEqual(L.apply(RIBBON, r.layout)[0].groups.map((g) => g.id), ['styles', 'font', 'clipboard']);
  assert.equal(L.isDefault(r.layout, RIBBON, QAT), true);
});

test('ribbon layout: a saved order is applied to tabs, groups and commands', () => {
  const saved = { v: 1, tabs: ['view', 'home', 'insert'], groups: { home: ['clipboard', 'styles', 'font'] }, items: { 'home/font': ['underline', 'bold', 'italic'] }, hidden: ['view/show'], qat: ['home/font/italic'] };
  const r = L.normalize(saved, RIBBON, QAT);
  assert.deepEqual(r.warnings, []);
  const a = L.apply(RIBBON, r.layout);
  assert.deepEqual(a.map((t) => t.id), ['view', 'home', 'insert']);
  assert.deepEqual(a[1].groups.map((g) => g.id), ['clipboard', 'styles', 'font']);
  assert.deepEqual(a[1].groups[2].items, ['underline', 'bold', 'italic']);
  assert.deepEqual(a[0].groups.map((g) => [g.id, g.hidden]), [['zoom', false], ['show', true]]);
  assert.deepEqual(r.layout.qat, ['home/font/italic']);
});

test('ribbon layout: commands added in a later version appear next to their default neighbour', () => {
  // Saved before "underline" existed: [italic, bold]. Default [bold, italic, underline]: underline follows italic.
  const r = L.normalize({ items: { 'home/font': ['italic', 'bold'] } }, RIBBON, QAT);
  assert.deepEqual(r.layout.items['home/font'], ['italic', 'underline', 'bold']);
  // A brand-new tab saved before it existed goes after its default neighbour too.
  assert.deepEqual(L.normalize({ tabs: ['view', 'home'] }, RIBBON, QAT).layout.tabs, ['view', 'home', 'insert']);
});

test('ribbon layout: unknown, duplicated or damaged entries are dropped and reported', () => {
  const r = L.normalize({ tabs: ['home', 'home', 'gone'], groups: { home: ['font', 'nope'], ghost: ['x'] }, hidden: ['home/nope'], qat: ['home/font/bold', 'home/font/bold', 'x/y/z', 5] }, RIBBON, QAT);
  assert.deepEqual(r.layout.tabs, ['home', 'insert', 'view']);
  // 'styles' was not in the saved list; it has no default neighbour before it, so it goes first (same rule as test 3).
  assert.deepEqual(r.layout.groups.home, ['styles', 'font', 'clipboard']);
  assert.deepEqual(r.layout.qat, ['home/font/bold']);
  assert.equal(r.warnings.length, 6); // gone, nope, ghost tab, hidden nope, x/y/z, 5
  assert.deepEqual(L.normalize('junk', RIBBON, QAT).warnings, ['The saved ribbon arrangement could not be read; the standard one is used.']);
  assert.deepEqual(L.normalize([1], RIBBON, QAT).layout.tabs, ['home', 'insert', 'view']);
});

test('ribbon layout: a tab can never lose every group, and the quick access bar holds at most 16', () => {
  const r = L.normalize({ hidden: ['view/zoom', 'view/show'] }, RIBBON, QAT);
  assert.deepEqual(r.layout.hidden, ['view/show']); // zoom (first group) shown again
  assert.match(r.warnings[0], /first group is shown/);
  const many = L.paths(RIBBON); // home 2 + 3 + 2, insert 2, view 2 + 1 = 12 commands
  assert.equal(many.length, 12);
  const big = [];
  for (let i = 0; i < 20; i++) big.push(many[i % 12]);
  assert.equal(L.normalize({ qat: big }, RIBBON, QAT).layout.qat.length, 12); // duplicates dropped, 12 unique ≤ 16
  // 17 distinct commands: only 16 are kept, with a message.
  const wide = [{ id: 't', groups: [{ id: 'g', items: Array.from({ length: 17 }, (_, i) => 'c' + i) }] }];
  const q = L.normalize({ qat: wide[0].groups[0].items.map((c) => 't/g/' + c) }, wide, []);
  assert.equal(q.layout.qat.length, 16);
  assert.deepEqual(q.warnings, ['The quick access bar holds at most 16 commands; the rest were left out.']);
});

test('ribbon layout: moving up, down and by drag', () => {
  assert.deepEqual(L.move(['a', 'b', 'c'], 2, -1), ['a', 'c', 'b']);
  assert.deepEqual(L.move(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c']); // already first
  assert.deepEqual(L.moveTo(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(L.moveTo(['a', 'b'], 0, 5), ['a', 'b']);
});

test('ribbon layout: only differences are stored, so later default changes still arrive', () => {
  const r = L.normalize({ groups: { home: ['font', 'styles', 'clipboard'] }, qat: QAT }, RIBBON, QAT);
  assert.deepEqual(L.compact(r.layout, RIBBON, QAT), { v: 1, groups: { home: ['font', 'styles', 'clipboard'] } });
  // Round trip: compact → normalize → same ribbon.
  const again = L.normalize(L.compact(r.layout, RIBBON, QAT), RIBBON, QAT).layout;
  assert.deepEqual(L.apply(RIBBON, again), L.apply(RIBBON, r.layout));
  assert.deepEqual(L.compact(L.normalize(null, RIBBON, QAT).layout, RIBBON, QAT), { v: 1 });
});

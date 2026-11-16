'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const csv = require('../../src/core/csv.js');
const merge = require('../../src/core/merge.js');

test('csv: BOM, CRLF, quoting and formula guard', () => {
  const out = csv.toCSV(['Task', 'Owner'], [['Plan, review', 'A "B"'], ['=SUM(1)', '-5'], ['Line1\nLine2', ' pad']]);
  assert.equal(out, '﻿Task,Owner\r\n"Plan, review","A ""B"""\r\n\'=SUM(1),-5\r\n"Line1\nLine2"," pad"\r\n');
});

test('csv: parse round trip returns the original values', () => {
  const rows = [['Task', 'Owner'], ['Plan, review', 'A "B"'], ['=SUM(1)', '-5'], ['Line1\nLine2', ' pad'], ['000123456789012345', '']];
  const text = csv.toCSV(rows[0], rows.slice(1));
  assert.deepEqual(csv.parseCSV(text), rows);
});

test('csv: long reference numbers stay text', () => {
  const parsed = csv.parseCSV(csv.toCSV(['Ref'], [['627123456789012']]));
  assert.equal(parsed[1][0], '627123456789012');
  assert.equal(typeof parsed[1][0], 'string');
});

test('csv: semicolon and tab delimiters are detected', () => {
  assert.deepEqual(csv.parseCSV('a;b\r\n1;2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(csv.parseCSV('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
});

test('csv: header row found after preamble lines, matched by alias', () => {
  const rows = csv.parseCSV('Export from tracker,\nGenerated 01/11/2026\n\nAction Item,Assignee,Deadline,Amount\nDraft memo,Asha,05/11/2026,1500\n');
  const h = csv.findHeader(rows, { task: ['action item', 'action'], owner: ['assignee'], due: ['deadline'], cost: ['amount'] }, ['task']);
  assert.equal(h.index, 3);
  assert.deepEqual(h.map, { task: 0, owner: 1, due: 2, cost: 3 });
  assert.equal(csv.findHeader([['x', 'y']], { task: [] }, ['task']), null);
});

test('merge: canonical JSON ignores key order', () => {
  assert.equal(merge.canonical({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } }), '{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}');
});

test('merge: newer wins, tie breaks on larger canonical text, tombstones travel', () => {
  const a = { id: 'x', u: 10, title: 'A' }, b = { id: 'x', u: 11, title: 'B' };
  assert.equal(merge.winner(a, b), b);
  const t1 = { id: 'x', u: 10, title: 'Apple' }, t2 = { id: 'x', u: 10, title: 'Banana' };
  assert.equal(merge.winner(t1, t2), t2); // "Banana" > "Apple"
  assert.equal(merge.winner(t2, t1), t2);
  const out = merge.mergeMaps({ x: a }, { x: merge.tombstone('x', 12) });
  assert.deepEqual(out.x, { id: 'x', d: 1, u: 12 });
});

function rng(seed) { return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; }
function randomMap(r) {
  const m = {};
  const n = Math.floor(r() * 8);
  for (let i = 0; i < n; i++) {
    const id = 'r' + Math.floor(r() * 6);
    const rec = r() < 0.2 ? merge.tombstone(id, Math.floor(r() * 5)) : { id, u: Math.floor(r() * 5), title: 't' + Math.floor(r() * 3), n: Math.floor(r() * 3) };
    m[id] = merge.winner(m[id], rec);
  }
  return m;
}
const C = (m) => merge.canonical(m);

test('merge: commutative, associative and idempotent on 500 randomised cases', () => {
  const r = rng(42);
  for (let i = 0; i < 500; i++) {
    const a = randomMap(r), b = randomMap(r), c = randomMap(r);
    assert.equal(C(merge.mergeMaps(a, b)), C(merge.mergeMaps(b, a)), 'commutative');
    assert.equal(C(merge.mergeMaps(merge.mergeMaps(a, b), c)), C(merge.mergeMaps(a, merge.mergeMaps(b, c))), 'associative');
    assert.equal(C(merge.mergeMaps(a, a)), C(a), 'idempotent');
  }
});

test('merge: two simulated devices add at the same time, then a deletion reaches the other', () => {
  let devA = { n1: { id: 'n1', u: 1000, title: 'Made-up note from A' } };
  let devB = { n2: { id: 'n2', u: 1000, title: 'Made-up note from B' } };
  // Both sync through the folder.
  const shared = merge.mergeMaps(devA, devB);
  devA = merge.mergeMaps(devA, shared); devB = merge.mergeMaps(devB, shared);
  assert.deepEqual(Object.keys(devA).sort(), ['n1', 'n2']);
  assert.deepEqual(Object.keys(devB).sort(), ['n1', 'n2']);
  // A deletes n2 later.
  devA = merge.mergeMaps(devA, { n2: merge.tombstone('n2', 2000) });
  devB = merge.mergeMaps(devB, devA);
  assert.equal(devB.n2.d, 1);
  assert.equal(C(devA), C(devB));
});

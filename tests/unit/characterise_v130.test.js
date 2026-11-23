// WrapNote 1.3.0: characterisation tests. Written and run against 1.2.0 BEFORE the source-reference change,
// to pin what the change must not alter: document summaries, routes and backup checks.
const test = require('node:test');
const assert = require('node:assert');
const model = require('../../src/core/model.js');

test('characterise: summary of a document has the same fields and values as in 1.2.0', () => {
  const d = model.newDoc('book', 1700000000000, '2026-11-23', 'dAbc123');
  d.title = 'Grid code study';
  const m = model.deriveMeta(d, 'one two three');
  for (const k of ['id', 'u', 'title', 'mode', 'category', 'status', 'date', 'created', 'words', 'actions']) assert.ok(k in m, k);
  assert.deepEqual([m.id, m.title, m.mode, m.category, m.status, m.date, m.words, m.actions.length], ['dAbc123', 'Grid code study', 'book', 'Study', 'draft', '2026-11-23', 3, 0]);
});

test('characterise: routes used by 1.2.0 still resolve the same way', () => {
  assert.deepEqual(model.parseRoute('#edit/dAbc123'), { page: 'edit', id: 'dAbc123' });
  assert.deepEqual(model.parseRoute('#guide/g-office'), { page: 'guide', section: 'g-office' });
  assert.deepEqual(model.parseRoute(''), { page: 'home' });
  assert.equal(model.parseRoute('#nosuchpage').page, 'home');
  assert.equal(model.parseRoute('#edit/bad id!').error, 'That document link is not valid.');
});

test('characterise: a 1.2.0 backup record without source references is accepted unchanged', () => {
  const d = model.newDoc('blank', 1700000000000, '2026-11-23', 'dOld001');
  const r = model.validateBackup({ app: 'wrapnote', records: [d] });
  assert.equal(r.ok, true);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].html, d.html);
});

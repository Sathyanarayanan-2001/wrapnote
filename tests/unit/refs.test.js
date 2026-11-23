// WrapNote 1.3.0: source references. Every expected value was worked out by hand before running.
// All names are made up.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../../src/core/refs.js');
const model = require('../../src/core/model.js');

test('refs: page numbers and ranges are read the way people type them', () => {
  assert.deepEqual(R.parsePages('42').value, { from: 42, to: 42 });
  assert.deepEqual(R.parsePages('42-45').value, { from: 42, to: 45 });
  assert.deepEqual(R.parsePages(' 42 – 45 ').value, { from: 42, to: 45 }); // en dash and spaces
  assert.deepEqual(R.parsePages('pp. 42-45').value, { from: 42, to: 45 });
  assert.deepEqual(R.parsePages('p.12').value, { from: 12, to: 12 });
  assert.deepEqual(R.parsePages('12 to 14').value, { from: 12, to: 14 });
  assert.deepEqual(R.parsePages(''), { ok: true, value: null });
});

test('refs: bad page input is refused with a message that says what to type', () => {
  assert.equal(R.parsePages('4x').error, 'Page: use a number like 42 or a range like 42-45.');
  assert.equal(R.parsePages('45-42').error, 'Page: the range ends before it starts (45-42). Write the smaller page first.');
  assert.equal(R.parsePages('0').error, 'Page: page numbers start at 1.');
  assert.equal(R.parsePages('100000').error, 'Page: use a number up to 99999.');
  assert.equal(R.parsePages('1-2-3').ok, false);
  assert.equal(R.parsePages('12.5').ok, false);
});

test('refs: a reference needs its document name; all-blank means "no reference"', () => {
  assert.deepEqual(R.validate({ source: ' ', heading: '', pages: '' }), { ok: true, value: null });
  assert.deepEqual(R.validate({ heading: 'Scope', pages: '3' }).errors, ['Document name is needed when any other reference field is filled in.']);
  const ok = R.validate({ source: '  Grid  Code  2023 ', heading: 'Frequency', sub: 'Ride-through', section: '4', pages: '12', t: 5 });
  assert.deepEqual(ok.value, { v: 1, source: 'Grid Code 2023', heading: 'Frequency', sub: 'Ride-through', section: '4', pages: { from: 12, to: 12 }, t: 5 });
  assert.match(R.validate({ source: 'x'.repeat(201) }).errors[0], /Document name is longer than 200 characters/);
  // Two problems are both reported, not only the first.
  assert.equal(R.validate({ heading: 'A', pages: 'abc' }).errors.length, 2);
});

test('refs: the citation tag reads Doc › Heading › Sub-heading › Art. 4 › p. 12 and skips blanks', () => {
  const r = { source: 'Grid Code 2023', heading: 'Frequency', sub: 'Ride-through', section: '4', pages: { from: 12, to: 12 } };
  assert.equal(R.citation(r), 'Grid Code 2023 › Frequency › Ride-through › Art. 4 › p. 12');
  assert.equal(R.citation({ source: 'Manual', section: 'Clause 5.3', pages: { from: 42, to: 45 } }), 'Manual › Clause 5.3 › pp. 42–45');
  assert.equal(R.citation({ source: 'Manual' }), 'Manual');
  assert.equal(R.pagesInput({ from: 42, to: 45 }), '42-45');
});

test('refs: autocomplete ranks name-start, then word-start, then anywhere; then most used', () => {
  const entries = [
    { name: 'IEC 61400-21', count: 2, last: 10 }, { name: 'Indian Grid Code', count: 5, last: 20 },
    { name: 'CEA Technical Standards', count: 1, last: 30 }, { name: 'Grid Connection Manual', count: 3, last: 5 }
  ];
  // "grid": "Grid Connection Manual" starts with it (rank 0); "Indian Grid Code" has a word starting with it (rank 1).
  assert.deepEqual(R.suggest('grid', entries), ['Grid Connection Manual', 'Indian Grid Code']);
  // "in": only "Indian Grid Code" contains it ("connection" has "io", not "in").
  assert.deepEqual(R.suggest('in', entries), ['Indian Grid Code']);
  // "nual" appears only inside a word: "Grid Connection Manual" (rank 2).
  assert.deepEqual(R.suggest('nual', entries), ['Grid Connection Manual']);
  // Blank: most used first.
  assert.deepEqual(R.suggest('', entries, 2), ['Indian Grid Code', 'Grid Connection Manual']);
  // Different case or spacing is the same document; the existing spelling is offered.
  assert.equal(R.existingName('iec  61400-21', entries), 'IEC 61400-21');
  assert.equal(R.existingName('IEC 61400-21', entries), null);
});

test('refs: summaries, the list of document names and filtering by document, heading and page', () => {
  const a = { id: 'd1', title: 'Study week 47', u: 100, refs: [
    { b: 'b1', source: 'Grid Code', heading: 'Frequency', sub: 'Limits', section: '4', pages: { from: 12, to: 12 }, t: 50, preview: 'Hold 47.5 Hz' },
    { b: 'b2', source: 'Grid Code', heading: 'Voltage', sub: '', section: '', pages: { from: 40, to: 45 }, t: 60, preview: 'Ride-through' }] };
  const b = { id: 'd2', title: 'Study week 48', u: 200, refs: [
    { b: 'b9', source: 'grid code', heading: 'frequency', sub: '', section: '', pages: null, t: 70, preview: 'Droop' },
    { b: 'b3', source: 'Inverter Manual', heading: 'Setup', sub: '', section: '', pages: { from: 3, to: 3 }, t: 10, preview: 'Setpoints' }] };
  const all = R.notes([a, b]);
  assert.equal(all.length, 4);
  const src = R.sources(all);
  // "Grid Code" and "grid code" are one document used 3 times; latest spelling (t = 70) is shown.
  assert.deepEqual(src.map((s) => [s.name, s.count]), [['grid code', 3], ['Inverter Manual', 1]]);
  // Headings: most used first; equal counts → most recent first (Voltage t = 60 before Limits t = 50).
  assert.deepEqual(src[0].headings.map((x) => [x.name, x.count]), [['frequency', 2], ['Voltage', 1], ['Limits', 1]]);
  const f = (x) => R.filter(all, R.validateFilter(x).value).map((n) => n.b);
  assert.deepEqual(f({ source: 'GRID CODE' }), ['b1', 'b2', 'b9']); // pages 12, 40, then no page last
  assert.deepEqual(f({ source: 'Grid Code', heading: 'Frequency' }), ['b1', 'b9']);
  assert.deepEqual(f({ heading: 'limits' }), ['b1']); // a heading filter also finds the sub-heading
  assert.deepEqual(f({ page: '44' }), ['b2']); // 44 lies inside 40-45
  assert.deepEqual(f({ page: '10-12' }), ['b1']); // overlapping range
  assert.deepEqual(f({ q: 'ride through' }), ['b2']); // each word is found inside "Ride-through"
  assert.deepEqual(f({ q: 'ride-through' }), ['b2']);
  assert.deepEqual(f({ q: 'week 48 droop' }), ['b9']);
  assert.deepEqual(R.validateFilter({ page: 'x' }).errors, ['Page: use a number like 42 or a range like 42-45.']);
});

test('refs: summary keeps only notes still on the page; CSV keeps pages as text', () => {
  const refs = { b1: { source: 'A', heading: '', sub: '', section: '', pages: { from: 2, to: 3 }, t: 1 }, gone: { source: 'B', pages: null } };
  const idx = R.index(refs, { b1: 'Note one' });
  assert.deepEqual(idx.map((x) => x.b), ['b1']);
  const rows = R.csvRows(R.notes([{ id: 'd', title: 'T', u: 1, refs: idx }]));
  // Pages as "pp. 2–3", never "2-3", which spreadsheets read as 2 March.
  assert.deepEqual(rows[1], ['A', '', '', '', 'pp. 2–3', 'A › pp. 2–3', 'Note one', 'T']);
});

test('refs: old documents keep working and bad stored references are reported, not kept', () => {
  const old = { id: 'dOld', title: 'Old' }; // a 1.2.0 record: no refs at all
  assert.deepEqual(R.upgrade(old), []);
  assert.deepEqual(old.refs, {});
  const mixed = { refs: { b1: { source: 'Doc', pages: { from: 2, to: 2 } }, b2: { heading: 'No document' }, 'bad id!': { source: 'X' } } };
  const msgs = R.upgrade(mixed);
  assert.deepEqual(Object.keys(mixed.refs), ['b1']);
  assert.equal(msgs.length, 2);
  assert.deepEqual(R.upgrade({ refs: [1, 2] }), ['Source references are not in the expected form and were left out.']);
});

test('refs: backups carry references; a bad one is dropped with a warning and the document still imports', () => {
  const d = model.newDoc('book', 1, '2026-11-23', 'dNew001');
  d.refs = { b1: { v: 1, source: 'Doc', heading: '', sub: '', section: '', pages: { from: 5, to: 6 }, t: 1 }, b2: { source: '', pages: '7' } };
  const v = model.validateBackup({ app: 'wrapnote', records: [d] });
  assert.equal(v.ok, true);
  assert.deepEqual(Object.keys(v.records[0].refs), ['b1']);
  assert.equal(v.warnings.length, 1);
  assert.match(v.warnings[0], /^Record 1: Source reference for note b2 was left out: Document name is needed/);
  assert.equal(d.refs.b2 !== undefined, true, 'the input record is not changed');
});

test('refs: summary from deriveMeta and the note link route', () => {
  const d = model.newDoc('book', 1, '2026-11-23', 'dNew002');
  d.refs = { b1: { v: 1, source: 'Doc', heading: 'H', sub: '', section: '', pages: null, t: 3 } };
  assert.deepEqual(model.deriveMeta(d, 'x', { b1: 'Text' }).refs, [{ b: 'b1', source: 'Doc', heading: 'H', sub: '', section: '', pages: null, t: 3, preview: 'Text' }]);
  assert.deepEqual(model.deriveMeta(d, 'x').refs, []);
  assert.deepEqual(model.parseRoute('#edit/dNew002/b1'), { page: 'edit', id: 'dNew002', block: 'b1' });
  assert.equal(model.parseRoute('#edit/dNew002/b 1').error, 'That note link is not valid. Opening the document at the top.');
  assert.deepEqual(model.parseRoute('#sources'), { page: 'sources' });
});

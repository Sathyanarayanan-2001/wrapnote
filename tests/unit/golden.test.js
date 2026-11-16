'use strict';
// Golden set: five fixed inputs with hand-worked answers. Every change to rendering is scored
// against them with a three-point rubric: correct, complete, format followed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../../src/core/model.js');

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'golden', 'golden.json'), 'utf8'));

function score(html, exp) {
  const correct = (exp.notContains || []).every((s) => !html.includes(s)) && (exp.order || []).every((s, i, a) => i === 0 || html.indexOf(a[i - 1]) < html.indexOf(s));
  const complete = exp.contains.every((s) => html.includes(s));
  const h2 = (html.match(/<h2>/g) || []).length;
  const format = h2 === exp.h2 && /^<h1 class="wn-doc-title"/.test(html);
  return { correct, complete, format, total: [correct, complete, format].filter(Boolean).length };
}

for (const ex of golden.examples) {
  test('golden: ' + ex.name, () => {
    const d = model.newDoc(ex.input.mode, 1, '2026-01-01', 'dgold');
    d.title = ex.input.title;
    Object.assign(d.fields[ex.input.mode], ex.input.fields);
    const html = model.renderGenerated(d);
    const s = score(html, ex.expect);
    const missing = ex.expect.contains.filter((c) => !html.includes(c));
    assert.equal(s.total, 3, JSON.stringify({ s, missing, h2: (html.match(/<h2>/g) || []).length }));
  });
}

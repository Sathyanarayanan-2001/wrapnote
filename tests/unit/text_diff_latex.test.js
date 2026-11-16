'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const text = require('../../src/core/text.js');
const diff = require('../../src/core/diff.js');
const latex = require('../../src/core/latex.js');
const safe = require('../../src/core/safe.js');

test('text: word, character counts', () => {
  assert.equal(text.countWords("Hello, world — it's 2026!"), 4); // Hello | world | it's | 2026
  assert.equal(text.countWords(''), 0);
  assert.equal(text.countChars('ab c'), 4);
  assert.equal(text.countChars('ab c', false), 3);
  assert.equal(text.countChars('😀'), 1);
});

test('text: change case', () => {
  assert.equal(text.changeCase('the art of war', 'title'), 'The Art of War');
  assert.equal(text.changeCase('HELLO WORLD. this is i', 'sentence'), 'Hello world. This is I');
  assert.equal(text.changeCase('MiXeD', 'upper'), 'MIXED');
  assert.equal(text.changeCase('MiXeD', 'lower'), 'mixed');
});

test('text: polish fixes spacing and capitals without rewording', () => {
  assert.equal(text.polishText('hello  world . this is i'), 'Hello world. This is I');
  assert.equal(text.polishText('cost,time and scope'), 'Cost, time and scope');
  assert.equal(text.polishText('Version 1.5 ships'), 'Version 1.5 ships');
  assert.equal(text.polishText('hello \u00a0world'), 'Hello world'); // browser-typed double space
});

test('text: grammar hints', () => {
  const issues = text.grammarIssues('This is is a apple.  an book');
  const types = issues.map((i) => i.type);
  assert.deepEqual(types, ['Repeated word', 'Article', 'Spacing', 'Capital letter', 'Article']);
  assert.equal(text.grammarIssues('an hour, a university').length, 0);
});

test('text: syllables and summary', () => {
  assert.equal(text.syllables('reading').join('·').replace(/·/g, ''), 'reading');
  assert.ok(text.syllables('information').length >= 3);
  assert.deepEqual(text.summarise(['Short.', 'The committee agreed to extend the pilot by six weeks. More text.'], 3), ['The committee agreed to extend the pilot by six weeks.']);
});

test('diff: word-level edit script', () => {
  assert.deepEqual(diff.diffText('the quick brown fox', 'the slow brown fox'), [
    { op: '=', text: 'the ' }, { op: '-', text: 'quick' }, { op: '+', text: 'slow' }, { op: '=', text: ' brown fox' }
  ]);
  assert.deepEqual(diff.stats(diff.diffText('a b c', 'a c d e')), { added: 2, removed: 1 });
});

test('diff: reconstructs both texts on 300 random cases (second method)', () => {
  let seed = 3;
  const r = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const words = ['alpha', 'beta', 'gamma', 'delta', 'x', 'y'];
  const gen = () => Array.from({ length: Math.floor(r() * 30) }, () => words[Math.floor(r() * words.length)]).join(' ');
  for (let i = 0; i < 300; i++) {
    const a = gen(), b = gen();
    const ops = diff.diffText(a, b);
    assert.equal(ops.filter((o) => o.op !== '+').map((o) => o.text).join(''), a);
    assert.equal(ops.filter((o) => o.op !== '-').map((o) => o.text).join(''), b);
  }
});

test('latex: common constructs become MathML', () => {
  assert.match(latex.toMathML('\\frac{a}{b}').xml, /<mfrac><mrow><mi>a<\/mi><\/mrow><mrow><mi>b<\/mi><\/mrow><\/mfrac>/);
  assert.match(latex.toMathML('x^2').xml, /<msup><mi>x<\/mi><mn>2<\/mn><\/msup>/);
  assert.match(latex.toMathML('\\sum_{i=1}^{n} i').xml, /<munderover><mo largeop="true">∑<\/mo>/);
  assert.match(latex.toMathML('\\int_0^1 f').xml, /<msubsup><mo largeop="true">∫<\/mo>/);
  assert.match(latex.toMathML('\\sqrt[3]{x}').xml, /<mroot>/);
  assert.match(latex.toMathML('\\alpha + \\Omega').xml, /α.*Ω/);
  assert.equal(latex.toMathML('\\frac{a}{b}').errors.length, 0);
});

test('latex: hostile input is escaped and unknown commands reported', () => {
  const r = latex.toMathML('<script>alert(1)</script> \\foo');
  assert.ok(!/<script/i.test(r.xml));
  assert.ok(r.xml.includes('&lt;'));
  assert.deepEqual(r.errors, ['Unknown command \\foo.']);
  assert.deepEqual(latex.toMathML('{a').errors, ['Missing closing brace }.']);
});

test('safe: escaping and URL checks', () => {
  assert.equal(safe.escapeHtml('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  assert.equal(safe.isSafeUrl('https://example.org/a?b=1'), true);
  assert.equal(safe.isSafeUrl('mailto:someone@example.org'), true);
  assert.equal(safe.isSafeUrl('#sec-1'), true);
  assert.equal(safe.isSafeUrl('javascript:alert(1)'), false);
  assert.equal(safe.isSafeUrl('java\tscript:alert(1)'), false);
  assert.equal(safe.isSafeUrl('data:text/html,hi'), false);
  assert.equal(safe.isSafeImageSrc('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(safe.isSafeImageSrc('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(safe.cleanStyle('color: red; background: url(javascript:x); position: fixed; font-weight: 700'), 'color: red; font-weight: 700');
  assert.equal(safe.cssString('a"b\\c\n<d>'), '"a\\"b\\\\c d"');
  assert.equal(safe.fileSlug('Q3 review / final?'), 'Q3-review-final');
});

'use strict';
// WCAG 2.2 AA: text needs 4.5:1. Reads the theme colours straight from app.css and checks each text/background pair.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'styles', 'app.css'), 'utf8');

function vars(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)) out[m[1]] = m[2];
  return out;
}
const light = vars(css.match(/:root \{[\s\S]*?\}/)[0]);
const dark = Object.assign({}, light, vars(css.match(/\[data-theme="dark"\] \{[\s\S]*?\}/)[0]));

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

test('contrast: hand-checked reference pair', () => {
  // Black on white is the maximum, 21:1.
  assert.equal(Math.round(ratio('#000000', '#ffffff')), 21);
});

for (const [name, t] of [['light', light], ['dark', dark]]) {
  test(`contrast: ${name} theme text pairs meet 4.5:1`, () => {
    const pairs = [['text', 'bg'], ['text', 'surface'], ['muted', 'surface'], ['muted', 'bg'], ['muted', 'surface-2'], ['accent', 'surface'], ['accent', 'accent-soft'],
      ['on-accent', 'accent'], ['warn', 'surface'], ['warn', 'warn-soft'], ['bad', 'surface'], ['bad', 'bad-soft']];
    for (const [fg, bg] of pairs) {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `${name}: ${fg} ${t[fg]} on ${bg} ${t[bg]} is ${r.toFixed(2)}:1`);
    }
  });
}

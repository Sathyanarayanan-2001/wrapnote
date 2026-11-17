'use strict';
// Version 1.1.0: picture grid rules, OCR clean-up and guide section routes. Expected values worked out by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const pic = require('../../src/core/pictures.js');
const model = require('../../src/core/model.js');

test('pictures: empty slots per layout', () => {
  // 2 x 2 holds 4: 1 picture -> 3 empty, 2 -> 2, 4 -> 0 (full), 5 -> 3 (second grid started).
  assert.deepEqual([0, 1, 2, 3, 4, 5, 8].map((n) => pic.freeSlots('grid2', n)), [4, 3, 2, 1, 0, 3, 0]);
  // 3-column grid fills rows of 3.
  assert.deepEqual([1, 2, 3, 4].map((n) => pic.freeSlots('grid3', n)), [2, 1, 0, 2]);
  // Side by side holds 2.
  assert.deepEqual([1, 2, 3].map((n) => pic.freeSlots('side', n)), [1, 0, 0]);
  // Stacked never shows slots; unknown layouts are rejected as 0.
  assert.deepEqual([pic.freeSlots('stack', 1), pic.freeSlots('mosaic', 1), pic.freeSlots('grid2', -3)], [0, 0, 4]);
});

test('pictures: placement joins an open grid, never a stacked block', () => {
  // Worked example: A in a 2 x 2 grid (1 picture), add B -> B joins (slot 2).
  assert.deepEqual(pic.placement({ layout: 'grid2', count: 1 }, 1), { join: 1, rest: 0 });
  // Grid with 3 pictures, add 2 -> 1 joins (slot 4), 1 goes elsewhere.
  assert.deepEqual(pic.placement({ layout: 'grid2', count: 3 }, 2), { join: 1, rest: 1 });
  // Full grid -> nothing joins.
  assert.deepEqual(pic.placement({ layout: 'grid2', count: 4 }, 1), { join: 0, rest: 1 });
  // Stacked block or no block -> earlier behaviour (new block).
  assert.deepEqual(pic.placement({ layout: 'stack', count: 1 }, 1), { join: 0, rest: 1 });
  assert.deepEqual(pic.placement(null, 2), { join: 0, rest: 2 });
});

test('pictures: cell shape follows the pictures', () => {
  // 1080 x 1920 phone screenshot: 1080 / 1920 = 0.5625 -> 0.563 after rounding to 3 decimals.
  assert.equal(pic.cellRatio([1080 / 1920]), 0.563);
  // Median of three: 0.5625, 0.75, 1.778 -> 0.75.
  assert.equal(pic.cellRatio([0.5625, 1.778, 0.75]), 0.75);
  // A 1:5 receipt is clamped to 9:16; a 5:1 panorama to 16:9 (1.778).
  assert.equal(pic.cellRatio([0.2]), 0.563);
  assert.equal(pic.cellRatio([5]), 1.778);
  // No usable sizes -> square.
  assert.equal(pic.cellRatio([NaN, 0, -1]), 1);
});

test('pictures: OCR clean-up keeps sure lines and real words, drops noise', () => {
  const r = pic.cleanOcr([
    { text: 'MADE  UP NOTE', confidence: 91 },
    { text: '~ ;', confidence: 20 },
    { text: 'TOTAL 2026', confidence: 30 },
    { text: '   ', confidence: 99 },
    { text: 'ab', confidence: 10 }
  ]);
  // "TOTAL 2026" has conf 30 < 45 but has real words and 30 >= 45 / 2, so it stays.
  assert.deepEqual(r, { text: 'MADE UP NOTE\nTOTAL 2026', kept: 2, dropped: 2 });
  assert.deepEqual(pic.cleanOcr([]), { text: '', kept: 0, dropped: 0 });
});

test('route: guide sections are validated', () => {
  assert.deepEqual(model.parseRoute('#guide/g-ribbon'), { page: 'guide', section: 'g-ribbon' });
  assert.deepEqual(model.parseRoute('#guide'), { page: 'guide' });
  const bad = model.parseRoute('#guide/<script>');
  assert.equal(bad.page, 'guide');
  assert.match(bad.error, /section/);
  // Unknown pages keep the earlier message.
  assert.equal(model.parseRoute('#g-ribbon').page, 'home');
});

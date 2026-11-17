// WrapNote 1.2.0: guard against committing organisation data from a template a user shared.
// The forbidden words are stored only as SHA-256 hashes, so this test itself never contains them.
// It scans every source, test and document file for any single word or two-word phrase with one of these hashes,
// and fails if any Word or template file (.docx, .dotx) is in the repository at all.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORBIDDEN = new Set([
  'afd26c84f4d0608e11f301f3066f143b1949b61d6d787afc393193ce87963c01',
  'ab33553e53cf44a967a08abf6ca5d61e73db366d6619f7631c4eb6dadf9e710a',
  'fc6635ae4af9cc7835dc8c63255e98110ede9ae33c9e8bba3934882c8d5d6e04',
  'fb8528080a8164fd71fc2aef7beffca5045f6dd09b9a07d0711016ed0be7434d',
  '372110fedb835ebe4c2a43fc324e27e9bf62eb972646b87345a8e65db995e3c6'
]);
const ROOT = path.join(__dirname, '..', '..');
const SKIP = new Set(['node_modules', 'dist', '.git', 'reports', '__pycache__']);
const TEXT = /\.(js|mjs|cjs|html|css|md|json|py|yml|yaml|txt|webmanifest|svg)$/i;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

test('privacy: no organisation names, labels or template files in the repository', () => {
  const files = walk(ROOT, []);
  assert.deepEqual(files.filter((f) => /\.(docx|dotx|docm|dotm)$/i.test(f)).map((f) => path.relative(ROOT, f)), []);
  const hits = [];
  for (const f of files.filter((x) => TEXT.test(x) && !/package-lock\.json$/.test(x))) {
    const words = fs.readFileSync(f, 'utf8').toLowerCase().match(/[a-z_]+/g) || [];
    for (let i = 0; i < words.length; i++) {
      if (FORBIDDEN.has(sha(words[i])) || (i + 1 < words.length && FORBIDDEN.has(sha(words[i] + ' ' + words[i + 1])))) hits.push(path.relative(ROOT, f));
    }
  }
  assert.deepEqual([...new Set(hits)], []);
});

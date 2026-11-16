// Build: inline fonts, CSS and JavaScript into one dist/index.html, add a CSP with the script's hash,
// and copy the service worker, manifest and icons. No dependencies beyond Node itself.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');
const pkg = JSON.parse(src('package.json'));
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'icons'), { recursive: true });

// Core modules must load in dependency order (model needs dates, money, safe, text).
const CORE = ['safe', 'money', 'dates', 'text', 'csv', 'merge', 'diff', 'latex', 'model', 'dashboard'];
const core = CORE.map((n) => src(`src/core/${n}.js`)).join('\n');
const appFiles = readdirSync(join(root, 'src/app')).filter((f) => f.endsWith('.js')).sort();
const app = appFiles.map((f) => `/* ---- ${f} ---- */\n` + src(`src/app/${f}`)).join('\n');
const js = `${core}\n(function () {\n'use strict';\n${app}\n})();`;

const fontDir = join(root, 'node_modules/@fontsource/ibm-plex-sans/files');
const fontFace = (w) => `@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:${w};font-display:swap;src:url(data:font/woff2;base64,${readFileSync(join(fontDir, `ibm-plex-sans-latin-${w}-normal.woff2`)).toString('base64')}) format("woff2");}`;
const fonts = fontFace(400) + fontFace(600);

const scriptHash = createHash('sha256').update(js, 'utf8').digest('base64');
const csp = [
  "default-src 'self'",
  `script-src 'self' 'sha256-${scriptHash}'`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

let html = src('src/shell.html');

// Function-free replacement so "$&" in code is never treated as a pattern.
html = html.replace('{{CSP}}', () => csp).replace('{{FONTS}}', () => fonts).replace('{{APP_CSS}}', () => src('src/styles/app.css'))
  .replace('{{DOC_CSS}}', () => src('src/styles/doc.css')).replace('{{JS}}', () => js);
if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error('Unfilled placeholder in shell.html');
writeFileSync(join(out, 'index.html'), html);

const buildId = createHash('sha256').update(html).digest('hex').slice(0, 10);
writeFileSync(join(out, 'sw.js'), src('public/sw.js').replace('{{BUILD}}', `${pkg.version}-${buildId}`));
copyFileSync(join(root, 'public/manifest.webmanifest'), join(out, 'manifest.webmanifest'));
for (const f of readdirSync(join(root, 'public/icons'))) copyFileSync(join(root, 'public/icons', f), join(out, 'icons', f));
writeFileSync(join(out, '.nojekyll'), '');

const kb = (n) => (n / 1024).toFixed(1) + ' KB'; // 1 KB = 1,024 bytes
console.log(`dist/index.html ${kb(html.length)} (gzip ${kb(gzipSync(html).length)}), script ${kb(js.length)}, build ${pkg.version}-${buildId}`);

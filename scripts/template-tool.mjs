#!/usr/bin/env node
// WrapNote Word-template tool: the same audit and clean-up the app runs when a template is imported.
//
//   node scripts/template-tool.mjs audit    <file.docx>             counts, roles, fonts and privacy findings
//   node scripts/template-tool.mjs sanitize <in.docx> <out.docx>    remove personal and organisation data
//   node scripts/template-tool.mjs check                            audit WrapNote's own built-in template
//
// The report lists counts, style roles and font names only, never the text it found, so it can be shared.
// "check" builds the built-in office template, audits it, and exits with code 1 if a style role, a font
// declaration, a field or a page set-up value is missing, so a gap is caught before release.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const zip = require('../src/core/zip.js');
const ooxml = require('../src/core/ooxml.js');
const tpl = require('../src/core/officeTemplate.js');
const inflate = (b) => new Uint8Array(inflateRawSync(Buffer.from(b)));
const deflate = (b) => new Uint8Array(deflateRawSync(Buffer.from(b)));

async function read(file) {
  const raw = await zip.unzip(new Uint8Array(readFileSync(file)), inflate);
  const parts = {};
  for (const [n, v] of Object.entries(raw)) parts[n] = /\.(xml|rels)$/i.test(n) ? zip.fromUtf8(v) : v;
  return parts;
}
function print(a) {
  console.log(JSON.stringify({
    styles: a.styles, paragraphStyles: a.paragraphStyles, tableStyles: a.tableStyles, roles: a.roles, missingRoles: a.missingRoles,
    fonts: a.fonts, fontsNotDeclared: a.fontsNotDeclared, fontsNotInWord: a.fontsNotInWord, themeFonts: a.themeFonts, headingsNumbered: a.headingsNumbered,
    headers: a.headers, footers: a.footers, titlePg: a.titlePg, pageFields: a.pageFields, numPagesField: a.numPagesField, tocField: a.tocField,
    repeatHeaderRows: a.repeatHeaderRows, cantSplitRows: a.cantSplitRows, privacy: a.privacy
  }, null, 2));
}

const [cmd, a1, a2] = process.argv.slice(2);
try {
  if (cmd === 'audit' && a1) print(tpl.audit(await read(a1)));
  else if (cmd === 'sanitize' && a1 && a2) {
    const parts = await read(a1);
    const res = tpl.sanitize(parts, new Date().toISOString().replace(/\.\d+Z$/, 'Z'));
    const done = tpl.completeStyles(res.parts['word/styles.xml']);
    res.parts['word/styles.xml'] = done.xml;
    const audit = tpl.audit(res.parts);
    if (res.parts['word/fontTable.xml']) res.parts['word/fontTable.xml'] = tpl.completeFonts(res.parts['word/fontTable.xml'], audit.fonts).xml;
    const files = Object.entries(res.parts).map(([name, data]) => ({ name, data }));
    writeFileSync(a2, await zip.zip(files, deflate));
    console.log(JSON.stringify({ removed: res.removed, addedStyles: done.added, stillToReview: tpl.audit(res.parts).privacy }, null, 2));
  } else if (cmd === 'check') {
    const look = tpl.look(), hf = tpl.headerFooter({});
    const blocks = tpl.SECTIONS.map((s) => ({ t: 'p', style: 'Heading1', runs: [{ t: 'text', text: s[0] }] }));
    blocks.unshift({ t: 'toc', title: 'Table of Contents', instr: 'TOC \\o "1-3" \\h \\z \\u', entries: [] });
    blocks.push({ t: 'table', rows: [{ header: true, cells: [{ blocks: [] }, { blocks: [] }] }, { cells: [{ blocks: [] }, { blocks: [] }] }] });
    const parts = {};
    for (const p of ooxml.buildDocx({ look, page: { ...tpl.PAGE }, titlePg: true, header: hf.header, footer: hf.footer, blocks, props: tpl.props('', '2026-11-17T00:00:00Z') })) parts[p.name] = p.data;
    const a = tpl.audit(parts);
    const problems = [];
    if (a.missingRoles.length) problems.push('missing style roles: ' + a.missingRoles.join(', '));
    if (a.fontsNotDeclared.length) problems.push('fonts not declared in the font table: ' + a.fontsNotDeclared.join(', '));
    if (a.fontsNotInWord.length) problems.push('fonts Word may not have: ' + a.fontsNotInWord.join(', '));
    if (!a.headingsNumbered) problems.push('headings are not numbered by their styles');
    if (!a.titlePg || !a.pageFields || !a.numPagesField || !a.tocField) problems.push('different first page, PAGE, NUMPAGES or TOC field missing');
    if (!a.repeatHeaderRows || !a.cantSplitRows) problems.push('table rows do not repeat or may split');
    if (a.privacy.length) problems.push('privacy findings: ' + a.privacy.join('; '));
    print(a);
    console.log(problems.length ? 'PROBLEMS:\n- ' + problems.join('\n- ') : 'Built-in template: every role, font, field and table rule is present.');
    process.exit(problems.length ? 1 : 0);
  } else {
    console.log('Usage: template-tool.mjs audit <file.docx> | sanitize <in.docx> <out.docx> | check');
    process.exit(2);
  }
} catch (e) {
  console.error('Error: ' + e.message);
  process.exit(1);
}

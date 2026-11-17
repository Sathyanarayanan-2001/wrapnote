// WrapNote 1.2.0: Word export core (ZIP, Office Open XML writer, office template, template audit).
// Every expected value below was worked out by hand before running; all content is made up.
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const zip = require('../../src/core/zip.js');
const ooxml = require('../../src/core/ooxml.js');
const tpl = require('../../src/core/officeTemplate.js');

const deflate = (b) => new Uint8Array(zlib.deflateRawSync(Buffer.from(b)));
const inflate = (b) => new Uint8Array(zlib.inflateRawSync(Buffer.from(b)));
const P = (text, style, extra) => Object.assign({ t: 'p', style, runs: [{ t: 'text', text }] }, extra || {});

/** Minimal well-formedness check: every opened tag is closed in order. */
function wellFormed(xml) {
  const stack = [];
  const body = xml.replace(/<\?xml[^>]*\?>/, '');
  for (const m of body.matchAll(/<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g)) {
    if (m[4] === '/') continue;
    if (m[1]) { if (stack.pop() !== m[2]) return false; } else stack.push(m[2]);
  }
  return stack.length === 0;
}

function fixture(extra) {
  return Object.assign({
    look: ooxml.personalLook('IBM Plex Sans'), page: { w: 11906, h: 16838, top: 1440, right: 1440, bottom: 1440, left: 1440, header: 709, footer: 709 },
    blocks: [
      P('Report', 'Title'), P('Overview', 'Heading1', { bookmark: '_Tochabc' }),
      { t: 'p', runs: [{ t: 'text', text: 'Bold', b: true }, { t: 'text', text: ' & <italic>', i: true }, { t: 'fnref', text: 'Note one' }] },
      { t: 'p', style: 'ListParagraph', num: { id: 2, lvl: 0 }, runs: [{ t: 'text', text: 'Bullet' }] },
      { t: 'p', style: 'ListParagraph', num: { id: 3, lvl: 0 }, runs: [{ t: 'text', text: 'Step' }] },
      { t: 'table', rows: [{ header: true, cells: [{ blocks: [P('Term', 'TableText')] }, { blocks: [P('Meaning', 'TableText')] }] }, { cells: [{ blocks: [P('A', 'TableText')] }, { blocks: [] }] }] },
      { t: 'toc', title: 'Contents', instr: 'TOC \\o "1-3" \\h \\z \\u', entries: [{ lvl: 1, text: 'Overview', page: '1', anchor: '_Tochabc' }] },
      { t: 'p', style: 'Caption', runs: [{ t: 'text', text: 'Figure ' }, { t: 'field', instr: 'SEQ Figure \\* ARABIC', result: '1' }, { t: 'text', text: ': Plan' }] }
    ],
    lists: 1, props: { title: 'Report', creator: '', category: 'General', created: '2026-11-17T00:00:00Z', modified: '2026-11-17T00:00:00Z' }
  }, extra || {});
}
const part = (parts, name) => parts.find((p) => p.name === name).data;

test('zip: CRC-32 of "123456789" is CBF43926 (the standard check value)', () => {
  assert.equal(zip.crc32(zip.utf8('123456789')).toString(16).toUpperCase(), 'CBF43926');
});

test('zip: write then read gives back every part byte for byte, compressed or stored', async () => {
  const files = [{ name: 'a.xml', data: '<a>' + 'x'.repeat(500) + '</a>' }, { name: 'b/c.bin', data: new Uint8Array([0, 1, 2, 255]) }];
  const out = await zip.zip(files, deflate);
  const back = await zip.unzip(out, inflate);
  assert.deepEqual(Object.keys(back).sort(), ['a.xml', 'b/c.bin']);
  assert.equal(zip.fromUtf8(back['a.xml']), files[0].data);
  assert.deepEqual(Array.from(back['b/c.bin']), [0, 1, 2, 255]);
  // The 500 x's compress: the archive is smaller than the raw text alone.
  assert.ok(out.length < 500);
});

test('zip: hostile or broken input is refused with a clear message', async () => {
  await assert.rejects(zip.unzip(new Uint8Array([1, 2, 3]), inflate), /not a Word \(\.docx\) file/);
  assert.throws(() => zip.zip([{ name: '../evil', data: 'x' }]), /Bad part name/);
  assert.throws(() => zip.zip([{ name: 'a', data: 'x' }, { name: 'a', data: 'y' }]), /Duplicate part name/);
});

test('ooxml: colours and fonts map the way Word expects', () => {
  assert.equal(ooxml.hex('rgb(226, 240, 217)'), 'E2F0D9');
  assert.equal(ooxml.hex('#abc'), 'AABBCC');
  assert.equal(ooxml.hex('rgba(0, 0, 0, 0)'), '');
  assert.equal(ooxml.mapFont('"IBM Plex Sans", Calibri, sans-serif'), 'Arial');
  assert.equal(ooxml.mapFont('verdana'), 'Verdana');
  assert.equal(ooxml.mmToTw(25.4), 1440); // 1 inch = 1440 twips
});

test('ooxml: a document has styles, real numbering, table borders, repeating header rows and fields', () => {
  const parts = ooxml.buildDocx(fixture());
  const doc = part(parts, 'word/document.xml'), styles = part(parts, 'word/styles.xml');
  for (const p of parts) if (typeof p.data === 'string') assert.ok(wellFormed(p.data), p.name + ' is well formed');
  assert.match(doc, /<w:pStyle w:val="Title"\/>/);
  assert.match(doc, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(doc, /<w:b\/>/); assert.match(doc, /<w:i\/>/);
  assert.match(doc, / &amp; &lt;italic&gt;/);
  assert.match(doc, /<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="2"\/><\/w:numPr>/);
  assert.ok(!doc.includes('•'));
  assert.match(doc, /<w:trPr><w:cantSplit\/><w:tblHeader\/><\/w:trPr>/);
  assert.match(styles, /<w:style w:type="table" w:styleId="WNTable">[\s\S]*<w:tblBorders>/);
  assert.ok(doc.includes('TOC \\o "1-3" \\h \\z \\u'));
  assert.ok(doc.includes('SEQ Figure \\* ARABIC'));
  assert.match(doc, /<w:hyperlink w:anchor="_Tochabc"/);
  assert.match(doc, /<w:footnoteReference w:id="1"\/>/);
  assert.match(part(parts, 'word/footnotes.xml'), /Note one/);
  // An empty cell still ends with a paragraph.
  assert.match(doc, /<w:tcW w:w="\d+" w:type="dxa"\/><\/w:tcPr><w:p\/><\/w:tc>/);
});

test('ooxml: page colour, border, watermark, tracked changes and comments are written', () => {
  const m = fixture({ watermark: { text: 'DRAFT', angle: -40, opacity: 0.12 }, comments: [{ id: 0, author: 'A. Rao', date: '2026-11-17T09:00:00Z', text: 'Check' }] });
  m.page.color = '#E2F0D9'; m.page.border = { style: 'solid', color: '#334155', width: 2, kind: 'box' };
  m.blocks.push({ t: 'p', runs: [{ t: 'commentStart', id: 0 }, { t: 'text', text: 'new', ins: { author: 'A. Rao', date: '2026-11-17T09:00:00Z' } }, { t: 'text', text: 'old', del: { author: 'A. Rao' } }, { t: 'commentEnd', id: 0 }] });
  const parts = ooxml.buildDocx(m);
  const doc = part(parts, 'word/document.xml');
  assert.match(doc, /<w:background w:color="E2F0D9"\/>/);
  assert.match(part(parts, 'word/settings.xml'), /<w:displayBackgroundShape\/>/);
  assert.match(doc, /<w:pgBorders w:offsetFrom="page"><w:top w:val="single" w:sz="12"/); // 2 px × 6 = 12 eighths of a point
  assert.match(doc, /<w:ins w:id="\d+" w:author="A. Rao" w:date="2026-11-17T09:00:00Z">/);
  assert.match(doc, /<w:del w:id="\d+" w:author="A. Rao"><w:r><w:delText xml:space="preserve">old<\/w:delText>/);
  assert.match(part(parts, 'word/comments.xml'), /w:author="A. Rao"[\s\S]*Check/);
  assert.match(parts.filter((p) => /header\d\.xml/.test(p.name)).map((p) => p.data).join(''), /string="DRAFT"/);
});

test('ooxml: equations become Office Math (fraction, power, sum with limits)', () => {
  const frac = ooxml.omml({ n: 'mfrac', c: [{ n: 'mi', t: 'a' }, { n: 'mn', t: '2' }] });
  assert.match(frac, /^<m:f><m:num>.*a.*<\/m:num><m:den>.*2.*<\/m:den><\/m:f>$/);
  assert.match(ooxml.omml({ n: 'msup', c: [{ n: 'mi', t: 'x' }, { n: 'mn', t: '2' }] }), /<m:sSup><m:e>.*x.*<\/m:e><m:sup>.*2.*<\/m:sup><\/m:sSup>/);
  const sum = ooxml.omml({ n: 'munderover', c: [{ n: 'mo', t: '∑' }, { n: 'mi', t: 'i' }, { n: 'mi', t: 'n' }] });
  assert.match(sum, /<m:nary><m:naryPr><m:chr m:val="∑"\/><\/m:naryPr><m:sub>.*i.*<\/m:sub><m:sup>.*n.*<\/m:sup><m:e\/><\/m:nary>/);
});

test('office template: page set-up, neutral properties, header and footer contents', () => {
  // 11906 − 1138 − 1138 = 9630 twips of text width; 2477 twips × 25.4 / 1440 = 43.69 mm.
  assert.equal(tpl.look().textWidth, 9630);
  assert.equal(tpl.PAGE_MM.t, 43.69);
  const p = tpl.props('', '2026-11-17T00:00:00Z');
  assert.deepEqual([p.title, p.subject, p.creator, p.company, p.manager, p.category], ['Generic Office Document Template', 'Brand-neutral controlled document template', '', '', '', 'Office Template']);
  const hf = tpl.headerFooter({ reviewer: '  ' });
  const parts = ooxml.buildDocx({ look: tpl.look(), page: Object.assign({}, tpl.PAGE), titlePg: true, header: hf.header, footer: hf.footer, blocks: [P('Purpose', 'Heading1')], props: p });
  const all = parts.filter((x) => /word\/(header|footer)\d\.xml/.test(x.name)).map((x) => x.data).join('');
  assert.ok(all.includes(' PAGE ') && all.includes(' NUMPAGES '));
  assert.ok(all.includes('[REVIEWER]')); // blank values fall back to their placeholder
  assert.ok(all.includes('[APPROVED FOOTER NOTICE]') && all.includes('[APPROVED COPYRIGHT OR LEGAL NOTICE]'));
  const doc = part(parts, 'word/document.xml');
  assert.match(doc, /<w:titlePg\/>/);
  assert.match(doc, /<w:pgMar w:top="2477" w:right="1138" w:bottom="1181" w:left="1138" w:header="709" w:footer="850"/);
  assert.match(part(parts, 'word/styles.xml'), /w:styleId="Heading1">[\s\S]*?<w:numPr><w:ilvl w:val="0"\/><w:numId w:val="1"\/><\/w:numPr>/);
  assert.match(part(parts, 'docProps/core.xml'), /<dc:creator><\/dc:creator>[\s\S]*<cp:category>Office Template<\/cp:category>/);
});

test('office template: the new document has ten numbered sections in the standard order and no typed numbers', () => {
  const html = tpl.newHtml();
  const heads = [...html.matchAll(/<h1>([^<]*)<\/h1>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['Revision History', 'Purpose', 'Scope', 'Definitions and Abbreviations', 'Roles and Responsibilities', 'Main Content', 'Requirements or Procedure', 'Records and Evidence', 'References', 'Appendices']);
  assert.ok(!/<h1>\d/.test(html));
  assert.ok(/data-source="headings" data-levels="3"/.test(html));
  // Only square-bracket placeholders: no names, logos or legal text.
  assert.ok(!/<img|https?:/.test(html));
});

test('office template: heading numbers follow Word, including a skipped level', () => {
  // Hand-worked and checked against a rendered Word file: H1, H3, H2, H1, H2, H3 → 1, 1.1.1, 1.2, 2, 2.1, 2.1.1.
  assert.deepEqual(tpl.headingNumbers([1, 3, 2, 1, 2, 3]), ['1', '1.1.1', '1.2', '2', '2.1', '2.1.1']);
  assert.equal(tpl.stripTypedNumber('2 Purpose'), 'Purpose');
  assert.equal(tpl.stripTypedNumber('3.1. Scope'), 'Scope');
  assert.equal(tpl.stripTypedNumber('2026 budget'), '2026 budget'); // a year is text, not a heading number
});

test('template tool: audit finds personal data and missing roles; sanitize removes it and adds missing styles', () => {
  const parts = {
    'word/document.xml': '<w:document><w:body><w:p><w:ins w:id="1" w:author="X"><w:r><w:t>kept</w:t></w:r></w:ins><w:del w:id="2" w:author="X"><w:r><w:delText>gone</w:delText></w:r></w:del><w:commentRangeStart w:id="0"/></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="900" w:bottom="800" w:left="900" w:header="500" w:footer="500"/><w:titlePg/></w:sectPr></w:body></w:document>',
    'word/styles.xml': '<w:styles><w:style w:type="paragraph" w:styleId="Standard"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Corporate Sans" w:hAnsi="Corporate Sans"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="berschrift1"><w:name w:val="heading 1"/><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style></w:styles>',
    'word/header1.xml': '<w:hdr><w:p><w:r><w:t>Example Corp Ltd</w:t></w:r><w:r><w:t>[DOCUMENT ID]</w:t></w:r></w:p></w:hdr>',
    'word/settings.xml': '<w:settings><w:rsids><w:rsidRoot w:val="00AB"/></w:rsids><w:attachedTemplate r:id="rId1"/></w:settings>',
    'docProps/core.xml': '<cp:coreProperties><dc:creator>Jane Example</dc:creator></cp:coreProperties>',
    'docProps/custom.xml': '<Properties>label</Properties>',
    'word/media/image1.png': new Uint8Array([1, 2, 3]),
    'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    '[Content_Types].xml': '<Types><Override PartName="/docProps/custom.xml" ContentType="x"/><Override PartName="/word/styles.xml" ContentType="y"/></Types>'
  };
  const a = tpl.audit(parts);
  assert.equal(a.roles.Heading1, 'berschrift1');
  assert.equal(a.roles.Normal, 'Standard');
  assert.ok(a.missingRoles.includes('caption') && a.missingRoles.includes('toc 1'));
  assert.deepEqual(a.fontsNotInWord, ['Corporate Sans']);
  for (const f of ['Author name in document properties', 'Tracked changes', 'Comments', 'Revision save IDs (rsids)', 'Path of an attached template']) assert.ok(a.privacy.includes(f), f);
  assert.ok(a.privacy.some((x) => /embedded picture/.test(x)) && a.privacy.some((x) => /custom XML/.test(x)) && a.privacy.some((x) => /not a \[PLACEHOLDER\] \(3 word/.test(x)));
  const s = tpl.sanitize(parts, '2026-11-17T00:00:00Z').parts;
  assert.ok(!s['word/media/image1.png'] && !s['docProps/custom.xml']);
  assert.ok(!/image1/.test(s['word/_rels/document.xml.rels']) && /styles\.xml/.test(s['word/_rels/document.xml.rels']));
  assert.ok(!/custom\.xml/.test(s['[Content_Types].xml']));
  assert.ok(s['word/document.xml'].includes('kept') && !s['word/document.xml'].includes('gone') && !/commentRange|w:ins|w:del/.test(s['word/document.xml']));
  assert.ok(!/rsids|attachedTemplate/.test(s['word/settings.xml']));
  assert.ok(/<dc:creator><\/dc:creator>/.test(s['docProps/core.xml']) && !s['docProps/core.xml'].includes('Jane'));
  const done = tpl.completeStyles(s['word/styles.xml']);
  assert.ok(done.added.includes('caption') && done.added.includes('toc 1') && !done.added.includes('heading 1'));
  assert.equal(done.map.Heading1, 'berschrift1');
  assert.deepEqual(tpl.completeFonts('<w:fonts></w:fonts>', ['Corporate Sans', 'Verdana']).added, ['Corporate Sans', 'Verdana']);
  assert.deepEqual([tpl.pageOf(parts['word/document.xml']).top, tpl.pageOf(parts['word/document.xml']).titlePg], [1000, true]);
});

test('template tool: table-cell properties out of schema order are repaired, nothing else changes', () => {
  const bad = '<w:tc><w:tcPr><w:tcW w:w="100" w:type="dxa"/><w:vAlign w:val="center"/><w:tcBorders><w:top w:val="single"/></w:tcBorders><w:shd w:fill="D9D9D9"/></w:tcPr><w:p/></w:tc>';
  const r = tpl.fixCellOrder(bad);
  assert.equal(r.fixed, 1);
  assert.equal(r.xml, '<w:tc><w:tcPr><w:tcW w:w="100" w:type="dxa"/><w:tcBorders><w:top w:val="single"/></w:tcBorders><w:shd w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr><w:p/></w:tc>');
  assert.equal(tpl.fixCellOrder(r.xml).fixed, 0);
});

test('zip: the fast CRC-32 equals Node zlib.crc32 for every length from 0 to 70 bytes and for 1 MB', () => {
  // Second method: Node's own zlib implementation, compared on lengths that hit every remainder of the 8-byte loop.
  const big = new Uint8Array(1 << 20); for (let i = 0; i < big.length; i++) big[i] = (i * 2654435761) >>> 24;
  for (let n = 0; n <= 70; n++) assert.equal(zip.crc32(big.subarray(0, n)), zlib.crc32(Buffer.from(big.subarray(0, n))), 'length ' + n);
  assert.equal(zip.crc32(big), zlib.crc32(Buffer.from(big)));
});

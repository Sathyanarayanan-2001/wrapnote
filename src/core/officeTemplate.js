/* WrapNote core: the built-in "Office document" template and the Word-template audit and clean-up tool.
 *
 * The built-in template is a brand-neutral controlled document: a classification line and a 3 × 2 control
 * table in the header (with PAGE and NUMPAGES fields), a different first-page footer with the author,
 * reviewer, source and approver, a cover page, revision history, a table of contents and ten numbered
 * sections. Every value below was measured from a neutral reference layout and is written here from scratch:
 * no part of any company's file is copied, and all text is a square-bracket placeholder.
 *
 * The same module audits and cleans a Word template someone imports (in the app, or with
 * scripts/template-tool.mjs): it lists missing style roles and fonts, finds personal and organisation
 * data (authors, labels, pictures, comments, tracked changes, custom XML), removes it, and adds any
 * missing style so exports never fall back to plain text. The checks run on the device; nothing is uploaded.
 */
(function (g) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  // The XML writer is part of the Word engine, loaded on first export; it is fetched only by functions that need it.
  function ox() { return isNode ? require('./ooxml.js') : g.WN.ooxml; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- Built-in office template ---------- */

  // Page: A4, 11906 × 16838 twips; margins top 2477, left and right 1138, bottom 1181; header 709 and footer 850 from the edge.
  var PAGE = { w: 11906, h: 16838, top: 2477, right: 1138, bottom: 1181, left: 1138, header: 709, footer: 850 };
  var TW_PER_MM = 1440 / 25.4;
  function twToMm(tw) { return Math.round(tw / TW_PER_MM * 100) / 100; }
  // The same page in millimetres for the on-screen layout: 2477 × 25.4 / 1440 = 43.69; 20.07, 20.83, 20.07.
  var PAGE_MM = { t: twToMm(PAGE.top), r: twToMm(PAGE.right), b: twToMm(PAGE.bottom), l: twToMm(PAGE.left), header: twToMm(PAGE.header), footer: twToMm(PAGE.footer) };

  var FIELDS = [
    ['classification', 'Classification', '[CLASSIFICATION]'], ['logo', 'Logo text', '[APPROVED LOGO]'], ['organization', 'Organisation', '[ORGANIZATION]'],
    ['docType', 'Document type', '[DOCUMENT TYPE]'], ['docTitle', 'Document title (header)', '[DOCUMENT TITLE]'], ['docId', 'Document ID', '[DOCUMENT ID]'],
    ['revision', 'Revision', '[REVISION]'], ['language', 'Language', '[LANGUAGE]'], ['author', 'Author', '[AUTHOR]'], ['reviewer', 'Reviewer', '[REVIEWER]'],
    ['source', 'Source / reference', '[SOURCE / REFERENCE]'], ['approver', 'Approver', '[APPROVER]'],
    ['legalNotice', 'First-page notice', '[APPROVED COPYRIGHT OR LEGAL NOTICE]'], ['footerNotice', 'Footer notice (later pages)', '[APPROVED FOOTER NOTICE]']
  ];
  function defaults() { var o = {}; FIELDS.forEach(function (f) { o[f[0]] = f[2]; }); return o; }
  /** Fill missing or blank values with their placeholders; trim and cap the rest. */
  function clean(f) {
    var o = defaults(); f = f || {};
    FIELDS.forEach(function (x) { var v = String(f[x[0]] == null ? '' : f[x[0]]).trim().slice(0, 200); if (v) o[x[0]] = v; });
    return o;
  }

  function look() {
    var textWidth = PAGE.w - PAGE.left - PAGE.right; // 9630 twips = 169.86 mm
    return {
      id: 'office', bodyFont: 'Verdana', headingFont: 'Verdana', majorFont: 'Calibri Light', minorFont: 'Calibri',
      size: 20, color: '000000', headingColor: '000000', accent: '1F4E79', bodyStyle: 'BodyText',
      normal: { after: 160, line: 259 },
      headings: [{ size: 28, before: 240, after: 180, line: 240 }, { size: 24, before: 360, after: 140, line: 288 }, { size: 22, before: 240, after: 200, line: 240 }, { size: 20, before: 160, after: 80 }],
      title: { size: 40, before: 360, after: 120, center: true }, subtitle: { size: 32, color: '000000', after: 120, center: true, bold: true },
      numbered: true, tocBold: true,
      toc: [{ left: 1191, hanging: 624, numTab: 1191, after: 100 }, { left: 1191, hanging: 624, numTab: 1191, after: 100 }, { left: 1928, hanging: 737, numTab: 1928, after: 100 }],
      table: { border: '808080', size: 20, headerBold: true, headerFill: '', cellMargin: 108 },
      hfSize: 20, textWidth: textWidth
    };
  }

  function P(text, o) { o = o || {}; return { t: 'p', style: o.style, align: o.align, spacing: o.spacing, runs: [].concat(text).map(function (x) { return typeof x === 'string' ? { t: 'text', text: x, b: o.b } : x; }) }; }
  function cell(blocks, o) { o = o || {}; return { blocks: blocks, fill: o.fill, valign: o.valign || 'center', span: o.span }; }

  /** Header and footer blocks for the ooxml writer. pageNum: show "Page: PAGE / NUMPAGES". */
  function headerFooter(fields) {
    var f = clean(fields);
    var H = { style: 'Header' };
    var head = [
      P('Classification: ' + f.classification, { style: 'Header', align: 'center', b: true, spacing: { after: 60 } }),
      { t: 'table', cols: [3211, 3211, 3211], width: 9633, style: 'TableGrid', align: 'center', borderColor: '000000', borderSize: 8, rows: [
        { cells: [cell([P(f.logo, { style: 'Header', align: 'center', b: true })]), cell([P(f.docType, { style: 'Header', align: 'center' })]),
          cell([P('Doc.: ' + f.docId, H), P('Rev.: ' + f.revision, H)])] },
        { cells: [cell([P(f.organization, { style: 'Header', align: 'center', b: true })]), cell([P(f.docTitle, { style: 'Header', align: 'center', b: true })], { fill: 'D9D9D9' }),
          cell([P(['Page: ', { t: 'field', instr: 'PAGE', result: '1' }, ' / ', { t: 'field', instr: 'NUMPAGES', result: '1' }], H)])] }
      ] }
    ];
    var B = function (t) { return [P(t, { style: 'Footer', b: true })]; }, N = function (t) { return [P(t, { style: 'Footer' })]; };
    var firstFoot = [
      { t: 'table', cols: [2408, 2408, 2408, 2408], width: 9632, style: 'TableGrid', align: 'center', borderColor: '808080', borderSize: 4, rows: [
        { cells: [cell(B('Language:')), cell(N(f.language)), cell(N('')), cell(N(''))] },
        { cells: [cell(B('Author:')), cell(N(f.author)), cell(B('Reviewer:')), cell(N(f.reviewer))] },
        { cells: [cell(B('Source:')), cell(N(f.source)), cell(B('Approver:')), cell(N(f.approver))] }
      ] },
      P(f.legalNotice, { style: 'Footer', align: 'center', b: true, spacing: { before: 60 } })
    ];
    var laterFoot = [P(f.footerNotice, { style: 'Footer', align: 'center' })];
    return { titlePg: true, header: { default: head, first: head }, footer: { default: laterFoot, first: firstFoot } };
  }

  /** Neutral document properties the template prompt requires; creator and company stay blank. */
  function props(title, isoNow) {
    return { title: title || 'Generic Office Document Template', subject: 'Brand-neutral controlled document template', creator: '', keywords: '', description: '',
      lastModifiedBy: '', category: 'Office Template', created: isoNow, modified: isoNow, manager: '', company: '', template: 'Normal.dotm' };
  }

  var SECTIONS = [
    ['Purpose', 'State the purpose, scope, and intended audience.', null],
    ['Scope', 'Define what is included and excluded.', null],
    ['Definitions and Abbreviations', 'List terms required to understand the document.', ['Term', 'Definition'], 3],
    ['Roles and Responsibilities', 'Describe accountable roles and responsibilities.', ['Role', 'Responsibility', 'Accountability'], 3],
    ['Main Content', 'Insert the approved subject-specific content here.', null],
    ['Requirements or Procedure', 'Document requirements, process steps, or controls.', ['Step / Requirement', 'Description', 'Owner', 'Evidence'], 4],
    ['Records and Evidence', 'Specify records, evidence, and retention expectations.', null],
    ['References', 'List approved source documents and standards.', ['Reference', 'Title', 'Owner / Location'], 3],
    ['Appendices', 'Add supporting tables, figures, or forms.', null]
  ];
  function htmlTable(head, rows, cls) {
    var x = '<table class="wn-table wn-off-table' + (cls ? ' ' + cls : '') + '"><thead><tr>' + head.map(function (hd) { return '<th>' + esc(hd) + '</th>'; }).join('') + '</tr></thead><tbody>';
    for (var r = 0; r < rows; r++) x += '<tr>' + head.map(function () { return '<td>[Enter information]</td>'; }).join('') + '</tr>';
    return x + '</tbody></table>';
  }
  /**
   * The editable body of a new office document. Heading numbers are never typed: the editor numbers
   * h1–h3 itself (shown with CSS) and Word numbers them from the heading styles.
   */
  function newHtml() {
    var attr = [['Document type', '[DOCUMENT TYPE]', 'Document ID', '[DOCUMENT ID]'], ['Revision', '[REVISION]', 'Status', '[STATUS]'], ['Prepared by', '[AUTHOR]', 'Function', '[FUNCTION]'],
      ['Classification', '[CLASSIFICATION]', 'Effective date', '[DATE]'], ['Owner', '[OWNER]', 'Approver', '[APPROVER]']];
    var x = '<p class="wn-title wn-off-title">[DOCUMENT TITLE]</p><p class="wn-subtitle wn-off-subtitle">[DOCUMENT TYPE / SUBTITLE]</p>' +
      '<p class="wn-off-attrs">[DOCUMENT IDENTIFIER] | Revision [REVISION] | [DATE]</p>' +
      '<table class="wn-table wn-off-table wn-off-attr"><tbody>' + attr.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + '</th><td>' + esc(r[1]) + '</td><th scope="row">' + esc(r[2]) + '</th><td>' + esc(r[3]) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<div class="wn-pagebreak" contenteditable="false"></div>' +
      '<h1>Revision History</h1>' + htmlTable(['Revision', 'Date', 'Author', 'Description', 'Status'], 2) +
      '<nav class="wn-toc" contenteditable="false" data-source="headings" data-levels="3" data-mode="auto"><p class="wn-toc-title">Table of Contents</p><ol></ol></nav>';
    SECTIONS.forEach(function (s) {
      x += '<h1>' + esc(s[0]) + '</h1><p>' + esc(s[1]) + '</p>' + (s[2] ? htmlTable(s[2], s[3]) : '<p>[Enter approved content]</p>');
    });
    return x;
  }

  /** Heading numbers in document order: h1 → "1", h2 → "1.1", h3 → "1.1.1". A skipped level counts as 1 and stays
   * used (Heading 1, Heading 3, Heading 2 gives 1, 1.1.1, 1.2), which is how the rendered Word numbering behaves. */
  function headingNumbers(levels) {
    var c = [0, 0, 0];
    return levels.map(function (l) {
      if (!(l >= 1 && l <= 3)) return '';
      for (var k = 0; k < l - 1; k++) if (!c[k]) c[k] = 1;
      c[l - 1]++; for (var i = l; i < 3; i++) c[i] = 0;
      return c.slice(0, l).join('.');
    });
  }
  /** Typed numbers at the start of a heading ("2 Purpose", "3.1. Scope") that office numbering replaces. */
  function stripTypedNumber(text) { return String(text).replace(/^\s*\d{1,2}(?:\.\d{1,2}){0,3}\.?\s+(?=\S)/, ''); } // 1–2 digits per part, so "2026 budget" stays

  /** Turn a new blank document into an office document: template, document-control fields, page set-up, body. */
  function setupDoc(doc) {
    doc.template = 'office';
    doc.office = defaults();
    doc.category = 'Controlled documents';
    var L = doc.layout;
    L.size = 'A4'; L.orientation = 'portrait'; L.margins = 'custom';
    L.custom = { t: PAGE_MM.t, r: PAGE_MM.r, b: PAGE_MM.b, l: PAGE_MM.l };
    // The header table already shows "Page: X / Y", so the separate page number is off.
    L.pageNumbers.show = false;
    doc.html = newHtml();
    return doc;
  }
  /** Switch an existing document between the personal look and the office template. */
  function switchTemplate(doc, to) {
    doc.template = to === 'office' ? 'office' : 'personal';
    if (to === 'office') {
      doc.office = clean(doc.office);
      doc.layout.margins = 'custom'; doc.layout.custom = { t: PAGE_MM.t, r: PAGE_MM.r, b: PAGE_MM.b, l: PAGE_MM.l }; doc.layout.pageNumbers.show = false;
    } else {
      doc.layout.margins = 'normal'; doc.layout.pageNumbers.show = true;
    }
    return doc;
  }

  /* ---------- Template audit and clean-up ---------- */

  // The style roles WrapNote writes, with the built-in Word name each one is matched by.
  var ROLES = [
    ['Normal', 'Normal'], ['Heading1', 'heading 1'], ['Heading2', 'heading 2'], ['Heading3', 'heading 3'], ['Heading4', 'heading 4'], ['Title', 'Title'], ['Subtitle', 'Subtitle'],
    ['Quote', 'Quote'], ['Caption', 'caption'], ['ListParagraph', 'List Paragraph'], ['TOCHeading', 'TOC Heading'], ['TOC1', 'toc 1'], ['TOC2', 'toc 2'], ['TOC3', 'toc 3'],
    ['TableofFigures', 'table of figures'], ['Header', 'header'], ['Footer', 'footer'], ['FootnoteText', 'footnote text'], ['FootnoteReference', 'footnote reference'],
    ['CommentText', 'annotation text'], ['CommentReference', 'annotation reference'], ['Hyperlink', 'Hyperlink'], ['TableGrid', 'Table Grid'], ['BodyText', 'Body Text'], ['TableText', 'Table Text'], ['WNTable', 'WrapNote Table']
  ];

  function str(parts, name) { var v = parts[name]; return v == null ? '' : typeof v === 'string' ? v : (g.WN && g.WN.zip ? g.WN.zip.fromUtf8(v) : require('./zip.js').fromUtf8(v)); }
  function styleList(stylesXml) {
    var out = [];
    String(stylesXml).replace(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g, function (all, attrs, body) {
      var id = (/w:styleId="([^"]*)"/.exec(attrs) || [])[1], type = (/w:type="([^"]*)"/.exec(attrs) || [])[1], name = (/<w:name w:val="([^"]*)"/.exec(body) || [])[1];
      var fonts = []; body.replace(/w:(?:ascii|hAnsi)="([^"]+)"/g, function (a, f) { fonts.push(f); return a; });
      out.push({ id: id, type: type, name: name || id, xml: all, numbered: /<w:numPr>/.test(body), fonts: fonts });
      return all;
    });
    return out;
  }
  function roleMap(styles) {
    var byName = {}; styles.forEach(function (s) { byName[String(s.name).toLowerCase()] = s.id; });
    var map = {};
    ROLES.forEach(function (r) { var id = byName[r[1].toLowerCase()]; if (id) map[r[0]] = id; });
    return map;
  }

  var PERSONAL_TAGS = [
    [/<dc:creator>[^<]+<\/dc:creator>/, 'Author name in document properties'], [/<cp:lastModifiedBy>[^<]+<\/cp:lastModifiedBy>/, 'Last-modified-by name in document properties'],
    [/<Company>[^<]+<\/Company>/, 'Company in document properties'], [/<Manager>[^<]+<\/Manager>/, 'Manager in document properties']
  ];

  /**
   * Audit a template given as { partName: string | bytes }. Returns plain findings with counts and roles only,
   * never the text of the findings, so a report can be shared without leaking what it found.
   */
  function audit(parts) {
    var names = Object.keys(parts);
    var styles = styleList(str(parts, 'word/styles.xml'));
    var map = roleMap(styles);
    var doc = str(parts, 'word/document.xml');
    var hf = names.filter(function (n) { return /^word\/(header|footer)\d*\.xml$/.test(n); }).map(function (n) { return str(parts, n); }).join('');
    var all = doc + hf;
    var theme = str(parts, 'word/theme/theme1.xml'), fontTable = str(parts, 'word/fontTable.xml');
    var core = str(parts, 'docProps/core.xml'), app = str(parts, 'docProps/app.xml'), settings = str(parts, 'word/settings.xml');
    var used = new Set();
    styles.forEach(function (s) { s.fonts.forEach(function (f) { used.add(f); }); });
    (all.match(/w:(?:ascii|hAnsi)="([^"]+)"/g) || []).forEach(function (m) { used.add(m.replace(/^.*="|"$/g, '')); });
    var themeFonts = []; theme.replace(/<a:(?:major|minor)Font><a:latin typeface="([^"]*)"/g, function (a, f) { if (f) themeFonts.push(f); return a; });
    themeFonts.forEach(function (f) { used.add(f); });
    var declared = new Set(); fontTable.replace(/<w:font w:name="([^"]+)"/g, function (a, f) { declared.add(f); return a; });
    var fonts = Array.from(used).sort();
    var findings = [];
    PERSONAL_TAGS.forEach(function (p) { if (p[0].test(core + app)) findings.push(p[1]); });
    var media = names.filter(function (n) { return /^word\/media\//.test(n); }).length;
    if (media) findings.push(media + ' embedded picture(s), for example logos');
    var custom = names.filter(function (n) { return /^customXml\//.test(n) || n === 'docProps/custom.xml'; }).length;
    if (custom) findings.push(custom + ' custom XML or custom property part(s), for example sensitivity labels');
    if (names.some(function (n) { return /vbaProject/.test(n); })) findings.push('Macros (vbaProject)');
    if (names.some(function (n) { return /^word\/comments/.test(n); }) || /<w:comment(Reference|RangeStart)\b/.test(all)) findings.push('Comments');
    if (/<w:ins\b|<w:del\b/.test(all)) findings.push('Tracked changes');
    if (/<w:rsids>/.test(settings)) findings.push('Revision save IDs (rsids)');
    if (/docId/.test(settings)) findings.push('Document IDs in settings');
    if (/<w:attachedTemplate/.test(settings)) findings.push('Path of an attached template');
    if (/<w:(writeProtection|documentProtection)\b/.test(settings)) findings.push('Write protection or editing restrictions');
    var rels = names.filter(function (n) { return /\.rels$/.test(n); }).map(function (n) { return str(parts, n); }).join('');
    var ext = (rels.match(/TargetMode="External"/g) || []).length;
    if (ext) findings.push(ext + ' external link(s) or remote resource(s)');
    // Literal (non-placeholder) words in headers and footers are likely organisation data.
    var hfText = (hf.match(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join(' ');
    var literal = hfText.replace(/\[[^\]]*\]/g, ' ').replace(/\b(Page|Doc|Rev|Classification|Language|Author|Reviewer|Source|Approver|of)\b[.:]?/gi, ' ').replace(/\b\d+\b/g, ' ').replace(/[\s\/|:.,-]+/g, ' ').trim(); // digits are cached page-number field results
    if (literal) findings.push('Header or footer text that is not a [PLACEHOLDER] (' + literal.split(' ').length + ' word(s))');
    // Company-specific style names usually carry an upper-case prefix ("AB-Table") or an all-capitals word, or say "corporate".
    var nonNeutral = styles.filter(function (s) { return (/^[A-Z]{2,4}[-_]|^[A-Z]{5,}\b/.test(s.name) || /corporate|company/i.test(s.name)) && !/^(TOC|HTML)\b/.test(s.name); }).length;
    if (nonNeutral) findings.push(nonNeutral + ' style name(s) that look company-specific');
    var missingRoles = ROLES.filter(function (r) { return !map[r[0]]; }).map(function (r) { return r[1]; });
    var notInWord = fonts.filter(function (f) { return ox().WORD_FONTS.indexOf(f) < 0 && !/^\+/.test(f) && f !== 'Symbol' && f !== 'Wingdings' && f !== 'Cambria Math'; });
    return {
      styles: styles.length, paragraphStyles: styles.filter(function (s) { return s.type === 'paragraph'; }).length, tableStyles: styles.filter(function (s) { return s.type === 'table'; }).length,
      roles: map, missingRoles: missingRoles, fonts: fonts, fontsNotDeclared: fonts.filter(function (f) { return !declared.has(f) && !/^\+/.test(f); }), fontsNotInWord: notInWord,
      themeFonts: themeFonts, headingsNumbered: ['Heading1', 'Heading2', 'Heading3'].every(function (r) { var s = styles.filter(function (x) { return x.id === map[r]; })[0]; return s && s.numbered; }),
      headers: names.filter(function (n) { return /^word\/header\d*\.xml$/.test(n); }).length, footers: names.filter(function (n) { return /^word\/footer\d*\.xml$/.test(n); }).length,
      titlePg: /<w:titlePg\/>/.test(doc), pageFields: /PAGE\b/.test(hf), numPagesField: /NUMPAGES/.test(hf), tocField: /TOC \\o/.test(doc),
      repeatHeaderRows: (doc.match(/<w:tblHeader\/>/g) || []).length, cantSplitRows: (doc.match(/<w:cantSplit\/>/g) || []).length,
      privacy: findings
    };
  }

  /* Table-cell properties must follow the schema order. Some templates (including ones saved by other tools)
   * have them out of order; Word tolerates it, strict readers and validators do not. */
  var TCPR_ORDER = ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar', 'textDirection', 'tcFitText', 'vAlign', 'hideMark', 'headers', 'cellIns', 'cellDel', 'cellMerge', 'tcPrChange'];
  function children(inner) {
    var out = [], i = 0;
    while (i < inner.length) {
      var lt = inner.indexOf('<', i); if (lt < 0) break;
      var m = /^<w:([A-Za-z]+)\b[^>]*?(\/?)>/.exec(inner.slice(lt)); if (!m) break;
      var name = m[1], end;
      if (m[2] === '/') end = lt + m[0].length;
      else { var close = '</w:' + name + '>', depth = 1, j = lt + m[0].length, re = new RegExp('<w:' + name + '\\b[^>]*?(/?)>|</w:' + name + '>', 'g'); re.lastIndex = j;
        var t; while (depth && (t = re.exec(inner))) { if (t[0].charAt(1) === '/') depth--; else if (t[1] !== '/') depth++; end = re.lastIndex; }
        if (depth) return null; }
      out.push({ name: name, xml: inner.slice(lt, end) }); i = end;
    }
    return out;
  }
  function fixCellOrder(x) {
    var fixed = 0;
    var y = String(x).replace(/<w:tcPr>([\s\S]*?)<\/w:tcPr>/g, function (all, inner) {
      if (/<w:tcPr>/.test(inner)) return all;
      var kids = children(inner); if (!kids) return all;
      var sorted = kids.slice().sort(function (a, b) { return TCPR_ORDER.indexOf(a.name) - TCPR_ORDER.indexOf(b.name); });
      if (sorted.every(function (k, i) { return k === kids[i]; })) return all;
      fixed++;
      return '<w:tcPr>' + sorted.map(function (k) { return k.xml; }).join('') + '</w:tcPr>';
    });
    return { xml: y, fixed: fixed };
  }

  function dropParts(parts, test) { var out = {}; Object.keys(parts).forEach(function (n) { if (!test(n)) out[n] = parts[n]; }); return out; }
  function removeRels(relsXml, test) {
    return String(relsXml).replace(/<Relationship\b[^>]*\/>/g, function (r) {
      var target = (/Target="([^"]*)"/.exec(r) || [])[1] || '', type = (/Type="([^"]*)"/.exec(r) || [])[1] || '', ext = /TargetMode="External"/.test(r);
      return test(target, type, ext) ? '' : r;
    });
  }
  /** Accept tracked changes: keep inserted text, drop deleted text. */
  function acceptChanges(x) {
    return String(x).replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, '').replace(/<w:ins\b[^>]*>([\s\S]*?)<\/w:ins>/g, '$1')
      .replace(/<w:(?:rPrChange|pPrChange|tblPrChange|trPrChange|tcPrChange|sectPrChange)\b[^>]*>[\s\S]*?<\/w:(?:rPrChange|pPrChange|tblPrChange|trPrChange|tcPrChange|sectPrChange)>/g, '');
  }

  /**
   * Remove personal and organisation data from a template. Returns { parts, removed: [descriptions] }.
   * Pictures go (they are usually logos), with any drawing that showed one; comments, tracked changes, custom XML,
   * custom properties, macros, rsids, document IDs, protection and external links go; document properties
   * become the neutral set. Header and footer wording is kept for the person to review, as the audit lists it.
   */
  function sanitize(input, isoNow) {
    var removed = [], parts = {};
    Object.keys(input).forEach(function (n) { parts[n] = input[n]; });
    var before = Object.keys(parts).length;
    parts = dropParts(parts, function (n) { return /^word\/media\//.test(n) || /^customXml\//.test(n) || n === 'docProps/custom.xml' || /vbaProject|vbaData/.test(n) || /^word\/comments/.test(n) || n === 'word/people.xml' || /^docProps\/thumbnail/.test(n) || /^word\/embeddings\//.test(n); });
    if (Object.keys(parts).length < before) removed.push((before - Object.keys(parts).length) + ' part(s): pictures, custom XML, comments, macros or thumbnails');
    var kept = new Set(Object.keys(parts));
    Object.keys(parts).filter(function (n) { return /\.rels$/.test(n); }).forEach(function (n) {
      var base = n.replace(/_rels\/([^/]+)\.rels$/, '$1').replace(/[^/]*$/, '');
      parts[n] = removeRels(str(parts, n), function (target, type, ext) {
        if (ext) return true;
        if (/\/(customXml|comments|commentsExtended|commentsIds|commentsExtensible|people|custom-properties|vbaProject|thumbnail|image|oleObject|package)$/.test(type)) return true;
        var full = (target.charAt(0) === '/' ? target.slice(1) : base + target).replace(/[^/]+\/\.\.\//g, '');
        return /^(word|docProps|customXml)\//.test(full) && !kept.has(full);
      });
    });
    if (parts['[Content_Types].xml']) parts['[Content_Types].xml'] = str(parts, '[Content_Types].xml').replace(/<Override PartName="\/([^"]+)"[^>]*\/>/g, function (o, p) { return kept.has(p) ? o : ''; });
    var cellsFixed = 0;
    Object.keys(parts).filter(function (n) { return /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n); }).forEach(function (n) {
      var x = str(parts, n), x0 = x;
      x = acceptChanges(x);
      x = x.replace(/<w:commentRangeStart\b[^>]*\/>|<w:commentRangeEnd\b[^>]*\/>/g, '').replace(/<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:commentReference\b[^>]*\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g, '');
      // A drawing or VML picture whose image was removed would show as a broken box: remove it.
      x = x.replace(/<w:drawing>[\s\S]*?<\/w:drawing>/g, function (d) { return /r:embed=|r:link=/.test(d) ? '' : d; }).replace(/<w:pict>[\s\S]*?<\/w:pict>/g, function (d) { return /r:id=|o:relid=/.test(d) ? '' : d; });
      x = x.replace(/\s(?:w:rsid\w*|w14:paraId|w14:textId)="[^"]*"/g, '');
      var fc = fixCellOrder(x); x = fc.xml; cellsFixed += fc.fixed;
      // Shading without its required pattern value: "clear" is what Word means by plain fill.
      x = x.replace(/<w:shd\b(?![^>]*w:val=)/g, function () { cellsFixed++; return '<w:shd w:val="clear"'; });
      if (x !== x0) parts[n] = x;
    });
    if (cellsFixed) removed.push('Repaired ' + cellsFixed + ' table-cell or shading setting(s) that broke the Word schema, so strict readers accept the file');
    if (parts['word/styles.xml']) parts['word/styles.xml'] = str(parts, 'word/styles.xml').replace(/<w:rsid w:val="[^"]*"\/>/g, '');
    if (parts['word/numbering.xml']) parts['word/numbering.xml'] = str(parts, 'word/numbering.xml').replace(/\sw15:restartNumberingAfterBreak="[^"]*"|\sw:rsid\w*="[^"]*"/g, '');
    if (parts['word/settings.xml']) {
      var s = str(parts, 'word/settings.xml'), s0 = s;
      s = s.replace(/<w:rsids>[\s\S]*?<\/w:rsids>/g, '').replace(/<w1[45]:docId\b[^>]*\/>/g, '').replace(/<w:attachedTemplate\b[^>]*\/>/g, '')
        .replace(/<w:(writeProtection|documentProtection)\b[^>]*\/>/g, '').replace(/<w:trackRevisions\/>/g, '').replace(/<w:docVars>[\s\S]*?<\/w:docVars>/g, '');
      if (s !== s0) { parts['word/settings.xml'] = s; removed.push('Revision IDs, document IDs, template path, protection or document variables in settings'); }
    }
    var p = props('Generic Office Document Template', isoNow);
    if (parts['docProps/core.xml']) parts['docProps/core.xml'] = coreNeutral(p);
    if (parts['docProps/app.xml']) parts['docProps/app.xml'] = str(parts, 'docProps/app.xml').replace(/<Company>[^<]*<\/Company>/, '<Company></Company>').replace(/<Manager>[^<]*<\/Manager>/, '<Manager></Manager>').replace(/<Template>[^<]*<\/Template>/, '<Template>Normal.dotm</Template>').replace(/<HyperlinkBase>[^<]*<\/HyperlinkBase>/, '');
    removed.push('Document properties replaced with the neutral set (title, subject, category; author, company and manager blank)');
    return { parts: parts, removed: removed };
  }
  function coreNeutral(p) {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(p.title) + '</dc:title><dc:subject>' + esc(p.subject) + '</dc:subject><dc:creator></dc:creator><cp:keywords></cp:keywords><dc:description></dc:description><cp:lastModifiedBy></cp:lastModifiedBy>' +
      '<cp:revision>1</cp:revision><dcterms:created xsi:type="dcterms:W3CDTF">' + esc(p.created) + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + esc(p.modified) + '</dcterms:modified><cp:category>' + esc(p.category) + '</cp:category></cp:coreProperties>';
  }

  /**
   * Add every style role WrapNote writes that the template lacks, using WrapNote's own definitions,
   * so an export never falls back to plain text ("immediately add what is missing"). Returns { xml, added }.
   */
  function completeStyles(theirXml, lookObj) {
    var theirs = styleList(theirXml), map = roleMap(theirs), ids = new Set(theirs.map(function (s) { return s.id; }));
    var ours = styleList(ox().stylesXml(lookObj || look()));
    var add = [], added = [];
    ROLES.forEach(function (r) {
      if (map[r[0]]) return;
      var def = ours.filter(function (s) { return s.id === r[0]; })[0];
      if (!def || ids.has(r[0])) return;
      add.push(def.xml.replace(/ w:default="1"/, '')); added.push(r[1]); map[r[0]] = r[0];
    });
    return { xml: add.length ? String(theirXml).replace(/<\/w:styles>\s*$/, add.join('') + '</w:styles>') : theirXml, added: added, map: map };
  }

  /** Fonts the template uses that are missing from its font table are declared, so Word substitutes sensibly. */
  function completeFonts(fontTableXml, fonts) {
    var have = new Set(); String(fontTableXml || '').replace(/<w:font w:name="([^"]+)"/g, function (a, f) { have.add(f); return a; });
    var add = fonts.filter(function (f) { return f && !have.has(f) && !/^\+/.test(f); });
    if (!add.length) return { xml: fontTableXml, added: [] };
    var x = add.map(function (f) { return '<w:font w:name="' + esc(f) + '"><w:charset w:val="00"/><w:family w:val="' + (/Courier|Consolas/.test(f) ? 'modern' : /Times|Cambria|Georgia/.test(f) ? 'roman' : 'swiss') + '"/><w:pitch w:val="variable"/></w:font>'; }).join('');
    return { xml: String(fontTableXml).replace(/<\/w:fonts>\s*$/, x + '</w:fonts>'), added: add };
  }

  /** Page set-up of the template's last section, in twips. */
  function pageOf(docXml) {
    var sp = /<w:sectPr\b[\s\S]*<\/w:sectPr>/.exec(String(docXml));
    var s = sp ? sp[0].slice(sp[0].lastIndexOf('<w:sectPr')) : '';
    var num = function (re, d) { var m = re.exec(s); return m ? +m[1] : d; };
    return { w: num(/<w:pgSz[^>]*w:w="(\d+)"/, 11906), h: num(/<w:pgSz[^>]*w:h="(\d+)"/, 16838), top: num(/<w:pgMar[^>]*w:top="(-?\d+)"/, 1440), right: num(/<w:pgMar[^>]*w:right="(\d+)"/, 1440),
      bottom: num(/<w:pgMar[^>]*w:bottom="(-?\d+)"/, 1440), left: num(/<w:pgMar[^>]*w:left="(\d+)"/, 1440), header: num(/<w:pgMar[^>]*w:header="(\d+)"/, 709), footer: num(/<w:pgMar[^>]*w:footer="(\d+)"/, 709),
      landscape: /w:orient="landscape"/.test(s), titlePg: /<w:titlePg\/>/.test(s) };
  }

  var api = { setupDoc: setupDoc, switchTemplate: switchTemplate, PAGE: PAGE, PAGE_MM: PAGE_MM, FIELDS: FIELDS, defaults: defaults, clean: clean, look: look, headerFooter: headerFooter, props: props, newHtml: newHtml, SECTIONS: SECTIONS,
    headingNumbers: headingNumbers, stripTypedNumber: stripTypedNumber, ROLES: ROLES, styleList: styleList, roleMap: roleMap, audit: audit, sanitize: sanitize,
    completeStyles: completeStyles, completeFonts: completeFonts, fixCellOrder: fixCellOrder, pageOf: pageOf, acceptChanges: acceptChanges };
  if (isNode) module.exports = api; else { g.WN = g.WN || {}; g.WN.officeTemplate = api; }
})(typeof window !== 'undefined' ? window : globalThis);

/* WrapNote core: a real Word (.docx, Office Open XML) writer.
 * 1.1.0 saved HTML with a .doc name. Word's HTML importer ignores modern CSS, so tables lost their
 * borders, headings lost their styles and lists were typed out. This module writes the actual parts
 * Word reads: styles, numbering, a theme, settings, headers and footers with PAGE and NUMPAGES fields,
 * footnotes, comments, pictures, tables with repeating header rows, TOC and SEQ fields with cached
 * results (so the file looks right before Word updates them), tracked insertions and deletions,
 * equations as Office Math, page colour and page borders.
 *
 * Input is a plain model (see buildDocx), produced from the editor by the app and from fixtures by the
 * unit tests, so every rule here is testable in Node. All measurements are in twips (1/20 pt) unless named:
 * 1 inch = 1440 twips, 1 mm = 1440 / 25.4 twips, 1 pt = 20 twips, 1 px (CSS) = 15 twips, 1 inch = 914400 EMU.
 */
(function (g) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;

  var TW_PER_MM = 1440 / 25.4;
  var EMU_PER_PX = 9525; // 914400 EMU per inch / 96 px per inch

  // Characters XML 1.0 forbids (control characters) are dropped; everything else is escaped.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  /** Element text needs only &, < and > escaped; keeping quotes literal makes field codes read as Word writes them. */
  function escT(s) { return esc(s).replace(/&quot;/g, '"'); }
  function hex(c) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim()); if (m) return m[1].toUpperCase();
    m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(String(c || '').trim()); if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
    m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(String(c || '').trim());
    if (m && (m[4] === undefined || +m[4] > 0.5)) return [m[1], m[2], m[3]].map(function (x) { return ('0' + (+x).toString(16)).slice(-2); }).join('').toUpperCase();
    return '';
  }
  function mmToTw(mm) { return Math.round(mm * TW_PER_MM); }

  var NS = 'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
    'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" ' +
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
    'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" mc:Ignorable="w14"';
  var XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  /* ---------- Looks (template parameters) ---------- */

  /** The personal look mirrors the app's own document styles (doc.css), with fonts Word has. */
  function personalLook(font) {
    var body = mapFont(font || 'IBM Plex Sans');
    return {
      id: 'personal', bodyFont: body, headingFont: body, majorFont: body, minorFont: body,
      size: 22, color: '111827', headingColor: '0F172A', accent: '047857',
      normal: { after: 160, line: 276 },
      headings: [{ size: 40, before: 80, after: 160 }, { size: 28, before: 240, after: 120 }, { size: 24, before: 200, after: 80 }, { size: 22, before: 160, after: 80, italic: true }],
      title: { size: 52, after: 80 }, subtitle: { size: 28, color: '475569', after: 240 },
      numbered: false, table: { border: 'CBD5E1', size: 20, headerBold: true, headerFill: 'F1F5F9', cellMargin: 85 },
      tocTabs: null
    };
  }
  /** Fonts the browser has but Word may not are mapped to the closest font every Word install has. */
  var WORD_FONTS = ['Arial', 'Calibri', 'Calibri Light', 'Cambria', 'Candara', 'Consolas', 'Constantia', 'Corbel', 'Courier New', 'Georgia',
    'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Aptos', 'Garamond', 'Book Antiqua', 'Century Gothic', 'Lucida Console'];
  var FONT_MAP = { 'ibm plex sans': 'Arial', 'system-ui': 'Segoe UI', 'sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Consolas', 'ui-monospace': 'Consolas',
    'helvetica': 'Arial', 'helvetica neue': 'Arial', 'roboto': 'Arial', 'inter': 'Arial', 'dejavu sans': 'Verdana', 'liberation sans': 'Arial', 'liberation serif': 'Times New Roman' };
  function mapFont(name) {
    var n = String(name || '').split(',')[0].replace(/["']/g, '').trim();
    if (!n) return 'Calibri';
    var hit = WORD_FONTS.filter(function (f) { return f.toLowerCase() === n.toLowerCase(); })[0];
    return hit || FONT_MAP[n.toLowerCase()] || n;
  }

  /* ---------- Runs ---------- */

  function rPr(r, ctx) {
    var x = '';
    if (r.rStyle) x += '<w:rStyle w:val="' + esc(ctx && ctx.sid ? ctx.sid(r.rStyle) : r.rStyle) + '"/>';
    if (r.font) { var f = esc(mapFont(r.font)); x += '<w:rFonts w:ascii="' + f + '" w:hAnsi="' + f + '" w:cs="' + f + '"/>'; }
    if (r.b) x += '<w:b/><w:bCs/>';
    if (r.i) x += '<w:i/><w:iCs/>';
    if (r.caps) x += '<w:caps/>';
    if (r.s) x += '<w:strike/>';
    if (r.color && hex(r.color)) x += '<w:color w:val="' + hex(r.color) + '"/>';
    if (r.size) x += '<w:sz w:val="' + Math.round(r.size) + '"/><w:szCs w:val="' + Math.round(r.size) + '"/>';
    if (r.u) x += '<w:u w:val="single"/>';
    if (r.fill && hex(r.fill)) x += '<w:shd w:val="clear" w:color="auto" w:fill="' + hex(r.fill) + '"/>';
    if (r.sup) x += '<w:vertAlign w:val="superscript"/>'; else if (r.sub) x += '<w:vertAlign w:val="subscript"/>';
    return x ? '<w:rPr>' + x + '</w:rPr>' : '';
  }

  /** Text into w:t / w:tab / w:br runs (Word keeps tabs and line breaks as their own elements). */
  function textRuns(text, props, del) {
    var tag = del ? 'w:delText' : 'w:t', out = '';
    String(text).split(/(\t|\n)/).forEach(function (part) {
      if (part === '') return;
      if (part === '\t') out += '<w:r>' + props + '<w:tab/></w:r>';
      else if (part === '\n') out += '<w:r>' + props + '<w:br/></w:r>';
      else out += '<w:r>' + props + '<' + tag + ' xml:space="preserve">' + escT(part) + '</' + tag + '></w:r>';
    });
    return out;
  }

  function fieldRuns(instr, resultRuns, props) {
    return '<w:r>' + props + '<w:fldChar w:fldCharType="begin"/></w:r><w:r>' + props + '<w:instrText xml:space="preserve"> ' + escT(instr) + ' </w:instrText></w:r>' +
      '<w:r>' + props + '<w:fldChar w:fldCharType="separate"/></w:r>' + resultRuns + '<w:r>' + props + '<w:fldChar w:fldCharType="end"/></w:r>';
  }

  function Ctx(model) {
    this.model = model; this.look = model.look; this.rels = []; this.media = []; this.footnotes = []; this.comments = [];
    this.revId = 1; this.bookmark = 0; this.drawing = 1; this.links = new Map();
  }
  /** Style IDs differ between templates ("Heading1" vs a translated ID); roles are mapped by style name. */
  Ctx.prototype.sid = function (id) { var m = this.model.styleMap; return m && m[id] || id; };
  Ctx.prototype.rel = function (type, target, external) {
    var id = 'rId' + (100 + this.rels.length);
    this.rels.push({ id: id, type: type, target: target, external: !!external });
    return id;
  };
  Ctx.prototype.linkRel = function (url) {
    if (!this.links.has(url)) this.links.set(url, this.rel(REL + '/hyperlink', url, true));
    return this.links.get(url);
  };

  function revAttrs(ctx, rev) {
    return ' w:id="' + (ctx.revId++) + '" w:author="' + esc(rev.author || 'WrapNote') + '"' + (rev.date ? ' w:date="' + esc(rev.date) + '"' : '');
  }

  function runXml(r, ctx) {
    var props = rPr(r, ctx), x;
    switch (r.t) {
      case 'text':
        var link = r.link && !r.del ? r.link : '';
        x = textRuns(r.text, link ? rPr(Object.assign({}, r, { rStyle: 'Hyperlink' }), ctx) : props, !!r.del);
        if (r.ins) x = '<w:ins' + revAttrs(ctx, r.ins) + '>' + x + '</w:ins>';
        if (r.del) x = '<w:del' + revAttrs(ctx, r.del) + '>' + x + '</w:del>';
        // Tracked changes sit inside the hyperlink, which is where Word itself puts them.
        if (link) x = link.charAt(0) === '#' ? '<w:hyperlink w:anchor="' + esc(link.slice(1)) + '" w:history="1">' + x + '</w:hyperlink>'
          : '<w:hyperlink r:id="' + ctx.linkRel(link) + '" w:history="1">' + x + '</w:hyperlink>';
        return x;
      case 'raw': x = r.xml || ''; break;
      case 'br': x = '<w:r><w:br/></w:r>'; break;
      case 'tab': x = '<w:r>' + props + '<w:tab/></w:r>'; break;
      case 'pagebreak': x = '<w:r><w:br w:type="page"/></w:r>'; break;
      case 'colbreak': x = '<w:r><w:br w:type="column"/></w:r>'; break;
      case 'field': x = fieldRuns(r.instr, textRuns(r.result == null ? '' : String(r.result), props), props); break;
      case 'math': x = r.omml || ''; break;
      case 'img': x = drawingXml(r, ctx); break;
      case 'fnref':
        var fid = ctx.footnotes.length + 1;
        ctx.footnotes.push({ id: fid, text: r.text || '' });
        x = '<w:r><w:rPr><w:rStyle w:val="' + ctx.sid('FootnoteReference') + '"/></w:rPr><w:footnoteReference w:id="' + fid + '"/></w:r>';
        break;
      case 'commentStart': x = '<w:commentRangeStart w:id="' + r.id + '"/>'; break;
      case 'commentEnd': x = '<w:commentRangeEnd w:id="' + r.id + '"/><w:r><w:rPr><w:rStyle w:val="' + ctx.sid('CommentReference') + '"/></w:rPr><w:commentReference w:id="' + r.id + '"/></w:r>'; break;
      default: x = '';
    }
    if (r.ins && /^(br|tab|img|fnref|field)$/.test(r.t)) x = '<w:ins' + revAttrs(ctx, r.ins) + '>' + x + '</w:ins>';
    return x;
  }

  function drawingXml(r, ctx) {
    var n = ctx.media.length + 1, ext = r.ext === 'jpeg' ? 'jpeg' : r.ext === 'gif' ? 'gif' : 'png';
    var name = 'image' + n + '.' + ext;
    ctx.media.push({ name: 'word/media/' + name, data: r.data, ext: ext });
    var rid = ctx.rel(REL + '/image', 'media/' + name);
    var cx = Math.max(1, Math.round(r.w * EMU_PER_PX)), cy = Math.max(1, Math.round(r.h * EMU_PER_PX)), id = ctx.drawing++;
    var alt = esc(r.alt || '');
    return '<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + id + '" name="Picture ' + id + '" descr="' + alt + '"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + id + '" name="' + name + '" descr="' + alt + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + rid + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  }

  /* ---------- Blocks ---------- */

  function pPr(p, ctx, extra) {
    var x = '';
    if (p.style) x += '<w:pStyle w:val="' + esc(ctx.sid(p.style)) + '"/>';
    if (p.keepNext) x += '<w:keepNext/>';
    if (p.keepLines) x += '<w:keepLines/>';
    if (p.pageBreakBefore) x += '<w:pageBreakBefore/>';
    if (p.num) x += '<w:numPr><w:ilvl w:val="' + Math.min(8, p.num.lvl || 0) + '"/><w:numId w:val="' + (p.num.id + (ctx.model.numBase || 0)) + '"/></w:numPr>';
    if (p.noNum) x += '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr>';
    if (p.border) x += '<w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="' + hex(p.border) + '"/></w:pBdr>';
    if (p.fill && hex(p.fill)) x += '<w:shd w:val="clear" w:color="auto" w:fill="' + hex(p.fill) + '"/>';
    if (p.tabs) x += '<w:tabs>' + p.tabs.map(function (t) { return '<w:tab w:val="' + t.val + '"' + (t.leader ? ' w:leader="' + t.leader + '"' : '') + ' w:pos="' + t.pos + '"/>'; }).join('') + '</w:tabs>';
    if (p.spacing) x += '<w:spacing' + (p.spacing.before != null ? ' w:before="' + p.spacing.before + '"' : '') + (p.spacing.after != null ? ' w:after="' + p.spacing.after + '"' : '') + '/>';
    if (p.indent) x += '<w:ind w:left="' + Math.round(p.indent) + '"/>';
    if (p.align && p.align !== 'left') x += '<w:jc w:val="' + ({ center: 'center', right: 'right', justify: 'both' }[p.align] || 'left') + '"/>';
    if (extra) x += extra;
    return x ? '<w:pPr>' + x + '</w:pPr>' : '';
  }

  function paraXml(p, ctx, extraPPr) {
    var inner = '';
    if (p.bookmark) { var bid = ctx.bookmark++; inner += '<w:bookmarkStart w:id="' + bid + '" w:name="' + esc(p.bookmark) + '"/>'; }
    (p.runs || []).forEach(function (r) { inner += runXml(r, ctx); });
    if (p.bookmark) inner += '<w:bookmarkEnd w:id="' + (ctx.bookmark - 1) + '"/>';
    return '<w:p>' + pPr(p, ctx, extraPPr) + inner + '</w:p>';
  }

  function borderSet(color, sz) {
    var b = function (side) { return '<w:' + side + ' w:val="single" w:sz="' + sz + '" w:space="0" w:color="' + color + '"/>'; };
    return '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('') + '</w:tblBorders>';
  }

  function tableXml(t, ctx) {
    var look = ctx.look, width = t.width || ctx.model.page.textWidth;
    var n = t.cols && t.cols.length ? t.cols.length : Math.max.apply(null, t.rows.map(function (r) { return r.cells.reduce(function (s, c) { return s + (c.span || 1); }, 0); }).concat([1]));
    var cols = t.cols && t.cols.length === n ? t.cols : [];
    var sum = cols.reduce(function (a, b) { return a + b; }, 0);
    // Column widths: scale the measured widths to the text width so the table fits the page exactly.
    var grid = cols.length ? cols.map(function (c) { return Math.max(200, Math.round(c / sum * width)); }) : Array.apply(null, Array(n)).map(function () { return Math.floor(width / n); });
    var x = '<w:tbl><w:tblPr><w:tblStyle w:val="' + esc(ctx.sid(t.style || 'WNTable')) + '"/><w:tblW w:w="' + grid.reduce(function (a, b) { return a + b; }, 0) + '" w:type="dxa"/>';
    if (t.align === 'center') x += '<w:jc w:val="center"/>';
    if (t.borderColor) x += borderSet(hex(t.borderColor) || '000000', t.borderSize || 4);
    else if (t.borders === false) x += '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
    // The table style's bold first row applies only when the table really has a header row.
    var hasHead = t.rows.some(function (r) { return r.header; });
    x += '<w:tblLayout w:type="fixed"/><w:tblLook w:val="' + (hasHead ? '04A0' : '0400') + '" w:firstRow="' + (hasHead ? 1 : 0) + '" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>';
    x += '<w:tblGrid>' + grid.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>';
    t.rows.forEach(function (row) {
      // Rows never split across pages; header rows repeat on every page the table runs onto.
      x += '<w:tr><w:trPr><w:cantSplit/>' + (row.header ? '<w:tblHeader/>' : '') + '</w:trPr>';
      var gi = 0;
      row.cells.forEach(function (c) {
        var span = Math.max(1, Math.min(c.span || 1, grid.length - gi));
        var w = grid.slice(gi, gi + span).reduce(function (a, b) { return a + b; }, 0); gi += span;
        x += '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
          (c.vmerge ? '<w:vMerge' + (c.vmerge === 'restart' ? ' w:val="restart"' : '') + '/>' : '') +
          (c.fill && hex(c.fill) ? '<w:shd w:val="clear" w:color="auto" w:fill="' + hex(c.fill) + '"/>' : '') +
          (c.valign ? '<w:vAlign w:val="' + c.valign + '"/>' : '') + '</w:tcPr>';
        var inner = blocksXml(c.blocks || [], ctx, { inCell: true, header: row.header, look: look });
        // A cell must end with a paragraph (Word reports the file as damaged otherwise).
        x += (!inner || /<\/w:tbl>$/.test(inner) ? inner + '<w:p/>' : inner) + '</w:tc>';
      });
      while (gi < grid.length) { x += '<w:tc><w:tcPr><w:tcW w:w="' + grid[gi] + '" w:type="dxa"/></w:tcPr><w:p/></w:tc>'; gi++; }
      x += '</w:tr>';
    });
    return x + '</w:tbl>';
  }

  /** TOC or table of figures: the field plus cached entries, so it reads correctly before Word updates it. */
  function tocXml(b, ctx) {
    var x = '', instr = b.instr;
    if (b.title) x += paraXml({ style: b.figures ? 'TOCHeading' : 'TOCHeading', runs: [{ t: 'text', text: b.title }] }, ctx);
    var entries = b.entries.length ? b.entries : [{ lvl: 1, text: b.figures ? 'No entries. Right-click and choose Update Field.' : 'Right-click and choose Update Field to build the table of contents.', page: '' }];
    entries.forEach(function (e, i) {
      var style = ctx.sid(b.figures ? 'TableofFigures' : 'TOC' + Math.min(3, e.lvl || 1));
      var runs = '';
      if (i === 0) runs += '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ' + escT(instr) + ' </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
      var label = (e.num ? textRuns(e.num, '') + '<w:r><w:tab/></w:r>' : '') + textRuns(e.text, '') + (e.page !== '' ? '<w:r><w:tab/></w:r>' + textRuns(String(e.page), '') : '');
      runs += e.anchor ? '<w:hyperlink w:anchor="' + esc(e.anchor) + '" w:history="1">' + label + '</w:hyperlink>' : label;
      if (i === entries.length - 1) runs += '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      x += '<w:p><w:pPr><w:pStyle w:val="' + style + '"/></w:pPr>' + runs + '</w:p>';
    });
    return x;
  }

  function blocksXml(blocks, ctx, opt) {
    return blocks.map(function (b, i) {
      // Word puts no space under a table; the page shows 8 pt, so the next paragraph gets it as space before.
      if (b.t === 'p' && i > 0 && blocks[i - 1].t === 'table' && !(opt && opt.inCell)) b = Object.assign({}, b, { spacing: Object.assign({ before: 160 }, b.spacing || {}) });
      if (b.t === 'p') return paraXml(b, ctx);
      if (b.t === 'table') return tableXml(b, ctx);
      if (b.t === 'toc') return tocXml(b, ctx);
      if (b.t === 'section') return paraXml({ runs: [] }, ctx, sectPr(ctx, b.sect, false));
      return '';
    }).join('');
  }

  /* ---------- Section, headers, footers ---------- */

  function sectPr(ctx, s, last) {
    var m = ctx.model, pg = m.page, refs = ctx.hfRefs || '';
    var x = '<w:sectPr>' + refs;
    // Only the first section has a different first page; later sections (column changes) start on the same page.
    var firstSection = !ctx.sectDone; ctx.sectDone = true;
    if (s && s.continuous || !firstSection) x += '<w:type w:val="continuous"/>';
    x += '<w:pgSz w:w="' + pg.w + '" w:h="' + pg.h + '"' + (pg.landscape ? ' w:orient="landscape"' : '') + '/>';
    x += '<w:pgMar w:top="' + pg.top + '" w:right="' + pg.right + '" w:bottom="' + pg.bottom + '" w:left="' + pg.left + '" w:header="' + pg.header + '" w:footer="' + pg.footer + '" w:gutter="0"/>';
    if (pg.border) {
      var b = pg.border, bs = { solid: 'single', dashed: 'dashed', dotted: 'dotted', double: 'double' }[b.style] || 'single';
      if (b.kind === '3d') bs = 'threeDEmboss'; else if (b.kind === 'shadow') bs = 'single';
      var side = function (sd) { return '<w:' + sd + ' w:val="' + bs + '" w:sz="' + Math.max(4, Math.min(96, Math.round(b.width * 6))) + '" w:space="24" w:color="' + (hex(b.color) || '000000') + '"' + (b.kind === 'shadow' ? ' w:shadow="1"' : '') + '/>'; };
      x += '<w:pgBorders w:offsetFrom="page">' + ['top', 'left', 'bottom', 'right'].map(side).join('') + '</w:pgBorders>';
    }
    x += '<w:cols w:space="708"' + (s && s.cols > 1 ? ' w:num="' + s.cols + '"' : '') + '/>';
    if (m.titlePg && firstSection) x += '<w:titlePg/>';
    x += '<w:docGrid w:linePitch="360"/></w:sectPr>';
    return x;
  }

  function hfPart(kind, blocks, ctx) {
    var tag = kind === 'header' ? 'w:hdr' : 'w:ftr';
    var body = blocksXml(blocks, ctx);
    if (!/<w:p[ >]|<w:p\/>/.test(body.replace(/<w:tbl>[\s\S]*<\/w:tbl>/g, ''))) body += '<w:p><w:pPr><w:pStyle w:val="' + (kind === 'header' ? 'Header' : 'Footer') + '"/><w:spacing w:after="0"/></w:pPr></w:p>';
    return XML + '<' + tag + ' ' + NS + '>' + body + '</' + tag + '>';
  }

  /* ---------- Styles, numbering, settings, theme ---------- */

  function stylesXml(look) {
    var f = esc(look.bodyFont), hf = esc(look.headingFont);
    var rf = function (font) { return '<w:rFonts w:ascii="' + font + '" w:hAnsi="' + font + '" w:eastAsia="' + font + '" w:cs="' + font + '"/>'; };
    var st = function (type, id, name, body, extra) { return '<w:style w:type="' + type + '" w:styleId="' + id + '"' + (extra || '') + '><w:name w:val="' + name + '"/>' + body + '</w:style>'; };
    var heads = look.headings.map(function (hd, i) {
      var lvl = i + 1;
      return st('paragraph', 'Heading' + lvl, 'heading ' + lvl, '<w:basedOn w:val="Normal"/><w:next w:val="' + (look.bodyStyle || 'Normal') + '"/><w:uiPriority w:val="9"/><w:qFormat/>' +
        '<w:pPr><w:keepNext/><w:keepLines/>' + (look.numbered && lvl <= 3 ? '<w:numPr><w:ilvl w:val="' + (lvl - 1) + '"/><w:numId w:val="1"/></w:numPr>' : '') +
        '<w:spacing w:before="' + hd.before + '" w:after="' + hd.after + '"' + (hd.line ? ' w:line="' + hd.line + '" w:lineRule="auto"' : '') + '/><w:outlineLvl w:val="' + (lvl - 1) + '"/></w:pPr>' +
        '<w:rPr>' + rf(hf) + '<w:b/><w:bCs/>' + (hd.italic ? '<w:i/>' : '') + '<w:color w:val="' + (hd.color || look.headingColor) + '"/><w:sz w:val="' + hd.size + '"/><w:szCs w:val="' + hd.size + '"/></w:rPr>');
    }).join('');
    var tocs = [1, 2, 3].map(function (l) {
      var t = look.toc && look.toc[l - 1];
      return st('paragraph', 'TOC' + l, 'toc ' + l, '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/>' +
        '<w:pPr><w:tabs>' + (t && t.numTab ? '<w:tab w:val="left" w:pos="' + t.numTab + '"/>' : '') + '<w:tab w:val="right" w:leader="dot" w:pos="' + look.textWidth + '"/></w:tabs><w:spacing w:after="' + (t ? t.after : 60) + '"/>' +
        '<w:ind w:left="' + (t ? t.left : (l - 1) * 220) + '"' + (t && t.hanging ? ' w:hanging="' + t.hanging + '"' : '') + '/></w:pPr>' + (l === 1 && look.tocBold ? '<w:rPr><w:b/><w:noProof/></w:rPr>' : '<w:rPr><w:noProof/></w:rPr>'));
    }).join('');
    var tb = look.table;
    return XML + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<w:docDefaults><w:rPrDefault><w:rPr>' + rf(f) + '<w:sz w:val="' + look.size + '"/><w:szCs w:val="' + look.size + '"/><w:lang w:val="en-GB" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
      '<w:pPrDefault><w:pPr><w:spacing w:after="' + look.normal.after + '" w:line="' + look.normal.line + '" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
      st('paragraph', 'Normal', 'Normal', '<w:qFormat/><w:rPr><w:color w:val="' + look.color + '"/></w:rPr>', ' w:default="1"') +
      (look.bodyStyle ? st('paragraph', look.bodyStyle, 'Body Text', '<w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="288" w:lineRule="auto"/></w:pPr>') : '') +
      heads +
      st('paragraph', 'Title', 'Title', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="10"/><w:qFormat/><w:pPr><w:spacing w:before="' + (look.title.before || 0) + '" w:after="' + look.title.after + '"/>' + (look.title.center ? '<w:jc w:val="center"/>' : '') + '</w:pPr><w:rPr>' + rf(hf) + '<w:b/><w:color w:val="' + look.headingColor + '"/><w:kern w:val="28"/><w:sz w:val="' + look.title.size + '"/><w:szCs w:val="' + look.title.size + '"/></w:rPr>') +
      st('paragraph', 'Subtitle', 'Subtitle', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="11"/><w:qFormat/><w:pPr><w:spacing w:after="' + look.subtitle.after + '"/>' + (look.subtitle.center ? '<w:jc w:val="center"/>' : '') + '</w:pPr><w:rPr>' + (look.subtitle.bold ? '<w:b/>' : '') + '<w:color w:val="' + look.subtitle.color + '"/><w:sz w:val="' + look.subtitle.size + '"/><w:szCs w:val="' + look.subtitle.size + '"/></w:rPr>') +
      st('paragraph', 'Quote', 'Quote', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="' + look.accent + '"/></w:pBdr><w:ind w:left="284"/></w:pPr><w:rPr><w:i/><w:iCs/></w:rPr>') +
      st('paragraph', 'Caption', 'caption', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:keepLines/><w:spacing w:before="40" w:after="200"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:iCs/><w:color w:val="334155"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>') +
      st('paragraph', 'ListParagraph', 'List Paragraph', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="34"/><w:qFormat/><w:pPr><w:spacing w:after="40"/><w:ind w:left="720"/><w:contextualSpacing/></w:pPr>') +
      st('paragraph', 'TOCHeading', 'TOC Heading', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="240"/></w:pPr><w:rPr>' + rf(hf) + '<w:b/><w:color w:val="' + look.headingColor + '"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>') +
      tocs +
      st('paragraph', 'TableofFigures', 'table of figures', '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="' + look.textWidth + '"/></w:tabs><w:spacing w:after="60"/></w:pPr>') +
      st('paragraph', 'TableText', 'Table Text', '<w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="' + tb.size + '"/><w:szCs w:val="' + tb.size + '"/></w:rPr>') +
      st('paragraph', 'Header', 'header', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="center" w:pos="' + Math.round(look.textWidth / 2) + '"/><w:tab w:val="right" w:pos="' + look.textWidth + '"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="' + (look.hfSize || 18) + '"/></w:rPr>') +
      st('paragraph', 'Footer', 'footer', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:tabs><w:tab w:val="center" w:pos="' + Math.round(look.textWidth / 2) + '"/><w:tab w:val="right" w:pos="' + look.textWidth + '"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="' + (look.hfSize || 18) + '"/></w:rPr>') +
      st('paragraph', 'FootnoteText', 'footnote text', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>') +
      st('paragraph', 'CommentText', 'annotation text', '<w:basedOn w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:pPr><w:spacing w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr>') +
      st('character', 'FootnoteReference', 'footnote reference', '<w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr>') +
      st('character', 'CommentReference', 'annotation reference', '<w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:sz w:val="16"/></w:rPr>') +
      st('character', 'Hyperlink', 'Hyperlink', '<w:uiPriority w:val="99"/><w:unhideWhenUsed/><w:rPr><w:color w:val="' + look.accent + '"/><w:u w:val="single"/></w:rPr>') +
      st('table', 'TableNormal', 'Normal Table', '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>', ' w:default="1"') +
      // One table style with borders on every edge and a bold header row, used by every exported table.
      st('table', 'WNTable', 'WrapNote Table', '<w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/><w:pPr><w:spacing w:before="40" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="' + tb.size + '"/><w:szCs w:val="' + tb.size + '"/></w:rPr>' +
        '<w:tblPr>' + borderSet(tb.border, 4) + '<w:tblCellMar><w:top w:w="' + tb.cellMargin / 2 + '" w:type="dxa"/><w:left w:w="' + tb.cellMargin + '" w:type="dxa"/><w:bottom w:w="' + tb.cellMargin / 2 + '" w:type="dxa"/><w:right w:w="' + tb.cellMargin + '" w:type="dxa"/></w:tblCellMar></w:tblPr>' +
        '<w:tblStylePr w:type="firstRow"><w:rPr>' + (tb.headerBold ? '<w:b/><w:bCs/>' : '') + (tb.headerColor ? '<w:color w:val="' + tb.headerColor + '"/>' : '') + '</w:rPr>' + (tb.headerFill ? '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="' + tb.headerFill + '"/></w:tcPr>' : '') + '</w:tblStylePr>') +
      st('table', 'TableGrid', 'Table Grid', '<w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:tblPr>' + borderSet(tb.border, 4) + '</w:tblPr>') +
      st('numbering', 'NoList', 'No List', '<w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>', ' w:default="1"') +
      '</w:styles>';
  }

  /** numId 1: heading numbering (1, 1.1, 1.1.1); 2: bullets; 3+: one numbered list each, so each list restarts at 1. */
  function numberingXml(lists, base) {
    base = base || 0;
    var lvl = function (i, fmt, text, ind, extra) {
      return '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="' + fmt + '"/>' + (extra || '') + '<w:lvlText w:val="' + text + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + ind + '" w:hanging="360"/></w:pPr></w:lvl>';
    };
    var heading = '<w:abstractNum w:abstractNumId="' + base + '"><w:multiLevelType w:val="multilevel"/>' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) {
      var text = []; for (var k = 1; k <= i + 1; k++) text.push('%' + k);
      return '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="decimal"/>' + (i < 3 ? '<w:pStyle w:val="Heading' + (i + 1) + '"/>' : '') + '<w:lvlText w:val="' + text.join('.') + '"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="851"/></w:tabs><w:ind w:left="851" w:hanging="851"/></w:pPr></w:lvl>';
    }).join('') + '</w:abstractNum>';
    // Bullet glyphs per level: Symbol filled dot, Courier New "o", Wingdings square (Word's own defaults).
    var BUL = [['\uF0B7', 'Symbol'], ['o', 'Courier New'], ['\uF0A7', 'Wingdings']];
    var bullets = '<w:abstractNum w:abstractNumId="' + (base + 1) + '"><w:multiLevelType w:val="hybridMultilevel"/>' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) {
      var b = BUL[i % 3];
      return '<w:lvl w:ilvl="' + i + '"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="' + b[0] + '"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="' + (720 + i * 360) + '" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="' + b[1] + '" w:hAnsi="' + b[1] + '" w:hint="default"/></w:rPr></w:lvl>';
    }).join('') + '</w:abstractNum>';
    var numbered = '<w:abstractNum w:abstractNumId="' + (base + 2) + '"><w:multiLevelType w:val="hybridMultilevel"/>' + [0, 1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return lvl(i, ['decimal', 'lowerLetter', 'lowerRoman'][i % 3], '%' + (i + 1) + '.', 720 + i * 360); }).join('') + '</w:abstractNum>';
    var nums = '<w:num w:numId="' + (base + 1) + '"><w:abstractNumId w:val="' + base + '"/></w:num><w:num w:numId="' + (base + 2) + '"><w:abstractNumId w:val="' + (base + 1) + '"/></w:num>';
    for (var n = 0; n < lists; n++) nums += '<w:num w:numId="' + (base + 3 + n) + '"><w:abstractNumId w:val="' + (base + 2) + '"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>';
    return XML + '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + heading + bullets + numbered + nums + '</w:numbering>';
  }

  /** Our list definitions appended to a template's own numbering, with IDs after the template's. */
  function mergeNumbering(theirs, lists, base) {
    var ours = numberingXml(lists, base);
    var abs = (ours.match(/<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/g) || []).join(''), nums = (ours.match(/<w:num\b[\s\S]*?<\/w:num>/g) || []).join('');
    var x = String(theirs);
    var firstNum = x.search(/<w:num\b/);
    x = firstNum >= 0 ? x.slice(0, firstNum) + abs + x.slice(firstNum) : x.replace(/<\/w:numbering>/, abs + '</w:numbering>');
    return x.replace(/<\/w:numbering>\s*$/, nums + '</w:numbering>');
  }
  function maxNumId(xml) { var m = 0; String(xml || '').replace(/w:(?:numId|abstractNumId)="(\d+)"/g, function (a, n) { m = Math.max(m, +n); return a; }); return m; }

  function settingsXml(m) {
    return XML + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">' +
      (m.page.color ? '<w:displayBackgroundShape/>' : '') +
      (m.trackRevisions ? '<w:trackRevisions/>' : '') +
      '<w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>' +
      // Ask Word to refresh the TOC, SEQ and page fields when the file opens.
      (m.updateFields ? '<w:updateFields w:val="true"/>' : '') +
      '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' +
      '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>' +
      '<m:mathPr><m:mathFont m:val="Cambria Math"/><m:dispDef/><m:lMargin m:val="0"/><m:rMargin m:val="0"/><m:defJc m:val="centerGroup"/><m:wrapIndent m:val="1440"/><m:intLim m:val="subSup"/><m:naryLim m:val="undOvr"/></m:mathPr>' +
      '<w:themeFontLang w:val="en-GB"/><w:decimalSymbol w:val="."/><w:listSeparator w:val=","/></w:settings>';
  }

  /** A neutral theme: the standard Office colour values, with this document's fonts as the theme fonts. */
  function themeXml(look) {
    var c = [['dk1', '<a:sysClr val="windowText" lastClr="000000"/>'], ['lt1', '<a:sysClr val="window" lastClr="FFFFFF"/>'], ['dk2', '<a:srgbClr val="0E2841"/>'], ['lt2', '<a:srgbClr val="E8E8E8"/>'],
      ['accent1', '<a:srgbClr val="156082"/>'], ['accent2', '<a:srgbClr val="E97132"/>'], ['accent3', '<a:srgbClr val="196B24"/>'], ['accent4', '<a:srgbClr val="0F9ED5"/>'],
      ['accent5', '<a:srgbClr val="A02B93"/>'], ['accent6', '<a:srgbClr val="4EA72E"/>'], ['hlink', '<a:srgbClr val="467886"/>'], ['folHlink', '<a:srgbClr val="96607D"/>']];
    var fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
    return XML + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="WrapNote"><a:themeElements><a:clrScheme name="WrapNote">' +
      c.map(function (x) { return '<a:' + x[0] + '>' + x[1] + '</a:' + x[0] + '>'; }).join('') + '</a:clrScheme>' +
      '<a:fontScheme name="WrapNote"><a:majorFont><a:latin typeface="' + esc(look.majorFont) + '"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="' + esc(look.minorFont) + '"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
      '<a:fmtScheme name="WrapNote"><a:fillStyleLst>' + fill + fill + fill + '</a:fillStyleLst><a:lnStyleLst>' + [6350, 12700, 19050].map(function (w) { return '<a:ln w="' + w + '"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'; }).join('') + '</a:lnStyleLst>' +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>' + fill + fill + fill + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
  }

  function footnotesXml(list) {
    var sep = '<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>' +
      '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>';
    return XML + '<w:footnotes ' + NS + '>' + sep + list.map(function (f) {
      return '<w:footnote w:id="' + f.id + '"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> ' + esc(f.text) + '</w:t></w:r></w:p></w:footnote>';
    }).join('') + '</w:footnotes>';
  }

  function commentsXml(list) {
    return XML + '<w:comments ' + NS + '>' + list.map(function (c) {
      return '<w:comment w:id="' + c.id + '" w:author="' + esc(c.author || 'WrapNote') + '"' + (c.date ? ' w:date="' + esc(c.date) + '"' : '') + ' w:initials="' + esc((c.author || 'W').split(/\s+/).map(function (x) { return x[0] || ''; }).join('').slice(0, 3)) + '">' +
        String(c.text || '').split(/\n/).map(function (line, i) {
          return '<w:p><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>' + (i === 0 ? '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>' : '') + '<w:r><w:t xml:space="preserve">' + esc(line) + '</w:t></w:r></w:p>';
        }).join('') + '</w:comment>';
    }).join('') + '</w:comments>';
  }

  function isoNoMs(d) { return (d || '2026-01-01T00:00:00Z').replace(/\.\d+Z$/, 'Z'); }
  function coreXml(p) {
    return XML + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(p.title) + '</dc:title><dc:subject>' + esc(p.subject) + '</dc:subject><dc:creator>' + esc(p.creator) + '</dc:creator><cp:keywords>' + esc(p.keywords) + '</cp:keywords>' +
      '<dc:description>' + esc(p.description) + '</dc:description><cp:lastModifiedBy>' + esc(p.lastModifiedBy) + '</cp:lastModifiedBy><cp:revision>1</cp:revision>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + isoNoMs(p.created) + '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' + isoNoMs(p.modified) + '</dcterms:modified>' +
      '<cp:category>' + esc(p.category) + '</cp:category></cp:coreProperties>';
  }
  function appXml(p) {
    return XML + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
      '<Template>' + esc(p.template || 'Normal.dotm') + '</Template><TotalTime>0</TotalTime><Application>WrapNote</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop>' +
      '<Manager>' + esc(p.manager || '') + '</Manager><Company>' + esc(p.company || '') + '</Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>';
  }

  /* ---------- Office Math from a small MathML tree ---------- */
  /** node: { n: tag name, c: [children], t: text }. Unknown elements fall back to their children. */
  function omml(node) {
    function run(t, plain) { return t ? '<m:r>' + (plain ? '<m:rPr><m:sty m:val="p"/></m:rPr>' : '') + '<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">' + esc(t) + '</m:t></m:r>' : ''; }
    function all(cs) { return (cs || []).map(conv).join(''); }
    function arg(c) { return conv(c || { n: 'mrow', c: [] }); }
    function conv(x) {
      if (!x) return '';
      if (x.n === '#text') return run(x.t);
      var c = x.c || [];
      switch (x.n) {
        case 'math': case 'mrow': case 'semantics': case 'mstyle': case 'mpadded': case 'mphantom': return all(c);
        case 'annotation': case 'annotation-xml': return '';
        case 'mi': return run(x.t, x.t && x.t.length > 1);
        case 'mn': return run(x.t, true);
        case 'mo': return run(x.t, true);
        case 'mtext': case 'ms': return run(x.t, true);
        case 'mspace': return run(' ', true);
        case 'mfrac': return '<m:f><m:num>' + arg(c[0]) + '</m:num><m:den>' + arg(c[1]) + '</m:den></m:f>';
        case 'msqrt': return '<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>' + all(c) + '</m:e></m:rad>';
        case 'mroot': return '<m:rad><m:deg>' + arg(c[1]) + '</m:deg><m:e>' + arg(c[0]) + '</m:e></m:rad>';
        case 'msup': return nary(c[0], null, c[1]) || '<m:sSup><m:e>' + arg(c[0]) + '</m:e><m:sup>' + arg(c[1]) + '</m:sup></m:sSup>';
        case 'msub': return nary(c[0], c[1], null) || '<m:sSub><m:e>' + arg(c[0]) + '</m:e><m:sub>' + arg(c[1]) + '</m:sub></m:sSub>';
        case 'msubsup': return nary(c[0], c[1], c[2]) || '<m:sSubSup><m:e>' + arg(c[0]) + '</m:e><m:sub>' + arg(c[1]) + '</m:sub><m:sup>' + arg(c[2]) + '</m:sup></m:sSubSup>';
        case 'munder': return nary(c[0], c[1], null) || '<m:limLow><m:e>' + arg(c[0]) + '</m:e><m:lim>' + arg(c[1]) + '</m:lim></m:limLow>';
        case 'mover': return accent(c[0], c[1]) || '<m:limUpp><m:e>' + arg(c[0]) + '</m:e><m:lim>' + arg(c[1]) + '</m:lim></m:limUpp>';
        case 'munderover': return nary(c[0], c[1], c[2]) || '<m:limLow><m:e><m:limUpp><m:e>' + arg(c[0]) + '</m:e><m:lim>' + arg(c[2]) + '</m:lim></m:limUpp></m:e><m:lim>' + arg(c[1]) + '</m:lim></m:limLow>';
        case 'mtable': return '<m:m>' + c.map(function (tr) { return '<m:mr>' + (tr.c || []).map(function (td) { return '<m:e>' + all(td.c) + '</m:e>'; }).join('') + '</m:mr>'; }).join('') + '</m:m>';
        case 'mfenced': return '<m:d><m:e>' + all(c) + '</m:e></m:d>';
        default: return all(c);
      }
    }
    // Sums, products and integrals become n-ary operators so Word draws the limits correctly.
    function nary(base, sub, sup) {
      if (!base || base.n !== 'mo' || !/^[∑∏∫∬∮⋃⋂]$/.test(base.t || '')) return '';
      return '<m:nary><m:naryPr><m:chr m:val="' + esc(base.t) + '"/>' + (sub ? '' : '<m:subHide m:val="1"/>') + (sup ? '' : '<m:supHide m:val="1"/>') + '</m:naryPr>' +
        '<m:sub>' + (sub ? arg(sub) : '') + '</m:sub><m:sup>' + (sup ? arg(sup) : '') + '</m:sup><m:e/></m:nary>';
    }
    function accent(base, acc) {
      if (!acc || acc.n !== 'mo' || !acc.t || acc.t.length !== 1) return '';
      var chr = { '¯': '̅', '→': '⃗', '^': '̂', '˙': '̇', '~': '̃' }[acc.t] || acc.t;
      return '<m:acc><m:accPr><m:chr m:val="' + esc(chr) + '"/></m:accPr><m:e>' + arg(base) + '</m:e></m:acc>';
    }
    return conv(node);
  }

  /* ---------- Package ---------- */

  /**
   * model: {
   *   look, page: { w, h, top, right, bottom, left, header, footer, landscape, color, border, textWidth },
   *   titlePg, header: { first, default }, footer: { first, default } (arrays of blocks), watermark,
   *   blocks, comments: [{ id, author, date, text }], props: { title, subject, creator, ... }, lists (count),
   *   trackRevisions, updateFields
   * }
   * Returns the list of parts { name, data } ready for WN.zip.zip.
   */
  function buildDocx(model) {
    var ctx = new Ctx(model), look = model.look;
    look.textWidth = model.page.textWidth = model.page.textWidth || (model.page.w - model.page.left - model.page.right);
    var parts = [];
    var hf = [];
    if (model.watermark && model.watermark.text) {
      // Word keeps a text watermark in the header, so every header part gets one.
      model.header = model.header || {};
      ['default', 'first'].forEach(function (type) {
        if (type === 'first' && !model.titlePg) return;
        model.header[type] = [{ t: 'p', style: 'Header', runs: [{ t: 'raw', xml: watermarkHeaderXml(model.watermark) }] }].concat(model.header[type] || []);
      });
    }
    ['header', 'footer'].forEach(function (kind) {
      var set = model[kind] || {};
      ['default', 'first'].forEach(function (type) {
        if (!set[type] || (type === 'first' && !model.titlePg)) return;
        var name = kind + (hf.length + 1) + '.xml';
        // Header and footer relationships (hyperlinks, pictures) belong to their own part.
        var sub = new Ctx(model); sub.revId = 9000 + hf.length * 100; sub.bookmark = 9000 + hf.length * 100; sub.drawing = 900 + hf.length * 50;
        var xml = hfPart(kind, set[type], sub);
        sub.media.forEach(function (m) { m.name = m.name.replace(/image(\d+)\./, 'hf' + (hf.length + 1) + 'image$1.'); });
        sub.rels.forEach(function (r) { if (/\/image$/.test(r.type)) r.target = r.target.replace(/image(\d+)\./, 'hf' + (hf.length + 1) + 'image$1.'); });
        var rid = ctx.rel(REL + '/' + kind, name);
        hf.push({ kind: kind, type: type, name: name, xml: xml, rid: rid, sub: sub });
      });
    });
    (model.rawHF || []).forEach(function (r, i) {
      var name = r.kind + (hf.length + 1) + '.xml';
      var sub = new Ctx(model); sub.rels = (r.rels || []).slice();
      hf.push({ kind: r.kind, type: r.type, name: name, xml: r.xml, rid: ctx.rel(REL + '/' + r.kind, name), sub: sub });
    });
    ctx.hfRefs = hf.map(function (x) { return '<w:' + x.kind + 'Reference w:type="' + x.type + '" r:id="' + x.rid + '"/>'; }).join('');

    var bodyXml = blocksXml(model.blocks, ctx);
    var bg = model.page.color && hex(model.page.color) && hex(model.page.color) !== 'FFFFFF' ? '<w:background w:color="' + hex(model.page.color) + '"/>' : '';
    if (!bg) model.page.color = '';
    var doc = XML + '<w:document ' + NS + '>' + bg + '<w:body>' + bodyXml + sectPr(ctx, { first: true }, true) + '</w:body></w:document>';

    var fixed = [
      ['styles', 'styles.xml'], ['numbering', 'numbering.xml'], ['settings', 'settings.xml'], ['theme', 'theme/theme1.xml'], ['footnotes', 'footnotes.xml'], ['fontTable', 'fontTable.xml']
    ];
    fixed.forEach(function (f) { ctx.rels.push({ id: 'rId' + (ctx.rels.length + 1000), type: REL + '/' + f[0], target: f[1] }); });
    if (ctx.comments.length || (model.comments && model.comments.length)) ctx.rels.push({ id: 'rIdC1', type: REL + '/comments', target: 'comments.xml' });

    var overrides = [
      ['/word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'],
      ['/word/styles.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml'],
      ['/word/numbering.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml'],
      ['/word/settings.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml'],
      ['/word/theme/theme1.xml', 'application/vnd.openxmlformats-officedocument.theme+xml'],
      ['/word/footnotes.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml'],
      ['/word/fontTable.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml'],
      ['/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml'],
      ['/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml']
    ];
    hf.forEach(function (x) { overrides.push(['/word/' + x.name, 'application/vnd.openxmlformats-officedocument.wordprocessingml.' + x.kind + '+xml']); });
    if (model.comments && model.comments.length) overrides.push(['/word/comments.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml']);
    var exts = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' }, usedExt = {};
    ctx.media.concat.apply(ctx.media, hf.map(function (x) { return x.sub.media; })).forEach(function (m) { usedExt[m.ext] = 1; });

    parts.push({ name: '[Content_Types].xml', data: XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      Object.keys(usedExt).map(function (e) { return '<Default Extension="' + e + '" ContentType="' + exts[e] + '"/>'; }).join('') +
      overrides.map(function (o) { return '<Override PartName="' + o[0] + '" ContentType="' + o[1] + '"/>'; }).join('') + '</Types>' });
    parts.push({ name: '_rels/.rels', data: XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + REL + '/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="' + REL + '/extended-properties" Target="docProps/app.xml"/></Relationships>' });
    parts.push({ name: 'word/document.xml', data: doc });
    parts.push({ name: 'word/_rels/document.xml.rels', data: relsXml(ctx.rels) });
    parts.push({ name: 'word/styles.xml', data: model.parts && model.parts.styles || stylesXml(look) });
    parts.push({ name: 'word/numbering.xml', data: model.parts && model.parts.numbering ? mergeNumbering(model.parts.numbering, model.lists || 0, model.numBase || 0) : numberingXml(model.lists || 0) });
    parts.push({ name: 'word/settings.xml', data: settingsXml(model) });
    parts.push({ name: 'word/theme/theme1.xml', data: model.parts && model.parts.theme || themeXml(look) });
    parts.push({ name: 'word/footnotes.xml', data: footnotesXml(ctx.footnotes) });
    parts.push({ name: 'word/fontTable.xml', data: model.parts && model.parts.fontTable || fontTableXml([look.bodyFont, look.headingFont, look.majorFont, look.minorFont, 'Symbol', 'Courier New', 'Wingdings', 'Cambria Math']) });
    if (model.comments && model.comments.length) parts.push({ name: 'word/comments.xml', data: commentsXml(model.comments) });
    hf.forEach(function (x) {
      parts.push({ name: 'word/' + x.name, data: x.xml });
      if (x.sub.rels.length) parts.push({ name: 'word/_rels/' + x.name + '.rels', data: relsXml(x.sub.rels) });
      x.sub.media.forEach(function (m) { parts.push({ name: m.name, data: m.data, store: true }); });
    });
    ctx.media.forEach(function (m) { parts.push({ name: m.name, data: m.data, store: true }); });
    parts.push({ name: 'docProps/core.xml', data: coreXml(model.props || {}) });
    parts.push({ name: 'docProps/app.xml', data: appXml(model.props || {}) });
    return parts;
  }

  function relsXml(rels) {
    return XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels.map(function (r) {
      return '<Relationship Id="' + r.id + '" Type="' + r.type + '" Target="' + esc(r.target) + '"' + (r.external ? ' TargetMode="External"' : '') + '/>';
    }).join('') + '</Relationships>';
  }

  function fontTableXml(fonts) {
    var seen = {};
    return XML + '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' + fonts.filter(function (f) { if (!f || seen[f]) return false; seen[f] = 1; return true; }).map(function (f) {
      var fam = /Courier|Consolas|Lucida Console/.test(f) ? 'modern' : /Times|Cambria|Georgia|Garamond|Book Antiqua|Constantia/.test(f) ? 'roman' : f === 'Symbol' ? 'roman' : 'swiss';
      return '<w:font w:name="' + esc(f) + '"><w:charset w:val="' + (f === 'Symbol' ? '02' : '00') + '"/><w:family w:val="' + fam + '"/><w:pitch w:val="' + (fam === 'modern' ? 'fixed' : 'variable') + '"/></w:font>';
    }).join('') + '</w:fonts>';
  }

  /** Text watermark: a rotated VML text box behind the text in the header, as Word itself writes it. */
  function watermarkHeaderXml(w) {
    var text = esc(String(w.text || '').slice(0, 60)), angle = Math.round(w.angle || -45), op = Math.max(0.05, Math.min(1, w.opacity || 0.15));
    return '<w:r><w:pict><v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e"><v:path textpathok="t" o:connecttype="custom"/><v:textpath on="t" fitshape="t"/></v:shapetype>' +
      '<v:shape id="WrapNoteWatermark" o:spid="_x0000_s1025" type="#_x0000_t136" style="position:absolute;margin-left:0;margin-top:0;width:460pt;height:115pt;rotation:' + (angle < 0 ? 360 + angle : angle) + ';z-index:-251657216;mso-position-horizontal:center;mso-position-horizontal-relative:margin;mso-position-vertical:center;mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="#808080" stroked="f">' +
      '<v:fill opacity="' + op.toFixed(2) + '"/><v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="' + text + '"/><w10:wrap anchorx="margin" anchory="margin"/></v:shape></w:pict></w:r>';
  }

  var api = { maxNumId: maxNumId, mergeNumbering: mergeNumbering, esc: esc, hex: hex, mmToTw: mmToTw, mapFont: mapFont, WORD_FONTS: WORD_FONTS, personalLook: personalLook, buildDocx: buildDocx, omml: omml,
    stylesXml: stylesXml, numberingXml: numberingXml, themeXml: themeXml, TW_PER_MM: TW_PER_MM };
  if (isNode) module.exports = api; else { g.WN = g.WN || {}; g.WN.ooxml = api; }
})(typeof window !== 'undefined' ? window : globalThis);

/* WrapNote app: the six-tab ribbon. Items are data; each maps to a command in CMD.
 * Ribbon buttons cancel mousedown so the text selection in the page is kept while clicking.
 */
var FONTS = ['IBM Plex Sans', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Courier New'];
var SIZES_PT = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
var PT_PER_PX = 72 / 96; // explicit conversion: 1 CSS px = 0.75 pt

var Ribbon = (function () {
  var active = 'home';
  var TABS = [
    { id: 'home', label: 'Home', groups: [
      { label: 'Clipboard', items: [['cut', 'Cut'], ['copy', 'Copy'], ['paste', 'Paste'], ['painter', 'Format painter', 'Copy formatting from the selection, then select text to apply it']] },
      { label: 'Font', items: [{ sel: 'fontName' }, { sel: 'fontSize' }, ['grow', 'A⁺', 'Increase font size'], ['shrink', 'A⁻', 'Decrease font size'], ['bold', 'B', 'Bold (Ctrl+B)', 'b'], ['italic', 'I', 'Italic (Ctrl+I)', 'i'], ['underline', 'U', 'Underline (Ctrl+U)', 'u'],
        ['subscript', 'x₂', 'Subscript'], ['superscript', 'x²', 'Superscript'], { sel: 'case' }, { color: 'hilite', label: 'Highlight', def: '#fde68a' }, { color: 'fore', label: 'Font colour', def: '#b91c1c' }, ['clearFormat', 'Clear', 'Clear formatting']] },
      { label: 'Paragraph', items: [['ul', '• List', 'Bullets'], ['ol', '1. List', 'Numbering'], ['multilevel', '1.1 List', 'Multilevel list'], ['outdent', '⇤', 'Decrease indent'], ['indent', '⇥', 'Increase indent'],
        ['alignLeft', 'Left', 'Align left'], ['alignCenter', 'Center', 'Center'], ['alignRight', 'Right', 'Align right'], ['alignJustify', 'Justify', 'Justify'], { sel: 'lineSpacing' }, { color: 'shade', label: 'Shading', def: '#ecfdf5' }, { sel: 'paraBorder' }] },
      { label: 'Styles', items: [{ sel: 'style' }, ['customLabel', 'Custom label…', 'Insert a coloured label tag']] },
      { label: 'Editing', items: [['find', 'Find', 'Find (Ctrl+F)'], ['replace', 'Replace', 'Replace (Ctrl+H)'], { sel: 'select' }, ['spell', 'Spell check', 'Turn the browser spelling underline on or off']] }
    ] },
    { id: 'insert', label: 'Insert', groups: [
      { label: 'Pages', items: [{ sel: 'cover' }, ['blankPage', 'Blank page'], ['pageBreak', 'Page break', 'Ctrl+Enter']] },
      { label: 'Tables & media', items: [['table', 'Table…'], { sel: 'tableTools' }, ['pictures', 'Pictures…'], ['shape', 'Shapes…'], ['chart', 'Chart…']] },
      { label: 'Links & comments', items: [['link', 'Link…'], ['comment', 'New comment']] },
      { label: 'Header & footer', items: [['headerFooter', 'Header…'], ['headerFooter', 'Footer…'], ['headerFooter', 'Page numbers…']] },
      { label: 'Text & symbols', items: [{ sel: 'textBox' }, ['signature', 'Signature line…'], { sel: 'dateTime' }, ['equation', 'Equation…'], ['symbol', 'Symbol…']] }
    ] },
    { id: 'layout', label: 'Design & layout', groups: [
      { label: 'Page background', items: [['pageBorders', 'Page borders…'], { color: 'pageColor', label: 'Page colour', def: '#ffffff' }, ['watermark', 'Watermark…']] },
      { label: 'Page setup', items: [{ sel: 'margins' }, { sel: 'orientation' }, { sel: 'size' }, { sel: 'columns' }, { sel: 'breaks' }] },
      { label: 'Paragraph', items: [{ num: 'indentL', label: 'Indent left (mm)' }, { num: 'indentR', label: 'Indent right (mm)' }, { num: 'spBefore', label: 'Space before (pt)' }, { num: 'spAfter', label: 'Space after (pt)' }] },
      { label: 'Arrange', items: [{ sel: 'wrap' }, { sel: 'position' }] }
    ] },
    { id: 'refs', label: 'References', groups: [
      { label: 'Table of contents', items: [['toc', 'Table of contents…'], ['tocUpdate', 'Update table']] },
      { label: 'Captions', items: [['caption', 'Insert caption…']] },
      { label: 'Footnotes', items: [['footnote', 'Insert footnote…']] }
    ] },
    { id: 'review', label: 'Review', groups: [
      { label: 'Proofing', items: [['spelling', 'Spelling & grammar'], ['wordCount', 'Word count']] },
      { label: 'Comments', items: [['commentsPane', 'Show comments'], ['comment', 'New comment'], ['commentDelete', 'Delete'], ['commentPrev', 'Previous'], ['commentNext', 'Next']] },
      { label: 'Tracking', items: [['track', 'Track changes'], ['changesPane', 'Show changes'], ['changePrev', 'Previous'], ['changeNext', 'Next'], ['accept', 'Accept'], ['reject', 'Reject'], ['acceptAll', 'Accept all'], ['rejectAll', 'Reject all']] },
      { label: 'Compare', items: [['saveRevision', 'Save revision'], ['compare', 'Compare…']] },
      { label: 'Protect', items: [['readOnly', 'Read-only'], ['password', 'Password lock…']] }
    ] },
    { id: 'view', label: 'View', groups: [
      { label: 'Views', items: [['printLayout', 'Print layout'], ['readMode', 'Read mode'], ['outline', 'Outline'], ['focus', 'Focus'], ['immersive', 'Immersive reader']] },
      { label: 'Show', items: [['navPane', 'Navigation pane'], ['ruler', 'Ruler']] },
      { label: 'Zoom', items: [{ zoom: true }, ['z100', '100%'], ['zOne', 'One page'], ['zMulti', 'Multiple pages'], ['zWidth', 'Page width']] },
      { label: 'Window', items: [['newWindow', 'New window'], { sel: 'split' }, ['arrange', 'Arrange all'], ['sideBySide', 'View side by side…']] }
    ] }
  ];

  var SELECTS = {
    fontName: { label: 'Font', options: function () { return FONTS.concat(Fonts.names()).map(function (f) { return [f, f]; }).concat([['__import', 'Import font (.ttf, .otf, .woff)…']]); } },
    fontSize: { label: 'Size (pt)', options: function () { return SIZES_PT.map(function (s) { return [s, String(s)]; }); } },
    case: { label: 'Change case', menu: true, options: [['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case'], ['sentence', 'Sentence case']] },
    lineSpacing: { label: 'Line spacing', menu: true, options: [['1', '1.0'], ['1.15', '1.15'], ['1.5', '1.5'], ['2', '2.0'], ['2.5', '2.5'], ['3', '3.0']] },
    paraBorder: { label: 'Borders', menu: true, options: [['box', 'Box'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left bar'], ['none', 'No border']] },
    style: { label: 'Style', menu: true, options: [['p', 'Normal'], ['title', 'Title'], ['subtitle', 'Subtitle'], ['h1', 'Heading 1'], ['h2', 'Heading 2'], ['h3', 'Heading 3'], ['h4', 'Heading 4'], ['quote', 'Quote'], ['label', 'Label']] },
    select: { label: 'Select', menu: true, options: [['all', 'Select all'], ['objects', 'Select objects'], ['similar', 'Select similar formatting']] },
    cover: { label: 'Cover page', menu: true, options: [['corporate', 'Corporate cover'], ['academic', 'Academic cover']] },
    tableTools: { label: 'Table tools', menu: true, options: [['rowAbove', 'Insert row above'], ['rowBelow', 'Insert row below'], ['colLeft', 'Insert column left'], ['colRight', 'Insert column right'], ['delRow', 'Delete row'], ['delCol', 'Delete column'], ['merge', 'Merge cells'], ['split', 'Split cell'], ['shade', 'Cell shading…'], ['cellBorders', 'Cell borders: all'], ['cellNoBorders', 'Cell borders: none'], ['delTable', 'Delete table']] },
    textBox: { label: 'Text box', menu: true, options: [['inline', 'Inline text box'], ['float', 'Floating text box']] },
    dateTime: { label: 'Date & time', menu: true, options: [['dmy', '28/10/2026'], ['dmyhm', '28/10/2026 14:05'], ['long', 'Wednesday, 28 October 2026'], ['week', 'CW44 · FY 2026-27']] },
    margins: { label: 'Margins', menu: true, options: [['normal', 'Normal (25.4 mm)'], ['narrow', 'Narrow (12.7 mm)'], ['moderate', 'Moderate'], ['wide', 'Wide'], ['custom', 'Custom margins…']] },
    orientation: { label: 'Orientation', menu: true, options: [['portrait', 'Portrait'], ['landscape', 'Landscape']] },
    size: { label: 'Size', menu: true, options: [['A4', 'A4 (210 × 297 mm)'], ['Letter', 'Letter'], ['Legal', 'Legal'], ['A5', 'A5']] },
    columns: { label: 'Columns', menu: true, options: [['1', 'One'], ['2', 'Two'], ['3', 'Three']] },
    breaks: { label: 'Breaks', menu: true, options: [['page', 'Page break'], ['column', 'Column break'], ['section', 'Section break (next page)']] },
    wrap: { label: 'Wrap text', menu: true, options: [['inline', 'In line with text'], ['square', 'Square'], ['tight', 'Tight'], ['behind', 'Behind text'], ['front', 'In front of text']] },
    position: { label: 'Position', menu: true, options: [['left', 'Left'], ['center', 'Center'], ['right', 'Right']] },
    split: { label: 'Split view', menu: true, options: [['off', 'No split'], ['vertical', 'Split side by side'], ['horizontal', 'Split top and bottom']] }
  };

  function build() {
    if (build.first === undefined) { build.first = false; if (isPhone()) $('#ribbon').classList.add('collapsed'); }
    var tabs = $('#ribbon .rb-tabs'), panel = $('#ribbon .rb-panel');
    tabs.textContent = '';
    TABS.forEach(function (t) {
      tabs.appendChild(h('button', { type: 'button', role: 'tab', id: 'rbt-' + t.id, 'aria-controls': 'rbPanel', 'aria-selected': String(t.id === active), 'aria-expanded': String(!$('#ribbon').classList.contains('collapsed')), class: 'rb-tab' + (t.id === active ? ' active' : ''), onclick: function () {
        var rb = $('#ribbon');
        // On a phone the panel folds away so the page stays visible; tapping the open tab closes it.
        if (isPhone()) rb.classList.toggle('collapsed', t.id === active && !rb.classList.contains('collapsed'));
        active = t.id; build();
      } }, t.label));
    });
    panel.textContent = '';
    panel.setAttribute('aria-labelledby', 'rbt-' + active);
    var tab = TABS.filter(function (t) { return t.id === active; })[0];
    tab.groups.forEach(function (g) {
      var grp = h('div', { class: 'rb-group', role: 'group', 'aria-label': g.label });
      var items = h('div', { class: 'rb-items' });
      g.items.forEach(function (it) { items.appendChild(item(it)); });
      grp.appendChild(items);
      grp.appendChild(h('div', { class: 'rb-glabel' }, g.label));
      panel.appendChild(grp);
    });
    refreshState(); refreshContext();
  }

  function keepSel(e) { e.preventDefault(); }

  function item(it) {
    if (Array.isArray(it)) {
      var label = it[1];
      var b = h('button', { type: 'button', class: 'rb-btn' + (it[3] ? ' fmt-' + it[3] : ''), title: it[2] || label, 'data-cmd': it[0], onmousedown: keepSel, onclick: function () { run(it[0], label); } }, label);
      return b;
    }
    if (it.sel) {
      var def = SELECTS[it.sel];
      var s = h('select', { class: 'rb-sel', 'aria-label': def.label, 'data-sel': it.sel, title: def.label });
      if (def.menu) s.appendChild(h('option', { value: '' }, def.label + ' ▾'));
      var opts = typeof def.options === 'function' ? def.options() : def.options;
      opts.forEach(function (o) { s.appendChild(h('option', { value: o[0] }, o[1])); });
      if (it.sel === 'fontSize') s.value = '11';
      s.addEventListener('change', function () {
        var v = s.value;
        if (def.menu) s.value = '';
        if (v !== '') run(it.sel, v);
      });
      return s;
    }
    if (it.color) {
      var inp = h('input', { type: 'color', value: it.def, 'aria-label': it.label, title: it.label });
      var apply = h('button', { type: 'button', class: 'rb-btn color-btn', title: 'Apply ' + it.label.toLowerCase(), onmousedown: keepSel, onclick: function () { run(it.color, inp.value); } }, h('span', { class: 'swatch', style: { background: it.def } }), it.label);
      inp.addEventListener('input', function () { apply.querySelector('.swatch').style.background = inp.value; });
      inp.addEventListener('change', function () { run(it.color, inp.value); });
      return h('span', { class: 'rb-color' }, apply, inp);
    }
    if (it.num) {
      var n = h('input', { type: 'number', inputmode: 'decimal', step: '0.5', min: '0', max: '200', class: 'rb-num', 'aria-label': it.label, title: it.label, placeholder: it.label.replace(/ \(.*\)/, '') });
      n.addEventListener('change', function () { run(it.num, n.value); });
      return h('label', { class: 'rb-numwrap' }, h('span', null, it.label), n);
    }
    if (it.zoom) {
      var r = h('input', { type: 'range', min: 25, max: 300, step: 5, value: 100, id: 'zoomRange', 'aria-label': 'Zoom percent' });
      r.addEventListener('input', function () { Layout.setZoom('custom', r.value / 100); Rulers.draw(); });
      return h('span', { class: 'rb-zoom' }, r, h('span', { id: 'zoomLabel', class: 'num' }, Math.round(Layout.zoom() * 100) + '%'));
    }
    return h('span');
  }

  function run(cmd, arg) {
    if (!Ed.doc) return;
    var safeCmds = /^(copy|find|select|spelling|wordCount|commentsPane|changesPane|commentPrev|commentNext|changePrev|changeNext|saveRevision|compare|readOnly|password|printLayout|readMode|outline|focus|immersive|navPane|ruler|z100|zOne|zMulti|zWidth|newWindow|split|arrange|sideBySide)$/;
    if (Ed.locked() && !safeCmds.test(cmd)) { toast(Ed.doc.status === 'final' ? 'The document is in final review. Choose "Reopen for editing" to change it.' : 'The document is protected. Unlock it in Review, Protect.', 'error'); return; }
    try { CMD[cmd] ? CMD[cmd](arg) : toast('Not available.'); }
    catch (e) { logError(e, 'ribbon:' + cmd); toast('That did not work: ' + e.message, 'error'); }
    refreshState();
  }

  function refreshState() {
    if (!$('#ribbon') || active !== 'home' && active !== 'review' && active !== 'view') return;
    ['bold', 'italic', 'underline', 'subscript', 'superscript', 'insertUnorderedList', 'insertOrderedList', 'justifyLeft', 'justifyCenter', 'justifyRight', 'justifyFull'].forEach(function (c) {
      var map = { insertUnorderedList: 'ul', insertOrderedList: 'ol', justifyLeft: 'alignLeft', justifyCenter: 'alignCenter', justifyRight: 'alignRight', justifyFull: 'alignJustify' };
      var b = $('#ribbon [data-cmd="' + (map[c] || c) + '"]');
      if (b) { var on = false; try { on = document.queryCommandState(c); } catch (e) { /* unsupported */ } b.setAttribute('aria-pressed', String(on)); }
    });
    var tr = $('#ribbon [data-cmd="track"]'); if (tr) tr.setAttribute('aria-pressed', String(Review.tracking()));
    var ro = $('#ribbon [data-cmd="readOnly"]'); if (ro && Ed.doc) ro.setAttribute('aria-pressed', String(Ed.doc.protect.mode === 'readonly'));
    var sp = $('#ribbon [data-cmd="spell"]'); if (sp) sp.setAttribute('aria-pressed', String(Ed.el().spellcheck));
    var np = $('#ribbon [data-cmd="navPane"]'); if (np) np.setAttribute('aria-pressed', String(!$('#navPane').hidden));
    var ru = $('#ribbon [data-cmd="ruler"]'); if (ru) ru.setAttribute('aria-pressed', String(Rulers.on()));
    var r = window.getSelection();
    if (r.anchorNode && Ed.el().contains(r.anchorNode)) {
      var e = r.anchorNode.nodeType === 1 ? r.anchorNode : r.anchorNode.parentNode;
      var cs = getComputedStyle(e);
      var fs = $('#ribbon [data-sel="fontSize"]'); if (fs) { var pt = Math.round(parseFloat(cs.fontSize) * PT_PER_PX * 2) / 2; fs.value = String(pt); }
      var fn = $('#ribbon [data-sel="fontName"]'); if (fn) { var fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); if (Array.prototype.some.call(fn.options, function (o) { return o.value === fam; })) fn.value = fam; }
    }
  }

  function refreshContext() {
    var tt = $('#ribbon [data-sel="tableTools"]');
    if (tt) { var c = Tables.currentCell(); tt.disabled = !c; tt.title = c ? 'Table tools' : 'Place the cursor in a table to use table tools'; }
    ['wrap', 'position'].forEach(function (k) { var s = $('#ribbon [data-sel="' + k + '"]'); if (s) { s.disabled = !Ed.selectedObject(); s.title = Ed.selectedObject() ? '' : 'Select a picture, shape, chart or text box first'; } });
  }

  return { build: build, refreshState: refreshState, refreshContext: refreshContext, run: run, TABS: TABS };
})();

/* ---------- Commands ---------- */
function exec(cmd, val) { Ed.restoreRange(); Ed.snapshot(); document.execCommand('styleWithCSS', false, true); document.execCommand(cmd, false, val); Ed.normalize(); Ed.changed(); }

/** Wrap the selection in a span with the given inline styles. */
function wrapStyle(style) {
  var r = Ed.range();
  if (!r || r.collapsed) { toast('Select some text first.'); return null; }
  Ed.snapshot();
  var span = h('span', { style: style });
  span.appendChild(r.extractContents());
  // Drop the same property from nested spans so the new value wins.
  $$('span[style]', span).forEach(function (s) { Object.keys(style).forEach(function (k) { s.style[k] = ''; }); if (!s.getAttribute('style')) s.removeAttribute('style'); });
  r.insertNode(span);
  var nr = document.createRange(); nr.selectNodeContents(span);
  var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(nr); Ed.rememberRange();
  Ed.changed();
  return span;
}

function blocksStyle(fn) {
  var bl = Ed.selectedBlocks();
  if (!bl.length) { toast('Place the cursor in a paragraph first.'); return; }
  Ed.snapshot(); bl.forEach(fn); Ed.changed();
}

/** Change case inside the selection, keeping bold, colours and other formatting. O(n) over text nodes. */
function changeCaseSel(mode) {
  var r = Ed.range();
  if (!r || r.collapsed) { toast('Select some text first.'); return; }
  Ed.snapshot();
  var w = document.createTreeWalker(r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode, NodeFilter.SHOW_TEXT);
  var nodes = [], n;
  while ((n = w.nextNode())) if (r.intersectsNode(n)) nodes.push(n);
  var full = r.toString();
  var converted = T.changeCase(full, mode), pos = 0;
  nodes.forEach(function (t) {
    var s = t === r.startContainer ? r.startOffset : 0, e = t === r.endContainer ? r.endOffset : t.length;
    var len = e - s;
    t.textContent = t.textContent.slice(0, s) + converted.slice(pos, pos + len) + t.textContent.slice(e);
    pos += len;
  });
  Ed.changed();
}

var CMD = {
  cut: function () { Ed.restoreRange(); Ed.snapshot(); if (!document.execCommand('cut')) toast('Use Ctrl+X to cut in this browser.'); Ed.changed(); },
  copy: function () { Ed.restoreRange(); if (!document.execCommand('copy')) toast('Use Ctrl+C to copy in this browser.'); else toast('Copied.'); },
  paste: function () {
    Ed.restoreRange();
    if (navigator.clipboard && navigator.clipboard.readText) {
      withRetry(function () { return navigator.clipboard.readText(); }, { tries: 1, timeout: 4000 }).then(function (t) {
        Ed.restoreRange(); Ed.snapshot();
        if (Review.tracking()) Review.trackInsertText(t); else document.execCommand('insertText', false, t);
        Ed.changed();
      }).catch(function () { toast('The browser blocked reading the clipboard. Press Ctrl+V instead.'); });
    } else toast('Press Ctrl+V to paste.');
  },
  painter: function () { Painter.capture(); },
  fontName: function (v) {
    if (v === '__import') { Fonts.importDialog(); return; }
    wrapStyle({ fontFamily: '"' + v.replace(/"/g, '') + '", sans-serif' });
  },
  fontSize: function (v) { wrapStyle({ fontSize: v + 'pt' }); },
  grow: function () { stepSize(1); }, shrink: function () { stepSize(-1); },
  bold: function () { exec('bold'); }, italic: function () { exec('italic'); }, underline: function () { exec('underline'); },
  subscript: function () { exec('subscript'); }, superscript: function () { exec('superscript'); },
  case: function (v) { changeCaseSel(v); },
  hilite: function (c) { exec('hiliteColor', c); },
  fore: function (c) { exec('foreColor', c); },
  clearFormat: function () { exec('removeFormat'); },
  ul: function () { exec('insertUnorderedList'); }, ol: function () { exec('insertOrderedList'); },
  multilevel: function () {
    exec('insertOrderedList');
    var s = window.getSelection(); var li = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('ol');
    if (li) { var root = li; while (root.parentNode.closest && root.parentNode.closest('ol') && Ed.el().contains(root.parentNode.closest('ol'))) root = root.parentNode.closest('ol'); root.classList.add('wn-multi'); Ed.changed(); toast('Multilevel list: press Tab to go down a level, Shift+Tab to go up.'); }
  },
  indent: function () { exec('indent'); }, outdent: function () { exec('outdent'); },
  alignLeft: function () { exec('justifyLeft'); }, alignCenter: function () { exec('justifyCenter'); }, alignRight: function () { exec('justifyRight'); }, alignJustify: function () { exec('justifyFull'); },
  lineSpacing: function (v) { blocksStyle(function (b) { b.style.lineHeight = v; }); },
  shade: function (c) { blocksStyle(function (b) { b.style.backgroundColor = c; b.style.padding = b.style.padding || '2px 6px'; }); },
  paraBorder: function (v) {
    blocksStyle(function (b) {
      ['border', 'borderTop', 'borderBottom', 'borderLeft'].forEach(function (k) { b.style[k] = ''; });
      var line = '1px solid #475569';
      if (v === 'box') { b.style.border = line; b.style.padding = '4px 8px'; } else if (v === 'top') b.style.borderTop = line; else if (v === 'bottom') b.style.borderBottom = line; else if (v === 'left') { b.style.borderLeft = '4px solid #047857'; b.style.paddingLeft = '10px'; }
      else b.style.padding = '';
    });
  },
  style: function (v) {
    Ed.restoreRange(); Ed.snapshot();
    var tag = { p: 'p', title: 'p', subtitle: 'p', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', quote: 'blockquote', label: 'p' }[v];
    document.execCommand('formatBlock', false, tag);
    var bl = Ed.selectedBlocks();
    bl.forEach(function (b) { b.classList.remove('wn-title', 'wn-subtitle', 'wn-label-style'); if (v === 'title') b.classList.add('wn-title'); if (v === 'subtitle') b.classList.add('wn-subtitle'); if (v === 'label') b.classList.add('wn-label-style'); if (!b.className) b.removeAttribute('class'); });
    Ed.changed();
  },
  customLabel: function () {
    var inp = h('input', { type: 'text', maxlength: 40, placeholder: 'e.g. Decision, Risk, Follow-up' });
    var col = h('input', { type: 'color', value: '#047857' });
    openDialog({ title: 'Custom label', body: h('div', null, field('Label text', inp), field('Colour', col), h('p', { class: 'hint' }, 'Labels appear as small coloured tags. A table of contents set to "Custom labels" lists them.')),
      actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: function (err) {
        var t = inp.value.trim(); if (!t) { err('Type the label text.'); return false; }
        Ed.insertNode(h('span', { class: 'wn-label', contenteditable: 'false', style: { background: col.value } }, t)); Ed.insertNode(document.createTextNode(' '));
      } }] });
  },
  find: function () { Review.find(false); }, replace: function () { Review.find(true); },
  select: function (v) {
    if (v === 'all') { var r = document.createRange(); r.selectNodeContents(Ed.el()); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); Ed.rememberRange(); Ed.el().focus(); }
    if (v === 'objects') { var objs = $$('.wn-obj, figure, table, .wn-eq', Ed.el()).filter(function (o) { return !o.closest('.wn-gen'); }); if (!objs.length) { toast('There are no pictures, shapes, charts or tables to select.'); return; } var cur = objs.indexOf(Ed.selectedObject()); var nx = objs[(cur + 1) % objs.length]; Ed.selectObject(nx); nx.scrollIntoView({ block: 'center' }); toast('Selected object ' + ((cur + 1) % objs.length + 1) + ' of ' + objs.length + '. Choose again for the next one.'); }
    if (v === 'similar') Review.selectSimilar();
  },
  spell: function () { var e = Ed.el(); e.spellcheck = !e.spellcheck; toast('Spell check ' + (e.spellcheck ? 'on' : 'off') + '.'); },
  // Insert
  cover: function (v) { Insert.cover(v); }, blankPage: function () { Ed.insertNode(h('div', { class: 'wn-pagebreak', contenteditable: 'false' })); Ed.insertNode(h('p', null, h('br'))); Ed.insertNode(h('div', { class: 'wn-pagebreak', contenteditable: 'false' })); },
  pageBreak: function () { Ed.insertNode(h('div', { class: 'wn-pagebreak', contenteditable: 'false' })); },
  table: function () { Insert.table(); }, tableTools: function (v) { Tables.tool(v); }, pictures: function () { Insert.pictures(); }, shape: function () { Insert.shape(); }, chart: function () { Insert.chart(); },
  link: function () { Insert.link(); }, comment: function () { Review.addComment(); }, headerFooter: function () { Insert.headerFooter(); },
  textBox: function (v) { Insert.textBox(v); }, signature: function () { Insert.signature(); }, dateTime: function (v) { Insert.dateTime(v); }, equation: function () { Insert.equation(); }, symbol: function () { Insert.symbol(); },
  // Layout
  pageBorders: function () { Insert.pageBorders(); }, pageColor: function (c) { Ed.doc.layout.pageColor = c; Ed.changed(); }, watermark: function () { Insert.watermark(); },
  margins: function (v) { if (v === 'custom') { Insert.customMargins(); return; } Ed.doc.layout.margins = v; Ed.changed(); },
  orientation: function (v) { Ed.doc.layout.orientation = v; Ed.changed(); },
  size: function (v) { Ed.doc.layout.size = v; Ed.changed(); },
  columns: function (v) { Insert.columns(+v); },
  breaks: function (v) { Ed.insertNode(h('div', { class: v === 'column' ? 'wn-colbreak' : v === 'section' ? 'wn-pagebreak wn-section' : 'wn-pagebreak', contenteditable: 'false' })); },
  indentL: function (v) { var n = +v; if (!(n >= 0 && n <= 200)) { toast('Enter 0 to 200 mm.', 'error'); return; } blocksStyle(function (b) { b.style.marginLeft = n + 'mm'; }); },
  indentR: function (v) { var n = +v; if (!(n >= 0 && n <= 200)) { toast('Enter 0 to 200 mm.', 'error'); return; } blocksStyle(function (b) { b.style.marginRight = n + 'mm'; }); },
  spBefore: function (v) { var n = +v; if (!(n >= 0 && n <= 200)) { toast('Enter 0 to 200 pt.', 'error'); return; } blocksStyle(function (b) { b.style.marginTop = n + 'pt'; }); },
  spAfter: function (v) { var n = +v; if (!(n >= 0 && n <= 200)) { toast('Enter 0 to 200 pt.', 'error'); return; } blocksStyle(function (b) { b.style.marginBottom = n + 'pt'; }); },
  wrap: function (v) { Insert.wrap(v); }, position: function (v) { Insert.position(v); },
  // References
  toc: function () { Refs.insertToc(); }, tocUpdate: function () { var n = Refs.updateTocs(true); Ed.changed(); toast(n ? 'Table of contents updated.' : 'No table of contents yet. Insert one first.'); },
  caption: function () { Refs.caption(); }, footnote: function () { Refs.footnote(); },
  // Review
  spelling: function () { Review.spellingPanel(); }, wordCount: function () { Review.wordCountDialog(); },
  commentsPane: function () { Review.commentsPanel(); }, commentDelete: function () { Review.deleteComment(); }, commentPrev: function () { Review.jumpComment(-1); }, commentNext: function () { Review.jumpComment(1); },
  track: function () { Review.toggleTrack(); }, changesPane: function () { Review.changesPanel(); }, changePrev: function () { Review.jumpChange(-1); }, changeNext: function () { Review.jumpChange(1); },
  accept: function () { Review.decide(true); }, reject: function () { Review.decide(false); }, acceptAll: function () { Review.decideAll(true); }, rejectAll: function () { Review.decideAll(false); },
  saveRevision: function () { Review.saveRevision(); }, compare: function () { Review.compareDialog(); },
  readOnly: function () { Review.toggleReadOnly(); }, password: function () { Review.passwordDialog(); },
  // View
  printLayout: function () { Views.printLayout(); }, readMode: function () { Views.readMode(); }, outline: function () { Views.outline(); }, focus: function () { Views.focus(); }, immersive: function () { Views.immersive(); },
  navPane: function () { Views.navPane(); }, ruler: function () { Rulers.toggle(); Ribbon.refreshState(); },
  z100: function () { Layout.setZoom('custom', 1); Rulers.draw(); }, zOne: function () { Layout.setZoom('page'); Rulers.draw(); }, zMulti: function () { Views.multiPages(); }, zWidth: function () { Layout.setZoom('width'); Rulers.draw(); },
  newWindow: function () { Views.newWindow(); }, split: function (v) { Views.split(v); }, arrange: function () { Views.arrange(); }, sideBySide: function () { Views.sideBySide(); }
};

function stepSize(dir) {
  var r = Ed.range();
  if (!r) return;
  var e = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
  var pt = parseFloat(getComputedStyle(e).fontSize) * PT_PER_PX;
  var i = 0;
  while (i < SIZES_PT.length && SIZES_PT[i] <= pt + 0.01) i++;
  var next = dir > 0 ? SIZES_PT[Math.min(i, SIZES_PT.length - 1)] : SIZES_PT[Math.max(0, i - 2)];
  wrapStyle({ fontSize: next + 'pt' });
}

/* ---------- Format painter ---------- */
var Painter = (function () {
  var style = null;
  var PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecorationLine', 'color', 'backgroundColor'];
  function capture() {
    var r = Ed.range();
    if (!r) { toast('Select the text whose formatting you want to copy.'); return; }
    var e = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    if (r.startContainer.nodeType === 3 && r.startOffset === r.startContainer.length && r.startContainer.nextSibling && r.startContainer.nextSibling.nodeType === 1) e = r.startContainer.nextSibling;
    var cs = getComputedStyle(e);
    style = {};
    PROPS.forEach(function (p) { style[p === 'textDecorationLine' ? 'textDecoration' : p] = cs[p]; });
    if (style.backgroundColor === 'rgba(0, 0, 0, 0)') delete style.backgroundColor;
    document.body.classList.add('painting');
    toast('Formatting copied. Now select the text to apply it to. Press Esc to cancel.');
  }
  function maybeApply() {
    if (!style) return;
    var s = window.getSelection();
    if (!s.rangeCount || s.getRangeAt(0).collapsed) return;
    Ed.rememberRange();
    var st = style; style = null; document.body.classList.remove('painting');
    wrapStyle(st);
    toast('Formatting applied.');
  }
  function cancel() { if (style) { style = null; document.body.classList.remove('painting'); } }
  return { capture: capture, maybeApply: maybeApply, cancel: cancel };
})();

/* ---------- Custom fonts: loaded with the FontFace API and kept in IndexedDB ---------- */
var Fonts = (function () {
  var loaded = [];
  function names() { return loaded.map(function (f) { return f.name; }); }
  function add(name, buf) {
    var ff = new FontFace(name, buf);
    return ff.load().then(function (f) { document.fonts.add(f); if (names().indexOf(name) < 0) loaded.push({ name: name }); });
  }
  function init() {
    return Store.kvGet('fonts').then(function (list) {
      return Promise.all((list || []).map(function (f) { return add(f.name, f.buf).catch(function (e) { logError(e, 'font ' + f.name); }); }));
    });
  }
  function importDialog() {
    var file = h('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2' });
    var name = h('input', { type: 'text', maxlength: 60, placeholder: 'Name to show in the font list' });
    file.addEventListener('change', function () { if (file.files[0] && !name.value) name.value = file.files[0].name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); });
    openDialog({ title: 'Import a font', body: h('div', null, field('Font file (.ttf, .otf, .woff, .woff2)', file), field('Font name', name), h('p', { class: 'hint' }, 'The font stays in this browser. Other people need the same font installed to see it in exports.')),
      actions: [{ label: 'Cancel' }, { label: 'Import', primary: true, onClick: function (err) {
        var f = file.files[0], n = name.value.trim().replace(/["'<>\\]/g, '');
        if (!f) { err('Choose a font file.'); return false; }
        if (!/\.(ttf|otf|woff2?)$/i.test(f.name)) { err('Only .ttf, .otf, .woff or .woff2 files can be imported.'); return false; }
        if (f.size > 8 * 1048576) { err('The font file is over 8 MB.'); return false; }
        if (!n) { err('Give the font a name.'); return false; }
        return readFileAs(f, 'buffer').then(function (buf) {
          return add(n, buf).then(function () {
            return Store.kvGet('fonts').then(function (list) { list = (list || []).filter(function (x) { return x.name !== n; }); list.push({ name: n, buf: buf }); return Store.kvSet('fonts', list); });
          }).then(function () { Ribbon.build(); toast('Font "' + n + '" imported. Pick it from the Font list.'); return true; });
        }).catch(function (e) { logError(e, 'font import'); err('This file is not a font the browser can read (' + e.message + ').'); return false; });
      } }] });
  }
  return { names: names, init: init, importDialog: importDialog };
})();

/* ---------- Tables ---------- */
var Tables = (function () {
  function build(r, c, style, headRow, headCol) {
    var t = h('table', { class: 'wn-table wn-style-' + style });
    var start = 0;
    if (headRow) {
      var trh = h('tr');
      for (var j = 0; j < c; j++) trh.appendChild(h('th', { scope: 'col' }, 'Heading ' + (j + 1)));
      t.appendChild(h('thead', null, trh)); start = 1;
    }
    var tb = h('tbody');
    for (var i = start; i < Math.max(r, start + 1); i++) {
      var tr = h('tr');
      for (var k = 0; k < c; k++) tr.appendChild(headCol && k === 0 ? h('th', { scope: 'row' }, h('br')) : h('td', null, h('br')));
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    return t;
  }
  function currentCell() {
    var s = window.getSelection();
    var n = s.anchorNode;
    if (!n || !Ed.el().contains(n)) return null;
    var c = (n.nodeType === 1 ? n : n.parentNode).closest('td,th');
    return c && !c.closest('.wn-gen') ? c : null;
  }
  /** Grid map with row and column spans resolved: O(cells). */
  function map(table) {
    var grid = [], pos = new Map();
    Array.prototype.forEach.call(table.rows, function (tr, r) {
      grid[r] = grid[r] || [];
      var c = 0;
      Array.prototype.forEach.call(tr.cells, function (cell) {
        while (grid[r][c]) c++;
        var rs = cell.rowSpan || 1, cs = cell.colSpan || 1;
        pos.set(cell, { r: r, c: c, rs: rs, cs: cs });
        for (var i = 0; i < rs; i++) for (var j = 0; j < cs; j++) { grid[r + i] = grid[r + i] || []; grid[r + i][c + j] = cell; }
        c += cs;
      });
    });
    return { grid: grid, pos: pos, width: grid.reduce(function (m, row) { return Math.max(m, row.length); }, 0) };
  }
  function selectedCells(table) {
    var r = Ed.range(); if (!r) return [];
    return $$('td,th', table).filter(function (c) { return r.intersectsNode(c); });
  }
  function splitCell(cell) {
    var table = cell.closest('table'), m = map(table), p = m.pos.get(cell);
    if (p.rs === 1 && p.cs === 1) return false;
    cell.rowSpan = 1; cell.colSpan = 1;
    for (var rr = p.r; rr < p.r + p.rs; rr++) {
      var tr = table.rows[rr];
      for (var cc = p.c; cc < p.c + p.cs; cc++) {
        if (rr === p.r && cc === p.c) continue;
        var before = null;
        Array.prototype.some.call(tr.cells, function (x) { var q = m.pos.get(x); if (q && q.c > cc) { before = x; return true; } return false; });
        var nc = h(cell.tagName.toLowerCase(), null, h('br'));
        if (before) tr.insertBefore(nc, before); else tr.appendChild(nc);
      }
    }
    return true;
  }
  /** Structural edits first undo merges in the table so rows and columns are simple. */
  function unmergeAll(table) { var any = false; $$('td,th', table).forEach(function (c) { if ((c.rowSpan > 1 || c.colSpan > 1) && splitCell(c)) any = true; }); if (any) toast('Merged cells in this table were split first.'); }
  function tool(v) {
    var cell = currentCell();
    if (!cell) { toast('Place the cursor in a table cell first.'); return; }
    var table = cell.closest('table');
    Ed.snapshot();
    if (v === 'merge') {
      var cells = selectedCells(table); if (cells.length < 2) { toast('Select two or more cells to merge.'); return; }
      var m = map(table), r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
      cells.forEach(function (c) { var p = m.pos.get(c); r0 = Math.min(r0, p.r); c0 = Math.min(c0, p.c); r1 = Math.max(r1, p.r + p.rs - 1); c1 = Math.max(c1, p.c + p.cs - 1); });
      var inside = new Set();
      for (var i = r0; i <= r1; i++) for (var j = c0; j <= c1; j++) inside.add(m.grid[i][j]);
      var bad = Array.from(inside).some(function (c) { var p = m.pos.get(c); return p.r < r0 || p.c < c0 || p.r + p.rs - 1 > r1 || p.c + p.cs - 1 > c1; });
      if (bad) { toast('Select a rectangle of cells to merge.', 'error'); return; }
      var first = m.grid[r0][c0];
      inside.forEach(function (c) { if (c !== first) { if (c.textContent.trim()) { first.appendChild(document.createTextNode(' ')); while (c.firstChild) first.appendChild(c.firstChild); } c.remove(); } });
      first.rowSpan = r1 - r0 + 1; first.colSpan = c1 - c0 + 1;
    } else if (v === 'split') { if (!splitCell(cell)) toast('This cell is not merged. Only merged cells can be split.'); }
    else if (v === 'rowAbove' || v === 'rowBelow') {
      unmergeAll(table);
      var tr = cell.closest('tr'), n = map(table).width, ntr = h('tr');
      for (var k = 0; k < n; k++) ntr.appendChild(h(tr.parentNode.tagName === 'THEAD' ? 'td' : 'td', null, h('br')));
      if (tr.parentNode.tagName === 'THEAD') { var tb = table.tBodies[0] || table.appendChild(h('tbody')); tb.insertBefore(ntr, tb.firstChild); }
      else if (v === 'rowAbove') tr.before(ntr); else tr.after(ntr);
    } else if (v === 'colLeft' || v === 'colRight') {
      unmergeAll(table);
      var mc = map(table), ci = mc.pos.get(currentCell() || cell).c + (v === 'colRight' ? 1 : 0);
      Array.prototype.forEach.call(table.rows, function (row, ri) {
        var nc = h(row.parentNode.tagName === 'THEAD' ? 'th' : 'td', null, h('br'));
        var ref = row.cells[ci] || null; row.insertBefore(nc, ref);
      });
    } else if (v === 'delRow') {
      unmergeAll(table); var row = (currentCell() || cell).closest('tr'); row.remove(); if (!table.rows.length) table.closest('.wn-block') ? table.closest('.wn-block').remove() : table.remove();
    } else if (v === 'delCol') {
      unmergeAll(table); var md = map(table), col = md.pos.get(currentCell() || cell).c;
      Array.prototype.forEach.call(table.rows, function (row) { if (row.cells[col]) row.cells[col].remove(); });
      if (!table.querySelector('td,th')) table.remove();
    } else if (v === 'shade') {
      var col2 = h('input', { type: 'color', value: '#ecfdf5' });
      openDialog({ title: 'Cell shading', body: field('Colour', col2), actions: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: function () { var cs = selectedCells(table); (cs.length ? cs : [cell]).forEach(function (c) { c.style.backgroundColor = col2.value; }); Ed.changed(); } }] });
      return;
    } else if (v === 'cellBorders' || v === 'cellNoBorders') {
      var cs2 = selectedCells(table); (cs2.length ? cs2 : [cell]).forEach(function (c) { c.style.border = v === 'cellBorders' ? '1px solid #475569' : 'none'; });
    } else if (v === 'delTable') { var blk = table.closest('.wn-block'); (blk && blk.querySelectorAll('table').length === 1 ? blk : table).remove(); }
    Ed.changed();
  }
  function moveCell(cell, dir) {
    var cells = $$('td,th', cell.closest('table'));
    var i = cells.indexOf(cell) + dir;
    if (i >= cells.length) { var r = document.createRange(); r.selectNodeContents(cell); r.collapse(false); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); tool('rowBelow'); cells = $$('td,th', cell.closest('table')); i = cells.indexOf(cell) + 1; }
    if (i < 0) return;
    var t = cells[i]; var rg = document.createRange(); rg.selectNodeContents(t); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rg); Ed.rememberRange();
  }
  return { build: build, currentCell: currentCell, map: map, tool: tool, moveCell: moveCell, splitCell: splitCell };
})();

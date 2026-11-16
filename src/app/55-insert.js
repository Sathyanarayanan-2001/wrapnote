/* WrapNote app: Insert and Design dialogs, plus References (contents, captions, footnotes). */
var Insert = (function () {
  function sel(options, value) { var s = h('select'); options.forEach(function (o) { var op = h('option', { value: o[0] }, o[1]); if (String(o[0]) === String(value)) op.selected = true; s.appendChild(op); }); return s; }

  function table() {
    var r = h('input', { type: 'number', min: 1, max: 60, value: 3, inputmode: 'numeric' }), c = h('input', { type: 'number', min: 1, max: 12, value: 3, inputmode: 'numeric' });
    var st = sel([['corporate', 'Corporate header'], ['striped', 'Striped'], ['minimal', 'Minimal grid'], ['borderless', 'Borderless']]);
    var hr = h('input', { type: 'checkbox', checked: true }), hc = h('input', { type: 'checkbox' });
    openDialog({ title: 'Insert table', body: h('div', null, h('div', { class: 'grid2' }, field('Rows', r), field('Columns', c)), field('Table style', st), h('label', { class: 'chk' }, hr, 'Header row'), h('label', { class: 'chk' }, hc, 'Header column')),
      actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: function (err) {
        var rr = +r.value, cc = +c.value;
        if (!Number.isInteger(rr) || rr < 1 || rr > 60) { err('Rows must be a whole number from 1 to 60.'); return false; }
        if (!Number.isInteger(cc) || cc < 1 || cc > 12) { err('Columns must be a whole number from 1 to 12.'); return false; }
        Ed.insertNode(Tables.build(rr, cc, st.value, hr.checked, hc.checked));
      } }] });
  }

  function pictures() {
    var f = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    f.addEventListener('change', function () { Intake.addImages(Array.from(f.files), 'images', f.files.length === 1); });
    document.body.appendChild(f); f.click(); setTimeout(function () { f.remove(); }, 60000);
  }

  /* ---------- Shapes ---------- */
  var SHAPES = {
    rect: function (o) { return '<rect x="4" y="4" width="192" height="92" rx="2" fill="' + o.fill + '" stroke="' + o.stroke + '" stroke-width="' + o.sw + '"/>'; },
    round: function (o) { return '<rect x="4" y="4" width="192" height="92" rx="18" fill="' + o.fill + '" stroke="' + o.stroke + '" stroke-width="' + o.sw + '"/>'; },
    ellipse: function (o) { return '<ellipse cx="100" cy="50" rx="95" ry="45" fill="' + o.fill + '" stroke="' + o.stroke + '" stroke-width="' + o.sw + '"/>'; },
    arrow: function (o) { return '<polygon points="4,35 140,35 140,8 196,50 140,92 140,65 4,65" fill="' + o.fill + '" stroke="' + o.stroke + '" stroke-width="' + o.sw + '"/>'; },
    line: function (o) { return '<line x1="6" y1="50" x2="194" y2="50" stroke="' + o.stroke + '" stroke-width="' + Math.max(2, o.sw) + '" stroke-linecap="round"/>'; },
    callout: function (o) { return '<path d="M8 6 H192 V70 H70 L44 94 L50 70 H8 Z" fill="' + o.fill + '" stroke="' + o.stroke + '" stroke-width="' + o.sw + '" stroke-linejoin="round"/>'; }
  };
  function shapeSVG(o) {
    var color = /^#[0-9a-f]{6}$/i;
    o.fill = color.test(o.fill) ? o.fill : '#d1fae5'; o.stroke = color.test(o.stroke) ? o.stroke : '#047857'; o.sw = Math.max(0, Math.min(8, +o.sw || 2));
    var txt = o.text ? '<text x="' + (o.shape === 'callout' ? 100 : 100) + '" y="' + (o.shape === 'callout' ? 42 : 55) + '" text-anchor="middle" font-size="14" fill="#0f172a">' + esc(o.text.slice(0, 60)) + '</text>' : '';
    return '<svg viewBox="0 0 200 100" role="img" aria-label="' + esc(o.text || o.shape) + '">' + (SHAPES[o.shape] || SHAPES.rect)(o) + txt + '</svg>';
  }
  function shape(existing) {
    var data = existing ? JSON.parse(existing.getAttribute('data-shape') || '{}') : { shape: 'rect', fill: '#d1fae5', stroke: '#047857', sw: 2, text: '' };
    var s = sel([['rect', 'Rectangle'], ['round', 'Rounded rectangle'], ['ellipse', 'Ellipse'], ['arrow', 'Block arrow'], ['line', 'Line'], ['callout', 'Callout']], data.shape);
    var fill = h('input', { type: 'color', value: data.fill }), stroke = h('input', { type: 'color', value: data.stroke });
    var sw = h('input', { type: 'number', min: 0, max: 8, value: data.sw, inputmode: 'numeric' }), txt = h('input', { type: 'text', maxlength: 60, value: data.text || '' });
    var prev = h('div', { class: 'shape-prev' });
    function upd() { prev.innerHTML = shapeSVG({ shape: s.value, fill: fill.value, stroke: stroke.value, sw: sw.value, text: txt.value }); }
    [s, fill, stroke, sw, txt].forEach(function (x) { x.addEventListener('input', upd); }); upd();
    openDialog({ title: existing ? 'Edit shape' : 'Insert shape', body: h('div', null, field('Shape', s), h('div', { class: 'grid3' }, field('Fill', fill), field('Outline', stroke), field('Outline width', sw)), field('Text inside (optional)', txt), prev),
      actions: [{ label: 'Cancel' }, { label: existing ? 'Update' : 'Insert', primary: true, onClick: function () {
        var o = { shape: s.value, fill: fill.value, stroke: stroke.value, sw: +sw.value, text: txt.value.trim() };
        var fig = h('figure', { class: 'wn-obj wn-shape wrap-inline', contenteditable: 'false', 'data-shape': JSON.stringify(o), html: shapeSVG(o) });
        if (existing) { Ed.snapshot(); fig.className = existing.className; existing.replaceWith(fig); Ed.changed(); } else Ed.insertNode(fig);
      } }] });
  }

  /* ---------- Charts with inline data editor ---------- */
  function chartSVG(c) {
    var rows = c.rows.filter(function (r) { return r[0] !== '' || r[1] !== ''; });
    var title = c.title ? '<text x="260" y="18" text-anchor="middle" font-size="14" font-weight="600" fill="#0f172a">' + esc(c.title) + '</text>' : '';
    if (c.type === 'pie') {
      var total = rows.reduce(function (s, r) { return s + Math.max(0, +r[1] || 0); }, 0) || 1, a0 = -Math.PI / 2, out = '';
      rows.forEach(function (r) {
        var v = Math.max(0, +r[1] || 0), a1 = a0 + v / total * 2 * Math.PI;
        var x0 = 150 + 90 * Math.cos(a0), y0 = 130 + 90 * Math.sin(a0), x1 = 150 + 90 * Math.cos(a1), y1 = 130 + 90 * Math.sin(a1);
        var large = a1 - a0 > Math.PI ? 1 : 0;
        out += v >= total ? '<circle cx="150" cy="130" r="90" fill="' + colorFor(r[0]) + '"/>' : '<path d="M150 130 L' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A90 90 0 ' + large + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' Z" fill="' + colorFor(r[0]) + '" stroke="#fff" stroke-width="1"><title>' + esc(r[0] + ': ' + r[1]) + '</title></path>';
        a0 = a1;
      });
      var leg = rows.map(function (r, i) { return '<rect x="270" y="' + (50 + i * 20) + '" width="12" height="12" fill="' + colorFor(r[0]) + '"/><text x="288" y="' + (61 + i * 20) + '" font-size="12" fill="#0f172a">' + esc(String(r[0]).slice(0, 24) + ' (' + (Math.round((Math.max(0, +r[1] || 0) / total) * 1000) / 10) + '%)') + '</text>'; }).join('');
      return '<svg viewBox="0 0 520 240" role="img" aria-label="' + esc(c.title || 'Pie chart') + '">' + title + out + leg + '</svg>';
    }
    var vals = rows.map(function (r) { return +r[1] || 0; });
    var max = Charts.niceMax(Math.max.apply(null, vals.concat([1]))), L = 50, B = 40, T = 30, W = 520, H = 240;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(c.title || 'Chart') + '">' + title;
    for (var i = 0; i <= 4; i++) { var y = T + (H - B - T) * (1 - i / 4); s += '<line x1="' + L + '" x2="' + (W - 8) + '" y1="' + y + '" y2="' + y + '" stroke="#e2e8f0"/><text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="#475569">' + esc(M.formatCount(max * i / 4)) + '</text>'; }
    var bw = (W - L - 10) / Math.max(1, rows.length);
    var pts = [];
    rows.forEach(function (r, i) {
      var v = vals[i], bh = (H - B - T) * (v / max), x = L + i * bw;
      if (c.type === 'bar') s += '<rect x="' + (x + bw * 0.18).toFixed(1) + '" y="' + (H - B - bh).toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + Math.max(0, bh).toFixed(1) + '" fill="' + colorFor(r[0]) + '"><title>' + esc(r[0] + ': ' + r[1]) + '</title></rect>';
      pts.push((x + bw / 2).toFixed(1) + ',' + (H - B - bh).toFixed(1));
      s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - B + 16) + '" text-anchor="middle" font-size="11" fill="#475569">' + esc(String(r[0]).slice(0, 12)) + '</text>';
    });
    if (c.type === 'line') { s += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#047857" stroke-width="2.5"/>'; pts.forEach(function (p) { var xy = p.split(','); s += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="3.5" fill="#047857"/>'; }); }
    return s + '</svg>';
  }
  function chartTable(c) {
    return '<table class="wn-chart-data"><thead><tr><th>Item</th><th>Value</th></tr></thead><tbody>' + c.rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  function chart(existing) {
    var c = existing ? JSON.parse(existing.getAttribute('data-chart') || '{}') : { type: 'bar', title: 'Chart title', rows: [['North', '12'], ['South', '19'], ['East', '7']] };
    var type = sel([['bar', 'Bar'], ['line', 'Line'], ['pie', 'Pie']], c.type), title = h('input', { type: 'text', maxlength: 80, value: c.title || '' });
    var grid = h('div', { class: 'data-ed' }), prev = h('div', { class: 'chart-prev' }), err = h('p', { class: 'hint err' });
    function rowsNow() { return $$('.de-row', grid).map(function (r) { return [$('.de-l', r).value.slice(0, 40), $('.de-v', r).value.trim()]; }); }
    function upd() {
      var rows = rowsNow(), bad = rows.filter(function (r) { return r[1] !== '' && !/^-?\d+(\.\d+)?$/.test(r[1]); });
      err.textContent = bad.length ? 'Value "' + bad[0][1] + '" is not a number. Use digits, for example 12 or 4.5.' : '';
      prev.innerHTML = chartSVG({ type: type.value, title: title.value, rows: rows });
    }
    function addRow(r) {
      var row = h('div', { class: 'de-row' }, h('input', { type: 'text', class: 'de-l', value: r[0], 'aria-label': 'Label' }), h('input', { type: 'text', inputmode: 'decimal', class: 'de-v', value: r[1], 'aria-label': 'Value' }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove row', onclick: function () { row.remove(); upd(); } }, '×'));
      $$('input', row).forEach(function (i) { i.addEventListener('input', upd); });
      grid.appendChild(row);
    }
    c.rows.forEach(addRow);
    [type, title].forEach(function (x) { x.addEventListener('input', upd); }); upd();
    openDialog({ title: existing ? 'Edit chart' : 'Insert chart', wide: true, body: h('div', { class: 'chart-dlg' }, h('div', null, field('Chart type', type), field('Title', title), h('div', { class: 'lbl' }, 'Data (label and value)'), grid,
      h('button', { type: 'button', class: 'btn sm', onclick: function () { addRow(['', '']); } }, '+ Add row'), err), prev),
      actions: [{ label: 'Cancel' }, { label: existing ? 'Update' : 'Insert', primary: true, onClick: function (e) {
        upd(); if (err.textContent) { e(err.textContent); return false; }
        var cc = { type: type.value, title: title.value, rows: rowsNow().filter(function (r) { return r[0] || r[1]; }) };
        if (!cc.rows.length) { e('Add at least one row of data.'); return false; }
        var fig = h('figure', { class: 'wn-obj wn-chart wrap-inline', contenteditable: 'false', 'data-chart': JSON.stringify(cc), 'data-display': 'chart', html: chartSVG(cc) + chartTable(cc) + '<span class="wn-chart-toggle">Show table</span>' });
        if (existing) { Ed.snapshot(); fig.className = existing.className; existing.replaceWith(fig); Ed.changed(); } else Ed.insertNode(fig);
      } }] });
  }

  function link() {
    var r = Ed.range(), text = r ? r.toString() : '';
    var url = h('input', { type: 'url', inputmode: 'url', placeholder: 'https://example.org' }), label = h('input', { type: 'text', value: text });
    openDialog({ title: 'Insert link', body: h('div', null, field('Address', url, 'Starts with https://, http:// or mailto:'), field('Text to show', label)),
      actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: function (err) {
        var u = url.value.trim();
        if (!S.isSafeUrl(u) || u.charAt(0) === '#') { err('Use a web address starting with https:// or http://, or an email link starting with mailto:.'); return false; }
        Ed.restoreRange();
        Ed.insertNode(h('a', { href: u, rel: 'noopener noreferrer' }, label.value.trim() || u));
      } }] });
  }

  function headerFooter() {
    var L = Ed.doc.layout;
    var ht = h('input', { type: 'text', value: L.header.text, maxlength: 200, placeholder: 'e.g. {title}' }), ha = sel([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], L.header.align);
    var ft = h('input', { type: 'text', value: L.footer.text, maxlength: 200, placeholder: 'e.g. Confidential · {date}' }), fa = sel([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], L.footer.align);
    var show = h('input', { type: 'checkbox' }); show.checked = L.pageNumbers.show;
    var fmt = sel([['Page X of Y', 'Page X of Y'], ['Page X', 'Page X'], ['X', 'X'], ['X / Y', 'X / Y']], L.pageNumbers.format);
    var pos = sel([['bottom', 'Bottom of page'], ['top', 'Top of page'], ['margin-left', 'Left margin'], ['margin-right', 'Right margin']], L.pageNumbers.pos);
    var al = sel([['left', 'Left'], ['center', 'Center'], ['right', 'Right']], L.pageNumbers.align);
    openDialog({ title: 'Header, footer and page numbers', body: h('div', null,
      h('div', { class: 'grid2' }, field('Header text', ht), field('Header alignment', ha)),
      h('div', { class: 'grid2' }, field('Footer text', ft), field('Footer alignment', fa)),
      h('p', { class: 'hint' }, 'You can use {title}, {date}, {page} and {pages} in the text.'),
      h('label', { class: 'chk' }, show, 'Show page numbers'), h('div', { class: 'grid3' }, field('Format', fmt), field('Position', pos), field('Alignment', al))),
      actions: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: function () {
        L.header = { text: ht.value, align: ha.value }; L.footer = { text: ft.value, align: fa.value };
        L.pageNumbers = { show: show.checked, format: fmt.value, pos: pos.value, align: al.value }; Ed.changed();
      } }] });
  }

  function textBox(v) {
    var box = h('div', { class: 'wn-obj wn-textbox ' + (v === 'float' ? 'wrap-square float-right' : 'wrap-inline'), contenteditable: 'false' }, h('div', { class: 'wn-textbox-inner', contenteditable: 'true' }, h('p', null, 'Type in the text box')));
    Ed.insertNode(box); Ed.selectObject(box);
  }

  function signature() {
    var name = h('input', { type: 'text', maxlength: 80, placeholder: 'Signer name' }), title = h('input', { type: 'text', maxlength: 80, placeholder: 'Title or role' });
    openDialog({ title: 'Signature line', body: h('div', null, field('Name', name), field('Title', title)), actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: function () {
      Ed.insertNode(h('div', { class: 'wn-sign', contenteditable: 'false' }, h('div', { class: 'wn-sign-line' }), h('p', { class: 'wn-sign-name' }, name.value || 'Name'), h('p', { class: 'wn-sign-title' }, title.value || 'Title'), h('p', { class: 'wn-sign-date' }, 'Date: ____________')));
    } }] });
  }

  function dateTime(v) {
    var now = new Date(), iso = D.localISO(now);
    var txt = v === 'dmy' ? D.formatDMY(iso) : v === 'dmyhm' ? D.formatDateTime(now) : v === 'week' ? D.isoWeek(iso).label + ' · ' + D.financialYear(iso).label
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()] + ', ' + now.getDate() + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][now.getMonth()] + ' ' + now.getFullYear();
    Ed.insertNode(document.createTextNode(txt));
  }

  /* ---------- Equation builder ---------- */
  function equation(existing) {
    var src = h('textarea', { rows: 3, spellcheck: 'false', 'aria-label': 'LaTeX' }); src.value = existing ? existing.getAttribute('data-tex') : '\\frac{a+b}{2}';
    var disp = h('input', { type: 'checkbox' }); disp.checked = existing ? existing.getAttribute('data-display') === 'block' : true;
    var prev = h('div', { class: 'eq-prev', 'aria-live': 'polite' }), err = h('p', { class: 'hint err' });
    function upd() { var r = WN.latex.toMathML(src.value, true); prev.innerHTML = sanitizeHtml(r.xml); err.textContent = r.errors.join(' '); }
    src.addEventListener('input', upd); upd();
    var tpl = [['Fraction', '\\frac{a}{b}'], ['Root', '\\sqrt{x}'], ['Power', 'x^{2}'], ['Index', 'x_{i}'], ['Sum', '\\sum_{i=1}^{n} '], ['Integral', '\\int_{a}^{b} '], ['Limit', '\\lim_{x \\to 0} '], ['α', '\\alpha'], ['β', '\\beta'], ['π', '\\pi'], ['θ', '\\theta'], ['Δ', '\\Delta'], ['Σ', '\\Sigma'], ['±', '\\pm'], ['×', '\\times'], ['≤', '\\leq'], ['≥', '\\geq'], ['≠', '\\neq'], ['→', '\\to'], ['∞', '\\infty']];
    var pad = h('div', { class: 'eq-pad' }, tpl.map(function (t) { return h('button', { type: 'button', class: 'btn sm', onclick: function () { var a = src.selectionStart; src.value = src.value.slice(0, a) + t[1] + src.value.slice(src.selectionEnd); src.focus(); src.selectionStart = src.selectionEnd = a + t[1].length; upd(); } }, t[0]); }));
    openDialog({ title: existing ? 'Edit equation' : 'Insert equation', wide: true, body: h('div', null, pad, field('Equation (LaTeX)', src), h('label', { class: 'chk' }, disp, 'Display on its own line'), h('div', { class: 'lbl' }, 'Preview'), prev, err),
      actions: [{ label: 'Cancel' }, { label: existing ? 'Update' : 'Insert', primary: true, onClick: function (e) {
        var r = WN.latex.toMathML(src.value, disp.checked);
        if (!src.value.trim()) { e('Type an equation first.'); return false; }
        var node = h(disp.checked ? 'div' : 'span', { class: 'wn-eq' + (disp.checked ? ' block' : ''), contenteditable: 'false', 'data-tex': src.value.slice(0, 2000), 'data-display': disp.checked ? 'block' : 'inline', html: sanitizeHtml(r.xml) });
        if (existing) { Ed.snapshot(); existing.replaceWith(node); Ed.changed(); } else Ed.insertNode(node);
      } }] });
  }

  function symbol() {
    var SYM = '© ® ™ ± ≠ ≤ ≥ ≈ ∞ → ← ↑ ↓ ⇒ ° µ × ÷ √ ∑ ∫ ∂ ∆ ∇ ∈ ∉ ∩ ∪ ⊂ ∀ ∃ ¬ α β γ δ ε ζ η θ λ μ π ρ σ τ φ χ ψ ω Γ Δ Θ Λ Π Σ Φ Ψ Ω ₹ € £ ¥ § ¶ † ‡ • … ‰ ½ ¼ ¾ ² ³ ✓ ✗ ★ ☐ ☑'.split(' ');
    var dlg;
    var grid = h('div', { class: 'sym-grid' }, SYM.map(function (s) { return h('button', { type: 'button', class: 'sym', 'aria-label': 'Insert ' + s, onclick: function () { Ed.insertNode(document.createTextNode(s)); dlg.close(); } }, s); }));
    dlg = openDialog({ title: 'Insert symbol', body: grid, actions: [{ label: 'Close' }] });
  }

  function cover(kind) {
    var t = h('input', { type: 'text', value: Ed.doc.title || '', maxlength: 120 }), sub = h('input', { type: 'text', maxlength: 160 }), au = h('input', { type: 'text', maxlength: 120, value: settings.get('author', '') }), org = h('input', { type: 'text', maxlength: 120 });
    openDialog({ title: kind === 'academic' ? 'Academic cover page' : 'Corporate cover page', body: h('div', null, field('Title', t), field('Subtitle', sub), field(kind === 'academic' ? 'Author / student' : 'Prepared by', au), field(kind === 'academic' ? 'Institution / course' : 'Organisation', org)),
      actions: [{ label: 'Cancel' }, { label: 'Insert at start', primary: true, onClick: function () {
        Ed.snapshot();
        var c = h('section', { class: 'wn-cover wn-cover-' + kind, 'data-block': MODEL.uid('b'), 'data-btype': 'text' },
          h('p', { class: 'wn-cover-org' }, org.value || (kind === 'academic' ? 'Institution' : 'Organisation')), h('h1', { class: 'wn-cover-title' }, t.value || 'Document title'),
          h('p', { class: 'wn-cover-sub' }, sub.value || 'Subtitle'), h('p', { class: 'wn-cover-meta' }, (au.value || 'Author') + ' · ' + D.formatDMY(D.localISO())));
        var d = Ed.el(); d.insertBefore(h('div', { class: 'wn-pagebreak', contenteditable: 'false' }), d.firstChild); d.insertBefore(c, d.firstChild);
        Ed.changed(); Views.flash(c);
      } }] });
  }

  /* ---------- Design & layout ---------- */
  function pageBorders() {
    var b = Ed.doc.layout.border;
    var st = sel([['none', 'None'], ['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']], b.style), col = h('input', { type: 'color', value: b.color });
    var w = h('input', { type: 'number', min: 1, max: 12, value: b.width, inputmode: 'numeric' }), kind = sel([['box', 'Box'], ['shadow', 'Shadow'], ['3d', '3-D']], b.kind);
    openDialog({ title: 'Page borders', body: h('div', null, field('Style', st), h('div', { class: 'grid3' }, field('Colour', col), field('Width (px)', w), field('Setting', kind))),
      actions: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: function (err) { var n = +w.value; if (!(n >= 1 && n <= 12)) { err('Width must be 1 to 12.'); return false; } Ed.doc.layout.border = { style: st.value, color: col.value, width: n, kind: kind.value }; Ed.changed(); } }] });
  }
  function watermark() {
    var wm = Ed.doc.layout.watermark;
    var type = sel([['none', 'No watermark'], ['text', 'Text'], ['image', 'Picture']], wm.type), txt = h('input', { type: 'text', value: wm.text, maxlength: 40 });
    var op = h('input', { type: 'range', min: 5, max: 60, value: Math.round(wm.opacity * 100) }), lay = sel([['-40', 'Diagonal'], ['0', 'Horizontal']], String(wm.angle));
    var img = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' }); var imgData = wm.image;
    img.addEventListener('change', function () { var f = img.files[0]; if (f) readFileAs(f, 'dataurl').then(function (u) { return compressImage(u, 1000); }).then(function (u) { imgData = u; }); });
    openDialog({ title: 'Watermark', body: h('div', null, field('Type', type), field('Text', txt), field('Picture', img), h('div', { class: 'grid2' }, field('Opacity', op), field('Layout', lay))),
      actions: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: function (err) {
        if (type.value === 'image' && !S.isSafeImageSrc(imgData)) { err('Choose a PNG, JPEG or WebP picture.'); return false; }
        Ed.doc.layout.watermark = { type: type.value, text: txt.value, image: imgData || '', opacity: +op.value / 100, angle: +lay.value }; Ed.changed();
      } }] });
  }
  function customMargins() {
    var g = Layout.geo(), ins = ['Top', 'Right', 'Bottom', 'Left'].map(function (l, i) { return h('input', { type: 'number', min: 0, max: 80, step: '0.5', value: g.mm[i], inputmode: 'decimal', 'aria-label': l }); });
    openDialog({ title: 'Custom margins (mm)', body: h('div', { class: 'grid2' }, ins.map(function (inp, i) { return field(['Top', 'Right', 'Bottom', 'Left'][i], inp); })),
      actions: [{ label: 'Cancel' }, { label: 'Apply', primary: true, onClick: function (err) {
        var v = ins.map(function (i) { return +i.value; });
        if (v.some(function (x) { return !(x >= 0 && x <= 80); })) { err('Each margin must be 0 to 80 mm.'); return false; }
        Ed.doc.layout.custom = { t: v[0], r: v[1], b: v[2], l: v[3] }; Ed.doc.layout.margins = 'custom'; Ed.changed();
      } }] });
  }
  function columns(n) {
    var bl = Ed.selectedBlocks().map(function (b) { return Ed.topBlock(b); }).filter(function (b, i, a) { return b && a.indexOf(b) === i && !b.classList.contains('wn-gen'); });
    if (!bl.length) { toast('Select the paragraphs to put in columns.'); return; }
    Ed.snapshot();
    var existing = bl[0].classList.contains('wn-cols') ? bl[0] : null;
    if (existing) { if (n === 1) { existing.replaceWith.apply(existing, Array.prototype.slice.call(existing.childNodes)); } else existing.style.columnCount = n; Ed.changed(); return; }
    if (n === 1) { toast('These paragraphs are already in one column.'); return; }
    var wrap = h('div', { class: 'wn-cols', style: { columnCount: n } });
    bl[0].before(wrap); bl.forEach(function (b) { wrap.appendChild(b); });
    Ed.changed(); toast('Columns applied to the selected paragraphs.');
  }
  function wrap(v) {
    var o = Ed.selectedObject(); if (!o) { toast('Select a picture, shape, chart or text box first.'); return; }
    Ed.snapshot();
    o.classList.remove('wrap-inline', 'wrap-square', 'wrap-tight', 'wrap-behind', 'wrap-front');
    o.classList.add('wrap-' + v);
    if (v === 'behind' || v === 'front') {
      var top = o.offsetTop, left = o.offsetLeft;
      o.style.position = 'absolute'; o.style.top = top + 'px'; o.style.left = left + 'px';
      toast('Drag the object to move it. It no longer pushes text around.');
    } else { o.style.position = ''; o.style.top = ''; o.style.left = ''; }
    Ed.changed();
  }
  function position(v) {
    var o = Ed.selectedObject(); if (!o) { toast('Select an object first.'); return; }
    Ed.snapshot();
    o.classList.remove('float-left', 'float-right', 'pos-center');
    if (o.classList.contains('wrap-square') || o.classList.contains('wrap-tight')) o.classList.add(v === 'right' ? 'float-right' : v === 'left' ? 'float-left' : 'pos-center');
    else o.classList.add(v === 'center' ? 'pos-center' : v === 'right' ? 'float-right' : 'float-left');
    Ed.changed();
  }

  function editFootnote(ref) {
    var t = h('textarea', { rows: 3 }); t.value = ref.getAttribute('data-text') || '';
    openDialog({ title: 'Footnote ' + ref.textContent, body: field('Footnote text', t), actions: [
      { label: 'Delete footnote', danger: true, onClick: function () { Ed.snapshot(); ref.remove(); Ed.changed(); } },
      { label: 'Save', primary: true, onClick: function (err) { if (!t.value.trim()) { err('Type the footnote text, or delete it.'); return false; } ref.setAttribute('data-text', t.value.trim().slice(0, 1000)); Ed.changed(); } }] });
  }

  return { table: table, pictures: pictures, shape: shape, chart: chart, chartSVG: chartSVG, link: link, headerFooter: headerFooter, textBox: textBox, signature: signature, dateTime: dateTime,
    equation: equation, symbol: symbol, cover: cover, pageBorders: pageBorders, watermark: watermark, customMargins: customMargins, columns: columns, wrap: wrap, position: position, editFootnote: editFootnote };
})();

/* ---------- References ---------- */
var Refs = (function () {
  function insertToc() {
    var src = h('select', null, h('option', { value: 'headings' }, 'Headings'), h('option', { value: 'labels' }, 'Body content / custom labels'), h('option', { value: 'figures' }, 'Tables and figures (captions)'));
    var lv = h('select', null, h('option', { value: '1' }, 'Level 1 only'), h('option', { value: '2' }, 'Levels 1–2'), h('option', { value: '3', selected: true }, 'Levels 1–3'));
    var mode = h('select', null, h('option', { value: 'auto' }, 'Automatic (updates as you type)'), h('option', { value: 'manual' }, 'Manual (update with "Update table")'));
    openDialog({ title: 'Table of contents', body: h('div', null, field('Show', src), field('Heading levels', lv), field('Update mode', mode)), actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: function () {
      var nav = h('nav', { class: 'wn-toc', contenteditable: 'false', 'data-source': src.value, 'data-levels': lv.value, 'data-mode': mode.value }, h('p', { class: 'wn-toc-title' }, 'Contents'), h('ol'));
      Ed.insertNode(nav); updateTocs(true); Ed.changed();
    } }] });
  }

  /** Rebuild each table of contents. Automatic ones always; manual ones only when forced. Returns true if any changed. */
  function updateTocs(force) {
    var changed = false;
    $$('.wn-toc', Ed.el()).forEach(function (nav) {
      if (nav.getAttribute('data-mode') === 'manual' && !force) return;
      var source = nav.getAttribute('data-source') || 'headings', lv = +(nav.getAttribute('data-levels') || 3);
      var items = [];
      if (source === 'headings') $$('h1,h2,h3', Ed.el()).forEach(function (hd) { var l = +hd.tagName[1]; if (l <= lv && !hd.closest('.wn-toc') && !hd.closest('.wn-cover') && hd.textContent.trim()) items.push({ l: l, t: hd.textContent.trim(), el: hd }); });
      if (source === 'labels') $$('[data-labels]', Ed.el()).forEach(function (b) { var lb = b.getAttribute('data-labels'); if (lb) items.push({ l: 1, t: lb + ': ' + (b.querySelector('.wn-block-body') || b).textContent.trim().slice(0, 60), el: b }); });
      if (source === 'figures') $$('.wn-caption', Ed.el()).forEach(function (c) { items.push({ l: 1, t: c.textContent.trim(), el: c }); });
      var html = items.map(function (it) {
        return '<li class="lvl-' + it.l + '"><a href="#' + esc(it.el.getAttribute('data-wn-id') || '') + '">' + esc(it.t.slice(0, 120)) + '</a><span class="pg">' + (Layout.pageOf(it.el) + 1) + '</span></li>';
      }).join('') || '<li class="lvl-1 empty">No entries yet. Add headings (Home, Styles) or captions.</li>';
      var ol = nav.querySelector('ol') || nav.appendChild(h('ol'));
      if (ol.innerHTML !== html) { ol.innerHTML = html; changed = true; }
    });
    return changed;
  }

  function caption() {
    var kind = h('select', null, ['Figure', 'Table', 'Equation'].map(function (k) { return h('option', { value: k }, k); }));
    var where = h('select', null, h('option', { value: 'below' }, 'Below the selected object'), h('option', { value: 'above' }, 'Above the selected object'));
    var text = h('input', { type: 'text', maxlength: 200, placeholder: 'Describe the item' });
    var o = Ed.selectedObject();
    var tbl = Tables.currentCell() ? Tables.currentCell().closest('table') : null;
    if (tbl && !o) kind.value = 'Table';
    openDialog({ title: 'Insert caption', body: h('div', null, field('Label', kind), field('Position', where), field('Caption text', text), h('p', { class: 'hint' }, o || tbl ? 'The caption is attached to the selected item. Numbers update by themselves.' : 'No object is selected, so the caption goes at the cursor.')),
      actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: function () {
        var cap = h('p', { class: 'wn-caption', 'data-kind': kind.value }, h('span', { class: 'wn-capnum', contenteditable: 'false' }, kind.value + ' 1'), ': ' + (text.value.trim() || 'Caption'));
        var target = o || tbl;
        if (target) { Ed.snapshot(); var top = Ed.topBlock(target) || target; if (where.value === 'above') top.before(cap); else top.after(cap); Ed.changed(); }
        else Ed.insertNode(cap);
      } }] });
  }

  function footnote() {
    var t = h('textarea', { rows: 3, maxlength: 1000 });
    openDialog({ title: 'Insert footnote', body: field('Footnote text', t, 'A numbered mark goes at the cursor; the note shows at the bottom of that page.'), actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, onClick: function (err) {
      if (!t.value.trim()) { err('Type the footnote text.'); return false; }
      Ed.insertNode(h('sup', { class: 'wn-fnref', contenteditable: 'false', 'data-text': t.value.trim() }, '1'));
    } }] });
  }

  return { insertToc: insertToc, updateTocs: updateTocs, caption: caption, footnote: footnote };
})();

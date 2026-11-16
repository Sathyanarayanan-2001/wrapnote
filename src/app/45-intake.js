/* WrapNote app: left pane. Guided fields, branding preset, content block adder and block list. */
var Intake = (function () {
  var pane;
  function doc() { return Ed.doc; }

  function render() {
    pane = $('#intake');
    pane.textContent = '';
    var d = doc();
    var seg = h('div', { class: 'seg mode-seg', role: 'radiogroup', 'aria-label': 'Document mode' });
    [['mom', 'Minutes & report'], ['book', 'Book & study notes'], ['blank', 'Blank']].forEach(function (m) {
      seg.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(d.mode === m[0]), class: 'seg-btn' + (d.mode === m[0] ? ' active' : ''), onclick: function () { switchMode(m[0]); } }, m[1]));
    });
    pane.appendChild(seg);
    if (d.mode === 'mom') pane.appendChild(momFields(d.fields.mom));
    if (d.mode === 'book') pane.appendChild(bookFields(d.fields.book));
    if (d.mode === 'blank') pane.appendChild(h('p', { class: 'hint' }, 'Blank mode has no structured fields. Type straight into the page, or add blocks below.'));
    if (d.mode === 'mom') pane.appendChild(branding());
    pane.appendChild(blockAdder());
    pane.appendChild(h('div', { id: 'blockList' }));
    renderBlocks();
    Ed.applyLock();
  }

  function switchMode(mode) {
    var d = doc();
    if (d.mode === mode) return;
    Ed.snapshot();
    d.mode = mode;
    if (mode === 'mom' && !d.fields.mom.date) d.fields.mom.date = D.localISO();
    if (mode === 'book' && !d.fields.book.date) d.fields.book.date = D.localISO();
    Ed.ensureGen(); render(); Ed.changed();
  }

  /* ---------- Field builders ---------- */
  function set(key, value) { var d = doc(); d.fields[d.mode][key] = value; Ed.regen(); }

  function text(label, key, opts) {
    opts = opts || {};
    var f = doc().fields[doc().mode];
    var inp = opts.area ? h('textarea', { rows: opts.rows || 3, 'data-key': key, placeholder: opts.ph || '' }) : h('input', { type: 'text', 'data-key': key, placeholder: opts.ph || '', inputmode: opts.inputmode || null, autocomplete: 'off' });
    inp.value = key === 'title' ? (doc().title || '') : (f[key] || '');
    inp.addEventListener('input', function () {
      if (key === 'title') { doc().title = inp.value.slice(0, 300); $('#edTitle').value = doc().title; Ed.regen(); }
      else set(key, inp.value);
    });
    return field(label, inp, opts.hint);
  }

  /** Day-first date field. Stores ISO; shows dd/mm/yyyy; explains bad input in plain words. */
  function dateField(label, key) {
    var f = doc().fields[doc().mode];
    var inp = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'dd/mm/yyyy', 'data-key': key, autocomplete: 'off' });
    inp.value = f[key] ? D.formatDMY(f[key]) : '';
    var hint = h('small', { class: 'hint', 'aria-live': 'polite' }, f[key] ? derived(f[key]) : 'Day first, for example 28/10/2026.');
    inp.addEventListener('input', function () {
      var v = inp.value.trim();
      if (!v) { set(key, ''); hint.textContent = 'Day first, for example 28/10/2026.'; inp.removeAttribute('aria-invalid'); return; }
      var r = D.parseDMY(v, new Date().getFullYear());
      if (r.ok) { set(key, r.iso); hint.textContent = derived(r.iso); inp.removeAttribute('aria-invalid'); hint.classList.remove('err'); }
      else { hint.textContent = r.error; inp.setAttribute('aria-invalid', 'true'); hint.classList.add('err'); }
    });
    var id = 'f' + key; inp.id = id;
    return h('div', { class: 'fld' }, h('label', { for: id }, label), inp, hint);
  }
  function derived(iso) { return D.isoWeek(iso).label + ' · ' + D.monthLabel(iso) + ' · ' + D.financialYear(iso).label; }

  function timeField(label, key) {
    var f = doc().fields[doc().mode];
    var inp = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'HH:MM', 'data-key': key, autocomplete: 'off', maxlength: 5 });
    inp.value = f[key] || '';
    var hint = h('small', { class: 'hint', 'aria-live': 'polite' }, '24-hour');
    inp.addEventListener('input', function () {
      var v = inp.value.trim();
      if (/^\d{4}$/.test(v)) v = v.slice(0, 2) + ':' + v.slice(2); // 0930 -> 09:30
      var r = D.parseTime(v);
      if (!v || r.ok) { set(key, r.ok ? r.text : ''); hint.textContent = '24-hour'; hint.classList.remove('err'); inp.removeAttribute('aria-invalid'); }
      else { hint.textContent = r.error; hint.classList.add('err'); inp.setAttribute('aria-invalid', 'true'); }
    });
    inp.id = 'f' + key;
    return h('div', { class: 'fld' }, h('label', { for: inp.id }, label), inp, hint);
  }

  /** Chip (tag) input: Enter or comma adds, Backspace on empty removes the last chip. */
  function chips(label, key) {
    var list = doc().fields[doc().mode][key];
    var wrap = h('div', { class: 'chips' });
    var inp = h('input', { type: 'text', placeholder: 'Type a name, press Enter', autocomplete: 'off', id: 'f' + key });
    function draw() {
      $$('.chip-x', wrap).forEach(function (c) { c.remove(); });
      list.forEach(function (name, i) {
        wrap.insertBefore(h('span', { class: 'chip chip-x' }, name, h('button', { type: 'button', 'aria-label': 'Remove ' + name, onclick: function () { list.splice(i, 1); draw(); Ed.regen(); } }, '×')), inp);
      });
    }
    function add() {
      inp.value.split(/[,;]/).map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (n) { if (list.indexOf(n) < 0 && list.length < 200) list.push(n.slice(0, 80)); });
      inp.value = ''; draw(); Ed.regen();
    }
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
      else if (e.key === 'Backspace' && !inp.value && list.length) { list.pop(); draw(); Ed.regen(); }
    });
    inp.addEventListener('blur', function () { if (inp.value.trim()) add(); });
    wrap.appendChild(inp);
    draw();
    return h('div', { class: 'fld' }, h('label', { for: inp.id }, label + ' (' + 'press Enter after each)'), wrap);
  }

  /** Repeating rows editor used for action items, quotes and recall questions. */
  function rows(label, key, cols, makeEmpty) {
    var list = doc().fields[doc().mode][key];
    var box = h('div', { class: 'rows' });
    function draw() {
      box.textContent = '';
      if (!list.length) box.appendChild(h('p', { class: 'empty sm' }, 'None yet. Choose "Add" to create the first one.'));
      list.forEach(function (row, i) {
        var r = h('div', { class: 'row-ed' });
        cols.forEach(function (c) {
          var inp;
          if (c.type === 'check') {
            inp = h('input', { type: 'checkbox', 'aria-label': c.label + ' ' + (i + 1) });
            inp.checked = !!row[c.key];
            inp.addEventListener('change', function () { row[c.key] = inp.checked; Ed.regen(); });
            r.appendChild(h('label', { class: 'chk' }, inp, c.label));
            return;
          }
          inp = h('input', { type: 'text', placeholder: c.ph || c.label, 'aria-label': c.label + ' ' + (i + 1), inputmode: c.inputmode || null, class: c.cls || '' });
          var err = h('small', { class: 'hint err' });
          inp.value = c.show ? c.show(row[c.key]) : (row[c.key] || '');
          inp.addEventListener('input', function () {
            if (c.parse) {
              var p = c.parse(inp.value);
              if (p.ok) { row[c.key] = p.value; err.textContent = ''; inp.removeAttribute('aria-invalid'); Ed.regen(); }
              else { err.textContent = p.error; inp.setAttribute('aria-invalid', 'true'); }
            } else { row[c.key] = inp.value; Ed.regen(); }
          });
          r.appendChild(h('div', { class: 'cell ' + (c.cls || '') }, inp, err));
        });
        r.appendChild(h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Remove row ' + (i + 1), onclick: function () { list.splice(i, 1); draw(); Ed.regen(); } }, '×'));
        box.appendChild(r);
      });
    }
    draw();
    var add = h('button', { type: 'button', class: 'btn sm', onclick: function () { list.push(makeEmpty()); draw(); var ins = $$('input[type=text]', box); if (ins.length) ins[ins.length - cols.filter(function (c) { return c.type !== 'check'; }).length].focus(); } }, '+ Add');
    var head = h('div', { class: 'rows-head' }, h('span', { class: 'lbl' }, label), add);
    if (key === 'actions') head.appendChild(h('button', { type: 'button', class: 'btn sm', onclick: function () { IO.importActionsCSV(function () { render(); Ed.regen(); }); } }, 'Import CSV'));
    return h('div', { class: 'fld rows-fld' }, head, box);
  }

  var dateCol = { key: 'due', label: 'Due', ph: 'dd/mm/yyyy', inputmode: 'numeric', cls: 'w-date', show: function (v) { return v ? D.formatDMY(v) : ''; },
    parse: function (v) { if (!v.trim()) return { ok: true, value: '' }; var r = D.parseDMY(v, new Date().getFullYear()); return r.ok ? { ok: true, value: r.iso } : r; } };
  var costCol = { key: 'cost', label: 'Cost ₹', ph: 'Cost ₹', inputmode: 'decimal', cls: 'w-cost', show: function (v) { return v ? M.formatPaise(v, { symbol: false }) : ''; },
    parse: function (v) { var r = M.parseRupees(v); if (!r.ok) return r; if (r.paise < 0) return { ok: false, error: 'Cost cannot be negative.' }; return { ok: true, value: r.paise }; } };

  function momFields(f) {
    return h('div', { class: 'fields' },
      text('Title', 'title', { ph: 'Weekly project sync' }),
      h('div', { class: 'grid3' }, dateField('Date', 'date'), timeField('From', 'from'), timeField('To', 'to')),
      text('Location or meeting link', 'location', { ph: 'Room 4B or https://…' }),
      h('div', { class: 'grid2' }, text('Host / chair', 'host'), text('Notes by (scribe)', 'scribe')),
      text('Purpose / objective', 'purpose', { area: true, rows: 2 }),
      chips('People present', 'present'), chips('People absent', 'absent'),
      text('Agenda items', 'agenda', { area: true, rows: 3, hint: 'One item per line.' }),
      text('Key decisions', 'decisions', { area: true, rows: 3, hint: 'One decision per line.' }),
      rows('Action items', 'actions', [{ key: 'task', label: 'Task', cls: 'w-task' }, { key: 'owner', label: 'Owner', cls: 'w-owner' }, dateCol, costCol, { key: 'done', label: 'Done', type: 'check' }],
        function () { return { id: MODEL.uid('a'), task: '', owner: '', due: '', cost: 0, done: false }; }),
      h('div', { class: 'grid2' }, dateField('Next meeting date', 'nextDate'), timeField('Next meeting time', 'nextTime')));
  }

  function bookFields(f) {
    return h('div', { class: 'fields' },
      text('Book or document title', 'title'),
      h('div', { class: 'grid2' }, text('Author / source', 'author'), text('Chapter / page range', 'chapter', { ph: 'Ch. 2, pp. 30–58' })),
      dateField('Date', 'date'),
      text('Core thesis / big idea', 'thesis', { area: true, rows: 3 }),
      text('Key concepts and definitions', 'concepts', { area: true, rows: 4, hint: 'One per line as "Term: definition".' }),
      rows('Memorable quotes', 'quotes', [{ key: 'text', label: 'Quote', cls: 'w-task' }, { key: 'page', label: 'Page', cls: 'w-page', inputmode: 'numeric' }], function () { return { text: '', page: '' }; }),
      text('Visual diagram / mind-map notes', 'diagram', { area: true, rows: 4, hint: 'Indent with two spaces to nest an idea under the line above.' }),
      rows('Active recall Q&A', 'recall', [{ key: 'q', label: 'Question', cls: 'w-task' }, { key: 'a', label: 'Answer', cls: 'w-task' }], function () { return { q: '', a: '' }; }),
      text('Summary takeaways', 'takeaways', { area: true, rows: 3, hint: 'One takeaway per line.' }));
  }

  /* ---------- Corporate branding preset ---------- */
  function branding() {
    var b = doc().layout.branding;
    var on = h('input', { type: 'checkbox', id: 'brOn' }); on.checked = !!b.on;
    var pos = h('select', { id: 'brPos' }, ['left', 'center', 'right'].map(function (p) { var o = h('option', { value: p }, p.charAt(0).toUpperCase() + p.slice(1)); if (b.logoPos === p) o.selected = true; return o; }));
    var hdr = h('input', { type: 'text', id: 'brHdr', placeholder: 'Organisation name · Department' }); hdr.value = b.headerText || '';
    var ftr = h('input', { type: 'text', id: 'brFtr', placeholder: 'Confidential · Internal use' }); ftr.value = b.footerText || '';
    var logo = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', id: 'brLogo' });
    var prev = h('div', { class: 'logo-prev' }, b.logo ? h('img', { src: b.logo, alt: 'Current logo' }) : h('span', { class: 'hint' }, 'No logo'));
    function apply() {
      b.on = on.checked; b.logoPos = pos.value; b.headerText = hdr.value.slice(0, 200); b.footerText = ftr.value.slice(0, 200);
      if (b.on && doc().layout.border.style === 'none') doc().layout.border = { style: 'solid', color: '#047857', width: 1, kind: 'box' };
      Ed.el().classList.toggle('wn-branded', b.on);
      Ed.changed();
    }
    [on, pos].forEach(function (x) { x.addEventListener('change', apply); });
    [hdr, ftr].forEach(function (x) { x.addEventListener('input', apply); });
    logo.addEventListener('change', function () {
      var f = logo.files[0]; if (!f) return;
      if (f.size > 3 * 1048576) { toast('The logo is larger than 3 MB. Use a smaller picture.', 'error'); return; }
      readFileAs(f, 'dataurl').then(function (u) { return compressImage(u, 600); }).then(function (u) {
        if (!S.isSafeImageSrc(u)) { toast('That file is not a PNG, JPEG or WebP picture.', 'error'); return; }
        b.logo = u; prev.textContent = ''; prev.appendChild(h('img', { src: u, alt: 'Current logo' })); apply();
      }).catch(function (e) { logError(e, 'logo'); toast('Could not read the logo: ' + e.message, 'error'); });
    });
    return h('details', { class: 'brand-box' }, h('summary', null, 'Office / corporate branding'),
      h('label', { class: 'chk' }, on, 'Use corporate styling (logo, header, footer, page border, standard fonts)'),
      h('div', { class: 'grid2' }, field('Logo', logo), field('Logo position', pos)), prev,
      field('Header text', hdr), field('Footer text', ftr));
  }

  /* ---------- Block adder ---------- */
  var promptBox;
  function blockAdder() {
    promptBox = h('div', { class: 'prompt-box', 'aria-live': 'polite' });
    var place = h('select', { id: 'blockPlace', 'aria-label': 'Where to add blocks' }, h('option', { value: 'end' }, 'Add at end of document'), h('option', { value: 'cursor' }, 'Add at cursor position'));
    var imgIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    var shotIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    imgIn.addEventListener('change', function () { addImages(Array.from(imgIn.files), 'images'); imgIn.value = ''; });
    shotIn.addEventListener('change', function () { addImages(Array.from(shotIn.files), 'shots'); shotIn.value = ''; });
    function drop(kind, input, label, help) {
      var z = h('div', { class: 'dropzone', tabindex: '0', role: 'button', 'aria-label': label + '. ' + help },
        h('strong', null, label), h('span', null, help));
      z.addEventListener('click', function () { input.click(); });
      z.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      z.addEventListener('paste', function (e) {
        var files = Array.prototype.filter.call(e.clipboardData.files || [], function (f) { return /^image\//.test(f.type); });
        if (files.length) { e.preventDefault(); addImages(files, kind); } else toast('The clipboard has no picture. Copy a picture or screenshot first.', 'error');
      });
      z.addEventListener('dragover', function (e) { e.preventDefault(); z.classList.add('over'); });
      z.addEventListener('dragleave', function () { z.classList.remove('over'); });
      z.addEventListener('drop', function (e) { e.preventDefault(); z.classList.remove('over'); addImages(Array.prototype.filter.call(e.dataTransfer.files, function (f) { return /^image\//.test(f.type); }), kind); });
      return z;
    }
    return h('section', { class: 'adder' }, h('h3', null, 'Add content blocks'), place,
      h('div', { class: 'adder-grid' },
        h('button', { type: 'button', class: 'add-btn', onclick: textComposer }, h('strong', null, 'Text & labels'), h('span', null, 'Rich text, callouts, tags')),
        h('button', { type: 'button', class: 'add-btn', onclick: tablePrompt }, h('strong', null, 'Smart table'), h('span', null, 'Rows × columns, style'))),
      drop('images', imgIn, 'Images', 'Click, drop, or select and press Ctrl+V'),
      drop('shots', shotIn, 'Screenshots', 'Click, drop, or select and press Ctrl+V'),
      imgIn, shotIn, promptBox);
  }

  function placeAtCursor() { var p = $('#blockPlace'); return p && p.value === 'cursor'; }

  function insertBlock(node) {
    node.setAttribute('data-block', MODEL.uid('b'));
    Ed.insertNode(node, !placeAtCursor());
    renderBlocks();
    Views.flash(node);
    return node;
  }

  function choice(question, options) {
    return new Promise(function (resolve) {
      promptBox.textContent = '';
      var btns = h('div', { class: 'choice-row' });
      options.forEach(function (o) { btns.appendChild(h('button', { type: 'button', class: 'btn' + (o.primary ? ' primary' : ''), onclick: function () { promptBox.textContent = ''; resolve(o.value); } }, o.label)); });
      btns.appendChild(h('button', { type: 'button', class: 'btn ghost', onclick: function () { promptBox.textContent = ''; resolve(null); } }, 'Cancel'));
      promptBox.appendChild(h('div', { class: 'prompt' }, h('p', null, question), btns));
      var first = btns.querySelector('button'); if (first) first.focus();
      promptBox.scrollIntoView({ block: 'nearest' });
    });
  }

  /* Text & labels composer: typing here updates its block on the page live. */
  function textComposer(existing) {
    promptBox.textContent = '';
    var block = existing && existing.nodeType ? existing : null;
    var box = h('div', { class: 'composer-input', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Block text' });
    var labels = h('input', { type: 'text', placeholder: 'Labels, comma separated (e.g. Risk, Follow-up)' });
    if (block) {
      var body = block.querySelector('.wn-block-body');
      box.innerHTML = body ? body.innerHTML : '';
      labels.value = (block.getAttribute('data-labels') || '');
    }
    function sync() {
      if (!box.textContent.trim() && !block) return;
      if (!block) block = insertBlock(h('div', { class: 'wn-block wn-text', 'data-btype': 'text' }, h('div', { class: 'wn-labels', contenteditable: 'false' }), h('div', { class: 'wn-block-body' })));
      var lbs = labels.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8);
      block.setAttribute('data-labels', lbs.join(', '));
      var lb = block.querySelector('.wn-labels'); lb.textContent = '';
      lbs.forEach(function (l) { lb.appendChild(h('span', { class: 'wn-label' }, l)); });
      block.querySelector('.wn-block-body').innerHTML = sanitizeHtml(box.innerHTML) || '<p><br></p>';
      Ed.changed();
    }
    function tog(cls, label) {
      return h('button', { type: 'button', class: 'btn sm', 'aria-pressed': 'false', onmousedown: function (e) { e.preventDefault(); }, onclick: function () {
        if (cls === 'bold') document.execCommand('bold');
        else if (cls === 'highlight') document.execCommand('hiliteColor', false, '#fde68a');
        else if (block || box.textContent.trim()) { sync(); block.classList.toggle(cls); Ed.changed(); this.setAttribute('aria-pressed', String(block.classList.contains(cls))); }
        sync();
      } }, label);
    }
    box.addEventListener('input', sync);
    labels.addEventListener('input', sync);
    box.addEventListener('paste', function (e) { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
    promptBox.appendChild(h('div', { class: 'prompt composer' },
      h('p', null, block ? 'Editing this block. Changes show on the page as you type.' : 'Type your text. It appears on the page as you type.'),
      h('div', { class: 'mini-tb' }, tog('bold', 'Bold'), tog('wn-center', 'Center'), tog('highlight', 'Highlight'), tog('wn-callout', 'Callout box')),
      box, labels,
      h('div', { class: 'choice-row' }, h('button', { type: 'button', class: 'btn primary', onclick: function () { sync(); promptBox.textContent = ''; Ed.setComposing(null); } }, 'Done'))));
    Ed.setComposing({ block: block });
    box.focus();
  }

  /* Smart table builder: asks rows × columns, style preset and header options before inserting. */
  function tablePrompt() {
    promptBox.textContent = '';
    var rowsIn = h('input', { type: 'number', min: 1, max: 60, value: 3, inputmode: 'numeric', id: 'tbRows' });
    var colsIn = h('input', { type: 'number', min: 1, max: 12, value: 3, inputmode: 'numeric', id: 'tbCols' });
    var style = h('select', { id: 'tbStyle' }, [['corporate', 'Corporate header'], ['striped', 'Striped'], ['minimal', 'Minimal grid'], ['borderless', 'Borderless']].map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    var hr = h('input', { type: 'checkbox', checked: true }), hc = h('input', { type: 'checkbox' });
    var err = h('p', { class: 'hint err', role: 'alert' });
    promptBox.appendChild(h('div', { class: 'prompt' }, h('p', null, 'Set up the table before it is inserted.'),
      h('div', { class: 'grid2' }, field('Rows', rowsIn), field('Columns', colsIn)), field('Table style', style),
      h('label', { class: 'chk' }, hr, 'Header row'), h('label', { class: 'chk' }, hc, 'Header column'), err,
      h('div', { class: 'choice-row' },
        h('button', { type: 'button', class: 'btn primary', onclick: function () {
          var r = +rowsIn.value, c = +colsIn.value;
          if (!Number.isInteger(r) || r < 1 || r > 60) { err.textContent = 'Rows must be a whole number from 1 to 60.'; return; }
          if (!Number.isInteger(c) || c < 1 || c > 12) { err.textContent = 'Columns must be a whole number from 1 to 12.'; return; }
          var t = Tables.build(r, c, style.value, hr.checked, hc.checked);
          insertBlock(h('div', { class: 'wn-block wn-tableblock', 'data-btype': 'table' }, t));
          promptBox.textContent = '';
          var first = t.querySelector('td,th'); if (first) { var rg = document.createRange(); rg.selectNodeContents(first); rg.collapse(true); var s = window.getSelection(); s.removeAllRanges(); s.addRange(rg); }
        } }, 'Insert table'),
        h('button', { type: 'button', class: 'btn ghost', onclick: function () { promptBox.textContent = ''; } }, 'Cancel'))));
    rowsIn.focus();
  }

  /* Pictures and screenshots: ask how to arrange several, and whether to extract text from screenshots. */
  function addImages(files, kind, fromCanvas) {
    if (!files.length) return;
    if (Ed.locked()) { toast('This document is protected. Unlock it first.', 'error'); return; }
    var big = files.filter(function (f) { return f.size > 15 * 1048576; });
    if (big.length) { toast(big[0].name + ' is larger than 15 MB. Use a smaller picture.', 'error'); files = files.filter(function (f) { return big.indexOf(f) < 0; }); if (!files.length) return; }
    var saver = settings.get('memorySaver', true);
    Promise.all(files.map(function (f) { return readFileAs(f, 'dataurl').then(function (u) { return saver ? compressImage(u, 1600) : u; }); })).then(function (urls) {
      urls = urls.filter(S.isSafeImageSrc);
      if (!urls.length) { toast('Those files are not pictures this tool can show (PNG, JPEG, GIF, WebP).', 'error'); return; }
      if (fromCanvas && urls.length === 1 && kind === 'images') {
        var fig = h('figure', { class: 'wn-obj wn-img wrap-inline' }, h('img', { src: urls[0], alt: 'Pasted picture' }));
        Ed.insertNode(fig); return;
      }
      if (fromCanvas && !promptBox) render();
      var step = kind === 'shots'
        ? choice('What should happen with ' + (urls.length > 1 ? 'these ' + urls.length + ' screenshots' : 'this screenshot') + '?', [
            { label: 'Extract text (OCR)', value: 'ocr' }, { label: 'Insert screenshot as image', value: 'img', primary: true }, { label: 'Both: image + extracted text', value: 'both' }])
        : Promise.resolve('img');
      return step.then(function (mode) {
        if (!mode) return;
        var lay = (mode === 'ocr' || urls.length === 1) ? Promise.resolve('stack')
          : kind === 'shots' ? choice('How should the ' + urls.length + ' screenshots be arranged?', [{ label: 'Grid', value: 'grid2' }, { label: 'Side-by-side', value: 'side' }, { label: 'One-by-one', value: 'stack', primary: true }])
          : choice('How should the ' + urls.length + ' images be arranged?', [{ label: '2×2 grid', value: 'grid2', primary: true }, { label: '3-column grid', value: 'grid3' }, { label: 'Side-by-side (2-col)', value: 'side' }, { label: 'Stacked one-by-one', value: 'stack' }]);
        return lay.then(function (layout) {
          if (!layout) return;
          var block = h('div', { class: 'wn-block wn-images wn-lay-' + layout, 'data-btype': kind, 'data-layout': layout });
          if (mode !== 'ocr') urls.forEach(function (u, i) { block.appendChild(h('figure', { class: 'wn-img' }, h('img', { src: u, alt: (kind === 'shots' ? 'Screenshot ' : 'Picture ') + (i + 1) }))); });
          if (mode === 'ocr' || mode === 'both') {
            return OCR.extract(urls).then(function (res) {
              var tb = h('div', { class: 'wn-ocr' });
              res.forEach(function (r, i) {
                if (urls.length > 1) tb.appendChild(h('p', { class: 'wn-ocr-head' }, 'Text from screenshot ' + (i + 1)));
                (r.text ? r.text.split(/\n+/) : ['']).forEach(function (line) { tb.appendChild(h('p', null, line || ' ')); });
              });
              if (!res.some(function (r) { return r.text; })) {
                toast(OCR.available() ? 'No text was found in the screenshot.' : 'Text extraction is not available in this browser, so the screenshot was inserted as a picture. Type the text in the box below it.', 'error', 9000);
                if (mode === 'ocr') urls.forEach(function (u, i) { block.appendChild(h('figure', { class: 'wn-img' }, h('img', { src: u, alt: 'Screenshot ' + (i + 1) }))); });
              }
              block.appendChild(tb);
              insertBlock(block);
            });
          }
          insertBlock(block);
        });
      });
    }).catch(function (e) { logError(e, 'addImages'); toast('Could not add the pictures: ' + e.message, 'error'); });
  }

  /* ---------- Block list (read from the canvas, so it is always in step) ---------- */
  var renderBlocks = debounce(function () { drawBlocks(); }, 150);
  function drawBlocks() {
    var box = $('#blockList');
    if (!box || !Ed.doc) return;
    var blocks = $$('[data-block]', Ed.el());
    box.textContent = '';
    box.appendChild(h('h3', null, 'Blocks in this document (' + blocks.length + ')'));
    if (!blocks.length) { box.appendChild(h('p', { class: 'empty sm' }, 'No blocks yet. Use the buttons above to add text, a table, images or screenshots.')); return; }
    var ol = h('ol', { class: 'block-list' });
    blocks.forEach(function (b, i) {
      var type = b.getAttribute('data-btype') || 'text';
      var label = { text: 'Text', table: 'Table', images: 'Images', shots: 'Screenshots' }[type] || 'Block';
      var preview = (b.textContent || '').trim().slice(0, 60) || (b.querySelectorAll('img').length + ' picture(s)');
      ol.appendChild(h('li', null,
        h('span', { class: 'bl-type' }, label), h('span', { class: 'bl-prev' }, preview),
        h('span', { class: 'bl-acts' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move block ' + (i + 1) + ' up', disabled: i === 0, onclick: function () { move(b, blocks[i - 1], true); } }, '↑'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move block ' + (i + 1) + ' down', disabled: i === blocks.length - 1, onclick: function () { move(b, blocks[i + 1], false); } }, '↓'),
          h('button', { type: 'button', class: 'btn sm', onclick: function () { editBlock(b); } }, 'Edit'),
          h('button', { type: 'button', class: 'btn sm', onclick: function () { formatBlock(b); } }, 'Format'),
          h('button', { type: 'button', class: 'btn sm danger', onclick: function () { Ed.snapshot(); b.remove(); Ed.changed(); drawBlocks(); toast('Block deleted. Use Undo to bring it back.'); } }, 'Delete'))));
    });
    box.appendChild(ol);
  }

  function move(b, other, before) { Ed.snapshot(); if (before) other.before(b); else other.after(b); Ed.changed(); drawBlocks(); Views.flash(b); }

  function editBlock(b) {
    var type = b.getAttribute('data-btype');
    if (type === 'text') { textComposer(b); return; }
    if (type === 'images' || type === 'shots') {
      choice('Change the arrangement of these pictures:', [{ label: '2×2 grid', value: 'grid2' }, { label: '3-column grid', value: 'grid3' }, { label: 'Side-by-side', value: 'side' }, { label: 'Stacked', value: 'stack' }]).then(function (v) {
        if (!v) return; Ed.snapshot(); b.className = b.className.replace(/wn-lay-\w+/, 'wn-lay-' + v); b.setAttribute('data-layout', v); Ed.changed();
      });
      return;
    }
    var cell = b.querySelector('td,th');
    Views.flash(b);
    if (cell) { var r = document.createRange(); r.selectNodeContents(cell); r.collapse(false); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); Ed.rememberRange(); }
  }

  function formatBlock(b) {
    choice('Format this block:', [{ label: 'Bold', value: 'wn-bold' }, { label: 'Center', value: 'wn-center' }, { label: 'Highlight', value: 'wn-hl' }, { label: 'Callout box', value: 'wn-callout' }, { label: 'Clear formatting', value: 'clear' }]).then(function (v) {
      if (!v) return;
      Ed.snapshot();
      if (v === 'clear') b.classList.remove('wn-bold', 'wn-center', 'wn-hl', 'wn-callout'); else b.classList.toggle(v);
      Ed.changed(); Views.flash(b);
    });
  }

  return { render: render, renderBlocks: renderBlocks, addImages: addImages, choice: choice };
})();

/* ---------- Optional OCR: the browser's built-in TextDetector when present, otherwise none ----------
 * Heavy OCR engines (Tesseract, about 10 MB) would break the 2-second load and need network downloads,
 * so the lighter fallback is: insert the picture and let the person type the text. */
var OCR = (function () {
  function available() { return typeof window.TextDetector === 'function'; }
  function extract(urls) {
    if (!available()) return Promise.resolve(urls.map(function () { return { text: '' }; }));
    var det;
    try { det = new window.TextDetector(); } catch (e) { return Promise.resolve(urls.map(function () { return { text: '' }; })); }
    return Promise.all(urls.map(function (u) {
      return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = u; }).then(function (img) {
        if (!img) return { text: '' };
        return withRetry(function () { return det.detect(img); }, { tries: 2, timeout: 15000 }).then(function (blocks) {
          // Reading order: top to bottom, then left to right.
          blocks.sort(function (a, b) { return (a.boundingBox.top - b.boundingBox.top) || (a.boundingBox.left - b.boundingBox.left); });
          return { text: blocks.map(function (b) { return b.rawValue; }).join('\n') };
        }).catch(function (e) { logError(e, 'OCR'); return { text: '' }; });
      });
    }));
  }
  return { available: available, extract: extract };
})();

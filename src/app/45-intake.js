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
    if (d.template === 'office') pane.appendChild(officeFields());
    pane.appendChild(blockAdder());
    pane.appendChild(h('div', { id: 'blockList' }));
    renderBlocks();
    Ed.applyLock();
  }

  /** Document control fields of the office template (header, first-page footer, later-page footer). */
  var officeRelayout = debounce(function () { Ed.relayout(); }, 200);
  function officeFields() {
    var d = doc(), f = d.office;
    var box = h('details', { class: 'fields office-fields', open: true }, h('summary', null, 'Document control (header and footers)'),
      h('p', { class: 'hint' }, 'These show in the page header and footers and in Word. Keep the [BRACKETS] until the approved wording is known.'));
    var grid = h('div', { class: 'grid2' });
    WN.officeTemplate.FIELDS.forEach(function (x) {
      var id = 'off-' + x[0];
      var inp = h('input', { type: 'text', id: id, maxlength: 200, value: f[x[0]] || '', placeholder: x[2], 'data-office': x[0] });
      inp.addEventListener('input', function () { d.office[x[0]] = this.value.slice(0, 200); Ed.saveSoon(); officeRelayout(); });
      inp.addEventListener('change', function () { if (!this.value.trim()) { d.office[x[0]] = x[2]; this.value = x[2]; Ed.saveSoon(); officeRelayout(); } });
      grid.appendChild(h('div', { class: 'fld' }, h('label', { for: id }, x[1]), inp));
    });
    box.appendChild(grid);
    return box;
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
      rows('Action items', 'actions', [{ key: 'task', label: 'Task', cls: 'w-task' }, { key: 'owner', label: 'Owner', cls: 'w-owner' }, dateCol, { key: 'done', label: 'Done', type: 'check' }],
        function () { return { id: MODEL.uid('a'), task: '', owner: '', due: '', done: false }; }),
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
      refT.flush(); // a reference typed before the note had text is attached now
    }
    // 1.3.0: optional source reference, folded behind one button so the composer stays tidy.
    var refT = SourceRefs.toggle(function () { return block; });
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
      box, labels, refT.el,
      h('div', { class: 'choice-row' }, h('button', { type: 'button', class: 'btn primary', onclick: function () { sync(); refT.flush(); promptBox.textContent = ''; Ed.setComposing(null); } }, 'Done'))));
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
  /* ---------- Picture grids: empty slots, fit-to-cell shape, and joining a grid later ---------- */
  var lastPictureId = null; // the picture block most recently added to or rearranged
  var PIC = WN.pictures;
  function layoutOf(b) { var l = b.getAttribute('data-layout') || ((b.className.match(/wn-lay-(\w+)/) || [])[1]); return PIC.isLayout(l) ? l : 'stack'; }
  function figuresOf(b) { return $$(':scope > figure.wn-img', b); }

  /** The grid a new picture may join: only the most recent picture block, and only if its grid has room. */
  function openGrid() {
    var list = $$('[data-btype="images"], [data-btype="shots"]', Ed.el());
    var cand = lastPictureId ? list.filter(function (x) { return x.getAttribute('data-block') === lastPictureId; })[0] : null;
    if (!cand) cand = list[list.length - 1];
    if (!cand) return null;
    return PIC.freeSlots(layoutOf(cand), figuresOf(cand).length) > 0 ? cand : null;
  }

  /** Shows the right number of empty slots and gives every cell the pictures' shape, so nothing is cropped. */
  function refreshSlots(b) {
    var layout = layoutOf(b), figs = figuresOf(b), need = PIC.freeSlots(layout, figs.length);
    var slots = $$(':scope > .wn-slot', b);
    while (slots.length > need) slots.pop().remove();
    var anchor = b.querySelector(':scope > .wn-ocr');
    for (var i = slots.length; i < need; i++) {
      var sl = h('div', { class: 'wn-slot', contenteditable: 'false', role: 'button', tabindex: '0', 'aria-label': 'Empty slot. Add a picture to this grid.', title: 'Add a picture to this grid' });
      b.insertBefore(sl, anchor);
      slots.push(sl);
    }
    if (layout === 'stack') { figs.forEach(function (f) { f.style.aspectRatio = ''; if (!f.getAttribute('style')) f.removeAttribute('style'); }); return; }
    var ratios = [], waiting = false;
    figs.forEach(function (f) {
      var img = f.querySelector('img');
      if (!img) return;
      if (img.naturalWidth) ratios.push(img.naturalWidth / img.naturalHeight);
      else if (!img.dataset.wnWait) { waiting = true; img.dataset.wnWait = '1'; img.addEventListener('load', function () { delete img.dataset.wnWait; refreshSlots(b); Ed.relayout(); }, { once: true }); }
    });
    if (!ratios.length && waiting) return;
    var r = String(PIC.cellRatio(ratios));
    figs.concat(slots).forEach(function (x) { if (x.style.aspectRatio !== r) x.style.aspectRatio = r; });
  }
  function refreshAllSlots() { $$('[data-btype="images"], [data-btype="shots"]', Ed.el()).forEach(refreshSlots); }

  function figure(u, kind, n) { return h('figure', { class: 'wn-img' }, h('img', { src: u, alt: (kind === 'shots' ? 'Screenshot ' : 'Picture ') + n })); }

  /** Where extracted text goes. A grid keeps only pictures, so a full 2×2 grid still fits one page; its text
   * follows in its own block. A stacked block keeps the text inside, as in version 1.0.0. */
  function ocrBox(block) {
    if (layoutOf(block) === 'stack') {
      var inner = block.querySelector(':scope > .wn-ocr');
      if (!inner) { inner = h('div', { class: 'wn-ocr' }); block.appendChild(inner); }
      return inner;
    }
    var next = block.nextElementSibling;
    if (next && next.classList.contains('wn-ocr-block')) return next.querySelector('.wn-ocr');
    var tb = h('div', { class: 'wn-ocr' });
    var tblock = h('div', { class: 'wn-block wn-text wn-ocr-block', 'data-btype': 'text', 'data-labels': 'Screenshot text', 'data-block': MODEL.uid('b') },
      h('div', { class: 'wn-labels', contenteditable: 'false' }, h('span', { class: 'wn-label' }, 'Screenshot text')), h('div', { class: 'wn-block-body' }, tb));
    block.after(tblock);
    return tb;
  }
  /** Moves text out of a block that has just become a grid. */
  function liftOcr(block) {
    var inner = block.querySelector(':scope > .wn-ocr');
    if (!inner || layoutOf(block) === 'stack') return;
    var box = ocrBox(block);
    while (inner.firstChild) box.appendChild(inner.firstChild);
    inner.remove();
  }

  function appendOcr(block, res, startNo, many) {
    var tb = ocrBox(block);
    res.forEach(function (r, i) {
      if (many) tb.appendChild(h('p', { class: 'wn-ocr-head' }, 'Text from screenshot ' + (startNo + i)));
      (r.text ? r.text.split(/\n+/) : ['']).forEach(function (line) { tb.appendChild(h('p', null, line || ' ')); });
    });
  }

  /** Called when an empty slot is clicked: the chosen pictures go into that grid. */
  function addToBlock(block) {
    if (Ed.locked()) { toast('This document is protected. Unlock it first.', 'error'); return; }
    var f = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    f.addEventListener('change', function () { addImages(Array.from(f.files), block.getAttribute('data-btype') === 'shots' ? 'shots' : 'images', false, block); f.remove(); });
    document.body.appendChild(f); f.click();
  }

  /* Pictures and screenshots: ask whether to extract text from screenshots; join an open grid; ask how to arrange the rest. */
  function addImages(files, kind, fromCanvas, targetBlock) {
    if (!files.length) return;
    if (Ed.locked()) { toast('This document is protected. Unlock it first.', 'error'); return; }
    var big = files.filter(function (f) { return f.size > 15 * 1048576; });
    if (big.length) { toast(big[0].name + ' is larger than 15 MB. Use a smaller picture.', 'error'); files = files.filter(function (f) { return big.indexOf(f) < 0; }); if (!files.length) return; }
    var saver = settings.get('memorySaver', true);
    Promise.all(files.map(function (f) { return readFileAs(f, 'dataurl').then(function (u) { return saver ? compressImage(u, 1600) : u; }); })).then(function (urls) {
      urls = urls.filter(S.isSafeImageSrc);
      if (!urls.length) { toast('Those files are not pictures this tool can show (PNG, JPEG, GIF, WebP).', 'error'); return; }
      if (fromCanvas && urls.length === 1 && kind === 'images' && !targetBlock) {
        var fig = h('figure', { class: 'wn-obj wn-img wrap-inline' }, h('img', { src: urls[0], alt: 'Pasted picture' }));
        Ed.insertNode(fig); return;
      }
      if (fromCanvas && !promptBox) render();
      // A picture dropped on an empty slot is clearly meant as a picture, so no question is asked.
      var step = kind === 'shots' && !targetBlock
        ? choice('What should happen with ' + (urls.length > 1 ? 'these ' + urls.length + ' screenshots' : 'this screenshot') + '?', [
            { label: 'Extract text (OCR)', value: 'ocr' }, { label: 'Insert screenshot as image', value: 'img', primary: true }, { label: 'Both: image + extracted text', value: 'both' }])
        : Promise.resolve('img');
      return step.then(function (mode) {
        if (!mode) return;
        // A text-only result never joins a picture grid; pictures join the open grid first.
        var target = mode === 'ocr' ? null : (targetBlock && Ed.el().contains(targetBlock) ? targetBlock : openGrid());
        var plan = PIC.placement(target ? { layout: layoutOf(target), count: figuresOf(target).length } : null, urls.length);
        var joinUrls = urls.slice(0, plan.join), restUrls = urls.slice(plan.join);
        var lay = !restUrls.length ? Promise.resolve(null) : (mode === 'ocr' || restUrls.length === 1) ? Promise.resolve('stack')
          : kind === 'shots' ? choice('How should the ' + restUrls.length + ' screenshots be arranged?', [{ label: 'Grid', value: 'grid2' }, { label: 'Side-by-side', value: 'side' }, { label: 'One-by-one', value: 'stack', primary: true }])
          : choice('How should the ' + restUrls.length + ' images be arranged?', [{ label: '2×2 grid', value: 'grid2', primary: true }, { label: '3-column grid', value: 'grid3' }, { label: 'Side-by-side (2-col)', value: 'side' }, { label: 'Stacked one-by-one', value: 'stack' }]);
        return lay.then(function (layout) {
          if (restUrls.length && !layout) return;
          var wantText = mode === 'ocr' || mode === 'both';
          var ocr = wantText ? OCR.extract(urls, progressLine()) : Promise.resolve(null);
          return ocr.then(function (res) {
            if (wantText) clearProgress();
            if (res && !res.some(function (r) { return r.text; })) toast(OCR.failureMessage(), 'error', 9000);
            if (joinUrls.length) joinInto(target, joinUrls, kind, res ? res.slice(0, joinUrls.length) : null, urls.length > 1);
            if (restUrls.length) newPictureBlock(restUrls, kind, layout, mode, res ? res.slice(joinUrls.length) : null);
          });
        });
      });
    }).catch(function (e) { logError(e, 'addImages'); toast('Could not add the pictures: ' + e.message, 'error'); });
  }

  function joinInto(block, urls, kind, res, many) {
    Ed.snapshot();
    var start = figuresOf(block).length, anchor = block.querySelector(':scope > .wn-slot, :scope > .wn-ocr');
    urls.forEach(function (u, i) { block.insertBefore(figure(u, kind, start + i + 1), anchor); });
    if (res) appendOcr(block, res, start + 1, many || start > 0);
    refreshSlots(block);
    lastPictureId = block.getAttribute('data-block');
    Ed.changed(); renderBlocks(); Views.flash(block);
    var n = figuresOf(block).length, label = { grid2: '2×2 grid', grid3: '3-column grid', side: 'side-by-side pair' }[layoutOf(block)];
    toast('Added to the ' + label + ' next to the earlier picture (' + (urls.length > 1 ? 'slots ' + (start + 1) + '–' + n : 'slot ' + n) + '). Undo puts it back.');
  }

  function newPictureBlock(urls, kind, layout, mode, res) {
    var block = h('div', { class: 'wn-block wn-images wn-lay-' + layout, 'data-btype': kind, 'data-layout': layout });
    var noText = res && !res.some(function (r) { return r.text; });
    // Text-only was asked for but nothing was read: keep the picture so no information is lost.
    if (mode !== 'ocr' || noText) urls.forEach(function (u, i) { block.appendChild(figure(u, kind, i + 1)); });
    insertBlock(block);
    if (res) appendOcr(block, res, 1, urls.length > 1);
    refreshSlots(block);
    lastPictureId = block.getAttribute('data-block');
  }

  var progressEl = null;
  function progressLine() {
    promptBox.textContent = '';
    progressEl = h('p', { class: 'prompt ocr-progress', role: 'status' }, 'Reading text… preparing the text reader.');
    promptBox.appendChild(progressEl);
    return function (msg) { if (progressEl) progressEl.textContent = msg; };
  }
  function clearProgress() { if (progressEl) { progressEl.remove(); progressEl = null; } }

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
      var preview = SourceRefs.previewOf(b).slice(0, 60) || (b.querySelectorAll('img').length + ' picture(s)');
      var ref = Ed.doc.refs[b.getAttribute('data-block')];
      ol.appendChild(h('li', null,
        h('span', { class: 'bl-type' }, label), h('span', { class: 'bl-prev' }, preview),
        ref ? h('span', { class: 'bl-cite', title: 'Source: ' + WN.refs.citation(ref) }, WN.refs.citation(ref)) : null,
        h('span', { class: 'bl-acts' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move block ' + (i + 1) + ' up', disabled: i === 0, onclick: function () { move(b, blocks[i - 1], true); } }, '↑'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move block ' + (i + 1) + ' down', disabled: i === blocks.length - 1, onclick: function () { move(b, blocks[i + 1], false); } }, '↓'),
          // Picture blocks say "Arrange" because that is what a newcomer looks for to make a 2×2 grid.
          h('button', { type: 'button', class: 'btn sm', 'aria-label': (type === 'images' || type === 'shots' ? 'Arrange' : 'Edit') + ' block ' + (i + 1), onclick: function () { editBlock(b); } }, type === 'images' || type === 'shots' ? 'Arrange' : 'Edit'),
          h('button', { type: 'button', class: 'btn sm', onclick: function () { formatBlock(b); } }, 'Format'),
          h('button', { type: 'button', class: 'btn sm', 'aria-label': 'Source reference for block ' + (i + 1), onclick: function () { sourceFor(b); } }, ref ? 'Source ✓' : 'Source'),
          h('button', { type: 'button', class: 'btn sm danger', onclick: function () { Ed.snapshot(); b.remove(); Ed.changed(); drawBlocks(); toast('Block deleted. Use Undo to bring it back.'); } }, 'Delete'))));
    });
    box.appendChild(ol);
  }

  /** Source reference for any block (text, table or pictures), shown in the same prompt area as the other editors. */
  function sourceFor(b) {
    promptBox.textContent = '';
    var f = SourceRefs.form({ getBlock: function () { return b; }, onChange: function () { renderBlocks(); } });
    promptBox.appendChild(h('div', { class: 'prompt' }, f.el, h('div', { class: 'choice-row' }, h('button', { type: 'button', class: 'btn primary', onclick: function () { f.flush(); promptBox.textContent = ''; } }, 'Done'))));
    Views.flash(b);
    f.focus();
  }

  function move(b, other, before) { Ed.snapshot(); if (before) other.before(b); else other.after(b); Ed.changed(); drawBlocks(); Views.flash(b); }

  function editBlock(b) {
    var type = b.getAttribute('data-btype');
    if (type === 'text') { textComposer(b); return; }
    if (type === 'images' || type === 'shots') {
      choice('Change the arrangement of these pictures:', [{ label: '2×2 grid', value: 'grid2' }, { label: '3-column grid', value: 'grid3' }, { label: 'Side-by-side', value: 'side' }, { label: 'Stacked', value: 'stack' }]).then(function (v) {
        if (!v) return; Ed.snapshot(); b.className = b.className.replace(/wn-lay-\w+/, 'wn-lay-' + v); b.setAttribute('data-layout', v);
        liftOcr(b); refreshSlots(b); lastPictureId = b.getAttribute('data-block'); Ed.changed();
        if (PIC.freeSlots(v, figuresOf(b).length)) toast('Arrangement changed. The next picture you add fills the next empty slot.');
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

  return { render: render, renderBlocks: renderBlocks, addImages: addImages, choice: choice, refreshAllSlots: refreshAllSlots, addToBlock: addToBlock };
})();


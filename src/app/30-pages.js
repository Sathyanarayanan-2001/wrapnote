/* WrapNote app: router and the non-editor pages (home, documents, dashboard, settings). */
var Pages = (function () {
  var current = 'home';

  function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }

  function route() {
    var r = MODEL.parseRoute(location.hash);
    // An old in-page link such as #g-ribbon names a section, not a page: open the page that holds it.
    var raw = location.hash.replace(/^#\/?/, '');
    if (r.error && r.page === 'home' && /^[\w-]{1,40}$/.test(raw)) {
      var target = document.getElementById(raw), holder = target && target.closest('.page');
      if (holder && holder.id === 'page-guide') { history.replaceState(null, '', '#guide/' + raw); r = { page: 'guide', section: raw }; }
    }
    if (r.error) toast(r.error + (r.page === 'guide' ? '' : ' Showing ' + (r.page === 'docs' ? 'your documents' : 'the home page') + ' instead.'), 'error');
    if (r.page === 'edit' && Ed.doc && r.id === Ed.doc.id) { show('edit'); if (r.block) SourceRefs.focusBlock(r.block); return; }
    if (r.page === 'edit' && r.id) { Ed.open(r.id).then(function (ok) { if (ok) { show('edit'); if (r.block) SourceRefs.focusBlock(r.block); } else { toast('That document was not found. It may have been deleted.', 'error'); go('#docs'); } }); return; }
    show(r.page);
    if (r.section) scrollToSection(r.section);
  }

  function scrollToSection(id) {
    var el = document.getElementById(id);
    if (!el || !el.closest('#page-guide')) { toast('That guide section does not exist. Showing the top of the guide.', 'error'); return; }
    // Wait one frame so the page is laid out before scrolling; the sticky top bar is allowed for by scroll-margin.
    requestAnimationFrame(function () { el.scrollIntoView({ block: 'start' }); var hd = el.querySelector('h2'); if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: true }); } });
  }

  function show(page) {
    if (current === 'edit' && page !== 'edit' && Ed.doc) Ed.flush();
    current = page;
    $$('.page').forEach(function (p) { p.hidden = p.id !== 'page-' + page; });
    $$('[data-nav]').forEach(function (a) { var on = a.getAttribute('data-nav') === page; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.body.setAttribute('data-page', page);
    if (page === 'docs') renderDocs();
    if (page === 'dash') renderDash();
    if (page === 'home') renderHome();
    if (page === 'settings') renderSettings();
    if (page === 'sources') SourceRefs.renderPage();
    if (page === 'edit') { $('#edEmpty').hidden = !!Ed.doc; $('#editor').hidden = !Ed.doc; if (Ed.doc) Ed.relayout(); else renderEdEmpty(); }
    var heading = $('#page-' + page + ' h1');
    document.title = (page === 'edit' && Ed.doc ? (Ed.doc.title || 'Untitled') + ' · ' : heading ? heading.textContent + ' · ' : '') + 'WrapNote';
    window.scrollTo(0, 0);
  }

  function createAndOpen(mode) {
    var d = MODEL.newDoc(mode === 'office' ? 'blank' : mode, Date.now(), D.localISO());
    if (mode === 'office') WN.officeTemplate.setupDoc(d);
    return Store.putDoc(d, mode === 'office' ? Store.plainOf(d.html) : '').then(function () { go('#edit/' + d.id); });
  }

  /* ---------- Home ---------- */
  function renderHome() {
    var list = Store.metas().sort(byUpdated).slice(0, 4);
    var box = $('#homeRecent');
    box.textContent = '';
    if (!list.length) { box.appendChild(h('p', { class: 'empty' }, 'No documents yet. Start with "New minutes" above; your work saves itself as you type.')); return; }
    list.forEach(function (m) { box.appendChild(docCard(m)); });
  }

  function byUpdated(a, b) { return (b.u || 0) - (a.u || 0) || String(b.date).localeCompare(String(a.date)) || String(a.title).localeCompare(String(b.title)); }

  function docCard(m) {
    return h('a', { class: 'doc-card', href: '#edit/' + m.id },
      h('span', { class: 'dc-mode', style: { background: colorFor(m.mode) } }, m.mode === 'mom' ? 'MoM' : m.mode === 'book' ? 'Notes' : 'Doc'),
      h('span', { class: 'dc-title' }, m.title),
      h('span', { class: 'dc-meta' }, D.formatDMY(m.date) + ' · ' + m.category + ' · ' + M.formatCount(m.words) + ' words' + (m.status === 'final' ? ' · Final' : '')));
  }

  /* ---------- Documents ---------- */
  function renderDocs() {
    var q = $('#docSearch').value.trim().toLowerCase();
    var fMode = $('#docMode').value, fStatus = $('#docStatusF').value, sort = $('#docSort').value;
    var cats = new Set();
    var list = Store.metas().filter(function (m) {
      cats.add(m.category);
      if (fMode && m.mode !== fMode) return false;
      if (fStatus && m.status !== fStatus) return false;
      if (q && (m.title + ' ' + m.category).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    // Stable sort with tie-breakers: chosen key, then date, then name.
    var cmp = {
      updated: byUpdated,
      date: function (a, b) { return String(b.date).localeCompare(String(a.date)) || String(a.title).localeCompare(String(b.title)) || (b.u - a.u); },
      title: function (a, b) { return String(a.title).localeCompare(String(b.title)) || String(b.date).localeCompare(String(a.date)) || (b.u - a.u); },
      words: function (a, b) { return (b.words - a.words) || String(b.date).localeCompare(String(a.date)) || String(a.title).localeCompare(String(b.title)); }
    }[sort] || byUpdated;
    list.sort(cmp);
    var dl = $('#catList'); dl.textContent = '';
    Array.from(cats).sort().forEach(function (c) { dl.appendChild(h('option', { value: c })); });
    var tbody = $('#docRows'); tbody.textContent = '';
    $('#docCount').textContent = M.formatCount(list.length) + ' of ' + M.formatCount(Store.metas().length) + ' documents';
    $('#docEmpty').hidden = list.length > 0;
    $('#docEmpty').textContent = Store.metas().length ? 'No documents match these filters. Clear the search or choose "All types".' : 'No documents yet. Choose "New minutes" or "New study notes" to start; nothing needs saving by hand.';
    list.forEach(function (m) {
      var openA = h('a', { href: '#edit/' + m.id, class: 'doc-link' }, m.title);
      tbody.appendChild(h('tr', null,
        h('td', { 'data-label': 'Title' }, openA),
        h('td', { 'data-label': 'Type' }, WN.dashboard.MODE_LABEL[m.mode]),
        h('td', { 'data-label': 'Category' }, h('span', null, h('span', { class: 'cat-dot', style: { background: colorFor(m.category) } }), m.category)),
        h('td', { 'data-label': 'Date', class: 'num' }, D.formatDMY(m.date)),
        h('td', { 'data-label': 'Words', class: 'num' }, M.formatCount(m.words)),
        h('td', { 'data-label': 'Status' }, m.status === 'final' ? 'Final' : 'Draft'),
        h('td', { 'data-label': 'Actions', class: 'row-actions' },
          h('button', { class: 'btn sm', type: 'button', onclick: function () { duplicate(m.id); } }, 'Duplicate'),
          h('button', { class: 'btn sm danger', type: 'button', onclick: function () { remove(m); } }, 'Delete'))));
    });
  }

  function duplicate(id) {
    Store.getDoc(id).then(function (d) {
      if (!d) return;
      var c = JSON.parse(JSON.stringify(d));
      c.id = MODEL.uid('d'); c.created = Date.now(); c.title = (d.title || 'Untitled') + ' (copy)'; c.status = 'draft'; c.revisions = []; c.protect = { mode: 'none' };
      return Store.putDoc(c).then(function () { toast('Copy created.'); renderDocs(); });
    }).catch(function (e) { logError(e, 'duplicate'); toast('Could not duplicate: ' + e.message, 'error'); });
  }

  function remove(m) {
    confirmDialog('Delete document?', '"' + m.title + '" will be deleted on this device and on your synced devices. Export it first if you may need it.', 'Delete', true).then(function (ok) {
      if (!ok) return;
      Store.deleteDoc(m.id).then(function () { if (Ed.doc && Ed.doc.id === m.id) Ed.close(); toast('Document deleted.'); renderDocs(); });
    });
  }

  /* ---------- Dashboard ---------- */
  function renderDash() {
    var data = WN.dashboard.aggregate(Store.metas(), D.localISO());
    var k = $('#kpis'); k.textContent = '';
    [['Documents', M.formatCount(data.total), 'saved on this device'],
     ['Words written', M.formatCount(data.words), 'across all documents'],
     ['Open actions', M.formatCount(data.actions.open), M.formatCount(data.actions.dueNext7) + ' due in 7 days'],
     ['Overdue actions', M.formatCount(data.actions.overdue), data.actions.overdue ? 'past their due date' : 'nothing overdue', data.actions.overdue ? 'warn' : '']
    ].forEach(function (x) { k.appendChild(h('div', { class: 'kpi ' + (x[3] || '') }, h('span', { class: 'kpi-label' }, x[0]), h('span', { class: 'kpi-value num' }, x[1]), h('span', { class: 'kpi-sub' }, x[2]))); });
    var grid = $('#dashCharts'); grid.textContent = '';
    $('#dashEmpty').hidden = data.total > 0;
    if (!data.total) return;
    grid.appendChild(Charts.card('Documents per ISO week (last 8)', data.weeks.map(function (w) { return { label: w.label, value: w.count, color: '#059669' }; }), 'bar', 'Documents'));
    grid.appendChild(Charts.card('Documents by type', data.byMode.map(function (x) { return { label: x.label, value: x.count, color: colorFor(x.key) }; }), 'bar', 'Documents'));
    grid.appendChild(Charts.card('Documents by category', data.byCategory.map(function (x) { return { label: x.label, value: x.count, color: colorFor(x.key) }; }), 'bar', 'Documents'));
    grid.appendChild(Charts.card('Draft and final', data.byStatus.map(function (x) { return { label: x.label, value: x.count, color: x.key === 'Final' ? '#059669' : '#d97706' }; }), 'bar', 'Documents'));
    grid.appendChild(Charts.card('Action items', [{ label: 'Done', value: data.actions.done, color: '#059669' }, { label: 'Open, on time', value: data.actions.open - data.actions.overdue, color: '#2563eb' }, { label: 'Overdue', value: data.actions.overdue, color: '#dc2626' }], 'bar', 'Actions'));
    var rec = h('div', { class: 'card' }, h('h3', null, 'Recently edited'));
    data.recent.forEach(function (m) { rec.appendChild(docCard(m)); });
    grid.appendChild(rec);
  }

  /* ---------- Editor empty state ---------- */
  function renderEdEmpty() {
    var last = Store.metas().sort(byUpdated)[0];
    var b = $('#edEmptyLast'); b.textContent = '';
    if (last) b.appendChild(h('a', { class: 'btn', href: '#edit/' + last.id }, 'Continue "' + last.title + '"'));
  }

  /* ---------- Settings ---------- */
  /** Audit summary of the imported template: counts and roles only, never the removed text itself. */
  function showTemplate(rec) {
    var box = $('#tplReport'); box.textContent = '';
    if (!rec) { box.appendChild(h('p', { class: 'hint' }, 'No template imported. Office documents use the built-in template.')); return; }
    var a = rec.audit, b = a.before, af = a.after;
    var li = function (t) { return h('li', null, t); };
    box.appendChild(h('p', null, h('strong', null, rec.name), ' imported on ' + D.formatStamp(rec.at) + '.'));
    box.appendChild(h('ul', null,
      li(b.styles + ' styles (' + b.paragraphStyles + ' paragraph, ' + b.tableStyles + ' table); headings ' + (b.headingsNumbered ? 'are numbered by the template' : 'are not numbered') + '.'),
      li('Fonts: ' + (b.fonts.join(', ') || 'none named') + (b.fontsNotInWord.length ? '. Not standard in Word: ' + b.fontsNotInWord.join(', ') + ' (declared so Word substitutes a similar font)' : '') + '.'),
      li('Headers ' + b.headers + ', footers ' + b.footers + '; different first page: ' + (b.titlePg ? 'yes' : 'no') + '; PAGE field: ' + (b.pageFields ? 'yes' : 'no') + '; NUMPAGES: ' + (b.numPagesField ? 'yes' : 'no') + '.'),
      li(a.addedStyles.length ? 'Added missing styles: ' + a.addedStyles.join(', ') + '.' : 'No styles were missing.'),
      li(b.privacy.length ? 'Removed or flagged: ' + b.privacy.join('; ') + '.' : 'No personal or organisation data found.'),
      li(af.privacy.length ? 'Still to review by hand: ' + af.privacy.join('; ') + '.' : 'Nothing left to review.')));
  }

  function renderSettings() {
    $('#setTheme').value = settings.get('theme', 'system');
    $('#setMemory').checked = settings.get('memorySaver', true);
    $('#setAuthor').value = settings.get('author', '');
    $('#setSpell').checked = Spell.enabled();
    $('#tplUse').checked = settings.get('useImportedTemplate', false);
    Docx.storedTemplate().then(showTemplate).catch(function (e) { logError(e, 'template'); });
    $('#setSpellWords').value = Spell.personal().join('\n');
    $('#setSpellInfo').textContent = Spell.personal().length + ' word(s) in your dictionary, stored in this browser only.';
    $('#syncSupport').hidden = Sync.supported();
    $('#syncFolder').textContent = Sync.folderName() ? 'Folder: ' + Sync.folderName() : 'No folder chosen. Documents stay in this browser only.';
    $('#errCount').textContent = errorLog.length ? errorLog.length + ' entries' : 'No errors recorded.';
    $('#errView').textContent = errorLog.length ? errorLogText() : '';
    $('#appVersion').textContent = 'Version ' + MODEL.VERSION + ' · 17/11/2026';
    Sync.render();
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(function (e) {
      // Explicit conversion: bytes -> MB divides by 1,048,576 (1,024 x 1,024).
      $('#storageUse').textContent = 'Using ' + (e.usage / 1048576).toFixed(1) + ' MB of ' + M.formatCount(Math.round(e.quota / 1048576)) + ' MB available to this site.';
    });
  }

  function bind() {
    window.addEventListener('hashchange', route);
    // The skip link targets #main; handle it here so the router does not treat "main" as a page.
    $('.skip').addEventListener('click', function (e) { e.preventDefault(); $('#main').focus(); });
    $$('[data-new]').forEach(function (b) { b.addEventListener('click', function () { createAndOpen(b.getAttribute('data-new')); }); });
    ['docSearch', 'docMode', 'docStatusF', 'docSort'].forEach(function (id) { $('#' + id).addEventListener('input', renderDocs); });
    $('#setTheme').addEventListener('change', function () { settings.set('theme', this.value); applyTheme(); });
    $('#setMemory').addEventListener('change', function () { settings.set('memorySaver', this.checked); toast(this.checked ? 'Memory saver on: pictures are resized and fewer undo steps are kept.' : 'Memory saver off.'); });
    $('#setAuthor').addEventListener('change', function () { settings.set('author', this.value.trim().slice(0, 80)); });
    $('#tplImport').addEventListener('click', function () {
      var inp = h('input', { type: 'file', accept: '.docx,.dotx,application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        $('#tplReport').textContent = 'Checking ' + f.name + '…';
        Docx.importTemplate(f).then(function (rec) { settings.set('useImportedTemplate', true); $('#tplUse').checked = true; showTemplate(rec); toast('Template imported and cleaned.'); })
          .catch(function (e) { $('#tplReport').textContent = ''; toast(e.message, 'error', 8000); });
      });
      inp.click();
    });
    $('#tplRemove').addEventListener('click', function () { Docx.removeTemplate().then(function () { settings.set('useImportedTemplate', false); $('#tplUse').checked = false; showTemplate(null); toast('Imported template removed. Office documents use the built-in template.'); }); });
    $('#tplUse').addEventListener('change', function () { settings.set('useImportedTemplate', this.checked); });
    $('#setSpell').addEventListener('change', function () { if (this.checked !== Spell.enabled()) Spell.toggle(); toast('Spell check ' + (this.checked ? 'on' : 'off') + '.'); });
    $('#setSpellSave').addEventListener('click', function () {
      var raw = $('#setSpellWords').value.split(/\r?\n/);
      var bad = raw.filter(function (w) { return w.trim() && (/\s/.test(w.trim()) || w.trim().length > 60); });
      var n = Spell.setWords(raw);
      $('#setSpellWords').value = Spell.personal().join('\n');
      $('#setSpellInfo').textContent = n + ' word(s) saved.' + (bad.length ? ' Skipped ' + bad.length + ' line(s) with spaces or over 60 letters.' : '');
    });
    $('#syncChoose').addEventListener('click', function () { Sync.choose().then(renderSettings); });
    $('#syncNow').addEventListener('click', function () { Sync.runNow().then(renderSettings); });
    $('#syncOff').addEventListener('click', function () { Sync.disconnect().then(renderSettings); });
    $('#syncPill').addEventListener('click', function () { var s = Sync.state(); if (s === 'access') Sync.regrant(); else if (s === 'problem' || s === 'waiting') Sync.runNow(); else go('#settings'); });
    $('#errDownload').addEventListener('click', function () { download('wrapnote-errors.log', errorLogText()); });
    $('#errClear').addEventListener('click', function () { errorLog = []; settings.set('errors', []); renderSettings(); });
    $('#quickReset').addEventListener('click', function () { settings.set('quickDone', false); QuickStart.show(); });
    $('#loadExample').addEventListener('click', loadExample);
    $('#loadExample2').addEventListener('click', loadExample);
    $('#themeBtn').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      settings.set('theme', cur === 'dark' ? 'light' : 'dark'); applyTheme();
    });
  }

  /** The worked example from the guide, created as a real document. All content is made up. */
  function loadExample() {
    var d = MODEL.newDoc('mom', Date.now(), '2026-10-28');
    d.title = 'Worked example: project sync';
    d.category = 'Examples';
    Object.assign(d.fields.mom, { date: '2026-10-28', from: '23:30', to: '00:45', location: 'https://meet.example.org/sync', host: 'A. Rao', scribe: 'K. Iyer',
      purpose: 'Agree the pilot plan and budget.', present: ['A. Rao', 'K. Iyer', 'M. Das'], absent: ['P. Sen'], agenda: 'Pilot status\nBudget', decisions: 'Extend the pilot by two weeks.',
      actions: [{ id: 'a1', task: 'Update the plan', owner: 'K. Iyer', due: '2026-11-04', done: false }, { id: 'a2', task: 'Book the venue', owner: 'M. Das', due: '2026-11-02', done: true }],
      nextDate: '2026-11-04', nextTime: '10:00' });
    d.html = '<div class="wn-gen" data-gen="mom" contenteditable="false">' + MODEL.renderGenerated(d) + '</div>';
    return Store.putDoc(d).then(function () { toast('Worked example created.'); go('#edit/' + d.id); });
  }

  return { route: route, go: go, show: show, createAndOpen: createAndOpen, renderDocs: renderDocs, renderDash: renderDash, bind: bind, current: function () { return current; }, loadExample: loadExample };
})();

function applyTheme() {
  var t = settings.get('theme', 'system');
  var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  var meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#f8fafc');
}

/* ---------- Charts: SVG with a Chart / Table toggle so numbers are always readable as text ---------- */
var Charts = (function () {
  function fmt(v, money) { return money ? M.formatPaise(v) : M.formatCount(v); }

  /** One value axis starting at zero, light grid, bars coloured by category. */
  function barSVG(data, axisLabel) {
    var W = 400, H = 210, L = 52, B = 40, top = 12; // viewBox units; text sizes below are in the same units
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    var nice = niceMax(max), ticks = 4;
    var money = data.some(function (d) { return d.money; });
    // Left gutter grows with the widest tick label so the axis title never overlaps the numbers.
    var widest = String(M.formatCount(money ? Math.round(nice / 100) : nice)).length;
    L = Math.max(L, 30 + widest * 7.5);
    var bw = (W - L - 10) / data.length;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(axisLabel) + ' chart" class="chart-svg">';
    for (var i = 0; i <= ticks; i++) {
      var y = top + (H - B - top) * (1 - i / ticks), v = nice * i / ticks;
      s += '<line x1="' + L + '" x2="' + (W - 6) + '" y1="' + y + '" y2="' + y + '" class="grid"/>' +
        '<text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" class="tick">' + esc(money ? M.formatCount(Math.round(v / 100)) /* paise -> rupees: divide by 100 */ : M.formatCount(Math.round(v))) + '</text>';
    }
    data.forEach(function (d, i) {
      var w = Math.min(bw * 0.64, 56), bh = (H - B - top) * (d.value / nice), cx = L + i * bw + bw / 2, y = H - B - bh;
      s += '<rect x="' + (cx - w / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(0, bh).toFixed(1) + '" rx="2" fill="' + d.color + '"><title>' + esc(d.label + ': ' + fmt(d.value, d.money)) + '</title></rect>' +
        '<text x="' + cx.toFixed(1) + '" y="' + (H - B + 18) + '" text-anchor="middle" class="lab">' + esc(String(d.label).length > 18 ? String(d.label).slice(0, 17) + '…' : String(d.label)) + '</text>';
    });
    s += '<text x="11" y="' + (top + (H - B - top) / 2) + '" transform="rotate(-90 12 ' + (top + (H - B - top) / 2) + ')" text-anchor="middle" class="axis">' + esc(axisLabel) + '</text></svg>';
    return s;
  }

  function niceMax(v) {
    if (v <= 4) return 4;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  function table(data, axisLabel) {
    var t = h('table', { class: 'data-table' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Item'), h('th', { scope: 'col', class: 'num' }, axisLabel))));
    var tb = h('tbody');
    data.forEach(function (d) { tb.appendChild(h('tr', null, h('td', null, h('span', { class: 'cat-dot', style: { background: d.color } }), d.label), h('td', { class: 'num' }, fmt(d.value, d.money)))); });
    t.appendChild(tb);
    return t;
  }

  function card(title, data, kind, axisLabel) {
    var body = h('div', { class: 'chart-body' });
    var chartBtn = h('button', { type: 'button', class: 'seg-btn active', 'aria-pressed': 'true' }, 'Chart');
    var tableBtn = h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': 'false' }, 'Table');
    function showChart(on) {
      body.textContent = '';
      if (on) body.innerHTML = barSVG(data, axisLabel); else body.appendChild(table(data, axisLabel));
      chartBtn.classList.toggle('active', on); tableBtn.classList.toggle('active', !on);
      chartBtn.setAttribute('aria-pressed', on); tableBtn.setAttribute('aria-pressed', !on);
    }
    chartBtn.onclick = function () { showChart(true); };
    tableBtn.onclick = function () { showChart(false); };
    showChart(true);
    return h('div', { class: 'card chart-card' }, h('div', { class: 'card-head' }, h('h3', null, title), h('div', { class: 'seg', role: 'group', 'aria-label': 'View as' }, chartBtn, tableBtn)), body);
  }

  return { card: card, barSVG: barSVG, niceMax: niceMax };
})();

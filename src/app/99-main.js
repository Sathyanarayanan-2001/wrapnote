/* WrapNote app: quick start, small canvas behaviours, and start-up. */
var QuickStart = (function () {
  var STEPS = [
    ['Start in two taps', 'On Home, choose "New minutes" (or "New study notes"). The editor opens with guided fields on the left and the page on the right.'],
    ['Fill the fields', 'Type the title, date (day first, 28/10/2026), times (24-hour) and people. The page builds itself as you type. Everything saves automatically.'],
    ['Add blocks', 'Use "Add content blocks" for text with labels, tables, pictures and screenshots. Reorder or delete them from the block list.'],
    ['Polish and export', 'Use the ribbon like Word. When done, choose "Confirm end of document", then export to PDF, Word or HTML.']
  ];
  function show() {
    var i = 0;
    var body = h('div', { class: 'qs' });
    var dlg;
    function draw() {
      body.textContent = '';
      body.appendChild(h('p', { class: 'qs-step' }, 'Step ' + (i + 1) + ' of ' + STEPS.length));
      body.appendChild(h('h3', null, STEPS[i][0]));
      body.appendChild(h('p', null, STEPS[i][1]));
      body.appendChild(h('div', { class: 'qs-dots', 'aria-hidden': 'true' }, STEPS.map(function (s, k) { return h('span', { class: k === i ? 'on' : '' }); })));
    }
    draw();
    // The flag is saved on the click itself; the dialog's close event can arrive after a fast reload.
    dlg = openDialog({ title: 'Quick start', body: body, onClose: function () { settings.set('quickDone', true); }, actions: [
      { label: 'Skip', onClick: function () { settings.set('quickDone', true); } },
      { label: 'Back', onClick: function () { if (i > 0) { i--; draw(); } return false; } },
      { label: 'Next', primary: true, onClick: function () { if (i < STEPS.length - 1) { i++; draw(); return false; } settings.set('quickDone', true); } }] });
  }
  function maybeShow() { if (!settings.get('quickDone', false)) show(); }
  return { show: show, maybeShow: maybeShow };
})();

/* Drag objects set to "Behind text" or "In front of text"; toggle chart table view. */
function bindCanvasExtras() {
  var d = Ed.el();
  d.addEventListener('pointerdown', function (e) {
    var o = e.target.closest('.wrap-behind, .wrap-front');
    if (!o || !o.classList.contains('wn-selected') || e.target.closest('[contenteditable="true"]') && e.target.closest('.wn-textbox-inner')) return;
    e.preventDefault();
    var z = Layout.zoom(), sx = e.clientX, sy = e.clientY, ox = parseFloat(o.style.left) || 0, oy = parseFloat(o.style.top) || 0;
    function mv(ev) { o.style.left = (ox + (ev.clientX - sx) / z) + 'px'; o.style.top = (oy + (ev.clientY - sy) / z) + 'px'; }
    function up() { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); Ed.changed(); }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  });
  d.addEventListener('click', function (e) {
    var tg = e.target.closest('.wn-chart-toggle');
    if (!tg) return;
    var fig = tg.closest('.wn-chart'), table = fig.getAttribute('data-display') === 'table';
    fig.setAttribute('data-display', table ? 'chart' : 'table');
    tg.textContent = table ? 'Show table' : 'Show chart';
    Ed.changed();
  });
  // Phone: switch between the fields pane and the page.
  $$('#phoneSwitch button').forEach(function (b) {
    b.addEventListener('click', function () {
      var pane = b.getAttribute('data-pane');
      $('#edBody').setAttribute('data-phone', pane);
      $$('#phoneSwitch button').forEach(function (x) { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      if (pane === 'doc') Layout.setZoom('auto');
    });
  });
}

/* Keep the field being typed in above the on-screen keyboard, without closing it on resize. */
function bindKeyboardSafety() {
  if (!window.visualViewport) return;
  window.visualViewport.addEventListener('resize', function () {
    var a = document.activeElement;
    if (!a || !/INPUT|TEXTAREA|SELECT/.test(a.tagName) && !a.isContentEditable) return;
    document.documentElement.style.setProperty('--kb', Math.max(0, window.innerHeight - window.visualViewport.height) + 'px');
    setTimeout(function () { var r = a.getBoundingClientRect(); if (r.bottom > window.visualViewport.height - 8 || r.top < 0) a.scrollIntoView({ block: 'center' }); }, 60);
  });
}

/* Read-only hooks used by the browser tests to compare on-screen figures with separately computed numbers. */
WN.debug = {
  metas: function () { return JSON.parse(JSON.stringify(Store.metas())); },
  layoutMs: function () { var t = performance.now(); Layout.run(); return performance.now() - t; },
  pages: function () { return Layout.pages(); },
  doc: function () { return Ed.doc ? JSON.parse(JSON.stringify(Ed.doc)) : null; },
  syncState: function () { return Sync.state(); },
  timings: function () { return Object.assign({}, timings); }
};

function boot() {
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  window.addEventListener('error', function (e) { logError(e.error || e.message, 'window.onerror'); });
  window.addEventListener('unhandledrejection', function (e) { logError(e.reason, 'unhandledrejection'); });
  Store.open().then(function () {
    if (Store.isMemoryOnly()) toast('This browser blocks storage (private mode?). Work will be lost when the tab closes. Export often.', 'error', 10000);
    Pages.bind(); Ed.bind(); Review.bind(); Views.bind(); IO.bind(); bindCanvasExtras(); bindKeyboardSafety();
    Ribbon.build();
    Store.onChange(function () { var p = Pages.current(); if (p === 'docs') Pages.renderDocs(); if (p === 'dash') Pages.renderDash(); });
    return Fonts.init().catch(function (e) { logError(e, 'fonts'); });
  }).then(function () {
    Pages.route();
    QuickStart.maybeShow();
    Sync.init();
    document.body.classList.add('ready');
  }).catch(function (e) { logError(e, 'boot'); toast('WrapNote could not start: ' + e.message + '. Reload the page.', 'error', 15000); });
  // Service worker only on http(s); file:// pages cannot register one.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function (e) { logError(e, 'sw.register'); }); });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

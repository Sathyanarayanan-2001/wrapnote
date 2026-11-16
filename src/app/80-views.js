/* WrapNote app: View tab. Reading modes, navigation pane, split view, new window, side by side. */
var Views = (function () {
  var chan = null, winId = Math.random().toString(36).slice(2), splitMode = 'off';

  function flash(el) {
    if (!el || !el.scrollIntoView) return;
    el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    el.classList.add('wn-flash'); setTimeout(function () { el.classList.remove('wn-flash'); }, 1400);
  }

  function overlay(cls, title, body, onClose) {
    var ov = h('div', { class: 'overlay ' + cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    var close = function () { ov.remove(); document.body.classList.remove('has-overlay'); if (onClose) onClose(); };
    ov.appendChild(h('div', { class: 'ov-bar' }, h('strong', null, title), h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn', onclick: close }, 'Close (Esc)')));
    ov.appendChild(body);
    ov.close = close;
    document.body.appendChild(ov); document.body.classList.add('has-overlay');
    var f = ov.querySelector('button'); if (f) f.focus();
    return ov;
  }
  function contentClone() {
    var c = Ed.el().cloneNode(true);
    c.removeAttribute('id'); c.removeAttribute('contenteditable'); c.removeAttribute('style');
    $$('[contenteditable]', c).forEach(function (x) { x.removeAttribute('contenteditable'); });
    $$('[data-wn-push]', c).forEach(function (x) { x.style.marginTop = x.getAttribute('data-wn-orig') || ''; });
    return c;
  }

  function printLayout() { escape(); Layout.setZoom('auto'); toast('Print layout.'); }

  /* Read mode: two columns per screen, turn pages with the arrow keys. */
  function readMode() {
    var c = contentClone(); c.className = 'doc-content read-flow';
    var view = h('div', { class: 'read-view', tabindex: '0' }, c);
    var info = h('span', { class: 'num' });
    var ov = overlay('ov-read', 'Read mode', h('div', { class: 'read-wrap' }, view, h('div', { class: 'read-nav' },
      h('button', { type: 'button', class: 'btn', onclick: function () { turn(-1); } }, '← Previous'), info, h('button', { type: 'button', class: 'btn', onclick: function () { turn(1); } }, 'Next →'))));
    function turn(d) { view.scrollLeft += d * view.clientWidth; setTimeout(upd, 350); }
    function upd() { var total = Math.max(1, Math.round(view.scrollWidth / view.clientWidth)); info.textContent = 'Screen ' + (Math.round(view.scrollLeft / view.clientWidth) + 1) + ' of ' + total; }
    view.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); turn(1); } if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); turn(-1); } });
    view.focus(); setTimeout(upd, 100);
    return ov;
  }

  /* Outline: collapsible heading tree with promote / demote. */
  function outline() {
    var body = h('div', { class: 'outline' });
    function draw() {
      body.textContent = '';
      var heads = $$('h1,h2,h3,h4', Ed.el()).filter(function (x) { return !x.closest('.wn-toc'); });
      if (!heads.length) { body.appendChild(h('p', { class: 'empty' }, 'No headings yet. Use Home, Styles, Heading 1 to 4 to structure the document.')); return; }
      var ul = h('ul', { class: 'ol-tree' });
      heads.forEach(function (hd) {
        var lvl = +hd.tagName[1];
        var next = []; var n = Ed.topBlock(hd) ? Ed.topBlock(hd).nextElementSibling : null;
        while (n && !/^H[1-4]$/.test(n.tagName) && !n.querySelector('h1,h2,h3,h4')) { next.push(n); n = n.nextElementSibling; }
        var kids = h('div', { class: 'ol-body', hidden: true }, next.slice(0, 6).map(function (x) { return h('p', null, x.textContent.trim().slice(0, 160)); }));
        var tog = h('button', { type: 'button', class: 'icon-btn', 'aria-expanded': 'false', 'aria-label': 'Expand' }, '▸');
        tog.addEventListener('click', function () { var o = kids.hidden; kids.hidden = !o; tog.textContent = o ? '▾' : '▸'; tog.setAttribute('aria-expanded', String(o)); });
        var gen = !!hd.closest('.wn-gen');
        ul.appendChild(h('li', { class: 'ol-l' + lvl }, tog,
          h('button', { type: 'button', class: 'linkish', onclick: function () { ov.close(); flash(hd); } }, hd.textContent.trim() || '(empty heading)'),
          gen ? h('span', { class: 'hint' }, ' generated') : h('span', { class: 'ol-acts' },
            h('button', { type: 'button', class: 'btn sm', disabled: lvl === 1, onclick: function () { relevel(hd, lvl - 1); draw(); } }, 'Promote'),
            h('button', { type: 'button', class: 'btn sm', disabled: lvl === 4, onclick: function () { relevel(hd, lvl + 1); draw(); } }, 'Demote')), kids));
      });
      body.appendChild(ul);
    }
    function relevel(hd, l) { Ed.snapshot(); var n = h('h' + l); Array.prototype.slice.call(hd.attributes).forEach(function (a) { n.setAttribute(a.name, a.value); }); while (hd.firstChild) n.appendChild(hd.firstChild); hd.replaceWith(n); Ed.changed(); }
    var ov = overlay('ov-outline', 'Outline view', body);
    draw();
  }

  function focus() { document.body.classList.add('focus-mode'); toast('Focus mode. Press Esc to leave.'); Layout.setZoom('auto'); }

  /* Immersive reader: text width, line spacing, page tint, syllables and a line-focus band. */
  function immersive() {
    var c = h('div', { class: 'imm-text' });
    $$('h1,h2,h3,h4,p,li,blockquote,dt,dd,tr', Ed.el()).forEach(function (b) {
      if (b.closest('.wn-chart-data')) return;
      if (b.tagName === 'TR') { var cells = Array.prototype.map.call(b.cells, function (x) { return x.textContent.trim(); }).filter(Boolean); if (cells.length) c.appendChild(h('p', null, cells.join(' · '))); return; }
      if (b.querySelector('p,li') || b.closest('td,th') || !b.textContent.trim()) return;
      c.appendChild(h(/^H/.test(b.tagName) ? 'h3' : 'p', null, b.textContent.trim()));
    });
    var width = h('input', { type: 'range', min: 30, max: 100, value: 60, 'aria-label': 'Text width' });
    var lh = h('input', { type: 'range', min: 12, max: 30, value: 18, 'aria-label': 'Line spacing' });
    var tint = h('select', { 'aria-label': 'Page colour' }, [['plain', 'Plain'], ['sepia', 'Sepia'], ['blue', 'Blue'], ['green', 'Green'], ['dark', 'Dark']].map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    var syl = h('input', { type: 'checkbox' }), lf = h('select', { 'aria-label': 'Line focus' }, [['0', 'Line focus off'], ['1', 'One line'], ['3', 'Three lines'], ['5', 'Five lines']].map(function (o) { return h('option', { value: o[0] }, o[1]); }));
    var band = h('div', { class: 'imm-band', hidden: true });
    var stage = h('div', { class: 'imm-stage tint-plain' }, c, band);
    var original = c.innerHTML;
    function apply() {
      c.style.maxWidth = width.value + 'ch'; c.style.lineHeight = (lh.value / 10).toFixed(1);
      stage.className = 'imm-stage tint-' + tint.value;
      if (syl.checked) $$('p,h3', c).forEach(function (p) { p.textContent = p.textContent.split(/(\s+)/).map(function (w) { return /\s/.test(w) ? w : T.syllables(w).join('·'); }).join(''); });
      else c.innerHTML = original;
      band.hidden = lf.value === '0';
      band.style.height = (+lf.value * parseFloat(getComputedStyle(c).fontSize) * (lh.value / 10)) + 'px';
    }
    [width, lh, tint, syl, lf].forEach(function (x) { x.addEventListener('input', apply); });
    stage.addEventListener('pointermove', function (e) { if (!band.hidden) band.style.top = (e.clientY - stage.getBoundingClientRect().top + stage.scrollTop - band.offsetHeight / 2) + 'px'; });
    stage.addEventListener('keydown', function (e) { if (band.hidden) return; var step = parseFloat(getComputedStyle(c).lineHeight) || 24; if (e.key === 'ArrowDown') { band.style.top = (band.offsetTop + step) + 'px'; e.preventDefault(); } if (e.key === 'ArrowUp') { band.style.top = Math.max(0, band.offsetTop - step) + 'px'; e.preventDefault(); } });
    stage.tabIndex = 0;
    overlay('ov-imm', 'Immersive reader', h('div', { class: 'imm' }, h('div', { class: 'imm-tools' },
      h('label', null, 'Text width ', width), h('label', null, 'Line spacing ', lh), tint, h('label', { class: 'chk' }, syl, 'Syllables (approximate)'), lf), stage));
    apply();
  }

  /* Navigation pane: clickable outline plus search. */
  function navPane(force) {
    var p = $('#navPane');
    var show = force === undefined ? p.hidden : force;
    p.hidden = !show;
    if (show) drawNav();
    Ribbon.refreshState(); Layout.setZoom('auto');
  }
  var drawNav = debounce(function () {
    var p = $('#navPane'); if (p.hidden || !Ed.doc) return;
    var q = $('#navSearch') ? $('#navSearch').value : '';
    p.textContent = '';
    var inp = h('input', { type: 'search', id: 'navSearch', placeholder: 'Search document', 'aria-label': 'Search document', value: q });
    inp.addEventListener('input', function () { drawNav(); });
    p.appendChild(h('div', { class: 'sp-head' }, h('h2', null, 'Navigation'), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close navigation pane', onclick: function () { navPane(false); } }, '×')));
    p.appendChild(inp);
    var list = h('ul', { class: 'nav-list' });
    if (q.trim()) {
      var needle = q.trim().toLowerCase(), n = 0;
      $$('p,li,h1,h2,h3,h4,td,th,dd,dt', Ed.el()).forEach(function (b) {
        if (n >= 50 || b.querySelector('p,li')) return;
        var t = b.textContent, i = t.toLowerCase().indexOf(needle);
        if (i < 0) return; n++;
        list.appendChild(h('li', null, h('button', { type: 'button', class: 'linkish', onclick: function () { flash(b); } }, '…' + t.slice(Math.max(0, i - 25), i + needle.length + 35) + '…')));
      });
      if (!n) list.appendChild(h('li', { class: 'empty' }, 'No results.'));
    } else {
      var heads = $$('h1,h2,h3,h4', Ed.el()).filter(function (x) { return !x.closest('.wn-toc'); });
      if (!heads.length) list.appendChild(h('li', { class: 'empty' }, 'Headings appear here. Apply Heading 1 to 4 from Home, Styles.'));
      heads.forEach(function (hd) { list.appendChild(h('li', { class: 'nl' + hd.tagName[1] }, h('button', { type: 'button', class: 'linkish', onclick: function () { flash(hd); } }, hd.textContent.trim() || '(empty)'))); });
    }
    p.appendChild(list);
    var f = $('#navSearch'); if (f && q && document.activeElement !== f) { f.focus(); f.selectionStart = f.selectionEnd = f.value.length; }
  }, 300);

  /* Split view: a live, scrollable second view of the same document. Click in it to jump there. */
  function split(mode) {
    splitMode = mode;
    var sp = $('#splitPane'), body = $('#edBody');
    body.classList.remove('split-vertical', 'split-horizontal');
    if (mode === 'off') { sp.hidden = true; sp.textContent = ''; Layout.setZoom('auto'); return; }
    body.classList.add('split-' + mode);
    sp.hidden = false; drawSplit(); Layout.setZoom('auto');
  }
  var drawSplit = debounce(function () {
    var sp = $('#splitPane'); if (sp.hidden) return;
    var top = sp.scrollTop;
    sp.textContent = '';
    var c = contentClone(); c.className = 'doc-content split-flow';
    c.addEventListener('click', function (e) {
      var t = e.target.closest('p,li,h1,h2,h3,h4,table,figure,div'); if (!t) return;
      var path = []; var n = t; while (n && n !== c) { path.unshift(Array.prototype.indexOf.call(n.parentNode.children, n)); n = n.parentNode; }
      var m = Ed.el(); path.forEach(function (i) { m = m && m.children[i]; }); if (m) flash(m);
    });
    sp.appendChild(h('div', { class: 'split-label' }, 'Second view (live) · click to jump'));
    sp.appendChild(c); sp.scrollTop = top;
  }, 300);

  function arrange() {
    var body = $('#edBody');
    if (splitMode === 'off') split('vertical');
    navPane(true);
    $('#intake').hidden = false;
    body.classList.add('arranged');
    toast('Arranged: fields, navigation, document and a second view side by side.');
  }

  /* New window, kept in step with BroadcastChannel. */
  function newWindow() {
    Ed.saveNow().then(function () { var w = window.open(location.pathname + '#edit/' + Ed.doc.id, '_blank'); if (!w) toast('The browser blocked the new window. Allow pop-ups for this site.', 'error'); });
  }
  function broadcast() { if (chan && Ed.doc) try { chan.postMessage({ type: 'doc', id: Ed.doc.id, u: Ed.doc.u, from: winId }); } catch (e) { logError(e, 'broadcast'); } }
  function listen() {
    if (!('BroadcastChannel' in window)) return;
    chan = new BroadcastChannel('wrapnote-live');
    chan.onmessage = function (e) {
      var m = e.data || {};
      if (m.from === winId || m.type !== 'doc' || typeof m.id !== 'string') return;
      if (Ed.doc && Ed.doc.id === m.id && !document.hasFocus()) {
        Store.getDoc(m.id).then(function (d) { if (d && Ed.doc && d.u > Ed.doc.u && !document.hasFocus()) { var sc = $('#canvasScroll').scrollTop; Ed.open(m.id).then(function () { $('#canvasScroll').scrollTop = sc; }); } });
      }
      if (Pages.current() === 'docs') Pages.renderDocs();
    };
  }

  /* View side by side: the current document next to a saved revision or another document, scrolling together. */
  function sideBySide() {
    var s = h('select');
    s.appendChild(h('option', { value: '' }, 'Choose…'));
    Ed.doc.revisions.slice().reverse().forEach(function (r) { s.appendChild(h('option', { value: 'r:' + r.id }, 'Revision: ' + r.label + ' · ' + D.formatStamp(r.t))); });
    Store.metas().filter(function (m) { return m.id !== Ed.doc.id; }).sort(function (a, b) { return b.u - a.u; }).slice(0, 30).forEach(function (m) { s.appendChild(h('option', { value: 'd:' + m.id }, 'Document: ' + m.title)); });
    var syncOn = h('input', { type: 'checkbox', checked: true });
    openDialog({ title: 'View side by side', body: h('div', null, field('Show next to the current document', s), h('label', { class: 'chk' }, syncOn, 'Synchronous scrolling')), actions: [{ label: 'Cancel' }, { label: 'Show', primary: true, onClick: function (err) {
      var v = s.value; if (!v) { err('Choose a revision or a document.'); return false; }
      var p = v.slice(0, 2) === 'r:' ? Promise.resolve(Ed.doc.revisions.filter(function (r) { return r.id === v.slice(2); })[0].html) : Store.getDoc(v.slice(2)).then(function (d) { return d ? d.html : ''; });
      p.then(function (html) {
        var a = contentClone(); a.className = 'doc-content sbs-pane';
        var b = h('div', { class: 'doc-content sbs-pane', html: sanitizeHtml(html) });
        $$('[contenteditable]', b).forEach(function (x) { x.removeAttribute('contenteditable'); });
        overlay('ov-sbs', 'Side by side', h('div', { class: 'sbs' }, a, b));
        if (syncOn.checked) syncScroll(a, b);
      });
    } }] });
  }
  function syncScroll(a, b) {
    var lock = false;
    function link(x, y) { x.addEventListener('scroll', function () { if (lock) return; lock = true; var r = x.scrollTop / Math.max(1, x.scrollHeight - x.clientHeight); y.scrollTop = r * (y.scrollHeight - y.clientHeight); requestAnimationFrame(function () { lock = false; }); }); }
    link(a, b); link(b, a);
  }

  function multiPages() {
    var grid = h('div', { class: 'multi-grid' });
    overlay('ov-multi', 'Multiple pages', grid);
    var info = Layout.buildPages(grid);
    $$('.pp', grid).forEach(function (p, i) { p.addEventListener('click', function () { $('.ov-multi').close(); var g = Layout.geo(); $('#canvasScroll').scrollTop = i * (g.H + 28) * Layout.zoom(); }); p.title = 'Page ' + (i + 1) + ' of ' + info.pages + '. Click to open.'; });
  }

  function escape() {
    var ov = $$('.overlay'); if (ov.length) { ov[ov.length - 1].close(); return; }
    if (document.body.classList.contains('focus-mode')) { document.body.classList.remove('focus-mode'); Layout.setZoom('auto'); }
  }

  function onOpen() { if (splitMode !== 'off') drawSplit(); drawNav(); }

  function bind() {
    listen();
    $('#focusExit').addEventListener('click', escape);
    Store.onChange(function (ids, src) { if (Ed.doc && Pages.current() === 'edit') { drawSplit(); drawNav(); } if (src === 'remote' && Ed.doc && ids.indexOf(Ed.doc.id) >= 0 && !Ed.el().contains(document.activeElement)) Ed.open(Ed.doc.id); });
    Ed.el().addEventListener('input', function () { drawSplit(); drawNav(); });
  }

  return { flash: flash, printLayout: printLayout, readMode: readMode, outline: outline, focus: focus, immersive: immersive, navPane: navPane, split: split, arrange: arrange,
    newWindow: newWindow, broadcast: broadcast, sideBySide: sideBySide, syncScroll: syncScroll, multiPages: multiPages, escape: escape, onOpen: onOpen, bind: bind };
})();

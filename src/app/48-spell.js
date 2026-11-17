/* WrapNote app: spell check as you type.
 * 1.1.0 relied on the browser's own spellcheck attribute. Browsers only mark a word some time after it is
 * typed, skip text that scripts insert, and Chrome often marks nothing in a long contenteditable, so people
 * saw no underlines. Now WrapNote checks words itself:
 *   - nspell with the en-GB Hunspell dictionary runs in a worker from this site's spell/ folder, loaded when
 *     the editor first opens and kept by the service worker for offline use;
 *   - finished words are underlined with the CSS Custom Highlight API, which marks text without changing the
 *     document, so nothing extra is ever saved, exported or printed;
 *   - the word the cursor is in is left alone until it is finished (a space, punctuation or the cursor leaving);
 *   - right-click a marked word for suggestions, Ignore all or Add to dictionary.
 * If the worker or the Highlight API is missing, the browser's own spellcheck is switched back on. */
var Spell = (function () {
  var worker = null, ready = false, failed = false, seq = 0, pending = {}, known = new Map(), ignored = new Set(), menu = null;
  var supported = typeof Worker === 'function' && typeof window.Highlight === 'function' && window.CSS && CSS.highlights;
  // Letters with an inner apostrophe (don't, o'clock). Curly apostrophes are treated as straight ones.
  var WORD = /[A-Za-zÀ-ɏ]+(?:['’][A-Za-zÀ-ɏ]+)*/g;
  var SKIP = '[contenteditable="false"]:not(figcaption), .wn-eq, code, pre, kbd, nav.wn-toc, .wn-capnum, .wn-fnref, .wn-slot, .wn-ocr-raw, .wn-chart-data';

  function enabled() { return settings.get('spellOn', true); }
  function personal() { return settings.get('spellWords', []); }

  function call(msg) {
    return new Promise(function (resolve, reject) {
      var id = ++seq; msg.id = id; pending[id] = { resolve: resolve, reject: reject };
      worker.postMessage(msg);
    });
  }

  function start() {
    if (worker || failed || !supported || !enabled()) return;
    try { worker = new Worker('spell/worker.js'); } catch (e) { fail(e); return; }
    worker.onmessage = function (e) {
      var m = e.data || {};
      if (m.type === 'ready') { ready = true; useOwn(true); check(); return; }
      if (m.type === 'error' && !m.id) { fail(new Error(m.message)); return; }
      var p = pending[m.id]; if (!p) return; delete pending[m.id];
      if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
    };
    worker.onerror = function (e) { fail(new Error(e.message || 'spell worker failed')); };
    worker.postMessage({ type: 'init', personal: personal() });
  }
  function fail(e) {
    failed = true; ready = false; logError(e, 'spell check');
    if (worker) { try { worker.terminate(); } catch (x) { /* already gone */ } worker = null; }
    useOwn(false);
  }
  /** Our underlines replace the browser's, never both at once. */
  function useOwn(on) {
    var d = Ed.el(); if (!d) return;
    d.spellcheck = !on && enabled();
    if (!on && supported) CSS.highlights.delete('wn-spell');
  }

  function normal(w) { return w.replace(/’/g, "'"); }
  /** Words not worth checking: one letter, acronyms (NDA), mixed case (iPhone, McKinsey is still checked). */
  function skipWord(w) { return w.length < 2 || /^[A-ZÀ-Þ]{2,}$/.test(w) || /[a-z][A-Z]/.test(w); }

  /** Text nodes of the editable page, without objects, equations, code and generated tables of contents. */
  function textNodes() {
    var d = Ed.el(), out = [];
    var w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      var p = n.parentNode; if (!p || !n.data.trim()) return NodeFilter.FILTER_REJECT;
      return p.closest(SKIP) && !p.closest('figcaption[contenteditable="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    } });
    var n; while ((n = w.nextNode())) out.push(n);
    return out;
  }

  /** The word the caret touches is still being typed, so it is not judged yet. */
  function caretWord() {
    var s = window.getSelection();
    if (!s.rangeCount || !s.isCollapsed || !Ed.el().contains(s.anchorNode) || s.anchorNode.nodeType !== 3) return null;
    return { node: s.anchorNode, offset: s.anchorOffset };
  }

  var check = debounce(function () {
    if (!ready || !enabled() || !Ed.doc) return;
    var t0 = performance.now(), nodes = textNodes(), hits = [], ask = new Set(), cw = caretWord();
    nodes.forEach(function (n) {
      var m; WORD.lastIndex = 0;
      while ((m = WORD.exec(n.data))) {
        var w = normal(m[0]), end = m.index + m[0].length;
        if (skipWord(w) || ignored.has(w)) continue;
        if (cw && cw.node === n && cw.offset >= m.index && cw.offset <= end && end === n.data.length) continue;
        if (cw && cw.node === n && cw.offset > m.index && cw.offset < end) continue;
        hits.push({ n: n, s: m.index, e: end, w: w });
        if (!known.has(w)) ask.add(w);
      }
    });
    var asked = Array.from(ask);
    (asked.length ? call({ type: 'check', words: asked }) : Promise.resolve({ bad: [] })).then(function (r) {
      var bad = new Set(r.bad);
      asked.forEach(function (w) { known.set(w, !bad.has(w)); });
      var ranges = hits.filter(function (h) { return known.get(h.w) === false && h.n.isConnected && h.e <= h.n.data.length; }).map(function (h) {
        var rg = new Range(); rg.setStart(h.n, h.s); rg.setEnd(h.n, h.e); return rg;
      });
      var hl = new Highlight(); ranges.forEach(function (rg) { hl.add(rg); });
      CSS.highlights.set('wn-spell', hl);
      timings.spell = Math.round(performance.now() - t0);
    }).catch(function (e) { logError(e, 'spell check'); });
  }, 120);

  /** Misspelt words found by the last check, in page order (for the Spelling panel). */
  function currentBad() {
    var h = supported && CSS.highlights.get('wn-spell'); if (!h) return [];
    return Array.from(h).map(function (r) { return { range: r, word: normal(r.toString()) }; })
      .sort(function (a, b) { return a.range.compareBoundaryPoints(Range.START_TO_START, b.range); });
  }

  function suggest(word) { return ready ? call({ type: 'suggest', word: normal(word) }).then(function (r) { return r.list; }) : Promise.resolve([]); }

  function addWord(word) {
    var w = normal(word).trim(); if (!w || w.length > 60) return;
    var list = personal(); if (list.indexOf(w) < 0) { list.push(w); list.sort(); settings.set('spellWords', list.slice(0, 5000)); }
    known.set(w, true); if (ready) call({ type: 'add', word: w });
    check();
  }
  function setWords(list) {
    var old = personal();
    var clean = Array.from(new Set(list.map(function (x) { return normal(String(x)).trim(); }).filter(function (x) { return x && x.length <= 60 && !/\s/.test(x); }))).sort();
    settings.set('spellWords', clean.slice(0, 5000));
    known.clear();
    if (ready) { old.filter(function (w) { return clean.indexOf(w) < 0; }).forEach(function (w) { call({ type: 'remove', word: w }); }); clean.forEach(function (w) { call({ type: 'add', word: w }); }); }
    check();
    return clean.length;
  }
  function ignoreAll(word) { ignored.add(normal(word)); check(); }

  /** Replace one marked word through the normal typing path, so undo and track changes see it. */
  function replace(range, text) {
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
    Ed.snapshot();
    document.execCommand('insertText', false, text);
    Ed.changed();
  }

  /* ---------- Right-click menu ---------- */
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function onContext(e) {
    if (!ready || !enabled()) return;
    var hit = currentBad().filter(function (b) {
      var rs = b.range.getClientRects();
      return Array.prototype.some.call(rs, function (r) { return e.clientX >= r.left - 1 && e.clientX <= r.right + 1 && e.clientY >= r.top - 1 && e.clientY <= r.bottom + 1; });
    })[0];
    if (!hit) return;
    e.preventDefault(); closeMenu();
    menu = h('div', { class: 'spell-menu', role: 'menu', 'aria-label': 'Spelling suggestions for ' + hit.word, style: { left: e.clientX + 'px', top: e.clientY + 'px' } }, h('p', { class: 'hint' }, 'Looking for suggestions…'));
    document.body.appendChild(menu);
    suggest(hit.word).then(function (list) {
      if (!menu) return;
      menu.textContent = '';
      if (!list.length) menu.appendChild(h('p', { class: 'hint' }, 'No suggestions'));
      list.forEach(function (w) { menu.appendChild(h('button', { type: 'button', role: 'menuitem', class: 'sp-sug', onclick: function () { closeMenu(); replace(hit.range, w); } }, w)); });
      menu.appendChild(h('hr'));
      menu.appendChild(h('button', { type: 'button', role: 'menuitem', onclick: function () { closeMenu(); ignoreAll(hit.word); } }, 'Ignore all'));
      menu.appendChild(h('button', { type: 'button', role: 'menuitem', onclick: function () { closeMenu(); addWord(hit.word); toast('"' + hit.word + '" added to your dictionary.'); } }, 'Add to dictionary'));
      var first = menu.querySelector('button'); if (first) first.focus();
      var r = menu.getBoundingClientRect();
      if (r.right > innerWidth) menu.style.left = Math.max(4, innerWidth - r.width - 4) + 'px';
      if (r.bottom > innerHeight) menu.style.top = Math.max(4, innerHeight - r.height - 4) + 'px';
    });
  }

  function toggle() {
    var on = !enabled(); settings.set('spellOn', on);
    if (on) { if (ready) { useOwn(true); check(); } else if (!failed && supported) start(); else Ed.el().spellcheck = true; }
    else { Ed.el().spellcheck = false; if (supported) CSS.highlights.delete('wn-spell'); }
    return on;
  }

  function bind() {
    var d = Ed.el();
    d.addEventListener('input', function () { check(); });
    d.addEventListener('contextmenu', onContext);
    document.addEventListener('selectionchange', function () { if (ready && Pages.current() === 'edit') check(); });
    document.addEventListener('mousedown', function (e) { if (menu && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (menu && e.key === 'Escape') { closeMenu(); d.focus(); } });
    window.addEventListener('scroll', closeMenu, true);
  }

  /** Called whenever a document opens in the editor. */
  function onOpen() {
    known.clear(); ignored.clear();
    if (!enabled()) { Ed.el().spellcheck = false; return; }
    if (ready) { useOwn(true); check(); } else if (failed || !supported) Ed.el().spellcheck = true; else start();
  }

  return { bind: bind, onOpen: onOpen, check: check, suggest: suggest, addWord: addWord, setWords: setWords, ignoreAll: ignoreAll, replace: replace,
    currentBad: currentBad, toggle: toggle, enabled: enabled, personal: personal,
    ready: function () { return ready; }, state: function () { return ready ? 'ready' : failed ? 'browser' : worker ? 'loading' : 'off'; } };
})();

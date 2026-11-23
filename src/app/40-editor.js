/* WrapNote app: editor core. The canvas HTML is the single source of truth for the document body.
 * Structured fields (left pane) render into one generated section (.wn-gen) at the top of the canvas.
 * Content blocks are elements marked data-block, so the block list is always read from the canvas itself.
 */
var Ed = (function () {
  var doc = null, docEl, lastRange = null, selObj = null;
  var hist = [], histIdx = -1, histMax = 60;
  var composing = null; // text block currently being composed in the left pane

  function el() { return docEl || (docEl = $('#docEl')); }

  /* ---------- Open / close ---------- */
  function open(id) {
    return Store.getDoc(id).then(function (d) {
      if (!d) return false;
      if (doc && doc.id !== id) flush();
      doc = d;
      // Older or synced documents may lack newer keys; fill them so later code can rely on them.
      var f = MODEL.emptyFields(), L = MODEL.defaultLayout();
      doc.fields = doc.fields || f;
      ['mom', 'book'].forEach(function (k) { doc.fields[k] = Object.assign(f[k], doc.fields[k] || {}); });
      doc.layout = Object.assign(L, doc.layout || {});
      doc.comments = doc.comments || []; doc.revisions = doc.revisions || []; doc.protect = doc.protect || { mode: 'none' };
      // 1.2.0: documents made before templates existed use the personal look.
      doc.template = doc.template === 'office' ? 'office' : 'personal';
      if (doc.template === 'office') doc.office = WN.officeTemplate.clean(doc.office);
      // 1.3.0: documents saved before source references get an empty map; a damaged entry is dropped and reported.
      var refMsgs = WN.refs.upgrade(doc);
      if (refMsgs.length) toast(refMsgs.length + ' source reference(s) could not be read and were left out. ' + refMsgs[0], 'error', 9000);
      el().classList.toggle('tpl-office', doc.template === 'office');
      el().innerHTML = sanitizeHtml(doc.html || '');
      ensureGen();
      SourceRefs.renderAll();
      hist = []; histIdx = -1; histMax = settings.get('memorySaver', true) ? 25 : 60;
      composing = null; selObj = null;
      $('#edTitle').value = doc.title || '';
      $('#edCat').value = doc.category || '';
      Intake.render();
      Review.onOpen();
      Spell.onOpen();
      Layout.applyPageSetup();
      applyLock();
      snapshot();
      relayout();
      Views.onOpen();
      return true;
    });
  }

  function close() { flush(); doc = null; el().innerHTML = ''; $('#editor').hidden = true; $('#edEmpty').hidden = false; }

  /* ---------- Generated section ---------- */
  function ensureGen() {
    var gen = el().querySelector(':scope > .wn-gen');
    if (doc.mode === 'blank') { if (gen) gen.remove(); return; }
    if (!gen) { gen = h('div', { class: 'wn-gen', 'data-gen': doc.mode, contenteditable: 'false' }); el().insertBefore(gen, el().firstChild); }
    gen.setAttribute('data-gen', doc.mode);
    // Do not rebuild under the user's cursor while they type in a canvas field.
    var a = document.activeElement;
    if (a && gen.contains(a) && a.closest('[data-field]')) return;
    gen.innerHTML = MODEL.renderGenerated(doc);
  }

  var regen = debounce(function () { if (!doc) return; ensureGen(); changed(true); }, 120);

  /** Canvas edits inside a generated field flow back to the left pane (two-way sync). */
  function fieldFromCanvas(target) {
    var f = target.closest && target.closest('[data-field]');
    if (!f || !doc) return;
    var key = f.getAttribute('data-field');
    var val = f.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    if (key === 'title') { doc.title = val; $('#edTitle').value = val; }
    else if (doc.mode !== 'blank') doc.fields[doc.mode][key] = val;
    var inp = $('#intake [data-key="' + key + '"]');
    if (inp && inp !== document.activeElement) inp.value = val;
  }

  /* ---------- Saving ---------- */
  function serialize() {
    var c = el().cloneNode(true);
    $$('[data-wn-push]', c).forEach(function (n) { n.style.marginTop = n.getAttribute('data-wn-orig') || ''; n.removeAttribute('data-wn-push'); n.removeAttribute('data-wn-orig'); if (!n.getAttribute('style')) n.removeAttribute('style'); });
    $$('.wn-hit', c).forEach(function (n) { n.replaceWith.apply(n, Array.prototype.slice.call(n.childNodes)); });
    // Empty grid slots are screen-only helpers, rebuilt on every layout pass.
    $$('.wn-slot', c).forEach(function (n) { n.remove(); });
    // Citation words are drawn from doc.refs; the body never stores a copy, so the two cannot disagree.
    // A placed tag (1.4.0) keeps only its place: an empty span with its key and inline/line.
    $$('.wn-cite', c).forEach(function (n) {
      if (!n.hasAttribute('data-place')) { n.remove(); return; }
      var k = n.getAttribute('data-ref'), p = n.getAttribute('data-place');
      Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
      n.textContent = '';
      n.className = 'wn-cite'; n.setAttribute('contenteditable', 'false'); n.setAttribute('data-ref', k); n.setAttribute('data-place', p === 'line' ? 'line' : 'inline');
    });
    $$('.wn-selected, .wn-similar, .wn-flash', c).forEach(function (n) { n.classList.remove('wn-selected', 'wn-similar', 'wn-flash'); if (!n.className) n.removeAttribute('class'); });
    return c.innerHTML;
  }

  var saveSoon = debounce(saveNow, 600);
  function saveNow() {
    if (!doc) return Promise.resolve();
    doc.html = serialize();
    Sync.localSaving(1);
    var plain = plainText(el(), '.wn-cite');
    return Store.putDoc(doc, plain, SourceRefs.previews()).then(function () {
      $('#saveState').textContent = 'Saved ' + D.formatDateTime(new Date()).slice(11);
      Views.broadcast();
    }).catch(function (e) {
      logError(e, 'saveNow');
      toast('Could not save: ' + e.message + '. Free some space or export a backup.', 'error');
    }).then(function () { Sync.localSaving(-1); });
  }
  function flush() { if (saveSoon.pending()) saveSoon.flush(); }

  /** Called after every change: autosave, relayout, block list, counts, history. */
  function changed(skipHist) {
    if (!doc) return;
    saveSoon();
    relayoutSoon();
    Intake.renderBlocks();
    if (!skipHist) snapshotSoon();
  }

  var relayoutSoon = debounce(function () { relayout(); }, 250);
  function relayout() { if (doc) { Layout.run(); Review.updateCounts(); } }

  /* ---------- Undo history: html + fields, so the left pane and canvas undo together ---------- */
  function caretOffset() {
    var s = window.getSelection();
    if (!s.rangeCount || !el().contains(s.anchorNode)) return -1;
    var r = document.createRange(); r.selectNodeContents(el()); r.setEnd(s.anchorNode, s.anchorOffset);
    return r.toString().length;
  }
  function setCaret(off) {
    if (off < 0) return;
    var w = document.createTreeWalker(el(), NodeFilter.SHOW_TEXT), n, left = off;
    while ((n = w.nextNode())) {
      if (left <= n.length) { var r = document.createRange(); r.setStart(n, left); r.collapse(true); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); return; }
      left -= n.length;
    }
  }
  function snapshot() {
    if (!doc) return;
    var snap = { html: serialize(), fields: JSON.stringify(doc.fields), title: doc.title, refs: JSON.stringify(doc.refs || {}), caret: caretOffset() };
    var top = hist[histIdx];
    if (top && top.html === snap.html && top.fields === snap.fields && top.title === snap.title && top.refs === snap.refs) return;
    hist = hist.slice(0, histIdx + 1); hist.push(snap);
    if (hist.length > histMax) hist.shift();
    histIdx = hist.length - 1;
  }
  var snapshotSoon = debounce(snapshot, 700);
  function restore(s) {
    el().innerHTML = s.html; doc.fields = JSON.parse(s.fields); doc.title = s.title; doc.refs = JSON.parse(s.refs || '{}');
    SourceRefs.renderAll();
    $('#edTitle').value = doc.title || '';
    Intake.render(); setCaret(s.caret); saveSoon(); relayout(); Intake.renderBlocks();
  }
  function undo() { snapshotSoon.flush(); snapshot(); if (histIdx > 0) { histIdx--; restore(hist[histIdx]); } else toast('Nothing to undo.'); }
  function redo() { if (histIdx < hist.length - 1) { histIdx++; restore(hist[histIdx]); } else toast('Nothing to redo.'); }

  /* ---------- Selection helpers for ribbon commands ---------- */
  function rememberRange() {
    var s = window.getSelection();
    if (s.rangeCount && el().contains(s.getRangeAt(0).commonAncestorContainer)) lastRange = s.getRangeAt(0).cloneRange();
  }
  function restoreRange() {
    if (!lastRange || !el().contains(lastRange.commonAncestorContainer)) return false;
    var s = window.getSelection();
    var cur = s.rangeCount ? s.getRangeAt(0) : null;
    if (!cur || !el().contains(cur.commonAncestorContainer)) {
      el().focus({ preventScroll: true });
      s.removeAllRanges(); s.addRange(lastRange);
    }
    return true;
  }
  function range() { restoreRange(); var s = window.getSelection(); return s.rangeCount && el().contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0) : null; }

  /** Insert a node at the caret, or at the end of the document if the caret is not in it. */
  function insertNode(node, atEnd) {
    if (!doc) return;
    if (locked()) { toast('This document is protected. Unlock it in Review, Protect.', 'error'); return; }
    snapshot();
    var r = atEnd ? null : range();
    if (r && !r.collapsed) r.deleteContents();
    var blockLevel = node.nodeType === 1 && /^(DIV|TABLE|FIGURE|SECTION|NAV|H\d|P|UL|OL|BLOCKQUOTE|HR)$/.test(node.tagName);
    if (!r || (r.startContainer === el() && !el().childNodes.length)) { el().appendChild(node); }
    else if (blockLevel) {
      var top = topBlock(r.startContainer);
      if (top && top.classList.contains('wn-gen')) top.after(node);
      else if (top) { if (isEmptyBlock(top)) top.replaceWith(node); else top.after(node); }
      else el().appendChild(node);
    } else {
      var inGen = r.startContainer.nodeType && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode).closest('.wn-gen');
      if (inGen && !(r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode).closest('[data-field]')) { el().appendChild(h('p', null, node)); }
      else { r.insertNode(node); r.setStartAfter(node); r.collapse(true); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    }
    if (blockLevel && !node.nextSibling) el().appendChild(h('p', null, h('br')));
    changed();
    return node;
  }

  function isEmptyBlock(b) { return b.tagName === 'P' && !b.textContent.trim() && !b.querySelector('img,svg,math,table'); }

  function topBlock(n) {
    var e = n && (n.nodeType === 1 ? n : n.parentNode);
    while (e && e.parentNode !== el()) { if (e === el() || !e.parentNode) return null; e = e.parentNode; }
    return e && e.parentNode === el() ? e : null;
  }

  /** Deepest block elements touched by the selection (for paragraph-level formatting). */
  function selectedBlocks() {
    var r = range();
    if (!r) return [];
    var sel = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,dd,dt';
    var ok = function (b) { return !b.closest('.wn-gen') || !!b.closest('[data-field]'); };
    var list = $$(sel, el()).filter(function (b) { return r.intersectsNode(b) && ok(b); });
    // Keep the deepest blocks only (a paragraph inside a list item, not both).
    list = list.filter(function (b) { return !list.some(function (o) { return o !== b && b.contains(o); }); });
    if (!list.length) {
      var n = r.startContainer, e = n.nodeType === 1 ? n : n.parentNode;
      var b = e.closest(sel + ',div.wn-block,td,th');
      if (b && el().contains(b) && ok(b)) list = [b];
    }
    return list;
  }

  /* ---------- Objects (pictures, shapes, charts, text boxes, tables) ---------- */
  var OBJ_SEL = '.wn-obj, figure, img, table, .wn-eq, .wn-chart, .wn-textbox';
  function selectObject(o) {
    $$('.wn-selected', el()).forEach(function (x) { x.classList.remove('wn-selected'); });
    selObj = o || null;
    if (o) o.classList.add('wn-selected');
    Ribbon.refreshContext();
  }
  function selectedObject() { return selObj && el().contains(selObj) ? selObj : null; }

  /* ---------- Protection and final review ---------- */
  function locked() { return !!doc && (doc.status === 'final' || doc.protect.mode !== 'none'); }
  function applyLock() {
    var lock = locked();
    el().setAttribute('contenteditable', lock ? 'false' : 'true');
    $$('[data-field]', el()).forEach(function (f) { f.setAttribute('contenteditable', lock ? 'false' : 'true'); });
    $('#intake').classList.toggle('locked', lock);
    $$('#intake input, #intake textarea, #intake select, #intake button, #intake [contenteditable]').forEach(function (i) {
      if (i.hasAttribute('contenteditable')) i.setAttribute('contenteditable', lock ? 'false' : 'true'); else i.disabled = lock;
    });
    $('#finalBanner').hidden = !(doc && doc.status === 'final');
    $('#lockBanner').hidden = !(doc && doc.status !== 'final' && doc.protect.mode !== 'none');
    if (doc) $('#lockBannerText').textContent = doc.protect.mode === 'password' ? 'This document is locked with a password.' : 'This document is read-only.';
    $('#edStatus').textContent = doc && doc.status === 'final' ? 'Final' : 'Draft';
    $('#edStatus').className = 'chip ' + (doc && doc.status === 'final' ? 'ok' : '');
    $('#ribbon').classList.toggle('locked', lock);
  }

  /* ---------- Canvas events ---------- */
  function bind() {
    var d = el();
    document.execCommand('defaultParagraphSeparator', false, 'p');
    d.addEventListener('input', function (e) {
      fieldFromCanvas(e.target.nodeType === 1 ? e.target : e.target.parentNode);
      var s = window.getSelection();
      if (s.anchorNode) fieldFromCanvas(s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode);
      normalize();
      if (composing && composing.block && !el().contains(composing.block)) composing = null;
      changed();
    });
    d.addEventListener('keydown', function (e) {
      var slot = e.target.closest && e.target.closest('.wn-slot');
      if (slot && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); Intake.addToBlock(slot.closest('[data-block]')); return; }
      var f = e.target.closest && e.target.closest('[data-field="title"]');
      var s = window.getSelection();
      var inTitle = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('[data-field="title"]');
      if ((f || inTitle) && e.key === 'Enter') e.preventDefault();
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && tableArrow(e, s)) return;
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
        var li = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('li');
        var cell = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('td,th');
        if (li) { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); changed(); }
        else if (cell) { e.preventDefault(); Tables.moveCell(cell, e.shiftKey ? -1 : 1); }
      }
    });
    d.addEventListener('click', function (e) {
      var slot = e.target.closest('.wn-slot');
      if (slot) { e.preventDefault(); Intake.addToBlock(slot.closest('[data-block]')); return; }
      var a = e.target.closest('a');
      if (a && a.closest('.wn-toc')) { e.preventDefault(); var t = el().querySelector('[data-wn-id="' + CSS.escape(a.getAttribute('href').slice(1)) + '"]'); if (t) Views.flash(t); return; }
      if (a && (e.ctrlKey || e.metaKey) && S.isSafeUrl(a.getAttribute('href'))) { window.open(a.href, '_blank', 'noopener'); return; }
      var fn = e.target.closest('.wn-fnref');
      if (fn) { Insert.editFootnote(fn); return; }
      var o = e.target.closest(OBJ_SEL);
      if (o && el().contains(o) && !o.closest('.wn-gen')) {
        var obj = o.closest('.wn-obj') || o.closest('figure') || o;
        selectObject(obj);
      } else selectObject(null);
      Painter.maybeApply();
    });
    d.addEventListener('dblclick', function (e) {
      var eq = e.target.closest('.wn-eq'); if (eq) { Insert.equation(eq); return; }
      var ch = e.target.closest('.wn-chart'); if (ch) { Insert.chart(ch); return; }
      var sh = e.target.closest('.wn-shape'); if (sh) { Insert.shape(sh); return; }
    });
    d.addEventListener('mouseup', function () { rememberRange(); Painter.maybeApply(); });
    d.addEventListener('keyup', rememberRange);
    document.addEventListener('selectionchange', function () { rememberRange(); Ribbon.refreshState(); });
    d.addEventListener('paste', onPaste);
    d.addEventListener('drop', function (e) {
      var files = Array.prototype.filter.call(e.dataTransfer && e.dataTransfer.files || [], function (f) { return /^image\//.test(f.type); });
      if (files.length) { e.preventDefault(); Intake.addImages(files, 'images', true); }
    });
    $('#edTitle').addEventListener('input', function () { if (!doc) return; doc.title = this.value.slice(0, 300); regen(); document.title = (doc.title || 'Untitled') + ' · WrapNote'; });
    $('#edCat').addEventListener('input', function () { if (!doc) return; doc.category = this.value.trim().slice(0, 60) || 'General'; saveSoon(); });
    $('#edBack').addEventListener('click', function () { Pages.go('#docs'); });
    $('#undoBtn').addEventListener('click', undo);
    $('#redoBtn').addEventListener('click', redo);
    $('#reopenBtn').addEventListener('click', function () { doc.status = 'draft'; applyLock(); saveNow(); toast('Reopened for editing.'); });
    document.addEventListener('keydown', function (e) {
      if (Pages.current() !== 'edit' || !doc) return;
      var inForm = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z' && !inForm) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !inForm) { e.preventDefault(); redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveSoon.flush(); saveNow(); toast('Saved.'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); Review.find(false); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') { e.preventDefault(); Review.find(true); }
      else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !inForm) { e.preventDefault(); insertNode(h('div', { class: 'wn-pagebreak', contenteditable: 'false' })); }
      else if (e.key === 'Escape') { Views.escape(); Painter.cancel(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedObject() && !inForm && !window.getSelection().toString()) {
        var o = selectedObject();
        if (o.querySelector('[contenteditable="true"]') && o.contains(document.activeElement)) return;
        e.preventDefault(); snapshot(); o.remove(); selectObject(null); changed();
      }
    });
  }

  /** Keep the top level made of blocks: stray text from typing becomes a paragraph (pagination needs blocks). */
  /* Up and Down in a table move by row, like Word. Browsers move Down from the last line of a cell into the
   * next cell on the same row, which is the "cursor jumps to a strange place" users reported.
   * Returns true when it moved the caret itself. */
  function rectOf(range, fallback) {
    var rs = range.getClientRects();
    if (rs.length) return rs[rs.length - 1];
    var b = range.getBoundingClientRect();
    return (b.width || b.height) ? b : fallback.getBoundingClientRect();
  }
  function placeCaret(node, atEnd) {
    var r = document.createRange(); r.selectNodeContents(node); r.collapse(!atEnd);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function tableArrow(e, s) {
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || !s.rangeCount || !s.isCollapsed) return false;
    var n = s.anchorNode, cell = n && (n.nodeType === 1 ? n : n.parentNode).closest('td,th');
    if (!cell || !el().contains(cell) || cell.closest('.wn-gen,[contenteditable="false"]')) return false;
    var down = e.key === 'ArrowDown';
    var caret = rectOf(s.getRangeAt(0), cell);
    var edge = document.createRange(); edge.selectNodeContents(cell); edge.collapse(!down);
    var er = rectOf(edge, cell);
    // Still another line inside this cell: let the browser move within the cell.
    if (Math.abs(caret.top - er.top) > Math.max(4, caret.height / 2)) return false;
    var table = cell.closest('table'), row = cell.parentNode, rows = Array.prototype.slice.call(table.rows);
    var next = rows[rows.indexOf(row) + (down ? 1 : -1)];
    e.preventDefault();
    if (next) {
      var x = caret.left, target = null;
      Array.prototype.forEach.call(next.cells, function (c) { var b = c.getBoundingClientRect(); if (x >= b.left - 1 && x <= b.right + 1) target = c; });
      target = target || next.cells[Math.min(cell.cellIndex, next.cells.length - 1)];
      var line = document.createRange(); line.selectNodeContents(target); line.collapse(down);
      var lr = rectOf(line, target), hit = document.caretRangeFromPoint && document.caretRangeFromPoint(x, lr.top + lr.height / 2);
      if (hit && target.contains(hit.startContainer)) { s.removeAllRanges(); s.addRange(hit); } else placeCaret(target, !down);
      return true;
    }
    // Leaving the table: go to the paragraph after (or before) it, adding an empty one if there is none.
    var top = topBlock(table) || table, sib = down ? top.nextElementSibling : top.previousElementSibling;
    if (sib && sib.tagName === 'TABLE' && sib.rows.length) {
      var rr = sib.rows[down ? 0 : sib.rows.length - 1];
      placeCaret(rr.cells[Math.min(cell.cellIndex, rr.cells.length - 1)], !down);
      return true;
    }
    if (!sib || sib.isContentEditable === false || sib.matches('.wn-gen,figure,nav')) {
      var p = document.createElement('p'); p.appendChild(document.createElement('br'));
      if (down) top.after(p); else top.before(p);
      sib = p; changed();
    }
    placeCaret(sib, !down);
    return true;
  }

  function normalize() {
    var d = el(), moved = false;
    // Wrapping a node moves it, and moving it collapses the selection; remember the caret and put it back.
    var s0 = window.getSelection(), an = s0.anchorNode, ao = s0.anchorOffset;
    Array.prototype.slice.call(d.childNodes).forEach(function (n) {
      if (n.nodeType === 3 && n.textContent.trim()) { var p = h('p'); d.insertBefore(p, n); p.appendChild(n); moved = true; }
      else if (n.nodeType === 1 && /^(SPAN|B|STRONG|I|EM|U|A|FONT|MARK|SUB|SUP|BR)$/.test(n.tagName) && !(n.tagName === 'BR' && d.childNodes.length === 1)) {
        var p2 = h('p'); d.insertBefore(p2, n); p2.appendChild(n); moved = true;
      }
    });
    if (moved && an && d.contains(an)) { var r = document.createRange(); r.setStart(an, Math.min(ao, an.nodeType === 3 ? an.length : an.childNodes.length)); r.collapse(true); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    if (!d.childNodes.length) d.appendChild(h('p', null, h('br')));
  }

  function onPaste(e) {
    if (locked()) { e.preventDefault(); return; }
    var cd = e.clipboardData;
    var files = Array.prototype.filter.call(cd.files || [], function (f) { return /^image\//.test(f.type); });
    if (files.length) { e.preventDefault(); Intake.addImages(files, 'images', true); return; }
    var html = cd.getData('text/html'), text = cd.getData('text/plain');
    e.preventDefault();
    snapshot();
    if (Review.tracking()) { Review.trackInsertText(text); return; }
    if (html) {
      var clean = sanitizeHtml(html.replace(/<!--StartFragment-->|<!--EndFragment-->/g, ''));
      document.execCommand('insertHTML', false, clean);
    } else document.execCommand('insertText', false, text);
    changed();
  }

  return {
    get doc() { return doc; }, el: el, open: open, close: close, flush: flush, saveNow: saveNow, saveSoon: saveSoon, changed: changed, relayout: relayout,
    ensureGen: ensureGen, regen: regen, serialize: serialize, snapshot: snapshot, undo: undo, redo: redo, range: range, restoreRange: restoreRange,
    rememberRange: rememberRange, insertNode: insertNode, selectedBlocks: selectedBlocks, topBlock: topBlock, selectObject: selectObject,
    selectedObject: selectedObject, locked: locked, applyLock: applyLock, bind: bind, setComposing: function (c) { composing = c; }, normalize: normalize, OBJ_SEL: OBJ_SEL
  };
})();

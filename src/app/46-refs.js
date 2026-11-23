/* WrapNote app: source references on notes (1.3.0) — the form, the citation tag and the Sources page.
 * Rules live in core/refs.js; this file only draws and wires them. The references are kept in doc.refs,
 * keyed by note (block) id. The tag on the page is drawn from that map and never stored in the document
 * body, so there is exactly one copy of each reference. */
var SourceRefs = (function () {
  var R = WN.refs;

  /* ---------- Citation tag ---------- */
  function citeNode(ref) {
    var parts = R.citationParts(ref);
    var tag = h('span', { class: 'wn-cite', contenteditable: 'false', 'data-ref': '1', title: 'Source: ' + parts.join(' › ') },
      h('span', { class: 'wn-cite-k' }, 'Source: '));
    parts.forEach(function (p, i) {
      if (i) tag.appendChild(h('span', { class: 'wn-cite-sep', 'aria-hidden': 'true' }, ' › '));
      tag.appendChild(h('span', { class: 'wn-cite-p' }, p));
    });
    return tag;
  }
  /** Draw (or remove) the tag of one note. */
  function renderCite(block) {
    if (!block) return;
    $$(':scope > .wn-cite', block).forEach(function (c) { c.remove(); });
    var id = block.getAttribute('data-block'), ref = id && Ed.doc && Ed.doc.refs ? Ed.doc.refs[id] : null;
    if (ref) block.appendChild(citeNode(ref));
  }
  /** Redraw every tag from doc.refs (after opening, undo or a synced change). Stray tags pasted from elsewhere go. */
  function renderAll() {
    if (!Ed.doc) return;
    $$('.wn-cite', Ed.el()).forEach(function (c) { c.remove(); });
    Object.keys(Ed.doc.refs || {}).forEach(function (id) {
      $$('[data-block="' + id + '"]', Ed.el()).forEach(function (b) { b.appendChild(citeNode(Ed.doc.refs[id])); });
    });
  }
  /** The note's text for summaries and the Sources page, without its labels and tag. */
  function previewOf(block) {
    var c = block.cloneNode(true);
    $$('.wn-cite, .wn-labels, .wn-slot', c).forEach(function (x) { x.remove(); });
    var t = (c.textContent || '').replace(/\s+/g, ' ').trim();
    return t || (block.querySelectorAll('img').length ? block.querySelectorAll('img').length + ' picture(s)' : block.querySelector('table') ? 'Table' : '');
  }
  function previews() {
    var out = {};
    if (!Ed.doc) return out;
    Object.keys(Ed.doc.refs || {}).forEach(function (id) { var b = Ed.el().querySelector('[data-block="' + id + '"]'); if (b) out[id] = previewOf(b).slice(0, 200); });
    return out;
  }

  /* ---------- Suggestions: every document name and heading used in any WrapNote document ---------- */
  var cache = { at: -1, list: [] };
  /** except (optional): a note id left out, so a note being typed is not suggested to itself. */
  function entries(except) {
    function build() {
      var metas = Store.metas();
      // The open document's newest references count too, before its next save.
      if (Ed.doc) {
        var own = {}; Object.keys(Ed.doc.refs || {}).forEach(function (id) { if (id !== except) own[id] = Ed.doc.refs[id]; });
        metas = metas.filter(function (m) { return m.id !== Ed.doc.id; }).concat([{ id: Ed.doc.id, title: Ed.doc.title, u: Ed.doc.u, refs: R.index(own, previews()) }]);
      }
      return R.sources(R.notes(metas));
    }
    if (except) return build();
    // Rebuilt at most once per second; the list comes from the small summaries, never from whole documents.
    if (Date.now() - cache.at > 1000) cache = { at: Date.now(), list: build() };
    return cache.list;
  }
  function headingEntries(source) {
    var k = R.key(source), all = entries(), out = [];
    var pool = k ? all.filter(function (e) { return e.key === k; }) : all;
    pool.forEach(function (e) { out = out.concat(e.headings); });
    return out;
  }

  /* ---------- Combobox (input with a suggestion list), keyboard and touch friendly ---------- */
  var comboSeq = 0;
  function combo(input, getNames) {
    var id = 'wnc' + (++comboSeq), active = -1, names = [];
    var list = h('ul', { class: 'combo-list', role: 'listbox', id: id, hidden: true });
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false'); input.setAttribute('aria-controls', id); input.setAttribute('autocomplete', 'off');
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
    function pick(name) { input.value = name; close(); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
    function draw() {
      names = getNames(input.value);
      list.textContent = '';
      if (!names.length || document.activeElement !== input) { close(); return; }
      names.forEach(function (n, i) {
        var li = h('li', { role: 'option', id: id + '-' + i, 'aria-selected': i === active ? 'true' : 'false', class: i === active ? 'on' : '' }, n);
        li.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus in the input
        li.addEventListener('click', function () { pick(n); });
        list.appendChild(li);
      });
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (list.scrollIntoView) list.scrollIntoView({ block: 'nearest' }); // the form can sit at the bottom of the left pane
      if (active >= 0) input.setAttribute('aria-activedescendant', id + '-' + active); else input.removeAttribute('aria-activedescendant');
    }
    input.addEventListener('input', function (e) { if (e.isTrusted !== false) { active = -1; draw(); } });
    input.addEventListener('focus', function () { active = -1; draw(); });
    input.addEventListener('blur', function () { setTimeout(close, 120); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (list.hidden) { draw(); if (list.hidden) return; }
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + names.length + 1) % (names.length + 1);
        if (active === names.length) active = -1;
        draw();
      } else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); pick(names[active]); }
      else if (e.key === 'Escape' && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    });
    return h('div', { class: 'combo' }, input, list);
  }

  /* ---------- The reference form (used in the text composer, the block list and the ribbon) ---------- */
  /**
   * opts.getBlock(): the note element, or null while the note does not exist yet (its text is not typed).
   * Returns { el, flush } — flush() attaches a reference typed before the note existed.
   */
  function form(opts) {
    var block = opts.getBlock(), id0 = block && block.getAttribute('data-block');
    var cur = id0 && Ed.doc.refs[id0] ? Ed.doc.refs[id0] : null;
    var src = h('input', { type: 'text', maxlength: R.LIMITS.source, value: cur ? cur.source : '', placeholder: 'e.g. Grid Code 2023', 'data-ref': 'source' });
    var hd = h('input', { type: 'text', maxlength: R.LIMITS.heading, value: cur ? cur.heading : '', 'data-ref': 'heading' });
    var sub = h('input', { type: 'text', maxlength: R.LIMITS.sub, value: cur ? cur.sub : '', 'data-ref': 'sub' });
    var sec = h('input', { type: 'text', maxlength: R.LIMITS.section, value: cur ? cur.section : '', placeholder: '4, or Clause 5.3', 'data-ref': 'section' });
    var pg = h('input', { type: 'text', maxlength: 20, value: cur ? R.pagesInput(cur.pages) : '', placeholder: '42 or 42-45', inputmode: 'numeric', 'data-ref': 'pages' });
    var msg = h('p', { class: 'ref-msg', 'aria-live': 'polite' });
    var shows = h('p', { class: 'ref-shows', 'aria-live': 'polite' });
    var removeBtn = h('button', { type: 'button', class: 'btn sm ghost', onclick: function () { [src, hd, sub, sec, pg].forEach(function (x) { x.value = ''; }); apply(true); } }, 'Remove reference');
    var pending = false, snapped = false;
    var locked = Ed.locked();
    if (locked) [src, hd, sub, sec, pg].forEach(function (x) { x.disabled = true; });

    function read() { return { source: src.value, heading: hd.value, sub: sub.value, section: sec.value, pages: pg.value }; }
    function showPreview(v) {
      shows.textContent = v ? 'Shows as: ' + R.citation(v) : 'No reference yet.';
      removeBtn.hidden = !v;
    }
    function apply(now) {
      if (locked) return;
      var v = R.validate(read());
      msg.classList.toggle('err', !v.ok);
      if (!v.ok) { msg.textContent = v.errors.join(' '); return; }
      msg.textContent = '';
      showPreview(v.value);
      var b = opts.getBlock();
      if (!b) { pending = true; if (v.value) msg.textContent = 'The reference is attached as soon as the note has some text.'; return; }
      pending = false;
      var id = b.getAttribute('data-block');
      if (!id) { id = MODEL.uid('b'); b.setAttribute('data-block', id); }
      var old = Ed.doc.refs[id];
      if (!v.value && !old) return;
      if (v.value && old && R.citation(old) === R.citation(v.value)) return;
      // One undo step per form session: the state before the first change is kept.
      if (!snapped) { Ed.snapshot(); snapped = true; }
      if (v.value) { v.value.t = Date.now(); Ed.doc.refs[id] = v.value; } else delete Ed.doc.refs[id];
      renderCite(b);
      cache.at = -1;
      Ed.changed();
      if (opts.onChange) opts.onChange(v.value);
      if (now && !v.value) toast('Source reference removed. Use Undo to bring it back.');
    }
    var applySoon = debounce(apply, 250);
    // Same document typed in another case or spacing: use the spelling already in use, so filters find both.
    // This runs before the save below; the note itself is left out, or its own new spelling would count as "existing".
    src.addEventListener('change', function () {
      var b = opts.getBlock(), same = R.existingName(src.value, entries(b ? b.getAttribute('data-block') || '-' : '-'));
      if (same) { src.value = same; applySoon.flush(); apply(); msg.classList.remove('err'); msg.textContent = 'Using the existing spelling: ' + same + '.'; }
    });
    [src, hd, sub, sec, pg].forEach(function (x) { x.addEventListener('input', function () { applySoon(); }); x.addEventListener('change', function () { applySoon.flush(); }); });
    var srcBox = combo(src, function (q) { return R.suggest(q, entries()); });
    var hdBox = combo(hd, function (q) { return R.suggest(q, headingEntries(src.value)); });
    var subBox = combo(sub, function (q) { return R.suggest(q, headingEntries(src.value)); });
    showPreview(cur);
    var el = h('fieldset', { class: 'ref-form' }, h('legend', null, 'Source reference'),
      fieldWrap('Document name', src, srcBox, 'Suggestions come from documents you have already used.'),
      h('div', { class: 'grid2' }, fieldWrap('Heading', hd, hdBox), fieldWrap('Sub-heading', sub, subBox)),
      h('div', { class: 'grid2' }, field('Article / section', sec), field('Page', pg, 'One page or a range')),
      shows, msg, locked ? h('p', { class: 'hint' }, 'This document is final or protected, so its references cannot be changed.') : removeBtn);
    return { el: el, flush: function () { applySoon.flush(); if (pending) apply(); }, focus: function () { src.focus(); } };
  }
  /** Label + combobox wrapper (field() expects the input itself as the labelled element). */
  function fieldWrap(label, input, box, hint) {
    var id = input.id || ('f' + Math.random().toString(36).slice(2, 8)); input.id = id;
    return h('div', { class: 'fld' }, h('label', { for: id }, label), box, hint ? h('small', { class: 'hint' }, hint) : null);
  }

  /** "+ Add source reference": a collapsed button that opens the form, so the composer stays tidy. */
  function toggle(getBlock, onChange) {
    var b = getBlock(), has = !!(b && Ed.doc.refs[b.getAttribute('data-block')]);
    var holder = h('div', { class: 'ref-toggle' });
    var f = null;
    var btn = h('button', { type: 'button', class: 'btn sm ghost ref-add', 'aria-expanded': has ? 'true' : 'false' }, has ? '− Hide source reference' : '+ Add source reference');
    function open(show) {
      if (show && !f) { f = form({ getBlock: getBlock, onChange: onChange }); holder.appendChild(f.el); }
      if (f) f.el.hidden = !show;
      btn.setAttribute('aria-expanded', String(show));
      btn.textContent = show ? '− Hide source reference' : '+ Add source reference';
    }
    btn.addEventListener('click', function () { var show = btn.getAttribute('aria-expanded') !== 'true'; open(show); if (show && f) f.focus(); });
    holder.appendChild(btn);
    if (has) open(true);
    return { el: holder, flush: function () { if (f) f.flush(); } };
  }

  /** The note at the cursor, for the ribbon command: a block, or a top-level paragraph or quote made into one. */
  function blockAtCursor() {
    var s = window.getSelection(), n = s.rangeCount ? s.anchorNode : null;
    if (!n || !Ed.el().contains(n)) { Ed.restoreRange(); s = window.getSelection(); n = s.rangeCount ? s.anchorNode : null; }
    if (!n || !Ed.el().contains(n)) return { error: 'Click in the note you want to cite first.' };
    var e = n.nodeType === 1 ? n : n.parentNode;
    var b = e.closest('[data-block]');
    if (b && Ed.el().contains(b)) return { block: b };
    var top = Ed.topBlock(e);
    if (top && /^(P|BLOCKQUOTE|UL|OL|DIV)$/.test(top.tagName) && !top.closest('.wn-gen, .wn-toc') && !top.classList.contains('wn-pagebreak')) return { block: top };
    return { error: 'A source can be attached to a paragraph, list, quote or block. Put the cursor in the text under a heading, not in the heading or a table.' };
  }
  function dialogAtCursor() {
    if (!Ed.doc) return;
    var r = blockAtCursor();
    if (r.error) { toast(r.error, 'error', 6000); return; }
    var b = r.block;
    Views.flash(b);
    var f = form({ getBlock: function () { return b; } });
    // openDialog puts the cursor in the first field (Document name) itself.
    openDialog({ title: 'Source reference', body: f.el, actions: [{ label: 'Done', primary: true, onClick: function () { f.flush(); } }] });
  }

  /* ---------- Sources page ---------- */
  var state = { source: '', heading: '', page: '', q: '' };
  function renderPage() {
    var t0 = performance.now();
    renderPageInner();
    timings.sourcesMs = Math.round(performance.now() - t0);
  }
  function renderPageInner() {
    var all = R.notes(Store.metas());
    var src = R.sources(all);
    var sel = $('#srcDoc'), hsel = $('#srcHead');
    // Keep the chosen document even if its spelling changed; fall back to "All documents".
    sel.textContent = ''; sel.appendChild(h('option', { value: '' }, 'All documents (' + M.formatCount(src.length) + ')'));
    src.forEach(function (s) { sel.appendChild(h('option', { value: s.name }, s.name + ' (' + M.formatCount(s.count) + ')')); });
    if (state.source && !src.some(function (s) { return s.key === R.key(state.source); })) state.source = '';
    sel.value = (src.filter(function (s) { return s.key === R.key(state.source); })[0] || { name: '' }).name;
    var heads = [];
    (state.source ? src.filter(function (s) { return s.key === R.key(state.source); }) : src).forEach(function (s) { heads = heads.concat(s.headings); });
    var seen = new Set();
    heads = heads.filter(function (x) { if (seen.has(x.key)) return false; seen.add(x.key); return true; });
    hsel.textContent = ''; hsel.appendChild(h('option', { value: '' }, 'All headings'));
    heads.forEach(function (x) { hsel.appendChild(h('option', { value: x.name }, x.name)); });
    if (state.heading && !heads.some(function (x) { return x.key === R.key(state.heading); })) state.heading = '';
    hsel.value = (heads.filter(function (x) { return x.key === R.key(state.heading); })[0] || { name: '' }).name;
    $('#srcPage').value = state.page; $('#srcQ').value = state.q;
    var f = R.validateFilter(state), out = $('#srcResults'), info = $('#srcCount'), err = $('#srcErr');
    out.textContent = '';
    err.textContent = f.ok ? '' : f.errors.join(' ');
    $('#srcPage').setAttribute('aria-invalid', f.ok ? 'false' : 'true');
    if (!all.length) {
      info.textContent = '';
      out.appendChild(h('p', { class: 'empty' }, 'No source references yet. In a document, add a note with "Text & labels" and choose "+ Add source reference", or put the cursor in a paragraph and use References, Source reference.'));
      $('#srcCsv').disabled = true; return;
    }
    var list = f.ok ? R.filter(all, f.value) : [];
    info.textContent = M.formatCount(list.length) + ' of ' + M.formatCount(all.length) + (all.length === 1 ? ' note' : ' notes');
    $('#srcCsv').disabled = !list.length;
    lastList = list;
    if (f.ok && !list.length) out.appendChild(h('p', { class: 'empty' }, 'No notes match these filters. Choose "All documents" or clear the page and search.'));
    list.slice(0, 500).forEach(function (n) { out.appendChild(card(n)); });
    if (list.length > 500) out.appendChild(h('p', { class: 'hint' }, 'Showing the first 500. Narrow the filters to see the rest.'));
  }
  var lastList = [];
  /** A note card: its citation, each part a filter button, then the note text and where it lives. */
  function card(n) {
    var r = n.ref;
    var crumbs = h('div', { class: 'src-crumbs', role: 'group', 'aria-label': 'Citation: ' + R.citation(r) });
    function crumb(text, set, label) {
      return h('button', { type: 'button', class: 'crumb', 'aria-label': label + ': ' + text, onclick: function () { set(); renderPage(); } }, text);
    }
    var parts = [];
    parts.push(crumb(r.source, function () { state.source = r.source; state.heading = ''; }, 'Show all notes from'));
    if (r.heading) parts.push(crumb(r.heading, function () { state.source = r.source; state.heading = r.heading; }, 'Show all notes under heading'));
    if (r.sub) parts.push(crumb(r.sub, function () { state.source = r.source; state.heading = r.sub; }, 'Show all notes under sub-heading'));
    if (r.section) parts.push(h('span', { class: 'crumb static' }, R.formatSection(r.section)));
    if (r.pages) parts.push(crumb(R.formatPages(r.pages), function () { state.source = r.source; state.page = R.pagesInput(r.pages); }, 'Show notes from'));
    parts.forEach(function (p, i) { if (i) crumbs.appendChild(h('span', { class: 'wn-cite-sep', 'aria-hidden': 'true' }, '›')); crumbs.appendChild(p); });
    return h('article', { class: 'src-card' }, crumbs,
      h('p', { class: 'src-text' }, n.preview || '(no text)'),
      h('a', { class: 'src-open', href: '#edit/' + n.docId + '/' + n.b }, 'Open in ' + (n.docTitle || 'document')));
  }
  function bindPage() {
    $('#srcDoc').addEventListener('change', function () { state.source = this.value; state.heading = ''; renderPage(); });
    $('#srcHead').addEventListener('change', function () { state.heading = this.value; renderPage(); });
    $('#srcPage').addEventListener('input', debounce(function () { state.page = $('#srcPage').value; renderPage(); }, 250));
    $('#srcQ').addEventListener('input', debounce(function () { state.q = $('#srcQ').value; renderPage(); }, 250));
    $('#srcClear').addEventListener('click', function () { state = { source: '', heading: '', page: '', q: '' }; renderPage(); $('#srcDoc').focus(); });
    $('#srcCsv').addEventListener('click', function () {
      var rows = R.csvRows(lastList);
      download('wrapnote-sources-' + D.localISO() + '.csv', WN.csv.toCSV(rows[0], rows.slice(1)), 'text/csv;charset=utf-8');
      toast('Saved ' + M.formatCount(lastList.length) + ' note(s) as CSV.');
    });
  }
  function setFilter(f) { state = Object.assign({ source: '', heading: '', page: '', q: '' }, f); }

  /** Open a document at one note (from a Sources card). */
  function focusBlock(id) {
    var b = Ed.el().querySelector('[data-block="' + id + '"]');
    if (!b) { toast('That note is no longer in the document. It may have been deleted.', 'error'); return; }
    requestAnimationFrame(function () { b.scrollIntoView({ block: 'center' }); Views.flash(b); });
  }

  return { renderCite: renderCite, renderAll: renderAll, previews: previews, previewOf: previewOf, form: form, toggle: toggle, citeNode: citeNode,
    dialogAtCursor: dialogAtCursor, renderPage: renderPage, bindPage: bindPage, setFilter: setFilter, focusBlock: focusBlock, entries: entries,
    state: function () { return Object.assign({}, state); } };
})();

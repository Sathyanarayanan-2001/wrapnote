/* WrapNote app: Review tab. Counts, find and replace, spelling and grammar hints, comments,
 * track changes, revision compare and protection. */
var Review = (function () {
  var tracking = false;
  var panelKind = null;

  function author() { return sessionStorage.getItem(KEY + 'author') || ''; }
  function onOpen() { tracking = false; closePanel(); updateTrackUI(); }

  /* ---------- Counts ---------- */
  function counts() {
    var d = Ed.el();
    var text = plainText(d);
    var paras = $$('p,li,h1,h2,h3,h4,h5,h6,blockquote,dd,dt,td,th', d).filter(function (p) { return p.textContent.trim() && !p.querySelector('p,li'); }).length;
    return { words: T.countWords(text), chars: T.countChars(text), charsNoSpace: T.countChars(text, false), paras: paras, pages: Layout.pages() };
  }
  function updateCounts() {
    var c = counts();
    $('#stPage').textContent = 'Page ' + (currentPage() + 1) + ' of ' + c.pages;
    $('#stWords').textContent = M.formatCount(c.words) + ' words';
    $('#stChars').textContent = M.formatCount(c.chars) + ' characters';
    $('#stParas').textContent = M.formatCount(c.paras) + ' paragraphs';
  }
  function currentPage() { var s = window.getSelection(); return s.anchorNode && Ed.el().contains(s.anchorNode) ? Layout.pageOf(s.anchorNode) : 0; }
  function wordCountDialog() {
    var c = counts();
    var t = h('table', { class: 'data-table' }, h('tbody', null, [['Pages', c.pages], ['Words', c.words], ['Characters (with spaces)', c.chars], ['Characters (no spaces)', c.charsNoSpace], ['Paragraphs', c.paras]].map(function (r) { return h('tr', null, h('th', { scope: 'row' }, r[0]), h('td', { class: 'num' }, M.formatCount(r[1]))); })));
    openDialog({ title: 'Word count', body: t });
  }

  /* ---------- Side panel ---------- */
  function openPanel(kind, title, body) {
    var p = $('#sidePanel');
    panelKind = kind;
    p.hidden = false; p.textContent = '';
    p.appendChild(h('div', { class: 'sp-head' }, h('h2', null, title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close panel', onclick: closePanel }, '×')));
    p.appendChild(body);
    return p;
  }
  function closePanel() { var p = $('#sidePanel'); if (p) { p.hidden = true; p.textContent = ''; } panelKind = null; clearHits(); }

  /* ---------- Find and replace ---------- */
  var hits = [], hitIdx = -1;
  function clearHits() { $$('.wn-hit', Ed.el()).forEach(function (n) { var p = n.parentNode; while (n.firstChild) p.insertBefore(n.firstChild, n); n.remove(); p.normalize(); }); hits = []; hitIdx = -1; }
  /** Marks every match inside single text nodes. O(total text length). */
  function markAll(q, matchCase) {
    clearHits();
    if (!q) return 0;
    var w = document.createTreeWalker(Ed.el(), NodeFilter.SHOW_TEXT), nodes = [], n;
    while ((n = w.nextNode())) nodes.push(n);
    var needle = matchCase ? q : q.toLowerCase();
    nodes.forEach(function (t) {
      var hay = matchCase ? t.data : t.data.toLowerCase(), i = hay.indexOf(needle), node = t;
      while (i >= 0) {
        var mid = node.splitText(i), rest = mid.splitText(q.length);
        var mark = h('mark', { class: 'wn-hit' }); mid.parentNode.insertBefore(mark, mid); mark.appendChild(mid);
        hits.push(mark); node = rest; hay = matchCase ? rest.data : rest.data.toLowerCase(); i = hay.indexOf(needle);
      }
    });
    return hits.length;
  }
  function find(withReplace) {
    var q = h('input', { type: 'search', placeholder: 'Find', 'aria-label': 'Find text' });
    var rp = h('input', { type: 'text', placeholder: 'Replace with', 'aria-label': 'Replace with' });
    var mc = h('input', { type: 'checkbox' });
    var info = h('p', { class: 'hint', 'aria-live': 'polite' }, 'Type to search the document.');
    function search() { var n = markAll(q.value, mc.checked); info.textContent = q.value ? (n ? n + ' match' + (n === 1 ? '' : 'es') + '.' : 'No matches. Check the spelling or turn off "Match case".') : 'Type to search the document.'; if (n) go(0); }
    function go(i) { if (!hits.length) return; hits.forEach(function (x) { x.classList.remove('cur'); }); hitIdx = (i + hits.length) % hits.length; hits[hitIdx].classList.add('cur'); hits[hitIdx].scrollIntoView({ block: 'center' }); info.textContent = 'Match ' + (hitIdx + 1) + ' of ' + hits.length + '.'; }
    q.addEventListener('input', debounce(search, 200)); mc.addEventListener('change', search);
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(hitIdx + (e.shiftKey ? -1 : 1)); } });
    var body = h('div', { class: 'sp-body' }, q, h('label', { class: 'chk' }, mc, 'Match case'),
      h('div', { class: 'choice-row' }, h('button', { type: 'button', class: 'btn sm', onclick: function () { go(hitIdx - 1); } }, 'Previous'), h('button', { type: 'button', class: 'btn sm', onclick: function () { go(hitIdx + 1); } }, 'Find next')),
      withReplace ? h('div', null, rp, h('div', { class: 'choice-row' },
        h('button', { type: 'button', class: 'btn sm', onclick: function () { if (Ed.locked()) return toast('The document is protected.', 'error'); if (hitIdx < 0) { go(0); return; } Ed.snapshot(); var m = hits[hitIdx]; m.replaceWith(document.createTextNode(rp.value)); hits.splice(hitIdx, 1); Ed.changed(); if (hits.length) go(hitIdx); else info.textContent = 'All matches replaced.'; } }, 'Replace'),
        h('button', { type: 'button', class: 'btn sm primary', onclick: function () { if (Ed.locked()) return toast('The document is protected.', 'error'); var n = hits.length; if (!n) { search(); n = hits.length; } Ed.snapshot(); hits.forEach(function (m) { m.replaceWith(document.createTextNode(rp.value)); }); hits = []; Ed.el().normalize(); Ed.changed(); info.textContent = 'Replaced ' + n + ' match' + (n === 1 ? '' : 'es') + '.'; } }, 'Replace all'))) : null,
      info, h('p', { class: 'hint' }, 'Matches that run across differently formatted words are not found.'));
    openPanel('find', withReplace ? 'Find and replace' : 'Find', body);
    var sel = window.getSelection().toString(); if (sel && sel.length < 80) { q.value = sel; search(); }
    q.focus();
  }

  /* ---------- Select similar formatting ---------- */
  function selectSimilar() {
    var r = Ed.range(); if (!r) { toast('Place the cursor in some text first.'); return; }
    var e = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
    var key = function (x) { var c = getComputedStyle(x); return [c.fontFamily, c.fontSize, c.fontWeight, c.fontStyle, c.color, c.textDecorationLine].join('|'); };
    var k = key(e);
    $$('.wn-similar', Ed.el()).forEach(function (x) { x.classList.remove('wn-similar'); });
    var n = 0;
    $$('p,li,h1,h2,h3,h4,span,b,strong,i,em,u,td,th', Ed.el()).forEach(function (x) {
      if (!Array.prototype.some.call(x.childNodes, function (c) { return c.nodeType === 3 && c.data.trim(); })) return;
      if (key(x) === k) { x.classList.add('wn-similar'); n++; }
    });
    toast(n + ' place' + (n === 1 ? ' has' : 's have') + ' the same formatting. They are outlined until you click elsewhere.');
    setTimeout(function () { document.addEventListener('mousedown', function off() { $$('.wn-similar', Ed.el()).forEach(function (x) { x.classList.remove('wn-similar'); }); document.removeEventListener('mousedown', off); }); }, 50);
  }

  /* ---------- Spelling and grammar ---------- */
  function spellingPanel() {
    var text = Ed.el().innerText;
    var issues = T.grammarIssues(text);
    var list = h('ol', { class: 'issue-list' });
    issues.slice(0, 200).forEach(function (it) {
      list.appendChild(h('li', null, h('button', { type: 'button', class: 'linkish', onclick: function () { selectText(it.start, it.end); } }, h('strong', null, it.type + ': '), it.message, h('span', { class: 'excerpt' }, ' “' + text.slice(Math.max(0, it.start - 15), it.end + 15).replace(/\s+/g, ' ') + '”'))));
    });
    var body = h('div', { class: 'sp-body' },
      h('p', null, issues.length ? issues.length + ' possible issue' + (issues.length === 1 ? '' : 's') + ' found. Select one to jump to it.' : 'No grammar or spacing issues found.'),
      list,
      h('p', { class: 'hint' }, 'Spelling mistakes are underlined by your browser\'s own dictionary (Home, Editing, Spell check). Grammar checks here are simple rules: repeated words, spacing, a/an, and capitals.'));
    openPanel('spelling', 'Spelling and grammar', body);
  }
  /** Map plain-text offsets (innerText) back to a DOM range. Approximate where innerText adds line breaks. */
  function selectText(start, end) {
    var w = document.createTreeWalker(Ed.el(), NodeFilter.SHOW_TEXT), n, pos = 0, r = document.createRange(), set = false;
    var full = Ed.el().innerText, before = full.slice(0, start).replace(/\s+/g, '').length, len = full.slice(start, end).replace(/\s+/g, '').length;
    while ((n = w.nextNode())) {
      for (var i = 0; i < n.data.length; i++) {
        if (/\s/.test(n.data[i])) continue;
        if (!set && pos === before) { r.setStart(n, i); set = true; }
        if (set && pos === before + len - 1) { r.setEnd(n, i + 1); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); (n.parentNode).scrollIntoView({ block: 'center' }); Ed.rememberRange(); return; }
        pos++;
      }
    }
  }

  /* ---------- Comments ---------- */
  function addComment() {
    var r = Ed.range();
    if (!r || r.collapsed) { toast('Select the text you want to comment on.'); return; }
    if ((r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentNode).closest('.wn-gen')) { toast('Comment on the body text. The header section is rebuilt from the fields on the left.', 'error'); return; }
    var t = h('textarea', { rows: 3, maxlength: 2000 });
    var who = h('input', { type: 'text', maxlength: 80, value: author() || settings.get('author', '') });
    openDialog({ title: 'New comment', body: h('div', null, field('Comment', t), field('Your name', who)), actions: [{ label: 'Cancel' }, { label: 'Add comment', primary: true, onClick: function (err) {
      if (!t.value.trim()) { err('Type the comment.'); return false; }
      if (!who.value.trim()) { err('Type your name so others know who commented.'); return false; }
      Ed.restoreRange(); Ed.snapshot();
      var id = MODEL.uid('c');
      var rr = Ed.range();
      var span = h('span', { class: 'wn-comment', 'data-cid': id });
      span.appendChild(rr.extractContents()); rr.insertNode(span);
      Ed.doc.comments.push({ id: id, author: who.value.trim(), t: Date.now(), text: t.value.trim() });
      sessionStorage.setItem(KEY + 'author', who.value.trim());
      Ed.changed(); commentsPanel();
    } }] });
  }
  function liveComments() { return Ed.doc.comments.filter(function (c) { return Ed.el().querySelector('[data-cid="' + c.id + '"]'); }); }
  function commentsPanel() {
    var list = liveComments();
    var body = h('div', { class: 'sp-body' });
    if (!list.length) body.appendChild(h('p', { class: 'empty' }, 'No comments. Select text, then choose Review, New comment.'));
    list.forEach(function (c) {
      body.appendChild(h('article', { class: 'cmt', 'data-for': c.id },
        h('header', null, h('strong', null, c.author), ' · ', h('time', null, D.formatStamp(c.t))), h('p', null, c.text),
        h('div', { class: 'choice-row' }, h('button', { type: 'button', class: 'btn sm', onclick: function () { focusComment(c.id); } }, 'Show in text'), h('button', { type: 'button', class: 'btn sm danger', onclick: function () { deleteComment(c.id); } }, 'Delete'))));
    });
    openPanel('comments', 'Comments (' + list.length + ')', body);
  }
  var cmtIdx = -1;
  function focusComment(id) { var s = Ed.el().querySelector('[data-cid="' + id + '"]'); if (s) { Views.flash(s); var r = document.createRange(); r.selectNodeContents(s); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); Ed.rememberRange(); } }
  function deleteComment(id) {
    if (!id) {
      var s = window.getSelection(), n = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode).closest('.wn-comment');
      if (!n) { var l = liveComments(); if (cmtIdx >= 0 && l[cmtIdx]) id = l[cmtIdx].id; else { toast('Place the cursor in commented text, or open the comments pane.'); return; } }
      else id = n.getAttribute('data-cid');
    }
    Ed.snapshot();
    $$('[data-cid="' + id + '"]', Ed.el()).forEach(function (sp) { sp.replaceWith.apply(sp, Array.prototype.slice.call(sp.childNodes)); });
    Ed.doc.comments = Ed.doc.comments.filter(function (c) { return c.id !== id; });
    Ed.changed(); if (panelKind === 'comments') commentsPanel(); toast('Comment deleted.');
  }
  function jumpComment(dir) {
    var l = liveComments(); if (!l.length) { toast('No comments in this document.'); return; }
    cmtIdx = (cmtIdx + dir + l.length) % l.length; focusComment(l[cmtIdx].id);
    toast('Comment ' + (cmtIdx + 1) + ' of ' + l.length + ': ' + l[cmtIdx].text.slice(0, 80));
  }

  /* ---------- Track changes ----------
   * Insertions are wrapped in <ins>, deletions are kept and wrapped in <del>, each with author and time.
   * The generated header is excluded: it is rebuilt from the fields. */
  function toggleTrack() {
    if (tracking) { tracking = false; updateTrackUI(); toast('Track changes off.'); return; }
    var name = h('input', { type: 'text', maxlength: 80, value: author(), autocomplete: 'name' });
    openDialog({ title: 'Turn on track changes', body: h('div', null, h('p', null, 'Every insertion and deletion will be marked with your name and the time.'), field('Your name', name)),
      actions: [{ label: 'Cancel' }, { label: 'Start tracking', primary: true, onClick: function (err) {
        var n = name.value.trim(); if (!n) { err('Enter your name to start tracking changes.'); return false; }
        sessionStorage.setItem(KEY + 'author', n); tracking = true; updateTrackUI(); toast('Tracking changes as ' + n + '.');
      } }] });
  }
  function updateTrackUI() {
    var st = $('#stTrack'); if (st) { st.textContent = tracking ? 'Tracking: ' + author() : 'Tracking off'; st.classList.toggle('on', tracking); }
    Ribbon.refreshState();
  }
  function markAttrs(tag) {
    var now = Date.now();
    return h(tag, { class: tag === 'ins' ? 'wn-ins' : 'wn-del', 'data-author': author(), 'data-time': String(now), title: (tag === 'ins' ? 'Inserted by ' : 'Deleted by ') + author() + ' on ' + D.formatStamp(now) });
  }
  function ownMark(node, tag) {
    var e = node && (node.nodeType === 1 ? node : node.parentNode);
    var m = e && e.closest(tag + '.wn-' + tag);
    return m && m.getAttribute('data-author') === author() && Date.now() - (+m.getAttribute('data-time')) < 600000 ? m : null;
  }
  function inGen(n) { var e = n && (n.nodeType === 1 ? n : n.parentNode); return e && e.closest('.wn-gen'); }

  /** Wrap the selected content as a deletion instead of removing it. */
  function markDeleted(r) {
    if (r.collapsed) return;
    var frag = r.extractContents();
    // Text the same author inserted moments ago is simply removed (typing then correcting).
    $$('ins.wn-ins', frag).forEach(function (i) { if (i.getAttribute('data-author') === author()) i.remove(); });
    if (!frag.textContent.length && !frag.querySelector('img,svg,table')) return;
    var del = markAttrs('del'); del.appendChild(frag);
    r.insertNode(del);
    r.setStartBefore(del); r.collapse(true);
  }

  /** Insert text into a text node and keep spaces visible the way browsers do: a space at the very end
   * becomes a no-break space until more text follows it. */
  function insertAt(node, off, text) {
    var before = node.data.slice(0, off), after = node.data.slice(off);
    if (/\u00a0$/.test(before) && text.charAt(0) !== ' ') before = before.slice(0, -1) + ' ';
    var t = !after && / $/.test(text) ? text.slice(0, -1) + '\u00a0' : text;
    if (/^ /.test(t) && (!before || / $/.test(before))) t = '\u00a0' + t.slice(1);
    node.data = before + t + after;
    var r = document.createRange(); r.setStart(node, before.length + t.length); r.collapse(true);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  /** Every tracked keystroke is inserted here, never by the browser, so the marks stay exact. */
  function trackInsertText(text) {
    if (!text) return;
    var r = Ed.range(); if (!r) return;
    if (!r.collapsed) { markDeleted(r); r = window.getSelection().getRangeAt(0); }
    var mine = ownMark(r.startContainer, 'ins');
    if (mine) {
      var node = r.startContainer, off = r.startOffset;
      if (node.nodeType !== 3) {
        var t = document.createTextNode('');
        var ref = node.childNodes[off] || null;
        if (ref && ref.nodeType === 3) { node = ref; off = 0; } else { node.insertBefore(t, ref); node = t; off = 0; }
      }
      insertAt(node, off, text);
      Ed.changed(); return;
    }
    var ins = markAttrs('ins'); var tn = document.createTextNode(''); ins.appendChild(tn);
    r.insertNode(ins);
    insertAt(tn, 0, text);
    Ed.changed();
  }

  function beforeInput(e) {
    if (!tracking || !Ed.doc) return;
    var s = window.getSelection(); if (!s.rangeCount) return;
    var r = s.getRangeAt(0);
    if (inGen(r.startContainer)) return;
    var t = e.inputType;
    if (t === 'insertText' || t === 'insertReplacementText') {
      e.preventDefault(); trackInsertText(e.data || (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '');
    } else if (t === 'deleteContentBackward' || t === 'deleteContentForward' || t === 'deleteWordBackward' || t === 'deleteWordForward' || t === 'deleteByCut') {
      e.preventDefault(); Ed.snapshot();
      if (r.collapsed) {
        var dir = /Backward/.test(t) ? 'backward' : 'forward', unit = /Word/.test(t) ? 'word' : 'character';
        s.modify('extend', dir, unit);
        r = s.getRangeAt(0);
        // Skip over text that is already marked deleted.
        var e2 = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentNode;
        if (e2.closest('del.wn-del')) { var dd = e2.closest('del.wn-del'); var cr = document.createRange(); if (dir === 'backward') cr.setStartBefore(dd); else cr.setStartAfter(dd); cr.collapse(true); s.removeAllRanges(); s.addRange(cr); return; }
      }
      var own = ownMark(r.startContainer, 'ins');
      if (own && own.contains(r.endContainer)) { r.deleteContents(); if (!own.textContent) own.remove(); Ed.changed(); return; }
      markDeleted(r);
      var cr2 = document.createRange(); cr2.setStart(r.startContainer, r.startOffset); cr2.collapse(true); s.removeAllRanges(); s.addRange(cr2);
      Ed.changed();
    }
  }

  function changes() { return $$('ins.wn-ins, del.wn-del', Ed.el()); }
  var chIdx = -1;
  function jumpChange(dir) {
    var l = changes(); if (!l.length) { toast('No tracked changes.'); return; }
    chIdx = (chIdx + dir + l.length) % l.length;
    var c = l[chIdx]; Views.flash(c);
    var r = document.createRange(); r.selectNode(c); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); Ed.rememberRange();
    toast((c.tagName === 'INS' ? 'Insertion' : 'Deletion') + ' by ' + c.getAttribute('data-author') + ' on ' + D.formatStamp(+c.getAttribute('data-time')) + ' (' + (chIdx + 1) + ' of ' + l.length + ').');
  }
  function apply(c, accept) {
    var isIns = c.tagName === 'INS';
    if (isIns === accept) c.replaceWith.apply(c, Array.prototype.slice.call(c.childNodes)); else c.remove();
  }
  function decide(accept) {
    var r = Ed.range(), l = changes();
    var targets = r ? l.filter(function (c) { return r.intersectsNode(c); }) : [];
    if (!targets.length && chIdx >= 0 && l[chIdx]) targets = [l[chIdx]];
    if (!targets.length) { toast('Select a tracked change, or use Next to go to one.'); return; }
    Ed.snapshot(); targets.forEach(function (c) { apply(c, accept); }); Ed.el().normalize(); Ed.changed();
    toast((accept ? 'Accepted ' : 'Rejected ') + targets.length + ' change' + (targets.length === 1 ? '' : 's') + '.');
    if (panelKind === 'changes') changesPanel();
  }
  function decideAll(accept) {
    var l = changes(); if (!l.length) { toast('No tracked changes.'); return; }
    Ed.snapshot(); l.forEach(function (c) { apply(c, accept); }); Ed.el().normalize(); Ed.changed();
    toast((accept ? 'Accepted' : 'Rejected') + ' all ' + l.length + ' changes.'); if (panelKind === 'changes') changesPanel();
  }
  function changesPanel() {
    var l = changes(), body = h('div', { class: 'sp-body' });
    if (!l.length) body.appendChild(h('p', { class: 'empty' }, 'No tracked changes. Turn on Track changes, then edit the text.'));
    l.forEach(function (c, i) {
      body.appendChild(h('article', { class: 'cmt ' + (c.tagName === 'INS' ? 'is-ins' : 'is-del') },
        h('header', null, h('strong', null, c.tagName === 'INS' ? 'Inserted' : 'Deleted'), ' by ', c.getAttribute('data-author'), ' · ', h('time', null, D.formatStamp(+c.getAttribute('data-time')))),
        h('p', null, '“' + c.textContent.slice(0, 120) + '”'),
        h('div', { class: 'choice-row' },
          h('button', { type: 'button', class: 'btn sm', onclick: function () { chIdx = i - 1; jumpChange(1); } }, 'Show'),
          h('button', { type: 'button', class: 'btn sm primary', onclick: function () { Ed.snapshot(); apply(c, true); Ed.changed(); changesPanel(); } }, 'Accept'),
          h('button', { type: 'button', class: 'btn sm', onclick: function () { Ed.snapshot(); apply(c, false); Ed.changed(); changesPanel(); } }, 'Reject'))));
    });
    openPanel('changes', 'Tracked changes (' + l.length + ')', body);
  }

  /* ---------- Revisions and compare ---------- */
  function saveRevision(label) {
    var keep = settings.get('memorySaver', true) ? 5 : 10;
    Ed.doc.revisions.push({ id: MODEL.uid('r'), t: Date.now(), label: label || 'Revision ' + (Ed.doc.revisions.length + 1), html: Ed.serialize() });
    if (Ed.doc.revisions.length > keep) Ed.doc.revisions = Ed.doc.revisions.slice(-keep);
    Ed.saveNow(); toast('Revision saved. Up to ' + keep + ' are kept per document.');
  }
  function textOf(html) { var d = new DOMParser().parseFromString('<body>' + html, 'text/html'); $$('p,li,h1,h2,h3,h4,tr,div,blockquote', d.body).forEach(function (b) { b.appendChild(d.createTextNode('\n')); }); return d.body.textContent.replace(/\n{3,}/g, '\n\n').trim(); }
  function compareDialog() {
    var revs = Ed.doc.revisions;
    if (!revs.length) { toast('Save a revision first (Review, Save revision), then edit and compare.'); return; }
    var opts = [['current', 'Current document']].concat(revs.slice().reverse().map(function (r) { return [r.id, r.label + ' · ' + D.formatStamp(r.t)]; }));
    function mk(def) { var s = h('select'); opts.forEach(function (o) { var op = h('option', { value: o[0] }, o[1]); if (o[0] === def) op.selected = true; s.appendChild(op); }); return s; }
    var a = mk(revs[revs.length - 1].id), b = mk('current');
    var mode = h('select', null, h('option', { value: 'inline' }, 'Inline differences'), h('option', { value: 'side' }, 'Side by side'));
    openDialog({ title: 'Compare two revisions', body: h('div', null, field('Original', a), field('Revised', b), field('Show as', mode)), actions: [{ label: 'Cancel' }, { label: 'Compare', primary: true, onClick: function (err) {
      if (a.value === b.value) { err('Choose two different versions.'); return false; }
      var get = function (id) { return id === 'current' ? Ed.serialize() : revs.filter(function (r) { return r.id === id; })[0].html; };
      showCompare(textOf(get(a.value)), textOf(get(b.value)), mode.value, a.selectedOptions[0].textContent, b.selectedOptions[0].textContent);
    } }] });
  }
  function showCompare(ta, tb, mode, la, lb) {
    var ops = WN.diff.diffText(ta, tb), st = WN.diff.stats(ops);
    var body = h('div', { class: 'sp-body cmp' }, h('p', null, M.formatCount(st.added) + ' words added, ' + M.formatCount(st.removed) + ' words removed.'));
    if (mode === 'inline') {
      var box = h('div', { class: 'diff' });
      ops.forEach(function (o) { box.appendChild(o.op === '=' ? document.createTextNode(o.text) : h(o.op === '+' ? 'ins' : 'del', null, o.text)); });
      body.appendChild(box);
    } else {
      var left = h('div', { class: 'diff' }), right = h('div', { class: 'diff' });
      ops.forEach(function (o) {
        if (o.op !== '+') left.appendChild(o.op === '-' ? h('del', null, o.text) : document.createTextNode(o.text));
        if (o.op !== '-') right.appendChild(o.op === '+' ? h('ins', null, o.text) : document.createTextNode(o.text));
      });
      body.appendChild(h('div', { class: 'diff-side' }, h('div', null, h('h3', null, la), left), h('div', null, h('h3', null, lb), right)));
      Views.syncScroll(left, right);
    }
    openDialog({ title: 'Comparison', wide: true, body: body });
  }

  /* ---------- Protection (a deterrent against accidental edits, not encryption) ---------- */
  function toggleReadOnly() {
    var p = Ed.doc.protect;
    if (p.mode === 'password') { unlockDialog(); return; }
    p.mode = p.mode === 'readonly' ? 'none' : 'readonly';
    Ed.applyLock(); Ed.saveNow(); toast(p.mode === 'readonly' ? 'Read-only on. Choose Read-only again to edit.' : 'Read-only off.'); Ribbon.refreshState();
  }
  function hashPw(pw, salt) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pw)).then(function (b) { return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); });
  }
  function passwordDialog() {
    if (Ed.doc.protect.mode === 'password') { unlockDialog(); return; }
    var a = h('input', { type: 'password', autocomplete: 'new-password' }), b = h('input', { type: 'password', autocomplete: 'new-password' });
    openDialog({ title: 'Lock editing with a password', body: h('div', null, field('Password', a), field('Type it again', b), h('p', { class: 'hint' }, 'This stops accidental edits on any synced device. It does not encrypt the file. If you forget the password, the text can still be exported.')),
      actions: [{ label: 'Cancel' }, { label: 'Lock', primary: true, onClick: function (err) {
        if (a.value.length < 4) { err('Use at least 4 characters.'); return false; }
        if (a.value !== b.value) { err('The two passwords are different. Type them again.'); return false; }
        var salt = MODEL.uid('s');
        return hashPw(a.value, salt).then(function (hsh) { Ed.doc.protect = { mode: 'password', salt: salt, hash: hsh }; Ed.applyLock(); Ed.saveNow(); toast('Editing is locked.'); return true; });
      } }] });
  }
  function unlockDialog() {
    var a = h('input', { type: 'password', autocomplete: 'current-password' });
    openDialog({ title: 'Unlock editing', body: field('Password', a), actions: [{ label: 'Cancel' }, { label: 'Unlock', primary: true, onClick: function (err) {
      return hashPw(a.value, Ed.doc.protect.salt).then(function (hsh) {
        if (hsh !== Ed.doc.protect.hash) { err('That password is not correct. Check Caps Lock and try again.'); return false; }
        Ed.doc.protect = { mode: 'none' }; Ed.applyLock(); Ed.saveNow(); toast('Unlocked.'); return true;
      });
    } }] });
  }

  function bind() {
    Ed.el().addEventListener('beforeinput', beforeInput);
    $('#lockBannerBtn').addEventListener('click', function () { if (Ed.doc.protect.mode === 'password') unlockDialog(); else toggleReadOnly(); });
  }

  return { onOpen: onOpen, updateCounts: updateCounts, counts: counts, wordCountDialog: wordCountDialog, find: find, selectSimilar: selectSimilar, spellingPanel: spellingPanel,
    addComment: addComment, commentsPanel: commentsPanel, deleteComment: deleteComment, jumpComment: jumpComment, toggleTrack: toggleTrack, tracking: function () { return tracking; },
    trackInsertText: trackInsertText, jumpChange: jumpChange, decide: decide, decideAll: decideAll, changesPanel: changesPanel, saveRevision: saveRevision, compareDialog: compareDialog,
    textOf: textOf, toggleReadOnly: toggleReadOnly, passwordDialog: passwordDialog, closePanel: closePanel, bind: bind, author: author };
})();

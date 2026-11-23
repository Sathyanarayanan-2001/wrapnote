/* WrapNote app: "Customise ribbon" (1.4.0). The person puts tabs, groups and commands in the order they like,
 * hides groups they never use and chooses the quick access bar (always visible, on every tab). Rules live in
 * core/ribbonLayout.js; this file draws the lists. Every list can be reordered three ways: drag with a mouse,
 * the ▲ ▼ buttons (keyboard and touch), or Alt+Up / Alt+Down on a focused row. Nothing changes until Save. */
var RibbonCustom = (function () {
  var RL = WN.ribbonLayout;
  var work = null, tabSel = 'home', openGroups = {};

  function tabLabel(id) { return (Ribbon.TABS.filter(function (t) { return t.id === id; })[0] || {}).label || id; }
  function groupOf(tid, gid) { var t = Ribbon.TABS.filter(function (x) { return x.id === tid; })[0]; return t && t.groups.filter(function (x) { return x.id === gid; })[0]; }
  function pathLabel(p) { var s = p.split('/'), g = groupOf(s[0], s[1]); return tabLabel(s[0]) + ' › ' + (g ? g.label : s[1]) + ' › ' + Ribbon.labelOf(Ribbon.specAt(p)); }

  /**
   * One reorderable list. rows: [{ key, label, extra (optional element), below (optional element under the row) }];
   * onMove(newKeys) gets the new order.
   * Drag and drop, ▲ ▼ buttons and Alt+arrows all call the same move rules from the core module.
   */
  function list(name, rows, onMove, opts) {
    opts = opts || {};
    var keys = rows.map(function (r) { return r.key; });
    var ol = h('ol', { class: 'cz-list', 'aria-label': name });
    var dragFrom = -1;
    rows.forEach(function (r, i) {
      var up = h('button', { type: 'button', class: 'btn sm ghost cz-mv', 'aria-label': 'Move ' + r.label + ' up', disabled: i === 0, onclick: function () { onMove(RL.move(keys, i, -1), i - 1); } }, '▲');
      var down = h('button', { type: 'button', class: 'btn sm ghost cz-mv', 'aria-label': 'Move ' + r.label + ' down', disabled: i === rows.length - 1, onclick: function () { onMove(RL.move(keys, i, 1), i + 1); } }, '▼');
      var li = h('li', { class: 'cz-row', draggable: 'true', tabindex: '0', 'data-key': r.key, 'aria-label': r.label + ', position ' + (i + 1) + ' of ' + rows.length },
        h('span', { class: 'cz-grip', 'aria-hidden': 'true' }, '⋮⋮'), h('span', { class: 'cz-label' }, r.label), r.extra || null, h('span', { class: 'cz-acts' }, up, down, opts.remove ? h('button', { type: 'button', class: 'btn sm ghost cz-mv', 'aria-label': 'Remove ' + r.label, onclick: function () { opts.remove(i); } }, '✕') : null),
        r.below || null);
      // A group row holds its own command list; drag events stop at the row they belong to.
      li.addEventListener('dragstart', function (e) { e.stopPropagation(); dragFrom = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.key); li.classList.add('dragging'); });
      li.addEventListener('dragend', function (e) { e.stopPropagation(); li.classList.remove('dragging'); dragFrom = -1; });
      li.addEventListener('dragover', function (e) { if (dragFrom >= 0) { e.stopPropagation(); e.preventDefault(); li.classList.add('drop'); } });
      li.addEventListener('dragleave', function () { li.classList.remove('drop'); });
      li.addEventListener('drop', function (e) { if (dragFrom < 0) return; e.stopPropagation(); e.preventDefault(); li.classList.remove('drop'); if (dragFrom !== i) onMove(RL.moveTo(keys, dragFrom, i), i); dragFrom = -1; });
      li.addEventListener('keydown', function (e) {
        if (e.target !== li || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
        e.preventDefault(); var d = e.key === 'ArrowUp' ? -1 : 1; if (i + d >= 0 && i + d < rows.length) onMove(RL.move(keys, i, d), i + d);
      });
      ol.appendChild(li);
    });
    return ol;
  }

  var body = null;
  function render(focusList, focusIndex) {
    var scroller = body.closest('.dlg-body'), top = scroller ? scroller.scrollTop : 0;
    var ribbon = Ribbon.ids();
    var arranged = RL.apply(ribbon, work);
    body.textContent = '';
    // Quick access bar
    var qat = work.qat.map(function (p, i) { return { key: p, label: pathLabel(p) }; });
    var add = h('select', { id: 'czAdd', 'aria-label': 'Command to add to the quick access bar' }, h('option', { value: '' }, 'Choose a command to add…'));
    RL.paths(ribbon).forEach(function (p) { if (work.qat.indexOf(p) < 0) add.appendChild(h('option', { value: p }, pathLabel(p))); });
    body.appendChild(h('section', { class: 'cz-sec' }, h('h3', null, 'Quick access bar'),
      h('p', { class: 'hint' }, 'Always visible, on every tab, even when the ribbon is hidden. Up to ' + RL.QAT_MAX + ' commands. Right-click any ribbon command to add it.'),
      qat.length ? list('Quick access bar', qat, function (keys, at) { work.qat = keys; render('Quick access bar', at); }, { remove: function (i) { work.qat.splice(i, 1); render('Quick access bar', Math.max(0, i - 1)); } }) : h('p', { class: 'hint' }, 'Empty: the bar is hidden.'),
      h('div', { class: 'choice-row' }, add, h('button', { type: 'button', class: 'btn', id: 'czAddBtn', onclick: function () {
        if (!add.value) { toast('Choose a command from the list first.'); add.focus(); return; }
        if (work.qat.length >= RL.QAT_MAX) { toast('The quick access bar holds at most ' + RL.QAT_MAX + ' commands. Remove one first.', 'error'); return; }
        work.qat.push(add.value); render('Quick access bar', work.qat.length - 1);
      } }, 'Add'))));
    // Tabs
    body.appendChild(h('section', { class: 'cz-sec' }, h('h3', null, 'Tabs'),
      list('Tab order', arranged.map(function (t) { return { key: t.id, label: tabLabel(t.id) }; }), function (keys, at) { work.tabs = keys; render('Tab order', at); })));
    // Groups and commands of one tab
    var pick = h('select', { id: 'czTab', 'aria-label': 'Tab to arrange' }, arranged.map(function (t) { return h('option', { value: t.id }, tabLabel(t.id)); }));
    pick.value = tabSel;
    pick.addEventListener('change', function () { tabSel = pick.value; render(); });
    var at = arranged.filter(function (t) { return t.id === tabSel; })[0];
    var grows = at.groups.map(function (ag) {
      var g = groupOf(tabSel, ag.id), key = tabSel + '/' + ag.id;
      var show = h('input', { type: 'checkbox', checked: !ag.hidden, 'aria-label': 'Show ' + g.label });
      show.addEventListener('change', function () {
        var i = work.hidden.indexOf(key);
        if (show.checked && i >= 0) work.hidden.splice(i, 1);
        if (!show.checked && i < 0) {
          var visible = at.groups.filter(function (x) { return !x.hidden && x.id !== ag.id; }).length;
          if (!visible) { show.checked = true; toast('Keep at least one group on each tab, so its commands stay reachable.', 'error'); return; }
          work.hidden.push(key);
        }
        render();
      });
      var more = h('button', { type: 'button', class: 'btn sm ghost', 'aria-expanded': String(!!openGroups[key]), onclick: function () { openGroups[key] = !openGroups[key]; render(); var b = body.querySelector('li[data-key="' + ag.id + '"] .cz-extra button'); if (b) b.focus({ preventScroll: true }); } }, openGroups[key] ? 'Hide commands' : 'Commands…');
      var extra = h('span', { class: 'cz-extra' }, h('label', { class: 'chk cz-show' }, show, 'Show'), more);
      var below = null;
      if (openGroups[key]) {
        var rows = ag.items.map(function (iid) { return { key: iid, label: Ribbon.labelOf(Ribbon.specAt(key + '/' + iid)) }; });
        below = h('div', { class: 'cz-sub' }, h('h4', null, 'Commands in ' + g.label), list('Commands in ' + g.label, rows, function (keys, at3) { work.items[key] = keys; render('Commands in ' + g.label, at3); }));
      }
      return { key: ag.id, label: g.label, extra: extra, below: below };
    });
    var sec = h('section', { class: 'cz-sec' }, h('h3', null, 'Groups and commands'), h('div', { class: 'fld' }, h('label', { for: 'czTab' }, 'Tab'), pick),
      list('Groups in ' + tabLabel(tabSel), grows, function (keys, at2) { work.groups[tabSel] = keys; render('Groups in ' + tabLabel(tabSel), at2); }));
    body.appendChild(sec);
    if (scroller) scroller.scrollTop = top;
    // Put the focus back on the row that moved, so keyboard users can keep moving it.
    if (focusList) {
      var ol = body.querySelector('ol[aria-label="' + focusList.replace(/"/g, '\\"') + '"]');
      var li = ol && ol.children[focusIndex || 0];
      if (li) li.focus({ preventScroll: true });
    }
  }

  function open() {
    var r = RL.normalize(settings.get('ribbonLayout', null), Ribbon.ids(), Ribbon.DEFAULT_QAT);
    work = JSON.parse(JSON.stringify(r.layout));
    var act = $('#ribbon .rb-tab.active'); tabSel = act ? act.id.replace(/^rbt-/, '') : 'home';
    openGroups = {};
    body = h('div', { class: 'cz-body' });
    render();
    openDialog({ title: 'Customise ribbon', body: body, wide: true, actions: [
      { label: 'Restore standard', onClick: function () { work = JSON.parse(JSON.stringify(RL.defaults(Ribbon.ids(), Ribbon.DEFAULT_QAT))); openGroups = {}; render(); toast('Standard arrangement shown. Choose Save to keep it.'); return false; } },
      { label: 'Cancel' },
      { label: 'Save', primary: true, onClick: function () {
        var res = Ribbon.saveLayout(work);
        toast(res.warnings.length ? 'Saved, with changes: ' + res.warnings[0] : 'Ribbon arrangement saved. It will look the same next time.');
      } }] });
    // Start at the top, on the first row, not at the first form control further down.
    var sc = body.closest('.dlg-body'); if (sc) sc.scrollTop = 0;
    var first = body.querySelector('.cz-row'); if (first) first.focus({ preventScroll: true });
  }

  return { open: open };
})();

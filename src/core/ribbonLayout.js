/* WrapNote core: the person's own ribbon arrangement (1.4.0).
 * The app describes its ribbon as ids only: tabs → groups → items. A saved layout says, for each level, the
 * order the person chose, which groups are hidden, and which items sit in the quick access bar. This module
 * checks a saved layout against the current ribbon and merges the two, with no browser code, so it can be
 * tested alone. Rules:
 *  - Anything the saved layout does not know (a command added in a later version) appears at its default place.
 *  - Anything the saved layout names that no longer exists is dropped and reported, never kept silently.
 *  - A tab cannot be hidden, and at least one group per tab stays visible, so no command can be lost for good.
 */
(function (g) {
  'use strict';

  var VERSION = 1;
  var QAT_MAX = 16;
  var ID_RE = /^[a-z][a-zA-Z0-9:#_-]{0,40}$/;

  /** Ids of a default ribbon: [{ id, groups: [{ id, items: [id] }] }] → a deep copy that later steps may reorder. */
  function clone(d) { return d.map(function (t) { return { id: t.id, groups: t.groups.map(function (gr) { return { id: gr.id, items: gr.items.slice() }; }) }; }); }

  /** Order `ids` (all of them, each once) by `saved`: saved ones first in saved order, new ones after their default neighbours. */
  function order(ids, saved, drop, where) {
    var known = new Set(ids), out = [];
    (Array.isArray(saved) ? saved : []).forEach(function (id) {
      if (typeof id !== 'string' || !known.has(id)) { if (drop) drop.push(where + ': "' + String(id).slice(0, 40) + '" no longer exists and was left out.'); return; }
      if (out.indexOf(id) < 0) out.push(id);
    });
    // A command added in a later version goes right after the item that comes before it in the default order.
    ids.forEach(function (id, i) {
      if (out.indexOf(id) >= 0) return;
      var prev = i > 0 ? out.indexOf(ids[i - 1]) : -1;
      out.splice(prev + 1, 0, id);
    });
    return out;
  }

  /** The default layout for a ribbon: default orders, nothing hidden, the given quick access items. */
  function defaults(ribbon, qat) {
    return { v: VERSION, tabs: ribbon.map(function (t) { return t.id; }), groups: {}, items: {}, hidden: [], qat: (qat || []).slice() };
  }

  /** Every item's full path ("home/font/bold"), the address used by the quick access bar. */
  function paths(ribbon) {
    var out = [];
    ribbon.forEach(function (t) { t.groups.forEach(function (gr) { gr.items.forEach(function (it) { out.push(t.id + '/' + gr.id + '/' + it); }); }); });
    return out;
  }

  /**
   * Check a saved layout (from settings, or typed by hand) against the current ribbon.
   * Returns { layout, warnings }: layout is always usable; warnings name everything that was dropped.
   * A layout that is not an object at all gives the defaults plus one warning.
   */
  function normalize(saved, ribbon, defaultQat) {
    var warnings = [];
    var base = defaults(ribbon, defaultQat);
    if (saved == null) return { layout: base, warnings: warnings };
    if (typeof saved !== 'object' || Array.isArray(saved)) return { layout: base, warnings: ['The saved ribbon arrangement could not be read; the standard one is used.'] };
    if (saved.v !== undefined && saved.v !== VERSION) warnings.push('The saved ribbon arrangement is from another version; it was checked and adapted.');
    var tabIds = ribbon.map(function (t) { return t.id; });
    var lay = { v: VERSION, tabs: order(tabIds, saved.tabs, warnings, 'Tab'), groups: {}, items: {}, hidden: [], qat: [] };
    var groupsIn = saved.groups && typeof saved.groups === 'object' ? saved.groups : {};
    var itemsIn = saved.items && typeof saved.items === 'object' ? saved.items : {};
    ribbon.forEach(function (t) {
      var gids = t.groups.map(function (gr) { return gr.id; });
      if (groupsIn[t.id] !== undefined) lay.groups[t.id] = order(gids, groupsIn[t.id], warnings, 'Group in ' + t.id);
      t.groups.forEach(function (gr) {
        var key = t.id + '/' + gr.id;
        if (itemsIn[key] !== undefined) lay.items[key] = order(gr.items, itemsIn[key], warnings, 'Command in ' + key);
      });
    });
    Object.keys(groupsIn).forEach(function (k) { if (tabIds.indexOf(k) < 0) warnings.push('Tab "' + k.slice(0, 40) + '" no longer exists and was left out.'); });
    var allGroups = [];
    ribbon.forEach(function (t) { t.groups.forEach(function (gr) { allGroups.push(t.id + '/' + gr.id); }); });
    (Array.isArray(saved.hidden) ? saved.hidden : []).forEach(function (k) {
      if (allGroups.indexOf(k) < 0) { warnings.push('Hidden group "' + String(k).slice(0, 40) + '" no longer exists.'); return; }
      if (lay.hidden.indexOf(k) < 0) lay.hidden.push(k);
    });
    // Never let a whole tab disappear: if every group of a tab is hidden, its first group is shown again.
    ribbon.forEach(function (t) {
      var all = t.groups.every(function (gr) { return lay.hidden.indexOf(t.id + '/' + gr.id) >= 0; });
      if (all && t.groups.length) {
        var first = t.id + '/' + (lay.groups[t.id] || t.groups.map(function (gr) { return gr.id; }))[0];
        lay.hidden.splice(lay.hidden.indexOf(first), 1);
        warnings.push('Every group of the ' + t.id + ' tab was hidden; its first group is shown so its commands stay reachable.');
      }
    });
    var valid = new Set(paths(ribbon));
    var q = saved.qat === undefined ? base.qat : saved.qat;
    (Array.isArray(q) ? q : []).forEach(function (pth) {
      if (!valid.has(pth)) { warnings.push('Quick access command "' + String(pth).slice(0, 60) + '" no longer exists and was left out.'); return; }
      if (lay.qat.indexOf(pth) >= 0) return;
      if (lay.qat.length >= QAT_MAX) { warnings.push('The quick access bar holds at most ' + QAT_MAX + ' commands; the rest were left out.'); return; }
      lay.qat.push(pth);
    });
    return { layout: lay, warnings: warnings };
  }

  /** The ribbon in the person's order: [{ id, groups: [{ id, hidden, items: [id] }] }]. */
  function apply(ribbon, layout) {
    var byTab = {}; ribbon.forEach(function (t) { byTab[t.id] = t; });
    return layout.tabs.map(function (tid) {
      var t = byTab[tid], byGroup = {};
      t.groups.forEach(function (gr) { byGroup[gr.id] = gr; });
      var gorder = layout.groups[tid] || t.groups.map(function (gr) { return gr.id; });
      return { id: tid, groups: gorder.map(function (gid) {
        var gr = byGroup[gid], key = tid + '/' + gid;
        return { id: gid, hidden: layout.hidden.indexOf(key) >= 0, items: (layout.items[key] || gr.items).slice() };
      }) };
    });
  }

  /** Move one entry up (-1) or down (+1). Returns a new array; out-of-range moves return the same order. */
  function move(arr, index, delta) {
    var out = arr.slice(), to = index + delta;
    if (index < 0 || index >= out.length || to < 0 || to >= out.length) return out;
    var x = out.splice(index, 1)[0]; out.splice(to, 0, x);
    return out;
  }
  /** Move an entry to a new position (drag and drop). */
  function moveTo(arr, from, to) {
    var out = arr.slice();
    if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
    var x = out.splice(from, 1)[0]; out.splice(to, 0, x);
    return out;
  }

  /** True when the layout equals the defaults (nothing to save). */
  function isDefault(layout, ribbon, defaultQat) {
    var d = defaults(ribbon, defaultQat);
    var a = apply(ribbon, layout), b = apply(ribbon, d);
    return JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(layout.qat) === JSON.stringify(d.qat);
  }

  /** A compact form to store: only what differs from the defaults, so later default changes still reach the person. */
  function compact(layout, ribbon, defaultQat) {
    var out = { v: VERSION };
    var defTabs = ribbon.map(function (t) { return t.id; });
    if (JSON.stringify(layout.tabs) !== JSON.stringify(defTabs)) out.tabs = layout.tabs.slice();
    var gr = {}, it = {};
    ribbon.forEach(function (t) {
      var dg = t.groups.map(function (x) { return x.id; });
      if (layout.groups[t.id] && JSON.stringify(layout.groups[t.id]) !== JSON.stringify(dg)) gr[t.id] = layout.groups[t.id].slice();
      t.groups.forEach(function (x) { var k = t.id + '/' + x.id; if (layout.items[k] && JSON.stringify(layout.items[k]) !== JSON.stringify(x.items)) it[k] = layout.items[k].slice(); });
    });
    if (Object.keys(gr).length) out.groups = gr;
    if (Object.keys(it).length) out.items = it;
    if (layout.hidden.length) out.hidden = layout.hidden.slice();
    if (JSON.stringify(layout.qat) !== JSON.stringify(defaultQat || [])) out.qat = layout.qat.slice();
    return out;
  }

  var api = { VERSION: VERSION, QAT_MAX: QAT_MAX, ID_RE: ID_RE, clone: clone, defaults: defaults, paths: paths, normalize: normalize, apply: apply, move: move, moveTo: moveTo, isDefault: isDefault, compact: compact };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).ribbonLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

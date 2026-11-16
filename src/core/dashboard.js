/* WrapNote core: dashboard figures computed from document summaries (metas).
 * One pass over metas and their action rows: O(n + a), plus O(k log k) to sort k categories.
 */
(function (g) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var dates = isNode ? require('./dates.js') : g.WN.dates;
  var money = isNode ? require('./money.js') : g.WN.money;

  var MODE_LABEL = { mom: 'Minutes and reports', book: 'Study notes', blank: 'Blank' };

  function countBy(map, key) { map.set(key, (map.get(key) || 0) + 1); }

  function sortedEntries(map, labelFn) {
    // Stable: count descending, then label ascending.
    return Array.from(map.entries()).map(function (e) { return { key: e[0], label: labelFn ? labelFn(e[0]) : e[0], count: e[1] }; })
      .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
  }

  function aggregate(metas, today) {
    var byMode = new Map(), byCat = new Map(), byStatus = new Map(), fyCost = new Map();
    var words = 0, acts = { total: 0, open: 0, done: 0, overdue: 0, dueNext7: 0 }, costs = [];
    var weekKeys = [], weekCount = new Map();
    // Last 8 ISO weeks ending with the current one, oldest first.
    var monday = dates.weekStart(today);
    for (var w = 7; w >= 0; w--) {
      var wk = dates.isoWeek(dates.addDays(monday, -7 * w));
      weekKeys.push(wk); weekCount.set(wk.key, 0);
    }
    var in7 = dates.addDays(today, 7);
    metas.forEach(function (m) {
      countBy(byMode, m.mode);
      countBy(byCat, m.category || 'General');
      countBy(byStatus, m.status === 'final' ? 'Final' : 'Draft');
      words += m.words || 0;
      var k = dates.isValidISO(m.date) ? dates.isoWeek(m.date).key : null;
      if (k && weekCount.has(k)) weekCount.set(k, weekCount.get(k) + 1);
      (m.actions || []).forEach(function (a) {
        acts.total++;
        if (a.done) acts.done++; else {
          acts.open++;
          if (a.due && a.due < today) acts.overdue++;
          else if (a.due && a.due <= in7) acts.dueNext7++;
        }
        if (a.cost) {
          costs.push(a.cost);
          var fy = dates.financialYear(a.due && dates.isValidISO(a.due) ? a.due : m.date);
          var label = fy ? fy.label : 'No date';
          fyCost.set(label, money.sumPaise([fyCost.get(label) || 0, a.cost]));
        }
      });
    });
    var recent = metas.slice().sort(function (a, b) { return (b.u || 0) - (a.u || 0) || String(b.date).localeCompare(String(a.date)) || String(a.title).localeCompare(String(b.title)); }).slice(0, 5);
    return {
      total: metas.length,
      byMode: sortedEntries(byMode, function (k) { return MODE_LABEL[k] || k; }),
      byCategory: sortedEntries(byCat),
      byStatus: sortedEntries(byStatus),
      words: words,
      actions: acts,
      costTotal: money.sumPaise(costs),
      costByFY: Array.from(fyCost.entries()).map(function (e) { return { key: e[0], label: e[0], value: e[1] }; }).sort(function (a, b) { return a.label.localeCompare(b.label); }),
      weeks: weekKeys.map(function (wk) { return { key: wk.key, label: wk.label, count: weekCount.get(wk.key) }; }),
      recent: recent
    };
  }

  var api = { aggregate: aggregate, MODE_LABEL: MODE_LABEL };
  if (isNode) module.exports = api;
  else (g.WN = g.WN || {}).dashboard = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

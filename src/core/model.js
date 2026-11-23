/* WrapNote core: document model, generated MoM / study-note sections, and input validation.
 * Everything rendered here passes through escapeHtml, so typed text can never become markup.
 */
(function (g) {
  'use strict';
  var isNode = typeof module === 'object' && module.exports;
  var dates = isNode ? require('./dates.js') : g.WN.dates;
  var safe = isNode ? require('./safe.js') : g.WN.safe;
  var text = isNode ? require('./text.js') : g.WN.text;
  var refs = isNode ? require('./refs.js') : g.WN.refs;
  var esc = safe.escapeHtml;

  var VERSION = '1.4.0';
  var MODES = { mom: 'Minutes and reports', book: 'Book and study notes', blank: 'Blank document' };
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function uid(prefix) {
    var r = '';
    if (g.crypto && g.crypto.getRandomValues) {
      var a = new Uint8Array(8); g.crypto.getRandomValues(a);
      for (var i = 0; i < a.length; i++) r += (a[i] % 36).toString(36);
    } else r = Math.random().toString(36).slice(2, 10);
    return (prefix || 'd') + Date.now().toString(36) + r;
  }

  function emptyFields() {
    return {
      mom: { date: '', from: '', to: '', location: '', host: '', scribe: '', purpose: '', present: [], absent: [], agenda: '', decisions: '', actions: [], nextDate: '', nextTime: '' },
      book: { author: '', chapter: '', date: '', thesis: '', concepts: '', quotes: [], diagram: '', recall: [], takeaways: '' }
    };
  }

  function defaultLayout() {
    return {
      size: 'A4', orientation: 'portrait', margins: 'normal', custom: { t: 25.4, r: 25.4, b: 25.4, l: 25.4 },
      pageColor: '#ffffff', border: { style: 'none', color: '#334155', width: 1, kind: 'box' },
      watermark: { type: 'none', text: 'DRAFT', image: '', opacity: 0.12, angle: -40 },
      header: { text: '', align: 'center' }, footer: { text: '', align: 'center' },
      pageNumbers: { show: true, pos: 'bottom', align: 'center', format: 'Page X of Y' },
      branding: { on: false, logo: '', logoPos: 'left', headerText: '', footerText: '' }
    };
  }

  function newDoc(mode, nowMs, todayIso, id) {
    var m = MODES[mode] ? mode : 'blank';
    var f = emptyFields();
    if (m === 'mom') f.mom.date = todayIso;
    if (m === 'book') f.book.date = todayIso;
    return {
      id: id || uid('d'), u: nowMs, created: nowMs, mode: m, title: '', category: m === 'mom' ? 'Meetings' : m === 'book' ? 'Study' : 'General',
      status: 'draft', fields: f, html: '', layout: defaultLayout(), comments: [], revisions: [], protect: { mode: 'none' }, summary: [], refs: {}
    };
  }

  function lines(s) { return String(s || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function paras(s) { return lines(s).map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') || '<p><br></p>'; }

  function dateLine(iso) {
    if (!dates.isValidISO(iso)) return '';
    var p = dates.splitISO(iso);
    var wd = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
    return dates.formatDMY(iso) + ' (' + wd + ') · ' + dates.isoWeek(iso).label + ' · ' + dates.financialYear(iso).label;
  }

  function timeLine(from, to) {
    var a = dates.parseTime(from), b = dates.parseTime(to);
    if (a.ok && b.ok) {
      var mins = dates.durationMinutes(from, to);
      return a.text + '–' + b.text + ' (' + dates.formatDuration(mins) + (b.minutes < a.minutes ? ', ends next day' : '') + ')';
    }
    return a.ok ? a.text : '';
  }

  function locationHtml(loc) {
    var s = String(loc || '').trim();
    if (!s) return '';
    return safe.isSafeUrl(s) && /^https?:/i.test(s) ? '<a href="' + esc(s) + '">' + esc(s) + '</a>' : esc(s);
  }

  function section(title, body) { return body ? '<h2>' + esc(title) + '</h2>' + body : ''; }
  function list(tag, items) { return items.length ? '<' + tag + '>' + items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</' + tag + '>' : ''; }

  /** Action rows sorted stably by due date, then owner, then task. O(n log n). */
  function sortActions(actions) {
    return actions.map(function (a, i) { return { a: a, i: i }; }).sort(function (x, y) {
      var dx = x.a.due || '9999-99-99', dy = y.a.due || '9999-99-99';
      return dx < dy ? -1 : dx > dy ? 1 : String(x.a.owner || '').localeCompare(String(y.a.owner || '')) || String(x.a.task || '').localeCompare(String(y.a.task || '')) || x.i - y.i;
    }).map(function (x) { return x.a; });
  }

  function actionsTable(actions) {
    var rows = actions.filter(function (a) { return String(a.task || '').trim(); });
    if (!rows.length) return '';
    // 1.2.0: no Cost column. Costs had no meaning for minutes; any old stored values are kept but not shown.
    var h = '<table class="wn-table wn-style-corporate wn-actions"><thead><tr><th>#</th><th>Task</th><th>Owner</th><th>Due</th><th>Status</th></tr></thead><tbody>';
    sortActions(rows).forEach(function (a, i) {
      h += '<tr><td class="num">' + (i + 1) + '</td><td>' + esc(a.task) + '</td><td>' + esc(a.owner || '—') + '</td><td>' + esc(a.due ? dates.formatDMY(a.due) : '—') + '</td><td>' + (a.done ? 'Done' : 'Open') + '</td></tr>';
    });
    h += '</tbody></table>';
    return h;
  }

  function renderMoM(title, f) {
    var meta = '';
    var dl = dateLine(f.date), tl = timeLine(f.from, f.to), loc = locationHtml(f.location);
    if (dl || tl) meta += '<tr><th>Date</th><td>' + esc(dl || '—') + '</td><th>Time</th><td>' + esc(tl || '—') + '</td></tr>';
    if (loc) meta += '<tr><th>Location / link</th><td colspan="3">' + loc + '</td></tr>';
    if (f.host || f.scribe) meta += '<tr><th>Host / chair</th><td>' + esc(f.host || '—') + '</td><th>Notes by</th><td>' + esc(f.scribe || '—') + '</td></tr>';
    var att = '';
    if (f.present.length) att += '<p><strong>Present (' + f.present.length + '):</strong> ' + esc(f.present.join(', ')) + '</p>';
    if (f.absent.length) att += '<p><strong>Absent (' + f.absent.length + '):</strong> ' + esc(f.absent.join(', ')) + '</p>';
    var next = '';
    if (dates.isValidISO(f.nextDate)) next = '<p>' + esc(dateLine(f.nextDate)) + (dates.parseTime(f.nextTime).ok ? ' at ' + esc(dates.parseTime(f.nextTime).text) : '') + '</p>';
    return '<h1 class="wn-doc-title" data-field="title" contenteditable="true">' + esc(title || 'Untitled minutes') + '</h1>' +
      (meta ? '<table class="wn-meta"><tbody>' + meta + '</tbody></table>' : '') +
      '<h2>Purpose</h2><div class="wn-field" data-field="purpose" contenteditable="true">' + paras(f.purpose) + '</div>' +
      section('Attendance', att) + section('Agenda', list('ol', lines(f.agenda))) + section('Key decisions', list('ol', lines(f.decisions))) +
      section('Action items', actionsTable(f.actions || [])) + section('Next meeting', next);
  }

  function renderBook(title, f) {
    var meta = '';
    var src = [f.author, f.chapter].filter(Boolean).join(' · ');
    if (src) meta += '<tr><th>Author / source</th><td>' + esc(f.author || '—') + '</td><th>Chapter / pages</th><td>' + esc(f.chapter || '—') + '</td></tr>';
    if (dates.isValidISO(f.date)) meta += '<tr><th>Date</th><td colspan="3">' + esc(dateLine(f.date)) + '</td></tr>';
    var concepts = lines(f.concepts).map(function (l) {
      var i = l.indexOf(':');
      return i > 0 ? '<dt>' + esc(l.slice(0, i).trim()) + '</dt><dd>' + esc(l.slice(i + 1).trim()) + '</dd>' : '<dt>' + esc(l) + '</dt><dd></dd>';
    }).join('');
    var quotes = (f.quotes || []).filter(function (q) { return String(q.text || '').trim(); }).map(function (q) {
      return '<blockquote class="wn-quote"><p>' + esc(q.text) + '</p>' + (q.page ? '<footer>p. ' + esc(q.page) + '</footer>' : '') + '</blockquote>';
    }).join('');
    var recall = (f.recall || []).filter(function (r) { return String(r.q || '').trim(); }).map(function (r, i) {
      return '<p class="wn-q"><strong>Q' + (i + 1) + '.</strong> ' + esc(r.q) + '</p><p class="wn-a"><strong>A.</strong> ' + esc(r.a || '') + '</p>';
    }).join('');
    return '<h1 class="wn-doc-title" data-field="title" contenteditable="true">' + esc(title || 'Untitled study notes') + '</h1>' +
      (meta ? '<table class="wn-meta"><tbody>' + meta + '</tbody></table>' : '') +
      '<h2>Core thesis / big idea</h2><div class="wn-field" data-field="thesis" contenteditable="true">' + paras(f.thesis) + '</div>' +
      section('Key concepts and definitions', concepts ? '<dl class="wn-concepts">' + concepts + '</dl>' : '') +
      section('Memorable quotes', quotes) + section('Visual map', mindMap(f.diagram)) +
      section('Active recall', recall) + section('Summary takeaways', list('ul', lines(f.takeaways)));
  }

  /** Indented lines (2 spaces or a tab per level) become a nested list. O(n). */
  function mindMap(text) {
    var rows = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!rows.length) return '';
    var html = '', depth = -1;
    rows.forEach(function (l) {
      var ind = l.replace(/\t/g, '  ').match(/^ */)[0].length;
      // A line can go at most one level deeper than the one before it.
      var lvl = Math.min(Math.floor(ind / 2), depth + 1);
      if (lvl > depth) { html += '<ul class="wn-map">'; depth = lvl; }
      else {
        while (depth > lvl) { html += '</li></ul>'; depth--; }
        html += '</li>';
      }
      html += '<li>' + esc(l.trim());
    });
    while (depth >= 0) { html += '</li></ul>'; depth--; }
    return html;
  }

  function renderGenerated(doc) {
    if (doc.mode === 'mom') return renderMoM(doc.title, doc.fields.mom);
    if (doc.mode === 'book') return renderBook(doc.title, doc.fields.book);
    return '';
  }

  function docDate(doc) {
    var f = doc.mode === 'mom' ? doc.fields.mom.date : doc.mode === 'book' ? doc.fields.book.date : '';
    if (dates.isValidISO(f)) return f;
    return dates.localISO(new Date(doc.created || Date.now()));
  }

  /** Small record kept separately so lists and the dashboard never load full documents. */
  /** previews (optional, 1.3.0): { blockId: note text } so the summary can carry each referenced note. */
  function deriveMeta(doc, plain, previews) {
    var acts = doc.mode === 'mom' ? (doc.fields.mom.actions || []) : [];
    return {
      id: doc.id, u: doc.u, title: doc.title || (doc.mode === 'book' ? 'Untitled study notes' : doc.mode === 'mom' ? 'Untitled minutes' : 'Untitled document'),
      mode: doc.mode, category: doc.category || 'General', status: doc.status, date: docDate(doc), created: doc.created,
      words: plain === undefined ? 0 : text.countWords(plain),
      actions: acts.filter(function (a) { return String(a.task || '').trim(); }).map(function (a) { return { task: a.task, owner: a.owner || '', due: a.due || '', done: !!a.done }; }),
      refs: previews ? refs.index(doc.refs, previews) : []
    };
  }

  var STATUS_DONE = /^(done|closed|complete|completed|yes|y|true|✓|1)$/i;
  var STATUS_OPEN = /^(open|pending|in progress|ongoing|no|n|false|0|)$/i;

  /** Validate one imported or typed action row. Returns { ok, value } or { ok:false, error }. */
  function validateAction(raw, refYear) {
    var task = String(raw.task || '').trim();
    if (!task) return { ok: false, error: 'Task is empty. Add a short task description.' };
    if (task.length > 500) return { ok: false, error: 'Task is longer than 500 characters. Shorten it.' };
    var due = '';
    if (String(raw.due || '').trim()) {
      var d = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.due).trim()) && dates.isValidISO(String(raw.due).trim()) ? { ok: true, iso: String(raw.due).trim() } : dates.parseDMY(raw.due, refYear);
      if (!d.ok) return { ok: false, error: 'Due date: ' + d.error };
      due = d.iso;
    }
    var st = String(raw.status === undefined ? '' : raw.status).trim();
    var done;
    if (STATUS_DONE.test(st)) done = true; else if (STATUS_OPEN.test(st)) done = false;
    else return { ok: false, error: 'Status "' + st + '" is not recognised. Use Open or Done.' };
    return { ok: true, value: { task: task, owner: String(raw.owner || '').trim().slice(0, 120), due: due, done: done } };
  }

  var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  var ROUTES = new Set(['home', 'docs', 'edit', 'dash', 'guide', 'settings', 'sources']);

  /** Validate the address-bar hash, e.g. #edit/d123. Unknown values fall back to home with a reason. */
  function parseRoute(hash) {
    var h = String(hash || '').replace(/^#\/?/, '');
    if (!h) return { page: 'home' };
    var parts = h.split('/');
    var page = parts[0];
    if (!ROUTES.has(page)) return { page: 'home', error: 'The page "' + page.slice(0, 30) + '" does not exist.' };
    if (page === 'edit') {
      if (parts[1] && !ID_RE.test(parts[1])) return { page: 'docs', error: 'That document link is not valid.' };
      // 1.3.0: #edit/<document>/<note> opens a document at one note (links from the Sources page).
      if (parts[2] !== undefined) {
        if (!refs.BLOCK_ID_RE.test(parts[2])) return { page: 'edit', id: parts[1] || null, error: 'That note link is not valid. Opening the document at the top.' };
        return { page: 'edit', id: parts[1] || null, block: parts[2] };
      }
      return { page: 'edit', id: parts[1] || null };
    }
    // Guide sections live under the guide page (#guide/g-ribbon) so they never collide with page names.
    if (page === 'guide' && parts[1]) {
      if (!/^g-[a-z]{2,20}$/.test(parts[1])) return { page: 'guide', error: 'That guide section does not exist. Showing the top of the guide.' };
      return { page: 'guide', section: parts[1] };
    }
    return { page: page };
  }

  /** Validate a full backup or sync file before any record touches storage. */
  function validateBackup(obj) {
    var errors = [];
    if (!obj || typeof obj !== 'object') return { ok: false, errors: ['The file is not a WrapNote backup (not JSON).'] };
    if (obj.app !== 'wrapnote') return { ok: false, errors: ['The file is not a WrapNote backup (missing app name).'] };
    if (!Array.isArray(obj.records)) return { ok: false, errors: ['The backup has no records list.'] };
    var good = [], warnings = [];
    obj.records.forEach(function (r, i) {
      var where = 'Record ' + (i + 1) + ': ';
      if (!r || typeof r !== 'object') { errors.push(where + 'not an object.'); return; }
      if (!ID_RE.test(String(r.id || ''))) { errors.push(where + 'id is missing or has invalid characters.'); return; }
      if (!Number.isFinite(r.u)) { errors.push(where + 'update time is missing.'); return; }
      if (r.d === 1) { good.push({ id: r.id, d: 1, u: r.u }); return; }
      if (!MODES[r.mode]) { errors.push(where + 'unknown mode "' + String(r.mode).slice(0, 20) + '".'); return; }
      if (typeof r.html !== 'string' || r.html.length > 25e6) { errors.push(where + 'document body is missing or over 25 MB.'); return; }
      if (typeof r.title !== 'string' || r.title.length > 300) { errors.push(where + 'title is missing or over 300 characters.'); return; }
      if (!r.fields || !r.fields.mom || !r.fields.book) { errors.push(where + 'fields are missing.'); return; }
      // Source references (1.3.0): a bad entry is dropped and reported; the document itself is still imported.
      var c = refs.cleanMap(r.refs);
      c.skipped.forEach(function (s) { warnings.push(where + s); });
      if (r.refs !== undefined || c.skipped.length) r = Object.assign({}, r, { refs: c.refs });
      good.push(r);
    });
    return { ok: errors.length === 0, errors: errors, warnings: warnings, records: good };
  }

  var api = {
    VERSION: VERSION, MODES: MODES, uid: uid, newDoc: newDoc, emptyFields: emptyFields, defaultLayout: defaultLayout,
    renderGenerated: renderGenerated, renderMoM: renderMoM, renderBook: renderBook, mindMap: mindMap, actionsTable: actionsTable,
    sortActions: sortActions, deriveMeta: deriveMeta, docDate: docDate, validateAction: validateAction, parseRoute: parseRoute,
    validateBackup: validateBackup, dateLine: dateLine, timeLine: timeLine, lines: lines
  };
  if (isNode) module.exports = api;
  else (g.WN = g.WN || {}).model = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* WrapNote app: shared helpers. All app files share one closure created by the build. */
var D = WN.dates, M = WN.money, S = WN.safe, T = WN.text, MODEL = WN.model;
var esc = S.escapeHtml;
var KEY = 'wrapnote:';
var timings = {}; // last duration (ms) of heavy actions, read by the performance test // unique prefix: every project on one github.io account shares this origin

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

/** Build an element: h('button', {class:'x', onclick: fn}, 'text', child). Text is always set as text. */
function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach(function (k) {
    var v = attrs[k];
    if (v === null || v === undefined || v === false) return;
    if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // only ever passed already-escaped strings
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  });
  for (var i = 2; i < arguments.length; i++) {
    var c = arguments[i];
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

function debounce(fn, ms) {
  var t = null;
  function d() { var a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { t = null; fn.apply(self, a); }, ms); }
  d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
  d.pending = function () { return t !== null; };
  return d;
}

var settings = {
  get: function (k, def) { try { var v = localStorage.getItem(KEY + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } },
  set: function (k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { logError(e, 'settings.set'); } }
};

/* ---------- Error log: on screen, in storage, and next to the data in the sync folder ---------- */
var errorLog = settings.get('errors', []);
function logError(err, where) {
  var entry = { t: D.formatDateTime(new Date()), where: where || '', msg: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 2000) };
  errorLog.push(entry);
  if (errorLog.length > 200) errorLog = errorLog.slice(-200);
  settings.set('errors', errorLog);
  if (typeof Sync !== 'undefined' && Sync.appendLog) Sync.appendLog(entry);
  try { console.error('[WrapNote]', where, err); } catch (e) { /* no console */ }
}
function errorLogText() {
  return errorLog.map(function (e) { return e.t + '  ' + e.where + '  ' + e.msg + (e.stack ? '\n    ' + e.stack.replace(/\n/g, '\n    ') : ''); }).join('\n') + '\n';
}

/* ---------- Toasts ---------- */
function toast(msg, kind, ms) {
  var box = $('#toasts');
  var el = h('div', { class: 'toast ' + (kind || ''), role: kind === 'error' ? 'alert' : 'status' }, msg);
  box.appendChild(el);
  setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 300); }, ms || (kind === 'error' ? 6000 : 2800));
}

/* ---------- Modal dialog builder ----------
 * openDialog({title, body: Node, actions:[{label, primary, onClick}] }) -> {close, el}
 * onClick returning false keeps the dialog open (used for validation errors). */
function openDialog(opts) {
  var dlg = h('dialog', { class: 'dlg' + (opts.wide ? ' wide' : ''), 'aria-labelledby': 'dlg-t' });
  var close = function () { dlg.close(); };
  dlg.addEventListener('close', function () { dlg.remove(); if (opts.onClose) opts.onClose(); });
  var err = h('p', { class: 'dlg-err', role: 'alert' });
  var actions = h('div', { class: 'dlg-actions' });
  (opts.actions || [{ label: 'Close' }]).forEach(function (a) {
    actions.appendChild(h('button', { class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), type: 'button', onclick: function () {
      err.textContent = '';
      var r = a.onClick ? a.onClick(function (m) { err.textContent = m; }) : undefined;
      if (r && typeof r.then === 'function') r.then(function (v) { if (v !== false) close(); });
      else if (r !== false) close();
    } }, a.label));
  });
  dlg.appendChild(h('form', { method: 'dialog', class: 'dlg-inner', onsubmit: function (e) { e.preventDefault(); var p = actions.querySelector('.primary'); if (p) p.click(); } },
    h('header', { class: 'dlg-head' }, h('h2', { id: 'dlg-t' }, opts.title), h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '×')),
    h('div', { class: 'dlg-body' }, opts.body), err, actions));
  document.body.appendChild(dlg);
  dlg.showModal();
  var first = dlg.querySelector('.dlg-body input, .dlg-body select, .dlg-body textarea, .dlg-body button');
  if (first) first.focus();
  return { close: close, el: dlg, error: function (m) { err.textContent = m; } };
}

function confirmDialog(title, message, okLabel, danger) {
  return new Promise(function (resolve) {
    var done = false;
    openDialog({ title: title, body: h('p', null, message), onClose: function () { if (!done) resolve(false); },
      actions: [{ label: 'Cancel' }, { label: okLabel || 'OK', primary: !danger, danger: danger, onClick: function () { done = true; resolve(true); } }] });
  });
}

function field(label, input, hint) {
  var id = input.id || ('f' + Math.random().toString(36).slice(2, 8));
  input.id = id;
  return h('div', { class: 'fld' }, h('label', { for: id }, label), input, hint ? h('small', { class: 'hint' }, hint) : null);
}

function download(name, data, type) {
  var blob = data instanceof Blob ? data : new Blob([data], { type: type || 'text/plain;charset=utf-8' });
  var a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function readFileAs(file, how) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = function () { reject(r.error || new Error('Could not read the file.')); };
    if (how === 'dataurl') r.readAsDataURL(file); else if (how === 'buffer') r.readAsArrayBuffer(file); else r.readAsText(file);
  });
}

/** Timeout plus retry with exponential backoff, so a slow call can never freeze the tool. */
function withRetry(fn, opts) {
  var tries = (opts && opts.tries) || 3, base = (opts && opts.base) || 400, limit = (opts && opts.timeout) || 8000;
  return new Promise(function (resolve, reject) {
    var attempt = 0;
    (function run() {
      attempt++;
      var timer;
      Promise.race([fn(), new Promise(function (_, rej) { timer = setTimeout(function () { rej(new Error('Timed out after ' + limit + ' ms')); }, limit); })])
        .then(function (v) { clearTimeout(timer); resolve(v); }, function (e) {
          clearTimeout(timer);
          if (attempt >= tries) reject(e); else setTimeout(run, base * Math.pow(2, attempt - 1));
        });
    })();
  });
}

function gzip(text) {
  var cs = new CompressionStream('gzip');
  return new Response(new Blob([text]).stream().pipeThrough(cs)).blob();
}
function gunzip(blob) {
  var ds = new DecompressionStream('gzip');
  return new Response(blob.stream().pipeThrough(ds)).text();
}

/** Downscale large pictures so documents stay light. 1600 px is sharp on a printed A4 page. */
function compressImage(dataUrl, maxW) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, hgt = img.naturalHeight, lim = maxW || 1600;
      if (w <= lim && dataUrl.length < 600000) { resolve(dataUrl); return; }
      var scale = Math.min(1, lim / w);
      var c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(hgt * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var png = /^data:image\/png/.test(dataUrl);
      resolve(c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = function () { resolve(dataUrl); };
    img.src = dataUrl;
  });
}

/** Plain text with a line break between blocks. The same function counts words on the page, in storage and
 * after import, so every count agrees. O(n) over text nodes. */
var BLOCK_RE = /^(P|LI|H[1-6]|TD|TH|DT|DD|BLOCKQUOTE|PRE|DIV|SECTION|TR|FIGCAPTION|NAV)$/;
function plainText(root) {
  var out = [], w = (root.ownerDocument || document).createTreeWalker(root, NodeFilter.SHOW_TEXT), n, lastBlock = null;
  while ((n = w.nextNode())) {
    var b = n.parentNode;
    while (b && b !== root && !BLOCK_RE.test(b.tagName)) b = b.parentNode;
    if (b !== lastBlock) { out.push('\n'); lastBlock = b; }
    out.push(n.data);
  }
  return out.join('').trim();
}

function isPhone() { return window.matchMedia('(max-width: 760px)').matches; }

/* ---------- HTML sanitiser (allow-list) for pasted, imported and synced content ---------- */
var SAN_TAGS = new Set(('p br div span b strong i em u s strike sub sup mark small h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code hr a img ' +
  'table thead tbody tfoot tr th td caption colgroup col figure figcaption dl dt dd section header footer nav ins del label ' +
  'math mrow mi mn mo mfrac msqrt mroot msup msub msubsup munder mover munderover mtext mspace mstyle ' +
  'svg g rect circle ellipse line polyline polygon path text tspan defs marker title').split(' '));
var SAN_DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'template', 'noscript', 'form', 'input', 'button', 'select', 'textarea', 'base', 'frame', 'frameset', 'applet', 'audio', 'video', 'source', 'foreignobject']);
var SAN_ATTR = new Set(('class style href src alt title colspan rowspan contenteditable display mathvariant stretchy largeop accent width height linebreak xmlns ' +
  'viewbox x y x1 y1 x2 y2 cx cy r rx ry d points fill stroke stroke-width stroke-dasharray stroke-linecap stroke-linejoin transform text-anchor font-size font-weight ' +
  'marker-end refx refy markerwidth markerheight orient preserveaspectratio opacity fill-opacity dominant-baseline role aria-label aria-hidden id spellcheck').split(' '));
var SAN_DATA = /^data-(field|gen|block|btype|labels|cid|author|time|tex|chart|fn|text|kind|levels|source|mode|wn-id|label|shape|wrap|display|summary|layout)$/;

function sanitizeHtml(html) {
  var doc = new DOMParser().parseFromString('<!doctype html><body>' + String(html || ''), 'text/html');
  (function walk(node) {
    var kids = Array.prototype.slice.call(node.childNodes);
    kids.forEach(function (n) {
      if (n.nodeType === 8) { n.remove(); return; }
      if (n.nodeType !== 1) return;
      var tag = n.localName;
      if (SAN_DROP.has(tag)) { n.remove(); return; }
      if (!SAN_TAGS.has(tag)) { walk(n); while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); return; }
      Array.prototype.slice.call(n.attributes).forEach(function (a) {
        var name = a.name.toLowerCase(), v = a.value;
        var keep = SAN_ATTR.has(name) || SAN_DATA.test(name);
        if (name.slice(0, 2) === 'on') keep = false;
        if (name === 'href') keep = tag === 'a' && S.isSafeUrl(v);
        if (name === 'src') keep = tag === 'img' && S.isSafeImageSrc(v);
        if (name === 'id') keep = /^wn-[\w-]{1,60}$/.test(v);
        if (name === 'contenteditable') keep = v === 'true' || v === 'false';
        if (keep && name === 'style') { var c = S.cleanStyle(v); if (c) n.setAttribute('style', c); else n.removeAttribute('style'); return; }
        if (!keep) n.removeAttribute(a.name);
      });
      if (tag === 'a') { n.setAttribute('rel', 'noopener noreferrer'); }
      walk(n);
    });
  })(doc.body);
  return doc.body.innerHTML;
}

/** Category colours follow the name, never the rank, so a category keeps its colour as counts change. */
var PALETTE = ['#059669', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#dc2626', '#475569', '#9333ea'];
function colorFor(name) {
  var hsh = 0, s = String(name);
  for (var i = 0; i < s.length; i++) hsh = (hsh * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[hsh % PALETTE.length];
}

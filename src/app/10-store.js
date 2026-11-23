/* WrapNote app: local storage in IndexedDB.
 * Two stores: "docs" holds full documents (and tombstones), "meta" holds small summaries.
 * Lists and the dashboard read only "meta", so opening the app never loads every picture (memory saver).
 * Lookups by id use the object store key or the in-memory Map: O(1), never a list scan.
 */
var Store = (function () {
  var DB_NAME = 'wrapnote-v1', db = null, memory = null;
  var metaMap = new Map();
  var listeners = [];

  function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function tx(names, mode) { return db.transaction(names, mode || 'readonly'); }
  function done(t) { return new Promise(function (res, rej) { t.oncomplete = function () { res(); }; t.onerror = t.onabort = function () { rej(t.error || new Error('Storage write failed')); }; }); }

  function open() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) { memory = { docs: new Map(), kv: new Map() }; resolve(); return; }
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      };
      r.onsuccess = function () { db = r.result; resolve(); };
      r.onerror = function () { logError(r.error, 'Store.open'); memory = { docs: new Map(), kv: new Map() }; resolve(); };
    }).then(loadMetas);
  }

  function loadMetas() {
    metaMap.clear();
    if (memory) { memory.docs.forEach(function (d) { if (!d.d) metaMap.set(d.id, metaOf(d)); }); return; }
    return req(tx(['meta']).objectStore('meta').getAll()).then(function (list) { list.forEach(function (m) { metaMap.set(m.id, m); }); });
  }

  /** Plain text of stored HTML without running scripts or loading images (inert DOMParser document). */
  function plainOf(html) {
    if (!html) return '';
    var d = new DOMParser().parseFromString('<body>' + html, 'text/html');
    return plainText(d.body);
  }

  function emit(ids, source) { listeners.forEach(function (fn) { try { fn(ids, source); } catch (e) { logError(e, 'Store.listener'); } }); }

  function getDoc(id) {
    if (memory) return Promise.resolve(memory.docs.get(id) || null);
    return req(tx(['docs']).objectStore('docs').get(id)).then(function (d) { return d && !d.d ? d : null; });
  }

  /** Save a document and its summary in one transaction. u only moves forward. */
  /** Text of each referenced note, read from stored HTML (for documents that are not open in the editor). */
  function previewsOf(doc) {
    var out = {}, ids = Object.keys(doc.refs || {});
    if (!ids.length || !doc.html) return out;
    var d = new DOMParser().parseFromString('<body>' + doc.html, 'text/html');
    // 1.4.0: a placed tag belongs to the paragraph it sits in; a 1.3.0 tag to its note.
    var am = SourceRefs.anchorMap(d.body);
    ids.forEach(function (id) {
      var a = am[id], b = a ? citeHolder(a, d.body) : d.body.querySelector('[data-block="' + id + '"]'); if (!b) return;
      b = b.cloneNode(true);
      $$('.wn-cite, .wn-labels', b).forEach(function (x) { x.remove(); });
      out[id] = (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200) || (b.querySelector('img') ? b.querySelectorAll('img').length + ' picture(s)' : b.querySelector('table') ? 'Table' : '');
    });
    return out;
  }
  function metaOf(doc, plain, previews) { return MODEL.deriveMeta(doc, plain === undefined ? plainOf(doc.html) : plain, previews || previewsOf(doc)); }

  function putDoc(doc, plain, previews) {
    var prev = metaMap.get(doc.id);
    doc.u = Math.max(Date.now(), (prev && prev.u || 0) + 1, (doc.u || 0) + 1);
    var meta = metaOf(doc, plain, previews);
    metaMap.set(doc.id, meta);
    var p;
    if (memory) { memory.docs.set(doc.id, JSON.parse(JSON.stringify(doc))); p = Promise.resolve(); }
    else {
      var t = tx(['docs', 'meta'], 'readwrite');
      t.objectStore('docs').put(doc); t.objectStore('meta').put(meta);
      p = done(t);
    }
    return p.then(function () { emit([doc.id], 'local'); if (typeof Sync !== 'undefined') Sync.schedule(); return doc; });
  }

  function deleteDoc(id) {
    metaMap.delete(id);
    var tomb = WN.merge.tombstone(id, Date.now());
    var p;
    if (memory) { memory.docs.set(id, tomb); p = Promise.resolve(); }
    else { var t = tx(['docs', 'meta'], 'readwrite'); t.objectStore('docs').put(tomb); t.objectStore('meta').delete(id); p = done(t); }
    return p.then(function () { emit([id], 'local'); if (typeof Sync !== 'undefined') Sync.schedule(); });
  }

  function allRecords() {
    if (memory) return Promise.resolve(Array.from(memory.docs.values()));
    return req(tx(['docs']).objectStore('docs').getAll());
  }

  /** Merge incoming records (sync or backup import). Returns the ids that changed. O(n) with keyed gets. */
  function applyRecords(records) {
    return allRecords().then(function (local) {
      var map = new Map(local.map(function (r) { return [r.id, r]; }));
      var changed = [];
      records.forEach(function (r) {
        var cur = map.get(r.id);
        var win = WN.merge.winner(cur, r);
        if (win !== cur && (!cur || WN.merge.canonical(win) !== WN.merge.canonical(cur))) { changed.push(win); map.set(r.id, win); }
      });
      if (!changed.length) return [];
      changed.forEach(function (r) { if (!r.d) r.html = sanitizeHtml(r.html); });
      var p;
      if (memory) { changed.forEach(function (r) { memory.docs.set(r.id, r); }); p = Promise.resolve(); }
      else {
        var t = tx(['docs', 'meta'], 'readwrite');
        changed.forEach(function (r) {
          t.objectStore('docs').put(r);
          if (r.d) t.objectStore('meta').delete(r.id); else t.objectStore('meta').put(metaOf(r));
        });
        p = done(t);
      }
      return p.then(function () {
        changed.forEach(function (r) { if (r.d) metaMap.delete(r.id); else metaMap.set(r.id, metaOf(r)); });
        var ids = changed.map(function (r) { return r.id; });
        emit(ids, 'remote');
        return ids;
      });
    });
  }

  function kvGet(k) { if (memory) return Promise.resolve(memory.kv.get(k)); return req(tx(['kv']).objectStore('kv').get(k)); }
  function kvSet(k, v) {
    if (memory) { memory.kv.set(k, v); return Promise.resolve(); }
    var t = tx(['kv'], 'readwrite'); t.objectStore('kv').put(v, k); return done(t);
  }

  function metas() { return Array.from(metaMap.values()); }
  function meta(id) { return metaMap.get(id) || null; }
  function onChange(fn) { listeners.push(fn); }
  function isMemoryOnly() { return !!memory; }

  return { open: open, getDoc: getDoc, putDoc: putDoc, deleteDoc: deleteDoc, allRecords: allRecords, applyRecords: applyRecords,
    kvGet: kvGet, kvSet: kvSet, metas: metas, meta: meta, onChange: onChange, plainOf: plainOf, isMemoryOnly: isMemoryOnly };
})();

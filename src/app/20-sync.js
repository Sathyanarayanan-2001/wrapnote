/* WrapNote app: sync through a folder (for example a OneDrive folder) chosen with showDirectoryPicker.
 * Each session writes one gzip JSON save file, keeps this device's newest 3, and merges every other save per record.
 * Writes happen about 3 s after a change and when the page is hidden; closing a tab is never relied on.
 * All folder work runs through one queue, so a pull always waits for a write that is still running.
 */
var Sync = (function () {
  var FILE_RE = /^wrapnote-save-([A-Za-z0-9]+)-(\d{14})\.json\.gz$/;
  var KEEP = 3;
  var dir = null, state = 'local', lastError = '', lastSync = 0;
  var device = settings.get('device', null);
  if (!device) { device = 'dev' + Math.random().toString(36).slice(2, 10); settings.set('device', device); }
  var stamp = (function () { var d = new Date(); return '' + d.getFullYear() + D.pad2(d.getMonth() + 1) + D.pad2(d.getDate()) + D.pad2(d.getHours()) + D.pad2(d.getMinutes()) + D.pad2(d.getSeconds()); })();
  var sessionFile = 'wrapnote-save-' + device + '-' + stamp + '.json.gz';
  var seen = new Map(); // file name -> lastModified already merged
  var queue = Promise.resolve();
  var localPending = 0;
  var logBuffer = [];

  function supported() { return typeof window.showDirectoryPicker === 'function'; }

  function setState(s, err) {
    state = s; if (err !== undefined) lastError = err;
    render();
  }

  function render() {
    var pill = $('#syncPill');
    if (!pill) return;
    var label, cls;
    if (localPending > 0) { label = 'Saving…'; cls = 'busy'; }
    else if (state === 'saving') { label = 'Saving…'; cls = 'busy'; }
    else if (state === 'waiting') { label = 'Changes waiting'; cls = 'wait'; }
    else if (state === 'access') { label = 'Folder access needed'; cls = 'warn'; }
    else if (state === 'problem') { label = 'Sync problem'; cls = 'bad'; }
    else if (state === 'saved') { label = 'Saved and synced'; cls = 'ok'; }
    else { label = 'Saved on this device'; cls = 'ok'; }
    pill.className = 'sync-pill ' + cls;
    $('.txt', pill).textContent = label;
    pill.title = state === 'problem' ? 'Sync problem: ' + lastError + '. Select to retry.' : state === 'access' ? 'Select to allow access to your sync folder again.' : lastSync ? 'Last sync ' + D.formatStamp(lastSync) : 'Documents are saved in this browser.';
    var s = $('#syncStatusText');
    if (s) s.textContent = label + (lastSync ? ' · last sync ' + D.formatStamp(lastSync) : '') + (state === 'problem' ? ' · ' + lastError : '');
  }

  function enqueue(fn) {
    var p = queue.then(fn, fn);
    queue = p.catch(function () { /* keep the chain alive */ });
    return p;
  }

  function localSaving(delta) { localPending = Math.max(0, localPending + delta); render(); }

  function init() {
    render();
    if (!supported()) return Promise.resolve();
    return Store.kvGet('syncDir').then(function (handle) {
      if (!handle) return;
      dir = handle;
      return dir.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p === 'granted') return runNow();
        setState('access');
      });
    }).catch(function (e) { logError(e, 'Sync.init'); setState('problem', e.message); });
  }

  function choose() {
    if (!supported()) { toast('This browser cannot open folders. Use Chrome or Edge on a computer, or use Export and Import.', 'error'); return Promise.resolve(); }
    return window.showDirectoryPicker({ id: 'wrapnote-sync', mode: 'readwrite' }).then(function (handle) {
      dir = handle;
      return Store.kvSet('syncDir', handle).then(function () { toast('Sync folder set: ' + handle.name); return runNow(); });
    }).catch(function (e) { if (e && e.name === 'AbortError') return; logError(e, 'Sync.choose'); toast('Could not open the folder: ' + e.message, 'error'); });
  }

  function regrant() {
    if (!dir) return choose();
    return dir.requestPermission({ mode: 'readwrite' }).then(function (p) {
      if (p === 'granted') return runNow();
      setState('access');
    }).catch(function (e) { logError(e, 'Sync.regrant'); setState('problem', e.message); });
  }

  function disconnect() { dir = null; return Store.kvSet('syncDir', null).then(function () { setState('local'); }); }

  var scheduled = debounce(function () { runNow(); }, 3000);
  function schedule() { if (!dir) return; if (state !== 'access') setState('waiting'); scheduled(); }

  function runNow() {
    if (!dir) return Promise.resolve();
    return enqueue(function () {
      return dir.queryPermission({ mode: 'readwrite' }).then(function (p) {
        if (p !== 'granted') { setState('access'); return; }
        setState('saving');
        return pull().then(push).then(flushLog).then(function () { lastSync = Date.now(); setState('saved', ''); });
      }).catch(function (e) { logError(e, 'Sync.run'); setState('problem', e.message || String(e)); });
    });
  }

  function listSaves() {
    var out = [];
    var it = dir.entries();
    return (function next() {
      return it.next().then(function (r) {
        if (r.done) return out;
        var name = r.value[0], handle = r.value[1];
        if (handle.kind === 'file' && FILE_RE.test(name)) out.push({ name: name, handle: handle, device: FILE_RE.exec(name)[1], stamp: FILE_RE.exec(name)[2] });
        return next();
      });
    })();
  }

  /** Merge every save file not yet seen. A file that cannot be read yet is skipped and retried next time. */
  function pull() {
    return listSaves().then(function (files) {
      var records = [];
      return files.reduce(function (p, f) {
        if (f.name === sessionFile) return p;
        return p.then(function () {
          return f.handle.getFile().then(function (file) {
            if (seen.get(f.name) === file.lastModified) return;
            return gunzip(file).then(function (txt) {
              var data = JSON.parse(txt);
              var v = MODEL.validateBackup(data);
              if (!v.records.length && !v.ok) throw new Error(v.errors[0] || 'Unreadable save file');
              records = records.concat(v.records);
              seen.set(f.name, file.lastModified);
            });
          }).catch(function (e) { logError(e, 'Sync.pull skipped ' + f.name); });
        });
      }, Promise.resolve()).then(function () { return records.length ? Store.applyRecords(records) : []; });
    });
  }

  function push() {
    return Store.allRecords().then(function (records) {
      var payload = JSON.stringify({ app: 'wrapnote', v: 1, device: device, t: Date.now(), records: records });
      return gzip(payload);
    }).then(function (blob) {
      return dir.getFileHandle(sessionFile, { create: true }).then(function (fh) {
        return fh.createWritable().then(function (w) { return w.write(blob).then(function () { return w.close(); }); });
      });
    }).then(prune);
  }

  /** Keep this device's newest 3 save files; other devices prune their own. */
  function prune() {
    return listSaves().then(function (files) {
      var mine = files.filter(function (f) { return f.device === device; }).sort(function (a, b) { return b.stamp.localeCompare(a.stamp) || b.name.localeCompare(a.name); });
      return Promise.all(mine.slice(KEEP).map(function (f) { return dir.removeEntry(f.name).catch(function (e) { logError(e, 'Sync.prune'); }); }));
    });
  }

  function appendLog(entry) { logBuffer.push(entry); }

  /** Error log written next to the data, with time and stack trace. */
  function flushLog() {
    if (!logBuffer.length || !dir) return Promise.resolve();
    var lines = logBuffer.map(function (e) { return e.t + '  [' + device + ']  ' + e.where + '  ' + e.msg + (e.stack ? '\n    ' + e.stack.replace(/\n/g, '\n    ') : ''); }).join('\n') + '\n';
    logBuffer = [];
    return dir.getFileHandle('wrapnote-errors.log', { create: true }).then(function (fh) {
      return fh.getFile().then(function (f) { return f.text(); }).then(function (old) {
        var text = (old + lines).slice(-200000); // cap at about 200 KB
        return fh.createWritable().then(function (w) { return w.write(text).then(function () { return w.close(); }); });
      });
    }).catch(function () { /* logging must never break sync */ });
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { if (scheduled.pending()) scheduled.flush(); }
    else if (dir && state !== 'access') runNow();
  });
  setInterval(function () { if (dir && document.visibilityState === 'visible' && state !== 'access') runNow(); }, 60000);

  return { init: init, choose: choose, regrant: regrant, disconnect: disconnect, schedule: schedule, runNow: runNow, render: render,
    supported: supported, appendLog: appendLog, localSaving: localSaving, folderName: function () { return dir ? dir.name : ''; }, state: function () { return state; } };
})();

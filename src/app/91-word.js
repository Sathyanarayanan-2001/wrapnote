/* WrapNote app: loader for the Word engine (word.js). Export to Word and template import load it on first use;
 * the service worker caches it in the background on the first visit, so it also works offline later.
 * Reading or removing the stored template needs only the local store, so those never load the engine. */
var Docx = (function () {
  var loading = null, TPL_KEY = 'wordTemplate';
  function load() {
    if (WN.Docx) return Promise.resolve(WN.Docx);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'word.js'; s.async = true; // no query string, so the service worker's cached copy matches offline
      s.onload = function () { WN.Docx ? resolve(WN.Docx) : reject(new Error('the Word engine did not start')); };
      s.onerror = function () { s.remove(); loading = null; reject(new Error('the Word engine could not be loaded. Connect once to the internet and try again')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  return {
    load: load,
    exportDocx: function (name) { return load().then(function (D) { return D.exportDocx(name); }); },
    importTemplate: function (file) { return load().then(function (D) { return D.importTemplate(file); }); },
    storedTemplate: function () { return Store.kvGet(TPL_KEY).then(function (t) { return t && t.parts ? t : null; }); },
    removeTemplate: function () { return Store.kvSet(TPL_KEY, null); }
  };
})();

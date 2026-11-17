/* WrapNote app: OCR (optical character recognition: reading text from a picture).
 * Version 1.0.0 relied only on the browser's TextDetector, which desktop Chrome, Edge, Firefox and Safari
 * do not ship, so text extraction failed for most people. Now:
 *   1. Tesseract (an open-source text reader, compiled to WebAssembly) is loaded from this site's own
 *      ocr/ folder, only when text is first requested. It never touches the network beyond this site,
 *      sends no picture anywhere, and the service worker keeps it for offline use after the first run.
 *   2. If it cannot load (offline before first use, very old browser), the lighter built-in TextDetector is tried.
 *   3. If neither works, the picture is kept and the person types the text.
 * The engine stays loaded after the first use, so later screenshots skip the start-up cost.
 */
var OCR = (function () {
  var BASE = 'ocr/';
  var worker = null, starting = null, lastError = '', progressFn = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.Tesseract) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { s.remove(); reject(new Error('the text reader files could not be loaded')); };
      document.head.appendChild(s);
    });
  }

  function engine() {
    if (worker) return Promise.resolve(worker);
    if (starting) return starting;
    starting = withRetry(function () { return loadScript(BASE + 'tesseract.min.js'); }, { tries: 2, timeout: 30000 })
      .then(function () {
        if (!window.Tesseract || typeof window.Tesseract.createWorker !== 'function') throw new Error('the text reader did not start');
        // OEM 1 = LSTM neural network only: the smaller language file and the fastest accurate mode.
        // workerBlobURL false: the worker loads from this site, so the page's security policy needs no blob: exception.
        // cacheMethod none: the service worker caches the files under our own "wrapnote-" name instead of a shared database.
        return withRetry(function () {
          return window.Tesseract.createWorker('eng', 1, {
            workerPath: BASE + 'worker.min.js', corePath: BASE, langPath: BASE, gzip: true, cacheMethod: 'none', workerBlobURL: false,
            logger: function (m) { if (progressFn && m && typeof m.progress === 'number') progressFn(label(m)); },
            errorHandler: function (e) { logError(e, 'OCR worker'); }
          });
        }, { tries: 1, timeout: 90000 });
      })
      .then(function (w) { worker = w; starting = null; return w; })
      .catch(function (e) { starting = null; lastError = String(e && e.message || e); logError(e, 'OCR engine'); throw e; });
    return starting;
  }

  function label(m) {
    var pct = Math.round(m.progress * 100);
    if (/recogniz/i.test(m.status)) return 'Reading text… ' + pct + '%';
    return 'Preparing the text reader (first use only)… ' + pct + '%';
  }

  function linesOf(data) {
    var out = [];
    (data.blocks || []).forEach(function (b) { (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { out.push({ text: l.text, confidence: l.confidence }); }); }); });
    if (!out.length && data.text) out = data.text.split(/\n+/).map(function (t) { return { text: t, confidence: data.confidence }; });
    return out;
  }

  function withTesseract(urls) {
    return engine().then(function (w) {
      return urls.reduce(function (p, u, i) {
        return p.then(function (acc) {
          if (progressFn) progressFn('Reading text… screenshot ' + (i + 1) + ' of ' + urls.length);
          return withRetry(function () { return w.recognize(u, {}, { blocks: true, text: true }); }, { tries: 1, timeout: 120000 }).then(function (r) {
            var c = WN.pictures.cleanOcr(linesOf(r.data || {}));
            acc.push({ text: c.text, engine: 'tesseract' });
            return acc;
          }).catch(function (e) { logError(e, 'OCR recognize'); lastError = String(e && e.message || e); acc.push({ text: '', engine: 'tesseract' }); return acc; });
        });
      }, Promise.resolve([]));
    });
  }

  function withDetector(urls) {
    if (typeof window.TextDetector !== 'function') return Promise.reject(new Error('no built-in text detector'));
    var det = new window.TextDetector();
    return Promise.all(urls.map(function (u) {
      return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = u; }).then(function (img) {
        if (!img) return { text: '', engine: 'detector' };
        return withRetry(function () { return det.detect(img); }, { tries: 2, timeout: 15000 }).then(function (blocks) {
          // Reading order: top to bottom, then left to right.
          blocks.sort(function (a, b) { return (a.boundingBox.top - b.boundingBox.top) || (a.boundingBox.left - b.boundingBox.left); });
          return { text: WN.pictures.cleanOcr(blocks.map(function (b) { return { text: b.rawValue, confidence: 100 }; })).text, engine: 'detector' };
        }).catch(function (e) { logError(e, 'TextDetector'); return { text: '', engine: 'detector' }; });
      });
    }));
  }

  /** Returns one { text, engine } per picture, in order. Never rejects: failure gives empty text. */
  function extract(urls, onProgress) {
    progressFn = onProgress || null;
    lastError = '';
    var t0 = performance.now();
    return withTesseract(urls).catch(function () { return withDetector(urls); })
      .catch(function (e) { lastError = lastError || String(e && e.message || e); return urls.map(function () { return { text: '', engine: 'none' }; }); })
      .then(function (res) { progressFn = null; timings.ocr = performance.now() - t0; return res; });
  }

  function failureMessage() {
    if (lastError) return 'Text extraction could not run here (' + lastError + '). The screenshot was kept; type the text in the box below it. Text extraction works offline once it has run while online.';
    return 'No readable text was found in the screenshot. The picture was kept; type the text in the box below it.';
  }

  function ready() { return !!worker; }

  return { extract: extract, failureMessage: failureMessage, ready: ready, engine: engine };
})();

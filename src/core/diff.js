/* WrapNote core: word diff for "Compare two revisions".
 * Myers' algorithm: time O((N+M)·D), memory O(D²) where D is the number of edits.
 * Common prefix and suffix are trimmed first (O(N+M)), which removes most work for typical revisions.
 * Above MAX_D edits the middle is reported as one delete plus one insert, so the page never freezes.
 */
(function (g) {
  'use strict';

  var MAX_D = 2000; // trace memory is O(D^2): 2,000 edits ~ 16 MB at most

  function tokenize(text) { return String(text || '').match(/\s+|[^\s]+/g) || []; }

  function push(out, op, text) {
    if (!text) return;
    var last = out[out.length - 1];
    if (last && last.op === op) last.text += text; else out.push({ op: op, text: text });
  }

  function diffTokens(a, b) {
    var out = [];
    var pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
    var suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
    push(out, '=', a.slice(0, pre).join(''));
    var A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf);
    var mid = myers(A, B);
    for (var i = 0; i < mid.length; i++) push(out, mid[i].op, mid[i].text);
    push(out, '=', a.slice(a.length - suf).join(''));
    return out;
  }

  function myers(A, B) {
    var N = A.length, M = B.length, max = N + M;
    if (!N && !M) return [];
    if (!N) return [{ op: '+', text: B.join('') }];
    if (!M) return [{ op: '-', text: A.join('') }];
    var off = max + 1;
    var V = new Int32Array(2 * max + 3);
    var trace = [];
    var found = -1;
    for (var d = 0; d <= Math.min(max, MAX_D); d++) {
      // Keep only the band k in [-d-1, d+1]; older diagonals are never read again.
      trace.push(V.slice(off - d - 1, off + d + 2));
      for (var k = -d; k <= d; k += 2) {
        var x;
        if (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) x = V[off + k + 1];
        else x = V[off + k - 1] + 1;
        var y = x - k;
        while (x < N && y < M && A[x] === B[y]) { x++; y++; }
        V[off + k] = x;
        if (x >= N && y >= M) { found = d; break; }
      }
      if (found >= 0) break;
    }
    if (found < 0) return [{ op: '-', text: A.join('') }, { op: '+', text: B.join('') }];
    // Walk the trace backwards to recover the edit script.
    var ops = [];
    var cx = N, cy = M;
    for (var dd = found; dd > 0; dd--) {
      var Vp = trace[dd], base = dd + 1;
      var kk = cx - cy;
      var prevK = (kk === -dd || (kk !== dd && Vp[base + kk - 1] < Vp[base + kk + 1])) ? kk + 1 : kk - 1;
      var px = Vp[base + prevK], py = px - prevK;
      while (cx > px && cy > py) { ops.push({ op: '=', text: A[cx - 1] }); cx--; cy--; }
      if (cx === px) ops.push({ op: '+', text: B[cy - 1] }); else ops.push({ op: '-', text: A[cx - 1] });
      cx = px; cy = py;
    }
    while (cx > 0 && cy > 0) { ops.push({ op: '=', text: A[cx - 1] }); cx--; cy--; }
    ops.reverse();
    var out = [];
    for (var i = 0; i < ops.length; i++) push(out, ops[i].op, ops[i].text);
    return out;
  }

  function diffText(a, b) { return diffTokens(tokenize(a), tokenize(b)); }

  function stats(ops) {
    var s = { added: 0, removed: 0 };
    ops.forEach(function (o) {
      var w = (o.text.match(/\S+/g) || []).length;
      if (o.op === '+') s.added += w; else if (o.op === '-') s.removed += w;
    });
    return s;
  }

  var api = { diffText: diffText, diffTokens: diffTokens, tokenize: tokenize, stats: stats };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).diff = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

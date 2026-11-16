/* WrapNote core: text counting, case changes, local polish and grammar hints.
 * All rules run on this device; no text leaves the browser.
 */
(function (g) {
  'use strict';

  var WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;

  function countWords(text) { var m = String(text || '').match(WORD_RE); return m ? m.length : 0; }
  function countChars(text, withSpaces) {
    var s = String(text || '');
    // Array.from counts emoji and other astral characters once, not twice.
    return withSpaces === false ? Array.from(s.replace(/\s+/g, '')).length : Array.from(s).length;
  }

  var SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'vs', 'via', 'with']);

  function titleCase(s) {
    var i = 0;
    return String(s).replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, function (w) {
      var lower = w.toLowerCase();
      var first = i++ === 0;
      if (!first && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    });
  }

  function sentenceCase(s) {
    var start = true;
    return String(s).toLowerCase().replace(/[\s\S]/g, function (c) {
      if (start && /\p{L}/u.test(c)) { start = false; return c.toUpperCase(); }
      if (/[.!?]/.test(c)) start = true;
      return c;
    }).replace(/\bi\b/g, 'I');
  }

  /**
   * Change case of a string. For sentence case across text-node boundaries the caller passes
   * state.start so a sentence that spans two nodes stays consistent.
   */
  function changeCase(s, mode) {
    switch (mode) {
      case 'upper': return String(s).toUpperCase();
      case 'lower': return String(s).toLowerCase();
      case 'title': return titleCase(s);
      case 'sentence': return sentenceCase(s);
      default: return String(s);
    }
  }

  /** Light, predictable clean-up used by "Confirm end of document". Never rewrites meaning. */
  function polishText(s) {
    var t = String(s || '');
    t = t.replace(/[ \t\u00a0]{2,}/g, ' ');      // double spaces (browsers type the second as a no-break space)
    t = t.replace(/\s+([,.;:!?])/g, '$1');        // space before punctuation
    t = t.replace(/([,;:])(?=[^\s\d"'’)\]])/g, '$1 '); // missing space after , ; :
    t = t.replace(/(^|[.!?]\s+)([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); });
    t = t.replace(/\bi\b/g, 'I');
    t = t.replace(/\b(\w+) \1\b/gi, function (m, w) { return /^(that|had|is)$/i.test(w) ? m : w; });
    return t;
  }

  var AN_EXCEPT = /^(hour|honest|honour|honor|heir|herb)/i;     // silent h -> "an"
  var A_EXCEPT = /^(uni|use|usu|euro|one|once|u[bcfhjkqrstn][aeiou])/i; // "you"/"won" sound -> "a"

  /** Returns [{type, message, start, end}] for the plain text. O(n). */
  function grammarIssues(text) {
    var s = String(text || '');
    var out = [];
    var m;
    var rep = /\b(\p{L}+)\s+\1\b/giu;
    while ((m = rep.exec(s))) {
      if (!/^(that|had)$/i.test(m[1])) out.push({ type: 'Repeated word', message: 'Repeated "' + m[1] + '". Delete one.', start: m.index, end: m.index + m[0].length });
    }
    var dbl = /[ \u00a0]{2,}/g;
    while ((m = dbl.exec(s))) out.push({ type: 'Spacing', message: 'Two or more spaces in a row. Use one space.', start: m.index, end: m.index + m[0].length });
    var art = /\b(a|an)\s+(\p{L}+)/giu;
    while ((m = art.exec(s))) {
      var w = m[2], vowel = /^[aeiou]/i.test(w);
      var needsAn = (vowel && !A_EXCEPT.test(w)) || AN_EXCEPT.test(w);
      if (m[1].toLowerCase() === 'a' && needsAn) out.push({ type: 'Article', message: 'Use "an" before "' + w + '".', start: m.index, end: m.index + m[0].length });
      if (m[1].toLowerCase() === 'an' && !needsAn) out.push({ type: 'Article', message: 'Use "a" before "' + w + '".', start: m.index, end: m.index + m[0].length });
    }
    var cap = /[.!?]\s+([a-z])/g;
    while ((m = cap.exec(s))) out.push({ type: 'Capital letter', message: 'Start the sentence with a capital letter.', start: m.index + m[0].length - 1, end: m.index + m[0].length });
    var sp = /[,;](?=[A-Za-z])/g;
    while ((m = sp.exec(s))) out.push({ type: 'Spacing', message: 'Add a space after the comma or semicolon.', start: m.index, end: m.index + 1 });
    out.sort(function (a, b) { return a.start - b.start || a.end - b.end || a.type.localeCompare(b.type); });
    return out;
  }

  /** Rough English syllable split for the immersive reader. Approximate by design. */
  function syllables(word) {
    var w = String(word);
    if (w.length <= 3) return [w];
    var parts = w.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy](?=[^aeiouy]))?/gi);
    if (!parts) return [w];
    var joined = parts.join('');
    if (joined.length < w.length) parts[parts.length - 1] += w.slice(joined.length);
    // A trailing silent "e" is not its own syllable.
    if (parts.length > 1 && /^[^aeiouy]*e$/i.test(parts[parts.length - 1])) { var last = parts.pop(); parts[parts.length - 1] += last; }
    return parts;
  }

  /** Extractive summary: first sentence of each non-empty paragraph, up to max. O(n). */
  function summarise(paragraphs, max) {
    var out = [];
    for (var i = 0; i < paragraphs.length && out.length < (max || 5); i++) {
      var p = String(paragraphs[i] || '').trim();
      if (countWords(p) < 6) continue;
      var s = p.match(/^[\s\S]*?[.!?](?=\s|$)/);
      out.push((s ? s[0] : p).slice(0, 240));
    }
    return out;
  }

  var api = { countWords: countWords, countChars: countChars, changeCase: changeCase, titleCase: titleCase, sentenceCase: sentenceCase, polishText: polishText, grammarIssues: grammarIssues, syllables: syllables, summarise: summarise };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).text = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

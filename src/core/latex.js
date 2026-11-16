/* WrapNote core: small LaTeX -> MathML converter for the equation builder.
 * Why not KaTeX: it adds about 300 KB of script and fonts, which breaks the 2-second load budget.
 * Browsers render MathML natively (Chrome 109+, Firefox, Safari), so a subset converter is enough
 * for fractions, roots, powers, sums, integrals, Greek letters and common symbols.
 * Recursive descent; O(n) in the length of the source.
 */
(function (g) {
  'use strict';

  var GREEK = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ',
    iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ',
    upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
  };
  var OPS = {
    cdot: '⋅', times: '×', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠',
    approx: '≈', equiv: '≡', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐',
    leftrightarrow: '↔', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩', forall: '∀',
    exists: '∃', propto: '∝', ldots: '…', cdots: '⋯', angle: '∠', perp: '⊥', parallel: '∥', circ: '∘',
    ast: '∗', star: '⋆', sim: '∼', ll: '≪', gg: '≫', mid: '∣', degree: '°'
  };
  var IDENT = { infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', ell: 'ℓ', emptyset: '∅' };
  var BIG = { sum: '∑', prod: '∏', int: '∫', iint: '∬', oint: '∮', bigcup: '⋃', bigcap: '⋂' };
  var FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'exp', 'max', 'min', 'lim', 'det', 'arg', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan']);
  var ACCENT = { overline: '¯', bar: '¯', vec: '→', hat: '^', dot: '˙', tilde: '~' };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function Parser(src) { this.s = String(src || ''); this.i = 0; this.errors = []; }
  Parser.prototype.peek = function () { return this.s[this.i]; };
  Parser.prototype.ws = function () { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; };

  Parser.prototype.group = function () {
    this.ws();
    if (this.peek() === '{') {
      this.i++;
      var inner = this.expr('}');
      if (this.peek() === '}') this.i++; else this.errors.push('Missing closing brace }.');
      return '<mrow>' + inner + '</mrow>';
    }
    var a = this.atom();
    if (a === null) { this.errors.push('Expected a value after a command.'); return '<mrow></mrow>'; }
    return a.xml;
  };

  Parser.prototype.rawGroup = function () {
    this.ws();
    if (this.peek() !== '{') return '';
    var depth = 0, start = ++this.i;
    while (this.i < this.s.length) {
      var c = this.s[this.i];
      if (c === '{') depth++;
      else if (c === '}') { if (depth === 0) break; depth--; }
      this.i++;
    }
    var text = this.s.slice(start, this.i);
    if (this.peek() === '}') this.i++; else this.errors.push('Missing closing brace }.');
    return text;
  };

  Parser.prototype.command = function () {
    var m = /^\\([a-zA-Z]+|.)/.exec(this.s.slice(this.i));
    this.i += m[0].length;
    var name = m[1];
    if (name === 'frac' || name === 'dfrac' || name === 'tfrac') return { xml: '<mfrac>' + this.group() + this.group() + '</mfrac>' };
    if (name === 'sqrt') {
      this.ws();
      if (this.peek() === '[') {
        this.i++;
        var idx = this.expr(']');
        if (this.peek() === ']') this.i++;
        var base = this.group();
        return { xml: '<mroot>' + base + '<mrow>' + idx + '</mrow></mroot>' };
      }
      return { xml: '<msqrt>' + this.group() + '</msqrt>' };
    }
    if (name === 'text' || name === 'mathrm' || name === 'textrm') {
      var t = this.rawGroup();
      return { xml: name === 'text' ? '<mtext>' + esc(t) + '</mtext>' : '<mi mathvariant="normal">' + esc(t) + '</mi>' };
    }
    if (name === 'mathbf') return { xml: '<mstyle mathvariant="bold">' + this.group() + '</mstyle>' };
    if (ACCENT[name]) return { xml: '<mover accent="true">' + this.group() + '<mo>' + ACCENT[name] + '</mo></mover>' };
    if (name === 'left' || name === 'right') {
      this.ws();
      var d = this.s[this.i] === '\\' ? (this.i += 2, this.s[this.i - 1]) : this.s[this.i++];
      if (d === '.') return { xml: '' };
      return { xml: '<mo stretchy="true">' + esc(d === '{' || d === '}' ? d : d) + '</mo>' };
    }
    if (GREEK[name]) return { xml: name.charAt(0) === name.charAt(0).toUpperCase() ? '<mi mathvariant="normal">' + GREEK[name] + '</mi>' : '<mi>' + GREEK[name] + '</mi>' };
    if (OPS[name]) return { xml: '<mo>' + OPS[name] + '</mo>' };
    if (IDENT[name]) return { xml: '<mi>' + IDENT[name] + '</mi>' };
    if (BIG[name]) return { xml: '<mo largeop="true">' + BIG[name] + '</mo>', big: name };
    if (FUNCS.has(name)) return { xml: '<mi>' + name + '</mi>', big: name === 'lim' ? 'lim' : null };
    if (name === ',' || name === ';' || name === ':' || name === 'quad' || name === 'qquad' || name === ' ') {
      var w = { ',': '0.17em', ':': '0.22em', ';': '0.28em', ' ': '0.25em', quad: '1em', qquad: '2em' }[name];
      return { xml: '<mspace width="' + w + '"></mspace>' };
    }
    if (name === '\\') return { xml: '<mspace linebreak="newline"></mspace>' };
    if (name === '{' || name === '}' || name === '%' || name === '$' || name === '&' || name === '#' || name === '_') return { xml: '<mo>' + esc(name) + '</mo>' };
    this.errors.push('Unknown command \\' + name + '.');
    return { xml: '<mtext>\\' + esc(name) + '</mtext>' };
  };

  Parser.prototype.atom = function () {
    this.ws();
    var c = this.peek();
    if (c === undefined) return null;
    if (c === '{') return { xml: this.group() };
    if (c === '\\') return this.command();
    var m;
    if ((m = /^\d+(\.\d+)?/.exec(this.s.slice(this.i)))) { this.i += m[0].length; return { xml: '<mn>' + m[0] + '</mn>' }; }
    this.i++;
    if (/[a-zA-Z]/.test(c)) return { xml: '<mi>' + c + '</mi>' };
    if (c === "'") return { xml: '<mo>′</mo>' };
    if (c === '-') return { xml: '<mo>−</mo>' };
    return { xml: '<mo>' + esc(c) + '</mo>' };
  };

  Parser.prototype.expr = function (stop) {
    var out = '';
    for (;;) {
      this.ws();
      var c = this.peek();
      if (c === undefined || c === stop) break;
      if (c === '}' && stop !== '}') { this.errors.push('Unexpected closing brace }.'); this.i++; continue; }
      if (c === '^' || c === '_') { this.errors.push('A ^ or _ needs something before it.'); this.i++; continue; }
      var a = this.atom();
      if (a === null) break;
      var sub = null, sup = null;
      for (;;) {
        this.ws();
        var n = this.peek();
        if (n === '_' && sub === null) { this.i++; sub = this.group(); continue; }
        if (n === '^' && sup === null) { this.i++; sup = this.group(); continue; }
        break;
      }
      var under = a.big && a.big !== 'int' && a.big !== 'iint' && a.big !== 'oint';
      if (sub !== null && sup !== null) out += under ? '<munderover>' + a.xml + sub + sup + '</munderover>' : '<msubsup>' + a.xml + sub + sup + '</msubsup>';
      else if (sub !== null) out += under ? '<munder>' + a.xml + sub + '</munder>' : '<msub>' + a.xml + sub + '</msub>';
      else if (sup !== null) out += under ? '<mover>' + a.xml + sup + '</mover>' : '<msup>' + a.xml + sup + '</msup>';
      else out += a.xml;
    }
    return out;
  };

  /** Convert LaTeX to a MathML string. Returns { xml, errors }. */
  function toMathML(src, display) {
    var p = new Parser(src);
    var body = p.expr(null);
    var xml = '<math xmlns="http://www.w3.org/1998/Math/MathML"' + (display ? ' display="block"' : '') + '><mrow>' + body + '</mrow></math>';
    return { xml: xml, errors: p.errors };
  }

  var api = { toMathML: toMathML };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).latex = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* WrapNote core: escaping and value checks used before anything reaches the screen. */
(function (g) {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"'`]/g, function (c) { return ESC[c]; });
  }

  /** Only web, mail and in-page links. Blocks javascript:, data:, vbscript: and friends. */
  function isSafeUrl(url) {
    var s = String(url || '').trim();
    if (!s) return false;
    if (/^#[\w\-:.]*$/.test(s)) return true;
    // Strip control chars that browsers ignore inside a scheme ("java\tscript:").
    var clean = s.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
    return /^(https?:\/\/|mailto:)/.test(clean) && !/[<>"]/.test(s);
  }

  /** Images may be embedded only as raster data URLs (no SVG data URLs, which can carry script). */
  function isSafeImageSrc(src) {
    return /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,[a-z0-9+\/=\s]+$/i.test(String(src || ''));
  }

  var STYLE_PROPS = new Set([
    'color', 'background-color', 'background', 'font-family', 'font-size', 'font-weight', 'font-style',
    'text-decoration', 'text-align', 'line-height', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
    'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom', 'border', 'border-top', 'border-bottom',
    'border-left', 'border-right', 'border-color', 'border-style', 'border-width', 'border-radius', 'width', 'height',
    'max-width', 'text-indent', 'vertical-align', 'float', 'column-count', 'column-gap', 'column-rule', 'letter-spacing',
    'text-transform', 'list-style-type', 'display', 'position', 'left', 'top', 'z-index', 'opacity', 'transform',
    'box-shadow', 'white-space', 'font-variant', 'clear'
  ]);

  /** Keep only known, harmless CSS declarations. Drops url(), expression() and @import. */
  function cleanStyle(style) {
    var out = [];
    String(style || '').split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var prop = decl.slice(0, i).trim().toLowerCase();
      var val = decl.slice(i + 1).trim();
      if (!STYLE_PROPS.has(prop)) return;
      if (/url\s*\(|expression\s*\(|javascript:|@import|behavior|[<>]/i.test(val)) return;
      if (val.length > 200) return;
      // Fixed or sticky boxes could cover the app's own controls, so only in-page positioning is kept.
      if (prop === 'position' && !/^(relative|absolute|static)$/i.test(val)) return;
      out.push(prop + ': ' + val);
    });
    return out.join('; ');
  }

  /** Text placed inside a CSS string, e.g. content: "...". */
  function cssString(s) {
    return '"' + String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '') + '"';
  }

  /** Safe file-name part: letters, digits, dash, underscore. */
  function fileSlug(s) {
    return String(s || 'document').trim().replace(/[^\w\-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'document';
  }

  var api = { escapeHtml: escapeHtml, isSafeUrl: isSafeUrl, isSafeImageSrc: isSafeImageSrc, cleanStyle: cleanStyle, cssString: cssString, fileSlug: fileSlug };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (g.WN = g.WN || {}).safe = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

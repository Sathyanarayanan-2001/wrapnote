/* WrapNote app: paged layout. The document is one editable flow; this module measures its top-level
 * blocks once (one read pass), works out page breaks with plain arithmetic, then writes the pushes
 * and the per-page overlays (page boxes, header, footer, page numbers, footnotes, watermark, border).
 * Cost per run: O(n) for n top-level blocks, with a single forced layout for the read pass.
 */
var Layout = (function () {
  var MM = 96 / 25.4;           // explicit unit conversion: 1 mm = 96 / 25.4 CSS px (96 px per inch, 25.4 mm per inch)
  var GAP = 28;                 // screen gap between pages, px
  var SIZES = { A4: [210, 297], Letter: [215.9, 279.4], Legal: [215.9, 355.6], A5: [148, 210] };
  var MARGINS = { normal: [25.4, 25.4, 25.4, 25.4], narrow: [12.7, 12.7, 12.7, 12.7], moderate: [25.4, 19.05, 25.4, 19.05], wide: [25.4, 50.8, 25.4, 50.8] };
  var pages = 1, pageOf = new Map(), geo = null, zoom = 1, zoomMode = 'auto';

  function geometry() {
    var L = Ed.doc.layout;
    var s = SIZES[L.size] || SIZES.A4;
    var wmm = L.orientation === 'landscape' ? s[1] : s[0], hmm = L.orientation === 'landscape' ? s[0] : s[1];
    var m = L.margins === 'custom' ? [L.custom.t, L.custom.r, L.custom.b, L.custom.l] : (MARGINS[L.margins] || MARGINS.normal);
    return { wmm: wmm, hmm: hmm, W: wmm * MM, H: hmm * MM, mt: m[0] * MM, mr: m[1] * MM, mb: m[2] * MM, ml: m[3] * MM, mm: m };
  }

  function applyPageSetup() {
    if (!Ed.doc) return;
    geo = geometry();
    var d = Ed.el();
    $('#sheet').style.width = geo.W + 'px';
    d.style.padding = geo.mt + 'px ' + geo.mr + 'px ' + geo.mb + 'px ' + geo.ml + 'px';
    d.classList.toggle('wn-branded', !!Ed.doc.layout.branding.on);
    $('#sheet').style.setProperty('--page-color', Ed.doc.layout.pageColor || '#ffffff');
    setZoom(zoomMode, zoom);
  }

  /** Main pass. Returns the page count. */
  function run() {
    if (!Ed.doc) return 1;
    applyPageSetup();
    var d = Ed.el();
    // 1. Remove previous pushes so we measure natural positions.
    $$('[data-wn-push]', d).forEach(function (n) { n.style.marginTop = n.getAttribute('data-wn-orig') || ''; n.removeAttribute('data-wn-push'); n.removeAttribute('data-wn-orig'); });
    numberThings(d);
    var kids = Array.prototype.slice.call(d.children);
    // 2. Read pass (one layout).
    var info = kids.map(function (k) {
      var cs = getComputedStyle(k);
      return { el: k, top: k.offsetTop, h: k.offsetHeight, mt: parseFloat(cs.marginTop) || 0, brk: k.classList.contains('wn-pagebreak'),
        fns: k.classList.contains('wn-fnref') ? [k] : $$('.wn-fnref', k) };
    });
    // 3. Arithmetic: two passes so footnote space can be reserved on the page that holds the reference.
    var reserve = new Map();
    var plan = paginate(info, reserve);
    var fnPages = new Map();
    plan.assign.forEach(function (pg, i) { info[i].fns.forEach(function (f) { if (!fnPages.has(pg)) fnPages.set(pg, []); fnPages.get(pg).push(f); }); });
    if (fnPages.size) {
      fnPages.forEach(function (list, pg) { reserve.set(pg, 14 + list.reduce(function (s, f) { return s + 16 * Math.max(1, Math.ceil((f.getAttribute('data-text') || '').length / 90)); }, 0)); });
      plan = paginate(info, reserve);
      fnPages = new Map();
      plan.assign.forEach(function (pg, i) { info[i].fns.forEach(function (f) { if (!fnPages.has(pg)) fnPages.set(pg, []); fnPages.get(pg).push(f); }); });
    }
    // 4. Write pass.
    pageOf = new Map();
    info.forEach(function (it, i) {
      pageOf.set(it.el, plan.assign[i]);
      var p = plan.push[i];
      if (p > 0.5) { it.el.setAttribute('data-wn-push', '1'); it.el.setAttribute('data-wn-orig', it.el.style.marginTop || ''); it.el.style.marginTop = (it.mt + p) + 'px'; }
    });
    pages = plan.pages;
    $('#sheet').style.height = (pages * (geo.H + GAP) - GAP) + 'px';
    sizeWrap();
    drawOverlays(fnPages);
    var tocChanged = Refs.updateTocs(false);
    if (tocChanged && !run.again) { run.again = true; try { return run(); } finally { run.again = false; } }
    Rulers.draw();
    return pages;
  }

  function paginate(info, reserve) {
    var pitch = geo.H + GAP;
    function zStart(p) { return p * pitch + geo.mt; }
    function zEnd(p) { return p * pitch + geo.H - geo.mb - (reserve.get(p) || 0); }
    var shift = 0, page = 0, force = false, assign = [], push = [];
    info.forEach(function (it) {
      var t = it.top + shift, p = 0;
      while (t >= zEnd(page) - 1) page++;
      if (force) { page++; force = false; }
      if (t < zStart(page)) { p = zStart(page) - t; t += p; }
      var zoneH = zEnd(page) - zStart(page);
      if (t + it.h > zEnd(page) + 0.5 && it.h <= zoneH && t > zStart(page) + 0.5) {
        var add = zStart(page + 1) - t; p += add; t += add; page++;
      }
      shift += p;
      assign.push(page); push.push(p);
      if (it.brk) force = true;
      // A block taller than a page spills over; following content starts after it.
      if (t + it.h > zEnd(page)) page += Math.floor((t + it.h - zStart(page)) / pitch);
    });
    return { assign: assign, push: push, pages: Math.max(1, page + 1) };
  }

  /** Captions, footnote references and heading ids are numbered in document order on every pass. */
  function numberThings(d) {
    var counts = {};
    $$('.wn-caption', d).forEach(function (c) {
      var kind = c.getAttribute('data-kind') || 'Figure';
      counts[kind] = (counts[kind] || 0) + 1;
      var n = c.querySelector('.wn-capnum');
      if (n) n.textContent = kind + ' ' + counts[kind];
    });
    $$('.wn-fnref', d).forEach(function (f, i) { f.textContent = String(i + 1); });
    var used = new Set();
    $$('h1,h2,h3,h4,.wn-caption,[data-labels]', d).forEach(function (hd) {
      var id = hd.getAttribute('data-wn-id');
      if (!id || used.has(id)) { id = 'h' + Math.random().toString(36).slice(2, 9); hd.setAttribute('data-wn-id', id); }
      used.add(id);
    });
  }

  function tokens(s, p) {
    var doc = Ed.doc;
    return String(s || '').replace(/\{page\}/g, p + 1).replace(/\{pages\}/g, pages).replace(/\{title\}/g, doc.title || '').replace(/\{date\}/g, D.formatDMY(D.localISO()));
  }
  function numberText(p) {
    var f = Ed.doc.layout.pageNumbers.format;
    return f === 'X' ? String(p + 1) : f === 'X / Y' ? (p + 1) + ' / ' + pages : f === 'Page X' ? 'Page ' + (p + 1) : 'Page ' + (p + 1) + ' of ' + pages;
  }

  /** Builds the decoration layers for page p into bg (behind text) and fg (above text). */
  function pageDecor(p, top, bg, fg, fnList) {
    var L = Ed.doc.layout, b = L.border;
    var box = h('div', { class: 'pg-box', style: { top: top + 'px', height: geo.H + 'px', background: L.pageColor || '#fff' } });
    if (b.style !== 'none') {
      var inset = 24; // 24 px = 6.35 mm, the usual distance of a page border from the edge
      var bd = h('div', { class: 'pg-border', style: { inset: inset + 'px', border: b.width + 'px ' + (b.kind === '3d' ? 'ridge' : b.style) + ' ' + b.color, boxShadow: b.kind === 'shadow' ? '4px 4px 0 ' + b.color : 'none' } });
      box.appendChild(bd);
    }
    var wm = L.watermark;
    if (wm.type === 'text' && wm.text) box.appendChild(h('div', { class: 'pg-wm', style: { opacity: wm.opacity, transform: 'translate(-50%,-50%) rotate(' + (wm.angle || 0) + 'deg)' } }, wm.text));
    if (wm.type === 'image' && S.isSafeImageSrc(wm.image)) box.appendChild(h('img', { class: 'pg-wm-img', src: wm.image, alt: '', style: { opacity: wm.opacity } }));
    bg.appendChild(box);
    var br = L.branding;
    var hdrText = tokens(L.header.text || (br.on ? br.headerText : ''), p), ftrText = tokens(L.footer.text || (br.on ? br.footerText : ''), p);
    var hy = top + Math.max(10, geo.mt / 2 - 12), fy = top + geo.H - Math.max(10, geo.mb / 2) - 6;
    if (hdrText || (br.on && br.logo)) {
      var hd = h('div', { class: 'pg-head', style: { top: hy + 'px', left: geo.ml + 'px', right: geo.mr + 'px', textAlign: L.header.align || 'center' } });
      if (br.on && S.isSafeImageSrc(br.logo)) hd.appendChild(h('img', { src: br.logo, alt: '', class: 'pg-logo pos-' + br.logoPos }));
      if (hdrText) hd.appendChild(h('span', null, hdrText));
      fg.appendChild(hd);
    }
    if (ftrText) fg.appendChild(h('div', { class: 'pg-foot', style: { top: fy + 'px', left: geo.ml + 'px', right: geo.mr + 'px', textAlign: L.footer.align || 'center' } }, ftrText));
    var pn = L.pageNumbers;
    if (pn.show) {
      var st = { textAlign: pn.align };
      if (pn.pos === 'top') Object.assign(st, { top: (top + 10) + 'px', left: geo.ml + 'px', right: geo.mr + 'px' });
      else if (pn.pos === 'margin-left' || pn.pos === 'margin-right') Object.assign(st, { top: (top + geo.H / 2) + 'px', width: '120px', textAlign: 'center' }, pn.pos === 'margin-left' ? { left: (geo.ml / 2 - 60) + 'px', transform: 'rotate(-90deg)' } : { right: (geo.mr / 2 - 60) + 'px', transform: 'rotate(90deg)' });
      else Object.assign(st, { top: (top + geo.H - 22) + 'px', left: geo.ml + 'px', right: geo.mr + 'px' });
      fg.appendChild(h('div', { class: 'pg-num', style: st }, numberText(p)));
    }
    if (fnList && fnList.length) {
      var fb = h('div', { class: 'pg-fn', style: { left: geo.ml + 'px', right: geo.mr + 'px', bottom: 'auto' } });
      fnList.forEach(function (f) { fb.appendChild(h('p', null, h('sup', null, f.textContent), ' ', f.getAttribute('data-text') || '')); });
      fg.appendChild(fb);
      // Placed just above the bottom margin of that page.
      fb.style.top = (top + geo.H - geo.mb - (14 + fnList.length * 16)) + 'px';
    }
  }

  function drawOverlays(fnPages) {
    var bg = $('#sheetBg'), fg = $('#sheetFg');
    bg.textContent = ''; fg.textContent = '';
    for (var p = 0; p < pages; p++) pageDecor(p, p * (geo.H + GAP), bg, fg, fnPages.get(p));
  }

  /** Real pages (for print, PDF, the multiple-pages preview and export). Each page is a fixed box. */
  function buildPages(target) {
    run();
    target.textContent = '';
    var d = Ed.el();
    var kids = Array.prototype.slice.call(d.children);
    var fnPages = new Map();
    kids.forEach(function (k) { var pg = pageOf.get(k) || 0; (k.classList.contains('wn-fnref') ? [k] : $$('.wn-fnref', k)).forEach(function (f) { if (!fnPages.has(pg)) fnPages.set(pg, []); fnPages.get(pg).push(f); }); });
    var pageEls = [];
    for (var p = 0; p < pages; p++) {
      var pg = h('div', { class: 'pp', style: { width: geo.W + 'px', height: geo.H + 'px' } });
      var bg = h('div', { class: 'pp-bg' }), fg = h('div', { class: 'pp-fg' });
      var content = h('div', { class: 'doc-content pp-content' + (d.classList.contains('wn-branded') ? ' wn-branded' : ''), style: { padding: geo.mt + 'px ' + geo.mr + 'px 0 ' + geo.ml + 'px' } });
      pageDecor(p, 0, bg, fg, fnPages.get(p));
      pg.appendChild(bg); pg.appendChild(content); pg.appendChild(fg);
      pageEls.push({ el: pg, content: content });
      target.appendChild(pg);
    }
    kids.forEach(function (k) {
      var p = pageOf.get(k) || 0;
      var c = k.cloneNode(true);
      if (c.hasAttribute('data-wn-push')) { c.style.marginTop = c.getAttribute('data-wn-orig') || ''; c.removeAttribute('data-wn-push'); c.removeAttribute('data-wn-orig'); }
      c.removeAttribute('contenteditable');
      $$('[contenteditable]', c).forEach(function (x) { x.removeAttribute('contenteditable'); });
      $$('.wn-selected', c).forEach(function (x) { x.classList.remove('wn-selected'); });
      if (pageEls[p]) pageEls[p].content.appendChild(c);
    });
    return { pages: pages, wmm: geo.wmm, hmm: geo.hmm };
  }

  /** Print or save as PDF: build exact pages, set @page size, and print. */
  function print() {
    if (!Ed.doc) return;
    var root = $('#print-root');
    var info = buildPages(root);
    var st = $('#print-page-style');
    st.textContent = '@page { size: ' + info.wmm + 'mm ' + info.hmm + 'mm; margin: 0; }';
    document.body.classList.add('printing');
    setTimeout(function () { window.print(); }, 50);
  }
  window.addEventListener('afterprint', function () { document.body.classList.remove('printing'); $('#print-root').textContent = ''; });

  /* ---------- Zoom ---------- */
  function sizeWrap() {
    var w = $('#zoomWrap'); if (!w || !geo) return;
    w.style.width = (geo.W * zoom) + 'px';
    w.style.height = ((pages * (geo.H + GAP) - GAP) * zoom) + 'px';
  }
  function setZoom(mode, value) {
    zoomMode = mode || 'auto';
    var scroll = $('#canvasScroll');
    if (!geo || !scroll) return;
    var avail = scroll.clientWidth - 32;
    if (zoomMode === 'width' || (zoomMode === 'auto' && avail < geo.W)) zoom = Math.max(0.25, Math.min(3, avail / geo.W));
    else if (zoomMode === 'page') zoom = Math.max(0.2, Math.min(3, (scroll.clientHeight - 32) / geo.H, avail / geo.W));
    else if (zoomMode === 'auto') zoom = 1;
    else zoom = Math.max(0.25, Math.min(3, value || 1));
    // transform (not CSS zoom) keeps offsetTop in unscaled layout units, which the page maths relies on.
    $('#zoomer').style.transform = zoom === 1 ? '' : 'scale(' + zoom + ')';
    sizeWrap();
    var z = $('#zoomRange'); if (z) z.value = Math.round(zoom * 100);
    var zl = $('#zoomLabel'); if (zl) zl.textContent = Math.round(zoom * 100) + '%';
  }
  window.addEventListener('resize', debounce(function () { if (Ed.doc && Pages.current() === 'edit') { setZoom(zoomMode, zoom); Rulers.draw(); } }, 200));

  return { run: run, applyPageSetup: applyPageSetup, buildPages: buildPages, print: print, setZoom: setZoom,
    pages: function () { return pages; }, pageOf: function (el) { var t = Ed.topBlock(el); return t ? (pageOf.get(t) || 0) : 0; },
    geo: function () { return geo; }, MM: MM, SIZES: SIZES, MARGINS: MARGINS, zoom: function () { return zoom; } };
})();

/* ---------- Rulers: centimetre ticks with draggable margin markers ---------- */
var Rulers = (function () {
  var on = false;
  function toggle(v) { on = v === undefined ? !on : v; $('#rulerH').hidden = !on; $('#rulerV').hidden = !on; draw(); }
  function draw() {
    if (!on || !Ed.doc) return;
    var g = Layout.geo(), z = Layout.zoom();
    if (!g) return;
    var rh = $('#rulerH'), rv = $('#rulerV');
    var cm = 10 * Layout.MM; // 1 cm = 10 mm
    var sheetLeft = $('#sheet').getBoundingClientRect().left - rh.getBoundingClientRect().left;
    var s = '<div class="r-track" style="left:' + sheetLeft + 'px;width:' + (g.W * z) + 'px">' +
      '<div class="r-margin" style="left:0;width:' + (g.ml * z) + 'px"></div><div class="r-margin" style="right:0;width:' + (g.mr * z) + 'px"></div>';
    for (var i = 0; i * cm <= g.W; i++) s += '<span class="r-tick" style="left:' + (i * cm * z) + 'px">' + (i % 2 === 0 ? i : '') + '</span>';
    s += '<span class="r-handle" data-side="l" style="left:' + (g.ml * z) + 'px" title="Drag to change the left margin"></span><span class="r-handle" data-side="r" style="left:' + ((g.W - g.mr) * z) + 'px" title="Drag to change the right margin"></span></div>';
    rh.innerHTML = s;
    var v = '<div class="r-track v" style="height:' + (g.H * z) + 'px"><div class="r-margin" style="top:0;height:' + (g.mt * z) + 'px"></div><div class="r-margin" style="bottom:0;height:' + (g.mb * z) + 'px"></div>';
    for (var j = 0; j * cm <= g.H; j++) v += '<span class="r-tick" style="top:' + (j * cm * z) + 'px">' + (j % 2 === 0 ? j : '') + '</span>';
    rv.innerHTML = v + '</div>';
    $$('.r-handle', rh).forEach(function (hd) { hd.addEventListener('pointerdown', drag); });
  }
  function drag(e) {
    e.preventDefault();
    var side = e.target.getAttribute('data-side'), L = Ed.doc.layout, g = Layout.geo(), z = Layout.zoom();
    var startX = e.clientX, startMM = side === 'l' ? g.mm[3] : g.mm[1];
    function mv(ev) {
      var dmm = (ev.clientX - startX) / z / Layout.MM * (side === 'l' ? 1 : -1);
      var val = Math.max(5, Math.min(80, Math.round((startMM + dmm) * 10) / 10));
      if (L.margins !== 'custom') { L.custom = { t: g.mm[0], r: g.mm[1], b: g.mm[2], l: g.mm[3] }; L.margins = 'custom'; }
      if (side === 'l') L.custom.l = val; else L.custom.r = val;
      Layout.applyPageSetup(); draw();
    }
    function up() { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); Ed.changed(); toast('Margins: left ' + L.custom.l + ' mm, right ' + L.custom.r + ' mm.'); }
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }
  return { toggle: toggle, draw: draw, on: function () { return on; } };
})();

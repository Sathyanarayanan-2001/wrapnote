"""WrapNote browser tests (Playwright, headless Chromium).

Every check states its input and the expected result worked out by hand.
Run:  python tests/e2e/run_e2e.py [--base http://localhost:8765/] [--round 1]
Exit code 0 only when every check passes. All data is made up.
"""
import argparse, base64, gzip, json, struct, sys, time, zlib, os, re
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='http://localhost:8765/')
ap.add_argument('--round', default='1')
ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
ap.add_argument('--only', default='')
args = ap.parse_args()
BASE = args.base

results = []
def check(name, given, expected, actual, ok=None):
    passed = (expected == actual) if ok is None else bool(ok)
    results.append({'name': name, 'input': given, 'expected': expected, 'actual': actual, 'pass': passed})
    print(('PASS ' if passed else 'FAIL ') + name + ('' if passed else f'  expected={expected!r} actual={actual!r}'))
    return passed

def png_bytes(w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')

def files(n, prefix='pic'):
    return [{'name': f'{prefix}{i+1}.png', 'mimeType': 'image/png', 'buffer': png_bytes(40, 30, (20 * i % 255, 120, 90))} for i in range(n)]

INIT = "localStorage.setItem('wrapnote:quickDone','true');"

def open_app(ctx, hash_='#home'):
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    page.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    page.goto(BASE + hash_, wait_until='networkidle')
    wait_js(page, 'document.body.classList.contains("ready")')
    page.errs = errs
    return page

def settle(page, ms=900): page.wait_for_timeout(ms)

def wait_js(page, expr, timeout=10000):
    """Poll an expression. wait_for_function would need eval, which the app's CSP correctly blocks."""
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if page.evaluate(expr): return True
        except Exception: pass
        page.wait_for_timeout(150)
    raise TimeoutError('timed out waiting for ' + expr)

def new_doc(page, mode='mom'):
    page.goto(BASE + '#home'); wait_js(page, 'document.body.classList.contains("ready")')
    page.click(f'#page-home [data-new="{mode}"]')
    page.wait_for_selector('#editor:not([hidden])')
    settle(page, 500)

def select_text(page, selector, text):
    page.evaluate("""([sel, text]) => {
      const root = document.querySelector(sel); const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const i = n.data.indexOf(text); if (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length);
        document.getElementById('docEl').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); return true; } }
      throw new Error('text not found: ' + text);
    }""", [selector, text])
    page.wait_for_timeout(80)

def type_body(page, text):
    """Click at the end of the document and type a new paragraph."""
    page.evaluate("""() => { const d = document.getElementById('docEl'); let p = d.lastElementChild;
      if (!p || p.tagName !== 'P' || p.textContent.trim()) { p = document.createElement('p'); p.appendChild(document.createElement('br')); d.appendChild(p); }
      d.focus(); const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    page.keyboard.type(text)

def ribbon(page, tab, label=None, sel=None, value=None):
    page.click(f'#ribbon .rb-tab:text-is("{tab}")')
    if sel: page.select_option(f'#ribbon [data-sel="{sel}"]', value)
    else: page.click(f'#ribbon .rb-btn:text-is("{label}")')
    page.wait_for_timeout(150)

def dlg_fill_click(page, button):
    page.click(f'dialog.dlg .dlg-actions button:text-is("{button}")')
    page.wait_for_timeout(200)

def run_all(p):
    launch = {'args': ['--no-sandbox']}
    if args.chrome: launch['executable_path'] = args.chrome
    b = p.chromium.launch(**launch)
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    ctx.add_init_script(INIT)

    # ---------- F1 first visit and quick start ----------
    c0 = b.new_context(viewport={'width': 1366, 'height': 900})
    pg = c0.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(BASE, wait_until='networkidle'); pg.wait_for_timeout(500)
    check('F1 quick start shows on first visit', 'fresh browser, open /', True, pg.locator('dialog.dlg h2:text("Quick start")').count() == 1)
    pg.click('dialog.dlg button:text-is("Skip")'); pg.reload(); pg.wait_for_timeout(500)
    check('F1 quick start not shown after Skip', 'reload after Skip', 0, pg.locator('dialog.dlg').count())
    check('F1 no page errors on load', 'console', [], errs)
    c0.close()

    page = open_app(ctx)
    # ---------- F2 primary action in two taps ----------
    taps = 0
    page.click('#page-home [data-new="mom"]'); taps += 1
    page.wait_for_selector('#editor:not([hidden])')
    check('F2 new minutes reachable in <= 2 taps from home', 'tap "New minutes"', True, taps <= 2 and page.is_visible('#intake [data-key="title"]'))

    # ---------- F3 fields render into the page ----------
    page.fill('#intake [data-key="title"]', 'Project sync (made-up)')
    page.fill('#fdate', '28/10/2026'); page.fill('#ffrom', '23:30'); page.fill('#fto', '00:45')
    page.fill('#intake [data-key="location"]', 'https://meet.example.org/abc')
    for name in ['A. Rao', 'K. Iyer', 'M. Das']:
        page.fill('#fpresent', name); page.press('#fpresent', 'Enter')
    page.fill('#fabsent', 'P. Sen'); page.press('#fabsent', 'Enter')
    page.fill('#intake [data-key="agenda"]', 'Status\nRisks')
    page.fill('#intake [data-key="decisions"]', 'Extend pilot by 2 weeks')
    # two actions
    for t, o, d, done in [('Update the plan', 'K. Iyer', '04/11/2026', False), ('Book the venue', 'M. Das', '02/11/2026', True)]:
        page.click('.rows-fld:has-text("Action items") .rows-head button:text-is("+ Add")')
        row = page.locator('.rows-fld:has-text("Action items") .row-ed').last
        row.locator('input[aria-label^="Task"]').fill(t); row.locator('input[aria-label^="Owner"]').fill(o)
        row.locator('input[aria-label^="Due"]').fill(d)
        if done: row.locator('input[type=checkbox]').check()
    settle(page)
    gen = page.inner_text('#docEl .wn-gen')
    check('F3 date line derived', '28/10/2026', True, '28/10/2026 (Wed) · CW44 · FY 2026-27' in gen)
    check('F3 midnight crossing duration', '23:30 to 00:45', True, '23:30–00:45 (1 h 15 min, ends next day)' in gen)
    check('F3 present count', '3 names', True, 'Present (3):' in gen)
    check('F3 action table has no cost column (1.2.0)', 'two actions without cost', [False, ['#', 'Task', 'Owner', 'Due', 'Status']], ['₹' in gen, page.eval_on_selector_all('#docEl .wn-actions thead th', 't=>t.map(x=>x.textContent)')])
    order = page.evaluate("[...document.querySelectorAll('#docEl .wn-actions tbody tr td:nth-child(2)')].map(t=>t.textContent)")
    check('F3 actions sorted by due date', 'due 04/11 and 02/11', ['Book the venue', 'Update the plan'], order)
    check('F3 safe meeting link rendered', 'https link', 1, page.locator('#docEl .wn-meta a[href="https://meet.example.org/abc"]').count())

    # F43 friendly date error
    page.fill('#fnextDate', '29/02/2026'); settle(page, 300)
    check('F43 invalid date message', '29/02/2026', True, 'Feb 2026 has 28 days' in page.inner_text('.fld:has(#fnextDate) .hint'))
    page.fill('#fnextDate', '04/11/2026'); settle(page, 300)

    # ---------- F4 two-way title sync ----------
    page.evaluate("""() => { const t = document.querySelector('#docEl [data-field="title"]'); t.focus(); const r = document.createRange(); r.selectNodeContents(t); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }""")
    page.keyboard.type(' v2'); settle(page, 400)
    check('F4 canvas title edits flow back to field', 'type " v2" on page title', 'Project sync (made-up) v2', page.input_value('#intake [data-key="title"]'))

    # ---------- F5 autosave survives reload ----------
    doc_id = page.evaluate('WN.debug.doc().id')
    settle(page, 900)
    page.reload(); wait_js(page, 'document.body.classList.contains("ready")'); settle(page, 600)
    check('F5 autosave and reload', 'reload editor', 'Project sync (made-up) v2', page.input_value('#edTitle'))
    check('F5 action rows kept', 'reload', 2, len(page.evaluate('WN.debug.doc().fields.mom.actions')))

    # ---------- F6 text block composer live ----------
    page.click('.add-btn:has-text("Text & labels")')
    page.click('.composer-input'); page.keyboard.type('Live block text here')
    settle(page, 300)
    check('F6 text block appears while typing', 'type in composer', True, 'Live block text here' in page.inner_text('#docEl'))
    page.fill('.composer input[placeholder^="Labels"]', 'Risk, Follow-up'); settle(page, 300)
    check('F6 labels shown on block', 'Risk, Follow-up', 2, page.locator('#docEl [data-btype="text"] .wn-label').count())
    page.click('.composer button:text-is("Done")')
    # ---------- F7 smart table via prompt ----------
    page.click('.add-btn:has-text("Smart table")')
    page.fill('#tbRows', '3'); page.fill('#tbCols', '4'); page.select_option('#tbStyle', 'striped')
    page.click('.prompt button:text-is("Insert table")'); settle(page, 400)
    tb = page.evaluate("(() => { const t = document.querySelector('#docEl [data-btype=table] table'); return [t.className, t.tHead.rows[0].cells.length, t.tBodies[0].rows.length]; })()")
    check('F7 table built from prompt', '3 rows x 4 cols, striped, header row', ['wn-table wn-style-striped', 4, 2], tb)
    page.fill('#tbRows', '99') if page.locator('#tbRows').count() else None
    page.click('.add-btn:has-text("Smart table")'); page.fill('#tbRows', '0'); page.click('.prompt button:text-is("Insert table")')
    check('F7 table validation message', 'rows 0', True, 'Rows must be a whole number' in page.inner_text('.prompt'))
    page.click('.prompt button:text-is("Cancel")')

    # ---------- F8 multiple images ask for layout ----------
    page.set_input_files('#intake .adder input[type=file] >> nth=0', files(3))
    page.wait_for_selector('.prompt:has-text("How should the 3 images be arranged?")')
    check('F8 layout prompt offers four options', '3 images', ['2×2 grid', '3-column grid', 'Side-by-side (2-col)', 'Stacked one-by-one', 'Cancel'], page.eval_on_selector_all('.prompt .choice-row button', 'b=>b.map(x=>x.textContent)'))
    page.click('.prompt button:text-is("3-column grid")'); settle(page, 500)
    check('F8 images inserted in 3-column grid', 'choose 3-column', [3, True], page.evaluate("(() => { const b = document.querySelector('#docEl [data-btype=images]'); return [b.querySelectorAll('img').length, b.classList.contains('wn-lay-grid3')]; })()"))

    # ---------- F9 screenshots: prompt 1 then prompt 2 ----------
    page.set_input_files('#intake .adder input[type=file] >> nth=1', files(2, 'shot'))
    page.wait_for_selector('.prompt:has-text("these 2 screenshots")')
    check('F9 screenshot prompt 1 options', '2 screenshots', ['Extract text (OCR)', 'Insert screenshot as image', 'Both: image + extracted text', 'Cancel'], page.eval_on_selector_all('.prompt .choice-row button', 'b=>b.map(x=>x.textContent)'))
    page.click('.prompt button:text-is("Insert screenshot as image")')
    page.wait_for_selector('.prompt:has-text("arranged")')
    check('F9 screenshot prompt 2 options', 'images chosen', ['Grid', 'Side-by-side', 'One-by-one', 'Cancel'], page.eval_on_selector_all('.prompt .choice-row button', 'b=>b.map(x=>x.textContent)'))
    page.click('.prompt button:text-is("Side-by-side")'); settle(page, 400)
    check('F9 screenshots inserted side by side', 'Side-by-side', [2, True], page.evaluate("(() => { const b = document.querySelector('#docEl [data-btype=shots]'); return [b.querySelectorAll('img').length, b.classList.contains('wn-lay-side')]; })()"))
    page.set_input_files('#intake .adder input[type=file] >> nth=1', files(1, 'ocr'))
    page.wait_for_selector('.prompt:has-text("this screenshot")'); page.click('.prompt button:text-is("Both: image + extracted text")'); settle(page, 700)
    blocks = page.locator('#docEl [data-btype=shots]').count()
    has_ocr = page.locator('#docEl [data-btype=shots] .wn-ocr').count()
    check('F9 OCR fallback keeps image and adds a text area', 'Both, browser without TextDetector', [2, 1], [blocks, has_ocr])

    # ---------- F6b block list reorder and delete ----------
    names = page.eval_on_selector_all('.block-list .bl-type', 'b=>b.map(x=>x.textContent)')
    check('F6 block list mirrors page', '5 blocks added', ['Text', 'Table', 'Images', 'Screenshots', 'Screenshots'], names)
    page.click('.block-list li >> nth=1 >> button[aria-label^="Move block 2 up"]'); settle(page, 400)
    check('F6 move block up', 'move Table up', ['Table', 'Text'], page.eval_on_selector_all('.block-list .bl-type', 'b=>b.map(x=>x.textContent)')[:2])
    page.click('.block-list li >> nth=4 >> button:text-is("Delete")'); settle(page, 400)
    check('F6 delete block', 'delete last block', 4, page.locator('#docEl [data-block]').count())

    # ---------- F10-F13 Home tab formatting in a blank doc ----------
    new_doc(page, 'blank')
    type_body(page, 'alpha beta gamma. the quick brown fox')
    settle(page, 400)
    select_text(page, '#docEl', 'beta'); ribbon(page, 'Home', 'B')
    fw = page.evaluate("(() => { const w = document.createTreeWalker(document.getElementById('docEl'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.data.includes('beta')) return getComputedStyle(n.parentNode).fontWeight; })()")
    check('F10 bold applied', 'select "beta", B', True, int(fw) >= 600)
    select_text(page, '#docEl', 'the quick brown fox'); ribbon(page, 'Home', sel='case', value='title')
    check('F11 change case to Title Case', 'the quick brown fox', True, 'The Quick Brown Fox' in page.inner_text('#docEl'))
    select_text(page, '#docEl', 'gamma'); ribbon(page, 'Home', sel='fontSize', value='14')
    fs = page.evaluate("(() => { const w = document.createTreeWalker(document.getElementById('docEl'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.data.includes('gamma')) return getComputedStyle(n.parentNode).fontSize; })()")
    check('F12 font size 14 pt', '14 pt = 14 x 96/72 = 18.67 px', '18.6667px', fs)
    select_text(page, '#docEl', 'alpha'); ribbon(page, 'Home', sel='style', value='h2')
    check('F13 Heading 2 style', 'style Heading 2', 1, page.locator('#docEl h2').count())
    # format painter: copy bold from beta, apply to Fox
    select_text(page, '#docEl', 'beta'); ribbon(page, 'Home', 'Format painter')
    select_text(page, '#docEl', 'Fox'); page.dispatch_event('#docEl', 'mouseup'); settle(page, 200)
    fw2 = page.evaluate("(() => { const w = document.createTreeWalker(document.getElementById('docEl'), NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.data.includes('Fox')) return getComputedStyle(n.parentNode).fontWeight; })()")
    check('F40 format painter copies bold', 'paint beta -> Fox', True, int(fw2) >= 600)

    # ---------- F39 undo / redo ----------
    before = page.inner_text('#docEl')
    type_body(page, 'Undo me please'); settle(page, 900)
    page.click('#undoBtn'); settle(page, 300)
    check('F39 undo removes typed paragraph', 'type then undo', False, 'Undo me please' in page.inner_text('#docEl'))
    page.click('#redoBtn'); settle(page, 300)
    check('F39 redo restores it', 'redo', True, 'Undo me please' in page.inner_text('#docEl'))

    # ---------- F14 find and replace ----------
    type_body(page, 'alpha one, alpha two, alpha three'); settle(page, 300)
    page.keyboard.press('Control+h'); page.fill('#sidePanel input[type=search]', 'alpha'); settle(page, 400)
    page.fill('#sidePanel input[placeholder="Replace with"]', 'omega'); page.click('#sidePanel button:text-is("Replace all")'); settle(page, 400)
    txt = page.inner_text('#docEl')
    check('F14 replace all', '"alpha" x4 -> "omega"', [0, 4], [txt.count('alpha'), txt.count('omega')])
    page.click('#sidePanel button[aria-label="Close panel"]')

    # ---------- F15 page break and F19 page numbers ----------
    page.keyboard.press('Control+Enter'); type_body(page, 'Second page text'); settle(page, 700)
    check('F15 page break makes 2 pages', 'Ctrl+Enter', 2, page.evaluate('WN.debug.pages()'))
    nums = page.eval_on_selector_all('#sheetFg .pg-num', 'n=>n.map(x=>x.textContent)')
    check('F19 page numbers Page X of Y', '2 pages', ['Page 1 of 2', 'Page 2 of 2'], nums)
    page.evaluate("document.querySelectorAll('#docEl > *')[document.querySelectorAll('#docEl > *').length-1].scrollIntoView()")
    pg_of = page.evaluate("(() => { const ps = [...document.querySelectorAll('#docEl > p')]; const p = ps.find(x => x.textContent.includes('Second page')); const top = p.offsetTop; const H = 297*96/25.4 + 28; return Math.floor(top / H); })()")
    check('F15 text after break starts on page 2 (second method: offset / page pitch)', 'offsetTop / (1122.5 + 28)', 1, pg_of)

    # ---------- F16 TOC, F17 captions, F18 footnotes ----------
    ribbon(page, 'References', 'Table of contents…'); dlg_fill_click(page, 'Insert'); settle(page, 600)
    toc = page.eval_on_selector_all('#docEl .wn-toc li', 'l=>l.map(x=>x.textContent)')
    check('F16 auto TOC lists heading with page number', 'H2 "alpha" on page 1', True, any(t.startswith('omega') or t.startswith('alpha') for t in toc) and toc[0].endswith('1'))
    ribbon(page, 'References', 'Insert caption…'); page.fill('dialog.dlg input[placeholder="Describe the item"]', 'First'); dlg_fill_click(page, 'Insert')
    ribbon(page, 'References', 'Insert caption…'); page.fill('dialog.dlg input[placeholder="Describe the item"]', 'Second'); dlg_fill_click(page, 'Insert'); settle(page, 500)
    check('F17 captions numbered in order', 'two Figure captions', ['Figure 1', 'Figure 2'], page.eval_on_selector_all('#docEl .wn-capnum', 'c=>c.map(x=>x.textContent)'))
    select_text(page, '#docEl', 'Second page text'); page.keyboard.press('End')
    ribbon(page, 'References', 'Insert footnote…'); page.fill('dialog.dlg textarea', 'A made-up source note.'); dlg_fill_click(page, 'Insert'); settle(page, 700)
    fn = page.eval_on_selector_all('#sheetFg .pg-fn', 'f=>f.map(x=>[x.textContent, Math.floor(parseFloat(x.style.top)/(297*96/25.4+28))])')
    check('F18 footnote shown at bottom of its page', 'footnote in page-2 text', [['1 A made-up source note.', 1]], fn)

    # ---------- F20/F21 page setup ----------
    ribbon(page, 'Design & layout', sel='margins', value='narrow'); settle(page, 400)
    check('F20 narrow margins 12.7 mm = 48 px', '12.7 x 96 / 25.4', '48px', page.evaluate("getComputedStyle(document.getElementById('docEl')).paddingLeft"))
    ribbon(page, 'Design & layout', sel='orientation', value='landscape'); settle(page, 400)
    check('F21 landscape A4 width 297 mm = 1122.52 px', '297 x 96 / 25.4', 1122.52, round(page.evaluate("parseFloat(document.getElementById('sheet').style.width)"), 2))
    ribbon(page, 'Design & layout', sel='orientation', value='portrait'); ribbon(page, 'Design & layout', sel='margins', value='normal')
    ribbon(page, 'Insert', 'Header…')
    page.fill('dialog.dlg input[placeholder="e.g. {title}"]', 'Header {page}/{pages}'); dlg_fill_click(page, 'Apply'); settle(page, 500)
    check('F19 header tokens', '"Header {page}/{pages}"', ['Header 1/2', 'Header 2/2'], page.eval_on_selector_all('#sheetFg .pg-head', 'h=>h.map(x=>x.textContent)'))

    # ---------- F46 print/PDF: exact page boxes (second method: count PDF pages) ----------
    page.evaluate('window.print = () => {}')
    page.select_option('#exportSel', 'pdf'); settle(page, 300)
    pp = page.locator('#print-root .pp').count()
    page.emulate_media(media='print')
    pdf = page.pdf(prefer_css_page_size=True)
    page.emulate_media(media='screen')
    pdf_pages = len(re.findall(rb'/Type\s*/Page[^s]', pdf))
    check('F46 print builds one box per page and the PDF has the same count', 'pages = 2', [2, 2], [pp, pdf_pages])
    page.evaluate("window.dispatchEvent(new Event('afterprint'))")

    # ---------- F22 track changes ----------
    page.click('#ribbon .rb-tab:text-is("Review")'); page.click('#ribbon .rb-btn:text-is("Track changes")')
    dlg_fill_click(page, 'Start tracking')
    check('F22 name required before tracking', 'empty name', True, 'Enter your name' in page.inner_text('dialog.dlg'))
    page.fill('dialog.dlg input', 'Test Reviewer'); dlg_fill_click(page, 'Start tracking')
    type_body(page, 'Tracked words'); settle(page, 400)
    ins = page.evaluate("[...document.querySelectorAll('#docEl ins.wn-ins')].map(i=>[i.textContent, i.dataset.author, !!i.dataset.time])")
    check('F22 insertion marked with author and time', 'type "Tracked words"', [['Tracked words', 'Test Reviewer', True]], ins)
    select_text(page, '#docEl', 'Tracked words'); page.keyboard.press('End'); page.keyboard.type(' plus more'); settle(page, 300)
    ins2 = page.evaluate("[...document.querySelectorAll('#docEl ins.wn-ins')].map(i=>i.textContent.replace(/\\u00a0/g, ' '))")
    check('F22 typing a leading space continues one insertion', 'type " plus more" after it', ['Tracked words plus more'], ins2)
    select_text(page, '#docEl', 'omega three'); page.keyboard.press('End'); page.keyboard.type(' Costs ok'); settle(page, 300)
    ins3 = page.evaluate("[...document.querySelectorAll('#docEl ins.wn-ins')].map(i=>i.textContent.replace(/\\u00a0/g, ' '))")
    para = page.evaluate("[...document.querySelectorAll('#docEl p')].find(p => p.textContent.includes('omega three')).textContent.replace(/\\u00a0/g, ' ')")
    check('F22 space typed at the end of normal text stays visible and in one insertion', 'type " Costs ok" after "omega three"', [[' Costs ok', 'Tracked words plus more'], True], [ins3, para.endswith('omega three Costs ok')])
    select_text(page, '#docEl', 'Second page'); page.keyboard.press('Delete'); settle(page, 300)
    dels = page.evaluate("[...document.querySelectorAll('#docEl del.wn-del')].map(i=>[i.textContent, i.dataset.author])")
    check('F22 deletion kept and marked', 'delete "Second page"', [['Second page', 'Test Reviewer']], dels)
    page.click('#ribbon .rb-btn:text-is("Accept all")'); settle(page, 300)
    txt = page.inner_text('#docEl')
    check('F22 accept all applies changes', 'Accept all', [0, 0, True, False], [page.locator('#docEl ins.wn-ins').count(), page.locator('#docEl del.wn-del').count(), 'Tracked words' in txt, 'Second page text' in txt])
    page.click('#ribbon .rb-btn:text-is("Track changes")')

    # ---------- F23 comments ----------
    select_text(page, '#docEl', 'Tracked'); page.click('#ribbon .rb-btn:text-is("New comment") >> nth=0')
    page.fill('dialog.dlg textarea', 'Check this wording.'); dlg_fill_click(page, 'Add comment'); settle(page, 300)
    check('F23 comment anchored and listed', 'comment on "Tracked"', [1, 'Comments (1)'], [page.locator('#docEl .wn-comment').count(), page.inner_text('#sidePanel h2')])
    page.click('#sidePanel button:text-is("Delete")'); settle(page, 200)
    check('F23 comment deleted', 'Delete', 0, page.locator('#docEl .wn-comment').count())

    # ---------- F24 revisions compare ----------
    page.click('#ribbon .rb-btn:text-is("Save revision")'); type_body(page, 'Brand new sentence'); settle(page, 500)
    page.click('#ribbon .rb-btn:text-is("Compare…")'); dlg_fill_click(page, 'Compare'); settle(page, 300)
    cmp_text = page.inner_text('dialog.dlg')
    check('F24 compare shows added words', 'added "Brand new sentence"', True, '3 words added' in cmp_text and 'Brand new sentence' in page.inner_text('dialog.dlg ins'))
    page.click('dialog.dlg .dlg-actions button')

    # ---------- F25/F26 protection ----------
    page.click('#ribbon .rb-btn:text-is("Read-only")'); settle(page, 200)
    check('F25 read-only locks editing', 'Read-only', 'false', page.get_attribute('#docEl', 'contenteditable'))
    page.click('#ribbon .rb-btn:text-is("Read-only")'); settle(page, 200)
    check('F25 read-only off', 'Read-only again', 'true', page.get_attribute('#docEl', 'contenteditable'))
    page.click('#ribbon .rb-btn:text-is("Password lock…")')
    page.fill('dialog.dlg input >> nth=0', 'abcd'); page.fill('dialog.dlg input >> nth=1', 'abce'); dlg_fill_click(page, 'Lock')
    check('F26 mismatched passwords explained', 'abcd / abce', True, 'different' in page.inner_text('dialog.dlg .dlg-err'))
    page.fill('dialog.dlg input >> nth=1', 'abcd'); dlg_fill_click(page, 'Lock'); settle(page, 300)
    page.click('#lockBannerBtn'); page.fill('dialog.dlg input', 'wrong'); dlg_fill_click(page, 'Unlock'); settle(page, 200)
    check('F26 wrong password rejected', 'wrong', True, 'not correct' in page.inner_text('dialog.dlg .dlg-err'))
    page.fill('dialog.dlg input', 'abcd'); dlg_fill_click(page, 'Unlock'); settle(page, 300)
    check('F26 right password unlocks', 'abcd', 'true', page.get_attribute('#docEl', 'contenteditable'))

    # ---------- F35-F37 equation, chart, shape; F41 link validation ----------
    page.click('#ribbon .rb-tab:text-is("Insert")'); page.click('#ribbon .rb-btn:text-is("Equation…")')
    page.fill('dialog.dlg textarea', '\\frac{a}{b} + x^2'); dlg_fill_click(page, 'Insert'); settle(page, 300)
    check('F35 equation inserted as MathML', '\\frac{a}{b} + x^2', [1, 1], [page.locator('#docEl .wn-eq math mfrac').count(), page.locator('#docEl .wn-eq msup').count()])
    page.click('#ribbon .rb-btn:text-is("Chart…")'); dlg_fill_click(page, 'Insert'); settle(page, 300)
    check('F36 chart inserted with data table', 'default 3 rows', [1, 3], [page.locator('#docEl .wn-chart svg').count(), page.locator('#docEl .wn-chart .wn-chart-data tbody tr').count()])
    page.click('#docEl .wn-chart-toggle'); settle(page, 200)
    check('F36 chart/table toggle', 'click Show table', 'table', page.get_attribute('#docEl .wn-chart', 'data-display'))
    page.click('#ribbon .rb-btn:text-is("Shapes…")'); dlg_fill_click(page, 'Insert'); settle(page, 300)
    check('F37 shape inserted', 'rectangle', 1, page.locator('#docEl .wn-shape svg rect').count())
    page.click('#docEl .wn-shape'); page.click('#ribbon .rb-tab:text-is("Design & layout")'); page.select_option('#ribbon [data-sel="wrap"]', 'square'); settle(page, 200)
    check('F37 wrap square on selected shape', 'Wrap: Square', True, 'wrap-square' in page.get_attribute('#docEl .wn-shape', 'class'))
    page.click('#ribbon .rb-tab:text-is("Insert")'); page.click('#ribbon .rb-btn:text-is("Link…")')
    page.fill('dialog.dlg input[type=url]', 'javascript:alert(1)'); dlg_fill_click(page, 'Insert')
    check('F41 javascript: link rejected', 'javascript:alert(1)', True, 'https://' in page.inner_text('dialog.dlg .dlg-err'))
    page.keyboard.press('Escape')

    # ---------- F44 paste sanitising ----------
    page.evaluate("""() => { const d = document.getElementById('docEl'); const p = document.createElement('p'); p.textContent = 'paste here'; d.appendChild(p);
      const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); d.focus();
      const dt = new DataTransfer(); dt.setData('text/html', '<b onclick="alert(1)">bold</b><img src="x" onerror="alert(2)"><script>alert(3)</script><a href="javascript:alert(4)">bad</a>'); dt.setData('text/plain', 'bold');
      d.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
    settle(page, 300)
    html = page.inner_html('#docEl')
    check('F44 pasted HTML sanitised', '<b onclick>, <img onerror>, <script>, javascript: link', [False, False, False, False, True], ['onclick' in html, 'onerror' in html, '<script' in html, 'javascript:' in html, 'bold' in page.inner_text('#docEl')])

    # ---------- F38 view modes ----------
    page.click('#ribbon .rb-tab:text-is("View")')
    page.click('#ribbon .rb-btn:text-is("Read mode")'); check('F38 read mode opens', 'Read mode', 1, page.locator('.ov-read').count()); page.keyboard.press('Escape')
    check('F38 Esc closes read mode', 'Esc', 0, page.locator('.ov-read').count())
    page.click('#ribbon .rb-btn:text-is("Outline")'); check('F38 outline lists headings', 'Outline', True, page.locator('.ov-outline .ol-tree li').count() >= 1); page.keyboard.press('Escape')
    page.click('#ribbon .rb-btn:text-is("Immersive reader")'); check('F38 immersive reader opens', 'Immersive', 1, page.locator('.ov-imm .imm-text').count()); page.keyboard.press('Escape')
    page.click('#ribbon .rb-btn:text-is("Focus")'); check('F38 focus mode hides top bar', 'Focus', False, page.is_visible('.topbar')); page.keyboard.press('Escape')
    check('F38 Esc leaves focus mode', 'Esc', True, page.is_visible('.topbar'))
    page.click('#ribbon .rb-btn:text-is("Navigation pane")'); settle(page, 500); check('F38 navigation pane lists headings', 'Navigation pane', True, page.locator('#navPane .nav-list li').count() >= 1)
    page.select_option('#ribbon [data-sel="split"]', 'vertical'); settle(page, 500); check('F38 split view shows live copy', 'Split side by side', True, page.is_visible('#splitPane .split-flow'))
    page.select_option('#ribbon [data-sel="split"]', 'off')
    page.click('#ribbon .rb-btn:text-is("Multiple pages")'); settle(page, 300)
    check('F38 multiple pages preview has one box per page', 'pages', page.evaluate('WN.debug.pages()'), page.locator('.ov-multi .pp').count()); page.keyboard.press('Escape')
    page.click('#ribbon .rb-btn:text-is("Navigation pane")')

    # ---------- F27 confirm end: polish + summary + final ----------
    new_doc(page, 'mom')
    page.fill('#intake [data-key="title"]', 'Polish test')
    type_body(page, 'hello  world . this is i'); settle(page, 500)
    page.click('#confirmEndBtn'); page.click('dialog.dlg .dlg-actions button:text-is("Confirm end of document")'); settle(page, 800)
    body = page.inner_text('#docEl')
    check('F27 polish fixes spacing and capitals', '"hello  world . this is i"', True, 'Hello world. This is I' in body)
    check('F27 summary section added', 'confirm', 1, page.locator('#docEl .wn-summary').count())
    check('F27 final review locks and shows banner', 'confirm', [True, 'false', 'Final'], [page.is_visible('#finalBanner'), page.get_attribute('#docEl', 'contenteditable'), page.inner_text('#edStatus')])
    page.click('#reopenBtn'); settle(page, 300)
    check('F27 reopen for editing', 'Reopen', 'true', page.get_attribute('#docEl', 'contenteditable'))

    # ---------- F45 book mode ----------
    new_doc(page, 'book')
    page.fill('#intake [data-key="title"]', 'Made-up book notes')
    page.fill('#intake [data-key="concepts"]', 'Stock: an accumulation\nFlow: a rate')
    page.fill('#intake [data-key="diagram"]', 'Loops\n  Reinforcing\n  Balancing')
    settle(page, 500)
    check('F45 concepts as definition list', '2 lines', 2, page.locator('#docEl .wn-concepts dt').count())
    check('F45 mind map nests by indent', '2 children under Loops', 2, page.locator('#docEl .wn-map .wn-map li').count())

    # ---------- F28/F29 CSV export and import ----------
    page.goto(BASE + '#edit/' + doc_id); settle(page, 800)
    with page.expect_download() as dl:
        page.select_option('#exportSel', 'csv')
    raw = open(dl.value.path(), 'rb').read()
    text = raw.decode('utf-8')
    check('F28 CSV has UTF-8 BOM', 'export actions', True, raw.startswith(b'\xef\xbb\xbf'))
    # Hand-worked: Mon 02/11/2026 starts ISO week 45 (Wed 28/10 is in CW44), so both actions are CW45.
    check('F28 CSV rows with dd/mm dates, ISO week and FY, no cost column', '2 actions', True, 'Book the venue,M. Das,02/11/2026,Done,CW45,FY 2026-27' in text and 'Update the plan,K. Iyer,04/11/2026,Open,CW45,FY 2026-27' in text and 'Cost' not in text)
    csv_in = 'Exported from a made-up tracker\nGenerated 01/11/2026\n\nAction Item,Assignee,Deadline,Amount,State\nDraft memo,Asha,05/11/2026,"1,23,456.78",Open\n,Nobody,05/11/2026,10,Open\nCheck date,Ravi,31/02/2026,5,Open\nClose out,Zed,,0.05,Done\n'
    page.click('.rows-fld .rows-head button:text-is("Import CSV")')
    page.set_input_files('dialog.dlg input[type=file]', {'name': 'actions.csv', 'mimeType': 'text/csv', 'buffer': csv_in.encode()})
    page.wait_for_selector('dialog.dlg .import-preview table'); settle(page, 200)
    statuses = page.eval_on_selector_all('dialog.dlg .import-preview tbody tr td:nth-child(2)', 't=>t.map(x=>x.textContent)')
    check('F29 header found after preamble', 'header on line 4', True, 'Header found on line 4' in page.inner_text('dialog.dlg .import-preview'))
    check('F29 preview status per row', '4 data rows', ['Ready', 'Skipped: Task is empty. Add a short task description.', 'Skipped: Due date: Feb 2026 has 28 days. Check the day.', 'Ready'], statuses)
    before_n = len(page.evaluate('WN.debug.doc().fields.mom.actions'))
    check('F29 nothing saved before Import', 'preview open', 2, before_n)
    dlg_fill_click(page, 'Import'); settle(page, 900)
    acts = page.evaluate('WN.debug.doc().fields.mom.actions')
    check('F29 import adds only valid rows; an Amount column is ignored', '2 ready rows', [4, 'Draft memo', 'Close out', False], [len(acts), acts[2]['task'], acts[3]['task'], 'cost' in acts[2]])

    # ---------- F31 dashboard figures vs independent computation ----------
    page.goto(BASE + '#dash'); settle(page, 600)
    metas = page.evaluate('WN.debug.metas()')
    exp_docs = len(metas)
    exp_open = sum(1 for m in metas for a in m['actions'] if not a['done'])
    today = page.evaluate('WN.dates.localISO()')
    exp_over = sum(1 for m in metas for a in m['actions'] if not a['done'] and a['due'] and a['due'] < today)
    exp_acts = sum(len(m['actions']) for m in metas)
    kpis = page.eval_on_selector_all('#kpis .kpi-value', 'k=>k.map(x=>x.textContent)')
    check('F31 dashboard documents count', 'Python count of metas', str(exp_docs), kpis[0])
    check('F31 dashboard open actions', 'Python count of open actions', str(exp_open), kpis[2])
    check('F31 dashboard overdue actions and no cost tile (1.2.0)', f'Python count = {exp_over}', [str(exp_over), 4], [kpis[3], len(kpis)])
    page.click('.chart-card:has-text("Action items") button:text-is("Table")')
    rows = page.eval_on_selector_all('.chart-card:has-text("Action items") tbody tr', 'r=>r.map(x=>x.textContent)')
    check('F31 chart/table toggle shows numbers', 'Table view', True, len(rows) == 3)

    # ---------- F30 backup round trip into an empty copy ----------
    page.goto(BASE + '#settings'); settle(page, 400)
    with page.expect_download() as dl2:
        page.click('#backupExport')
    backup = open(dl2.value.path(), 'rb').read()
    ctx2 = b.new_context(viewport={'width': 1366, 'height': 900}); ctx2.add_init_script(INIT)
    p2 = open_app(ctx2, '#settings')
    check('F30 empty copy starts with 0 documents', 'new browser profile', 0, len(p2.evaluate('WN.debug.metas()')))
    p2.click('#backupImport'); p2.set_input_files('dialog.dlg input[type=file]', {'name': 'b.json', 'mimeType': 'application/json', 'buffer': backup})
    p2.wait_for_selector('dialog.dlg .import-preview table'); settle(p2, 200)
    check('F30 nothing imported before pressing Import', 'preview', 0, len(p2.evaluate('WN.debug.metas()')))
    p2.click('dialog.dlg .dlg-actions button:text-is("Import")'); settle(p2, 900)
    m2 = p2.evaluate('WN.debug.metas()')
    check('F30 round trip counts match', f'{exp_docs} docs', exp_docs, len(m2))
    check('F30 round trip action counts match', f'{exp_acts} actions', exp_acts, sum(len(m['actions']) for m in m2))
    check('F30 round trip word counts match', 'sum of words', sum(m['words'] for m in metas), sum(m['words'] for m in m2))
    ctx2.close()

    # ---------- F32 sync through a folder (OPFS stands in for OneDrive) ----------
    sc = b.new_context(viewport={'width': 1366, 'height': 900}); sc.add_init_script(INIT + """
      window.showDirectoryPicker = async () => { const root = await navigator.storage.getDirectory(); return root.getDirectoryHandle('sync', { create: true }); };""")
    sp = open_app(sc, '#home')
    new_doc(sp, 'blank'); sp.fill('#edTitle', 'Device A note'); settle(sp, 900)
    a_id = sp.evaluate('WN.debug.doc().id')
    sp.goto(BASE + '#settings'); sp.click('#syncChoose'); wait_js(sp, "WN.debug.syncState() === 'saved'")
    names = sp.evaluate("(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('sync'); const out = []; for await (const [n] of d.entries()) out.push(n); return out; })()")
    check('F32 one gzip save file written', 'choose folder', 1, len([n for n in names if re.match(r'^wrapnote-save-\w+-\d{14}\.json\.gz$', n)]))
    # Simulated device B writes a new note and deletes device A's note at the same moment.
    sp.evaluate("""async (aid) => {
      const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('sync');
      const now = Date.now() + 5000;
      const rec = { id: 'dDEVB1', u: now, created: now, mode: 'blank', title: 'Device B note', category: 'General', status: 'draft', html: '<p>from B</p>',
        fields: { mom: { actions: [] , present: [], absent: []}, book: { quotes: [], recall: [] } }, layout: {}, comments: [], revisions: [], protect: { mode: 'none' }, summary: [] };
      const payload = JSON.stringify({ app: 'wrapnote', v: 1, device: 'devB', t: now, records: [rec, { id: aid, d: 1, u: now }] });
      const gz = await new Response(new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
      const fh = await d.getFileHandle('wrapnote-save-devB-20991231235959.json.gz', { create: true }); const w = await fh.createWritable(); await w.write(gz); await w.close();
      const bad = await d.getFileHandle('wrapnote-save-devC-20991231235958.json.gz', { create: true }); const w2 = await bad.createWritable(); await w2.write('not gzip yet'); await w2.close();
      for (const s of ['20000101000001', '20000101000002', '20000101000003']) { const h = await d.getFileHandle('wrapnote-save-' + localStorage.getItem('wrapnote:device').replace(/"/g,'') + '-' + s + '.json.gz', { create: true }); const ww = await h.createWritable(); await ww.write(gz); await ww.close(); }
    }""", a_id)
    sp.click('#syncNow'); wait_js(sp, "WN.debug.syncState() === 'saved'"); settle(sp, 500)
    titles = sorted(m['title'] for m in sp.evaluate('WN.debug.metas()'))
    check('F32 other device addition arrives; its deletion removes ours; unreadable file skipped', 'devB adds + tombstones A; devC file corrupt', ['Device B note'], titles)
    names = sp.evaluate("(async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('sync'); const out = []; for await (const [n] of d.entries()) out.push(n); return out; })()")
    dev = sp.evaluate("JSON.parse(localStorage.getItem('wrapnote:device'))")
    mine = [n for n in names if n.startswith('wrapnote-save-' + dev + '-')]
    check('F32 keeps newest 3 own save files', '1 session file + 3 old ones', 3, len(mine))
    check('F32 error log written next to the data', 'corrupt devC file', True, 'wrapnote-errors.log' in names)
    check('F32 sync state shown', 'after sync', 'Saved and synced', sp.inner_text('#syncPill .txt'))

    sc.close()

    # ---------- F33 offline: reopen with the network off ----------
    # Runs in the main profile. (Headless Chrome crashes a tab that reads a browser-private OPFS folder
    # handle back from IndexedDB, so the sync profile above cannot be reused; real folder handles are fine.)
    page.goto(BASE + '#docs'); wait_js(page, "navigator.serviceWorker && navigator.serviceWorker.controller !== null", 15000)
    n_online = len(page.evaluate('WN.debug.metas()'))
    ctx.set_offline(True)
    page.reload(); wait_js(page, 'document.body.classList.contains("ready")')
    check('F33 page opens offline and data remains', 'airplane mode + reload', n_online, len(page.evaluate('WN.debug.metas()')))
    page.close(); page = ctx.new_page(); page.goto(BASE + '#home'); wait_js(page, 'document.body.classList.contains("ready")')
    check('F33 new tab opens offline', 'airplane mode + new tab', n_online, len(page.evaluate('WN.debug.metas()')))
    ctx.set_offline(False)

    # ---------- F42 dark mode ----------
    page.goto(BASE + '#home'); settle(page, 300)
    page.click('#themeBtn'); settle(page, 100)
    theme = page.get_attribute('html', 'data-theme')
    page.click('#themeBtn')
    check('F42 theme toggles to dark and back', 'click twice', ['dark', 'light'], [theme, page.get_attribute('html', 'data-theme')])

    # ---------- F34 phone widths: no sideways scroll, 44 px targets ----------
    for w in (320, 360, 390):
        pc = b.new_context(viewport={'width': w, 'height': 780}, is_mobile=True, has_touch=True); pc.add_init_script(INIT)
        pp_ = open_app(pc, '#home')
        bad_scroll, small = [], []
        for hsh in ['#home', '#docs', '#dash', '#guide', '#settings', 'NEW']:
            if hsh == 'NEW': pp_.click('#page-home [data-new="mom"]') if pp_.is_visible('#page-home [data-new="mom"]') else (pp_.goto(BASE + '#home'), pp_.click('#page-home [data-new="mom"]')); settle(pp_, 700)
            else: pp_.goto(BASE + hsh); settle(pp_, 400)
            sw = pp_.evaluate('document.documentElement.scrollWidth')
            if sw > w: bad_scroll.append((hsh, sw))
            tiny = pp_.evaluate("""() => [...document.querySelectorAll('button, a, input, select, textarea, summary, [role=button]')].filter(e => {
              const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.right <= 0 || r.bottom <= 0) return false; const st = getComputedStyle(e); if (st.visibility === 'hidden') return false;
              if (e.closest('#docEl, .sheet, dialog, .toasts, .overlay')) return false;
              if (e.tagName === 'A' && e.closest('p, li, dd, td') && !e.classList.contains('btn')) return false; // inline text links (WCAG 2.5.8 inline exception)
              if (e.type === 'checkbox' || e.type === 'color' || e.type === 'file' || e.type === 'range') return false;
              return r.height < 43.5; }).map(e => (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height))""")
            small += [(hsh, t) for t in tiny]
        check(f'F34 no sideways scroll at {w} px', '6 screens', [], bad_scroll)
        check(f'F34 touch targets >= 44 px at {w} px', '6 screens', [], small[:40])
        pc.close()
    b.close()

with sync_playwright() as p:
    t0 = time.time()
    try:
        run_all(p)
    except Exception as e:
        import traceback; traceback.print_exc()
        results.append({'name': 'RUNNER CRASH', 'input': '', 'expected': 'no crash', 'actual': repr(e), 'pass': False})
    passed = sum(r['pass'] for r in results)
    print(f'\nRound {args.round}: {passed}/{len(results)} checks passed in {time.time() - t0:.1f} s')
    os.makedirs('tests/e2e/reports', exist_ok=True)
    json.dump(results, open(f'tests/e2e/reports/round{args.round}.json', 'w'), indent=1, ensure_ascii=False)
    sys.exit(0 if passed == len(results) else 1)

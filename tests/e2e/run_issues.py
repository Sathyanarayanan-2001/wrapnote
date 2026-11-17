"""WrapNote 1.1.0 browser tests for the four reported issues.

Each check states its input and the expected result worked out by hand. They were written first and
run against version 1.0.0 to reproduce the problems, then kept as regression tests.
Run: python tests/e2e/run_issues.py [--base URL] [--chrome PATH] [--round NAME]
All pictures and text are generated here; no real data is used.
"""
import argparse, json, os, struct, sys, time, zlib
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='http://localhost:8765/')
ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
ap.add_argument('--round', default='dev')
args = ap.parse_args()
BASE = args.base
INIT = "localStorage.setItem('wrapnote:quickDone','true');"
results = []

def check(name, given, expected, actual, ok=None):
    passed = (expected == actual) if ok is None else bool(ok)
    results.append({'name': name, 'input': given, 'expected': expected, 'actual': actual, 'pass': passed})
    print(('PASS ' if passed else 'FAIL ') + name + ('' if passed else f'  expected={expected!r} actual={actual!r}'))

def banded_png(w, h, top=(220, 30, 30), mid=(240, 240, 240), bottom=(30, 60, 220)):
    """A tall 'phone screenshot': red header band (top 10 %), grey body, blue button band (bottom 10 %)."""
    rows = []
    for y in range(h):
        c = top if y < h // 10 else bottom if y >= h - h // 10 else mid
        rows.append(b'\x00' + bytes(c) * w)
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(b''.join(rows))) + ch(b'IEND', b'')

def shot(name):  # 1080 x 1920 scaled to 108 x 192 keeps the same 9:16 ratio and keeps the test fast
    return {'name': name, 'mimeType': 'image/png', 'buffer': banded_png(108, 192)}

def wait_js(page, expr, timeout=10000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if page.evaluate(expr): return True
        except Exception: pass
        page.wait_for_timeout(150)
    raise TimeoutError('timed out waiting for ' + expr)

def open_app(ctx, hash_='#home'):
    page = ctx.new_page()
    page.goto(BASE + hash_, wait_until='networkidle'); wait_js(page, 'document.body.classList.contains("ready")')
    return page

def toasts(page): return page.eval_on_selector_all('#toasts .toast', 't => t.map(x => x.textContent)')

def colours_in(page, selector):
    """Second method for 'nothing cropped': photograph the element and look for the red top and blue bottom bands."""
    png = page.locator(selector).screenshot()
    import io
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(png)).convert('RGB'); px = list(im.getdata())
    except ImportError:
        return None
    red = sum(1 for r, g, b in px if r > 180 and g < 90 and b < 90)
    blue = sum(1 for r, g, b in px if b > 180 and r < 90 and g < 120)
    return red, blue

def add_shot(page, files, mode='Insert screenshot as image'):
    page.set_input_files('#intake .adder input[type=file] >> nth=1', files)
    page.wait_for_selector('.prompt .choice-row button:text-is("' + mode + '")')
    page.click('.prompt button:text-is("' + mode + '")')
    page.wait_for_timeout(700)

def run(p):
    kw = {'args': ['--no-sandbox']}
    if args.chrome: kw['executable_path'] = args.chrome
    b = p.chromium.launch(**kw)
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}); ctx.add_init_script(INIT)

    # ---------- Issue 4: guide links ----------
    page = open_app(ctx, '#guide')
    links = page.eval_on_selector_all('.toc-guide a', 'a => a.map(x => [x.getAttribute("href"), x.textContent.trim()])')
    bad = []
    for href, text in links:
        page.goto(BASE + '#guide'); page.wait_for_timeout(200)
        page.evaluate("document.getElementById('toasts').textContent = ''")
        page.click(f'.toc-guide a:text-is("{text}")'); page.wait_for_timeout(450)
        sec = href.split('/')[-1].lstrip('#')
        top = page.evaluate(f'(() => {{ const s = document.getElementById({sec!r}); return s ? Math.round(s.getBoundingClientRect().top) : null; }})()')
        # The last sections cannot rise to the top once the page is scrolled to its end; then "in view" is enough.
        at_end = page.evaluate('Math.ceil(window.scrollY + innerHeight) >= document.documentElement.scrollHeight - 2')
        if at_end and top is not None and 0 <= top < page.evaluate('innerHeight') - 40: top = 0
        heading = page.evaluate(f'(() => {{ const s = document.getElementById({sec!r}); return s ? s.querySelector("h2").textContent : ""; }})()')
        ok = (not toasts(page)) and page.is_visible('#page-guide') and top is not None and -5 <= top <= 160 and text.split()[0].lower() in heading.lower()
        if not ok: bad.append((text, href, toasts(page), top))
    check('I1 every guide contents link scrolls to its section without an error', f'click {len(links)} links', [], bad)
    page.goto(BASE + '#g-ribbon'); page.wait_for_timeout(500)
    top = page.evaluate("Math.round(document.getElementById('g-ribbon').getBoundingClientRect().top)")
    check('I2 an old bookmark #g-ribbon opens the guide at the ribbon section', '#g-ribbon', [True, [], True], [page.is_visible('#page-guide'), toasts(page), -5 <= top <= 160])
    page.goto(BASE + '#home'); page.wait_for_timeout(300); page.evaluate("document.getElementById('toasts').textContent = ''")
    page.focus('.skip'); page.keyboard.press('Enter'); page.wait_for_timeout(300)
    check('I3 the skip link moves focus to the content without an error', 'focus skip link, Enter', [[], 'main'], [toasts(page), page.evaluate('document.activeElement.id')])
    page.goto(BASE + '#guide/g-nope'); page.wait_for_timeout(300)
    check('I4 a bad section in the address is rejected with a clear message', '#guide/g-nope', True, any('section' in t.lower() for t in toasts(page)))

    # ---------- Issue 2: screenshots one after another into a 2 x 2 grid ----------
    page.goto(BASE + '#home'); page.click('#page-home [data-new="book"]'); page.wait_for_selector('#editor:not([hidden])'); page.wait_for_timeout(500)
    add_shot(page, [shot('A.png')])
    check('G1 screenshot A becomes one picture block', 'add A', 1, page.locator('#docEl [data-btype=shots]').count())
    page.click('.block-list li >> nth=0 >> button:text-is("Arrange")')
    page.click('.prompt button:text-is("2×2 grid")'); page.wait_for_timeout(600)
    fit = page.evaluate("getComputedStyle(document.querySelector('#docEl [data-btype=shots] img')).objectFit")
    check('G2 A fits its cell without cropping (object-fit)', 'Edit -> 2x2 grid', 'contain', fit)
    bands = colours_in(page, '#docEl [data-btype=shots] figure.wn-img >> nth=0')
    check('G3 A keeps its top header and bottom buttons (pixel check)', 'red top band and blue bottom band both visible', True, bands is not None and bands[0] > 20 and bands[1] > 20)
    # Hand calculation (A4, normal margins): writing height = (297 - 2 x 25.4) mm x 96 / 25.4 = 933.3 px.
    # Each cell is capped at (933.3 - 48) / 2 = 442.6 px, so two rows plus the gap fit one page.
    # When the cap applies the cell is wider than the picture; object-fit: contain still shows the picture whole (G3).
    cell_h = page.evaluate("Math.round(document.querySelector('#docEl [data-btype=shots] figure.wn-img').getBoundingClientRect().height / (document.getElementById('zoomer').getBoundingClientRect().width / document.getElementById('sheet').offsetWidth))")
    check('G4 a 2 x 2 cell is at most half a page high (442.6 px)', 'tall screenshot, A4', True, cell_h <= 443, ok=cell_h <= 443)
    slots = page.locator('#docEl [data-btype=shots] .wn-slot').count()
    check('G5 the 2 x 2 grid shows 3 empty slots after one picture', '4 - 1', 3, slots)
    add_shot(page, [shot('B.png')])
    blocks = page.locator('#docEl [data-btype=shots]').count()
    imgs = page.locator('#docEl [data-btype=shots] >> nth=0 >> img').count()
    check('G6 screenshot B joins slot 2 of the same grid', 'add B', [1, 2, 2], [blocks, imgs, page.locator('#docEl [data-btype=shots] .wn-slot').count()])
    order = page.evaluate("[...document.querySelectorAll('#docEl [data-btype=shots] img')].map(i => i.alt)")
    check('G7 A stays in slot 1, B goes to slot 2', 'order', ['Screenshot 1', 'Screenshot 2'], order)
    with page.expect_file_chooser() as fc:
        page.click('#docEl [data-btype=shots] .wn-slot >> nth=0')
    fc.value.set_files([shot('C.png')]); page.wait_for_timeout(800)
    check('G8 clicking an empty slot adds the picture to that grid', 'click slot 3, choose C', [1, 3, 1], [page.locator('#docEl [data-btype=shots]').count(), page.locator('#docEl [data-btype=shots] img').count(), page.locator('#docEl [data-btype=shots] .wn-slot').count()])
    page.wait_for_timeout(800)
    saved = page.evaluate('WN.debug.doc().html')
    check('G9 empty slots are never saved', 'saved document', [False, 3], ['wn-slot' in saved, saved.count('<img')])
    add_shot(page, [shot('D.png')]); add_shot(page, [shot('E.png')])
    check('G10 a full 2 x 2 grid starts a new block for the fifth picture', 'add D (slot 4) then E', [2, 4, 0], [page.locator('#docEl [data-btype=shots]').count(), page.locator('#docEl [data-btype=shots] >> nth=0 >> img').count(), page.locator('#docEl [data-btype=shots] >> nth=0 >> .wn-slot').count()])
    page.wait_for_timeout(700)
    same = page.evaluate("(() => { const b = document.querySelector('#docEl [data-btype=shots]'); const H = 297 * 96 / 25.4 + 28; const t = b.offsetTop, e = t + b.offsetHeight; return [Math.floor(t / H), Math.floor((e - 1) / H)]; })()")
    check('G13 a full 2 x 2 grid of tall screenshots sits on one page', 'first and last pixel of the block -> page number', True, same[0] == same[1], ok=same[0] == same[1])
    page.click('#undoBtn'); page.wait_for_timeout(400)
    check('G11 Undo removes the last picture', 'Undo', 1, page.locator('#docEl [data-btype=shots]').count())
    page.evaluate('window.print = () => {}'); page.select_option('#exportSel', 'pdf'); page.wait_for_timeout(300)
    check('G12 print pages carry no empty slots', 'PDF export', 0, page.locator('#print-root .wn-slot').count())
    page.evaluate("window.dispatchEvent(new Event('afterprint'))")

    # ---------- Issue 1: OCR ----------
    page.evaluate("""() => { const c = document.createElement('canvas'); c.width = 900; c.height = 260; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 260); x.fillStyle = '#000'; x.font = 'bold 64px Arial'; x.fillText('MADE UP NOTE', 40, 110); x.fillText('TOTAL 2026', 40, 200);
      window.__ocrPng = c.toDataURL('image/png'); }""")
    data = page.evaluate('window.__ocrPng')
    import base64
    png = base64.b64decode(data.split(',')[1])
    t0 = time.time()
    page.set_input_files('#intake .adder input[type=file] >> nth=1', [{'name': 'text.png', 'mimeType': 'image/png', 'buffer': png}])
    page.wait_for_selector('.prompt .choice-row button:text-is("Extract text (OCR)")'); page.click('.prompt button:text-is("Extract text (OCR)")')
    try: wait_js(page, "[...document.querySelectorAll('#docEl .wn-ocr')].some(o => /MADE/.test(o.textContent))", 90000)
    except TimeoutError: pass
    text = page.evaluate("[...document.querySelectorAll('#docEl .wn-ocr')].map(o => o.textContent).join(' | ')")
    check('O1 OCR reads printed text from a screenshot', '"MADE UP NOTE" / "TOTAL 2026"', True, 'MADE UP NOTE' in text and '2026' in text)
    first_ms = round((time.time() - t0) * 1000)
    t1 = time.time()
    add_shot(page, [{'name': 'text2.png', 'mimeType': 'image/png', 'buffer': png}], 'Extract text (OCR)')
    try: wait_js(page, "[...document.querySelectorAll('#docEl .wn-ocr')].filter(o => /MADE/.test(o.textContent)).length >= 2", 60000)
    except TimeoutError: pass
    second_ms = round((time.time() - t1) * 1000)
    print(f'   OCR timing: first {first_ms} ms (engine load), second {second_ms} ms')
    results.append({'name': 'O1t OCR timing (info)', 'input': '', 'expected': '', 'actual': [first_ms, second_ms], 'pass': True})

    # The OCR picture above joined no grid (text only). Now: a grid receives a screenshot with "Both".
    page.goto(BASE + '#home'); page.click('#page-home [data-new="blank"]'); page.wait_for_selector('#editor:not([hidden])'); page.wait_for_timeout(400)
    add_shot(page, [shot('P.png')]); page.click('.block-list li >> nth=0 >> button:text-is("Arrange")'); page.click('.prompt button:text-is("2×2 grid")'); page.wait_for_timeout(400)
    add_shot(page, [{'name': 'text3.png', 'mimeType': 'image/png', 'buffer': png}], 'Both: image + extracted text')
    try: wait_js(page, "[...document.querySelectorAll('#docEl .wn-ocr')].some(o => /MADE/.test(o.textContent))", 60000)
    except TimeoutError: pass
    page.wait_for_timeout(700)
    info = page.evaluate("(() => { const g = document.querySelector('#docEl [data-btype=shots]'); const n = g.nextElementSibling; return [g.querySelectorAll('img').length, !!g.querySelector('.wn-ocr'), !!(n && n.classList.contains('wn-ocr-block') && /MADE/.test(n.textContent))]; })()")
    check('G14 text from a screenshot that joins a grid follows the grid in its own block', 'grid with P, add text3 with Both', [2, False, True], info)

    # Offline after first use: the service worker kept the engine files, so a new tab reads text without a network.
    wait_js(page, "navigator.serviceWorker && navigator.serviceWorker.controller !== null", 15000)
    ctx.set_offline(True)
    off = ctx.new_page(); off.goto(BASE + '#home'); wait_js(off, 'document.body.classList.contains("ready")')
    off.click('#page-home [data-new="blank"]'); off.wait_for_selector('#editor:not([hidden])'); off.wait_for_timeout(400)
    add_shot(off, [{'name': 'text4.png', 'mimeType': 'image/png', 'buffer': png}], 'Extract text (OCR)')
    try: wait_js(off, "[...document.querySelectorAll('#docEl .wn-ocr')].some(o => /MADE/.test(o.textContent))", 60000)
    except TimeoutError: pass
    check('O3 OCR works offline after it has run once online', 'airplane mode, new tab, Extract text', True, 'MADE UP NOTE' in off.evaluate("[...document.querySelectorAll('#docEl .wn-ocr')].map(o => o.textContent).join(' ')"))
    off.close(); ctx.set_offline(False)

    # Fallback: engine files unreachable (for example offline before first use)
    c2 = b.new_context(viewport={'width': 1366, 'height': 900}); c2.add_init_script(INIT)
    c2.route('**/ocr/**', lambda r: r.abort())
    p2 = open_app(c2)
    p2.click('#page-home [data-new="book"]'); p2.wait_for_selector('#editor:not([hidden])'); p2.wait_for_timeout(400)
    p2.set_input_files('#intake .adder input[type=file] >> nth=1', [{'name': 'text.png', 'mimeType': 'image/png', 'buffer': png}])
    p2.click('.prompt button:text-is("Extract text (OCR)")'); p2.wait_for_timeout(4000)
    msg = ' '.join(toasts(p2))
    check('O2 OCR fallback when the engine cannot load: picture kept, clear message', 'block ocr/ files', [1, 1, True],
          [p2.locator('#docEl [data-btype=shots] img').count(), p2.locator('#docEl .wn-ocr').count(), 'could not' in msg.lower() or 'not available' in msg.lower()])
    c2.close()

    # ---------- Issue 3: crowded editor ----------
    page.goto(BASE + '#home'); page.click('#page-home [data-new="mom"]'); page.wait_for_selector('#editor:not([hidden])'); page.wait_for_timeout(500)
    rb = page.evaluate("Math.round(document.getElementById('ribbon').getBoundingClientRect().height)")
    canvas_top = page.evaluate("Math.round(document.getElementById('edBody').getBoundingClientRect().top)")
    check('R1 ribbon height at 1366 px is 100 px or less', 'simple ribbon', True, rb <= 100, ok=rb <= 100)
    print(f'   ribbon {rb} px, page area starts at {canvas_top} px')
    results.append({'name': 'R1t layout numbers (info)', 'input': '', 'expected': '', 'actual': [rb, canvas_top], 'pass': True})
    n_simple = page.evaluate("(() => { let n = 0; for (const t of document.querySelectorAll('#ribbon .rb-tab')) { t.click(); n += document.querySelectorAll('#ribbon .rb-panel button, #ribbon .rb-panel select, #ribbon .rb-panel input').length; } document.querySelector('#ribbon .rb-tab').click(); return n; })()")
    page.click('#rbCollapse'); page.wait_for_timeout(200)
    check('R2 collapse hides the commands and leaves the tabs', 'Collapse', [False, True], [page.is_visible('#ribbon .rb-panel'), page.is_visible('#ribbon .rb-tabs')])
    page.click('#ribbon .rb-tab:text-is("Insert")'); page.wait_for_timeout(200)
    check('R3 choosing a tab while collapsed opens it', 'click Insert', True, page.is_visible('#ribbon .rb-btn:text-is("Table…")'))
    page.click('#rbMode'); page.wait_for_timeout(200)
    n_full = page.evaluate("(() => { let n = 0; for (const t of document.querySelectorAll('#ribbon .rb-tab')) { t.click(); n += document.querySelectorAll('#ribbon .rb-panel button, #ribbon .rb-panel select, #ribbon .rb-panel input').length; } return n; })()")
    check('R4 full ribbon shows group labels and the same commands', 'Full ribbon', [True, n_simple], [page.is_visible('#ribbon .rb-glabel >> nth=0'), n_full])
    page.reload(); wait_js(page, 'document.body.classList.contains("ready")'); page.goto(BASE + '#docs'); page.goto(BASE + '#home'); page.click('#page-home [data-new="blank"]'); page.wait_for_timeout(500)
    check('R5 the ribbon choice is remembered', 'reload', True, page.is_visible('#ribbon .rb-glabel >> nth=0'))
    page.click('#rbMode')

    # Phone: the page is laid out when the Document view is shown (it measured as empty while hidden).
    pc = b.new_context(viewport={'width': 390, 'height': 780}, is_mobile=True, has_touch=True); pc.add_init_script(INIT)
    pp = open_app(pc); pp.click('#page-home [data-new="book"]'); pp.wait_for_selector('#editor:not([hidden])'); pp.wait_for_timeout(400)
    for n in ['A', 'B']:
        add_shot(pp, [shot(n + '.png')])
        if n == 'A': pp.click('.block-list li >> nth=0 >> button:text-is("Arrange")'); pp.click('.prompt button:text-is("2×2 grid")'); pp.wait_for_timeout(400)
    pp.click('#phoneSwitch button[data-pane="doc"]'); pp.wait_for_timeout(900)
    same = pp.evaluate("(() => { const b = document.querySelector('#docEl [data-btype=shots]'); const H = 297 * 96 / 25.4 + 28; const t = b.offsetTop, e = t + b.offsetHeight; return [Math.floor(t / H), Math.floor((e - 1) / H), WN.debug.pages()]; })()")
    check('P1 phone: after switching to Document the grid sits on one page', '390 px, 2 tall screenshots in 2 x 2', True, same[0] == same[1] and same[2] >= 1, ok=same[0] == same[1])
    pc.close()
    b.close()

with sync_playwright() as p:
    t0 = time.time()
    try: run(p)
    except Exception as e:
        import traceback; traceback.print_exc()
        results.append({'name': 'RUNNER CRASH', 'input': '', 'expected': 'no crash', 'actual': repr(e)[:300], 'pass': False})
    real = [r for r in results if not r['name'].endswith('(info)')]
    passed = sum(r['pass'] for r in real)
    print(f'\nIssues round {args.round}: {passed}/{len(real)} checks passed in {time.time() - t0:.1f} s')
    os.makedirs('tests/e2e/reports', exist_ok=True)
    json.dump(results, open(f'tests/e2e/reports/issues-{args.round}.json', 'w'), indent=1, ensure_ascii=False)
    sys.exit(0 if passed == len(real) else 1)

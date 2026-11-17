"""Scripted first-time-user walkthrough for version 1.2.0: five tasks done only through visible labels and
roles, the way a newcomer would look for them. It finds controls that cannot be discovered by name.
It does not replace a session with a real person. It also times the slowest action (Word export).
Run: python tests/e2e/usability_v120.py [--base URL] [--chrome PATH]
"""
import argparse, os, struct, sys, time, zlib, zipfile
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8765/'); ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
a = ap.parse_args()

def png():  # made-up 160 x 90 picture
    rows = [b'\x00' + b''.join(bytes((30, 120, 90)) if x < 80 else bytes((230, 200, 60)) for x in range(160)) for y in range(90)]
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', 160, 90, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(b''.join(rows))) + ch(b'IEND', b'')

tasks = []
def task(name, fn, pg):
    t = time.time()
    try: fn(pg); ok, note = True, ''
    except Exception as e: ok, note = False, (str(e) or type(e).__name__ + " at line " + str(e.__traceback__.tb_next.tb_lineno if e.__traceback__.tb_next else 0)).splitlines()[0][:180]
    tasks.append((name, ok, round(time.time() - t, 1), note))
    print(('DONE    ' if ok else 'BLOCKED ') + name + (' — ' + note if note else ''))

def wait_js(pg, expr, timeout=15000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if pg.evaluate(expr): return True
        except Exception: pass
        pg.wait_for_timeout(150)
    return False

export_ms = []
with sync_playwright() as p:
    kw = {'args': ['--no-sandbox']}
    if a.chrome: kw['executable_path'] = a.chrome
    b = p.chromium.launch(**kw)
    pg = b.new_context(viewport={'width': 1366, 'height': 860}, accept_downloads=True).new_page()
    pg.goto(a.base); pg.wait_for_timeout(800)

    def t1(pg):  # Start an office document in two taps and fill in the reviewer for the first-page footer.
        pg.get_by_role('button', name='Skip').click()                       # closes the quick start (not a navigation tap)
        pg.get_by_role('button', name='Office document').first.click()      # tap 1
        pg.get_by_label('Reviewer').fill('R. Example')
        pg.wait_for_timeout(500)
        assert 'R. Example' in pg.locator('#sheetFg .pg-foot-office.first').inner_text()
    def t2(pg):  # Add a picture, give it a caption, then add a table of figures.
        pg.get_by_role('button', name='Images. Click, drop, or select and press Ctrl+V').wait_for()
        pg.locator('.adder input[type=file]').first.set_input_files([{'name': 'plan.png', 'mimeType': 'image/png', 'buffer': png()}])
        pg.wait_for_timeout(600)
        pg.get_by_role('tab', name='References').click()
        pg.get_by_role('button', name='Insert caption…').click()
        pg.get_by_label('Caption text').fill('Site plan')
        pg.get_by_role('button', name='Insert', exact=True).click(); pg.wait_for_timeout(500)
        pg.get_by_role('button', name='Table of figures…').click()
        pg.get_by_role('button', name='Insert', exact=True).click(); pg.wait_for_timeout(600)
        links = pg.get_by_label('Document page').get_by_role('link', name='Figure 1: Site plan')
        assert links.count() == 1, 'table of figures: ' + repr(pg.eval_on_selector_all('#docEl .wn-tof li, #docEl .wn-caption', 'x => x.map(e => e.className + ":" + e.textContent)'))
    def t3(pg):  # Correct a misspelt word from its right-click suggestions.
        wait_js(pg, 'WN.debug.spellReady()', 30000)
        pg.get_by_label('Document page').get_by_text('[Enter approved content]').first.click()
        pg.keyboard.press('End'); pg.keyboard.type(' The plan is recieved ')
        pg.wait_for_timeout(700)
        box = pg.evaluate("""() => { const h = CSS.highlights.get('wn-spell'); const r = [...h].find(x => x.toString() === 'recieved'); const b = r.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }""")
        pg.mouse.click(box[0], box[1], button='right')
        pg.get_by_role('menu', name='Spelling suggestions for recieved').get_by_role('menuitem', name='received').click()
        pg.wait_for_timeout(300)
        assert 'The plan is received' in pg.get_by_label('Document page').inner_text()
    def t4(pg):  # Colour the pages pale green.
        pg.get_by_role('tab', name='Design & layout').click()
        pg.get_by_role('button', name='Page colour…').click()
        pg.get_by_role('button', name='Pale green').click(); pg.wait_for_timeout(400)
        assert pg.evaluate("getComputedStyle(document.querySelector('#sheetBg .pg-box')).backgroundColor") == 'rgb(226, 240, 217)'
    def t5(pg):  # Export to Word and check the file has the template's header fields.
        t0 = time.time()
        with pg.expect_download() as dl:
            pg.get_by_role('combobox', name='Export').select_option(label='Word (.docx)')
        path = dl.value.path(); export_ms.append(round((time.time() - t0) * 1000))
        z = zipfile.ZipFile(path)
        hdr = ''.join(z.read(n).decode() for n in z.namelist() if n.startswith('word/header'))
        assert 'NUMPAGES' in hdr and 'R. Example' in ''.join(z.read(n).decode() for n in z.namelist() if n.startswith('word/footer'))
        export_ms.append(pg.evaluate('WN.debug.timings().docxMs'))

    for name, fn in [('1 Start an office document and set the reviewer', t1), ('2 Caption a picture and add a table of figures', t2),
                     ('3 Fix a misspelt word from its suggestions', t3), ('4 Colour the pages pale green', t4), ('5 Export to Word (.docx)', t5)]:
        task(name, fn, pg)
    b.close()

done = sum(1 for t in tasks if t[1])
print(f'\nUsability walkthrough 1.2.0: {done}/5 tasks completed; times (s): ' + ', '.join(str(t[2]) for t in tasks))
if export_ms: print(f'Slowest action, Word export: {export_ms[0]} ms until the download started; {export_ms[-1]} ms inside the app')
sys.exit(0 if done == 5 else 1)

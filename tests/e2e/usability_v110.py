"""Scripted first-time-user walkthrough for version 1.1.0: five tasks done only through visible labels and
roles, the way a newcomer would look for them. It finds controls that cannot be discovered by name.
It does not replace a session with a real person.
Run: python tests/e2e/usability_v110.py [--base URL] [--chrome PATH]
"""
import argparse, base64, os, struct, sys, time, zlib
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8765/'); ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
a = ap.parse_args()

def tall_png():  # made-up 9:16 phone screenshot, 108 x 192
    rows = [b'\x00' + bytes((200, 40, 40) if y < 19 else (40, 60, 210) if y > 172 else (235, 235, 235)) * 108 for y in range(192)]
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', 108, 192, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(b''.join(rows))) + ch(b'IEND', b'')

tasks = []
def task(name, fn, pg):
    t = time.time()
    try: fn(pg); ok, note = True, ''
    except Exception as e: ok, note = False, str(e).splitlines()[0][:180]
    tasks.append((name, ok, round(time.time() - t, 1), note))
    print(('DONE    ' if ok else 'BLOCKED ') + name + (' — ' + note if note else ''))

with sync_playwright() as p:
    kw = {'args': ['--no-sandbox']}
    if a.chrome: kw['executable_path'] = a.chrome
    b = p.chromium.launch(**kw)
    pg = b.new_context(viewport={'width': 1366, 'height': 860}).new_page()
    pg.goto(a.base); pg.wait_for_timeout(800)
    shot = lambda n: {'name': n, 'mimeType': 'image/png', 'buffer': tall_png()}

    def t1(pg):  # Start study notes from the first screen in two taps or fewer.
        pg.get_by_role('button', name='Skip').click()                       # closes the quick start (not a navigation tap)
        pg.get_by_role('button', name='New study notes').first.click()      # tap 1
        pg.get_by_label('Book or document title').fill('App review (made-up)')
        assert pg.get_by_label('Document page').is_visible()
    def t2(pg):  # Add a phone screenshot and arrange it as a 2 x 2 grid.
        pg.get_by_role('button', name='Screenshots. Click, drop, or select and press Ctrl+V').wait_for()
        pg.locator('.adder input[type=file]').nth(1).set_input_files([shot('a.png')])
        pg.get_by_role('button', name='Insert screenshot as image').click()
        pg.get_by_role('button', name='Arrange block 1').click()
        pg.get_by_role('button', name='2×2 grid').click()
        pg.wait_for_timeout(400)
        assert pg.get_by_role('button', name='Empty slot. Add a picture to this grid.').count() == 3
    def t3(pg):  # Add a second screenshot later and see it next to the first.
        pg.locator('.adder input[type=file]').nth(1).set_input_files([shot('b.png')])
        pg.get_by_role('button', name='Insert screenshot as image').click(); pg.wait_for_timeout(500)
        page = pg.get_by_label('Document page')
        assert page.get_by_role('img', name='Screenshot 2').count() == 1 and pg.get_by_role('button', name='Empty slot. Add a picture to this grid.').count() == 2
    def t4(pg):  # Read the text in a screenshot.
        data = pg.evaluate("""() => { const c = document.createElement('canvas'); c.width = 700; c.height = 160; const x = c.getContext('2d');
          x.fillStyle = '#fff'; x.fillRect(0, 0, 700, 160); x.fillStyle = '#000'; x.font = 'bold 56px Arial'; x.fillText('INVOICE 4521', 30, 100); return c.toDataURL(); }""")
        pg.locator('.adder input[type=file]').nth(1).set_input_files([{'name': 't.png', 'mimeType': 'image/png', 'buffer': base64.b64decode(data.split(',')[1])}])
        pg.get_by_role('button', name='Extract text (OCR)').click()
        pg.get_by_label('Document page').get_by_text('INVOICE 4521').wait_for(timeout=90000)
    def t5(pg):  # Find help about the ribbon in the guide, then hide the ribbon to get more room.
        pg.get_by_role('link', name='Guide').first.click()
        pg.get_by_role('navigation', name='Guide contents').get_by_role('link', name='Ribbon').click()
        pg.get_by_role('heading', name='The ribbon').wait_for()
        assert not pg.locator('#toasts .toast.error').count()
        pg.get_by_role('link', name='Editor').first.click()
        pg.get_by_role('button', name='Hide ribbon ▴').click()
        assert not pg.get_by_role('button', name='Format painter').is_visible()

    for name, fn in [('1 Start study notes in two taps', t1), ('2 Arrange a screenshot as a 2×2 grid', t2), ('3 Add a later screenshot beside it', t3),
                     ('4 Read text from a screenshot', t4), ('5 Find ribbon help, then hide the ribbon', t5)]:
        task(name, fn, pg)
    b.close()

done = sum(1 for t in tasks if t[1])
print(f'\nUsability walkthrough 1.1.0: {done}/5 tasks completed; times (s): ' + ', '.join(str(t[2]) for t in tasks))
sys.exit(0 if done == 5 else 1)

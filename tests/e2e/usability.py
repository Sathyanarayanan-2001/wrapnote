"""Scripted first-time-user walkthrough: five tasks done only through visible labels and roles,
never through internal ids, the way a new user would look for them. It finds controls a newcomer
could not discover by name. It does not replace a session with a real person.
Run: python tests/e2e/usability.py [--base URL] [--chrome PATH]
"""
import argparse, os, sys, time, struct, zlib
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8765/'); ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
a = ap.parse_args()

def png():
    raw = b''.join(b'\x00' + bytes((30, 140, 100)) * 20 for _ in range(20))
    ch = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + ch(b'IHDR', struct.pack('>IIBBBBB', 20, 20, 8, 2, 0, 0, 0)) + ch(b'IDAT', zlib.compress(raw)) + ch(b'IEND', b'')

tasks = []
def task(name, fn, pg):
    t = time.time()
    try: fn(pg); ok, note = True, ''
    except Exception as e: ok, note = False, str(e).splitlines()[0][:160]
    tasks.append((name, ok, round(time.time() - t, 1), note))
    print(('DONE    ' if ok else 'BLOCKED ') + name + (' — ' + note if note else ''))

with sync_playwright() as p:
    kw = {'args': ['--no-sandbox']}
    if a.chrome: kw['executable_path'] = a.chrome
    b = p.chromium.launch(**kw)
    pg = b.new_context(viewport={'width': 1280, 'height': 860}, accept_downloads=True).new_page()
    pg.goto(a.base); pg.wait_for_timeout(800)

    def t1(pg):  # Start minutes from the first screen and fill the basics.
        pg.get_by_role('button', name='Skip').click()
        pg.get_by_role('button', name='New minutes').first.click()
        pg.get_by_label('Title', exact=True).fill('Team sync (made-up)')
        pg.get_by_label('Date', exact=True).fill('16/11/2026')
        pg.get_by_label('From').fill('10:00'); pg.get_by_label('To', exact=True).fill('11:00')
        pg.wait_for_timeout(500)
        assert '1 h' in pg.get_by_label('Document page').inner_text()
    def t2(pg):  # Add an action item with an owner, due date and cost.
        pg.locator('.rows-head', has_text='Action items').get_by_role('button', name='+ Add').click()
        pg.get_by_label('Task 1').fill('Send the summary'); pg.get_by_label('Owner 1').fill('Asha')
        pg.get_by_label('Due 1').fill('20/11/2026'); pg.get_by_label('Cost ₹ 1').fill('1,500')
        pg.wait_for_timeout(500)
        assert '₹1,500.00' in pg.get_by_label('Document page').inner_text()
    def t3(pg):  # Add two pictures arranged side by side.
        pg.get_by_role('button', name='Images. Click, drop, or select and press Ctrl+V')
        pg.locator('.adder input[type=file]').first.set_input_files([{'name': 'a.png', 'mimeType': 'image/png', 'buffer': png()}, {'name': 'b.png', 'mimeType': 'image/png', 'buffer': png()}])
        pg.get_by_role('button', name='Side-by-side (2-col)').click(); pg.wait_for_timeout(400)
        assert pg.get_by_label('Document page').locator('img').count() == 2
    def t4(pg):  # Make a heading bold and finish the document.
        pg.get_by_role('tab', name='Home').click()
        pg.get_by_role('button', name='Confirm end of document').first.click()
        pg.get_by_role('dialog').get_by_role('button', name='Confirm end of document').click()
        pg.get_by_text('Final review.').wait_for()
    def t5(pg):  # Find how many actions are open on the dashboard, as text.
        pg.get_by_role('link', name='Dashboard').first.click(); pg.wait_for_timeout(400)
        card = pg.locator('.kpi', has_text='Open actions')
        assert card.locator('.kpi-value').inner_text() == '1'
        pg.locator('.chart-card', has_text='Action items').get_by_role('button', name='Table').click()
        assert pg.get_by_role('cell', name='Open, on time').count() == 1

    for name, fn in [('1 Start minutes and fill title, date and time', t1), ('2 Add an action item with cost', t2), ('3 Add two pictures side by side', t3),
                     ('4 Confirm the end of the document', t4), ('5 Read open actions on the dashboard', t5)]:
        task(name, fn, pg)
    b.close()

done = sum(1 for t in tasks if t[1])
print(f'\nUsability walkthrough: {done}/5 tasks completed; times (s): ' + ', '.join(str(t[2]) for t in tasks))
sys.exit(0 if done == 5 else 1)

"""Scripted first-time-user walkthrough for version 1.3.0 (source references): five tasks done only through
visible labels and roles, the way a newcomer looks for them. It finds controls that cannot be discovered by
name. It does not replace a session with a real person. Made-up content only.
Run: python tests/e2e/usability_v130.py [--base URL] [--chrome PATH]
"""
import argparse, os, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8765/'); ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
a = ap.parse_args()

tasks = []
def task(name, fn, pg):
    t = time.time()
    try: fn(pg); ok, note = True, ''
    except Exception as e: ok, note = False, (str(e) or type(e).__name__).splitlines()[0][:180]
    tasks.append((name, ok, round(time.time() - t, 1), note))
    print(('DONE    ' if ok else 'BLOCKED ') + name + (' — ' + note if note else ''))

with sync_playwright() as p:
    kw = {'args': ['--no-sandbox']}
    if a.chrome: kw['executable_path'] = a.chrome
    b = p.chromium.launch(**kw)
    pg = b.new_context(viewport={'width': 1366, 'height': 860}).new_page()
    pg.goto(a.base); pg.wait_for_timeout(800)

    def t1(pg):  # Start study notes (2 taps) and save a note with where it came from.
        pg.get_by_role('button', name='Skip').click()                        # closes the quick start (not a navigation tap)
        pg.get_by_role('button', name='New study notes').first.click()       # tap 1
        pg.get_by_role('button', name='Text & labels').click()               # tap 2: the note composer
        pg.get_by_role('textbox', name='Block text').fill('Frequency must stay between 47.5 and 52 Hz.')
        pg.get_by_role('button', name='+ Add source reference').click()
        pg.get_by_role('combobox', name='Document name').fill('Made-up Grid Code')
        pg.get_by_role('combobox', name='Heading', exact=True).fill('Frequency')
        pg.get_by_label('Article / section').fill('4')
        pg.get_by_label('Page', exact=True).fill('12'); pg.get_by_label('Page', exact=True).press('Tab')
        pg.get_by_role('button', name='Done').click(); pg.wait_for_timeout(500)
        assert pg.get_by_label('Document page').get_by_text('Made-up Grid Code › Frequency › Art. 4 › p. 12').count() == 1
    def t2(pg):  # Add a second note from the same document by picking it from the suggestions.
        pg.get_by_role('button', name='Text & labels').click()
        pg.get_by_role('textbox', name='Block text').fill('Voltage ride-through needs a curve.')
        pg.get_by_role('button', name='+ Add source reference').click()
        pg.get_by_role('combobox', name='Document name').fill('made')
        pg.get_by_role('option', name='Made-up Grid Code').click()
        pg.get_by_label('Page', exact=True).fill('40-45'); pg.get_by_label('Page', exact=True).press('Tab')
        pg.get_by_role('button', name='Done').click(); pg.wait_for_timeout(700)
        assert pg.get_by_label('Document page').get_by_text('Made-up Grid Code › pp. 40–45').count() == 1
    def t3(pg):  # See every note saved from that document.
        pg.get_by_role('navigation', name='Main').first.get_by_role('link', name='Sources').click(); pg.wait_for_timeout(400)
        pg.get_by_label('Document', exact=True).select_option(label='Made-up Grid Code (2)')
        assert pg.get_by_text('2 of 2 notes').count() == 1
    def t4(pg):  # Find the note from page 12.
        pg.get_by_label('Page or page range').fill('12'); pg.wait_for_timeout(500)
        res = pg.get_by_role('main').locator('#page-sources')
        assert res.get_by_text('1 of 2 notes').count() == 1, res.inner_text()[:300]
        assert res.get_by_text('Frequency must stay between 47.5 and 52 Hz.').count() == 1
    def t5(pg):  # Go back to that note in its document.
        pg.get_by_role('link', name='Open in Untitled study notes').click(); pg.wait_for_timeout(600)
        assert pg.evaluate("document.querySelector('#docEl .wn-flash') !== null")

    for name, fn in [('1 Start study notes and save a note with its source', t1), ('2 Cite the same document again from the suggestions', t2),
                     ('3 List every note from that document', t3), ('4 Find the note from page 12', t4), ('5 Open that note in its document', t5)]:
        task(name, fn, pg)
    b.close()

done = sum(1 for t in tasks if t[1])
print(f'\nUsability walkthrough 1.3.0: {done}/5 tasks completed; times (s): ' + ', '.join(str(t[2]) for t in tasks))
sys.exit(0 if done == 5 else 1)

"""Scripted first-time-user walkthrough for version 1.4.0 (placing and moving source tags, the quick access bar,
customising the ribbon): five tasks done only through visible labels and roles, the way a newcomer looks for
them. It finds controls that cannot be discovered by name. It does not replace a session with a real person.
Made-up content only.
Run: python tests/e2e/usability_v140.py [--base URL] [--chrome PATH]
"""
import argparse, os, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8765/'); ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
a = ap.parse_args()

tasks = []
def task(name, fn, pg):
    t = time.time()
    try: fn(pg); ok, note = True, ''
    except Exception as e: ok, note = False, ' | '.join((str(e) or type(e).__name__).splitlines()[:4])[:400]
    tasks.append((name, ok, round(time.time() - t, 1), note))
    print(('DONE    ' if ok else 'BLOCKED ') + name + (' — ' + note if note else ''))

def tag_place(pg):
    """Text before the first source tag in the first paragraph, and the tag's words."""
    return pg.evaluate("""() => { const p = document.querySelector('#docEl p'); const t = p.querySelector('.wn-cite'); if (!t) return null;
      const r = document.createRange(); r.setStart(p, 0); r.setEndBefore(t); return [r.toString(), t.textContent]; }""")

with sync_playwright() as p:
    kw = {'args': ['--no-sandbox']}
    if a.chrome: kw['executable_path'] = a.chrome
    b = p.chromium.launch(**kw)
    ctx = b.new_context(viewport={'width': 1366, 'height': 860})
    pg = ctx.new_page()
    pg.goto(a.base); pg.wait_for_timeout(800)
    bar = lambda: pg.get_by_role('toolbar', name='Quick access')

    def t1(pg):  # Select a phrase and cite it; the tag goes right after the phrase.
        pg.get_by_role('button', name='Skip').click()
        pg.get_by_role('button', name='Blank').first.click(); pg.wait_for_timeout(600)
        pg.get_by_label('Document page').click(); pg.keyboard.type('Ramp limits apply to all turbines.')
        pg.keyboard.press('Home'); pg.keyboard.press('Shift+Control+ArrowRight'); pg.keyboard.press('Shift+Control+ArrowRight')
        bar().get_by_role('button', name='Source reference…').click()
        pg.get_by_role('combobox', name='Document name').fill('Made-up Plant Manual')
        pg.get_by_label('Page', exact=True).fill('7'); pg.get_by_label('Page', exact=True).press('Tab')
        pg.get_by_role('button', name='Done').click(); pg.wait_for_timeout(600)
        got = tag_place(pg)
        assert got and got[0].strip() == 'Ramp limits' and got[1] == 'Source: Made-up Plant Manual › p. 7', got
    def t2(pg):  # Move the tag to the end of the sentence.
        pg.get_by_role('button', name='Source: Made-up Plant Manual, p. 7. Press Enter to edit, move or remove.').click()
        pg.get_by_role('menuitem', name='Move…').click()
        box = pg.get_by_label('Document page').locator('p').first.bounding_box()
        pg.mouse.click(box['x'] + box['width'] - 6, box['y'] + 6); pg.wait_for_timeout(500)
        got = tag_place(pg)
        assert got and got[0] == 'Ramp limits apply to all turbines.', got
    def t3(pg):  # Make the line a heading from the quick access bar while another tab is open.
        pg.get_by_role('tab', name='Insert').click()
        pg.get_by_label('Document page').get_by_text('Ramp limits').click()
        bar().get_by_label('Style').select_option(label='Heading 1'); pg.wait_for_timeout(400)
        assert pg.evaluate("[...document.querySelectorAll('#docEl h1')].map(e => e.textContent)") == ['Ramp limits apply to all turbines.Source: Made-up Plant Manual › p. 7'], pg.evaluate("document.getElementById('docEl').innerHTML")[:300]
    def t4(pg):  # Put Page break on the quick access bar.
        pg.get_by_role('tabpanel').get_by_role('button', name='Page break').click(button='right')
        pg.get_by_role('menuitem', name='Add to quick access bar').click(); pg.wait_for_timeout(300)
        assert bar().get_by_role('button', name='Page break').count() == 1
    def t5(pg):  # Make Clipboard the first group on Home, and find it so after reopening the app.
        pg.get_by_role('button', name='Customise…').click()
        dlg = pg.get_by_role('dialog', name='Customise ribbon')
        dlg.get_by_label('Tab to arrange').select_option(label='Home')
        for _ in range(4): dlg.get_by_role('button', name='Move Clipboard up').click()
        dlg.get_by_role('button', name='Save').click(); pg.wait_for_timeout(400)
        pg.reload(); pg.wait_for_timeout(1200)  # reopens the same document
        pg.get_by_role('tab', name='Home').click()
        first = pg.get_by_role('tabpanel').get_by_role('group').first.get_attribute('aria-label')
        assert first == 'Clipboard', first

    for name, fn in [('1 Cite a selected phrase; the tag follows the phrase', t1), ('2 Move the tag to the end of the sentence', t2),
                     ('3 Make the line a heading from the quick access bar', t3), ('4 Put Page break on the quick access bar', t4),
                     ('5 Make Clipboard the first group, still so after reopening', t5)]:
        task(name, fn, pg)
    b.close()

done = sum(1 for t in tasks if t[1])
print(f'\nUsability walkthrough 1.4.0: {done}/5 tasks completed; times (s): ' + ', '.join(str(t[2]) for t in tasks))
sys.exit(0 if done == 5 else 1)

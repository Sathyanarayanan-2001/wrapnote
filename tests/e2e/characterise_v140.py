"""WrapNote 1.4.0 characterisation tests: written and first run on 1.3.0, BEFORE the ribbon and source-tag
changes, to pin what must not change.
1. Every ribbon command stays on the same tab (the order may change; nothing may be lost or added by accident).
2. A source attached to a whole note (composer, block list) is still drawn at the end of that note.
3. The stored reference keeps its 1.3.0 shape.
Run: python tests/e2e/characterise_v140.py [--base URL] [--record]   (--record rewrites the pinned inventory)
"""
import argparse, json, os, sys, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8765/'); ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
ap.add_argument('--record', action='store_true')
args = ap.parse_args()
PIN = os.path.join(os.path.dirname(__file__), 'fixtures', 'ribbon-inventory-130.json')
INIT = "localStorage.setItem('wrapnote:quickDone','true');"
results = []
def check(name, inp, exp, act):
    ok = exp == act; results.append(ok)
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f'\n   input: {inp}\n   expected: {exp!r}\n   actual:   {act!r}'))
def wait_js(page, expr, timeout=15000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if page.evaluate(expr): return True
        except Exception: pass
        page.wait_for_timeout(100)
    return False

with sync_playwright() as p:
    kw = {'args': ['--no-sandbox']}
    if args.chrome: kw['executable_path'] = args.chrome
    b = p.chromium.launch(**kw); ctx = b.new_context(viewport={'width': 1366, 'height': 900}); ctx.add_init_script(INIT); page = ctx.new_page()
    page.goto(args.base + '#home'); wait_js(page, 'document.body.classList.contains("ready")')
    page.click('#page-home [data-new="book"]'); page.wait_for_selector('#editor:not([hidden])'); page.wait_for_timeout(600)
    inv = {}
    for t in page.eval_on_selector_all('#ribbon .rb-tab', 'x => x.map(e => e.id)'):
        page.click('#' + t); page.wait_for_timeout(120)
        # Commands of the panel only (the 1.4.0 quick access bar repeats some on purpose).
        inv[t] = sorted(page.eval_on_selector_all('#rbPanel [data-cmd], #rbPanel [data-sel], #rbPanel input[type=color], #rbPanel .rb-num, #rbPanel #zoomRange',
            "x => x.map(e => e.dataset.cmd ? 'cmd:' + e.dataset.cmd : e.dataset.sel ? 'sel:' + e.dataset.sel : 'ctl:' + (e.getAttribute('aria-label') || e.id))"))
    if args.record:
        json.dump(inv, open(PIN, 'w'), indent=1); print('recorded', PIN)
    pinned = json.load(open(PIN))
    check('C1 every ribbon command is still on its tab', 'all six tabs', pinned, inv)
    # A note with a source added in the composer: its tag is the last thing in the note.
    page.locator('#intake .add-btn', has_text='Text & labels').click()
    page.locator('#intake .composer-input').click(); page.keyboard.type('Pinned note.')
    page.locator('#intake .composer').get_by_role('button', name='+ Add source reference').click()
    f = page.locator('#intake .ref-form'); f.get_by_label('Document name', exact=True).fill('Pin Doc'); f.get_by_label('Page', exact=True).fill('7'); f.get_by_label('Page', exact=True).press('Tab')
    page.wait_for_timeout(400); page.locator('#intake .composer').get_by_role('button', name='Done').click(); page.wait_for_timeout(500)
    last = page.evaluate("(() => { const b = [...document.querySelectorAll('#docEl [data-block]')].pop(); const l = b.lastElementChild; return [l.classList.contains('wn-cite'), l.textContent]; })()")
    check('C2 a whole-note source is drawn at the end of the note', 'composer note "Pin Doc", page 7', [True, 'Source: Pin Doc › p. 7'], last)
    refs = page.evaluate('WN.debug.refs()'); r = list(refs.values())[0]
    check('C3 the stored reference keeps its 1.3.0 fields', 'same note', ['heading', 'pages', 'section', 'source', 'sub', 't', 'v'],
          sorted(k for k in r.keys() if k in ('heading', 'pages', 'section', 'source', 'sub', 't', 'v')))
    b.close()
print(f'\nCharacterisation 1.4.0: {sum(results)}/{len(results)} checks passed')
sys.exit(0 if all(results) else 1)

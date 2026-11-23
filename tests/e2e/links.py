"""Click every in-app link, as a person would, and confirm it works and lands where its text says.
Version 1.0.0 of this check opened guide sections directly instead of clicking the links, so it missed the
"page does not exist" error. Now each link is clicked and any error message fails the check.
Page links must show the page whose heading matches; guide links must bring their section into view.
Run: python tests/e2e/links.py [--base URL] [--chrome PATH]
"""
import argparse, os, sys
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8765/'); ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
a = ap.parse_args()
PAGE_HEAD = {'home': 'Never start from a blank page again', 'docs': 'Documents', 'edit': 'Editor', 'dash': 'Dashboard', 'guide': 'Guide', 'settings': 'Settings', 'sources': 'Sources'}
ICONS = '⌂▤✎▥?⚙'
bad, checked = [], 0
with sync_playwright() as p:
    kw = {'args': ['--no-sandbox']}
    if a.chrome: kw['executable_path'] = a.chrome
    b = p.chromium.launch(**kw)
    ctx = b.new_context(viewport={'width': 1280, 'height': 860}); ctx.add_init_script("localStorage.setItem('wrapnote:quickDone','true');")
    pg = ctx.new_page(); pg.goto(a.base + '#home'); pg.wait_for_timeout(800)
    JS_LIST = '''() => [...document.querySelectorAll('a[href]')].map((x, i) => ({ i, href: x.getAttribute('href'), text: (x.getAttribute('aria-label') || x.textContent).trim(),
        visible: !!(x.offsetParent || x.classList.contains('skip')) }))'''
    for src in PAGE_HEAD:
        pg.goto(a.base + '#' + src); pg.wait_for_timeout(300)
        for link in [l for l in pg.evaluate(JS_LIST) if l['visible']]:
            checked += 1
            pg.goto(a.base + '#' + src); pg.wait_for_timeout(200)
            pg.evaluate("document.getElementById('toasts').textContent = ''")
            href, text = link['href'], link['text']
            if href.startswith('http'):
                if not href.startswith('https://'): bad.append((src, href, text, 'not https'))
                continue
            el = pg.locator('a[href]').nth(link['i'])
            if href == '#main': el.focus(); pg.keyboard.press('Enter')
            else: el.click()
            pg.wait_for_timeout(450)
            errors = pg.eval_on_selector_all('#toasts .toast.error', 't => t.map(x => x.textContent)')
            route = href[1:].split('/')
            if href == '#main':
                ok = pg.evaluate('document.activeElement.id') == 'main'
                why = 'focus did not move to main'
            elif route[0] == 'guide' and len(route) > 1:
                top = pg.evaluate(f"Math.round(document.getElementById('{route[1]}').getBoundingClientRect().top)")
                heading = pg.evaluate(f"document.getElementById('{route[1]}').querySelector('h2').textContent")
                ok = pg.is_visible('#page-guide') and 0 <= top < 860 - 40 and text.split()[0].lower() in heading.lower()
                why = f'section top {top}, heading {heading!r}'
            elif route[0] in PAGE_HEAD:
                target = route[0]
                visible = pg.evaluate(f'!document.getElementById("page-{target}").hidden')
                heading = pg.evaluate(f'(document.querySelector("#page-{target} h1") || {{}}).textContent || ""').strip()
                label = ''.join(ch for ch in text if ch not in ICONS).strip().lower()
                matches = label[:4] in (heading + ' ' + PAGE_HEAD[target] + ' ' + target).lower() or label.endswith(' home') or label.endswith('docs') or label.startswith('continue') or label.startswith('open')
                ok = visible and (heading == PAGE_HEAD[target] or target == 'edit') and matches
                why = f'page {target} visible={visible} heading={heading!r}'
            else:
                ok, why = False, 'link to something that is not a page or guide section'
            if errors: ok, why = False, 'error message: ' + errors[0]
            if not ok: bad.append((src, href, text, why))
    b.close()
print(f'Links clicked: {checked}; broken or mismatched: {len(bad)}')
for x in bad: print('  ', x)
sys.exit(1 if bad else 0)

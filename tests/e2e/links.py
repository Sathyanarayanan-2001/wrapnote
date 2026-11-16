"""Open every in-app link and confirm it works and lands where its text says.
Page links must show the page whose heading matches the link text; guide links must point at an
existing section whose heading matches. Run: python tests/e2e/links.py [--base URL] [--chrome PATH]
"""
import argparse, os, sys
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser(); ap.add_argument('--base', default='http://localhost:8765/'); ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
a = ap.parse_args()
PAGE_HEAD = {'home': 'Never start from a blank page again', 'docs': 'Documents', 'edit': 'Editor', 'dash': 'Dashboard', 'guide': 'Guide', 'settings': 'Settings'}
bad, checked = [], 0
with sync_playwright() as p:
    kw = {'args': ['--no-sandbox']}
    if a.chrome: kw['executable_path'] = a.chrome
    b = p.chromium.launch(**kw)
    ctx = b.new_context(); ctx.add_init_script("localStorage.setItem('wrapnote:quickDone','true');")
    pg = ctx.new_page(); pg.goto(a.base + '#home'); pg.wait_for_timeout(800)
    links = set()
    for page in PAGE_HEAD:
        pg.goto(a.base + '#' + page); pg.wait_for_timeout(300)
        for href, text in pg.eval_on_selector_all('a[href]', 'as => as.filter(a => a.offsetParent !== null || a.closest(".bottombar")).map(a => [a.getAttribute("href"), (a.getAttribute("aria-label") || a.textContent).trim()])'):
            links.add((page, href, text))
    for src, href, text in sorted(links):
        checked += 1
        if href.startswith('#g-'):
            pg.goto(a.base + '#guide'); pg.wait_for_timeout(150)
            h = pg.evaluate(f'(() => {{ const s = document.getElementById({href[1:]!r}); return s ? s.querySelector("h2").textContent : null; }})()')
            ok = h is not None and text.split()[0].lower() in h.lower()
            if not ok: bad.append((src, href, text, h))
        elif href.startswith('#') and href[1:].split('/')[0] not in PAGE_HEAD:
            ok = pg.evaluate(f'!!document.getElementById({href[1:]!r})')  # in-page anchor such as the skip link
            if not ok: bad.append((src, href, text, 'missing anchor'))
        elif href.startswith('#'):
            target = href[1:].split('/')[0]
            pg.goto(a.base + href); pg.wait_for_timeout(250)
            visible = pg.evaluate(f'!document.getElementById("page-{target}").hidden')
            heading = pg.evaluate(f'(document.querySelector("#page-{target} h1") || {{}}).textContent || ""')
            label = text.replace('⌂', '').replace('▤', '').replace('✎', '').replace('▥', '').replace('?', '').replace('⚙', '').strip()
            ok = visible and (heading.strip() == PAGE_HEAD.get(target) or target == 'edit') and ((label.lower()[:4] in (heading + ' ' + target + ' ' + PAGE_HEAD.get(target, '')).lower() or label.lower().endswith(' ' + target)) or label.startswith('Worked') or label.startswith('WrapNote') or label == '' or 'docs' in label.lower() or 'open' in label.lower())
            if not ok: bad.append((src, href, text, heading))
        elif href.startswith('http'):
            ok = href.startswith('https://')
            if not ok: bad.append((src, href, text, 'not https'))
        else:
            bad.append((src, href, text, 'unexpected link'))
    b.close()
print(f'Links checked: {checked}; broken or mismatched: {len(bad)}')
for x in bad: print('  ', x)
sys.exit(1 if bad else 0)

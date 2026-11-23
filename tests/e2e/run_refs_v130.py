"""WrapNote 1.3.0 browser tests for source references on notes ("Context Reference & Citation").

Each check states its input and the expected result worked out by hand. All names are made up.
Run: python tests/e2e/run_refs_v130.py [--base URL] [--chrome PATH] [--round NAME] [--out DIR]
"""
import argparse, io, json, os, re, sys, time, zipfile
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--base', default='http://localhost:8765/')
ap.add_argument('--chrome', default=os.environ.get('CHROME_PATH', ''))
ap.add_argument('--round', default='dev')
ap.add_argument('--out', default='tests/e2e/reports')
args = ap.parse_args()
BASE = args.base
INIT = "localStorage.setItem('wrapnote:quickDone','true');"
results = []
os.makedirs(args.out, exist_ok=True)

def check(name, given, expected, actual, ok=None):
    passed = (expected == actual) if ok is None else bool(ok)
    results.append({'name': name, 'input': given, 'expected': expected, 'actual': actual, 'pass': passed})
    print(('PASS ' if passed else 'FAIL ') + name + ('' if passed else f'  expected={expected!r} actual={actual!r}'))

def guard(name, fn):
    """A missing control on the old build fails its own check instead of stopping the run."""
    try: fn()
    except Exception as e: check(name, 'see test', 'runs', 'error: ' + str(e).splitlines()[0][:160], ok=False)

def wait_js(page, expr, timeout=10000):
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if page.evaluate(expr): return True
        except Exception: pass
        page.wait_for_timeout(150)
    return False

def new_doc(page, mode='blank'):
    page.goto(BASE + '#home'); wait_js(page, 'document.body.classList.contains("ready")')
    page.click(f'#page-home [data-new="{mode}"]'); page.wait_for_selector('#editor:not([hidden])'); page.wait_for_timeout(500)

def set_body(page, html):
    page.evaluate("h => { const d = document.getElementById('docEl'); d.innerHTML = h; d.dispatchEvent(new Event('input')); }", html)
    page.wait_for_timeout(500)

def caret_after(page, text):
    page.evaluate("""t => { const d = document.getElementById('docEl'); const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const i = n.data.indexOf(t); if (i >= 0) { d.focus(); const r = document.createRange(); r.setStart(n, i + t.length); r.collapse(true);
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); return; } } throw new Error('not found ' + t); }""", text)
    page.wait_for_timeout(100)

def tab(page, name): page.click(f'#ribbon .rb-tab:text-is("{name}")'); page.wait_for_timeout(150)

def download(page, value):
    with page.expect_download() as dl:
        page.select_option('#exportSel', value)
    return dl.value


def add_note(page, text, ref=None):
    """Text & labels → type the note → (optionally) + Add source reference → fill → Done. Uses visible labels only."""
    page.locator('#intake .add-btn', has_text='Text & labels').click()
    page.locator('#intake .composer-input').click(); page.keyboard.type(text); page.wait_for_timeout(250)
    if ref:
        page.locator('#intake .composer').get_by_role('button', name='+ Add source reference').click()
        form = page.locator('#intake .ref-form')
        for label, key in (('Document name', 'source'), ('Heading', 'heading'), ('Sub-heading', 'sub'), ('Article / section', 'section'), ('Page', 'pages')):
            if ref.get(key): form.get_by_label(label, exact=True).fill(ref[key]); form.get_by_label(label, exact=True).press('Tab')
        page.wait_for_timeout(400)
    page.locator('#intake .composer').get_by_role('button', name='Done').click(); page.wait_for_timeout(700)

def cites(page): return page.eval_on_selector_all('#docEl .wn-cite', 'x => x.map(e => e.textContent)')

def run(p):
    kw = {'args': ['--no-sandbox']}
    if args.chrome: kw['executable_path'] = args.chrome
    b = p.chromium.launch(**kw)
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True); ctx.add_init_script(INIT)
    page = ctx.new_page()
    page.goto(BASE + '#home'); wait_js(page, 'document.body.classList.contains("ready")')
    st = {}

    # ---------- Attach a reference while writing a note ----------
    def r1():
        new_doc(page, 'book')
        page.fill('#edTitle', 'Grid study week 48'); page.locator('#edTitle').press('Tab')
        add_note(page, 'Hold frequency within the band.', {'source': 'Grid Code 2023', 'heading': 'Frequency', 'sub': 'Limits', 'section': '4', 'pages': '12'})
        # Hand-worked: Doc › Heading › Sub-heading › Art. 4 (bare number) › p. 12 (single page)
        check('R1 the note shows its citation tag', 'note with all five fields', ['Source: Grid Code 2023 › Frequency › Limits › Art. 4 › p. 12'], cites(page))
        refs = page.evaluate('WN.debug.refs()'); st['b1'] = list(refs.keys())[0] if refs else ''
        check('R2 the reference is stored as structured data on the document', 'same note',
              [1, 'Grid Code 2023', 'Frequency', 'Limits', '4', {'from': 12, 'to': 12}],
              [len(refs)] + ([refs[st['b1']][k] for k in ('source', 'heading', 'sub', 'section', 'pages')] if refs else []))
        row = page.locator('#blockList li').first.inner_text()
        check('R3 the note card in the block list shows the citation and a "Source ✓" button', 'block list', [True, True],
              ['Grid Code 2023 › Frequency › Limits › Art. 4 › p. 12' in row, 'Source ✓' in row])
    guard('R1-R3 attach while writing', r1)

    def r2():
        page.locator('#blockList').get_by_role('button', name='Source reference for block 1').click()
        form = page.locator('#intake .ref-form')
        form.get_by_label('Page', exact=True).fill('45-42'); form.get_by_label('Page', exact=True).press('Tab'); page.wait_for_timeout(400)
        msg = form.locator('.ref-msg').inner_text()
        check('R4 a backwards page range is refused with a clear message and the saved reference stays', 'Page "45-42"',
              ['Page: the range ends before it starts (45-42). Write the smaller page first.', {'from': 12, 'to': 12}],
              [msg, page.evaluate('WN.debug.refs()')[st['b1']]['pages']])
        form.get_by_label('Page', exact=True).fill('12'); form.get_by_label('Page', exact=True).press('Tab'); page.wait_for_timeout(300)
        page.locator('#intake .prompt').get_by_role('button', name='Done').click()
        # Second note: autocomplete offers the document already used; Enter picks it.
        page.locator('#intake .add-btn', has_text='Text & labels').click()
        page.locator('#intake .composer-input').click(); page.keyboard.type('Voltage ride-through curve.')
        page.locator('#intake .composer').get_by_role('button', name='+ Add source reference').click()
        form = page.locator('#intake .ref-form'); src = form.get_by_label('Document name', exact=True)
        src.click(); src.type('gr'); page.wait_for_timeout(200)
        opts = page.locator('#intake .ref-form [role=listbox] [role=option]').all_inner_texts()
        page.keyboard.press('ArrowDown'); page.keyboard.press('Enter'); page.wait_for_timeout(200)
        check('R5 document-name autocomplete offers earlier documents and Enter picks one', 'type "gr", Down, Enter', [['Grid Code 2023'], 'Grid Code 2023'], [opts, src.input_value()])
        hd = form.get_by_label('Heading', exact=True); hd.click(); page.wait_for_timeout(200)
        hopts = page.locator('#intake .ref-form [role=listbox]:visible [role=option]').all_inner_texts()
        check('R6 heading suggestions come from headings used under that document', 'focus Heading', ['Frequency', 'Limits'], sorted(hopts))
        hd.fill('Voltage'); hd.press('Tab'); form.get_by_label('Page', exact=True).fill('40-45'); form.get_by_label('Page', exact=True).press('Tab'); page.wait_for_timeout(400)
        page.locator('#intake .composer').get_by_role('button', name='Done').click(); page.wait_for_timeout(600)
        # Third note typed in another case: the existing spelling is used, so filters treat them as one document.
        add_note(page, 'Droop setting.', {'source': 'grid  code 2023', 'heading': 'frequency'})
        check('R7 a document name typed in another case or spacing uses the existing spelling', '"grid  code 2023"',
              'Source: Grid Code 2023 › frequency', cites(page)[-1])
        add_note(page, 'Commissioning order.', {'source': 'Inverter Manual', 'heading': 'Setup', 'pages': 'p. 3'})
        add_note(page, 'A note without a source.')
        check('R8 a note without a reference has no tag', '5 notes, 4 with sources', 4, len(cites(page)))
    guard('R4-R8 validation and autocomplete', r2)

    # ---------- Storage: one copy, saved with the document, back after reload, old documents still open ----------
    def r3():
        page.keyboard.press('Control+s'); page.wait_for_timeout(500)
        d = page.evaluate('WN.debug.doc()')
        check('R9 the document body stores no copy of the tags (one source of truth: doc.refs)', 'saved document', [False, 4], ['wn-cite' in d['html'], len(d['refs'])])
        st['doc'] = d['id']
        page.reload(); wait_js(page, 'document.body.classList.contains("ready")'); page.wait_for_timeout(900)
        check('R10 tags come back after a reload', 'reload', 4, len(cites(page)))
        words_with = page.evaluate('WN.debug.metas()')
        w = [m for m in words_with if m['id'] == st['doc']][0]['words']
        # Hand-worked words in the notes: 5 + 3 + 2 + 2 + 5 = 17, plus the generated study-notes text, which has no tags.
        page.evaluate("document.querySelectorAll('#docEl .wn-cite').forEach(e => e.remove()); document.getElementById('docEl').dispatchEvent(new Event('input'))")
        page.wait_for_timeout(900); page.keyboard.press('Control+s'); page.wait_for_timeout(400)
        w2 = [m for m in page.evaluate('WN.debug.metas()') if m['id'] == st['doc']][0]['words']
        check('R11 citation tags do not count as words', 'word count with and without the tags', w, w2)
        page.reload(); wait_js(page, 'document.body.classList.contains("ready")'); page.wait_for_timeout(800)
    guard('R9-R11 storage', r3)

    # ---------- Undo ----------
    def r4():
        page.locator('#blockList').get_by_role('button', name='Source reference for block 5').click()
        form = page.locator('#intake .ref-form')
        form.get_by_label('Document name', exact=True).fill('Training Slides'); form.get_by_label('Document name', exact=True).press('Tab'); page.wait_for_timeout(1200)
        n1 = len(page.evaluate('WN.debug.refs()'))
        page.locator('#intake .prompt').get_by_role('button', name='Done').click()
        page.click('#docEl p >> nth=0'); page.keyboard.press('Control+z'); page.wait_for_timeout(700)
        check('R12 Undo takes back a reference just added', 'add to note 5, then Ctrl+Z', [5, 4, 4], [n1, len(page.evaluate('WN.debug.refs()')), len(cites(page))])
    guard('R12 undo', r4)

    # ---------- Ribbon: attach to an ordinary paragraph ----------
    def r5():
        new_doc(page, 'blank'); page.fill('#edTitle', 'Plain notes'); page.locator('#edTitle').press('Tab')
        set_body(page, '<h1>Topic</h1><p>Plain paragraph to cite.</p>')
        caret_after(page, 'Plain paragraph'); tab(page, 'References')
        page.click('#ribbon .rb-btn:text-is("Source reference…")')
        dlg = page.locator('dialog.dlg')
        dlg.get_by_label('Document name', exact=True).fill('Inverter Manual'); dlg.get_by_label('Page', exact=True).fill('3-4'); dlg.get_by_label('Page', exact=True).press('Tab')
        page.wait_for_timeout(400); dlg.get_by_role('button', name='Done').click(); page.wait_for_timeout(600)
        check('R13 References, Source reference attaches to the paragraph at the cursor', 'paragraph + "Inverter Manual", "3-4"',
              ['Source: Inverter Manual › pp. 3–4'], cites(page))
        caret_after(page, 'Topic'); page.click('#ribbon .rb-btn:text-is("Source reference…")'); page.wait_for_timeout(300)
        msg = ' '.join(page.eval_on_selector_all('#toasts .toast', 't => t.map(x => x.textContent)'))
        check('R14 a heading cannot carry a source; the message says where to click', 'cursor in a heading', True, 'not in the heading' in msg)
        page.keyboard.press('Control+s'); page.wait_for_timeout(500)
    guard('R13-R14 ribbon', r5)

    # ---------- Sources page: filters and search ----------
    def r6():
        page.click('.tabs a[data-nav="sources"]'); page.wait_for_timeout(500)
        count = lambda: page.inner_text('#srcCount')
        # Notes with sources: Grid Code ×3 (p. 12, pp. 40–45, none), Inverter Manual ×2 (p. 3, pp. 3–4) = 5
        check('R15 Sources lists every referenced note from every document', 'open Sources', '5 of 5 notes', count())
        page.select_option('#srcDoc', label='Grid Code 2023 (3)'); page.wait_for_timeout(300)
        order = page.eval_on_selector_all('#srcResults .src-text', 'x => x.map(e => e.textContent)')
        check('R16 filter by document, ordered by page (notes without a page last)', 'Grid Code 2023',
              ['3 of 5 notes', ['Hold frequency within the band.', 'Voltage ride-through curve.', 'Droop setting.']], [count(), order])
        # The list shows the latest spelling of a heading ("frequency", typed in the third note).
        page.select_option('#srcHead', label='frequency'); page.wait_for_timeout(300)
        check('R17 filter by heading matches any case', 'heading frequency ("Frequency" too)', '2 of 5 notes', count())
        page.click('#srcClear'); page.fill('#srcPage', '4'); page.wait_for_timeout(500)
        # Page 4 lies inside pp. 3–4 only (p. 3 does not contain 4; 40–45 does not).
        check('R18 filter by page finds ranges that contain it', 'page 4', '1 of 5 notes', count())
        page.fill('#srcPage', '3-12'); page.wait_for_timeout(500)
        check('R19 a page range finds every note that overlaps it', 'pages 3-12: p. 3, pp. 3–4, p. 12', '3 of 5 notes', count())
        page.fill('#srcPage', 'x'); page.wait_for_timeout(500)
        check('R20 a bad page filter is refused with a clear message', 'page "x"', 'Page: use a number like 42 or a range like 42-45.', page.inner_text('#srcErr'))
        page.click('#srcClear'); page.fill('#srcQ', 'droop'); page.wait_for_timeout(500)
        check('R21 search finds notes by their text', '"droop"', '1 of 5 notes', count())
        page.click('#srcClear'); page.wait_for_timeout(300)
        page.locator('#srcResults .src-card').first.get_by_role('button', name='Show all notes from: Grid Code 2023').click(); page.wait_for_timeout(300)
        check('R22 tapping a part of a citation filters by it', 'tap "Grid Code 2023"', '3 of 5 notes', count())
        with page.expect_download() as dl:
            page.click('#srcCsv')
        raw = open(dl.value.path(), 'rb').read()
        text = raw.decode('utf-8-sig')
        check('R23 CSV has a byte order mark, a header and pages kept as text', 'Save as CSV (3 notes)',
              [True, 4, True], [raw.startswith(b'\xef\xbb\xbf'), len([l for l in text.split('\r\n') if l]), '"Grid Code 2023 › Voltage › pp. 40–45"' in text or 'Grid Code 2023 › Voltage › pp. 40–45' in text])
        page.click('#srcClear'); page.fill('#srcQ', 'droop'); page.wait_for_timeout(400)
        page.locator('#srcResults .src-open').first.click(); page.wait_for_timeout(500)
        flashed = page.evaluate("(() => { const b = document.querySelector('#docEl [data-block].wn-flash'); return b ? b.textContent : ''; })()")
        check('R24 "Open in…" opens the document at that note', 'open the droop note', [True, True], [page.evaluate('location.hash').startswith('#edit/' + st['doc'] + '/'), 'Droop setting.' in flashed])
    guard('R15-R24 Sources page', r6)

    # ---------- Exports ----------
    def r7():
        md = download(page, 'md'); mdt = open(md.path(), encoding='utf-8').read()
        check('R25 Markdown export includes each citation', 'export .md', True, '*Source: Grid Code 2023 › Frequency › Limits › Art. 4 › p. 12*' in mdt)
        # Found in appearance round 2: text typed in the composer (bare text in its block) was missing from Markdown.
        check('R25b Markdown export includes the note text above its citation', 'export .md', True,
              'Hold frequency within the band.\n\n*Source: Grid Code 2023 › Frequency › Limits › Art. 4 › p. 12*' in mdt)
        dx = download(page, 'docx'); z = zipfile.ZipFile(dx.path()); doc = z.read('word/document.xml').decode()
        check('R26 Word export includes each citation', 'export .docx', True, 'Grid Code 2023' in doc and 'p. 12' in doc)
    guard('R25-R26 exports', r7)

    # ---------- Backup round trip into an empty copy; an old backup without references; a damaged reference ----------
    def r8():
        page.goto(BASE + '#settings'); page.wait_for_timeout(400)
        with page.expect_download() as dl:
            page.click('#backupExport')
        path = dl.value.path(); data = json.load(open(path, encoding='utf-8'))
        recs = [r for r in data['records'] if not r.get('d')]
        n_refs = sum(len(r.get('refs') or {}) for r in recs)
        check('R27 the backup carries the references', 'export backup', 5, n_refs)
        c2 = b.new_context(viewport={'width': 1366, 'height': 900}); c2.add_init_script(INIT); p2 = c2.new_page()
        p2.goto(BASE + '#settings'); wait_js(p2, 'document.body.classList.contains("ready")'); p2.wait_for_timeout(300)
        # 1.2.0-style record (no refs key) and a record with one damaged reference, added to the same file.
        old = json.loads(json.dumps(recs[0])); old['id'] = 'dOld120'; old.pop('refs', None); old['title'] = 'Old 1.2.0 notes'
        bad = json.loads(json.dumps(recs[0])); bad['id'] = 'dBadRef'; bad['title'] = 'Damaged reference'; k = list(bad['refs'].keys())[0]; bad['refs'][k]['pages'] = {'from': 9, 'to': 2}
        data['records'] = data['records'] + [old, bad]
        f2 = os.path.join(args.out, f'refs-backup-{args.round}.json'); json.dump(data, open(f2, 'w', encoding='utf-8'))
        p2.click('#backupImport'); p2.locator('dialog.dlg input[type=file]').set_input_files(f2); p2.wait_for_timeout(1200)
        prev = p2.inner_text('dialog.dlg .import-preview')
        before = len(p2.evaluate('WN.debug.metas()'))
        check('R28 the import preview reports the damaged reference and saves nothing yet', 'backup + old record + damaged reference', [True, 0],
              ['1 source reference(s) will be left out' in prev, before])
        p2.locator('dialog.dlg').get_by_role('button', name='Import').click(); p2.wait_for_timeout(1200)
        p2.goto(BASE + '#sources'); p2.wait_for_timeout(700)
        # Hand-worked: 5 references from the backup, + 4 from the copy with references stripped of the damaged one (old has none).
        exp_notes = 5 + (len(recs[0]['refs']) - 1)
        check('R29 round trip into an empty copy: documents and referenced notes match', 'import into a new browser profile',
              [len(recs) + 2, f'{exp_notes} of {exp_notes} notes'], [len(p2.evaluate('WN.debug.metas()')), p2.inner_text('#srcCount')])
        p2.goto(BASE + '#edit/dOld120'); p2.wait_for_timeout(1200)
        check('R30 a document saved before references opens normally with no references', 'open the 1.2.0-style record', [{}, False],
              [p2.evaluate('WN.debug.refs()'), p2.locator('#edEmpty').is_visible()])
        c2.close()
    guard('R27-R30 backup', r8)

    # ---------- Final documents cannot be changed; the citation tags are not "polished" ----------
    def r9():
        page.goto(BASE + '#edit/' + st['doc']); page.wait_for_timeout(900)
        page.click('#confirmEndBtn'); page.locator('dialog.dlg').get_by_role('button', name='Confirm end of document').click(); page.wait_for_timeout(900)
        page.locator('#blockList').get_by_role('button', name='Source reference for block 1').click()
        locked = page.locator('#intake .ref-form input').first.is_disabled()
        page.locator('#intake .prompt').get_by_role('button', name='Done').click()
        check('R31 a final document shows its references but they cannot be changed', 'Confirm end of document, then Source',
              [True, 'Source: Grid Code 2023 › Frequency › Limits › Art. 4 › p. 12'], [locked, cites(page)[0]])
    guard('R31 lock', r9)

    # ---------- Phones ----------
    def r10():
        for w in (320, 360, 390):
            c3 = b.new_context(viewport={'width': w, 'height': 760}, has_touch=True, is_mobile=True); c3.add_init_script(INIT); p3 = c3.new_page()
            p3.goto(BASE + '#sources'); wait_js(p3, 'document.body.classList.contains("ready")'); p3.wait_for_timeout(500)
            sw = p3.evaluate('document.documentElement.scrollWidth')
            small = p3.evaluate("""() => [...document.querySelectorAll('#page-sources button, #page-sources select, #page-sources input, .bottombar a')]
              .filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(r => r.height < 44 || r.width < 44).length""")
            check(f'R32 phone {w} px: Sources page has no sideways scroll and every control is at least 44 px', f'{w} px wide', [w, 0], [sw, small])
            c3.close()
    guard('R32 phones', r10)

    b.close()

with sync_playwright() as p:
    run(p)
passed = sum(1 for r in results if r['pass'])
print(f'\nSource references 1.3.0 round {args.round}: {passed}/{len(results)} checks passed')
json.dump(results, open(os.path.join(args.out, f'refs-{args.round}.json'), 'w'), indent=1)
sys.exit(0 if passed == len(results) else 1)

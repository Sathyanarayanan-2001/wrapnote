"""WrapNote 1.4.0 browser tests: source tags placed and moved where the person wants them (issue 1),
a frequency-first ribbon with a quick access bar (issue 2) and a saved, person-made arrangement (issue 3).

Each check states its input and the expected result worked out by hand. All names are made up.
Run: python tests/e2e/run_v140.py [--base URL] [--chrome PATH] [--round NAME] [--out DIR]
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

def ready(page): wait_js(page, 'document.body.classList.contains("ready")')

def new_doc(page, mode='blank'):
    page.goto(BASE + '#home'); ready(page)
    page.click(f'#page-home [data-new="{mode}"]'); page.wait_for_selector('#editor:not([hidden])'); page.wait_for_timeout(500)

def set_body(page, html):
    page.evaluate("h => { const d = document.getElementById('docEl'); d.innerHTML = h; d.dispatchEvent(new Event('input')); }", html)
    page.wait_for_timeout(500)

FIND = """(t, end) => { const d = document.getElementById('docEl'); const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { if (n.parentNode.closest('.wn-cite')) continue; const i = n.data.indexOf(t); if (i >= 0) { const r = document.createRange();
    r.setStart(n, i); r.setEnd(n, i + t.length); return r; } } throw new Error('not found ' + t); }"""

def select_text(page, text):
    page.evaluate("""([F, t]) => { const r = eval(F)(t); document.getElementById('docEl').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.dispatchEvent(new Event('selectionchange')); }""", [FIND, text]); page.wait_for_timeout(100)

def caret_after(page, text):
    page.evaluate("""([F, t]) => { const r = eval(F)(t); r.collapse(false); document.getElementById('docEl').focus(); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.dispatchEvent(new Event('selectionchange')); }""", [FIND, text]); page.wait_for_timeout(100)

def point_after(page, text):
    """Screen point just right of the last letter of text (where a click puts the caret after it)."""
    return page.evaluate("""([F, t]) => { const r = eval(F)(t); const rs = r.getClientRects(); const b = rs[rs.length - 1]; return { x: b.right - 1, y: b.top + b.height / 2 }; }""", [FIND, text])

def tab(page, name): page.click(f'#ribbon .rb-tab:text-is("{name}")'); page.wait_for_timeout(150)

def toasts(page): return ' '.join(page.eval_on_selector_all('#toasts .toast', 't => t.map(x => x.textContent)'))

def para(page, i=0):
    """Text before the placed tag, the tag's words, the text after it, and its place, for paragraph i."""
    return page.evaluate("""i => { const p = document.querySelectorAll('#docEl p')[i]; const t = p.querySelector('.wn-cite'); if (!t) return [p.textContent, null, null, null];
      const a = document.createRange(); a.setStart(p, 0); a.setEndBefore(t); const b = document.createRange(); b.setStartAfter(t); b.setEnd(p, p.childNodes.length);
      return [a.toString(), t.textContent, b.toString(), t.getAttribute('data-place')]; }""", i)

def ref_dialog(page, source, pages=None, place=None):
    tab(page, 'References'); page.click('#rbPanel .rb-btn:text-is("Source reference…")'); page.wait_for_timeout(300)
    dlg = page.locator('dialog.dlg')
    if place: dlg.get_by_label(place, exact=True).check()
    dlg.get_by_label('Document name', exact=True).fill(source); dlg.get_by_label('Document name', exact=True).press('Tab')
    if pages: dlg.get_by_label('Page', exact=True).fill(pages); dlg.get_by_label('Page', exact=True).press('Tab')
    page.wait_for_timeout(400); dlg.get_by_role('button', name='Done').click(); page.wait_for_timeout(600)

def menu(page, tag_index=0):
    page.locator('#docEl .wn-cite').nth(tag_index).click(); page.wait_for_timeout(200)
    return page.locator('.cite-menu')

def save(page): page.keyboard.press('Control+s'); page.wait_for_timeout(500)

def reload(page): page.reload(); ready(page); page.wait_for_timeout(900)

def groups(page): return page.eval_on_selector_all('#rbPanel .rb-group', 'x => x.map(g => g.getAttribute("data-group"))')

def run(p):
    kw = {'args': ['--no-sandbox']}
    if args.chrome: kw['executable_path'] = args.chrome
    b = p.chromium.launch(**kw)
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True); ctx.add_init_script(INIT)
    page = ctx.new_page()
    page.set_default_timeout(8000)  # a missing control (on an old build) fails its check quickly
    page.goto(BASE + '#home'); ready(page)
    st = {}
    BODY = '<h1>Grid notes</h1><p>The Grid limits apply to all turbines.</p><p>Ramp rate stays below ten percent.</p>'

    # ================= Issue 1: the tag goes where the person wants it =================
    def t1():
        new_doc(page, 'blank'); page.fill('#edTitle', 'Placement week 48'); page.locator('#edTitle').press('Tab')
        set_body(page, BODY); st['doc'] = page.evaluate('WN.debug.doc().id')
        select_text(page, 'Grid limits'); ref_dialog(page, 'IEC 61400', '21')
        # Hand-worked: the tag sits right after the selected words, inside the sentence; p. 21 (one page).
        check('S1 selected text: the tag is placed right after the selection, not at the end of the paragraph',
              'select "Grid limits", Source reference, IEC 61400, page 21', ['The Grid limits', 'Source: IEC 61400 › p. 21', ' apply to all turbines.', 'inline'], para(page, 0))
        save(page)
        d = page.evaluate('WN.debug.doc()'); keys = list(d['refs'].keys()); st['k1'] = keys[0] if keys else ''
        m = re.search(r'<span[^>]*class="wn-cite"[^>]*>(.*?)</span>', d['html'])
        check('S2 the saved body keeps only the place (an empty marker); the words live once, in the reference',
              'saved document', [1, True, '', False], [len(keys), bool(re.match(r'^r[a-z0-9]+$', st['k1'])), m.group(1) if m else None, 'IEC 61400' in d['html']])
        reload(page)
        check('S3 after a reload the tag is still where it was put', 'reload', ['The Grid limits', 'Source: IEC 61400 › p. 21', ' apply to all turbines.', 'inline'], para(page, 0))
    guard('S1-S3 place at selection', t1)

    def t2():
        caret_after(page, 'Ramp rate')
        ref_dialog(page, 'Plant Manual', '4-5', place='On its own line under the paragraph')
        disp = page.evaluate("getComputedStyle(document.querySelectorAll('#docEl p')[1].querySelector('.wn-cite')).display")
        # Hand-worked: own line = after all the words of the paragraph, shown as a block; pages 4-5 = "pp. 4–5".
        check('S4 "On its own line under the paragraph" puts the tag after the paragraph text, on its own line',
              'cursor after "Ramp rate", choose own line, Plant Manual, 4-5', [['Ramp rate stays below ten percent.', 'Source: Plant Manual › pp. 4–5', '', 'line'], 'block'], [para(page, 1), disp])
        caret_after(page, 'Ramp'); tab(page, 'References'); page.click('#rbPanel .rb-btn:text-is("Source reference…")'); page.wait_for_timeout(300)
        chosen = page.evaluate("[...document.querySelectorAll('dialog.dlg input[name=refPlace]')].filter(r => r.checked).map(r => r.value)")
        page.locator('dialog.dlg').get_by_role('button', name='Done').click(); page.wait_for_timeout(300)
        check('S5 with nothing selected, the last choice of place is offered again', 'open the dialog again with only a cursor', ['line'], chosen)
        check('S5b closing the dialog without a name adds nothing', 'Done with empty fields', 2, len(page.evaluate('WN.debug.refs()')))
    guard('S4-S5 own line', t2)

    def t3():
        mn = menu(page, 0)
        labels = mn.locator('button').all_inner_texts()
        check('S6 clicking a tag opens its menu', 'click the IEC 61400 tag', ['Edit source…', 'Move…', 'Show on its own line', 'Remove source'], labels)
        mn.get_by_role('menuitem', name='Move…').click(); page.wait_for_timeout(150)
        pt = point_after(page, 'apply'); page.mouse.click(pt['x'], pt['y']); page.wait_for_timeout(500)
        # Hand-worked: the next click puts the tag right after "apply".
        check('S7 Move…, then a click in the text, moves the tag there', 'Move…, click just after "apply"',
              ['The Grid limits apply', 'Source: IEC 61400 › p. 21', ' to all turbines.', 'inline'], para(page, 0))
        page.keyboard.press('Control+z'); page.wait_for_timeout(500)
        check('S8 Undo puts the moved tag back', 'Ctrl+Z', ['The Grid limits', 'Source: IEC 61400 › p. 21', ' apply to all turbines.', 'inline'], para(page, 0))
        # Keyboard only: focus the tag, Enter, Move…, put the cursor, Enter.
        page.locator('#docEl .wn-cite').first.focus(); page.keyboard.press('Enter'); page.wait_for_timeout(200)
        page.locator('.cite-menu').get_by_role('menuitem', name='Move…').click(); page.wait_for_timeout(100)
        caret_after(page, 'all'); page.keyboard.press('Enter'); page.wait_for_timeout(500)
        check('S9 keyboard move: Enter on the tag, Move…, cursor, Enter', 'tag focused, Move…, cursor after "all", Enter',
              ['The Grid limits apply to all', 'Source: IEC 61400 › p. 21', ' turbines.', 'inline'], para(page, 0))
        menu(page, 0).get_by_role('menuitem', name='Move…').click(); page.keyboard.press('Escape'); page.wait_for_timeout(200)
        pt = point_after(page, 'The'); page.mouse.click(pt['x'], pt['y']); page.wait_for_timeout(300)
        check('S10 Esc cancels a move; the next click only places the cursor', 'Move…, Esc, click after "The"',
              ['The Grid limits apply to all', 'Source: IEC 61400 › p. 21', ' turbines.'], para(page, 0)[:3])
    guard('S6-S10 menu move', t3)

    def t4():
        tag = page.locator('#docEl .wn-cite').first
        pt = point_after(page, 'The')
        tag.drag_to(page.locator('#docEl p').first, target_position={'x': pt['x'] - page.locator('#docEl p').first.bounding_box()['x'], 'y': pt['y'] - page.locator('#docEl p').first.bounding_box()['y']})
        page.wait_for_timeout(500)
        check('S11 dragging the tag moves it to the drop point', 'drag the tag to just after "The"',
              ['The', 'Source: IEC 61400 › p. 21', ' Grid limits apply to all turbines.', 'inline'], para(page, 0))
        hb = page.locator('#docEl h1').bounding_box()
        tag.drag_to(page.locator('#docEl h1'), target_position={'x': 20, 'y': hb['height'] / 2}); page.wait_for_timeout(400)
        check('S12 a tag cannot be dropped into a heading; it stays and the message says why', 'drag the tag onto the heading',
              [True, 'The', 0], ['not in the heading' in toasts(page), para(page, 0)[0], page.locator('#docEl h1 .wn-cite').count()])
        save(page); reload(page)
        check('S13 the dragged place survives a reload', 'reload', ['The', 'Source: IEC 61400 › p. 21', ' Grid limits apply to all turbines.', 'inline'], para(page, 0))
    guard('S11-S13 drag', t4)

    def t5():
        menu(page, 1).get_by_role('menuitem', name='Show inside the text').click(); page.wait_for_timeout(300)
        disp = page.evaluate("getComputedStyle(document.querySelectorAll('#docEl p')[1].querySelector('.wn-cite')).display")
        check('S14 "Show inside the text" turns an own-line tag into a compact inline one', 'Plant Manual tag menu', ['inline', 'inline'], [para(page, 1)[3], disp])
        select_text(page, 'Grid notes'); tab(page, 'References'); page.click('#rbPanel .rb-btn:text-is("Source reference…")'); page.wait_for_timeout(300)
        check('S15 a heading still cannot carry a source (1.3.0 message kept)', 'select heading text, Source reference', [True, 0], ['not in the heading' in toasts(page), page.locator('dialog.dlg').count()])
    guard('S14-S15 place switch and heading', t5)

    def t6():
        save(page)
        page.goto(BASE + '#sources'); ready(page); page.wait_for_timeout(700)
        cards = page.eval_on_selector_all('#srcResults .src-card', 'x => x.map(c => [[...c.querySelectorAll(".crumb")].map(e => e.textContent).join(" › "), c.querySelector(".src-text").textContent])')
        cards.sort()
        # Hand-worked: each card's text is its paragraph without the tag words.
        check('S16 the Sources page shows the paragraph around each placed tag', 'Sources page',
              [['IEC 61400 › p. 21', 'The Grid limits apply to all turbines.'], ['Plant Manual › pp. 4–5', 'Ramp rate stays below ten percent.']], cards)
        page.locator('#srcResults .src-card', has_text='IEC 61400').locator('.src-open').click(); page.wait_for_timeout(900)
        fl = page.evaluate("(() => { const f = document.querySelector('#docEl .wn-flash'); return f ? f.textContent : ''; })()")
        check('S17 "Open in" goes to the paragraph that holds the tag', 'Open in Placement week 48', True, fl.startswith('The') and 'Grid limits' in fl)
    guard('S16-S17 sources page', t6)

    def t7():
        page.goto(BASE + '#edit/' + st['doc']); page.wait_for_timeout(900)
        with page.expect_download() as dl: page.select_option('#exportSel', 'md')
        md = open(dl.value.path(), encoding='utf-8-sig').read()
        check('S18 Markdown keeps an inline tag inside the sentence, in brackets', 'Export, Markdown',
              [True, True], ['The *[Source: IEC 61400 › p. 21]* Grid limits apply to all turbines.' in md, 'Ramp rate stays below ten percent. *[Source: Plant Manual › pp. 4–5]*' in md])
        with page.expect_download() as dl: page.select_option('#exportSel', 'docx')
        z = zipfile.ZipFile(dl.value.path()); x = z.read('word/document.xml').decode('utf-8')
        paras = [''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p_)) for p_ in re.findall(r'<w:p[ >].*?</w:p>', x)]
        hit = [q for q in paras if 'Grid limits' in q]
        check('S19 Word keeps the inline tag in the same paragraph, in brackets', 'Export, Word',
              ['The [Source: IEC 61400 › p. 21] Grid limits apply to all turbines.'], hit)
        with page.expect_download() as dl: page.select_option('#exportSel', 'html')
        hx = open(dl.value.path(), encoding='utf-8').read()
        tags = re.findall(r'<span class="wn-cite"[^>]*>', hx)
        check('S19b HTML export shows the tags as plain text: no button role, tab stop, drag handle or editing hint', 'Export, HTML',
              [2, False], [len(tags), any(re.search(r'role=|tabindex|draggable|Click for', t_) for t_ in tags)])
    guard('S18-S19 exports', t7)

    def t8():
        menu(page, 0).get_by_role('menuitem', name='Remove source').click(); page.wait_for_timeout(400)
        n1 = [page.locator('#docEl .wn-cite').count(), len(page.evaluate('WN.debug.refs()'))]
        page.keyboard.press('Control+z'); page.wait_for_timeout(500)
        n2 = [page.locator('#docEl .wn-cite').count(), len(page.evaluate('WN.debug.refs()')), para(page, 0)[0]]
        check('S20 Remove source takes the tag and its reference away; Undo brings both back in the same place', 'menu, Remove source, then Ctrl+Z',
              [[1, 1], [2, 2, 'The']], [n1, n2])
    guard('S20 remove', t8)

    def t9():
        # A tag copied from another document (unknown key) and a second copy of a known key are dropped on opening.
        k = st['k1']
        html = page.evaluate('document.getElementById("docEl").innerHTML')
        page.evaluate("""k => { const p = document.querySelectorAll('#docEl p')[1]; p.insertAdjacentHTML('beforeend', '<span class="wn-cite" contenteditable="false" data-ref="rzzzzzz" data-place="inline"></span><span class="wn-cite" contenteditable="false" data-ref="' + k + '" data-place="inline"></span>');
          document.getElementById('docEl').dispatchEvent(new Event('input')); }""", k)
        page.wait_for_timeout(900); save(page); reload(page)
        check('S21 a pasted tag with an unknown or repeated key is dropped, so a reference never shows twice', 'two foreign markers, reload',
              ['Source: IEC 61400 › p. 21', 'Source: Plant Manual › pp. 4–5'], page.eval_on_selector_all('#docEl .wn-cite', 'x => x.map(e => e.textContent)'))
    guard('S21 foreign tags', t9)

    def t13():
        # Round trip: backup out of this browser, into an empty one; the placed tags come back in the same places.
        page.goto(BASE + '#settings'); page.wait_for_timeout(400)
        with page.expect_download() as dl: page.click('#backupExport')
        path = dl.value.path()
        c2 = b.new_context(viewport={'width': 1366, 'height': 900}); c2.add_init_script(INIT); p2 = c2.new_page(); p2.set_default_timeout(8000)
        p2.goto(BASE + '#settings'); ready(p2); p2.wait_for_timeout(300)
        p2.click('#backupImport'); p2.locator('dialog.dlg input[type=file]').set_input_files(path); p2.wait_for_timeout(1200)
        p2.locator('dialog.dlg').get_by_role('button', name='Import').click(); p2.wait_for_timeout(1200)
        p2.goto(BASE + '#edit/' + st['doc']); p2.wait_for_timeout(1200)
        check('S26 export/import round trip: the placed tags are in the same places in an empty browser', 'backup, import into a new profile, open the document',
              [['The', 'Source: IEC 61400 › p. 21', ' Grid limits apply to all turbines.', 'inline'], ['Ramp rate stays below ten percent.', 'Source: Plant Manual › pp. 4–5', '', 'inline']],
              [para(p2, 0), para(p2, 1)])
        c2.close()
    guard('S26 round trip', t13)

    def t10():
        # A 1.3.0 note reference (drawn at the end of its note) can be moved too; it keeps its key.
        new_doc(page, 'book'); page.fill('#edTitle', 'Older note style'); page.locator('#edTitle').press('Tab')
        page.locator('#intake .add-btn', has_text='Text & labels').click()
        page.locator('#intake .composer-input').click(); page.keyboard.type('Hold frequency within the band.'); page.wait_for_timeout(250)
        page.locator('#intake .composer').get_by_role('button', name='+ Add source reference').click()
        f = page.locator('#intake .ref-form'); f.get_by_label('Document name', exact=True).fill('Grid Code 2023'); f.get_by_label('Page', exact=True).fill('12'); f.get_by_label('Page', exact=True).press('Tab')
        page.wait_for_timeout(400); page.locator('#intake .composer').get_by_role('button', name='Done').click(); page.wait_for_timeout(700)
        blk = page.evaluate("document.querySelector('#docEl [data-block] .wn-cite').closest('[data-block]').getAttribute('data-block')")
        before = page.evaluate("document.querySelector('#docEl [data-block] .wn-cite').hasAttribute('data-place')")
        menu(page, 0).get_by_role('menuitem', name='Move…').click()
        pt = point_after(page, 'Hold frequency'); page.mouse.click(pt['x'], pt['y']); page.wait_for_timeout(500)
        res = page.evaluate("""() => { const t = document.querySelector('#docEl [data-block] .wn-cite'); const b = t.closest('[data-block]');
          const r = document.createRange(); r.setStart(b, 0); r.setEndBefore(t); return [r.toString().replace(/\\s+/g, ' ').trim(), t.getAttribute('data-ref'), t.getAttribute('data-place'), document.querySelectorAll('#docEl .wn-cite').length]; }""")
        check('S22 a 1.3.0 note tag can be moved; it becomes a placed tag with the same key and is not drawn twice',
              'note tag, Move…, click after "Hold frequency"', [False, 'Hold frequency', blk, 'inline', 1], [before] + res)
        save(page); reload(page)
        res2 = page.evaluate("[document.querySelectorAll('#docEl .wn-cite').length, Object.keys(WN.debug.refs()).length]")
        pv = [s_['preview'] for s_ in page.evaluate('WN.debug.sources()') if s_['docTitle'] == 'Older note style']
        check('S23 after a reload: one tag, one reference, the Sources text is still the note', 'reload',
              [[1, 1], ['Hold frequency within the band.']], [res2, pv])
    guard('S22-S23 move a 1.3.0 tag', t10)

    def t11():
        page.click('#confirmEndBtn'); page.locator('dialog.dlg').get_by_role('button', name='Confirm end of document').click(); page.wait_for_timeout(900)
        labels = menu(page, 0).locator('button').all_inner_texts(); page.keyboard.press('Escape')
        check('S24 in a final document the tag menu only offers to view the source', 'Confirm end of document, click the tag', ['View source…'], labels)
    guard('S24 final', t11)

    def t12():
        # Defect found by the 1.4.0 walkthrough: Heading 1 on a paragraph holding a tag nested the heading inside the paragraph.
        new_doc(page, 'blank'); set_body(page, '<p>Limits for frequency.</p><p>Body text.</p>')
        select_text(page, 'frequency'); ref_dialog(page, 'Made-up Code', '3')
        caret_after(page, 'Limits'); tab(page, 'Home')
        page.select_option('#rbPanel select[data-sel="style"]', 'h1'); page.wait_for_timeout(400)
        shape = page.evaluate("[[...document.getElementById('docEl').children].map(e => e.tagName), document.querySelectorAll('#docEl h1 .wn-cite').length, document.querySelectorAll('#docEl p h1').length]")
        tab(page, 'View'); page.click('#rbPanel .rb-btn:text-is("Navigation pane")')
        wait_js(page, "document.querySelectorAll('#navPane .nl1 button').length > 0", 3000)
        nav = page.eval_on_selector_all('#navPane .nl1 button', 'x => x.map(e => e.textContent)')
        page.click('#rbPanel .rb-btn:text-is("Navigation pane")')
        check('S25 Heading 1 on a paragraph with a tag makes one heading that keeps its tag; the navigation lists only its words',
              'tag after "frequency", Home, style Heading 1, View, Navigation pane', [['H1', 'P'], 1, 0, ['Limits for frequency.']], shape + [nav])
    guard('S25 style change keeps the tag', t12)

    # ================= Issues 2 and 3: ribbon order, quick access bar, saved arrangement =================
    def q1():
        new_doc(page, 'blank'); set_body(page, '<p>Quick bar paragraph.</p><p>Second plain line.</p>')
        qat = page.eval_on_selector_all('#rbQat .qat-item', 'x => x.map(e => e.getAttribute("data-path"))')
        check('Q1 the quick access bar holds the style list and the most used commands by default', 'new document',
              ['home/styles/sel:style', 'home/font/bold', 'home/font/italic', 'home/font/underline', 'home/paragraph/ul', 'home/paragraph/ol', 'home/editing/find', 'refs/sources/srcRef'], qat)
        vis = []
        for t in ['Home', 'Insert', 'Design & layout', 'References', 'Review', 'View']:
            tab(page, t); vis.append(page.locator('#rbQat').is_visible() and page.locator('#rbQat .qat-item').count())
        page.click('#rbCollapse'); page.wait_for_timeout(200); vis.append(page.locator('#rbQat').is_visible() and page.locator('#rbQat .qat-item').count())
        page.click('#rbCollapse'); page.wait_for_timeout(200)
        check('Q2 the bar is visible on every tab and when the ribbon is hidden', 'six tabs, then Hide ribbon', [8] * 7, vis)
        tab(page, 'Home')
        check('Q3 Home starts with Styles and Font; Clipboard is last', 'Home tab', ['home/styles', 'home/font', 'home/paragraph', 'home/editing', 'home/clipboard'], groups(page))
    guard('Q1-Q3 defaults', q1)

    def q2():
        tab(page, 'Insert'); caret_after(page, 'Quick bar')
        page.evaluate("""() => { const s = document.querySelector('#rbQat .qat-item[data-path="home/styles/sel:style"]'); const sel = s.tagName === 'SELECT' ? s : s.querySelector('select');
          sel.value = [...sel.options].find(o => /Heading 1/.test(o.textContent)).value; sel.dispatchEvent(new Event('change', { bubbles: true })); }""")
        page.wait_for_timeout(400)
        check('Q4 the style list in the bar works from any tab', 'Insert tab, bar style list, Heading 1', 'H1', page.evaluate("document.querySelector('#docEl').firstElementChild.tagName"))
        tab(page, 'Home'); select_text(page, 'Second')
        page.click('#rbQat .qat-item[data-path="home/font/bold"]'); page.wait_for_timeout(300)
        pressed = page.evaluate("""[document.querySelector('#rbQat [data-path="home/font/bold"]').getAttribute('aria-pressed'),
          document.querySelector('#rbPanel [data-path="home/font/bold"]').getAttribute('aria-pressed'), getComputedStyle(document.querySelectorAll('#docEl p')[0].firstElementChild || document.body).fontWeight]""")
        check('Q5 Bold in the bar bolds the text and both Bold buttons show it as on', 'select "Second" (plain paragraph), bar Bold', ['true', 'true', '700'], pressed)
    guard('Q4-Q5 bar works', q2)

    def q3():
        tab(page, 'Insert')
        pb = page.locator('#rbPanel [data-path]', has_text='Page break').first; path = pb.get_attribute('data-path')
        pb.click(button='right'); page.wait_for_timeout(200)
        page.locator('.rb-menu').get_by_role('menuitem', name='Add to quick access bar').click(); page.wait_for_timeout(300)
        reload(page)
        last = page.eval_on_selector_all('#rbQat .qat-item', 'x => x.map(e => e.getAttribute("data-path"))')[-1:]
        check('Q6 right-click, "Add to quick access bar" adds the command, and it is still there after a reload', 'Insert › Page break', [path], last)
        page.locator(f'#rbQat [data-path="{path}"]').click(button='right'); page.wait_for_timeout(200)
        page.locator('.rb-menu').get_by_role('menuitem', name='Remove from quick access bar').click(); page.wait_for_timeout(300)
        check('Q7 right-click on the bar removes it again', 'bar › Page break › Remove', 0, page.locator(f'#rbQat [data-path="{path}"]').count())
    guard('Q6-Q7 right-click', q3)

    def q4():
        tab(page, 'Home'); page.click('#rbCustom'); page.wait_for_timeout(300)
        dlg = page.locator('dialog.dlg')
        for _ in range(4): dlg.get_by_role('button', name='Move Clipboard up').click(); page.wait_for_timeout(80)
        dlg.get_by_label('Show Editing').uncheck()
        rows = dlg.locator('ol[aria-label="Tab order"] li'); rows.nth(4).focus(); page.keyboard.press('Alt+ArrowUp'); page.wait_for_timeout(80)
        # Focus follows the moved row, so Alt+Up three more times takes Review from 5th to 1st.
        for _ in range(3): page.keyboard.press('Alt+ArrowUp'); page.wait_for_timeout(80)
        dlg.locator('ol[aria-label="Groups in Home"] li[data-key="font"]').get_by_role('button', name='Commands…').click(); page.wait_for_timeout(100)
        for _ in range(2): dlg.get_by_role('button', name='Move Bold (B) up').click(); page.wait_for_timeout(80)
        dlg.get_by_label('Command to add to the quick access bar').select_option(label='Insert › Pages › Page break')
        dlg.get_by_role('button', name='Add', exact=True).click(); page.wait_for_timeout(100)
        dlg.get_by_role('button', name='Save').click(); page.wait_for_timeout(500)
        tabs = page.eval_on_selector_all('#ribbon .rb-tab', 'x => x.map(e => e.textContent)')
        tab(page, 'Home')
        font = page.eval_on_selector_all('#rbPanel .rb-group[data-group="home/font"] [data-path]', 'x => x.slice(0, 3).map(e => e.getAttribute("data-path"))')
        # Hand-worked: Clipboard 5th → 1st; Editing hidden; Review 5th → 1st; Bold 3rd (after name, size) → 1st; Page break added at the end of the bar.
        exp = [['Review', 'Home', 'Insert', 'Design & layout', 'References', 'View'], ['home/clipboard', 'home/styles', 'home/font', 'home/paragraph'],
               ['home/font/bold', 'home/font/sel:fontName', 'home/font/sel:fontSize'], 'insert/pages/pageBreak']
        got = [tabs, groups(page), font, page.eval_on_selector_all('#rbQat .qat-item', 'x => x.map(e => e.getAttribute("data-path"))')[-1]]
        check('Q8 Customise: tabs, groups and commands can be reordered, groups hidden, the bar added to; Save applies it', 'see steps', exp, got)
        reload(page); tab(page, 'Home')
        tabs2 = page.eval_on_selector_all('#ribbon .rb-tab', 'x => x.map(e => e.textContent)')
        check('Q9 the arrangement is the same after a reload', 'reload', exp[:2], [tabs2, groups(page)])
        saved = page.evaluate("JSON.parse(localStorage.getItem('wrapnote:ribbonLayout'))")
        check('Q10 only the changes are stored (small and future-proof)', 'stored setting', [True, ['home/editing'], True],
              [isinstance(saved, dict) and saved.get('v') == 1, saved.get('hidden'), 'items' in saved and list(saved['items'].keys()) == ['home/font']])
    guard('Q8-Q10 customise', q4)

    def q5():
        page.click('#rbCustom'); page.wait_for_timeout(300); dlg = page.locator('dialog.dlg')
        dlg.get_by_role('button', name='Move Home up').click(); dlg.get_by_role('button', name='Cancel').click(); page.wait_for_timeout(300)
        check('Q11 Cancel changes nothing', 'move Home up, Cancel', 'Review', page.locator('#ribbon .rb-tab').first.text_content())
        page.click('#rbCustom'); page.wait_for_timeout(300); dlg = page.locator('dialog.dlg')
        dlg.get_by_role('button', name='Restore standard').click(); page.wait_for_timeout(100); dlg.get_by_role('button', name='Save').click(); page.wait_for_timeout(500)
        tab(page, 'Home')
        check('Q12 "Restore standard" then Save brings back the standard order and bar', 'Restore standard, Save',
              ['Home', ['home/styles', 'home/font', 'home/paragraph', 'home/editing', 'home/clipboard'], 8, None],
              [page.locator('#ribbon .rb-tab').first.text_content(), groups(page), page.locator('#rbQat .qat-item').count(), page.evaluate("JSON.parse(localStorage.getItem('wrapnote:ribbonLayout'))")])
        page.click('#rbCustom'); page.wait_for_timeout(300); dlg = page.locator('dialog.dlg')
        dlg.locator('#czTab').select_option(label='References')
        for g in ['Sources', 'Table of contents', 'Captions']: dlg.get_by_label('Show ' + g).uncheck()
        dlg.get_by_label('Show Footnotes').click(); page.wait_for_timeout(150)
        still = dlg.get_by_label('Show Footnotes').is_checked(); msg = toasts(page)
        dlg.get_by_role('button', name='Cancel').click()
        check('Q13 the last group of a tab cannot be hidden; the message says why', 'hide all four References groups', [True, True], [still, 'at least one group' in msg])
    guard('Q11-Q13 cancel, reset, guard', q5)

    def q6():
        page.evaluate("""localStorage.setItem('wrapnote:ribbonLayout', JSON.stringify({ v: 1, tabs: ['view', 'home', 'insert', 'nope', 'layout', 'refs', 'review'],
          groups: { home: ['ghost', 'clipboard', 'styles', 'font', 'paragraph', 'editing'] }, qat: ['home/font/bold', 'x/y/z', 'home/font/bold'] }))""")
        reload(page); tab(page, 'Home')
        got = [page.locator('#ribbon .rb-tab').first.text_content(), groups(page)[:2], page.eval_on_selector_all('#rbQat .qat-item', 'x => x.map(e => e.getAttribute("data-path"))'), page.locator('#docEl').count()]
        # Hand-worked: "nope", "ghost" and "x/y/z" are unknown, the second Bold repeats; everything else keeps its saved order.
        check('Q14 a damaged saved arrangement loads: unknown and repeated parts are dropped, the rest kept', 'tabs with "nope", groups with "ghost", bar with a bad and a repeated entry',
              ['View', ['home/clipboard', 'home/styles'], ['home/font/bold'], 1], got)
        page.evaluate("localStorage.setItem('wrapnote:ribbonLayout', '\"not a layout\"')"); reload(page); tab(page, 'Home')
        check('Q15 a saved arrangement that is not a layout at all falls back to the standard one', 'stored text "not a layout"',
              ['Home', 8], [page.locator('#ribbon .rb-tab').first.text_content(), page.locator('#rbQat .qat-item').count()])
        page.evaluate("localStorage.removeItem('wrapnote:ribbonLayout')")
    guard('Q14-Q15 damaged setting', q6)

    def q7():
        page.click('#rbMode') if 'Full' in (page.locator('#rbMode').text_content() or '') else None
        page.wait_for_timeout(300); bands = []
        for t in ['Home', 'Insert', 'Design & layout', 'References', 'Review', 'View']:
            tab(page, t)
            bands.append(page.evaluate("new Set([...document.querySelectorAll('#rbPanel .rb-group')].map(g => Math.round(g.getBoundingClientRect().top))).size"))
        check('Q16 full ribbon at 1366 px: every tab fits in one band of groups (1.3.0 needed two on Home, Insert and Review)', 'Full ribbon, each tab', [1] * 6, bands)
        page.click('#rbMode'); page.wait_for_timeout(300)
    guard('Q16 full ribbon', q7)

    def q8():
        for w in (320, 360, 390):
            c3 = b.new_context(viewport={'width': w, 'height': 760}, has_touch=True, is_mobile=True); c3.add_init_script(INIT); p3 = c3.new_page()
            p3.goto(BASE + '#home'); ready(p3); p3.click('#page-home [data-new="blank"]'); p3.wait_for_timeout(700)
            sw = p3.evaluate('document.documentElement.scrollWidth')
            r = p3.evaluate("""() => { const q = document.getElementById('rbQat'), t = document.querySelector('.rb-tabs'); const a = q.getBoundingClientRect(), b = t.getBoundingClientRect();
              const small = [...q.querySelectorAll('button, select')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(x => x.height < 44 || x.width < 44).length;
              return [a.bottom <= b.top + 1, small]; }""")
            p3.click('#rbCustom'); p3.wait_for_timeout(400)
            d = p3.evaluate("""() => { const d = document.querySelector('dialog.dlg'); const small = [...d.querySelectorAll('.cz-mv, select, .dlg-actions button')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect()).filter(x => x.height < 44).length;
              return [d.scrollWidth <= d.clientWidth + 1, small]; }""")
            check(f'Q17 phone {w} px: the bar has its own row, no sideways scroll, 44 px targets in the bar and in Customise', f'{w} px wide', [w, [True, 0], [True, 0]], [sw, r, d])
            c3.close()
    guard('Q17 phones', q8)

    def q9():
        c4 = b.new_context(viewport={'width': 390, 'height': 800}, has_touch=True, is_mobile=True); c4.add_init_script(INIT); p4 = c4.new_page(); p4.set_default_timeout(8000)
        p4.goto(BASE + '#home'); ready(p4); p4.click('#page-home [data-new="blank"]'); p4.wait_for_timeout(700)
        p4.get_by_role('button', name='Document', exact=True).first.tap(); p4.wait_for_timeout(300)  # phones show fields or the page
        set_body(p4, '<p>The Grid limits apply to all turbines.</p>'); select_text(p4, 'Grid limits')
        p4.locator('#rbQat [data-path="refs/sources/srcRef"]').tap(); p4.wait_for_timeout(300)
        d4 = p4.locator('dialog.dlg'); d4.get_by_label('Document name', exact=True).fill('IEC 61400'); d4.get_by_label('Document name', exact=True).press('Tab'); p4.wait_for_timeout(400)
        d4.get_by_role('button', name='Done').tap(); p4.wait_for_timeout(500)
        p4.locator('#docEl .wn-cite').first.tap(); p4.wait_for_timeout(300)
        p4.locator('.cite-menu').get_by_role('menuitem', name='Move…').tap(); p4.wait_for_timeout(200)
        pt = point_after(p4, 'apply'); p4.touchscreen.tap(pt['x'], pt['y']); p4.wait_for_timeout(500)
        check('Q18 phone, touch only: cite from the bar, then tap the tag, Move…, tap the new place', '390 px touch screen, select "Grid limits", move after "apply"',
              ['The Grid limits apply', 'Source: IEC 61400', ' to all turbines.', 'inline'], para(p4, 0))
        c4.close()
    guard('Q18 touch', q9)

    b.close()

with sync_playwright() as p:
    run(p)
passed = sum(1 for r in results if r['pass'])
print(f'\n1.4.0 round {args.round}: {passed}/{len(results)} checks passed')
json.dump(results, open(os.path.join(args.out, f'v140-{args.round}.json'), 'w'), indent=1)
sys.exit(0 if passed == len(results) else 1)

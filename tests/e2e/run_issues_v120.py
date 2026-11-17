"""WrapNote 1.2.0 browser tests for the reported issues (cursor, update table, captions, spell check,
page colour, split-view ruler, current style, action cost, Word export, office template).

Each check states its input and the expected result worked out by hand. They were run on 1.1.0 first
to reproduce the problems, then kept as regression tests. All content is made up.
Run: python tests/e2e/run_issues_v120.py [--base URL] [--chrome PATH] [--round NAME] [--out DIR]
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

def run(p):
    kw = {'args': ['--no-sandbox']}
    if args.chrome: kw['executable_path'] = args.chrome
    b = p.chromium.launch(**kw)
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True); ctx.add_init_script(INIT)
    page = ctx.new_page()
    page.goto(BASE + '#home'); wait_js(page, 'document.body.classList.contains("ready")')

    # ---------- Issue 1: cursor jumps ----------
    def c1():
        new_doc(page)
        set_body(page, '<p>First para</p><table class="wn-table"><tbody><tr><td>a</td><td>b</td></tr></tbody></table><p>Middle para</p><p>Last para</p>')
        # Browsers sometimes type straight into the page root (no paragraph). The text must stay where it was typed.
        page.evaluate("""() => { const d = document.getElementById('docEl'); const t = document.createTextNode('X'); d.insertBefore(t, d.children[2]); d.focus();
          const r = document.createRange(); r.setStart(t, 1); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); d.dispatchEvent(new InputEvent('input', { bubbles: true })); }""")
        page.wait_for_timeout(200); page.keyboard.type('YZ'); page.wait_for_timeout(400)
        paras = page.evaluate("[...document.querySelectorAll('#docEl > p')].map(p => p.textContent)")
        check('C1 text typed after a table stays in its own paragraph', 'type "YZ" after stray "X"', ['First para', 'XYZ', 'Middle para', 'Last para'], paras)
        page.click('#docEl td >> nth=1'); page.keyboard.press('End'); page.keyboard.type('cell'); page.wait_for_timeout(300)
        check('C2 typing in a table cell stays in that cell', 'click cell 2, End, type "cell"', ['a', 'bcell'], page.evaluate("[...document.querySelectorAll('#docEl td')].map(t => t.textContent)"))
        caret_after(page, 'First para'); page.keyboard.press('ArrowDown'); page.keyboard.press('ArrowDown'); page.keyboard.type('Q'); page.wait_for_timeout(300)
        kids = page.evaluate("[...document.getElementById('docEl').children].map(e => e.textContent)")
        check('C3 Down arrow moves line by line through a table and out of it', 'End of "First para", Down, Down, type Q',
              True, kids[1] == 'abcell' and kids[2].startswith('Q'), ok=kids[1] == 'abcell' and kids[2].startswith('Q'))
    guard('C1-C3 cursor', c1)

    # ---------- Issue 2: Update table ----------
    def c2():
        new_doc(page)
        set_body(page, '<h1>Alpha</h1><p>text</p><h2>Beta</h2><p>more</p>')
        tab(page, 'References'); page.click('#ribbon .rb-btn:text-is("Table of contents…")'); page.click('dialog.dlg .dlg-actions button:text-is("Insert")'); page.wait_for_timeout(600)
        page.evaluate("document.getElementById('toasts').textContent = ''")
        page.click('#ribbon .rb-btn:text-is("Update table")'); page.wait_for_timeout(400)
        msg = ' '.join(page.eval_on_selector_all('#toasts .toast', 't => t.map(x => x.textContent)'))
        check('U1 Update table with an up-to-date table says it updated 1 table', 'one contents table, nothing changed', True, 'Updated 1 table' in msg and 'No table' not in msg, ok='Updated 1 table' in msg)
        caret_after(page, 'Beta'); page.keyboard.type(' Two'); page.wait_for_timeout(300)
        page.click('#ribbon .rb-btn:text-is("Update table")'); page.wait_for_timeout(400)
        check('U2 the contents table shows the edited heading', 'rename "Beta" to "Beta Two", Update table', True, 'Beta Two' in page.inner_text('#docEl .wn-toc'))
    guard('U1-U2 update table', c2)

    # ---------- Issue 3: captions and table of figures ----------
    def c3():
        new_doc(page)
        png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='
        set_body(page, f'<p>Intro</p><figure class="wn-obj wn-img wrap-inline"><img src="{png}" alt="Picture A" style="width:200px"></figure><p>Between</p><figure class="wn-obj wn-img wrap-inline"><img src="{png}" alt="Picture B" style="width:200px"></figure><table class="wn-table"><tbody><tr><td>x</td></tr></tbody></table>')
        page.click('#docEl figure >> nth=1'); tab(page, 'References'); page.click('#ribbon .rb-btn:text-is("Insert caption…")')
        page.fill('dialog.dlg input[placeholder="Describe the item"]', 'Second picture'); page.click('dialog.dlg .dlg-actions button:text-is("Insert")'); page.wait_for_timeout(300)
        page.click('#docEl figure >> nth=0'); page.click('#ribbon .rb-btn:text-is("Insert caption…")')
        page.fill('dialog.dlg input[placeholder="Describe the item"]', 'First picture'); page.click('dialog.dlg .dlg-actions button:text-is("Insert")'); page.wait_for_timeout(600)
        caps = page.evaluate("[...document.querySelectorAll('#docEl figure')].map(f => { const c = f.querySelector('figcaption'); return c ? [c.textContent, getComputedStyle(c).textAlign] : null; })")
        check('F1 each caption sits inside its own picture, centred, numbered in page order', 'caption picture 2 first, then picture 1',
              [['Figure 1: First picture', 'center'], ['Figure 2: Second picture', 'center']], caps)
        aligned = page.evaluate("(() => { const f = document.querySelectorAll('#docEl figure')[0]; const i = f.querySelector('img').getBoundingClientRect(), c = f.querySelector('figcaption').getBoundingClientRect(); return Math.abs((i.left + i.right) / 2 - (c.left + c.right) / 2) < 3 && c.top >= i.bottom - 1; })()")
        check('F2 caption is centred under its picture (geometry)', 'picture 1', True, aligned)
        page.click('#ribbon .rb-btn:text-is("Insert caption…")')
        page.select_option('dialog.dlg select#capTarget', label='Table 1')
        page.fill('dialog.dlg input[placeholder="Describe the item"]', 'Data'); page.click('dialog.dlg .dlg-actions button:text-is("Insert")'); page.wait_for_timeout(500)
        prev = page.evaluate("(() => { const t = document.querySelector('#docEl table'); const p = t.previousElementSibling; return p ? p.textContent : ''; })()")
        check('F3 a table caption goes above its table, chosen from the list', 'Attach to: Table 1', 'Table 1: Data', prev)
        caret_after(page, 'Intro'); page.click('#ribbon .rb-btn:text-is("Table of figures…")'); page.click('dialog.dlg .dlg-actions button:text-is("Insert")'); page.wait_for_timeout(700)
        tof = page.eval_on_selector_all('#docEl .wn-toc[data-source="figures"] li a', 'a => a.map(x => x.textContent)')
        check('F4 table of figures lists the figure captions in order', 'Insert table of figures (Figure)', ['Figure 1: First picture', 'Figure 2: Second picture'], tof)
    guard('F1-F4 captions', c3)

    # ---------- Issue 4: spell check as soon as a word is typed ----------
    def c4():
        new_doc(page)
        ready = wait_js(page, 'WN.debug.spellReady && WN.debug.spellReady()', 30000)
        set_body(page, '<p>Start</p>')
        caret_after(page, 'Start'); page.keyboard.type(' this word is mispeled ')
        page.wait_for_timeout(700)
        marked = page.evaluate("(() => { const h = CSS.highlights && CSS.highlights.get('wn-spell'); return h ? [...h].map(r => r.toString()) : null; })()")
        check('S1 a misspelt word is underlined right after it is typed', 'type "this word is mispeled "', ['mispeled'], marked)
        sug = page.evaluate("WN.debug.spellSuggest('mispeled')")
        check('S2 suggestions include the right spelling', 'mispeled', True, isinstance(sug, list) and 'misspelled' in sug)
        # Hand-worked: while the cursor sits at the end of "anothre" it is still being typed, so only "mispeled" is marked;
        # after a space both are marked, in page order.
        caret_after(page, 'mispeled'); page.keyboard.press('End'); page.keyboard.type('anothre'); page.wait_for_timeout(700)
        during = page.evaluate("WN.debug.spellMarked()")
        page.keyboard.type(' '); page.wait_for_timeout(700)
        after = page.evaluate("WN.debug.spellMarked()")
        check('S3 a word being typed is not underlined until it is finished', 'type "anothre", then a space', [['mispeled'], ['mispeled', 'anothre']], [during, after])
    guard('S1-S3 spell check', c4)

    # ---------- Issue 5: page colour ----------
    def c5():
        new_doc(page)
        tab(page, 'Design & layout'); page.click('#ribbon .rb-btn:text-is("Page colour…")')
        page.click('dialog.dlg button[aria-label="Pale green"]'); page.wait_for_timeout(500)
        bg = page.evaluate("getComputedStyle(document.querySelector('#sheetBg .pg-box')).backgroundColor")
        check('P1 choosing Pale green colours the page', 'Page colour… -> Pale green (#E2F0D9)', 'rgb(226, 240, 217)', bg)
        page.evaluate('window.print = () => {}'); page.select_option('#exportSel', 'pdf'); page.wait_for_timeout(300)
        pbg = page.evaluate("(() => { const b = document.querySelector('#print-root .pg-box'); return b ? getComputedStyle(b).backgroundColor : null; })()")
        page.evaluate("window.dispatchEvent(new Event('afterprint'))")
        check('P2 the page colour prints', 'PDF export', 'rgb(226, 240, 217)', pbg)
    guard('P1-P2 page colour', c5)

    # ---------- Issue 6: ruler in split view ----------
    def c6():
        tab(page, 'View'); page.click('#ribbon .rb-btn:text-is("Ruler")')
        page.select_option('#ribbon [data-sel="split"]', 'vertical'); page.wait_for_timeout(600)
        ok = page.evaluate("(() => { const r = document.querySelector('#splitPane .split-ruler'); return !!r && r.offsetHeight > 10 && r.querySelectorAll('.r-tick').length > 10; })()")
        check('R1 the second view has its own ruler with centimetre marks', 'Ruler on, split side by side', True, ok)
        page.select_option('#ribbon [data-sel="split"]', 'off'); page.click('#ribbon .rb-btn:text-is("Ruler")')
    guard('R1 split ruler', c6)

    # ---------- Issue 7: current style shown ----------
    def c7():
        new_doc(page)
        set_body(page, '<h2>Section heading</h2><p>Plain text</p><blockquote>Quoted</blockquote>')
        tab(page, 'Home')
        got = []
        for t in ['Section heading', 'Plain text', 'Quoted']:
            caret_after(page, t); page.wait_for_timeout(200)
            got.append([page.eval_on_selector('#ribbon [data-sel="style"]', 's => s.options[s.selectedIndex].textContent'), page.inner_text('#stStyle')])
        check('Y1 the style list and status bar show the style at the cursor', 'cursor in H2, paragraph, quote',
              [['Heading 2', 'Style: Heading 2'], ['Normal', 'Style: Normal'], ['Quote', 'Style: Quote']], got)
    guard('Y1 current style', c7)

    # ---------- Issue 7b: no cost on action items ----------
    def c8():
        new_doc(page, 'mom')
        page.click('.rows-fld:has-text("Action items") .rows-head button:text-is("+ Add")')
        labels = page.eval_on_selector_all('.rows-fld:has-text("Action items") .row-ed input', 'i => i.map(x => x.getAttribute("aria-label"))')
        check('A1 action items have no cost field', 'Add one action', False, any('Cost' in (l or '') for l in labels))
        row = page.locator('.rows-fld:has-text("Action items") .row-ed').last
        row.locator('input[aria-label^="Task"]').fill('Send notes'); page.wait_for_timeout(400)
        check('A2 the action table on the page has no cost column', 'one action', False, 'Cost' in page.inner_text('#docEl .wn-actions'))
    guard('A1-A2 cost removed', c8)

    # ---------- Issue 8: Word export ----------
    def c9():
        new_doc(page)
        set_body(page, '<h1>Overview</h1><p>Body text with <b>bold</b> and <i>italic</i>.</p><table class="wn-table wn-style-corporate"><thead><tr><th>Term</th><th>Definition</th></tr></thead><tbody><tr><td>A</td><td>First</td></tr></tbody></table><ul><li>One</li><li>Two</li></ul>')
        page.fill('#edTitle', 'Export check'); page.wait_for_timeout(900)
        d = download(page, 'docx')
        path = os.path.join(args.out, f'personal-{args.round}.docx'); d.save_as(path)
        z = zipfile.ZipFile(path); doc = z.read('word/document.xml').decode()
        check('W1 Word export is a real .docx package', 'Export -> Word (.docx)', [True, True], [d.suggested_filename.endswith('.docx'), 'word/styles.xml' in z.namelist()])
        has_borders = '<w:tblBorders>' in doc or 'w:tblStyle' in doc and '<w:tblBorders>' in z.read('word/styles.xml').decode()
        check('W2 tables keep their borders and a repeating header row', 'table with header', [True, True], [has_borders, '<w:tblHeader/>' in doc])
        check('W3 headings, bold and italic use Word formatting', 'H1, <b>, <i>', [True, True, True], ['w:val="Heading1"' in doc, '<w:b/>' in doc, '<w:i/>' in doc])
        check('W4 bullets use Word numbering, not typed characters', '2 bullets', [True, False], ['<w:numPr>' in doc, '•' in doc])
    guard('W1-W4 Word export', c9)

    # ---------- Issue 8b: everything the page can hold reaches Word ----------
    def c9b():
        import base64, xml.etree.ElementTree as ET
        png = base64.b64encode(bytes.fromhex('89504e470d0a1a0a0000000d4948445200000002000000020802000000fdd49a730000001649444154789c63f8cfc0f01f0418181818fe0300203b07f9e3a1b4a50000000049454e44ae426082')).decode()
        new_doc(page)
        mml = page.evaluate(r"WN.latex.toMathML('\\frac{a}{2}', true).xml")
        set_body(page, '<h1>Plan</h1><nav class="wn-toc" contenteditable="false" data-source="headings" data-levels="3" data-mode="auto"><p class="wn-toc-title">Contents</p><ol></ol></nav>'
                 f'<figure class="wn-img wn-obj has-caption" contenteditable="false"><img src="data:image/png;base64,{png}" alt="dot" style="width:120px"><figcaption class="wn-caption" data-kind="Figure" contenteditable="true"><span class="wn-capnum" contenteditable="false">Figure 1</span>: Dot</figcaption></figure>'
                 f'<div class="wn-eq block" contenteditable="false" data-tex="\\frac{{a}}{{2}}" data-display="block">{mml}</div>'
                 '<p>Note<sup class="wn-fnref" contenteditable="false" data-text="Made-up source">1</sup> and <span class="wn-comment" data-cid="c1">checked</span> text <ins class="wn-ins" data-author="A. Rao" data-time="1795000000000">added</ins><del class="wn-del" data-author="A. Rao" data-time="1795000000000">removed</del>.</p>'
                 '<div class="wn-cols" style="column-count: 2"><p>Left</p><p>Right</p></div><p>After</p>')
        page.evaluate("() => { document.querySelector('#docEl').dispatchEvent(new Event('input')); }")
        page.wait_for_timeout(800)
        d = download(page, 'docx'); path = os.path.join(args.out, f'rich-{args.round}.docx'); d.save_as(path)
        z = zipfile.ZipFile(path); doc = z.read('word/document.xml').decode()
        bad = [n for n in z.namelist() if n.endswith('.xml') or n.endswith('.rels')]
        parsed = 0
        for n in bad:
            ET.fromstring(z.read(n)); parsed += 1
        check('W5 every part of a rich document is well-formed XML', f'{len(bad)} XML parts', len(bad), parsed)
        check('W6 picture, caption field, equation, footnote, tracked changes and columns reach Word', 'rich page',
              [True] * 7, ['<w:drawing>' in doc and any(n.startswith('word/media/') for n in z.namelist()), 'SEQ Figure' in doc, '<m:oMathPara>' in doc and '<m:f>' in doc,
                           '<w:footnoteReference' in doc and 'Made-up source' in z.read('word/footnotes.xml').decode(), '<w:ins ' in doc, '<w:del ' in doc, 'w:num="2"' in doc])
        # Hand-worked: both words are plain runs (no shading, no colour); Word adds its own change marks.
        check('W8 screen-only marks (comment highlight, change colours) are not baked into the text', 'commented and inserted words',
              [True, True], ['<w:r><w:t xml:space="preserve">checked</w:t>' in doc, '<w:r><w:t xml:space="preserve">added</w:t>' in doc])
        toc_ok = 'TOC \\o "1-3"' in doc and 'w:anchor="_Toc' in doc
        check('W7 the contents field has cached entries that link to the headings', 'Contents with one heading', True, toc_ok)
    guard('W5-W7 rich Word export', c9b)

    # ---------- Issue 9: office template ----------
    def c10():
        page.goto(BASE + '#home'); wait_js(page, 'document.body.classList.contains("ready")')
        page.click('#page-home [data-new="office"]'); page.wait_for_selector('#editor:not([hidden])'); page.wait_for_timeout(900)
        heads = page.eval_on_selector_all('#docEl h1', 'h => h.map(x => (x.getAttribute("data-num") || "") + " " + x.textContent)')
        check('O1 new office document has the standard numbered sections', 'New office document',
              ['1 Revision History', '2 Purpose', '3 Scope', '4 Definitions and Abbreviations', '5 Roles and Responsibilities', '6 Main Content', '7 Requirements or Procedure', '8 Records and Evidence', '9 References', '10 Appendices'], heads)
        hdr = page.inner_text('#sheetFg .pg-head-office >> nth=0')
        check('O2 the controlled-document header shows the placeholders and page X / Y', 'page 1 header',
              True, all(s in hdr for s in ['Classification: [CLASSIFICATION]', '[APPROVED LOGO]', '[DOCUMENT TYPE]', '[ORGANIZATION]', 'Page: 1 / ']))
        first = page.inner_text('#sheetFg .pg-foot-office.first >> nth=0'); later = page.inner_text('#sheetFg .pg-foot-office.later >> nth=0')
        check('O3 first page and later pages have different footers', 'pages 1 and 2', [True, True], ['[REVIEWER]' in first, '[APPROVED FOOTER NOTICE]' in later])
        font = page.evaluate("getComputedStyle(document.querySelector('#docEl p:not([class])') || document.querySelector('#docEl p')).fontFamily")
        check('O4 body text uses the template font (Verdana 10 pt)', 'office body paragraph', True, font.startswith('Verdana'))
        d = download(page, 'docx'); path = os.path.join(args.out, f'office-{args.round}.docx'); d.save_as(path)
        z = zipfile.ZipFile(path); doc = z.read('word/document.xml').decode(); names = z.namelist()
        hdr_xml = ''.join(z.read(n).decode() for n in names if re.match(r'word/header\d+\.xml', n))
        check('O5 office .docx has a TOC field and PAGE / NUMPAGES fields', 'export office document', [True, True, True], ['TOC \\o "1-3" \\h \\z \\u' in doc, 'PAGE' in hdr_xml, 'NUMPAGES' in hdr_xml])
        check('O6 office .docx has a different first page and no typed heading numbers', 'export', [True, False], ['<w:titlePg/>' in doc, bool(re.search(r'<w:t[^>]*>\d+\s+(Purpose|Scope)<', doc))])
        wait_js(page, 'WN.debug.spellReady()', 30000); page.wait_for_timeout(600)
        check('O8 the template\'s own words (Approver, Reviewer) are not marked as spelling mistakes', 'new office document', [], [w for w in page.evaluate('WN.debug.spellMarked()') if w in ('Approver', 'Reviewer', 'Accountability')])
        core = z.read('docProps/core.xml').decode()
        check('O7 document properties are neutral', 'docProps/core.xml', [True, True, False], ['Generic Office Document Template' in core or '<dc:title>' in core, '<cp:category>Office Template</cp:category>' in core, bool(re.search(r'<dc:creator>[^<]+</dc:creator>', core))])
    guard('O1-O7 office template', c10)

    # ---------- Issue 9b: import your own Word template (checked and cleaned on the device) ----------
    def c11():
        import docx, tempfile
        from docx.shared import Pt
        # A made-up template: python-docx's default styles, Georgia body text, a header placeholder and an author name.
        t = docx.Document(); t.styles['Normal'].font.name = 'Georgia'; t.styles['Normal'].font.size = Pt(11)
        t.sections[0].header.paragraphs[0].text = '[ORG UNIT] controlled copy'
        t.core_properties.author = 'Made-up Person'; t.add_paragraph('Body')
        path = os.path.join(tempfile.mkdtemp(), 'made-up-template.docx'); t.save(path)
        page.goto(BASE + '#settings'); page.wait_for_timeout(500)
        with page.expect_file_chooser() as fc:
            page.click('#tplImport')
        fc.value.set_files(path)
        wait_js(page, "document.querySelector('#tplReport').textContent.includes('imported on')", 15000)
        rep = page.inner_text('#tplReport')
        check('T1 the import report lists what was removed and what was added', 'import a template with an author name and missing styles',
              [True, True, True], ['Author name in document properties' in rep, 'Added missing styles' in rep, page.is_checked('#tplUse')])
        page.goto(BASE + '#home'); wait_js(page, 'document.body.classList.contains("ready")')
        page.click('#page-home [data-new="office"]'); page.wait_for_selector('#editor:not([hidden])'); page.wait_for_timeout(900)
        d = download(page, 'docx'); out = os.path.join(args.out, f'imported-{args.round}.docx'); d.save_as(out)
        z = zipfile.ZipFile(out); st = z.read('word/styles.xml').decode(); names = z.namelist()
        hdr = ''.join(z.read(n).decode() for n in names if re.match(r'word/header\d+\.xml', n))
        core = z.read('docProps/core.xml').decode()
        check('T2 the export uses the imported styles and header, with the missing roles added', 'export office document',
              [True, True, True, False], ['w:ascii="Georgia"' in st, 'w:styleId="WNTable"' in st, '[ORG UNIT]' in hdr, 'Made-up Person' in core])
        doc = z.read('word/document.xml').decode()
        # Hand-worked: the made-up template's headings are not numbered, so the cached contents must not show "1<tab>Purpose".
        check('T4 contents entries follow the template: no heading numbers when its headings are unnumbered', 'unnumbered template', False,
              bool(re.search(r'<w:t xml:space="preserve">\d+</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t xml:space="preserve">Purpose<', doc)))
        page.goto(BASE + '#settings'); page.wait_for_timeout(400); page.click('#tplRemove'); page.wait_for_timeout(500)
        check('T3 removing the template returns to the built-in one', 'Remove imported template', [False, True], [page.is_checked('#tplUse'), 'No template imported' in page.inner_text('#tplReport')])
    guard('T1-T3 imported template', c11)

    # ---------- Word export works offline (the Word engine is cached by the service worker at install) ----------
    def c12():
        c2 = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True); c2.add_init_script(INIT)
        p2 = c2.new_page(); p2.goto(BASE + '#home'); wait_js(p2, 'document.body.classList.contains("ready")')
        wait_js(p2, "navigator.serviceWorker && navigator.serviceWorker.controller !== null", 15000)
        wait_js(p2, "caches.keys().then(k => Promise.all(k.map(n => caches.open(n).then(c => c.match('word.js'))))).then(r => r.some(Boolean))", 15000)
        p2.click('#page-home [data-new="blank"]'); p2.wait_for_selector('#editor:not([hidden])'); p2.wait_for_timeout(500)
        c2.set_offline(True)
        p2.reload(); wait_js(p2, 'document.body.classList.contains("ready")'); p2.wait_for_timeout(600)
        with p2.expect_download(timeout=15000) as dl:
            p2.select_option('#exportSel', 'docx')
        ok = zipfile.ZipFile(dl.value.path()).testzip() is None
        check('X1 Word export works offline after the first visit', 'airplane mode, never exported before', True, ok)
        c2.set_offline(False); c2.close()
    guard('X1 offline Word export', c12)
    b.close()

with sync_playwright() as p:
    t0 = time.time()
    try: run(p)
    except Exception as e:
        import traceback; traceback.print_exc()
        results.append({'name': 'RUNNER CRASH', 'input': '', 'expected': 'no crash', 'actual': repr(e)[:300], 'pass': False})
    passed = sum(r['pass'] for r in results)
    print(f'\nIssues 1.2.0 round {args.round}: {passed}/{len(results)} checks passed in {time.time() - t0:.1f} s')
    json.dump(results, open(os.path.join(args.out, f'issues120-{args.round}.json'), 'w'), indent=1, ensure_ascii=False)
    sys.exit(0 if passed == len(results) else 1)

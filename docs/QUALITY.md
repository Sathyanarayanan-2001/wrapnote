# Quality report

Version 1.0.0 · 16/11/2026 to 17/11/2026

This report covers how WrapNote was checked: two verification rounds by two methods, the stage checkpoints, a failure mode and effects analysis (FMEA), the DMAIC cycle (define, measure, analyse, improve, control) and the root causes of the defects found.

## 1. Test methods

Every check states its input and the expected result worked out by hand.

| Method | Tool | What it covers |
|---|---|---|
| A. Unit tests | Node test runner, `tests/unit/` | Money, dates, CSV, merge, diff, LaTeX, escaping, model, dashboard, contrast, 5 golden examples |
| B. Browser tests | Playwright + Chromium, `tests/e2e/run_e2e.py` | Every ribbon tab, intake, blocks, layout, print, review, views, import and export, sync, offline, phone widths |
| C. Independent recomputation | Inside method B | Dashboard figures recomputed in Python from stored data; PDF page count compared with on-screen pages; brute-force ISO week check; Intl en-IN grouping compared with our lakh formatter |
| D. Link check | `tests/e2e/links.py` | Every in-app link opens and matches its label |
| E. First-run walkthrough | `tests/e2e/usability.py` | Five tasks using only visible labels and roles |
| F. Lighthouse 13.6.0 | Simulated mid-range phone, slow 4G, 4× CPU slowdown | Load speed, accessibility, best practices |

## 2. Verification rounds

### Round 1 (functional, then appearance)

| Check | Result |
|---|---|
| Unit tests (method A) | 46 / 46 passed |
| Browser tests (method B, includes C) | 108 / 108 passed |
| Links (D) | 96 / 96 working and matching |
| Walkthrough (E) | 5 / 5 tasks completed |
| Appearance: screens reviewed by eye | 15 screens (editor in light, twice, and dark; dashboard in light and dark; home in light; phone editor fields, phone editor page and phone documents at 360 px; chart and equation dialogs; track changes; read mode; immersive reader; multiple pages) |
| Appearance: issues found and fixed | 9 (see section 6) |
| Contrast, both themes, 12 text pairs each | 24 / 24 at 4.5:1 or better |

### Round 2 (regression after every fix)

| Check | Result |
|---|---|
| Unit tests | 46 / 46 passed |
| Browser tests | 110 / 110 passed (2 checks added to pin the track-changes fix) |
| Links | 96 / 96 |
| Walkthrough | 5 / 5 tasks |
| Phone 320, 360, 390 px: sideways scroll | none on 6 screens each |
| Phone 320, 360, 390 px: touch targets under 44 px | none |
| Lighthouse (gzip, as GitHub Pages serves it) | Performance 99, Accessibility 100, Best practices 100; first contentful paint 1.5 s; time to interactive 1.6 s; total blocking time 20 ms; layout shift 0.046 |
| Appearance re-check by eye | 6 screens (read mode after the fix; phone 320 px editor, ribbon and dashboard in dark; settings; phone home); no new issues |

All earlier tests were re-run after every change (regression rule). GitHub Actions re-runs methods A, B, D and E on every push and pull request.

### Required scenario tests and where they are

| Requirement | Test |
|---|---|
| Midnight crossing, month ends, 29 February | Unit: `dates` (23:30 to 00:45 = 75 min; 28/02/2024 + 1 day = 29/02/2024; 29/02/1900 rejected); browser F3 |
| Totals to the paisa | Unit: 1,23,456.78 + 0.05 + 999.95 = ₹1,24,456.78; 0.1 + 0.2 = ₹0.30; browser F3, F31 |
| ISO week 53 and 31 March to 1 April | Unit: 31/12/2026 = 2026 CW53; 01/01/2027 = 2026 CW53; 31/03/2027 = FY 2026-27; 01/04/2027 = FY 2027-28 |
| Two devices add at once; deletion reaches the other | Unit: merge simulation; browser F32 with a real folder and a second device's save file |
| merge() commutative, associative, idempotent | Unit: 500 random cases |
| Reload with the network off | Browser F33 (reload and new tab, data present) |
| Phone 320 / 360 / 390 px | Browser F34 |
| Export everything, import into an empty copy | Browser F30: counts, cost totals and word totals match |
| Dashboard figures against separate numbers | Unit: hand counts; browser F31: Python recomputation |
| Characterisation tests before refactoring | Browser F27 pinned "Confirm end" behaviour before its refactor; it passed before and after |

## 3. Golden set

Five fixed inputs with hand-worked answers live in `tests/golden/golden.json`. Each output is scored on three points: correct (no forbidden text, right order), complete (every expected string present) and format followed (right number of sections, title first).

| Example | Score |
|---|---|
| G1 weekly sync with costs | 3 / 3 |
| G2 meeting across midnight on 31 March | 3 / 3 |
| G3 study notes with nested mind map | 3 / 3 |
| G4 hostile input stays inert | 3 / 3 |
| G5 lakh totals across many actions | 3 / 3 |

## 4. Worked example (sample input and expected output)

Input: date 28/10/2026, 23:30 to 00:45; present A. Rao, K. Iyer, M. Das; absent P. Sen; actions "Update the plan" (due 04/11/2026, ₹12,500.50) and "Book the venue" (due 02/11/2026, ₹7,499.50, done).

Expected and observed output:

- `28/10/2026 (Wed) · CW44 · FY 2026-27`
- `23:30–00:45 (1 h 15 min, ends next day)`
- `Present (3)`, `Absent (1)`
- Actions sorted by due date: "Book the venue", then "Update the plan"
- Total `₹20,000.00` (12,500.50 + 7,499.50)

The app can create this example from Guide, Worked example.

## 5. Performance

Slowest action measured: **Confirm end of document** on a made-up 53-page document (600 paragraphs, 30 headings, one table of contents).

| Measure | Before | After |
|---|---|---|
| Inside the page (5 runs, median) | 26.5 ms | 24.5 ms |
| Including dialog clicks (3 runs) | 169 to 182 ms | 157 to 200 ms |

The change removed one duplicate layout pass, one forced contents update and one extra deferred save. The gain is within run-to-run noise; the action was already fast.

Other measurements on the same document: page layout 4 to 6 ms; opening the document about 80 ms; typing 20 characters about 75 ms including test overhead.

## 6. Defects found, root causes and fixes (analyse and improve)

| # | Found by | Defect | Root cause | Fix |
|---|---|---|---|---|
| 1 | Browser test F27 | Polish left a double space | See 5 Whys A | Treat a no-break space next to a space as a double space |
| 2 | Browser test F30 | Word counts differed after import | See fishbone B | One `plainText()` function for every count |
| 3 | Browser test F22 / appearance | Tracked typing lost a leading space and split one insertion in two | See 5 Whys C | WrapNote inserts every tracked keystroke itself |
| 4 | Appearance | Phone editor: toolbar and ribbon filled the screen | Desktop layout reused on phones | Collapsible ribbon, compact bar, normal page scroll |
| 5 | Appearance | Chart text too small; single bars too wide | Fixed 520-unit drawing scaled down | Smaller drawing, larger text, bar width cap |
| 6 | Appearance | Axis title overlapped money ticks | Fixed left gutter | Gutter grows with the widest tick label |
| 7 | Appearance | Words split mid-word in table cells in read mode | `overflow-wrap: anywhere` shrinks table cells | `overflow-wrap: break-word`; keep headings with tables |
| 8 | Browser test F34 | Some controls under 44 px on phones | Desktop sizes | 44 px minimum for every control on phones |
| 9 | Appearance | Theme icon and colour swatch did not render | Glyph missing from the font; empty inline span | Inline SVG icon; inline-block swatch |

### 5 Whys A: the polish missed a double space

1. Why was "hello  world" not fixed? The double-space rule did not match.
2. Why not? The text held a space followed by a no-break space.
3. Why? Browsers type the second space as a no-break space so it stays visible.
4. Why did the rule not allow for that? It was written for plain text files.
5. Why was that not caught earlier? Unit tests used plain spaces only.

Root cause: the rule did not model how browsers store typed spaces. A unit test now uses a no-break space.

### Fishbone B: different word counts for the same document

- **Method:** live counts used `innerText`; stored counts parsed HTML with `DOMParser`.
- **Machine:** in a parsed (not displayed) document, `innerText` acts like `textContent` and drops the breaks between blocks, so "Purpose" and "Agree" merged into one word.
- **Material:** generated headings and table cells sit side by side with no spaces between them.
- **Measurement:** only the round-trip test compared both paths.

Root cause: two different text extractions. Fix: one function, used everywhere.

### 5 Whys C: tracked typing lost a space

1. Why did " Costs" lose its space? The first insertion held only a space.
2. Why was that a problem? A lone trailing space collapses and is not drawn.
3. Why did the next letter land outside the insertion? The browser moved the caret out of the collapsed text.
4. Why did the browser decide? Typing inside an insertion was left to the browser's default.
5. Why? It looked simpler, but the browser's caret rules are not under our control.

Root cause: shared control of insertion between WrapNote and the browser. Fix: WrapNote inserts every tracked character, turning a trailing space into a no-break space as browsers do.

## 7. FMEA

Scores are 1 (best) to 10 (worst). Risk priority number (RPN) = severity × occurrence × detection.

| Area | Failure mode | Effect | Cause | S | O | D | RPN | Control | RPN after |
|---|---|---|---|---|---|---|---|---|---|
| Import | Header row not found | Import refused | Preamble lines, other column names | 4 | 4 | 2 | 32 | Header search over 30 lines, alias table, message naming the needed header | 16 |
| Import | Day and month swapped | Wrong due date | File written month first | 7 | 4 | 5 | 140 | Month above 12 rejected; preview shows dd/mm for review. Dates such as 05/11 cannot be told apart, so this risk remains | 140 |
| Import | Long reference numbers mangled | Lost digits | Spreadsheets convert long numbers | 6 | 3 | 6 | 108 | Kept as text and quoted; round-trip test with a 15-digit number | 54 |
| Import | Hostile HTML in a backup or sync file | Script runs | Tampered file | 9 | 2 | 3 | 54 | Allow-list sanitiser on every load; CSP by hash; paste test F44 | 18 |
| Import | Corrupt or foreign backup | Partial or bad data | Wrong file | 6 | 2 | 2 | 24 | Validation per record; preview; nothing saved until Import | 12 |
| Evaluation | Floating-point rupee drift | Wrong totals | Float arithmetic | 8 | 3 | 4 | 96 | Integer paise; exact-sum tests | 8 |
| Evaluation | Wrong week or FY at a boundary | Misfiled report | Off-by-one in date maths | 6 | 3 | 3 | 54 | UTC maths; brute-force test over 36 years | 12 |
| Evaluation | Negative meeting length | Wrong duration | Meeting ends after midnight | 5 | 4 | 2 | 40 | Add 1,440 minutes when the end is earlier; labelled "ends next day" | 10 |
| Evaluation | Tracked change not marked | Edit slips into final text unseen | Browser default insertion | 7 | 3 | 4 | 84 | WrapNote inserts tracked text itself; tests F22 | 28 |
| Evaluation | Block taller than a page | Content runs over the page edge on screen | Whole-block pagination | 4 | 5 | 4 | 80 | Documented limit; print boxes clip cleanly | 80 |
| Storage | Browser data cleared | Documents lost | Private mode or site data cleared | 9 | 3 | 3 | 81 | Warning in memory-only mode; backup; folder sync | 54 |
| Storage | Same document edited on two devices offline | One device's edits replaced | Per-document "newer wins" | 7 | 3 | 6 | 126 | Revisions kept; documented. Field-level merge is future work | 126 |
| Storage | Save file still downloading | Sync error | OneDrive delivers late | 5 | 5 | 2 | 50 | Unreadable files are skipped and retried; test F32 | 10 |
| Storage | Device clocks differ | Older edit wins | Clock skew | 6 | 2 | 7 | 84 | `u` only moves forward on each device; documented | 84 |
| Storage | Storage quota full | Save fails | Large pictures | 6 | 3 | 3 | 54 | Memory saver resizes pictures; clear error message | 36 |
| Reporting | Dashboard figure wrong | Wrong decisions | Aggregation bug | 6 | 2 | 2 | 24 | Hand-count unit test; Python recomputation F31 | 12 |
| Reporting | PDF differs from screen | Wrong printout | Browser paginates differently | 5 | 4 | 3 | 60 | Exact page boxes; PDF page count test F46 | 15 |
| Reporting | Word export loses layout | Extra fixing in Word | HTML-based .doc | 4 | 6 | 3 | 72 | Documented; PDF for an exact copy | 72 |
| Reporting | ₹ garbled in Excel | Unreadable CSV | No byte order mark | 3 | 5 | 2 | 30 | UTF-8 BOM; test F28 | 6 |
| Reporting | Counts disagree between views | Confusion | Two text extractions | 3 | 4 | 3 | 36 | One `plainText()`; test F30 | 6 |

The two highest remaining risks are day/month ambiguity in imported CSV files (RPN 140) and offline edits to the same document on two devices (RPN 126).

## 8. DMAIC

- **Define.** Goal: a Word replacement for live minutes, reports and study notes. Critical-to-quality items: exact money, correct dates and periods, no data loss, first load under 2 seconds on a mid-range phone, WCAG 2.2 AA contrast, 44 px touch targets, no network use with personal data.
- **Measure.** Baselines: Lighthouse (performance 89 without compression, 99 with it), first contentful paint 3.0 s uncompressed and 1.4 s compressed, 91 of 95 browser checks on the first run.
- **Analyse.** Root causes in section 6 (5 Whys A and C, fishbone B).
- **Improve.** Nine fixes (section 6), each followed by a full regression run.
- **Control.** GitHub Actions runs unit, browser, link and walkthrough tests on every push and pull request. The golden set guards rendering. A pull request merges into `main` only when the checks pass.

## 9. Stage checkpoints

| Stage | Deliverables | Tests run | Unresolved | Exit |
|---|---|---|---|---|
| 1. Plan | File list (docs/ARCHITECTURE.md) | n/a | none | Pass |
| 2. Core logic | 10 core modules | 43 unit tests, then 46 | none | Pass |
| 3. Storage and sync | IndexedDB store, folder sync | Merge properties; browser F32, F33 | Headless Chrome crashes a tab that reads an OPFS handle back from IndexedDB; the test uses a fresh profile for offline checks. Real folder handles are not affected | Pass |
| 4. Pages and styles | 6 pages, editor, ribbon, dialogs | Browser 91 / 95, then 108 / 108 | none | Pass after fixes |
| 5. Import and export | CSV, JSON, PDF, Word, HTML, Markdown | F28, F29, F30, F46 | none | Pass |
| 6. Documents and CI | README, CHANGELOG, CONTRIBUTING, SECURITY, LICENSE, docs, workflow | Link check 96 / 96 | none | Pass |
| 7. Second round | Fixes from appearance review | Round 2: 46 + 110 + 96 + 5, Lighthouse | Limits in section 10 | Pass |

## 10. Known limits

- OCR uses the browser's built-in text detector, which most browsers lack. The fallback inserts the screenshot and leaves a box to type the text.
- "Final polish" is fixed rules on the device, not an online AI service (the app makes no network calls).
- Paragraphs move to the next page whole; they are not split across pages. Blocks taller than a page overflow on screen.
- Footnotes appear at the foot of their page on screen and in PDF. Word and HTML exports list them at the end.
- Word export is HTML saved as .doc. Watermarks and page borders are not carried over.
- Find does not match text split across differently formatted runs.
- The first-run walkthrough is scripted. A session with a real first-time user is still recommended.

## Revision history

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 17/11/2026 | First release and this report |

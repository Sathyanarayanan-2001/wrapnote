# Quality report

Version 1.4.0 · 23/11/2026

Part A covers version 1.4.0: source tags placed and moved where you want them, a frequency-first ribbon with a quick access bar, and a saved, person-made ribbon arrangement. Parts B, C, D and E are the 1.3.0, 1.2.0, 1.1.0 and 1.0.0 reports, unchanged except for their letters.

# Part A. Version 1.4.0

**Headline: Sources sit where you put them.**

## A1. What was asked and what was built

| Request | Built | Checks |
|---|---|---|
| 1. "The reference saved is somewhere randomly located near the context, and I could not even move it… It should be placed in a location where I want to have it." | New references made from a selection go right after the selected text. The dialog asks **Where to show it**: after the selection (or at the cursor), at the end of the paragraph, or on its own line. Any tag can be dragged, or moved with Move… and a click (or the cursor and Enter). 1.3.0 tags can be moved too. | S1–S26 |
| 2. "Best arrangement of the function menus when full ribbon view is selected… style menu and other most frequently used items in the always visible area or first" | Groups ordered by use (Home: Styles, Font, Paragraph, Editing, Clipboard). The full ribbon fits each tab in one band at 1366 px. A quick access bar, always visible, holds the style list, B, I, U, bullets, numbering, Find and Source reference. | Q1–Q5, Q16–Q17; C1 |
| 3. "Rearrange any of the order… and save the view, such that next time the same order appears" | **Customise…**: reorder tabs, groups and commands (▲ ▼, drag, Alt+Up/Down), hide groups, edit the bar; right-click any command to add or remove it from the bar. Saved on this device; Restore standard. | Q6–Q15; unit tests |
| Behaviour to preserve: "Don't break any other functionalities or code" | Characterisation tests first; every earlier suite rerun after each change | C1–C3; sections A4 and A8 |

## A2. Root causes (5 Whys)

**Issue 1: the tag went to the end of the paragraph and could not be moved.**
1. Why at the end? The 1.3.0 tag is drawn by appending it to the note element.
2. Why appended? A reference is keyed by note (block) id, so the only position known was "this note".
3. Why could it not be moved? The tag is never stored in the page; it is redrawn from the reference on every open and undo, so any move was undone at once.
4. Why only the note? 1.3.0 attached sources to whole notes; a reference for a phrase was not part of that design.
5. Root cause: the record had no place for *where* in the text a source belongs. Fix: a placed tag stores only its position (an empty marker with the reference key and inline/line). The words still come from the one stored reference, so the 1.3.0 rule "one copy" still holds.

**Issues 2 and 3: frequently used commands needed scrolling; the order could not be changed.**
1. Why scrolling? The simple ribbon is 2,539 px wide on a 1,366 px screen; Styles were near the end of Home.
2. Why near the end? Groups followed Word's left-to-right order (Clipboard first), not how often WrapNote's users reach for them.
3. Why did the full ribbon not help? Each group was allowed to grow to 600 px, so most tabs wrapped into a second band (190 px tall) and left half of each band empty.
4. Why no way to change it? The ribbon was a fixed list with no ids for groups, so an order could not be saved.
5. Root cause: no stable ids and no always-visible area. Fix: ids for every tab, group and command; a saved arrangement that stores only differences; a quick access bar outside the panel.

**5 Whys: Heading 1 nested a heading inside a paragraph (defect 1).** The page showed `<p><h1>…</h1><tag></p>` → Chrome's block-format command split the paragraph around the tag → the tag is a non-editable island → 1.3.0 tags sat in note blocks that the style command never touched → no test changed the style of a paragraph that holds a tag. Fix: the tags are editable for that one command only; test S25.

## A3. Defects found while verifying 1.4.0

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | Walkthrough task 3 | Heading 1 on a paragraph holding a placed tag nested the heading inside the paragraph | Tags made editable during that command only; a heading's tag is left out of the navigation pane and the table of contents (S25) |
| 2 | Speed measurement | Saving a document with 300 placed tags took 23–25 ms (1.3.0: 6–8.5 ms): each reference looked through every tag | One pass builds a key → tag map: 9–11 ms |
| 3 | Appearance round 1 | Customise: a group's commands opened below all the groups, far from the row clicked | Commands open inside their own group row |
| 4 | Appearance round 1 | Customise opened scrolled down to the first form control | Opens at the top, focus on the first row |
| 5 | Appearance round 1 | Phone, 320 px: the style list on the quick access bar shrank to "N" | Minimum width on phones |
| 6 | Appearance round 1 | Phone: Customise rows wrapped unevenly (some on one line, some on two) | Every row: name on its own line, buttons under it |
| 7 | Appearance round 2 (export files) | HTML export kept the editor's button role, tab stop, drag handle and "Click for Edit…" hint on each tag | Copies of the page (exports, read mode) show tags as plain text (S19b) |

Design change made while testing: choosing **Restore standard** and Save stored `{"v":1}`; it now stores nothing, so a later version's new standard order reaches the person (Q12).

Test-side corrections (not app defects): a Sources-card check joined the parts without separators (S16); the bar's Bold test ran on a line an earlier step had made a heading (Q5); a locator used "Bold" for the command named "Bold (B)" (Q8); a hand-worked value for a damaged arrangement ignored the stated rule that missing parts go back next to their standard neighbour, so the input was changed to a full saved order (Q14); a check used "untick" on a box the app correctly refuses to untick (Q13); the navigation pane was read before it was drawn (S25); two walkthrough locators ("Tab to arrange"; the reload reopens the same document). Two hand-worked values in the new unit tests were wrong (a missing first group goes first; the fixture has 12 paths, not 11).

## A4. Verification counts

| Round | Unit (Node) | 1.0.0 suite | 1.1.0 issues | 1.2.0 issues | 1.3.0 references | 1.4.0 suite | Links | Walkthroughs |
|---|---|---|---|---|---|---|---|---|
| Characterisation, before any change (1.3.0 code) | 3 / 3 new pinning tests (ribbon commands per tab, 1.3.0 tag place, stored fields) | — | — | — | — | — | — | — |
| New 1.4.0 suite run on the 1.3.0 build (reproduces the issues) | — | — | — | — | — | 0 / 26: S1 shows the tag at the paragraph end; Q16 shows two bands on five tabs | — | — |
| Round 1, functional | 85 / 85 (7 new, after 2 wrong hand values) | 110 / 110 | 27 / 27 | 39 / 39 | 35 / 35 | first run 35 / 40 (5 test-side), then 44 / 44 | 83 / 83 | 20 / 20; new walkthrough 3 / 5 → defect 1 → 5 / 5 |
| Round 1, appearance | screenshots at 1366, 390 and 320 px, light and dark: ribbon (simple, full on all six tabs, hidden), bar, tag menu, dialog, Customise | | | | | | | defects 3–6 |
| Round 2, functional and appearance | Word export rendered with LibreOffice and checked with the Office schema validator (passed); Markdown and HTML files read | | | | | | | defect 7 |
| Final regression (same build for every suite) | 85 / 85 | 110 / 110 | 27 / 27 | 39 / 39 | 35 / 35 | 48 / 48 | 83 / 83 | 30 / 30 (six walkthroughs) |

A round 2 run was stopped part-way because the app was rebuilt during it (defect 7); it was rerun in full on the final build.

Two methods for each result: the browser tests read what is on screen (text before and after each tag, its place, computed styles, group positions), and the same values are read back from storage (`WN.debug.doc()`, `localStorage`), from downloaded files (Markdown, the .docx parts, HTML, the backup) or from a fresh browser profile after import.

Scenario tests:
- **Round trip:** backup exported and imported into an empty browser profile; both placed tags are in the same places (S26). The 1.3.0 round trip (R29) still passes.
- **Old data:** a 1.3.0 note tag still draws at the end of its note (C2) and can be moved, keeping its key (S22–S23); a damaged saved arrangement loads with unknown and repeated parts dropped (Q14) or falls back to the standard (Q15).
- **Phones:** 320, 360 and 390 px: the bar has its own row, no sideways scroll, every bar and Customise control at least 44 px (Q17); citing and moving a tag by touch alone (Q18).
- **Dates, money, weeks, financial years:** code not touched; midnight crossings, month ends, 29/02/2024, paisa totals, CW53 and the FY boundary pass in the 1.0.0 suite (110 / 110).

Golden examples (rubric: correct, complete, format followed; 1 point each): 5 / 5 scored 3 of 3. G1 tag after a selected phrase (S1); G2 tag on its own line (S4); G3 a moved 1.3.0 tag (S22); G4 Markdown with an inline tag (S18); G5 Word with an inline tag (S19). The 1.0.0 golden examples for generated sections are unchanged and pass.

## A5. Performance

Medians of 15 runs (Sources page: 5), two sessions each, at 1366 px. Test document: 300 referenced paragraphs.

| Measure | 1.3.0 | 1.4.0 | Note |
|---|---|---|---|
| Slowest action: Undo in a document with 300 tags | 23.6–25.1 ms | 29.6–31.2 ms | Every tag is redrawn; placed tags also get their move and menu handles. Under the 100 ms people notice. |
| Save with 300 tags | 5.8–8.5 ms | 23.3–25.4 ms before the fix, 8.9–11.3 ms after | Defect 2 |
| Switch ribbon tab | 2.2–2.6 ms | 2.5–2.9 ms | Applies the saved arrangement and redraws the bar |
| Sources page, 300 notes | 7–9 ms | 6–12 ms | not changed |
| Customise, one move | — | 4.9–5.2 ms | new |
| index.html | 582.6 KB (197.7 KB gzip) | 632.9 KB (212.0 KB gzip) | new feature code |

## A6. FMEA additions

RPN = severity × occurrence × detection, each 1 to 10.

| Area | Failure mode | Effect | Cause | S | O | D | RPN | Control | RPN after |
|---|---|---|---|---|---|---|---|---|---|
| Import | Pasted or imported page holds a tag from another document | A tag with no reference, or a second copy | Copy and paste between documents | 5 | 5 | 5 | 125 | Unknown and repeated keys removed on opening (S21) | 15 |
| Import | Saved ribbon arrangement damaged or from a newer version | App fails to start, or commands lost | Hand edit, older or newer version | 8 | 3 | 4 | 96 | `normalize` drops unknown parts, adds missing ones, keeps one group per tab; message shown (Q14–Q15, unit tests) | 16 |
| Evaluation | Tag dropped into a heading, generated text or another tag | Broken table of contents or summary | Drag or click in the wrong place | 5 | 4 | 3 | 60 | Same place rule for dialog, Move and drag; tag stays; message says why (S12, S15) | 12 |
| Evaluation | Block style changed on a paragraph with a tag | Heading nested in a paragraph | Browser command splits around the tag | 6 | 5 | 4 | 120 | Tag editable during that command (S25) | 18 |
| Evaluation | Last group of a tab hidden | Commands unreachable | Unticking every Show box | 6 | 3 | 2 | 36 | Refused with a message (Q13); repaired on loading | 6 |
| Storage | Tag words stored in the page and the reference | Two copies disagree | Saving the drawn tag | 7 | 4 | 3 | 84 | Only an empty marker is stored (S2) | 14 |
| Storage | Move or remove cannot be undone | Lost source | No snapshot | 6 | 3 | 3 | 54 | Snapshot before each move and remove (S8, S20) | 12 |
| Storage | Standard arrangement stored as a copy | A later version's improved order never reaches the person | Storing full lists | 3 | 6 | 7 | 126 | Only differences stored; the standard stores nothing (Q10, Q12) | 18 |
| Reporting | Inline tag in exports split from its sentence or shown as a button | Wrong or odd output | Exporters treat every tag as a line | 5 | 5 | 3 | 75 | Markdown, Word, HTML checked (S18–S19b) | 15 |
| Reporting | Sources text wrong for a placed tag | Note found under the wrong words | Preview read from the note, not the paragraph | 5 | 4 | 3 | 60 | Preview from the paragraph around the tag (S16, S23) | 15 |

## A7. DMAIC

- **Define.** Put each source tag where the person wants it and let them move it; make the most used commands reachable without scrolling; let the person arrange the ribbon and keep that arrangement. Break nothing.
- **Measure.** Baseline on 1.3.0: the tag always at the paragraph end (S1 on 1.3.0); full ribbon 190 px tall in two bands on five tabs (Q16 on 1.3.0); simple ribbon 2,539 px wide on a 1,366 px screen; no saved arrangement. The 3 characterisation tests passed on 1.3.0 before any change.
- **Analyse.** Section A2.
- **Improve.** Section A1, and the 7 defects in A3.
- **Control.** CI runs the characterisation tests, the 1.4.0 suite and walkthrough with all earlier suites; the ribbon command list is pinned in `tests/e2e/fixtures/ribbon-inventory-130.json`.

## A8. Stage checkpoints

| Stage | Deliverables | Tests run | Unresolved | Exit |
|---|---|---|---|---|
| 1. Pin current behaviour | 3 characterisation tests and the recorded command list, on 1.3.0 | 3 / 3 | none | Pass |
| 2. Arrangement rules | `ribbonLayout.js` (check, repair, apply, move, store differences) | 85 / 85 unit after 2 test-value fixes | none | Pass |
| 3. Ribbon | Group ids and order, bar, right-click, Customise, one-band full ribbon | C1; 110, 27, 39, 35 regression | none | Pass |
| 4. Placed tags | Dialog place choice, markers, drag, Move…, menu, exports, Sources | S1–S24; 1.3.0 suite 35 / 35 | none | Pass |
| 5. Round 1 | Reproduced on 1.3.0; new suite; walkthrough; speed; screenshots | Section A4 | defects 1–6 (fixed in stage) | Pass |
| 6. Round 2 | Export files; final regression | Section A4 | defect 7 (fixed in stage) | Pass |
| 7. Documents and CI | Guide, Settings history, README, CHANGELOG, ARCHITECTURE, SETUP, this report, workflow | Links 83 / 83 | none | Pass |

## A9. Usability test (scripted, 1.4.0)

Five tasks through visible labels only: cite a selected phrase (the tag follows the phrase); move the tag to the end of the sentence; make the line a heading from the quick access bar while the Insert tab is open; put Page break on the bar; make Clipboard the first group and find it so after reopening. Result 5 / 5 (times 0.4–2.1 s). The first run stopped at task 3, which found defect 1. It is a script, not a session with a real person.

## A10. Known limits (1.4.0)

- Dragging a tag needs a mouse. On a touch screen, tap the tag, choose Move… and tap the new place (Q18).
- The ribbon arrangement is saved in this browser only; backups and sync carry documents, not settings.
- A tag inside a heading (after the paragraph became a heading) shows in the heading; Word's own table of contents, when updated inside Word, includes its words.

# Part B. Version 1.3.0

**Headline: Find any note by its source in seconds.**

## B1. What was asked and what was built

| Requirement | Built | Checks |
|---|---|---|
| Optional reference fields: document name with suggestions, heading, sub-heading, article or section, page or range | Form behind "+ Add source reference" in the note composer; **Source** in the block list; References, **Source reference…** for a paragraph | R1–R8, R13–R14 |
| Stored with the notes, old notes keep working | `doc.refs` keyed by note id; older records read as `{}` | R9–R10, R30; characterisation tests |
| Carried by export and import | Backup, sync, WrapNote file, Import preview; Markdown, Word, PDF and HTML show the citation; CSV of the Sources list | R23, R25–R29 |
| Tidy editor | One button opens the form; it closes again | R1, walkthrough task 1 |
| Citation tag on the note card | On the page, in the block list and on the Sources cards | R1, R3, R15 |
| Filter by document, heading or page | Sources page: document, heading, page (overlapping ranges) and text search; tap a citation part to filter | R15–R24 |

## B2. Root cause (5 Whys) and design choices

**Problem:** notes from several study documents could not be traced back or gathered by source.
1. Why could a note not be traced? It had no structured place for its source; people typed sources into the text, in different forms.
2. Why did that stop gathering? Free text cannot be filtered by document, heading or page.
3. Why not use labels? Labels are one flat list; a source has five parts and pages need number ranges.
4. Why not store the citation in the page text? Two copies (text and data) drift apart, and a typed citation is edited by accident.
5. Root cause: the record had no field for a note's source. Fix: one structured map in the record, with the tag drawn from it.

**5 Whys: a name typed in another case was kept (defect 2 below).** The existing spelling was not taken → the check found no other spelling → the note's own new spelling had already been saved by the as-you-type save → the check counted the note itself → the check ran after the save. Fix: run the check first and leave the note itself out.

**5 Whys: Markdown left out note text (defect 5).** The text was missing → the exporter only read elements → composer notes hold bare text in their block → the 1.0.0 exporter assumed every text sits in a paragraph → no test exported a composer note. Fix: read bare text; test R25b.

## B3. Defects found while verifying 1.3.0

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | Browser test R13 | In the Source reference dialog, a delayed focus moved the cursor back to Document name while typing the page | The dialog's own first-field focus is used; no delay |
| 2 | Browser test R7 | "grid  code 2023" kept its spelling instead of the existing "Grid Code 2023" | Check runs before the save and leaves the note itself out |
| 3 | Appearance round 1 | Page filter hint cut off ("40-4…") | Shorter hint, wider field |
| 4 | Appearance round 1 | Seven tabs crowd a 320 px phone ("Dashboard" overlapped) | "Dash" on screens up to 420 px; the full name is still announced |
| 5 | Appearance round 2 | Markdown export left out text typed in the note composer (since 1.0.0) | Bare text in a block is exported (R25b) |
| 6 | Appearance round 1 | Suggestion list could open below the visible part of the left pane | The list scrolls into view |
| 7 | Appearance round 1 | "1 of 1 notes" | "1 of 1 note" |
| 8 | Code review while testing | The final polish could have changed citation text | Citation tags are skipped by the polish |
| 9 | FMEA review | The CSV wrote pages as "3-4", which spreadsheets turn into a date | Pages written "pp. 3–4" |

Test-side corrections (not app defects): three hand-worked values in the new unit tests were wrong ("connection" does not contain "in"; equal counts sort by recency, as the rule says; "ride through" does match "Ride-through" word by word); the link checker did not know the new page; one walkthrough locator also matched hidden text.

## B4. Verification counts

| Round | Unit (Node) | 1.0.0 suite | 1.1.0 issues | 1.2.0 issues | 1.3.0 references | Links | Walkthroughs |
|---|---|---|---|---|---|---|---|
| Characterisation, before any change (1.2.0 code) | 3 / 3 new pinning tests | — | — | — | — | — | — |
| Round 1, functional | first run of the new file 8 / 10; 3 wrong hand values in all | 110 / 110 | 27 / 27 | 39 / 39 | 21 / 25 (defects 1–2) | 73 clicked, 7 flagged (checker did not know the page) | 19 / 20 (one locator) |
| Round 1, appearance | screenshots at 1366, 390 and 320 px, light and dark; Word and Markdown exports | | | | | | defects 3, 4, 6, 7 |
| Round 2, functional | 78 / 78 | 110 / 110 | 27 / 27 | 39 / 39 | 34 / 34 | 83 / 83 | 20 / 20 |
| Round 2, appearance | same set; the Word file rendered with LibreOffice and checked with the Office schema validator | | | | | | defect 5 |
| Final regression (after defects 5 and 9) | 78 / 78 | 110 / 110 | 27 / 27 | 39 / 39 | 35 / 35 | 83 / 83 | 20 / 20 |

Two methods for each result: the browser tests read what is on screen, and the same values are read back from storage (`WN.debug`), from the downloaded files (backup JSON, CSV bytes, Markdown, .docx parts) or from a fresh browser profile after import.

Scenario tests:
- **Round trip:** backup exported, imported into an empty browser profile: documents 2 + 2 added test records, referenced notes match by hand count (R29).
- **Old data:** a record with no `refs` opens with an empty map (R30); a damaged reference is reported in the preview and dropped, and its document still imports (R28).
- **Phones:** 320, 360 and 390 px: no sideways scroll; every control on the Sources page and every bottom-bar tab at least 44 px (R32).
- **Dates, money, weeks, financial years:** unchanged code; the earlier midnight, month-end, 29/02/2024, CW53 and FY-boundary tests all pass in the 1.0.0 suite.

Golden examples (rubric: correct, complete, format followed): 5 / 5 scored 3 of 3. Source references do not change the generated sections they check.

## B5. Performance

Test set: a made-up backup of 40 documents × 50 referenced notes = 2,000 notes, 25 source documents.

| Measure | Before | After | Change |
|---|---|---|---|
| Slowest action: one search keystroke on Sources (filter, sort, draw) | 28–41 ms (median 39) | 17–32 ms (median 27) | Comparison keys made once per stored reference |
| Filter and sort only, no search text | 9.7 ms | 1.2 ms | same |
| Filter and sort with search text | 14.8 ms | 1.6 ms | same |
| Show all 2,000 (first 500 drawn) | 25–30 ms | 18–21 ms | same |
| Document-name suggestions, one keystroke | 2.9 ms | not changed | |
| Import and summarise all 40 documents | 0.18–0.19 s | not changed | |
| index.html | 537.5 KB (184.6 KB gzip) | 582.1 KB (197.5 KB gzip) | new feature code |

## B6. FMEA additions

RPN = severity × occurrence × detection, each 1 to 10.

| Area | Failure mode | Effect | Cause | S | O | D | RPN | Control | RPN after |
|---|---|---|---|---|---|---|---|---|---|
| Import | Backup or file has a damaged reference | Wrong or failed import | Hand-edited or old file | 6 | 3 | 5 | 90 | `cleanMap` drops it, preview names it, document still imports (R28) | 18 |
| Import | Old document without references | Crash on open | Missing field | 8 | 6 | 2 | 96 | Read as `{}`; characterisation and R30 | 8 |
| Evaluation | Page typed as "45-42", "4x" or "0" | Wrong filter results | Typing slip | 5 | 5 | 3 | 75 | Clear message; saved reference unchanged (R4, R20) | 15 |
| Evaluation | Same document under two spellings | Notes split across two names | Case or spacing | 5 | 6 | 5 | 150 | Existing spelling taken; filters ignore case and spacing (R7, R17) | 30 |
| Evaluation | Half-typed name saved while choosing a suggestion | Stray document in the list | Save as you type | 3 | 4 | 3 | 36 | Final value replaces it; Remove reference; Undo | 18 |
| Storage | Citation text and data disagree | Misleading tag | Two copies | 7 | 5 | 4 | 140 | One copy in `refs`; tag never stored (R9) | 14 |
| Storage | Note deleted, then Undo | Reference lost | Clean-up on delete | 5 | 3 | 4 | 60 | References kept until the note is gone for good; Undo restores both (R12) | 15 |
| Reporting | Citation missing from an export | Source lost outside the app | Exporter skips the tag | 6 | 4 | 3 | 72 | Markdown, Word, PDF, HTML checked (R25, R25b, R26) | 18 |
| Reporting | Sources page slow with many notes | Lag while typing | Repeated text normalising | 4 | 3 | 3 | 36 | Keys cached; measured 17–32 ms at 2,000 notes | 12 |
| Reporting | CSV page range turned into a date by a spreadsheet | Wrong pages | "3-4" read as 03-Apr | 5 | 5 | 4 | 100 | Pages written "pp. 3–4", which no spreadsheet reads as a date (unit test) | 20 |

## B7. DMAIC

- **Define.** Save where each note came from and find notes by document, heading or page. Keep every earlier behaviour.
- **Measure.** Baseline on 1.2.0: no field for a source; notes could only be found by words in their text. The 3 characterisation tests passed on 1.2.0 before any change.
- **Analyse.** Section B2.
- **Improve.** Sections B1 and B3: the feature plus 9 defects fixed.
- **Control.** CI runs the new browser test and walkthrough with all earlier suites; characterisation tests pin summaries, routes and backups.

## B8. Stage checkpoints

| Stage | Deliverables | Tests run | Unresolved | Exit |
|---|---|---|---|---|
| 1. Pin current behaviour | 3 characterisation tests on 1.2.0 | 68 / 68 unit | none | Pass |
| 2. Core rules | `refs.js`; model changes | 78 / 78 unit after 3 test-value fixes | none | Pass |
| 3. Storage and editor | `refs` map, tag drawing, undo, summaries | R9–R12; 110, 27, 39 regression | none | Pass |
| 4. Form and suggestions | Composer button, block list, dialog, combobox | R1–R8, R13–R14 | defects 1–2 (fixed in stage) | Pass |
| 5. Sources page | Filters, search, citation buttons, CSV, open at note | R15–R24 | none | Pass |
| 6. Export, import, phones | Backup preview, Markdown, Word; 320–390 px | R25–R32 | defect 5 (fixed in stage 7) | Pass |
| 7. Appearance and speed | Defects 3–7; key cache | Round 2; timings | none | Pass |
| 8. Documents and CI | Guide, README, CHANGELOG, ARCHITECTURE, SETUP, this report, workflow | Regression | none | Pass |

## B9. Usability test (scripted, 1.3.0)

Five tasks through visible labels only: start study notes and save a note with its source (two taps to the note composer); cite the same document again from the suggestions; list every note from that document; find the note from page 12; open that note in its document. Result 5 / 5 (times 0.5–1.1 s). It is a script, not a session with a real person.

# Part C. Version 1.2.0

**Headline: Word-true export, office template, live spelling.**

## C1. The reported issues

Every issue was first reproduced on 1.1.0 by `tests/e2e/run_issues_v120.py` (baseline: 3 of 16 checks passed; the 3 that passed covered behaviour that was already right). Each check states its input and the result worked out by hand.

| # | Issue | Fix | Checks |
|---|---|---|---|
| 1 | Cursor jumps to strange lines in tables and text | Editing area changed from a flex column to ordinary block layout; the caret is put back after stray text is wrapped; Up and Down move by table row | C1–C3 |
| 2 | Update table says there is no table | `updateTocs` returns how many tables it found, not only whether one changed | U1–U2 |
| 3 | Captions not aligned with the picture; no table of figures | Caption goes inside the chosen figure, centred; "Attach to" list; Table of figures command | F1–F4 |
| 4 | Spell check not working as words are typed | On-device checker (nspell, en-GB) in a worker; CSS highlights; right-click suggestions | S1–S3, O8 |
| 5 | Page colour not working | Palette dialog; colour in print and Word | P1–P2 |
| 6 | No ruler in the second split pane | Second pane at real page width with its own ruler | R1 |
| 7 | Style in use not shown | Style list and status bar follow the cursor | Y1 |
| 7b | Cost has no meaning on action items | Removed from fields, table, dashboard, CSV, import; stored values kept | A1–A2, unit and golden tests |
| 8 | Word export wrong (no borders, content differs) | Real .docx writer; fonts mapped; template styles | W1–W8 |
| 9 | Office template and template import | Built-in neutral template; import with audit, clean-up and completion; CLI tool and CI check | O1–O8, T1–T4, X1 |

## C2. Root causes (5 Whys and fishbone)

**5 Whys: the cursor jumped (issue 1).**
1. Why did text appear on another line? The caret was moved to the last paragraph.
2. Why? `normalize()` wraps stray top-level text in a paragraph and then placed the caret at the end of the last paragraph.
3. Why stray text? Browsers sometimes type straight into the editing root.
4. Why did Down skip rows? The editing root was a flex column (1.0.0 used it to stop margins collapsing), and Chrome's caret movement in flex containers and tables moves to the next cell instead of the next row.
5. Why was that not caught? No test pressed arrow keys or typed into the root. Fix: keep the caret; block layout with margin-collapse-aware pagination; Word-like row movement; tests C1–C3.

**5 Whys: Update table (issue 2).** The command reported "No table of contents yet" → it tested the return value → the function returned "changed", not "found" → an up-to-date table returns false → the message was written for a different meaning. Fix: return `{ count, changed }`; test U1 uses an up-to-date table.

**Fishbone: Word export differed from the app (issue 8).**
- Method: 1.1.0 wrote HTML named .doc. Word's HTML importer ignores CSS classes, so tables lost borders and styles.
- Material: the exported body had no `.doc-content` wrapper, so even the inline styles did not match.
- Machine: Word has no IBM Plex Sans and substituted at random.
- Measurement: no test opened the exported file. Now W1–W8 unzip and parse it, and every round also validates the files against the Office schemas and renders them.

**Page colour (issue 5).** The button applied its own starting value, white.

**Spell check (issue 4).** The app relied on the browser's `spellcheck` attribute; browsers mark words late or not at all in long editable areas.

## C3. Defects found while verifying 1.2.0

| # | Found by | Defect | Fix |
|---|---|---|---|
| 1 | Unit test (hand-worked value) | `stripTypedNumber` removed "2026" from "2026 budget" | Only one or two digits per number part |
| 2 | Render check | Heading numbering for a skipped level (H1, H3, H2) gave 1, 1.1.1, 1.1 on screen but 1, 1.1.1, 1.2 in the rendered Word file | Screen numbering follows Word |
| 3 | Browser test O5 | Quotes in field codes were written as `&quot;` | Element text keeps literal quotes (both are valid XML; this matches Word) |
| 4 | Template tool on itself | Theme fonts not declared in the font table; page-number results counted as header text | Fonts declared; digits ignored |
| 4b | Unit test | The audit missed comments that have only a range start | Range starts counted too |
| 5 | Schema validation of the cleaned reference | The reference itself broke the Word schema (cell settings out of order, shading without a value) | `sanitize` repairs both; cleaned copy passes |
| 6 | Appearance, render | Comment highlight and change colours were baked into Word text | Screen-only marks skipped (W8) |
| 7 | Appearance, render | Cover table's first row bold although it is not a header row | Table style's first-row look only when a header row exists |
| 8 | Appearance, render | No space under tables in Word | Next paragraph gets 8 pt before |
| 9 | Appearance, app | "Approver" underlined as misspelt in the template | Short office vocabulary added to the dictionary (O8) |
| 10 | Usability walkthrough | "Insert caption" with nothing selected picked the cover table, not the picture just added | Default is the uncaptioned item before the cursor, else the latest picture |
| 11 | Appearance round 2, render | Imported template with unnumbered headings: contents entries still showed numbers | Numbers dropped when the template's headings are unnumbered (T4) |
| 12 | Lighthouse | First paint slower: 1.7–1.8 s against 1.4–1.5 s in 1.1.0 | Word engine moved to `word.js`, loaded on first use and cached at install (X1) |

Test-side corrections (not app defects): one hand-worked ISO week was wrong (02/11/2026 is CW45, not CW44); one hand-worked millimetre value was wrong (2477 twips = 43.69 mm, not 43.70); two test selectors and one escaping error in a test were fixed.

## C4. Verification counts

Two methods for each output: browser checks plus file checks.

| Round | Unit (Node) | Browser: 1.0.0 suite | 1.1.0 issues | 1.2.0 issues | Links | Walkthroughs | .docx files |
|---|---|---|---|---|---|---|---|
| Baseline on 1.1.0 | 51 / 51 | 110 / 110 | 27 / 27 | 3 / 16 | 65 / 65 | 10 / 10 | not applicable |
| Round 1, functional | 59 / 62 (defect 1, defect 4b, one wrong hand value) | 109 / 110 (one wrong hand value in the test) | 27 / 27 | 28 / 29 (O5) | 66 / 66 | 1.2.0 walkthrough 3 / 5 (defect 10, two selectors) | 2 / 2 valid |
| Round 1, appearance | screenshots at 1366, 320, 360, 390 px; renders of the exported files | | | | | | defects 6–9 |
| Round 2, functional | 65 / 65 | 110 / 110 | 27 / 27 | 38 / 38 | 66 / 66 | 15 / 15 | 4 / 4 valid |
| Round 2, appearance | renders compared with the reference render page by page | | | | | | defect 11 |
| Regression after defect 11 | 65 / 65 | — | — | 39 / 39 | — | — | 4 / 4 valid |

File checks for every exported .docx: the Office schema validator (all parts), python-docx (opens, styles and properties read back), and LibreOffice 24.2 rendering to PDF and images. The built-in template renders to 3 pages, the same as the reference render; header, footers, cover, tables and numbering match. Microsoft Word itself is not available on the build machine, so "opens in Word" is not claimed beyond these checks.

Golden examples (rubric: correct, complete, format followed): 5 / 5 scored 3 of 3. G1 and G5 changed: costs were removed, so they now check that old stored costs never show.

Scenario tests still in the suites and passing: midnight crossing, month end, 29/02/2024, CW53 (31/12/2026), FY boundary (31/03 and 01/04/2027), export and import round trip, phone widths 320, 360 and 390 px (no sideways scrolling on the editor with the office fields, or on Settings).

## C5. Performance

| Measure | Before | After | How |
|---|---|---|---|
| First contentful paint (Lighthouse 13.6, mobile, throttled) | 1,713–1,813 ms (3 runs, Word engine inline) | 1,548–1,670 ms (3 runs) | `word.js` loaded on first use |
| index.html | 632.0 KB (212.2 KB gzip) | 537.5 KB (184.6 KB gzip) | same |
| Lighthouse scores | 98 / 100 / 100 | 98–99 / 100 / 100 | performance / accessibility / best practices |
| Slowest action: Word export, 10 pictures (1200 × 800) and 10 charts, 4.7 MB | median 219 ms (6 runs, 151–235) | median 204.5 ms (6 runs, 180–247) | built-in base64 decoder; CRC-32 eight bytes per step |
| of which reading the page | median 54 ms | median 42 ms | |
| of which packing | median 27.5 ms | median 23 ms | |
| Word export, the walkthrough document | — | 26–34 ms in the app | |
| Spell check pass, 58-page document | — | 10–18 ms (worker, after typing stops for 120 ms) | |
| Suggestions for one word | — | 2–21 ms | |
| Layout pass, 58 pages | — | 7–9 ms | |

The export gain is small (about 7 % overall); the rest of the time is the browser drawing the charts as pictures, which runs in parallel already. It is stated as measured.

## C6. FMEA additions

RPN = severity × occurrence × detection, each 1 to 10.

| Area | Failure mode | Effect | Cause | S | O | D | RPN | Control | RPN after |
|---|---|---|---|---|---|---|---|---|---|
| Import | Imported template carries organisation data | Data published or sent on | Labels, logos, names in properties, header text | 8 | 6 | 6 | 288 | `sanitize` removes them; audit lists header wording to review; neutral properties | 64 |
| Import | Imported template breaks the Word schema | File will not open in strict readers | Errors in the source file | 6 | 3 | 5 | 90 | Repairs; schema validation in each round | 24 |
| Import | Template lacks a style WrapNote writes | Plain text in Word | Different style set | 5 | 6 | 4 | 120 | `completeStyles` adds the missing roles; `template:check` in CI | 20 |
| Evaluation | Word misspelt not marked, or a correct word marked | Missed mistake or distraction | Dictionary gaps | 3 | 5 | 4 | 60 | Office vocabulary; Add to dictionary; Ignore all | 30 |
| Evaluation | Spell check slows typing | Lag | Whole-page pass | 5 | 2 | 3 | 30 | Worker; 120 ms debounce; cache per word; measured 10–18 ms | 15 |
| Evaluation | Heading numbers differ between screen and Word | Wrong references | Different counting rules | 6 | 3 | 4 | 72 | Same rule as Word; render check | 18 |
| Storage | Old documents lose cost data | Data loss | Field removed | 7 | 2 | 3 | 42 | Values kept untouched in storage; only display removed | 14 |
| Reporting | .docx invalid | Word repairs or refuses the file | Element order, missing parts | 8 | 3 | 3 | 72 | Schema validation, python-docx and rendering every round; W5 parses every part | 16 |
| Reporting | Word pages differ from screen pages | Contents page numbers off | Word's own layout | 4 | 6 | 5 | 120 | Fields cached and refreshed by Word on open; guide says so | 48 |
| Reporting | Word export offline fails | No export | Engine not cached | 6 | 3 | 3 | 54 | Cached at install; X1 | 12 |
| Reporting | Template file committed to the public repository | Organisation data published | Developer error | 9 | 2 | 6 | 108 | .gitignore; privacy unit test (hashed words, no .docx allowed) | 18 |

## C7. DMAIC

- **Define.** Nine reported issues and the cost removal; keep everything else working; the template must stay brand-neutral.
- **Measure.** Baseline on 1.1.0: 3 / 16 new checks; Word file not a real .docx; first paint 1.4–1.5 s.
- **Analyse.** Section A2.
- **Improve.** Sections A1 and A3: 10 reported items and 12 more defects fixed.
- **Control.** CI runs the unit tests, `template:check`, all browser suites and three walkthroughs. A privacy test blocks template files and organisation names. Golden examples 5 / 5.

## C8. Stage checkpoints

| Stage | Deliverables | Tests run | Unresolved | Exit |
|---|---|---|---|---|
| 1. Reproduce | `run_issues_v120.py` on 1.1.0 | 16 checks, 3 pass | none | Pass |
| 2. Editor fixes | Issues 1, 2, 3, 5, 6, 7, 7b | C, U, F, P, R, Y, A checks; 110 + 27 regression | none | Pass |
| 3. Spell check | Worker, highlights, menu, settings | S1–S3; timing | Dictionary gaps (defect 9, fixed at stage 6) | Pass |
| 4. Word writer | zip, ooxml, converter | W1–W8; schema, python-docx, render | none | Pass |
| 5. Office template and tool | Template, import, CLI, CI check | O1–O8, T1–T4; tool on itself and on the reference | Header wording left for review (by design) | Pass |
| 6. Appearance and performance | Defects 6–12 | Renders, screenshots, Lighthouse, timings | none | Pass |
| 7. Documents and CI | Guide, README, CHANGELOG, ARCHITECTURE, SETUP, TEMPLATE-AUDIT, this report, workflow | Round 2 and regression | none | Pass |

## C9. Usability test (scripted, 1.2.0)

Five tasks done only through visible labels: start an office document and set the reviewer (2 taps to the document); caption a picture and add a table of figures; fix a misspelt word from its suggestions; colour the pages pale green; export to Word. Result 5 / 5 after defect 10 was fixed. It is a script, not a session with a real person.

# Part D. Version 1.1.0

## D1. The four reported issues

| # | Report | Reproduced by (failed on 1.0.0) |
|---|---|---|
| 1 | Text extraction (OCR) failed in the browser | O1: a generated picture saying "MADE UP NOTE / TOTAL 2026" gave no text |
| 2 | A screenshot added later could not join a 2×2 grid; tall screenshots were cropped | G2–G7: object-fit was "cover", the red top and blue bottom bands were cut off, and screenshot B started a new block |
| 3 | The editor was crowded by the ribbon | R1: the ribbon was 232 px high at 1366 px wide |
| 4 | Guide contents links showed "page does not exist" | I1–I3: all 11 guide links and the skip link showed the error |

The worked example from the request is pinned as tests G1–G7:

- Input: screenshot A (9:16, like 1080 × 1920), then **Arrange** → 2×2 grid, then screenshot B.
- Expected and observed: A shows whole (both colour bands visible in a pixel check). B fills slot 2. Slots 3 and 4 stay empty and ready.

## D2. Root causes (analyse)

**Issue 1, 5 Whys.**
1. Why did OCR fail? The browser had no TextDetector.
2. Why did WrapNote need it? Version 1.0.0 shipped no text reader of its own, to keep the first load under 2 seconds.
3. Why was that not caught? The test only checked that the fallback message appeared.
4. Why was that enough to pass? The test measured "no crash", not "text was read".
5. Why? No test fed in a picture with known words.

Root cause: no text reader shipped, and the test measured the wrong outcome. Fix: an on-demand text reader from the same site, plus a test that reads known words.

**Issue 2, fishbone.**
- Method: the layout was chosen only when pictures were first added. Every later picture made a new block.
- Material: phone screenshots are tall (9:16). The cells were 4:3 and wide.
- Machine: `object-fit: cover` fills the cell and cuts off whatever does not fit.
- Measurement: tests used small landscape pictures, all added at once.

Root causes: cropping cells, and no idea of an "open" grid. Fix: cells take the pictures' shape; pictures are drawn whole; the most recent grid with room takes the next picture; empty slots can be clicked.

**Issue 3, 5 Whys.**
1. Why was the editor crowded? The ribbon was 199 to 290 px high.
2. Why? Each group wrapped onto two or three rows.
3. Why? All groups and labels were shown at once, as in Word's full ribbon.
4. Why? The design copied the full ribbon without a height budget.
5. Why? No test measured how much screen the controls used.

Root cause: no height budget. Fix: a one-row simple ribbon (80 px), a full option, and Hide ribbon. Test R1 now holds the ribbon at 100 px or less.

**Issue 4, 5 Whys.**
1. Why "page does not exist"? The router (the code that maps the address after # to a page) read `#g-ribbon` as a page name.
2. Why? The app uses # for pages, and the guide also used # for in-page jumps.
3. Why was it not caught? The link test opened each section directly instead of clicking the link.
4. Why? The test checked that targets existed, not what a click does.
5. Why? The test did not act like a person.

Root cause: two meanings of # and a test that did not click. Fix: guide links became `#guide/g-…`; old `#g-…` bookmarks still work; the skip link moves focus itself. The link test now clicks every link; on 1.0.0 it reports 17 broken links, and on 1.1.0 it reports 0.

## D3. Defects found while verifying 1.1.0

| # | Found by | Defect | Fix |
|---|---|---|---|
| 11 | Appearance round 1 | A 2×2 grid of tall screenshots ran across a page break | Each cell is capped at half the page's writing height; test G13 |
| 12 | Appearance round 1 | Extracted text inside a grid made the block taller than a page | A grid's text goes in its own "Screenshot text" block after it; test G14 |
| 13 | Appearance round 1 | On phones, layout ran while the page was hidden and measured nothing | Layout waits until the page is shown; test P1 |
| 14 | Walkthrough design | "Edit" on a picture block did not say it changes the arrangement | Renamed "Arrange" for picture blocks |

## D4. Verification counts

| Check | Baseline (1.0.0) | Round 1 | Round 2 |
|---|---|---|---|
| Unit tests (Node) | 46 / 46 | 51 / 51 | 51 / 51 |
| Earlier browser tests (regression) | 110 / 110 | 110 / 110 | 110 / 110 |
| New issue tests (browser) | 1 / 12 passed before the runner stopped | 27 / 27 | 27 / 27 |
| Links clicked | 17 broken of 65 | 0 broken of 65 | 0 broken of 65 |
| Walkthrough, earlier 5 tasks | 5 / 5 | 5 / 5 | 5 / 5 |
| Walkthrough, new 5 tasks | not run | 5 / 5 | 5 / 5 |
| Appearance by eye | — | 8 screens; 3 issues found and fixed | 3 more screens; no new issues |
| Lighthouse (phone, gzip) | 99 / 100 / 100 | 99 and 97 / 100 / 100 (two runs) | same build |

Lighthouse: first paint 1.4 to 1.5 s, ready to use 1.7 to 1.9 s. The text reader is not part of the first load.

The issue tests use two methods for the same facts. Cropping is checked by CSS (object-fit) and by pixels (both colour bands in a screenshot of the cell). "One page" is checked by the block's first and last pixel landing on the same page number. Joining is checked by the block count and by the picture order.

## D5. Performance

Slowest new action: reading text from a screenshot. Measured inside the page over 3 runs, with 3 screenshots per run.

| Screenshot | Before (new text reader each time) | After (text reader kept loaded) |
|---|---|---|
| 1st (includes start-up) | 544 to 559 ms | 532 to 563 ms |
| 2nd | 463 to 525 ms | 79 to 85 ms |
| 3rd | 452 to 466 ms | 61 to 68 ms |

Screen space at 1366 px wide: ribbon 232 px → 80 px; the page area starts at 183 px instead of 335 px (152 px more for the page). With the ribbon hidden, the page starts right below the tab names.

## D6. FMEA additions

Risk priority number (RPN) = severity × occurrence × detection, each 1 to 10.

| Area | Failure mode | Effect | Cause | S | O | D | RPN | Control | RPN after |
|---|---|---|---|---|---|---|---|---|---|
| Import | OCR misreads text | Wrong words in notes | Handwriting, small or angled text | 6 | 5 | 6 | 180 | Picture kept beside the text; text labelled "Screenshot text" and editable; guide states the limits | 90 |
| Import | Text reader cannot load | No text | Offline before first use, blocked files | 5 | 3 | 2 | 30 | TextDetector fallback, then typing; clear message; test O2 | 20 |
| Import | Large first download on a phone | Data use | 7 MB of text-reader files | 3 | 4 | 3 | 36 | Loaded only when text is requested; size stated in the guide; cached for offline (test O3) | 24 |
| Evaluation | Picture joins the wrong grid | Rearranging needed | More than one picture block | 4 | 3 | 3 | 36 | Only the most recent block with room; message names the slot; Undo | 24 |
| Evaluation | Picture cropped | Lost information | Cover-fit cells | 7 | 6 | 4 | 168 | Contain-fit, cells take the picture shape; pixel test G3 | 14 |
| Reporting | Grid runs across a page break | Broken print | Tall cells | 5 | 5 | 3 | 75 | Cell cap at half a page; test G13 | 10 |
| Reporting | Empty slot printed or saved | Clutter | Screen helper leaks | 3 | 3 | 2 | 18 | Removed from saves, print and exports; tests G9, G12 | 6 |
| Storage | Text-reader cache clashes with another project | Wrong files or wasted space | Shared github.io origin | 4 | 2 | 4 | 32 | Reader's own cache off; service worker cache uses the "wrapnote-" prefix | 8 |
| Navigation | Address after # read as a page | Error, wrong page | Guide and pages shared # | 4 | 5 | 5 | 100 | Sections under #guide/; old links redirected; click-based link test | 4 |

## D7. DMAIC

- **Define.** Four reported issues plus the worked example. Preserve everything else.
- **Measure.** Baseline on 1.0.0: 110 / 110 earlier tests; 1 of 12 new issue checks passed before the runner stopped; 17 broken links; ribbon 232 px; OCR returned no text.
- **Analyse.** Section B2.
- **Improve.** Sections B1 and A3: 4 reported issues and 4 more defects fixed.
- **Control.** CI now also runs the issue tests and the new walkthrough. The link test clicks like a person. Golden examples: 5 / 5 (rendering unchanged).

## D8. Stage checkpoints

| Stage | Deliverables | Tests run | Unresolved | Exit |
|---|---|---|---|---|
| 1. Pin and reproduce | Baseline on 1.0.0; `run_issues.py` | 46 unit, 110 browser; issue tests failing as expected | none | Pass |
| 2. Core rules | `pictures.js`, route rules | 51 unit | none | Pass |
| 3. Guide links | Router and skip link | I1–I4; link test 0 / 65 broken | none | Pass |
| 4. Picture grids | Join, slots, fit | G1–G12 | Page-break overflow (fixed at stage 7) | Pass |
| 5. OCR | On-demand reader with fallback | O1, O2, O3; timing | Accuracy depends on the picture (FMEA) | Pass |
| 6. Ribbon | Simple, full, hide | R1–R5 | none | Pass |
| 7. Appearance fixes | Defects 11–14 | G13, G14, P1; full regression | none | Pass |
| 8. Documents and CI | Guide, README, CHANGELOG, this report, workflow | Round 2 | none | Pass |

## Revision history (whole report)

| Version | Date | Change |
|---|---|---|
| 1.4.0 | 23/11/2026 | Part A added for placed source tags and the ribbon arrangement; earlier parts renamed B, C, D and E |
| 1.3.0 | 23/11/2026 | Part A added for source references; earlier parts renamed B, C and D |
| 1.2.0 | 17/11/2026 | Part A added for the 1.2.0 change request; earlier parts renamed B and C |
| 1.1.0 | 17/11/2026 | Part B added for the four reported issues |
| 1.0.0 | 17/11/2026 | First release report (Part C) |

# Part E. Version 1.0.0

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

All earlier tests were re-run after every change (regression rule). GitHub Actions re-runs methods A, B, D and E on every push and pull request, which gives a third, independent environment; its first run found defect 10, and the full set was re-run after the fix (46 / 46, 110 / 110, 96 / 96, 5 / 5).

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
| 10 | CI (browser test F1 on a GitHub runner) | Quick start could reappear after Skip if the page reloaded at once | The flag was saved in the dialog's close event, which runs a moment later | Save the flag in the Skip click itself |

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
- **Improve.** Ten fixes (section 6), each followed by a full regression run.
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


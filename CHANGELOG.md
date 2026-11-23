# Changelog

All notable changes are listed here. Dates are day first. The format follows Keep a Changelog, and versions follow Semantic Versioning.

## [1.3.0] - 23/11/2026

### Added
- **Source references on notes.** "+ Add source reference" in the note composer (and **Source** in the block list, or References, **Source reference…** for any paragraph) saves the document name, heading, sub-heading, article or section and page or page range.
- Document names you used before are suggested as you type, most used first; a name typed in another case or spacing takes the existing spelling. Headings are suggested from the same document.
- Each note shows a citation tag: Source: Doc › Heading › Sub-heading › Art. 4 › p. 12. It prints and goes into PDF, Word, HTML and Markdown exports.
- **Sources** page (top bar and phone bar): every referenced note from every document, filtered by document, heading, page (a range finds overlaps) or text. Tap a part of a citation to filter by it; **Open in…** goes back to the note; **Save as CSV** saves the list.
- Guide section "Source references".

### Changed
- Document records have an optional `refs` map. Older records open unchanged and get an empty one. Backups, sync, the WrapNote file and Import carry references; a damaged reference is dropped with a message and its document is still imported.
- On narrow phones the bottom bar shows "Dash" for Dashboard so seven tabs fit.

## [1.2.0] - 17/11/2026

### Fixed
- The cursor no longer jumps to another line. Text typed directly into the page stays where it was typed, and Up and Down move row by row through a table and out of it, as in Word.
- References, **Update table** now updates every table of contents and table of figures and says how many ("Updated 1 table"). It used to say there was no table when the table was already up to date.
- Captions attach to the item you choose and sit inside it: centred under a picture, chart or shape, above a table.
- Spell check marks a misspelt word as soon as you finish typing it, with suggestions on right-click.
- **Page colour** opens a palette (Pale green, Pale blue and others, or any colour). It used to apply white. The colour prints and goes into Word.
- The second pane of a split view has its own ruler and shows the page at its real width and margins.
- The style list and the status bar show the style at the cursor (Heading 2, Normal, Quote…).
- Word export is a real .docx file. Tables keep their borders and repeat their header row on each page; headings, lists, pictures and formatting match the app.

### Added
- **Office document**: a brand-neutral controlled-document template with a classification line and control table in the header (Page X / Y), a different first-page footer, cover page, revision history, table of contents and ten numbered sections. Document-control fields on the left. Template switch in Design & layout.
- **Import Word template** in Settings. The template is checked and cleaned on the device (pictures, comments, tracked changes, labels, custom data and names removed; schema errors repaired; missing styles added) and then used for office exports.
- **Table of figures** (References).
- Spelling settings: turn spell check on or off, and keep your own word list.
- `scripts/template-tool.mjs` (audit, sanitize, check) and `npm run template:check` in CI.

### Changed
- Action items have no cost any more: the field, the Cost column, the cost tile and chart on the dashboard and the CSV column are gone. Costs saved by earlier versions stay in your data but are not shown.
- The Word engine loads on first export (and is cached for offline use), so the app opens faster.

### Removed
- The old "Word (.doc)" export. Bookmarks or buttons that asked for it now make a .docx.

## [1.1.0] - 17/11/2026

### Fixed
- Text extraction (OCR) now works in every modern browser. Version 1.0.0 relied on a browser feature most browsers lack.
- Screenshots added one after another now fill the same 2×2 grid. A later screenshot goes into the next empty slot.
- Pictures in grids are no longer cropped. Each cell takes the pictures' shape and shows the whole picture.
- A full 2×2 grid of tall phone screenshots now fits on one page instead of running across a page break.
- Guide contents links (Getting started, Left pane and the rest) and the "Skip to content" link no longer show "page does not exist".
- On phones, the page is laid out correctly when you switch from Fields to Document.

### Added
- Simple ribbon (one row per tab, the default), Full ribbon, and Hide ribbon (Ctrl+F1). The choice is remembered.
- Empty grid slots you can click to add a picture straight into that grid.
- Text read from a screenshot in a grid appears in its own "Screenshot text" block after the grid.
- Guide addresses such as #guide/g-ribbon open the guide at that section; old #g-ribbon bookmarks still work.

### Changed
- Picture blocks show "Arrange" instead of "Edit" in the block list.

## [1.0.0] - 16/11/2026

### Added
- Guided intake for minutes and reports, book and study notes, and blank documents.
- Corporate branding preset: logo (left, centre, right), header and footer text, page border and standard fonts.
- Content blocks: text and labels, smart tables, images and screenshots with layout prompts, optional OCR through the browser's text detector.
- Six-tab ribbon: Home, Insert, Design and layout, References, Review, View.
- Paged layout with headers, footers, "Page X of Y", footnotes at the foot of their page, watermarks, page borders and colours.
- Table of contents (automatic or manual; headings, labels or captions), numbered captions.
- Track changes with author and time, comments, revision compare (inline and side by side), read-only and password lock.
- Read mode, outline, focus mode, immersive reader, navigation pane, rulers, zoom presets, split view, new window, side by side.
- Confirm end of document: on-device polish, summary, contents update, final review.
- Dashboard with chart and table views; documents, words, actions and costs by financial year.
- Exports: PDF, Word (.doc), HTML, Markdown, text, CSV, JSON. Imports: action-item CSV with preview, JSON backup with preview.
- Folder sync (gzip save files, newest 3 kept, per-record merge, tombstones) and error log next to the data.
- Offline service worker, web manifest and installable icons.

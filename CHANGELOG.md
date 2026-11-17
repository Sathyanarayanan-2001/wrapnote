# Changelog

All notable changes are listed here. Dates are day first. The format follows Keep a Changelog, and versions follow Semantic Versioning.

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

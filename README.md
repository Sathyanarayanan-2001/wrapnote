# WrapNote

**Never start from a blank page again.**

WrapNote is a browser app for live minutes of meeting, formal reports and study notes. You fill in a few guided fields on the left. A paged, Word-style document builds itself on the right. Every word saves as you type. It works offline, installs like an app, and keeps your documents on your own devices.

**Live app:** https://sathyanarayanan-2001.github.io/wrapnote/

![WrapNote editor with guided fields on the left and the paged document on the right (made-up example)](docs/screenshot.png)

## Features

- **Guided intake.** Minutes and report mode (date, times, people, agenda, decisions, action items with owner, due date and cost, next meeting). Book and study mode (thesis, concepts, quotes with pages, mind map, active-recall questions, takeaways).
- **Content blocks.** Text with labels and callouts, smart tables, pictures and screenshots. Several pictures can sit in a grid, side by side, or stacked. Reorder, edit, format or delete blocks from a list.
- **Six-tab ribbon.** Home, Insert, Design and layout, References, Review and View, with formatting, tables, shapes, charts, equations, cover pages, headers and footers, page numbers, watermarks, contents, captions, footnotes, comments, track changes, compare and protect.
- **Real pages.** A4, Letter, Legal or A5; portrait or landscape; margins, borders, columns. Print or save as PDF page for page.
- **Finish cleanly.** "Confirm end of document" polishes spacing and capitals on this device, adds a summary, updates the contents and locks the document for review.
- **Dashboard.** Documents per ISO week, by type, category and status; open and overdue actions; action costs by financial year. Every chart has a table view.
- **Indian formats.** Rupees with lakh grouping (₹1,23,456.78), held exactly as whole paise. Dates typed day first (28/10/2026). 24-hour times. ISO weeks (CW47). Financial year 1 April to 31 March (FY 2026-27).
- **Sync.** Optional sync through a folder you choose, such as OneDrive. The newer edit wins per document, and deletions reach every device.
- **Offline and installable.** A service worker keeps the app working without a network.
- **Import and export.** PDF, Word (.doc), HTML, Markdown, plain text, action-item CSV (UTF-8 with BOM) and full JSON backups. CSV import finds the header row, matches columns by name, and previews every row before saving.

## Privacy

- No account, no analytics, no server and no network calls with your data.
- Documents are stored in your browser (IndexedDB). Sync writes only to the folder you pick.
- The repository holds no personal data. Tests use made-up names and amounts.

## Getting started

1. Open the live app.
2. Choose **New minutes**.
3. Type the title, date and people on the left.
4. Add blocks, then format with the ribbon.
5. Choose **Confirm end of document**, then export.

To install it, use your browser's "Install app" or "Add to Home screen". To build it yourself, see [docs/SETUP.md](docs/SETUP.md).

## Documentation

- [Setup and deployment](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Quality: tests, FMEA, DMAIC and verification results](docs/QUALITY.md)
- [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Licence

MIT. See [LICENSE](LICENSE).

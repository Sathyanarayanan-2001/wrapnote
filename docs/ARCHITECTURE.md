# Architecture

Version 1.0.0 · 16/11/2026

## Shape of the app

WrapNote is one HTML file. The build (`scripts/build.mjs`) inlines the fonts, the CSS and all JavaScript into `dist/index.html`. A content security policy (CSP) allows only that one inline script, by its SHA-256 hash. There is no framework and no content delivery network (CDN).

```
src/
  core/      pure logic, no browser APIs, unit-tested in Node
    safe.js       escaping, URL and style checks
    money.js      paise arithmetic and lakh formatting
    dates.js      day-first parsing, ISO weeks, financial years, durations
    text.js       counts, case changes, polish rules, grammar hints, syllables
    csv.js        CSV writer (BOM, quoting, formula guard) and reader (header search, aliases)
    merge.js      canonical JSON and the per-record merge rule
    diff.js       word diff (Myers)
    latex.js      LaTeX subset to MathML
    model.js      document model, generated MoM and study sections, validation
    dashboard.js  dashboard figures
  app/       browser code, loaded in file-name order inside one closure
    00-util  10-store  20-sync  30-pages  40-editor  45-intake  50-ribbon
    55-insert  60-layout  70-review  80-views  90-io  99-main
  styles/    app.css (interface), doc.css (document, also used in exports)
  shell.html page skeleton with placeholders
public/      sw.js, manifest.webmanifest, icons
tests/       unit (Node), e2e (Playwright), golden examples
```

## Data model

A document record:

| Field | Meaning |
|---|---|
| `id` | Unique id (letters, digits, `-`, `_`) |
| `u` | Last update time in milliseconds; only moves forward |
| `mode` | `mom`, `book` or `blank` |
| `title`, `category`, `status` | Status is `draft` or `final` |
| `fields.mom`, `fields.book` | Structured intake values; dates in ISO form, costs in paise |
| `html` | The page content (sanitised on every load) |
| `layout` | Page size, margins, border, watermark, header, footer, page numbers, branding |
| `comments`, `revisions`, `protect`, `summary` | Review data |

A deletion is a tombstone: `{ id, d: 1, u }`.

The `meta` store keeps a small summary of each document (title, dates, word count, action rows). Lists and the dashboard read only summaries, so pictures are never loaded just to draw a chart.

## The page canvas

The canvas HTML is the single source of truth. Structured fields render into one generated section (`.wn-gen`) at the top. Content blocks are elements with `data-block`, so the block list is read from the canvas and cannot drift.

Pagination (`60-layout.js`):

1. Clear the previous page pushes.
2. Read each top-level block's position and height once (one layout).
3. Work out page breaks with arithmetic. A block that would cross a page edge moves to the next page. A page break forces a new page. Footnote space is reserved on the page that holds the reference.
4. Write the pushes and draw page boxes, headers, footers, page numbers, footnotes, borders and watermarks.

Printing builds real page boxes of exact size, so the PDF matches the screen page for page.

## Sync protocol

1. Each browser session writes one file: `wrapnote-save-<device>-<yyyymmddhhmmss>.json.gz`.
2. A write happens about 3 seconds after a change and when the page is hidden.
3. Each device deletes its own files beyond the newest 3.
4. A pull reads every other save file and merges per record.
5. Merge rule: the newer `u` wins. On an exact tie, the larger canonical JSON text (keys sorted) wins. This is a total order, so merge is commutative, associative and idempotent.
6. A file that cannot be read yet (for example, still downloading from OneDrive) is skipped and retried on the next pull.
7. One queue runs all folder work, so a pull always waits for a running write.
8. Errors go to the on-screen log, to browser storage, and to `wrapnote-errors.log` in the sync folder, with time and stack trace.

## Time and memory cost of the main operations

| Operation | Time | Memory |
|---|---|---|
| Look up a document or summary by id | O(1) (IndexedDB key, `Map`) | O(1) |
| Documents list: filter and sort | O(n log n) | O(n) |
| Dashboard figures | O(n + a) for n documents, a actions; O(k log k) to sort k categories | O(k) |
| Merge two record sets | O(n + m) hash lookups; canonical JSON is O(s log s) per tied record | O(n + m) |
| Pagination | O(b) for b top-level blocks, one forced layout | O(b) |
| CSV parse | O(c) characters; header search O(30 × columns) | O(c) |
| Find and replace | O(t) characters of text | O(matches) |
| Word diff (compare) | O((N+M)·D), D = number of edits, capped at 2,000; prefix and suffix trimmed first | O(D²) |
| LaTeX to MathML | O(length) | O(length) |

The word diff is the one operation that can be worse than O(n log n). The trimming step and the edit cap keep it bounded; past the cap the middle part is shown as one replacement.

## Security

- CSP: the page loads only its own files. The inline script is allowed by hash. No `eval`.
- Everything typed is escaped before it becomes HTML. Pasted, imported and synced HTML passes an allow-list sanitiser: no scripts, no event handlers, only `http`, `https` and `mailto` links, only raster `data:` images, and filtered inline styles.
- CSV export prefixes cells starting with `=`, `+`, `@` (and `-` before a non-number) with an apostrophe, so spreadsheets do not run them as formulas.
- Imported files are validated before anything is stored, and nothing is saved until you press Import.
- The password lock is a SHA-256 salted hash check. It prevents accidental edits. It is not encryption.

## Unit conventions

- Money: 1 rupee = 100 paise. Values are integers in paise. Rupees appear only on screen.
- Page sizes: 1 mm = 96 / 25.4 CSS px. 1 pt = 96 / 72 CSS px.
- Storage sizes: 1 MB = 1,048,576 bytes.
- Durations: 1 day = 1,440 minutes.

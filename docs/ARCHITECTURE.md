# Architecture

Version 1.4.0 · 23/11/2026

## Shape of the app

WrapNote is one HTML file plus three optional same-site folders loaded on first use (the Word engine `word.js`, the text reader `ocr/` and the spell checker `spell/`). The build (`scripts/build.mjs`) inlines the fonts, the CSS and the app's JavaScript into `dist/index.html`. A content security policy (CSP) allows only that one inline script, by its SHA-256 hash. There is no framework and no content delivery network (CDN).

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
    pictures.js   grid slots, joining a grid, cell shape, OCR text clean-up
    refs.js       source references: checks, page ranges, citation text, suggestions, filters (1.3.0)
    ribbonLayout.js  saved ribbon arrangement: check, repair, apply, move, store only differences (1.4.0)
    officeTemplate.js  built-in office template, heading numbers, Word-template audit and clean-up
    zip.js        ZIP writer and reader (CRC-32, stored or deflated parts)      } in word.js,
    ooxml.js      Word (.docx) writer: styles, numbering, fields, Office Math   } loaded on first use
  app/       browser code, loaded in file-name order inside one closure
    00-util  10-store  20-sync  30-pages  40-editor  45-intake  46-refs  47-ocr  48-spell
    50-ribbon  51-ribbon-custom  55-insert  60-layout  70-review  80-views  90-io  91-word  99-main
  word/      docx.js: page → Word model (in word.js, reaches the app through WN.app)
  spell/     worker.js: nspell + en-GB dictionary, bundled by esbuild into dist/spell/
  styles/    app.css (interface), doc.css (document, also used in exports)
  shell.html page skeleton with placeholders
public/      sw.js, manifest.webmanifest, icons
tests/       unit (Node), e2e (Playwright), golden examples
```

## Optional text reader (OCR)

OCR means optical character recognition: reading text from a picture. The build copies Tesseract (an open-source text reader compiled to WebAssembly) into `dist/ocr/`. Nothing loads until someone chooses "Extract text":

1. `47-ocr.js` adds `ocr/tesseract.min.js` to the page.
2. A worker loads from `ocr/worker.min.js`, then the matching engine build and the English language file.
3. The worker stays loaded, so later screenshots skip the start-up cost.
4. If it cannot load, the browser's built-in TextDetector is tried, and then the person types the text.

The page's content security policy is unchanged: everything comes from the same site. The text reader's own picture cache is switched off, because the service worker already caches its files under the `wrapnote-` name, and other projects share this github.io origin.

## Word export (1.2.0)

Version 1.1.0 saved HTML with a .doc name. Word's HTML importer ignores modern CSS, so borders, styles and lists were lost. Now:

1. `docx.js` walks the live page, so it sees the same computed layout the person sees. Each block becomes a Word paragraph with a style (Title, Heading 1–4, Quote, Caption, List Paragraph, Table Text, TOC 1–3), a table, or a field. Run formatting is written only where the screen differs from the Word style (bold, italic, colour, size, font, shading). Screen-only marks (comment highlight, tracked-change colours, search hits) are not copied; Word draws its own.
2. Pictures keep their PNG or JPEG bytes; other formats, charts and shapes are drawn to a canvas and saved as PNG. Equations go from MathML to Office Math. Contents, table of figures, captions (SEQ) and page numbers (PAGE, NUMPAGES) are Word fields with the current values cached, and `updateFields` asks Word to refresh them.
3. `ooxml.js` writes the parts; `zip.js` packs them, compressing XML with the browser's CompressionStream and storing pictures as they are.
4. Fonts Word may lack are mapped (IBM Plex Sans → Arial). The theme's major and minor fonts are the document's fonts, so Word's Design → Fonts still works.

## Office template and template import (1.2.0)

`officeTemplate.js` holds the built-in brand-neutral template as numbers measured from a reference layout (page 11906 × 16838 twips, margins 2477 / 1138 / 1181 / 1138, header 709, footer 850, Verdana 10 pt, heading sizes and spacing). It is written from scratch: no part of any supplied file is in the repository (a unit test scans for that). On screen, headings are numbered with `data-num` (CSS shows it), and the header and the two footers are drawn as page overlays; the first page reserves the height of its taller footer. In Word, headings are numbered by the heading styles.

An imported template is audited (`audit`), cleaned (`sanitize`: pictures, custom XML, comments, tracked changes, rsids, IDs, protection and personal properties removed; schema-breaking cell settings repaired) and completed (`completeStyles`, `completeFonts`), then stored in IndexedDB. Office exports then use its styles, theme, numbering, headers and footers, with WrapNote's roles mapped by Word style name. `scripts/template-tool.mjs` runs the same checks from the command line; `npm run template:check` audits the built-in template in CI and fails if a role, font, field or table rule is missing.

## Spell check (1.2.0)

`48-spell.js` starts a worker (`spell/worker.js`: nspell with the en-GB Hunspell dictionary). Finished words are checked 120 ms after typing; the word at the cursor waits until it is finished. Marks are drawn with the CSS Custom Highlight API, so the document's HTML never changes and nothing extra is saved or exported. If the worker or the API is missing, the browser's own spellcheck is switched back on.

## Picture grids

`pictures.js` holds the rules. A 2×2 grid holds 4 pictures, a 3-column grid fills rows of 3, side by side holds 2, and stacked never fills up. A new picture joins only the most recently added or arranged picture block, and only if that block is a grid with an empty slot. Empty slots are screen-only elements, rebuilt on every layout pass and removed from saves, print, exports and side views. Each cell takes the median shape of its pictures (clamped between 9:16 and 16:9), and `object-fit: contain` draws each picture whole. A cell is at most half of a page's writing height, so a full 2×2 grid fits on one page.

## Data model

A document record:

| Field | Meaning |
|---|---|
| `id` | Unique id (letters, digits, `-`, `_`) |
| `u` | Last update time in milliseconds; only moves forward |
| `mode` | `mom`, `book` or `blank` |
| `title`, `category`, `status` | Status is `draft` or `final` |
| `fields.mom`, `fields.book` | Structured intake values; dates in ISO form. Action items no longer have a cost (1.2.0); an old stored cost is kept but not shown |
| `template`, `office` | `personal` or `office` (1.2.0); for office documents, the document-control fields shown in the header and footers |
| `html` | The page content (sanitised on every load) |
| `layout` | Page size, margins, border, watermark, header, footer, page numbers, branding |
| `comments`, `revisions`, `protect`, `summary` | Review data |
| `refs` | Source references (1.3.0), keyed by note (block) id. Missing in older records; read as `{}` |

A deletion is a tombstone: `{ id, d: 1, u }`.

## Source references (1.3.0)

A note is a block on the page (`[data-block]`). Its reference lives in the document record, not in the page body:

```
"refs": {
  "b8f2k1x9": {
    "v": 1,                          // shape version, so a later change can be recognised
    "source": "Grid Code 2023",      // document name (required when any field is set; up to 200 characters)
    "heading": "Frequency",          // up to 200 characters
    "sub": "Limits",                 // sub-heading, up to 200 characters
    "section": "4",                  // article or section as typed, up to 40 characters; "4" shows as "Art. 4"
    "pages": { "from": 12, "to": 12 }, // or null; a range is { "from": 42, "to": 45 }
    "t": 1795425800645               // when it was last changed (orders suggestions by recency)
  }
}
```

Why this shape:

1. **Old records keep working.** A record without `refs` is read as `{}` (`WN.refs.upgrade`) when it opens. Nothing else in the record changes, and the page body format is unchanged.
2. **One copy.** The citation tag on the page is drawn from `refs` on every open, undo and synced change, and removed before the body is saved. The two can never disagree.
3. **Moves with the note.** Keys are block ids, so moving, formatting or editing a note keeps its reference. A deleted note's reference stays in `refs` so Undo can restore both, but it is left out of lists.
4. **Pages are numbers.** A range is stored as two integers, so a filter can test overlap without parsing text, and a CSV shows "42-45" as text.
5. **Checked at every door.** The form, backups, the WrapNote file and sync all pass through `validate` / `cleanMap`. A bad entry is dropped and named in a message; its note and document still import.

### Placed tags (1.4.0)

A reference made from a selection or the cursor gets its own key (`r` + random letters) and an anchor in the page body:

```
<span class="wn-cite" contenteditable="false" data-ref="r3kx9p2a" data-place="inline"></span>
```

1. **Still one copy.** The anchor stores only where the tag sits and whether it is `inline` (in the sentence, in brackets) or `line` (own line). Its words are drawn from `refs` on every open, undo and synced change and emptied before saving.
2. **Old tags keep working.** A 1.3.0 reference (keyed by block id) has no anchor and is drawn at the end of its note, as before. Moving it creates an anchor with the same key, so `refs` and the Sources list do not change.
3. **No duplicates.** On opening, an anchor whose key is unknown (pasted from another document) or already used (copied) is removed.
4. **Preview.** The Sources text of a placed tag is the paragraph around it (`citeHolder`: list item, paragraph, quote, cell or note).
5. **Allowed places.** Not in headings, inside another tag, or in text WrapNote generates (summary, table of contents, labels). The same rule serves the dialog, Move… and drag and drop.

Each document's summary (`meta`) carries a flat list of its referenced notes (`refs: [{ b, source, heading, sub, section, pages, t, preview }]`). The Sources page and the suggestions read only these summaries, never whole documents.

The `meta` store keeps a small summary of each document (title, dates, word count, action rows). Lists and the dashboard read only summaries, so pictures are never loaded just to draw a chart.

## Ribbon arrangement (1.4.0)

The ribbon is data (`TABS` in `50-ribbon.js`): tabs → groups → items, each with a stable id. Paths look like `home/font/bold`; a select is `sel:style`, a repeated command gets `#2`.

Settings key `ribbonLayout` (in `localStorage`, prefix `wrapnote:`):

```
{ "v": 1, "tabs": [...], "groups": { "home": [...] }, "items": { "home/font": [...] }, "hidden": ["home/editing"], "qat": ["home/font/bold", ...] }
```

1. **Only differences are stored** (`compact`); the standard arrangement stores nothing, so a later version's new standard reaches the person.
2. **Repaired on loading** (`normalize`): unknown ids are dropped, repeated ones kept once, commands added in a later version are placed next to their standard neighbour, a tab keeps at least one visible group, and the quick access bar holds at most 16 valid commands. Each repair is shown in a message.
3. **One command, many copies.** A command on the quick access bar is a second copy of the ribbon button; pressed states and selects are updated on every copy. Element ids stay on the ribbon copy only.

## The page canvas

The canvas HTML is the single source of truth. Structured fields render into one generated section (`.wn-gen`) at the top. Content blocks are elements with `data-block`, so the block list is read from the canvas and cannot drift.

Pagination (`60-layout.js`):

1. Clear the previous page pushes.
2. Read each top-level block's position and height once (one layout). The editing area is ordinary block layout (1.1.0 used a flex column, which made the browser's Up and Down keys and clicks land on the wrong line), so vertical margins collapse; the visible gap above each block is measured and a push becomes margin-top = gap + push.
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
| Sources page: filter and sort n referenced notes | O(n log n); comparison keys made once per stored reference and reused | O(n) |
| Document-name suggestions | O(n + s log s) for n notes and s distinct names | O(s) |
| Merge two record sets | O(n + m) hash lookups; canonical JSON is O(s log s) per tied record | O(n + m) |
| Pagination | O(b) for b top-level blocks, one forced layout | O(b) |
| CSV parse | O(c) characters; header search O(30 × columns) | O(c) |
| Find and replace | O(t) characters of text | O(matches) |
| Word diff (compare) | O((N+M)·D), D = number of edits, capped at 2,000; prefix and suffix trimmed first | O(D²) |
| LaTeX to MathML | O(length) | O(length) |
| Grid slots and cell shape | O(p log p) for p pictures in a block (median sort) | O(p) |
| OCR text clean-up | O(lines) | O(lines) |
| Spell check pass | O(w) words on the page plus one worker call for words not seen before; results cached per word | O(distinct words) |
| Word export | O(n) page nodes + O(b) bytes of pictures (CRC-32, eight bytes per step) | O(b) |
| Template audit and clean-up | O(x) characters of the template's XML | O(x) |

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

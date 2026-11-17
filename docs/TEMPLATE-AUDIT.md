# Office template: audit summary and measurements

Version 1.2.0 · 17/11/2026

This file records how WrapNote's built-in office template was made and what the template tool found. It lists counts, style roles and font names only. No text, picture, label or name from any supplied file is in this repository, and a unit test (`tests/unit/privacy.test.js`) fails if one is added.

## How the built-in template was made

1. A reference layout was supplied for version 1.2.0 as a Word file. It was opened only on the build machine, outside the repository.
2. `scripts/template-tool.mjs audit` read its structure: page set-up, style sizes and spacing, heading numbering, header and footer tables, section order.
3. The template was then written from scratch in `src/core/officeTemplate.js` with neutral style IDs and square-bracket placeholders. The reference file was not committed, copied or uploaded.
4. Both were rendered to PDF with LibreOffice and compared page by page.

## Measurements used

| Item | Value |
|---|---|
| Page | A4, 11906 × 16838 twips (210 × 297 mm) |
| Margins | top 2477, right 1138, bottom 1181, left 1138 twips (43.69 / 20.07 / 20.83 / 20.07 mm) |
| Header and footer distance | 709 and 850 twips (12.5 and 15.0 mm) |
| Different first page | yes |
| Body text | Verdana 10 pt; body paragraphs 6 pt after, line 1.2 |
| Heading 1 / 2 / 3 | 14 / 12 / 11 pt bold, numbered 1, 1.1, 1.1.1 by the heading styles, number in an 851-twip slot |
| Title / subtitle | 20 pt / 16 pt bold, centred |
| Tables | 0.5 pt grey (808080) borders, bold header row repeated on each page, rows never split |
| Header | "Classification:" line, then a 3 × 2 table (3211 twips per column): logo, document type, Doc. and Rev.; organisation, document title (shaded D9D9D9), Page: PAGE / NUMPAGES |
| First-page footer | 4 × 3 table: Language, Author, Reviewer, Source, Approver; centred bold notice |
| Later-page footer | centred notice |
| Theme | standard Office colours; theme fonts Calibri Light and Calibri |
| Document properties | Title "Generic Office Document Template", Subject "Brand-neutral controlled document template", Category "Office Template"; author, company and manager blank |

## What the audit of the reference found

| Check | Result |
|---|---|
| Styles | 116 (74 paragraph, 4 table) |
| WrapNote roles present | 20 of 26 |
| Roles missing, added by the tool | TOC Heading, footnote text, footnote reference, Body Text, Table Text, WrapNote Table |
| Fonts | Arial, Calibri, Calibri Light, Consolas, Segoe UI, Verdana; all declared, all standard in Word |
| Heading numbering | by the heading styles |
| Headers / footers | 3 / 3; different first page; PAGE and NUMPAGES fields present; TOC field present |
| Privacy findings removed by `sanitize` | author name in properties; 8 pictures; 4 custom XML or custom property parts (for example sensitivity labels); revision save IDs; document IDs; editing restriction |
| Repaired by `sanitize` | table-cell and shading settings that broke the Word schema (the original failed strict validation; the cleaned copy passes) |
| Left for a person to review | 4 words of non-placeholder text in a header; 5 style names that look organisation-specific |

## The tool checks itself

`npm run template:check` builds the built-in template and audits it. The first run found two gaps, both fixed before release: the theme fonts were not declared in the font table, and the cached page-number results were counted as header text.

## Completion note (from the template-engineering brief)

- Theme preserved: yes (standard Office colour scheme; theme fonts Calibri Light and Calibri).
- Named styles preserved: yes (Normal, Heading 1–4, Title, Subtitle, Caption, TOC 1–3, Header, Footer and the rest, by their built-in names).
- Heading numbering preserved: yes, applied by the heading styles; no heading number is typed.
- TOC field created: yes, `TOC \o "1-3" \h \z \u`, with entries cached.
- PAGE and NUMPAGES fields created: yes, in the header.
- Pages rendered and checked: yes, with LibreOffice 24.2 (not Microsoft Word, which is not available on the build machine).
- Organisation and personal information removed: yes from the built-in template (it never had any) and from imported templates by `sanitize`; header wording that is not a placeholder is listed for a person to review rather than guessed at.

# Setup

Version 1.4.0 · 23/11/2026

## What you need

- Node.js 20 or newer. The build uses the pinned font, text-reader and spelling packages and esbuild (all development dependencies).
- Python 3.10 to 3.13 for the browser tests (Playwright).

## Build and run locally

1. Clone the repository.
2. Run `npm ci` to install the pinned font, text-reader (OCR), spelling (nspell, en-GB dictionary) and esbuild packages.
3. Run `npm test` to run the unit tests.
4. Run `npm run build`. This writes `dist/index.html`, the Word engine `dist/word.js`, the service worker, the manifest, the icons, the `dist/spell/` spell checker (about 570 KB) and the `dist/ocr/` text-reader files (about 14 MB; a browser downloads about 7 MB of them on first use).
5. Run `python -m http.server 8765 --directory dist`.
6. Open http://localhost:8765/ in Chrome or Edge.

## Run the browser tests

1. Run `pip install -r requirements.txt`.
2. Run `python -m playwright install chromium`.
3. Keep the local server from step 5 above running.
4. Run `python tests/e2e/run_e2e.py`.
5. Run `python tests/e2e/run_issues.py`.
6. Run `python tests/e2e/links.py`.
7. Run `python tests/e2e/usability.py`.
8. Run `python tests/e2e/usability_v110.py`.
9. Run `python tests/e2e/run_issues_v120.py` (writes sample .docx files to `tests/e2e/reports/`, which is not committed).
10. Run `python tests/e2e/usability_v120.py`.
11. Run `python tests/e2e/run_refs_v130.py`.
12. Run `python tests/e2e/usability_v130.py`.
13. Run `python tests/e2e/characterise_v140.py` (pins the 1.3.0 ribbon command list in `tests/e2e/fixtures/`).
14. Run `python tests/e2e/run_v140.py`.
15. Run `python tests/e2e/usability_v140.py`.

Each script prints PASS or FAIL per check and exits with code 0 only when everything passes.

## Check a Word template

The same checks the app runs when you import a template:

1. `node scripts/template-tool.mjs audit my-template.docx` lists styles, missing roles, fonts, fields and privacy findings (counts only).
2. `node scripts/template-tool.mjs sanitize my-template.docx clean.docx` removes personal and organisation data, repairs schema errors, and adds missing styles.
3. `npm run template:check` audits WrapNote's built-in template; CI runs it and fails if a role, font, field or table rule is missing.

Never commit a template or a .docx: `.gitignore` excludes them and a unit test fails if one is present.

To look at an exported file without Word: `soffice --headless --convert-to pdf file.docx` (LibreOffice; install `libreoffice-math` too, or equations are left out of the PDF).

## Regenerate the icons

1. Run `npm run icons`.

## Deploy to GitHub Pages

The workflow in `.github/workflows/ci.yml` tests every push and pull request. On `main` it then builds and deploys to Pages.

1. Open the repository on GitHub.
2. Go to **Settings**, then **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Merge a pull request into `main`.
5. Wait for the "CI and Pages" workflow to finish.
6. Open https://sathyanarayanan-2001.github.io/wrapnote/.

## Set up sync with OneDrive

Folder sync needs Chrome or Edge on a computer (the File System Access API).

1. Create a folder inside OneDrive, for example `OneDrive/WrapNote`.
2. Open WrapNote and go to **Settings**.
3. Choose **Choose sync folder** and select the OneDrive folder.
4. Allow the browser to edit files in that folder.
5. Repeat steps 2 to 4 on your other computer with the same folder.

After a browser restart, the status at the top right may show **Folder access needed**. Select it and allow access again.

On a phone, use **Settings**, **Export backup** on one device and **Import backup** on the other.

## Files that must never be committed

`.gitignore` blocks WrapNote save files, backups, exports and error logs. Do not force-add them.

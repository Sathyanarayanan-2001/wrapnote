# Contributing

Thank you for helping. Keep changes small and tested.

## Workflow

1. Create a branch from `main`, for example `fix/date-parsing`.
2. Make the change.
3. Run `npm test`.
4. Run `npm run build` and the browser tests (see docs/SETUP.md).
5. Open a pull request into `main`.
6. Merge only after the "CI and Pages" checks pass.

## Rules

- Plain HTML, CSS and JavaScript. No framework and no CDN.
- Pure logic goes in `src/core/` with a unit test in `tests/unit/`.
- Every test states its input and the expected result worked out by hand.
- Money is integer paise. Never add floating-point rupees.
- Dates are typed day first and stored as ISO dates. Week, month and financial year are derived, never typed.
- Escape every value shown on screen. Run pasted or imported HTML through the sanitiser.
- Sort stably and break ties by a second key (then date, then name).
- Comments explain why, not what.
- Use made-up names and amounts in tests. Never commit real documents, backups, save files or logs.
- Update CHANGELOG.md and the version number in `package.json` and `src/core/model.js`.

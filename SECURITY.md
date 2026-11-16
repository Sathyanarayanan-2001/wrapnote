# Security policy

## Supported versions

Only the latest release on `main` receives fixes.

## Reporting a problem

Please open a private security advisory on GitHub (Security tab, "Report a vulnerability"). Do not file a public issue for a security problem. Include steps to reproduce and the browser version. Never include real documents or personal data.

## How WrapNote protects you

- No accounts, analytics or servers. The app makes no network calls with your data.
- A content security policy lets the page run only its own script (by hash) and load only its own files.
- Pasted, imported and synced HTML is cleaned by an allow-list sanitiser.
- CSV exports guard against spreadsheet formula injection.
- Secrets are never stored in the code or the repository. The app needs none.

## Limits

- Documents are stored unencrypted in the browser and in the sync folder. Protect your device and your OneDrive account.
- The password lock prevents accidental editing. It is not encryption.

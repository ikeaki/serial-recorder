# Copilot instructions for serial-app

## Project overview
This repository is a Vite + React + TypeScript application for managing serial codes captured from QR/DataMatrix/Code128 scanners and OCR. It runs as a browser app and is packaged for Android via Capacitor.

## Stack and libraries
- React 19 and TypeScript
- Vite for local dev/build
- Capacitor for Android app packaging
- ZXing Browser for barcode scanning
- Tesseract.js for OCR
- xlsx for Excel export
- IndexedDB for local history storage

## Coding expectations
- Keep code simple and maintainable; prefer small, clear functions over complex abstractions.
- Use TypeScript types consistently for state and helper functions.
- Favor functional React patterns and hooks already used in the app.
- Preserve the current Japanese UI labels and user-facing messages unless explicitly asked to change language.
- For browser APIs, keep compatibility in mind for mobile webview/Android environments.

## App-specific conventions
- History is stored in IndexedDB under the DB name `serial-db` with object store `history`.
- New scans should check for duplicate codes before saving.
- When saving or exporting history, keep timestamps as readable localized strings.
- UI updates should remain lightweight and mobile-friendly.
- Keep inline styles consistent with the existing app structure unless a broader design change is requested.

## Commands
Use these commands for verification and local development:
- `npm install`
- `npm run dev`
- `npm run build`
- `npm run lint`

## Quality bar
- Prefer minimal, targeted edits.
- Do not add unnecessary dependencies.
- After changing code, verify with the relevant project command (`npm run build` or `npm run lint` when appropriate).
- If a fix is related to scanning/OCR, confirm camera permissions and browser compatibility expectations in the code path.

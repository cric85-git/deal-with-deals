# Perq v13 — Agent Scan Build

Perq is an AI-powered savings companion. This version focuses on the core promise:

**Snap it. Forget it. iDeal saves the deal to your Wallet.**

## What changed in v13

- Removed the manual scan-review-save flow.
- Fixed the OCR path so scanning no longer waits for an API key.
- Coupon photos are processed with browser OCR using Tesseract.js.
- Extracted deal data is auto-saved into the Deals Wallet.
- Added a premium iOS-style iDeal scan overlay.
- If OCR fails, the app asks the user to retake the photo instead of showing a form.

## Deploy

Upload the extracted files to the root of your GitHub Pages repo and commit.


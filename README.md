# Perq — Smart Savings Wallet v12

Perq is the rebranded, premium iPhone-style version of the Deal with Deals PWA.

## v12 changes

- New brand name: **Perq**
- New app icon/logo system
- Compact iOS-style header
- Fixed Discover hero CTA overlap
- CTA renamed to **Open Deals Wallet**
- Rewards page redesigned without a spinner
- New Apple-style rewards ring, reveal card, streak strip, and missions
- Scan flow redesigned as a native-feeling bottom sheet
- Sticky save/cancel action bar on mobile
- Removed Anthropic API key UX
- Added free in-browser OCR using Tesseract.js for GitHub Pages deployments
- Updated service worker cache to `perq-v12`

## Deploy

Upload the extracted files to the root of your GitHub Pages repo:

- `index.html`
- `app.js`
- `sw.js`
- `manifest.json`
- icons

Then commit. GitHub Pages will redeploy automatically.

## OCR note

This version uses on-device OCR through Tesseract.js. It avoids user API keys and works on static hosting. Accuracy depends on photo quality, coupon font, glare, and cropping. A production version should still move to a backend OCR/LLM pipeline for better structured extraction.

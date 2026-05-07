# Perq v14 — Savings Agent

Perq is an AI savings agent PWA: snap, import, or share a deal and iDeal auto-saves it to the Deals Wallet.

## New in v14

- Capture hub: Snap paper coupon, Import image/screenshot, Paste link or offer text.
- Auto-save behavior: no manual Save button after capture.
- Multi-offer extraction: one coupon image can create multiple wallet cards.
- Improved orientation handling: OCR attempts sideways coupon photos.
- Share Target support for URLs/text on supported browsers.
- Better parsing for physical mailers like home-service postcards.

## Deploy

Upload extracted files to the GitHub Pages repo root and commit.

## Important product note

This static build uses browser OCR + heuristics so it can run on GitHub Pages without backend cost. For production-level reliability, replace local OCR with a server-side AI Vision extraction endpoint.

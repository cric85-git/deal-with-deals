# Deal with Deals — PWA Takeover Build

Deal with Deals is a mobile-first Progressive Web App for capturing, tracking, sharing, and redeeming coupons/deals.

## Current build status

This package is deployable as a static PWA. It includes:

- `index.html` — UI shell and styles
- `app.js` — client-side app logic
- `sw.js` — service worker for asset caching/offline behavior
- `manifest.json` — PWA install metadata and shortcuts
- app icons for iOS/Android

## Run locally

Because this uses a service worker and browser APIs, run it from a local web server rather than opening `index.html` directly.

```bash
cd dwd-pwa-v10-takeover
python3 -m http.server 8080
```

Open: `http://localhost:8080`

## Deploy

Any static host works:

- Netlify Drop
- Vercel static deploy
- GitHub Pages
- Cloudflare Pages

## Important production notes

The current OCR flow calls Anthropic directly from the browser using a user-provided API key. That is acceptable for a personal prototype, but not production. Before broader rollout, move OCR calls behind a small server/API route so keys are never stored in browser localStorage or sent directly from the client.

Nearby-deals geocoding uses OpenStreetMap Nominatim. Keep request volume low and consider a proper maps/geocoding provider if this becomes a public app.

## Next build milestone

Recommended v10 focus:

1. Backend OCR proxy and basic auth/session layer
2. Cloud data sync instead of localStorage-only
3. Real barcode/QR generation
4. App analytics for capture → save → use → redeem funnel
5. Production-grade reminders and notification strategy

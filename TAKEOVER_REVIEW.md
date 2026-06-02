# Perq Technical Takeover Review

## Executive summary

The app is already a strong prototype and is deployable as a static PWA. It validates the core product loop: capture a coupon, save it, get reminded, use it, earn rewards, and repeat.

The biggest gap is not UI completeness; it is production hardening. The app still relies on browser localStorage, best-effort web notifications, and third-party free geocoding. Smart Capture is now shaped for a Perq-owned AI service, but that backend must be deployed before image extraction can work in production without exposing provider credentials to the browser.

## What is already solid

- Mobile-first PWA shell with install support
- Offline-capable service worker
- Deal CRUD flow
- Camera capture flow
- AI OCR pipeline
- Rewards, spins, points, quests, streaks, and tiers
- Expiry reminders
- Nearby deal lookup
- Claim flow with cashier, code/copy, and online modes
- 3D card flip with map preview
- Settings and data export/reset

## Highest-priority fixes before public beta

### 1. Deploy the AI capture service

The client now sends compressed coupon images to a configured Perq AI endpoint. Build and deploy that endpoint so provider credentials stay on the server:

- Client uploads compressed image to `/api/deals/extract`
- Server owns AI provider credentials
- Server validates request size/type
- Server returns normalized JSON

### 2. Replace localStorage as the primary database

Keep localStorage as cache/offline fallback, but add cloud persistence:

- User table
- Deals table
- Rewards/game state table
- Settings table
- Optional shared/community deals table

Recommended fast stack: Supabase or Firebase. Recommended AWS-native stack: Cognito + API Gateway + Lambda + DynamoDB + S3.

### 3. Add analytics

Track the product-market-fit loop:

- deal_added_manual
- deal_added_photo
- ocr_success / ocr_failed
- deal_redeemed
- reminder_seen
- nearby_deal_clicked
- spin_used
- reward_redeemed

### 4. Harden notifications

Web notifications are uneven on iOS. For PWA beta, keep in-app reminders as the reliable baseline. For native, use APNs/FCM.

### 5. Improve merchant/location matching

Nominatim free geocoding is okay for prototype use. For production, use a paid provider or merchant-location API to avoid bad matches and rate-limit problems.

## Recommended build plan

### Phase 1 — Deployable beta polish

- Update README/versioning
- Add test checklist
- Add privacy copy
- Add funnel analytics
- Add OCR failure handling improvements
- Add import from exported backup

### Phase 2 — Backend MVP

- Add backend OCR proxy
- Add user login
- Add cloud sync
- Add server-side shared deals
- Add basic admin metrics dashboard

### Phase 3 — App-store candidate

- Wrap with Capacitor
- Add native push notifications
- Add real barcode/QR support
- Add background geofencing where appropriate
- Add TestFlight/internal Play testing

## Suggested tech direction

For speed: React + Vite + Supabase + Vercel.

For AWS alignment: React + Vite + Cognito + API Gateway/Lambda + DynamoDB + S3 + Pinpoint/SES for notifications.

The current vanilla JS PWA should remain as the prototype baseline, but future work should move toward modular React components to reduce risk as features grow.

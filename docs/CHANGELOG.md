# Perq — Changelog

All notable feature changes to the Perq app are documented here.

---

## [Unreleased] — 2026-06-04

### 🆕 Feature: Snap & Forget — Smart Scheduled Reminders

**What a user couldn't do yesterday:**
- Reminders only fired when the app was open — if the user didn't open Perq, they'd miss expiring deals silently.
- After scanning a coupon, users always had to review a full form and tap "Save" — even when the AI got it right.

**What a user can do today:**
- **Scheduled notifications fire even when the app is closed.** Three automatic reminders per deal:
  - X days before expiry (configurable, default 3 days) — morning nudge
  - Evening before expiry — "expires tomorrow, don't forget"
  - Day of expiry — "LAST CHANCE, expires today"
- **One-tap Quick Save after camera scan.** When AI successfully reads the coupon, a "Save & Set Reminder" button appears immediately — one tap and you're done. No form review needed.
- **Notifications auto-cancel** when you redeem or delete a deal — no phantom alerts.
- **Notifications re-sync on app start** — reinstall, toggle settings, switch phones — your reminders always catch up.

### How it works (user flow):

```
1. Tap camera icon
2. Snap a photo of any coupon/deal
3. AI reads it → shows: "Whole Foods — 20% off produce · expires 2026-06-15"
4. Tap "Save & Set Reminder" (one tap)
5. Done. Three notifications scheduled automatically.
6. Forget about it — Perq will ping you before it expires.
```

### 🐛 Fix: Daily Spin toast no longer floats over every screen

**Before:** The "+1 daily spin" notification appeared as a floating pill on every screen — including modals, forms, and deal cards — blocking content.

**After:** Removed entirely. The existing "1 spin ready → Spin now" card on the Home screen is the only prompt — tapping it navigates to Rewards.

---

### 🆕 Feature: Backend AI Proxy (no API key required)

**What a user couldn't do yesterday:**
- Had to go into Settings and paste their own Anthropic API key before the camera scan would work. Most users would never do this.

**What a user can do today:**
- **Just snap a photo.** The app calls a backend proxy that holds the API key server-side. Zero configuration needed.
- Falls back gracefully to user's own key if the proxy is unreachable.
- Rate limited (10 scans/min) to prevent abuse.

### Deployment (one-time setup for the developer):
```bash
cd backend/ocr-proxy
npm install
wrangler login
wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```
Then set the `OCR_PROXY_URL` constant in `app.js` to your Worker URL.

---

### 🆕 Feature: Barcode & QR Code Scanner

**What a user couldn't do yesterday:**
- The only way to capture a deal was to take a full photo and wait for AI to process it (2-5 seconds). For deals with just a barcode or QR code, this was overkill.

**What a user can do today:**
- **Tap "Scan" for instant barcode/QR detection.** Opens a real-time camera view with a targeting frame.
- **Instant detection** — codes are recognized in under 250ms using the native `BarcodeDetector` API.
- **Haptic feedback** — phone vibrates when a code is found.
- **Smart routing** — URLs from QR codes auto-fill the merchant and URL fields. Numeric barcodes fill the barcode field. Text codes fill the promo code field.
- **Supported formats:** QR, EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39, Code 93, ITF, Data Matrix.

### User flow:
```
1. Tap "Scan" button in action bar
2. Full-screen camera opens with targeting frame
3. Point at barcode/QR → detected instantly
4. Code appears at bottom → tap "Use this code"
5. Deal form opens pre-filled with the scanned code
6. Fill in remaining details → Save
```

---

## Phase 2: Social & Sharing — 2026-06-04

### 🆕 Feature: Deep Link Sharing + Claim Flow + Activity Feed

**What a user couldn't do yesterday:**
- Sharing only copied plain text. Recipients had to manually create the deal in their own app.
- No way to claim a deal someone shared with you in one tap.
- No visibility into your sharing/claiming activity.

**What a user can do today:**
- **Share with deep links.** When you share a deal, it generates a Perq link that carries all deal details (merchant, discount, code, expiry). Recipients tap the link and the deal auto-imports.
- **One-tap claim.** Opening a share link shows a beautiful claim modal with deal preview. Tap "Claim deal" → it's saved to your wallet with reminders set. (+5 pts)
- **Activity feed.** The Social tab shows your real sharing/claiming history with timestamps.
- **Re-share button.** Your shared deals have a "Share again" button for quick re-sharing.
- **Share count tracking.** See how many times you've shared each deal.
- **Community trending.** Browse and claim deals trending in the community.

### Share link format:
```
https://yourapp.com/index.html?claim=<base64-encoded-deal-data>
```

### User flow (sharing):
```
1. On any deal card → tap Share
2. Native share sheet opens with Perq deep link
3. Send via iMessage, WhatsApp, email, etc.
```

### User flow (claiming):
```
1. Recipient taps the Perq link
2. Claim modal shows: merchant, discount, expiry, promo code
3. Tap "Claim deal" → saved to wallet + reminders set
4. +5 points awarded
```

---

## Phase 3: Integrations & Aggregation — 2026-06-04

### 🆕 Feature: Email Integration Backend

**What a user couldn't do yesterday:**
- No way to automatically import deals from promotional emails. Had to manually snap or type every deal.

**What a user can do today:**
- **Connect Gmail or Outlook** via OAuth (backend handles tokens securely).
- Backend worker parses incoming emails for deal keywords, extracts merchant/discount/code/expiry.
- Auto-imports extracted deals to user's Perq wallet.
- Status check + disconnect endpoint for privacy control.

*Note: Requires deploying `backend/email-worker` with OAuth credentials. The client UI intent capture is already live.*

---

### 🆕 Feature: Push Notifications + Sync Mechanism

**What a user couldn't do yesterday:**
- Email deals existed in the backend but had no way to reach the user's phone. The app only checked for deals when manually opened.

**What a user can do today:**
- **Push notifications for new email deals.** When the backend finds a deal in your email, your phone gets a push notification: "📬 New deal found: Target — 20% off"
- **Tap notification → deal is synced.** Opens the app, imports the deal, sets reminders. Zero manual steps.
- **Background sync on foreground.** Every time you open the app, it checks for new email-extracted deals and imports them silently.
- **Acknowledgment flow.** Once synced, deals are marked as delivered so you never get duplicates.
- **OAuth callback handling.** After connecting email, the app automatically starts syncing.

### Complete email flow (zero-effort):
```
1. One-time: Connect Gmail/Outlook in Settings
2. Promo email arrives → backend webhook fires
3. Worker parses email → extracts deal → stores in KV
4. Push notification sent to phone: "📬 New deal: Target 20% off"
5. User taps notification (or opens app later)
6. App syncs → deal card appears → reminders set
7. Near Target? Proximity alert fires. Expiring? Reminder fires.
8. User did NOTHING after step 1. Pure autopilot.
```

---

### 🆕 Feature: Reward Programs Tracker

**What a user couldn't do yesterday:**
- No way to track airline miles, hotel points, or credit card rewards in the same app. Had to open separate apps to check balances and expiry.

**What a user can do today:**
- **Add reward programs** (Delta SkyMiles, Marriott Bonvoy, Chase Sapphire, etc.) with balance, unit, and expiry.
- **Expiry countdown** — programs with points expiring soon show warnings (≤30d = red, ≤90d = yellow).
- **Type-specific icons** — airline ✈️, hotel 🏨, credit card 💳, cashback 💵.
- **Delete programs** when no longer needed.
- All accessible from the "For You" tab.

---

### 🆕 Feature: Loyalty Cards Wallet

**What a user couldn't do yesterday:**
- Had to carry physical loyalty cards or dig through separate wallet apps to find membership numbers at checkout.

**What a user can do today:**
- **Store loyalty/membership cards** with name, card number, and custom color.
- **Quick access** from the "For You" tab — no searching.
- **Color-coded cards** for easy visual identification.
- **Delete cards** when expired or no longer needed.
- Card numbers displayed in monospace for easy reading at checkout.

### Technical details:
- Uses `@capacitor/local-notifications` scheduled notification API
- Notifications scheduled at creation time, not checked on a polling loop
- Works on iOS and Android native builds
- Falls back to Web Notification API for PWA users (app must be open)

---

## [v19.0.0] — Initial Release

### Core Features:
- PWA with offline support (Service Worker)
- Camera-based deal capture with AI OCR (Claude API)
- Manual deal entry form
- Deal cards with status tracking (active/expiring/expired/redeemed)
- Configurable expiry reminders (in-app)
- Proximity/beacon alerts (geolocation-based)
- Social sharing (native share sheet)
- Gamification: spin wheel, points, tiers, daily quests
- Capacitor native wrapper (iOS + Android)
- GitHub Pages deployment

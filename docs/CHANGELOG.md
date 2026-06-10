# Perq — Changelog

All notable feature changes to the Perq app are documented here.

---

## [Unreleased] — 2026-06-10 (supervisor-v3 + reporter)

### 🛠 Supervisor hook v3 — Gate 0 added + agentStop reporter companion

**v3 changes (preToolUse blocking gate):**
- Adds **Gate 0 — Spec exists for new features**, inserted before Gate 1.
- Rule: if `preview-app.js` adds any new `window.NAME = function`, Gate 0 fails unless `.kiro/specs/*.md` has a file whose content contains the literal `NAME` token. "N/A (no spec)" is NOT a valid Gate 0 state when new functions exist.
- This would have blocked the recent `feat: add Share Deal button` commit (where `shareDealFromModal` was added without a spec at user instruction). Going forward, every new user-facing global needs a spec entry.
- Output table now has 14 rows (Gate 0 first).

**New companion: agentStop reporter (`.kiro/hooks/perq-supervisor-report.kiro.hook`)**
- Fires once per agent turn end, runs the same gate sequence, and produces a one-shot REPORT line + table.
- INFORMATIONAL ONLY — never denies anything. The preToolUse hook remains the only blocking authority.
- Tolerates clean / quiescent state (single-line "no changes since last push — gates quiescent").
- Comparison baseline adapts to working-tree dirty vs unpushed-commits vs both states.
- Goal: replace per-shell-call APPROVE noise with a single end-of-turn rollup so the user can see push-readiness at a glance.

---

## [Unreleased] — 2026-06-10 (deal-detail-modal-share)

### 🆕 Feature: Share Deal button on Deal Detail Modal

Spec: skipped at user instruction (small follow-up to feature-deal-detail-modal).

**What a user couldn't do yesterday:**
- The Deal Detail Modal had a single primary CTA ("Mark as Used"). To share a deal from the modal, the user had to close it and tap the Share icon inside the wallet pass action row.

**What a user can do today:**
- A new **Share Deal** secondary CTA sits below "Mark as Used" inside the modal. Outlined mint button (border `var(--accent)`, label `var(--accent-dark)`) so it reads as secondary, not competing with the primary CTA.
- Available for both active deals and already-redeemed deals (sharing a "look at the deal I just used" recommendation is valid).
- Wraps existing `shareDeal(id)` via new `window.shareDealFromModal(id)` so the modal closes cleanly before the system share sheet (or share-options modal) opens.

**Tests added:**
- `scripts/perq-load-test.js` — `shareDealFromModal` asserted on `window` after boot.
- `scripts/perq-render-test.js` — 2 new cases: active deal renders share button, redeemed deal also renders share button. RENDER TEST 13 → 15 PASS.

**Cache version:** `?v=30` → `?v=31`.

---

## [Unreleased] — 2026-06-10 (deal-detail-modal)

### 🆕 Feature: Deal Detail Modal

Spec: `.kiro/specs/feature-deal-detail-modal.md`. First feature delivered through the autonomous quality system shipped earlier today.

**What a user couldn't do yesterday:**
- Viewing a saved deal required tapping the inline stacked-card expand. The expanded view crowded the discount, code, terms, address, and three action buttons into one frame — fine for at-a-glance, but cluttered for a screenshot, for reading at arm's length in a store, or for a future "open from notification deep link" path.

**What a user can do today:**
- Tap the new ⓘ icon inside an expanded wallet pass → a focused **Deal Detail Modal** opens. Brand-tile header (uses `getBrandFor(merchant)` colors with the white outline shadow), then three info rows for Merchant, Discount, and Expiry. The Expiry row colors itself based on state: faint for "No expiry", warm-red for "Expires today" or "Expired N days ago".
- Single primary CTA: **Mark as Used**. Tapping it runs the existing `redeemDeal()` (points + streak + savings + notification cancel) and closes the modal.
- For deals already redeemed, the CTA is replaced with a disabled "Already used" pill in `var(--text-faint)`.
- Modal uses the existing `.modal-overlay` shell (slide-up sheet, backdrop tap to close, X button top-right). No new infrastructure.

**Tests added:**
- `scripts/perq-load-test.js` — `viewWalletDeal` and `markDealUsed` are asserted on `window` after boot.
- `scripts/perq-render-test.js` — three new cases: bad-id no-op, active-deal renders "Mark as Used" CTA, redeemed-deal renders disabled "Already used" pill. RENDER TEST went from 10 PASS → 13 PASS.

**Cache version:** `?v=29` → `?v=30`.

---

## [Unreleased] — 2026-06-10

### 🛠 Autonomous Quality System

**What a maintainer couldn't do yesterday:**
- Conventions for the project lived only in chat history. Each new session re-derived them from scratch.
- A `git push` could ship broken code: `npm test` and `npm run test:smoke` were not enforced before push, only after — and the smoke spec targeted the legacy `index.html` DOM, so it had been silently failing.
- New features could be coded without a written spec, and there was no checklist to prevent quietly touching deferred items (cloud persistence, analytics, push, paid geocoding, freemium, background geofencing).

**What a maintainer can do today:**
- `.kiro/steering/perq.md` is auto-included in every Perq session. Encodes brand system, splash contract, native build cycle, security guardrails, and the explicit "open gaps — do not auto-implement without instruction" list.
- `.kiro/hooks/perq-supervisor.kiro.hook` (preToolUse on shell) intercepts every `git push` and runs five gates: `node --check preview-app.js`, `npm test`, `npm run test:smoke`, cache-bump assertion (`?v=N` advanced if `preview-app.js` changed), and CHANGELOG assertion (entry present unless commit subject is `chore:`/`docs:`/`test:`/`ci:`). Push is blocked on any failure.
- `.kiro/specs/feature-template.md` is the mandatory pre-coding template. Includes an OPEN GAPS CHECKLIST that must be confirmed unchecked before any feature work.
- `tests/perq-smoke.spec.js` rewritten against the current `preview.html` DOM. 6 cold-launch tests now pass (boot splash content + sizes + dismiss + wallet/onboarding visible + tabbar + Perq wordmark mint color).
- `playwright.config.js` simplified — drops the legacy Python http.server `webServer` block; tests load `preview.html` via `file://`.
- `package.json` exposes individual aliases: `test:brand`, `test:splash`, `test:smoke`.
- `.github/workflows/android-build.yml` now runs the brand, splash, and smoke suites in CI before building the APK. Playwright Chromium installs as a separate step.
- `TEST_RESULTS.md` updated 2026-06-10. Suite 1 (`npm test`) = 107 PASS / 0 FAIL across 6 sub-suites. Suite 2 (`npm run test:smoke`) = 6 PASS / 0 FAIL. Honest report on Suite 3 (`tests/perq-agent.test.js`) which is orphaned and has 3 staleness failures unrelated to product correctness.

---

## [Unreleased] — 2026-06-04

### 🆕 Phase 4: Deal Discovery + Enhanced Gamification + Integrations Upgrade

**Crawled Deals:**
- Personalized discovery feed, category chips, crawler backend (every 6h), offline fallback.

**Achievements (10 unlockable, 25 pts each):**
- First Snap, Deal Hoarder, Social Butterfly, Super Saver, Week Warrior, Jackpot Winner, Quick Draw, Autopilot, Deal Claimer, Variety Pack.

**Reward Programs — Enhanced:**
- 3 input modes: Quick Select (11 pre-loaded programs), Login & Sync (opens provider login), Manual.
- Point expiry scheduled notifications at 30 days and 7 days before.
- Known programs: Delta, United, American, Southwest, Marriott, Hilton, IHG, Chase, Amex, Capital One, Citi.

**Loyalty Cards — Enhanced:**
- 2 input modes: Type it in, or 📷 Camera scan (AI reads card name + number).
- Tap-to-expand barcode display for checkout scanning.
- Optional expiry date for membership cards.
- Scanned card image stored for reference.

---

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

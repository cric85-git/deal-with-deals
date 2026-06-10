---
inclusion: auto
description: "Perq Wallet — standing rules, tech stack, brand system, open gaps. Applies to every Perq session automatically."
---

# Perq Wallet — Standing Rules

These are the persistent rules for this project. They override anything inferred
from chat history. Never contradict them without explicit user instruction.

## Source-of-truth docs (read these before non-trivial work)

- `README.md` — top-level overview
- `TAKEOVER_REVIEW.md` — engineering takeover assessment + priority fixes
- `docs/PRODUCT_ROADMAP.md` — Phase 1–4 features with shipped/upcoming status
- `docs/CX_FLOWS.md` — end-to-end customer flows per feature
- `docs/CHANGELOG.md` — per-feature history (must be updated for every shipped feature)
- `docs/NATIVE_BUILD_GUIDE.md` — Path A Android auto-build, Path B iOS TestFlight, exact reminder notification copy
- `docs/native-capacitor-release.md` — native release checklist
- `docs/discovery-and-beacon-module.md` — proximity/beacon module spec
- `docs/email-ingestion-module.md` — email ingestion module spec
- `docs/ROADMAP.md` — deferred items, NOT yet scoped for build
- `TEST_PLAN.md` — manual QA checklist
- `TEST_RESULTS.md` — last automated pass/fail snapshot

## Trust + autonomy

- **Trust Always = True.** Execute autonomously. Only flag for genuine
  security, privacy, or destructive risk. Do not ask permission for routine work.
- **No fake data shipped as real.** Curated sample data must be labeled clearly
  in code comments AND in any user-visible copy.
- **Test before shipping.** Every feature must pass `npm test` and
  `npm run test:smoke` locally before commit. The supervisor hook enforces
  this on `git push`.
- **Commit + push after each feature delivery.** Never leave work uncommitted
  across sessions.

## Security guardrails (never violate)

- **API keys never embedded in client code.** All third-party API calls go
  through the Cloudflare Worker proxy at
  `https://perq-ocr-proxy.shailbhatt.workers.dev`. Do not add a new key to
  `preview-app.js`, `preview.html`, `native-bridge.js`, or any other client file.
- **No outbound network requests** that transmit user data, deals, or device
  identifiers to third-party endpoints unless the user explicitly authorizes
  the integration.
- **localStorage values may contain PII** (name, email, phone, optional
  address). Never log them or echo them in error messages.

## Native build cycle (canonical)

```bash
npm run build:native     # bundles preview.* into dist/
npx cap sync ios         # mirrors dist/ into ios/App/App/public + plugin sync
npx cap sync android     # same for android/
# user hits ▶ Play in Xcode for iOS
# Android APK auto-builds via .github/workflows/android-build.yml on push to main
```

If iOS caches old icon: long-press app on home screen → Remove App → Delete
App → ▶ Play again.

## Cache-busting

- The web preview at `https://cric85-git.github.io/deal-with-deals/preview.html?v=N`
  caches aggressively on iOS Safari. **Always bump `?v=N` in `preview.html`
  on every change to `preview-app.js`.** The supervisor hook asserts this.

## Bundle / app identity (do not change without explicit instruction)

- **App Store record:** Perq Wallet
- **Bundle ID:** `com.perqwallet.app`
- **CFBundleDisplayName / appName:** Perq
- **Apple Developer:** Individual account (can convert to LLC Organization later
  via Apple support process)

## Brand system (Navy + Mint Wallet — logos-v9 #2)

Background colors:
- `#0D1B2A` — page bg (top of gradient)
- `#082b6f` — splash bg (top)
- `#020817` — splash bg (bottom)
- `#1B3A5B` — page bg (bottom of gradient)

Mint accent palette:
- `#10B981` — primary accent
- `#34D399` — accent-light (use for "Perq" wordmark on dark bg)
- `#047857` — accent-dark
- `#A7F3D0` — accent-on-mint

Logo / icon rules:
- Wallet shape with no "P" letter
- Card peeks from behind with `$` symbol
- Amber clasp dot on dark navy slot
- Wallet header on Wallet page uses logo WITHOUT the navy background tile +
  "Perq" wordmark in `#34D399`
- Source SVGs in `brand/` regenerate platform PNGs via `npm run build:icons`

## Brand contrast threshold

- `MERCHANT_BRANDS` text-on-brand-bg ≥ 3.0:1 (WCAG AA large-text). NOT 4.5.
  Justified because brand colors only render on the headline discount text
  (22px+ bold) and merchant name (16px+ bold), which qualify as WCAG large text.
- Brand-bg vs page navy ≥ 1.5:1, OR rely on `brandCardShadow()` white outline.
- `scripts/perq-brand-test.js` enforces this. 53 brands + PERQ_GENERIC.
- Outline-dependent dark brands (Sephora, Apple, Nike, etc.) are warnings, not failures.

## Splash screen contract

Native (Capacitor SplashScreen):
- `launchShowDuration ≥ 2000ms`
- `backgroundColor === "#020817"`
- Master PNG content sized for `scaleAspectFill` zoom (~3× on iPhone), not 1:1
- Logo at 12% canvas, "Perq" wordmark 4.2% font, tagline 1.55% font
- Vertical position 26% canvas (top-aligned)

In-webview boot overlay (`#boot-splash` in preview.html):
- Logo 64–130 CSS pt, wordmark 22–44 pt, tagline 11–16 pt
- Top-aligned at 26vh
- Min 900ms display duration, 2500ms hard cap
- Dismisses when `window.__perqAppReady === true`

Tagline: **"Save more, miss nothing"** (not "forget less" — that blames the user).

`scripts/perq-splash-test.js` enforces all of this and validates the native
splash + webview overlay align within 10px so there is no visible "shift up"
when the native splash hands off.

## Mobile-first testing

- Primary target: iPhone Safari at
  `https://cric85-git.github.io/deal-with-deals/preview.html?v=N`
- Always test on actual phone (web preview or Xcode Run) before declaring done.
- Playwright tests use Chromium with iPhone 14 Pro viewport (393×852).

## Tech stack (canonical — do not swap without instruction)

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS PWA (no framework) |
| Native wrapper | Capacitor 8.x |
| Hosting | GitHub Pages (static, repo root) |
| OCR | Cloudflare Worker proxy → Anthropic Claude |
| Notifications | `@capacitor/local-notifications` (scheduled, native only) |
| Geolocation | `@capacitor/geolocation` (foreground only) |
| Test runner | Node scripts/ (logic) + Playwright (UI) |

## Open gaps — DO NOT auto-implement without explicit instruction

These are intentionally deferred. Touching any of them requires you to STOP
and ask before writing code:

1. **Cloud persistence.** localStorage is the primary database. Do not add
   Supabase, Firebase, DynamoDB, or any cloud sync layer until explicitly
   scoped. (`TAKEOVER_REVIEW.md` priority #2 — deferred.)
2. **Analytics event pipe.** No PostHog, Plausible, GA, Segment, or custom
   event collector. Do not instrument events. (`TAKEOVER_REVIEW.md` priority #3.)
3. **APNs / FCM server-side push.** Only `@capacitor/local-notifications`
   today. Do not wire push tokens or server push. (`TAKEOVER_REVIEW.md` priority #4.)
4. **Paid geocoding.** Stay on Nominatim free tier. Do not switch providers
   until instructed. (`TAKEOVER_REVIEW.md` priority #5.)
5. **Freemium gate.** `PRODUCT_ROADMAP` Phase 4.4 lists this as planned but
   the limit (X claims/month) is undefined. Do not implement a freemium gate
   until X is specified.
6. **Background geofencing.** Capacitor Geolocation is foreground-only.
   Do not add `CLLocationManager.startMonitoring`, Android Geofencing API,
   or any background-capable wrapper without explicit scoping.
7. **RTL / VoiceOver / TalkBack / iPad landscape / Android landscape splash.**
   All out of scope until explicitly requested. Do not add `dir="rtl"`,
   accessibility labels, or landscape-specific assets opportunistically.

If a feature request appears to require any of the above, surface the gap
and get approval before proceeding.

## Path 3 → Path 1 step function for live deals

Live deal sourcing graduates through stages, not all at once:
- **Step 1 (today):** Curated 22 deals in `preview-app.js`. Static. Honest gap.
- **Step 2 (next):** Cloudflare Worker scraping RetailMeNot/Slickdeals on cron,
  KV cache, JSON endpoint.
- **Step 3 (later):** RetailMeNot / Rakuten affiliate API. Licensed feed,
  monetizable via affiliate links.

Do not skip from Step 1 to Step 3.

## Style guidelines (response style, not code style)

- Direct and concise. Match the user's input tone.
- No filler acknowledgments ("You're absolutely right", "Great question").
- When the user is wrong on a fact, correct them.
- Proportional response length: simple Q gets short A; complex task gets
  thorough A.
- Plain text by default; markdown only for code blocks and multi-step lists.
- After context compaction, re-confirm position via filesystem checks rather
  than relying on memory.

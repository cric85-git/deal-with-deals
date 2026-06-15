---
inclusion: auto
description: "Perq Wallet — standing rules, tech stack, brand system, open gaps. Applies to every Perq session automatically."
---

# Perq Wallet — Standing Rules

These are the persistent rules for this project. They override anything inferred
from chat history. Never contradict them without explicit user instruction.

## Project location

- **Local filesystem:** `/Users/itsshail/Kiro-workspace/Perq_Dev/` — this is the
  Kiro workspace root for Perq work. All paths in this document are relative to
  this directory unless otherwise stated.
- **Git repo:** `https://github.com/cric85-git/deal-with-deals` (branch `main`)
- **Live preview URL:** `https://cric85-git.github.io/deal-with-deals/preview.html?v=N`
  (GitHub Pages, served from repo root)
- **Native bundle ID:** `com.perqwallet.app` (iOS + Android via Capacitor)
- **iOS Xcode project:** `ios/App/App.xcodeproj` (Capacitor 6+ uses Swift Package
  Manager — no `.xcworkspace`, no Pods). Open this file directly:
  `open ios/App/App.xcodeproj`
- **Android Studio project:** `android/` (gradle)

If Xcode opens empty after a path change, the IDE has the OLD path cached in
Recent Projects — clear via File → Open Recent → Clear Menu, then open the
correct path. Stale DerivedData at `~/Library/Developer/Xcode/DerivedData/App-*`
can be safely deleted (Xcode regenerates it).

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

## Supervisor hook scope (v5+)

The supervisor and reporter hooks at `.kiro/hooks/perq-supervisor.kiro.hook`
and `.kiro/hooks/perq-supervisor-report.kiro.hook` apply to Perq work
**only**. Both hooks short-circuit at Step 0 with `APPROVE: not in Perq
context — supervisor scope is Perq_Dev only` when the shell command's `cwd`
or the agent's recent work is not under `/Users/itsshail/Kiro-workspace/Perq_Dev`.

In Perq context iff ANY of:
1. Shell `cwd` contains `/Perq_Dev` (substring match)
2. Command text contains the literal token `Perq_Dev`
3. `git rev-parse --show-toplevel` resolves to a path ending in `/Perq_Dev`
   AND `.kiro/steering/perq.md` exists at that root

Outside Perq context the gates are not run, no commands are executed, and no
table is printed. This keeps the hook from interfering with unrelated work
when Kiro's IDE-cached hook config is shared across sessions.

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
- **GitHub PAT must not live in `.git/config` plaintext.** The remote URL in
  `.git/config` should not contain `https://user:github_pat_…@github.com/…`.
  Use macOS keychain credential helper instead:
  `git config credential.helper osxkeychain`. If a PAT was previously embedded
  and pushed in any history, rotate it on github.com → Settings → Developer
  Settings → Tokens before the next push.

## Repo hygiene

- **Keep the repo Perq-only.** Personal/internal documents (resumes, interview
  prep, internal PRFAQs, `.docx` work artifacts) and resume-generation Python
  scripts must never be tracked in `cric85-git/deal-with-deals`. They were
  scrubbed from all 99 historical commits via `git-filter-repo` on 2026-06-10.
- **`.gitignore` enforces this defensively.** The file blocks `Documents/`,
  `generate_*.py`, `*.docx`, `~$*.docx` from being added back. Do not weaken
  these patterns.
- **Force-push leaves dangling commits on GitHub for ~90 days.** They remain
  fetchable by direct SHA URL until GitHub's GC runs. For sensitive force-push
  scrubs, file a GitHub Support request asking for immediate ref expiry.
- **Local-only artifacts.** The user's resumes, interview docs, and
  generate_*.py scripts live at `/Users/itsshail/Kiro-workspace/Documents/`
  and `/Users/itsshail/Kiro-workspace/` (one level up from `Perq_Dev/`). Do
  not move them into `Perq_Dev/`.

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

Two independent invalidation mechanisms — BOTH must be honored:

1. **`?v=N` in `preview.html`** — bump on every change to `preview-app.js`. The
   web preview at `https://cric85-git.github.io/deal-with-deals/preview.html?v=N`
   caches aggressively on iOS Safari. Gate 4A.1 in the supervisor hook enforces
   this when `preview-app.js` is in the diff. Current value: see the `<script>`
   tag at the bottom of `preview.html`.
2. **`CACHE_NAME` in `sw.js`** — bump for ANY non-`preview-app.js` change that
   ships to users (preview.html structure, sw.js itself, splash assets, etc.).
   The Service Worker uses this name to invalidate its precache. Naming
   convention: `perq-vN-<feature-tag>` (e.g., `perq-v35-boot-logo-transparent`).
   Gate 4A.2 enforces this when any non-preview-app.js file is modified.

## Bundle / app identity (do not change without explicit instruction)

- **App Store record:** Perq Wallet
- **Bundle ID:** `com.perqwallet.app`
- **CFBundleDisplayName / appName:** Perq
- **Apple Developer:** Individual account (can convert to LLC Organization later
  via Apple support process)

## Brand system (Navy + Mint Wallet — logos-v9 #2)

Background colors (canonical, post splash-unified-gradient):
- `#0D1B2A` — page bg (top of gradient) — also used as
  `SplashScreen.backgroundColor` in `capacitor.config.json`
- `#1B3A5B` — page bg (bottom of gradient)
- All three surfaces (native master PNG, in-webview boot overlay, app body)
  use the same `linear-gradient(180deg, #0D1B2A 0%, #1B3A5B 100%)`. There is
  no longer a separate "splash bg" palette — the original `#082b6f` / `#020817`
  tokens were retired when the gradient was unified to eliminate color shift
  on splash → wallet handoff.

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

The boot sequence has THREE surfaces in order: native splash (Capacitor) →
in-webview boot overlay (`#boot-splash` in preview.html) → app body. All three
share the same gradient and the same logo artwork to ensure zero visible shift.

### Native splash (Capacitor SplashScreen)
- `launchShowDuration: 2530ms` (must be ≥ 2000ms — gives a deliberate brand
  frame, not a sub-100ms flash)
- `backgroundColor: "#0D1B2A"` (top of wallet body gradient — matches what user
  lands on after splash)
- Master PNG: 2732×2732 PNG generated by `scripts/build-splash.js`, copied to
  35 platform locations (iOS Splash.imageset @1x/@2x/@3x light+dark + Android
  drawables port/land × ldpi…xxxhdpi × default/night)
- Master PNG background: `linear-gradient(180deg, #0D1B2A 0%, #1B3A5B 100%)`
- Master PNG content sized for `scaleAspectFill` zoom (~3× on iPhone), not 1:1
- Master layout (% of 2732 canvas): logo 12% width, "Perq" wordmark 4.2% font,
  tagline 1.55% font, vertical position 26% from top (top-aligned)

### In-webview boot overlay (`#boot-splash` in preview.html)
- Logo: `<img src="data:image/svg+xml;utf8,<svg ...>...</svg>" width="104" height="104">`
  — inline SVG embedded as a data URI in the IMG src. NO external file fetch
  at runtime. The SVG content is the same wallet artwork used by the native
  master in `scripts/build-splash.js`. Why a data URI instead of an external
  file: data URIs are immune to Service Worker stale-cache misses, file-move
  breakage, and 404 risk during deploy. The browser decodes the SVG to a
  single bitmap before paint, so the "progressive paint" glitch of inline
  `<svg>` elements is also avoided. **Do NOT switch to `<img src="icon-192.png">`**
  — that's the PWA launcher icon with white square padding designed for iOS
  rounded-corner / Android adaptive masks; on the dark splash background the
  white padding shows as a frame artifact. **Do NOT switch to a separate PNG
  file like `boot-logo.png`** — every external file is a chance for SW cache
  miss to break the splash for users on stale clients.
- Wordmark "Perq" at 34px, font-weight 800 (NOT 850 — non-standard weights
  round inconsistently between iOS Safari and Chromium)
- Tagline 13px, color `rgba(255,255,255,0.72)`
- `padding-top: 26vh` — aligns the visible logo content (which sits in the
  central 56% of the SVG viewBox) with the native master's logo at y=240.
  Splash test enforces ≤ 10px drift between the two surfaces.
- Background: same wallet gradient as body and native master
- `transform: translateZ(0)` — GPU-promoted compositor layer for clean first paint
- No CSS `transition` declared — fade-out is applied inline at dismiss time
  (350ms ease) so first-paint has nothing to animate away
- Min display: 2000ms (`MIN_MS` in dismiss script). Hard cap: 2500ms (`MAX_MS`).
  Dismisses when `window.__perqAppReady === true` AND elapsed ≥ MIN_MS.

### App body
- Body background must match the boot overlay's first-paint color so the
  dismissal transition reveals an identical frame underneath. Currently set
  via `--bg: #0D1B2A` on `<html>,body`.

### Tagline
**"Save more, miss nothing"** (not "forget less" — that blames the user).

### Test coverage
`scripts/perq-splash-test.js` enforces:
- Native config: `launchShowDuration ≥ 2000`, `backgroundColor === '#0D1B2A'`
- Boot overlay: logo 64–130 CSS pt, wordmark 22–44 pt, tagline 11–16 pt,
  top-aligned in upper half of viewport
- Native master: logo + word areas have actual rendered content (delta vs bg
  ≥ 30 in pixel value)
- Cross-surface alignment: native master logo top vs boot overlay logo top
  drift ≤ 10px (currently 1px)

Total: 18 PASS / 0 FAIL.

## Mobile-first testing

- Primary target: iPhone Safari at
  `https://cric85-git.github.io/deal-with-deals/preview.html?v=N`
- Always test on actual phone (web preview or Xcode Run) before declaring done.
- Playwright tests use Chromium with iPhone 14 Pro viewport (393×852).

## Tech stack (canonical — do not swap without instruction)

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS PWA (no framework) |
| Native wrapper | Capacitor 8.x (iOS uses Swift Package Manager — no CocoaPods) |
| Hosting | GitHub Pages (static, served from repo root of `cric85-git/deal-with-deals`) |
| OCR | Cloudflare Worker proxy → Anthropic Claude |
| Notifications | `@capacitor/local-notifications` (scheduled, native only) |
| Geolocation | `@capacitor/geolocation` (foreground only) |
| Test runner | Node scripts/ (logic) + Playwright (UI smoke) |
| Service Worker | `sw.js` at repo root — precaches PWA shell + static assets |

### Splash asset generation
| Script | Output | Purpose |
|---|---|---|
| `scripts/build-splash.js` | 35 platform PNGs (iOS Splash.imageset + Android drawables) at 2732×2732 | Native Capacitor splash master |
| `scripts/build-boot-logo.js` | `boot-logo.png` at repo root, 208×208 RGBA, transparent bg | In-webview boot overlay logo |
| `npm run build:icons` | iOS + Android launcher icon sets from `brand/` SVGs | PWA + native app icons |

### Test scripts
| Script | Coverage |
|---|---|
| `scripts/perq-gamif-test.js` | Rewards / streak / spin-wheel logic (20 cases) |
| `scripts/perq-load-test.js` | App boot under cold-cache / large-fixture (PASS/FAIL) |
| `scripts/perq-migration-test.js` | localStorage schema migrations across versions (6 cases) |
| `scripts/perq-render-test.js` | DOM render of cards, headers, modals (51 cases) |
| `scripts/perq-brand-test.js` | Merchant brand contrast vs page navy (53 + 9 outline-warn) |
| `scripts/perq-splash-test.js` | Native + boot overlay layout, alignment, timing (18 cases) |
| `tests/perq-smoke.spec.js` | Playwright end-to-end smoke (6 cases) |
**Total:** 148 node + 6 smoke. Both run on every push via the supervisor hook.

## Open gaps — DO NOT auto-implement without explicit instruction

These are intentionally deferred. Touching any of them requires you to STOP
and ask before writing code:

1. **Cloud persistence.** localStorage is the primary database. Do not add
   Supabase, Firebase, DynamoDB, or any cloud sync layer until explicitly
   scoped. (`TAKEOVER_REVIEW.md` priority #2 — deferred.)
2. **Analytics event pipe.** No PostHog, Plausible, GA, Segment, or custom
   event collector. Do not instrument events. (`TAKEOVER_REVIEW.md` priority #3.)
   - **Local-only counters are NOT an event pipe.** `state.metrics` (a flat
     map of integers persisted to localStorage and surfaced to the user via
     Settings → Activity stats) is a UX feature, not an analytics pipe. It
     does not transmit data anywhere; the user owns it. Spec:
     `feature-action-counters`. Do not tear out `bumpMetric()` or related
     code under the impression it violates this rule.
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

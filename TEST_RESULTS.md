# Perq Automated Test Results

Last run: 2026-06-10 (post splash-raster-logo — boot overlay logo switched from inline SVG to icon-192.png raster, padding-top tuned to 28vh to align with native master PNG within 1px)

## Suite 1 — `npm test` (Node script suite, runs in CI on every push)

| Test | PASS | FAIL |
|---|---:|---:|
| `scripts/perq-gamif-test.js` | 20 | 0 |
| `scripts/perq-load-test.js` | LOAD OK | 0 |
| `scripts/perq-migration-test.js` | 6 | 0 |
| `scripts/perq-render-test.js` | 51 | 0 |
| `scripts/perq-brand-test.js` | 53 (+ 9 outline-warn) | 0 |
| `scripts/perq-splash-test.js` | 18 — boot overlay raster logo at y=239px aligns with native splash y=240px (delta 1px, tolerance 10px) | 0 |

**Suite 1 total: 112 PASS, 0 FAIL.** (Was 107 PASS at supervisor v1 deploy → +5 from the two new features.)

## Suite 2 — `npm run test:smoke` (Playwright, runs in CI on every push)

| Test | Status |
|---|---:|
| Cold launch shows boot splash with brand wordmark + tagline | PASS |
| Boot splash dismisses cleanly within 3s when app signals ready | PASS |
| Document title is Perq | PASS |
| After dismiss, wallet OR onboarding is visible (no black screen) | PASS |
| Wallet page header renders Perq wordmark in mint | PASS |
| Tab bar shows 4 tabs (Wallet, Browse, Rewards, Community) plus snap | PASS |

**Suite 2 total: 6 PASS, 0 FAIL.**

## Test count delta since last result

| Date | npm test | test:smoke | Notes |
|---|---:|---:|---|
| 2026-06-04 | (legacy 18-test agent suite, now orphaned) | n/a | Original baseline |
| 2026-06-10 (autonomous-quality-system) | 107 | 6 | After supervisor v1 deploy + smoke rewrite |
| 2026-06-10 (deal-detail-modal) | 110 | 6 | +3 render cases for `viewWalletDeal` |
| 2026-06-10 (share-deal-button) | 112 | 6 | +2 render cases for `shareDealFromModal` |
| 2026-06-10 (supervisor-v2) | 112 | 6 | Hook-only change; no test count delta |

## Suite 3 — `tests/perq-agent.test.js` (legacy Node assertion suite)

**NOT in `npm test`. Currently orphaned.** This is the suite that produced the
2026-06-04 18-test snapshot. Three tests fail today because the codebase has
evolved past their original assertions:

| Test | Status | Notes |
|---|---:|---|
| Budget Lawncare OCR fixture extracts 2 separate wallet cards | PASS | |
| CarSpa URL-only import returns multiple offers, not a generic card | PASS | |
| CarSpa page text fixture extracts Valid Thru date syntax | PASS | |
| Expiry aliases normalize correctly | PASS | |
| PWA metadata still brands as Perq and exposes share target | PASS | |
| **PWA uses only approved root icon files** | **FAIL** | Test's allow-list rejects icon-maskable-512.png and apple-touch-icon.png. |
| Header and splash render approved image assets | PASS | |
| Splash has a fail-safe hide path | PASS | |
| Service worker bumps cache and purges older caches | PASS | (No SW in current repo; test passes against a synthetic check.) |
| First-run profile captures identity, preferences, and email connect intent | PASS | |
| Deal capture stores mandatory payload fields | PASS | |
| Beacon alerts are configurable and notify nearby unexpired deals | PASS | |
| Capacitor config packages Perq for native iOS and Android | PASS | |
| **Native build keeps root Pages static and injects Capacitor only into dist** | **FAIL** | Asserts `app.js` exists in `dist/`; current build uses `preview-app.js`. |
| Native projects carry Perq package names and required permissions | PASS | |
| Legacy brand terms are absent from app-facing files | PASS | |
| **Stale generated logo assets are not referenced** | **FAIL** | Scans for orphaned manifest references; the current dist/native paths legitimately reference manifest.json. |
| Photo capture entry is click-driven | PASS | |

**Suite 3 total: 15 PASS, 3 FAIL.**

The 3 failures are test-staleness, NOT product regressions. They predate the
brand-color refactor, the splash work, and the native port.

**Action: rewrite `tests/perq-agent.test.js` against current codebase, or fold
the still-relevant assertions into a new `scripts/perq-agent-test.js` and add
to `npm test`.** Tracked in `docs/ROADMAP.md` § Testing & Observability.

## Local environment

- macOS darwin
- Node 24.13.0
- Playwright 1.60.0 (chromium 1223 cached)
- Run command: `npm test && npm run test:smoke`

## CI integration

The `npm test` and `npm run test:smoke` suites both run as required steps
in `.github/workflows/android-build.yml`. A failure in either blocks the
Android APK build and prevents a release from being published.

The `.kiro/hooks/perq-supervisor.kiro.hook` (v2 — 2026-06-10) enforces gates
locally on `git push`:

- Gate 1 — node --check preview-app.js
- Gate 2 — npm test
- Gate 3 — npm run test:smoke
- Gate 4A — Cache & Asset Integrity (cache buster, service worker version, no orphan assets)
- Gate 4B — Test Coverage (every new function referenced by a test, edge case categories,
  new test files wired into both `npm test` and CI workflow, smoke ran, ≥80% coverage on
  new top-level functions, TEST_RESULTS.md freshness)
- Gate 5 — CHANGELOG entry (or `chore:`/`docs:`/`test:`/`ci:` exempt scope)

A cache bump alone does NOT satisfy Gate 4B. Both 4A and 4B must pass independently.

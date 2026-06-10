# Perq Automated Test Results

Last run: 2026-06-10 (autonomous quality system deployment)

## Suite 1 — `npm test` (Node script suite, runs in CI on every push)

| Test | PASS | FAIL |
|---|---:|---:|
| `scripts/perq-gamif-test.js` | 20 | 0 |
| `scripts/perq-load-test.js` | LOAD OK | 0 |
| `scripts/perq-migration-test.js` | 6 | 0 |
| `scripts/perq-render-test.js` | 10 | 0 |
| `scripts/perq-brand-test.js` | 53 (+ 9 outline-warn) | 0 |
| `scripts/perq-splash-test.js` | 18 | 0 |

**Suite 1 total: 107 PASS, 0 FAIL.**

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

## Suite 3 — `tests/perq-agent.test.js` (legacy Node assertion suite)

**NOT in `npm test`. Currently orphaned.** This is the suite that produced the
2026-06-04 18-test snapshot. Three of those tests are now failing because the
codebase has evolved past their original assertions:

| Test | Status | Notes |
|---|---:|---|
| Budget Lawncare OCR fixture extracts 2 separate wallet cards | PASS | |
| CarSpa URL-only import returns multiple offers, not a generic card | PASS | |
| CarSpa page text fixture extracts Valid Thru date syntax | PASS | |
| Expiry aliases normalize correctly | PASS | |
| PWA metadata still brands as Perq and exposes share target | PASS | |
| **PWA uses only approved root icon files** | **FAIL** | Asserts an exact set of root icons; current build adds `icon-maskable-512.png` and `apple-touch-icon.png` that the test's allow-list rejects. Test needs widening. |
| Header and splash render approved image assets | PASS | |
| Splash has a fail-safe hide path | PASS | |
| Service worker bumps cache and purges older caches | PASS | |
| First-run profile captures identity, preferences, and email connect intent | PASS | |
| Deal capture stores mandatory payload fields | PASS | |
| Beacon alerts are configurable and notify nearby unexpired deals | PASS | |
| Capacitor config packages Perq for native iOS and Android | PASS | |
| **Native build keeps root Pages static and injects Capacitor only into dist** | **FAIL** | Asserts `app.js` exists in `dist/`; current build uses `preview-app.js`. Test references the legacy filename. |
| Native projects carry Perq package names and required permissions | PASS | |
| Legacy brand terms are absent from app-facing files | PASS | |
| **Stale generated logo assets are not referenced** | **FAIL** | Test scans for orphaned manifest references; current code legitimately references `manifest.json` from the dist + native asset paths. Test needs to allow current paths. |
| Photo capture entry is click-driven | PASS | |

**Suite 3 total: 15 PASS, 3 FAIL.**

The 3 failures here are test-staleness, NOT product regressions. They predate
the brand-color refactor, the splash work, and the native port. The failing
assertions are stale references to `app.js` (now `preview-app.js`) and an
icon allow-list that hasn't been updated.

**Action: rewrite `tests/perq-agent.test.js` against current codebase, or fold
the still-relevant assertions into a new `scripts/perq-agent-test.js` and add
to `npm test`.** Tracked in `docs/ROADMAP.md` § Testing & Observability.

## Local environment

- macOS darwin
- Node 24.13.0
- Playwright 1.60.0 (chromium 1223 cached)
- Run command: `npm test && npm run test:smoke`

## Tracked but not run as part of the gate

- `TEST_PLAN.md` — manual QA checklist (73 bullet items)
- `tests/perq-agent.test.js` — see Suite 3 above; orphaned

## CI integration

The `npm test` and `npm run test:smoke` suites both run as required steps
in `.github/workflows/android-build.yml`. A failure in either blocks the
Android APK build and prevents a release from being published.

The `.kiro/hooks/perq-supervisor.kiro.hook` enforces the same gates locally
on `git push` so failures surface before they hit CI.

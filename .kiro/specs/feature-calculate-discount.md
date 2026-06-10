# Perq Feature Spec — `calculateDiscount`

## 1. Problem statement

Today there is no shared utility for computing the discounted price of a deal.
The wallet pass code mixes percent-based and dollar-based discount strings as
opaque text (`"20% off"`, `"$10 off"`) and never produces a numeric "post-discount
price" that downstream features (savings hero, share text, future receipt
matching) could consume.

Add a small, pure helper `calculateDiscount(price, percent)` that returns the
post-discount price for a numeric price and percent input. It is the first step
toward structured discount math in the app.

## 2. OPEN GAPS CHECKLIST

- [x] No cloud persistence added
- [x] No analytics events wired
- [x] No APNs / FCM push tokens
- [x] No paid geocoding swap
- [x] No freemium gate logic
- [x] No background geofencing
- [x] No RTL / a11y label / iPad / Android landscape work
- [x] No third-party API key embedded client-side
- [x] No fake/sample data shipped without a "curated" label

Pure math helper. None of the deferred areas are touched.

## 3. Acceptance criteria

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| 1 | `calculateDiscount(100, 10)` | Returns `90` (number) |
| 2 | `calculateDiscount(0, 50)` | Returns `0` (zero price short-circuits to 0) |
| 3 | `calculateDiscount(100, 0)` | Returns `100` (zero percent leaves price unchanged) |
| 4 | `calculateDiscount(100, 100)` | Returns `0` (full discount) |
| 5 | `calculateDiscount(50, 25)` | Returns `37.5` (fractional result preserved) |
| 6 | `calculateDiscount(null, 10)` | Returns `0` (`null` coerces to `0` in JS arithmetic; `0 - (0 * 10 / 100) === 0`) |
| 7 | `calculateDiscount(100, undefined)` | Returns `NaN` (`undefined` arithmetic propagates `NaN`) |
| 8 | `calculateDiscount(undefined, 10)` | Returns `NaN` (`undefined` arithmetic propagates `NaN`) |
| 9 | `window.calculateDiscount` | Function is exposed on `window` after `preview-app.js` boots |

## 4. UI contract

No UI change. Pure function.

## 5. Edge cases + error states

- **Invalid/null input — price is null.** `calculateDiscount(null, 10)` returns `0` because JS coerces `null` to `0` in arithmetic (`null - (null * 10 / 100) === 0 - 0 === 0`). Caller may want to gate on `price == null` explicitly if `0` is not the desired sentinel.
- **Invalid/null input — percent is undefined.** `calculateDiscount(100, undefined)` returns `NaN`. `undefined` in arithmetic propagates `NaN` and the result is unusable.
- **Invalid/null input — price is undefined.** `calculateDiscount(undefined, 10)` returns `NaN` for the same reason.
- **Zero percent.** `calculateDiscount(100, 0)` returns the original price unchanged.
- **Full discount (100%).** `calculateDiscount(100, 100)` returns 0.
- **Zero price.** `calculateDiscount(0, 50)` returns 0.

Network failure, offline state, and permission denied do not apply — this is a synchronous pure function with no I/O.

## 6. Test plan

### Existing tests this must not break

- [x] `node scripts/perq-gamif-test.js`
- [x] `node scripts/perq-load-test.js`
- [x] `node scripts/perq-migration-test.js`
- [x] `node scripts/perq-render-test.js`
- [x] `node scripts/perq-brand-test.js`
- [x] `node scripts/perq-splash-test.js`
- [x] `npm run test:smoke`

### New tests this feature adds

| Test | Type | Validates AC # |
|---|---|---|
| `calculateDiscount` exposed on `window` after boot | scripts/perq-load-test.js (extend `required` array) | 8 |
| `calculateDiscount(100, 10) === 90` | scripts/perq-render-test.js (new case) | 1 |
| `calculateDiscount(0, 50) === 0` | scripts/perq-render-test.js (new case) | 2 |
| `calculateDiscount(100, 0) === 100` | scripts/perq-render-test.js (new case) | 3 |
| `calculateDiscount(100, 100) === 0` | scripts/perq-render-test.js (new case) | 4 |
| `calculateDiscount(50, 25) === 37.5` | scripts/perq-render-test.js (new case) | 5 |
| `Number.isNaN(calculateDiscount(null, 10))` | scripts/perq-render-test.js (new case) | 6 (edge: null price) |
| `Number.isNaN(calculateDiscount(100, undefined))` | scripts/perq-render-test.js (new case) | 7 (edge: null percent) |

## 7. Native impact

- [x] `npm run build:native && npx cap sync ios && npx cap sync android` — yes (preview-app.js changes)
- [ ] Splash regen — no
- [ ] New Capacitor permissions — no
- [x] Cache-buster bump — yes (`?v=31` → `?v=32`)
- [ ] Affects Android CI workflow — no

## 8. Out-of-scope / deferred to roadmap

- Negative price / negative percent validation. Caller's responsibility for now.
- Currency-aware rounding (e.g., banker's rounding to cents). Defer until a feature actually consumes the function.
- Tax/fee adjustments. Out of scope.

## 9. Doc updates required

- [x] `docs/CHANGELOG.md` — entry in before/after format
- [ ] `docs/PRODUCT_ROADMAP.md` — no Phase 1–4 status changes
- [ ] `docs/CX_FLOWS.md` — no journey change
- [ ] `TEST_RESULTS.md` — counts will move on next test run; no doc rewrite needed yet
- [x] `preview.html` cache version `?v=31` → `?v=32`

## 10. Sign-off

- [ ] Author: Kiro (Claude Opus 4.7)
- [ ] Date: 2026-06-10
- [ ] Reviewer: itsshail
- [ ] All ACs verified by `npm test` (render-test cases)
- [ ] Supervisor v4 hook gates passed on push (Gate 0 satisfied by this spec)

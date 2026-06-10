# Perq Feature Spec — Deal form: discount as number+symbol, expiry as Y/N gate

## 1. Problem statement

The "Review & save" deal form (used after OCR scan and from "Type a deal" manual entry) takes discount as a single free-form text field (e.g. `"20% off"`). This produces three real problems:

1. The form does not distinguish between percent discounts and dollar-off discounts. A `$10 off $50` deal is structurally different from a `20% off` deal — the former gives you the dollar value directly; the latter needs the original price to compute savings. Today the form has a separate `Value ($)` input that the user has to fill manually for both, even though for `$` deals the discount number IS the value.
2. The form's `Expires` date field is rendered as an empty `<input type="date">` and is treated as optional. Real deals almost always have an expiry, and the proximity/reminder system depends on it. Users skip it because the field doesn't surface that it matters.
3. The free-form `Discount *` text field accepts garbage strings (`"twenty bucks"`) and ships them straight into the wallet pass, breaking downstream rendering.

This spec replaces both fields with structured inputs that produce a clean `{discount, value, expiry}` triple.

## 2. OPEN GAPS CHECKLIST

- [x] No cloud persistence added
- [x] No analytics events wired
- [x] No APNs / FCM push tokens
- [x] No paid geocoding swap
- [x] No freemium gate logic
- [x] No background geofencing
- [x] No RTL / a11y label / iPad / Android landscape work
- [x] No third-party API key embedded client-side
- [x] No fake/sample data shipped without "curated" label

Pure form refactor. None of the deferred areas are touched.

## 3. Acceptance criteria

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| 1 | User opens "Review & save" form | Discount row shows: a $/% segmented toggle (default `$`) + a number input + (when `%` selected) a "Total value ($)" input; the discount text field from the previous version is gone |
| 2 | User opens "Review & save" form | Expiry row shows: "Has expiry?" Yes/No segmented toggle (default `No`) + (when `Yes` selected) a date input; the always-shown date field from the previous version is gone |
| 3 | User taps `$` in the symbol toggle | "Total value ($)" input is hidden; discount number IS the value |
| 4 | User taps `%` in the symbol toggle | "Total value ($)" input becomes visible and required |
| 5 | User taps `No` for "Has expiry?" | Date input is hidden; saved deal has `expiry: ''` |
| 6 | User taps `Yes` for "Has expiry?" | Date input becomes visible and required |
| 7 | User taps "Save deal" with empty merchant | Toast `Merchant required`, modal stays open |
| 8 | User taps "Save deal" with empty discount number | Toast `Discount amount required`, modal stays open |
| 9 | User taps "Save deal" with `%` selected and empty Total value | Toast `Total value required for % discounts`, modal stays open |
| 10 | User taps "Save deal" with `Yes` for has-expiry and empty date | Toast `Pick an expiry date`, modal stays open |
| 11 | User taps "Save deal" with `$` symbol, number `10` | Saved deal has `discount: "$10 off"`, `value: 10` |
| 12 | User taps "Save deal" with `%` symbol, number `20`, total value `50` | Saved deal has `discount: "20% off"`, `value: 10` (50 × 0.20) |
| 13 | User taps "Save deal" with `No` for has-expiry | Saved deal has `expiry: ''` |
| 14 | User taps "Save deal" with `Yes` for has-expiry, date `2026-12-31` | Saved deal has `expiry: '2026-12-31'` |
| 15 | OCR pre-fills `data.discount = "20% off"` | Form opens with `%` toggle active, number input pre-filled `20` |
| 16 | OCR pre-fills `data.discount = "$10 off"` | Form opens with `$` toggle active, number input pre-filled `10` |
| 17 | OCR pre-fills `data.expiry = "2026-12-31"` | Form opens with "Has expiry?" set to `Yes`, date input pre-filled |
| 18 | `window.setDiscountSymbol` | Function exposed on `window` after boot |
| 19 | `window.setHasExpiry` | Function exposed on `window` after boot |
| 20 | User taps `Yes` for "Has expiry?" with date input empty | Date input is auto-filled with today's date in `YYYY-MM-DD` format; user can adjust |
| 21 | User opens "Review & save" form with an image (snapped or library-uploaded) | Full image is visible — aspect ratio preserved (`object-fit: contain`), no crop, max-height 320px so the form controls remain reachable below |

## 4. UI contract

### Screen: `modal:dealPreview` (Review & save form)

Discount row:
- Label: `Discount *`
- Two-button segmented toggle: `$` (left) and `%` (right). Width 80px total. Selected state: `var(--accent)` background, `#1A1A1A` text. Unselected: `#F0F0F0` background, `#777` text.
- Adjacent number input: `type="number"`, `inputmode="numeric"`, `min="0"`, `step="0.01"`, placeholder `10` for `$`, `20` for `%`. Width fills remaining row.
- Below the toggle row, conditionally visible: `Total value ($)` labeled number input. Visible only when `%` is selected. Placeholder `50`.

Expiry row:
- Label: `Expires`
- Two-button segmented toggle: `Yes` and `No`. Default `No`.
- Below: `<input type="date">`. Visible only when `Yes` is selected.

Both toggles use `data-active="true|false"` and inline style toggle (no new CSS classes required — keep this surgical).

Validation messages use `toast()` (existing helper). Modal stays open on any failed validation.

The existing `Value ($)` input below `Category` is REMOVED (its function is now subsumed by the symbol-based discount row).

## 5. Edge cases + error states

- **Invalid/null input — empty merchant.** `saveDealForm` reads empty merchant → `toast('Merchant required')`, no save, modal stays open. Existing behavior preserved.
- **Invalid/null input — empty discount number.** New behavior: `toast('Discount amount required')`, no save. The previous form treated `"20% off"` as one string; now we read a number, and an empty/non-numeric number must fail loudly.
- **Invalid/null input — `%` selected but Total value empty.** `toast('Total value required for % discounts')`, no save. Required because we can't compute the dollar value of the savings without it.
- **Invalid/null input — `Yes` for has-expiry but date empty.** `toast('Pick an expiry date')`, no save.
- **Pre-fill from OCR with non-numeric discount string.** If `data.discount` doesn't match either `\d+\s*%` or `\$\s*\d+`, default toggle to `$`, leave number input empty, user must type. No crash.
- **Pre-fill from OCR with `data.expiry` set.** Default has-expiry toggle to `Yes`, prefill date.
- **Pre-fill from OCR with `data.expiry === ''` or undefined.** Default has-expiry toggle to `No`, hide date input.
- **Returning user with pre-existing wallet deals (state.deals already has free-form discount strings).** No migration needed — existing deals keep their stored shape. Only NEW deals saved via this form go through the structured flow.
- **Has-expiry toggle from N → Y with empty date.** `setHasExpiry('Y')` auto-populates the date input with today's date (`YYYY-MM-DD`) when the input is currently empty. If the input already has a value (e.g., from OCR pre-fill or a prior toggle), it is preserved untouched. Users can always override by tapping the date picker.
- **Image preview crops the user's coupon/barcode.** The previous design used `height: 100px` + `object-fit: cover`, which cropped tall coupons and made barcodes unreadable. The new design uses an auto-height container with `object-fit: contain` and `max-height: 320px`, so the full image is always visible while the form controls remain reachable below.

Network failure, offline state, permission denied do not apply — this is a synchronous in-page form with no I/O.

## 6. Test plan

### Existing tests this must not break

- [x] All 6 sub-suites in `npm test`
- [x] `npm run test:smoke`

### New tests this feature adds

| Test | Type | Validates AC # |
|---|---|---|
| `setDiscountSymbol` exposed on `window` | scripts/perq-load-test.js (extend `required`) | 18 |
| `setHasExpiry` exposed on `window` | scripts/perq-load-test.js (extend `required`) | 19 |
| `saveDealForm` rejects empty merchant | scripts/perq-render-test.js (new case) | 7 |
| `saveDealForm` rejects empty discount number | scripts/perq-render-test.js (new case) | 8 (edge: invalid input) |
| `saveDealForm` rejects empty value when `%` | scripts/perq-render-test.js (new case) | 9 (edge: invalid input) |
| `saveDealForm` rejects empty date when has-expiry=Y | scripts/perq-render-test.js (new case) | 10 (edge: invalid input) |
| `saveDealForm` composes `"$10 off"` for `$` symbol, value=10 | scripts/perq-render-test.js (new case) | 11 |
| `saveDealForm` composes `"20% off"` for `%` symbol, computes value=10 from 50×20% | scripts/perq-render-test.js (new case) | 12 |
| `saveDealForm` saves expiry='' when has-expiry=N | scripts/perq-render-test.js (new case) | 13 |
| `saveDealForm` saves the picked expiry date when has-expiry=Y | scripts/perq-render-test.js (new case) | 14 |
| `openDealPreview` non-numeric OCR discount defaults to $ + empty num | scripts/perq-render-test.js (new case) | 15, edge 5 |
| `openDealPreview` pre-fill expiry set → has-expiry=Y, date filled | scripts/perq-render-test.js (new case) | 17, edge 6 |
| `openDealPreview` no expiry → has-expiry=N, date hidden | scripts/perq-render-test.js (new case) | edge 7 |
| Legacy free-form deal does not crash wallet render | scripts/perq-render-test.js (new case) | edge 8 (returning user) |
| `setHasExpiry('Y')` auto-fills date with today when empty | scripts/perq-render-test.js (new case) | 20, edge: today-default |
| `openDealPreview(.., image)` renders full image (object-fit:contain, no 100px height cap) | scripts/perq-render-test.js (new case) | 21, edge: image-no-crop |

## 7. Native impact

- [x] `npm run build:native && npx cap sync ios && npx cap sync android` — yes (preview-app.js changes)
- [ ] Splash regen — no
- [ ] New Capacitor permissions — no
- [x] Cache-buster bump — yes (`?v=32` → `?v=33`)
- [ ] Affects Android CI workflow — no

## 8. Out-of-scope / deferred to roadmap

- BOGO / "buy 2 get 1 free" / free-shipping discount types. Future enhancement; structured BOGO is its own spec.
- Discount math beyond `value = price × percent / 100`. The new `calculateDiscount` helper covers the math; this spec just wires the form to it.
- Migrating existing free-form discount strings in localStorage to the new structured shape. Existing deals keep their string form — no rewrite.

## 9. Doc updates required

- [x] `docs/CHANGELOG.md` — entry in before/after format
- [ ] `docs/PRODUCT_ROADMAP.md` — no Phase 1–4 status changes
- [ ] `docs/CX_FLOWS.md` — minor; this is a form internal change, not a new flow
- [ ] `TEST_RESULTS.md` — counts will move on next run; no rewrite needed
- [x] `preview.html` cache `?v=32` → `?v=33`

## 10. Sign-off

- [ ] Author: Kiro (Claude Opus 4.7)
- [ ] Date: 2026-06-10
- [ ] Reviewer: itsshail
- [ ] All ACs verified by `npm test` + manual eyeball on iPhone Safari at preview URL with `?v=33`
- [ ] Supervisor v4 hook gates passed on push (Gate 0 satisfied by this spec; Gate 4B.2 SPOT-CHECK block emitted)

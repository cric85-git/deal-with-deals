# Perq Feature Spec — Deal Detail Modal

## 1. Problem statement

Today, viewing a saved deal in the wallet uses an inline stacked-card
expand/collapse (`togglePass`). The expanded card shows discount, code, expiry,
and a "Use Now" CTA, but it is visually crowded and there is no clean,
focused, modal-style "deal detail" surface — useful for sharing screenshots,
for reading at a glance in a bright store aisle, and for a future "open from
notification deep link" path.

This spec adds a focused **Deal Detail Modal** that shows the five required
fields and a single "Mark as Used" CTA. Existing inline expand stays —
the modal is a deeper, focused view accessible from the expanded pass.

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

All boxes confirmed clean — pure UI + reuse of existing `redeemDeal()`.

## 3. Acceptance criteria

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| 1 | User taps wallet pass → expanded → taps "Details" link | Deal Detail Modal opens within 100ms |
| 2 | Modal opens | Header shows merchant name (16px+ bold) and discount line (22px+ bold, brand color) |
| 3 | Modal opens | Body shows: deal title (the merchant + discount line as a single visual headline), merchant on its own row, discount on its own row, expiry on its own row formatted "Expires Mon Jun 15" |
| 4 | Deal has no expiry | Expiry row displays "No expiry" in `var(--text-faint)` |
| 5 | Deal expires today | Expiry row displays "Expires today" in `var(--warm-1)` |
| 6 | Deal already expired | Expiry row displays "Expired N days ago" in `var(--warm-1)` |
| 7 | Modal opens | Primary CTA "Mark as Used" is visible, full-width, uses `--accent` mint color |
| 8 | User taps "Mark as Used" | Existing `redeemDeal(id)` runs (points, streak, savings, scheduled-reminder cancel), modal closes, wallet re-renders with the deal moved to redeemed state |
| 9 | Deal is already redeemed | "Mark as Used" CTA is replaced with a disabled "Already used" pill in `var(--text-faint)` |
| 10 | User taps the modal backdrop or the X close button | Modal closes without state change |
| 11 | Modal is open and user presses ESC (web only) | Modal closes |
| 12 | Modal opens for a deal whose merchant is a known brand (e.g., Starbucks) | Header background uses `getBrandFor(merchant)` brand colors with the standard `brandCardShadow()` outline |
| 13 | Modal opens for an unknown-merchant deal | Header background uses `PERQ_GENERIC_BRAND` (mint/emerald) |

## 4. UI contract

### Screen: `modal:dealDetail`

- Modal overlay uses existing `.modal-overlay` + `.modal` shell from `preview.html` (slide-up sheet, dark backdrop, 28px top corners)
- Modal header is a brand-tile (the deal's brand background gradient)
  - Padding: 20px
  - Border radius: 18px
  - Margin-bottom: 16px
  - Outline: `brandCardShadow()` (white 1px + drop shadow)
- Merchant text: 22px, font-weight 800, `brand.text` color
- Discount text: 32px, font-weight 900, `brand.text` color, line-height 1
- Below the brand tile, three info rows in a list (icon + label + value):
  - 🏷️ Merchant — escapes HTML
  - 💰 Discount — escapes HTML
  - 📅 Expiry — formatted per AC #3-#6
- Each info row: 12px vertical padding, 14px text, label uses `var(--text-dim)`, value uses `var(--text)` and is right-aligned
- Primary CTA "Mark as Used":
  - Full-width
  - Padding 14px
  - `linear-gradient(135deg, var(--accent), var(--accent-dark))` background
  - White text, font-weight 800, 15px
  - Border-radius 14px
- Disabled "Already used" state:
  - Same dimensions
  - Background `var(--surface-soft)`
  - Text `var(--text-faint)`
  - `cursor:not-allowed`, no `onclick`
- Close affordance: small X button top-right of modal, 32×32, transparent bg, neutral icon. No text label (icon-only is acceptable here per existing modal conventions).
- All text contrasts must hit ≥ 4.5:1 against their bg per WCAG AA — not relying on the 3.0 large-text exception except inside the brand-tile header where the rule is established for headlines
- Modal max-height stays at 90vh per existing `.modal` rule; content never overflows the safe area

## 5. Edge cases + error states

- Deal id passed to `viewWalletDeal(id)` does not match any deal in `state.deals` → modal does NOT open, `toast('Deal not found')` fires
- Deal has no merchant string → modal shows "Untitled deal" instead of the merchant header
- Deal value is non-numeric → discount line still renders (it's a string field, not value)
- User taps "Mark as Used" on a deal that the migration code may not have stamped a `redeemed` field on → `redeemDeal(id)` already handles this (it sets the field), no special handling needed
- Modal opened from inside a long expanded pass → modal still uses standard `.modal-overlay` z-index (300), which is above pass cards; no z-index conflict
- User opens the modal, the deal expires while it is open (clock crosses midnight) → expiry row will show stale text until next render. Acceptable; not in AC. Do not fix.

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
| `viewWalletDeal` is exposed on `window` after app boot | scripts/perq-load-test.js (extend `required` array) | 1, 8 |
| Calling `viewWalletDeal('nonexistent')` does not throw and does not open a modal | scripts/perq-render-test.js (new case) | edge-case row 1 |
| Calling `viewWalletDeal(id)` for a redeemed deal renders the disabled "Already used" pill | scripts/perq-render-test.js (new case) | 9 |

The Playwright smoke spec stays unchanged — modal interactions inside Wallet
require an onboarded state and a saved deal, which is heavier than the smoke
suite's scope. The 3 new render-test cases cover the JS branches.

## 7. Native impact

- [x] Requires `npm run build:native && npx cap sync ios && npx cap sync android` — yes, because `preview-app.js` changes
- [ ] Requires regenerating splash master — no
- [ ] Requires new Capacitor permissions — no
- [x] Requires cache-buster bump in `preview.html` (`?v=29` → `?v=30`) — yes
- [ ] Affects the Android CI workflow — no

## 8. Out-of-scope / deferred to roadmap

- Deep-link from notification → opens the modal directly. Defer (notification routing isn't in this scope).
- Sharing the modal contents as a screenshot. Defer (existing share flow already covers it).
- Editing the deal from the modal. Defer; user can already edit from the inline expanded pass.
- Inline barcode display in the modal. Defer (existing pass already shows it).

## 9. Doc updates required

- [x] `docs/CHANGELOG.md` — entry in before/after format
- [ ] `docs/PRODUCT_ROADMAP.md` — no Phase 1–4 status changes
- [ ] `docs/CX_FLOWS.md` — no journey change
- [x] `TEST_RESULTS.md` — re-run + update after merge
- [x] Cache version bumped in `preview.html`
- [ ] `.kiro/steering/perq.md` — no rule changes

## 10. Sign-off

- [ ] Author: Kiro (Claude Opus 4.7)
- [ ] Date: 2026-06-10
- [ ] Reviewer: itsshail
- [ ] All ACs verified on iPhone Safari at preview URL with `?v=30`
- [ ] All ACs verified on native (▶ Play in Xcode for iOS)
- [ ] Supervisor hook gates passed on push

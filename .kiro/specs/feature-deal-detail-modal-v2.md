# Perq Feature Spec — Deal Detail Modal v2 + Wallet Card Polish

## 1. Problem statement

The wallet pass card and the saved-deal detail modal are inconsistent and incomplete:

1. **Tap behavior is inline-expand, not the modal.** Tapping a wallet pass currently runs `togglePass(this)` which expands the card inline (replacing the brand background with white, showing buttons stacked). The user prefers the focused modal experience that the ⓘ button opens — they want that to be the default tap target. The inline expand is now redundant noise.
2. **Stacked cards hide the offer.** When wallet passes are stacked (`margin-bottom: -90px`), only the top portion of each card is visible. The discount/offer text and expiry text live in the BOTTOM portion of the card — invisible until you tap to focus. Users have to remember which merchant is which deal.
3. **No expiry urgency at a glance.** A deal expiring tomorrow looks identical to a deal expiring in 90 days when stacked. The reminder system fires push notifications, but the visual fleet view gives no signal.
4. **The detail modal lacks the address row** — even though the deal stores `d.address` and the inline-expanded view renders a tappable Google-Maps link with that exact pattern. The modal that's about to become the default tap target is missing it.
5. **No delete affordance in the modal.** `window.deleteDeal(id)` exists and is wired into the inline expanded view, but the modal lacks a delete button. Once the modal becomes the default, delete is unreachable from the modal entry point.

## 2. OPEN GAPS CHECKLIST

- [x] No cloud persistence added
- [x] No analytics events wired
- [x] No APNs / FCM push tokens
- [x] No paid geocoding swap (uses existing `https://www.google.com/maps/search/?api=1&query=` which Apple Maps and Google Maps both deep-link)
- [x] No freemium gate logic
- [x] No background geofencing
- [x] No RTL / a11y label / iPad / Android landscape work
- [x] No third-party API key embedded client-side
- [x] No fake/sample data shipped without "curated" label

## 3. Acceptance criteria

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| 1 | User taps anywhere on a wallet pass card (the `.wpass` div) | `viewWalletDeal(d.id)` runs — modal opens with the full detail view. The previous `togglePass(this)` inline expand is no longer the tap target. |
| 2 | Wallet pass collapsed view (top portion visible when stacked) | Renders an expiry chip in the top-right area, color-coded by urgency: red bg for "Today" / "Expired", amber bg for ≤3 days, translucent-white for >3 days. Chip is hidden entirely if `d.expiry` is empty. |
| 3 | Wallet pass collapsed view | Renders a one-line offer description (`d.discount` text) directly below the merchant name at 12px, opacity 0.92. Visible on every stacked card without needing to focus. |
| 4 | Saved-deal detail modal (`viewWalletDeal`) — deal has `d.address` | A tappable address row renders below the existing info rows. Maps icon left, address text middle (truncated to 1 line), "Directions" affordance right. Tap opens `https://www.google.com/maps/search/?api=1&query=<encoded>` which Apple Maps recognizes on iOS and Google Maps app handles on Android. |
| 5 | Saved-deal detail modal — deal has no `d.address` | The address row is omitted entirely (no empty placeholder). |
| 6 | Saved-deal detail modal — bottom action area | Below "Mark as Used" and "Share Deal", a third button "Delete deal" is rendered. Outlined red, secondary visual weight. Tap → confirm() → `deleteDeal(d.id)` and the modal closes via the wrapper. |
| 7 | `window.deleteDealFromModal(id)` | Function exposed on `window` after boot. Calls `closeModal()` then `deleteDeal(id)` so the system confirm() and the toast surface cleanly without the modal stack interfering. |

## 4. UI contract

### Wallet pass collapsed (`.pcoll` top section)

Layout (ASCII):
```
┌─────────────────────────────────────────────────┐
│ CATEGORY              [📍 LOCAL] [⏱ 12d left]  │
│ Merchant Name                                   │
│ 20% off entire purchase                         │
│ … (rest hidden under stack)                     │
└─────────────────────────────────────────────────┘
```

- Expiry chip CSS:
  - `<3d` (urgent): `background: rgba(220,38,38,0.95); color: white`
  - `≤3d` (soon): `background: rgba(245,158,11,0.95); color: white`
  - `>3d` (relaxed): `background: rgba(255,255,255,0.25); color: white`
  - Empty `d.expiry`: chip element not rendered
- Offer line: `font-size:12px; font-weight:600; opacity:0.92; margin:3px 0 0` directly under merchant `<h3>`.

### Saved-deal detail modal address row

Mirror the pattern already in the inline expanded view (line ~600 in preview-app.js). Same Google-Maps URL, same icon, same "Directions" affordance. Wrap in `<a target="_blank" rel="noopener" onclick="event.stopPropagation()">` so the modal does not close on tap (the system browser/Maps handler takes over).

### Saved-deal detail modal delete button

- Below "Share Deal".
- Outlined red: `background: transparent; color: #DC2626; border: 2px solid #FFE5E5;` (subtle border, strong text).
- Label: "Delete deal" with trash icon.
- Tap → `deleteDealFromModal(d.id)` → `closeModal()` → existing `deleteDeal(id)` (which prompts native confirm() + toasts on success).

## 5. Edge cases + error states

- **Deal with no expiry.** Chip is omitted; offer line still renders. No crash, no empty pill.
- **Deal with expiry exactly today (`du === 0`).** Chip text "Today", red background.
- **Deal already expired (`du < 0`).** Chip text "Expired", red background. Card is still tappable — modal still opens — user should be able to delete or mark used.
- **Deal with very long discount string (e.g., `"30% off entire site, free shipping over $50"`).** Offer line uses `text-overflow: ellipsis` + `overflow: hidden` + `white-space: nowrap` to one-line truncate. Full string still visible in the modal.
- **Deal with no address.** Modal omits address row entirely. Layout collapses cleanly.
- **Deal with address containing special characters (`'O'Brien's Pub, 123 Main St`).** `encodeURIComponent` handles all special chars including apostrophe, ampersand, slash. The URL is also `escapeHtml`-wrapped to neutralize any embedded `<` `>` `"` in the rendered `<a href="…">`.
- **User taps Delete deal in modal but cancels the system confirm() prompt.** `deleteDeal` returns early when `confirm()` returns false. Modal remains closed (we already called `closeModal()` first). User can re-open by tapping the deal again.
- **User taps a wallet pass that has been redeemed.** Modal still opens. Already-handled in v1: redeemed deals show "Already used" disabled pill instead of "Mark as Used"; share + delete still available.
- **Wallet has zero deals.** `togglePass`/`viewWalletDeal` are not called because no `.wpass` element exists. No regression.
- **Wallet pass tap target conflicts with embedded button taps (Mark redeemed / Share / Delete on the inline-expanded view that still exists in DOM).** Those buttons still use `event.stopPropagation()` so taps on the buttons don't bubble up to the parent `.wpass` and trigger `viewWalletDeal`. Verified by inspecting existing `onclick="event.stopPropagation();..."` patterns.
- **Legacy `togglePass`/`expandPass`/`collapsePass` functions remain in the file but are no longer called from any `onclick`.** Dead code — explicitly preserved (not removed) to avoid breaking any external `onclick` we may have missed in this change. A separate cleanup commit can remove them once we're confident nothing else binds to them.

## 6. Test plan

### Existing tests this must not break

- All AC1-26 from `feature-deal-form-discount-expiry.md` (current spec).
- AC1-3 from `feature-deal-detail-modal.md` (v1 modal spec).

### New tests this feature adds

| Test | Type | Validates AC # |
|---|---|---|
| Wallet pass card `onclick` calls `viewWalletDeal` (not `togglePass`) | render-test (search wallet HTML for `viewWalletDeal('id')` in onclick of `.wpass`) | 1 |
| Wallet pass renders expiry chip when expiry set | render-test (HTML contains expiry chip text like "12d left" or "Today") | 2 |
| Wallet pass omits expiry chip when `d.expiry` is empty | render-test (no chip text in HTML) | edge: no expiry |
| Wallet pass renders one-line offer under merchant | render-test (offer text appears in `.pcoll`) | 3 |
| viewWalletDeal modal renders address row when `d.address` set | render-test (modalHTML contains maps URL + "Directions") | 4 |
| viewWalletDeal modal omits address row when `d.address` absent | render-test (no maps URL in modalHTML) | 5 |
| viewWalletDeal modal renders "Delete deal" button | render-test (modalHTML contains `Delete deal` and `deleteDealFromModal`) | 6 |
| `window.deleteDealFromModal` exposed | load-test (required globals) | 7 |

## 7. Native impact

- [x] `npm run build:native && npx cap sync ios && npx cap sync android` — yes (preview-app.js changes)
- [ ] Splash regen — no
- [ ] New Capacitor permissions — no
- [x] Cache-buster bump — yes (`?v=36` → `?v=37`)
- [x] Service worker bump — yes (`perq-v29-discount-row-inline` → `perq-v30-deal-detail-modal-v2`)
- [ ] Affects Android CI workflow — no

## 8. Out-of-scope / deferred to roadmap

- Removal of dead code paths (`togglePass`, `expandPass`, `collapsePass`, `.pexp` HTML nesting). Kept in place this round to minimize surface area; future cleanup commit can remove once stable.
- iPad-specific layout. The modal already uses the existing `.modal-overlay` slide-up sheet which renders centered on iPad. No additional work scoped here.
- Delete confirmation dialog redesign. Currently uses native `confirm()` which is functional but not branded. A custom confirmation modal is a future polish.

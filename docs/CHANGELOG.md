# Perq — Changelog

All notable feature changes to the Perq app are documented here.

---

## [Unreleased] — 2026-06-10 (splash-raster-logo + repo cleanup)

### 🛠 Fix: splash content glitch — raster logo + body gradient + aligned position

User reported: "background is fine but the glitch is not addressed for splash screen". After the unified-gradient fix removed the color shift, a second-order glitch remained inside the splash content itself — the logo appeared to jitter/redraw during the handoff.

**Three causes diagnosed and fixed:**

1. **Body bg painted solid before overlay covered it.** The `<body>` was `background: var(--bg)` (solid `#0D1B2A`) while the overlay was a gradient. Even though the overlay covers the body when active, the first-paint frame showed the solid before the overlay composited. Switched body to the same gradient so first paint is identical.
2. **Inline SVG logo painted progressively.** The boot overlay logo was an inline `<svg>` with gradient-filled paths. iOS Safari and Chromium can paint SVG paths in stages on first frame. Replaced with `<img src="icon-192.png" width="104" height="104" decoding="sync" loading="eager" fetchpriority="high">`. A raster paints in a single texture upload — no progressive fill possible. Native splash master PNG already uses a raster pipeline, so both phases of the boot now use rasters of the same artwork.
3. **Non-standard `font-weight: 850` rendered inconsistently.** iOS Safari and Chromium round 850 differently against the available font weights for SF Pro Display. Changed boot overlay AND `scripts/build-splash.js` to `font-weight: 800` (a standard weight that maps directly without rounding).

**Bonus alignment fix:** raster `<img>` doesn't have the implicit baseline padding that the inline `<svg>` had, so the logo sat 18px higher than the native master PNG (failing the alignment test's 10px tolerance). Bumped `#boot-splash` `padding-top` from `26vh` to `28vh` — boot overlay logo now at y=239px vs native's y=240px (delta 1px).

**Files:**
- `preview.html` — body background → wallet gradient; boot-splash overlay markup → raster `<img>`; padding-top 26vh → 28vh; font-weight 850 → 800
- `scripts/build-splash.js` — wordmark font-weight 850 → 800. PNG regeneration produced bit-identical output at the rendered resolutions.
- `sw.js` — `CACHE_NAME` bumped to `perq-v34-splash-raster-logo`

**Tests:** 148/148 PASS (gamif 20 / migration 6 / render 51 / brand 53 / splash 18) + smoke 6/6.

### 🧹 Chore: repo cleanup — relocate to `Perq_Dev/`, scrub personal docs from history

Project files relocated from workspace root into a dedicated `Perq_Dev/` subfolder so the Kiro workspace can host non-Perq work alongside without clutter. Git internals moved with the project — the GitHub Pages deploy URL is unchanged.

Personal/internal documents that had been incidentally tracked by the repo (resumes, interview prep, an internal PRFAQ, three resume-generation Python scripts, a stray `.DS_Store`) were scrubbed from ALL commit history via `git-filter-repo` and force-pushed. Local copies remain at `/Users/itsshail/Kiro-workspace/Documents/` outside the repo.

`.gitignore` extended to defensively block `Documents/`, `generate_*.py`, `*.docx` from ever being re-added.

---

## [Released] — 2026-06-10 (splash-unified-gradient)

### 🛠 Fix: unified splash + body gradient — zero color shift on handoff

User reported: "Now the app loads with one gradient and changes to another background gradient which is a darker shade. You are not being consistent here."

**Diagnosis:**
The boot sequence had THREE different background treatments:
1. **Native splash master PNG**: gradient `#082b6f → #020817` (the "splash gradient" tokens from steering)
2. **Boot overlay**: solid `#020817` (after the previous fix)
3. **App body / wallet**: gradient `#0D1B2A → #1B3A5B` (the "page bg" tokens)

So the user saw: dark splash gradient → solid `#020817` → lighter wallet gradient. Three colors, two transitions, both visible to the eye.

**Fix:**
Unified all three to the wallet gradient `linear-gradient(180deg, #0D1B2A 0%, #1B3A5B 100%)`:

- **`scripts/build-splash.js`**: master PNG background changed from `linear-gradient(160deg, #082b6f, #020817)` to `linear-gradient(180deg, #0D1B2A, #1B3A5B)`. Regenerated all 35 platform PNGs (iOS Splash.imageset @1x/@2x/@3x light+dark + Android port/land × ldpi…xxxhdpi × default/night).
- **`preview.html` boot overlay**: changed from solid `#020817` to the wallet gradient.
- **`capacitor.config.json` SplashScreen.backgroundColor**: changed from `#020817` to `#0D1B2A` (top of the wallet gradient — used as the fallback fill behind the master PNG, but with `scaleAspectFill` the image fills the screen so this is mostly invisible).
- **`scripts/perq-splash-test.js`**: updated expected `backgroundColor` to `#0D1B2A`. Updated the synthetic native-splash-mock fixtures (which simulate `scaleAspectFill` for the alignment test) to the new color.
- **`.kiro/steering/perq.md` splash contract**: updated documentation to reflect the unified gradient.

**Result:**
Native splash → boot overlay → wallet body now share the EXACT same gradient. The only "change" the user sees is the dismiss fade-out animation of the boot overlay revealing identical colors underneath. Zero color shift. The user's complaint is resolved.

**The `#082b6f` and `#020817` "splash bg" tokens in the steering color palette are now legacy** — kept in the palette section for historical reference but no longer used at runtime. A future cleanup commit can remove them once we're sure no other code references them.

**Splash test still 18/18:**
- Native splash logo top edge at y=240px (28% of viewport)
- Webview overlay logo top edge at y=241px (28% of viewport)
- Aligned within 1px — handoff invisible
- Logo 104px, wordmark 34px, tagline 13px — all unchanged

**Cache version:** `?v=39` → `?v=40`. SW `perq-v32-splash-no-glitch` → `perq-v33-splash-unified-gradient`. Native build + cap sync ios/android complete (all 35 master PNGs regenerated and synced).

---

## [Unreleased] — 2026-06-10 (splash-no-glitch)

### 🛠 Fix: splash screen rendering glitch on load

The user reported the splash had "some animation on it and when it loads up, it appears like a glitch." Three root causes, all fixed:

**1. CSS transition firing on initial paint.**
- `#boot-splash{transition:opacity .35s ease}` was declared at the CSS level, which on some Safari versions fires a transition during the very first opacity computation — visible as a fade-in flash.
- Fix: removed `transition` from CSS entirely. The transition is now applied INLINE via `splash.style.transition='opacity 350ms ease'` only when `dismiss()` runs. Initial render has no transition declared, so there's nothing for the browser to animate on first paint.
- Also removed the `#boot-splash.hide{opacity:0}` rule. Dismiss now sets opacity inline directly.

**2. SVG drop-shadow filter painting progressively.**
- The wallet path used `<filter><feDropShadow dx=0 dy=14 stdDeviation=14 flood-opacity=0.4></filter>`. iOS Safari renders SVG filters in multiple compositor passes — the wallet visibly "fills in" over 2-3 frames, which reads as a glitch animation.
- Fix: removed the `<filter>` definition and the `filter="url(#bs-shadow)"` reference on the wallet path. The wallet is now a flat gradient-filled shape that paints in a single composite pass. The drop-shadow was decorative, not structural — the brand identity is preserved by the wallet color, the card peeking out, and the amber clasp dot.

**3. Linear gradient background painting incrementally.**
- `background:linear-gradient(160deg,#082b6f 0%,#020817 100%)` had two color stops. iOS sometimes paints gradient stops in two passes when the layer isn't GPU-promoted.
- Fix: switched to solid `background:#020817`. This also gives **perfect color continuity** with the native splash (which uses solid `#020817` per `capacitor.config.json`). Native → webview handoff now has zero color shift.
- Added `transform:translateZ(0); -webkit-transform:translateZ(0)` to GPU-promote the layer so the entire splash composes in one pass.

**Splash test still passes 18/18:**
- Logo size 104px ✓
- Wordmark 34px ✓
- Tagline 13px ✓
- Visible within 1s, dismissed within 3s ✓
- Native + webview alignment within 1px (now y=240 native, y=241 webview — same as before) ✓

**No new globals. No new tests** — the fix is purely a CSS/markup tightening; no new behavior to assert. The existing 18 splash assertions cover the load, visibility, alignment, and dismiss timing comprehensively.

**Cache version:** `?v=38` → `?v=39`. SW `perq-v31-image-align-splash` → `perq-v32-splash-no-glitch`. Native build + cap sync ios/android complete.

---

## [Unreleased] — 2026-06-10 (image-align-splash)

### 🛠 Fix: image right-shift on snap + splash visible for 2 seconds

Two scoped fixes. No new globals.

**Issue 1 — image right-shift after snap:**
- The `dealImageFrame` wrapper used `display:flex; justify-content:center; align-items:center`. On iOS Safari, an `<img width:100%; display:block>` inside that flex container rendered with a 1-2px right offset on the first paint after a fresh camera capture. Subsequent re-renders (after re-opening the form) cleared the offset, but the user saw the shift on the canonical "snap → preview" flow.
- Switched the wrapper to plain `display:block`. Image still fills 100% width edge-to-edge with `display:block`, and the absolute-positioned Expand pill in the corner is unaffected. The Expand pill button itself still uses `display:flex` internally for its icon + label — that's unchanged.

**Issue 2 — splash glitch:**
- The in-webview boot overlay (`#boot-splash` in preview.html) had `MIN_MS = 900ms` — meaning the brand frame stayed visible for only ~900ms after the native splash hid. Combined with the native splash's 2530ms duration, the total brand exposure was ~3.4s but with a perceptible handoff blip in the middle, and the boot overlay phase felt rushed.
- Bumped `MIN_MS` to 2000ms. Boot overlay now stays visible for a deliberate 2 seconds after handoff. The 350ms CSS opacity fade-out on dismiss is unchanged — already smooth. Native + webview alignment was already within 1px (per splash-test) so the handoff itself is invisible; the user complaint was about the boot phase being too brief, not about misalignment.
- `MAX_MS` stays at 2500 — hard cap unchanged. Splash test's "dismissed cleanly within 3s" assertion still passes (dismiss now happens at 2000ms + 400ms removal = 2400ms, comfortably within the 3000ms window).

**Test added (1 case, assertion-bearing):**
- `scripts/perq-render-test.js` — image frame wrapper slice (between `id="deal-form-img"` and `alt="Deal image"`) does NOT contain `display:flex`. Scoped assertion so the Expand pill's internal flex is not flagged. RENDER 50 → 51 PASS.

**Cache version:** `?v=37` → `?v=38`. SW `perq-v30-deal-detail-modal-v2` → `perq-v31-image-align-splash`. Native build + cap sync ios/android complete.

---

## [Unreleased] — 2026-06-10 (deal-detail-modal-v2)

### 🆕 Feature: tap-to-modal, expiry chip, offer line, address row, delete button

Spec: `.kiro/specs/feature-deal-detail-modal-v2.md` (7 ACs, 8 edge cases). One new global: `window.deleteDealFromModal(id)`.

**Why this matters:**
- Tapping a wallet pass used to expand the card inline (replacing the brand background with white). Users preferred the focused modal that the ⓘ button opens — so we made that the default tap target.
- Stacked wallet cards used to hide the discount text and expiry under the next card. Users had to remember which deal each merchant card represented.
- A deal expiring tomorrow used to look identical to one expiring in 90 days when stacked. No urgency signal at the fleet level.
- The detail modal had merchant + discount + expiry rows but no address — and `d.address` was sitting in the data, perfectly available, just not surfaced.
- The modal had no delete button. Once the modal became the default tap target, delete was unreachable.

**What a user can do today:**
- **Tap a wallet pass** → focused detail modal opens. Brand-tile header, image preview (if any), info rows, address row (if any), and 3 action buttons (Mark as Used / Share / Delete).
- **Stacked wallet cards** show three things at a glance: merchant name, the offer one-liner under it (one-line truncated for long strings like "30% off entire site, free shipping over $50"), and an expiry chip in the top-right corner color-coded by urgency:
  - 🔴 red: "Expired" / "Today"
  - 🟡 amber: "Tomorrow" / "2d left" / "3d left"
  - ⚪️ translucent white: "12d left" / "60d left"
  - Hidden entirely when `d.expiry` is empty
- **Address row in the modal** — tappable, opens platform maps. Same Google-Maps URL the inline view uses (`https://www.google.com/maps/search/?api=1&query=...`); Apple Maps recognizes it on iOS, Google Maps app handles it on Android. `event.stopPropagation()` keeps the modal-overlay's backdrop-tap handler from closing the modal when the user taps the address.
- **Delete button** — outlined faint-red secondary button below "Share Deal". Calls the new `window.deleteDealFromModal(id)` wrapper which `closeModal()` first then runs the existing `deleteDeal(id)` (which prompts native `confirm()` and toasts on success).

**Public global added (covered by spec):**
- `window.deleteDealFromModal(id)` — closes modal then calls `deleteDeal`. Mirrors the `markDealUsed` and `shareDealFromModal` wrapper pattern.

**Surfaces touched:**
- `renderActivePasses` (wallet pass collapsed view) — new expiry chip + offer line in `.pcoll` top section; tap target switched from `togglePass(this)` to `viewWalletDeal('${id}')`.
- `viewWalletDeal` (saved-deal detail modal) — address row inserted between info rows and CTAs; Delete deal button appended below Share Deal.

**Backward compat:**
- Legacy `togglePass`, `expandPass`, `collapsePass` functions remain in the file but are no longer called from any `onclick`. Dead code preserved this round to minimize blast radius — a future cleanup commit can remove them once stable.
- The inline `.pexp` expanded section also remains in the rendered DOM (just never display:block-flipped). Functional but invisible. Same future cleanup.

**Tests added (8 cases, all assertion-bearing):**
- `scripts/perq-load-test.js` — `deleteDealFromModal` added to required globals; LOAD OK still passes.
- `scripts/perq-render-test.js` — AC1 wallet onclick = `viewWalletDeal('aXcBnQ')` not `togglePass(this)`, AC2 expiry chip ⏱ glyph in HTML, AC2 edge: no chip when `d.expiry` empty, AC3 offer text under merchant in `.pcoll` (before `.pexp`), AC4 modal contains maps URL + "Directions" + URL-encoded address substring, AC5 modal omits maps URL when no `d.address`, AC6 modal contains "Delete deal" + `deleteDealFromModal('id')`, AC7 `typeof deleteDealFromModal === 'function'`. RENDER 42 → 50 PASS.

**Cache version:** `?v=36` → `?v=37`. SW `perq-v29-discount-row-inline` → `perq-v30-deal-detail-modal-v2`. Native build + cap sync ios/android complete.

---

## [Unreleased] — 2026-06-10 (discount-row-inline)

### 🛠 Refactor: Discount + Value + Code on one line — saves two rows of vertical space

Spec amendment: `.kiro/specs/feature-deal-form-discount-expiry.md` (ACs 26-27 + 2 edge cases).

**What a user complained about:**
- "The size for Value on the discount row is too big." Right — when `%` was selected, the form added a separate "Total value ($) *" row with full-width input. Plus the standalone "Code" row below it. That meant 3 rows for what is conceptually one structured input. iPhone users had to scroll to reach Expires/Address.

**What a user can do today:**
- The Discount row is now a single inline flex line: `[ $ | % ]` segmented toggle (64px) + discount number input + Total value input (visible only when `%` selected) + Code input. The standalone Total-value row and standalone Code row are gone — folded into the Discount row.
- Saved two rows of vertical space. Merchant + Discount/Value/Code + Category + Expires now fit on one iPhone screen with no scroll.
- Each input uses `aria-label` (for screen readers) + `placeholder` (visual hint) since individual `<label>` tags would have crowded the line at 320-393px widths.
- `setDiscountSymbol` was updated to toggle the `f-value` input's `display` directly — the previous wrapper `f-value-row` no longer exists. Defensive on missing element so legacy modal HTML still works during cache bridging.

**Tests added (1 case, assertion-bearing):**
- `scripts/perq-render-test.js` — AC26: openDealPreview HTML places `f-discount-num < f-value < f-code < f-category` (proves the inline merge order) AND does not contain a standalone `<label>Code</label>` row (proves the old Code row is gone). RENDER 41 → 42 PASS.

**Backward compat:**
- The `setDiscountSymbol` API surface is unchanged — same function signature, same `'$'` / `'%'` arguments. Only the internal DOM target shifted from `f-value-row` (wrapper) to `f-value` (the input itself).
- All existing AC1-25 tests continue to pass: pre-fill detection, validation toasts, today-default expiry, image-toggle, and edge cases all unaffected.

**Cache version:** `?v=35` → `?v=36`. SW `perq-v28-deal-image-toggle` → `perq-v29-discount-row-inline`. Native build + cap sync ios/android complete.

---

## [Unreleased] — 2026-06-10 (deal-image-toggle)

### 🆕 Feature: collapsed thumbnail + Expand toggle, full image on saved-deal modal

Spec amendment: `.kiro/specs/feature-deal-form-discount-expiry.md` (ACs 22-25 + 3 edge cases). One new global: `window.toggleDealImage(frameId)`.

**What a user couldn't do well yesterday:**
- The deal-form image preview filled up to 320px tall — pushing merchant/discount/expiry fields below the fold on iPhone. Users had to scroll just to see the form they were filling out.
- Tapping a saved deal in the wallet (the new Deal Detail Modal) showed merchant + discount + expiry, but **not the image**. Deals where the cashier needs to see the original coupon screenshot or barcode were unusable from the wallet — the image was saved but never surfaced.

**What a user can do today:**
- The deal-form image preview is now a **90px collapsed thumbnail** with a small "Expand" pill in the top-right corner. The form fields fit on one screen with no scroll.
- Tapping the pill (or the thumbnail itself) **expands inline** to `max-height: 60vh` with `object-fit: contain`. Pill text becomes "Collapse". Tap again to return to the thumbnail.
- The same `dealImageFrame` component is now rendered on the **wallet Deal Detail Modal** (`viewWalletDeal`) below the brand header. Tap a saved deal → see the merchant/discount/expiry rows immediately, with the original image one tap away. Cashier flow works.
- Deals saved without an image (legacy entries or "Type a deal" manual flow) render the modal cleanly without an empty frame.

**Public global added (covered by spec):**
- `window.toggleDealImage(frameId)` — flips `data-expanded` on the frame and adjusts inline `max-height` + `object-fit` on the contained `<img>` and pill label text. Defensive `if(!frame)return` for missing-id calls.

**Surfaces sharing the same component:**
- `openDealPreview` (deal Review & save form) — frame id `deal-form-img`
- `openLoyaltyManualPrefilled` (loyalty card Review & save form) — frame id `loyalty-form-img`
- `viewWalletDeal` (saved deal detail modal) — frame id `wallet-detail-img-<dealId>` (per-deal so multiple modals don't collide)

**Tests added (4 cases, all assertion-bearing for Gate 4B.7):**
- `scripts/perq-load-test.js` — `toggleDealImage` added to required globals; LOAD OK still passes.
- `scripts/perq-render-test.js` — AC21+22 (form preview renders collapsed thumbnail with Expand pill, no legacy `height:100px`), AC23 (viewWalletDeal renders image frame with deal-id-scoped frame id when `d.image` is set), AC24 (viewWalletDeal omits frame entirely when `d.image` is absent), AC25 (`toggleDealImage` is `typeof === 'function'`). RENDER 38 → 41 PASS.

**Cache version:** `?v=34` → `?v=35`. SW `perq-v27-deal-form-polish` → `perq-v28-deal-image-toggle`. Native build + cap sync ios/android complete.

---

## [Unreleased] — 2026-06-10 (deal-form-polish)

### 🛠 Polish: today-default expiry date + full-size image preview

Spec amendment: `.kiro/specs/feature-deal-form-discount-expiry.md` (ACs 20-21 + edge cases 9-10 added). No new globals — both changes are tweaks to existing `setHasExpiry` and `openDealPreview` / `openLoyaltyManualPrefilled`.

**What a user couldn't do well yesterday:**
- Tapping `Yes` on "Has expiry?" surfaced an empty date picker. Most users had to tap the picker before they could even see what date range was available.
- The preview thumbnail above the form was hard-cropped at 100px tall with `object-fit: cover`, so coupons with barcodes or terms below the discount were either chopped off at the top, the bottom, or both. For deals where you need to show the cashier the original image, this made the screenshot useless.

**What a user can do today:**
- Tap `Yes` on an empty has-expiry input → date auto-fills with today's `YYYY-MM-DD`. User can adjust by tapping the picker. Toggling `Yes` when the date is already filled (from OCR or a prior toggle) preserves the existing value.
- Snap or upload an image → the full image is shown in the preview, aspect ratio preserved (`object-fit: contain`), capped at 320px tall so the form controls remain reachable. No more crops.

**Surfaces touched:**
- `openDealPreview` (deal Review & save form) — image block.
- `openLoyaltyManualPrefilled` (loyalty card Review & save form) — image block. Same fix applied for consistency.
- `setHasExpiry` — today-default-on-empty logic added; existing-value preservation logic added.

**Tests added (3 cases, all assertion-bearing):**
- `scripts/perq-render-test.js` — AC20 case A: `setHasExpiry('Y')` on empty input populates `dateInput.value` with today computed via the same `Date()` formatter the production code uses. Case B: `setHasExpiry('Y')` on a prefilled date (`'2027-03-15'`) preserves the existing value, does not overwrite. AC21: `openDealPreview(.., image)` produces modal HTML containing `object-fit:contain` and NOT containing `height:100px` or `object-fit:cover` (proves the legacy crop is gone). RENDER 35 → 38 PASS.

**Cache version:** `?v=33` → `?v=34`. SW `perq-v26-deal-form-discount-expiry` → `perq-v27-deal-form-polish`. Native build + `cap sync ios && cap sync android` complete.

---

## [Unreleased] — 2026-06-10 (deal-form-discount-expiry)

### 🛠 Refactor: deal form — discount as number+symbol toggle, expiry as Y/N gate

Spec: `.kiro/specs/feature-deal-form-discount-expiry.md`. 19 ACs, 12 new test cases (8 saveDealForm + 3 openDealPreview pre-fill + 1 legacy-deal backward-compat).

**What a user couldn't do well yesterday:**
- The "Review & save" deal form (after OCR scan and "Type a deal" manual entry) had a single free-form `Discount *` text input. A `$10 off $50` deal was structurally different from `20% off` but the form treated them the same — both needed a separate `Value ($)` field that the user had to fill manually. Garbage strings like `"twenty bucks"` flowed straight into the wallet pass.
- Expiry was rendered as an empty `<input type="date">` and treated as optional. Users skipped it because the field didn't surface that it matters, and the proximity/reminder system depends on it.

**What a user can do today:**
- Discount row has a $/% segmented toggle (default `$`) + a number input. Tapping `%` reveals a "Total value ($)" field; tapping `$` hides it. The number IS the value when `$` is selected; for `%` we compute `value = totalValue × num / 100`.
- Expiry row has a "Has expiry?" Yes/No segmented toggle (default `No`). Tapping `Yes` reveals a date input; tapping `No` hides and clears it.
- Validation now toasts loudly when required fields are missing: `Merchant required`, `Discount amount required`, `Total value required for % discounts`, `Pick an expiry date`. Modal stays open on any failure — no more silent garbage saves.
- OCR pre-fill detection: regex `\d+\s*%` → `%` toggle defaults active; regex `\$\s*\d+` → `$` toggle defaults active; non-numeric string → `$` default with empty number input. Pre-fill `data.expiry` set → `Yes` + date filled; empty/undefined → `No` + date hidden.

**Backward compat (spec § 5 case 8 — explicit non-action):**
- Existing localStorage deals saved under the previous free-form scheme keep their stored shape. There is no migration. Wallet render does not crash on legacy `{discount: "20% off entire purchase"}` rows lacking a `value` field. Verified by render-test case "legacy free-form deal".

**Public globals added:**
- `window.setDiscountSymbol(sym)` — toggles `$` / `%` row state, hides/shows Total value input
- `window.setHasExpiry(yn)` — toggles `Y` / `N` row state, hides/shows + clears date input

**Tests added (12 cases, all with `===` / `.includes(` / regex assertions for Gate 4B.7):**
- `scripts/perq-load-test.js` — `setDiscountSymbol`, `setHasExpiry`, `saveDealForm` asserted on `window` after boot
- `scripts/perq-render-test.js` — AC7-14 (8 saveDealForm cases: 4 invalid-input rejections + 4 happy-path persistence checks), edge cases 5-7 (3 openDealPreview pre-fill cases), edge case 8 (legacy free-form deal does not crash wallet render). RENDER 23 → 35 PASS.

**Cache version:** `?v=32` → `?v=33`. Native build + `cap sync ios && cap sync android` complete.

---

## [Unreleased] — 2026-06-10 (calculate-discount)

### 🆕 Feature: `calculateDiscount(price, percent)` helper

Spec: `.kiro/specs/feature-calculate-discount.md`. First feature shipped through supervisor v4 — Gate 0 (spec required) and Gate 4B.7 (assertion density) both enforced on this push.

**What a user couldn't do yesterday:**
- Discount math was inline string parsing (`"20% off"`, `"$10 off"`). No shared utility for computing the post-discount price for a numeric input.

**What a developer can do today:**
- `window.calculateDiscount(price, percent)` returns `price - (price * percent / 100)`. Exposed on `window` for use across the wallet pass code, savings hero, share text, and any future feature that needs structured discount math.

**Honest behavior notes (documented in spec § 5 because the test caught it):**
- `calculateDiscount(null, 10)` returns `0`, not `NaN`. JS coerces `null` to `0` in arithmetic. Callers that need to reject null must check `price == null` explicitly.
- `calculateDiscount(undefined, anything)` and `calculateDiscount(anything, undefined)` return `NaN` (`undefined` propagates `NaN` in arithmetic).

**Tests added (8 cases, all with `===` or `Number.isNaN()` assertions):**
- `scripts/perq-load-test.js` — `calculateDiscount` asserted on `window` after boot.
- `scripts/perq-render-test.js` — 8 cases: basic 100×10%, zero price, zero percent, full 100% discount, fractional 50×25%, null price (returns 0 due to coercion), undefined percent (NaN), undefined price (NaN). RENDER TEST 15 → 23 PASS.

**Cache version:** `?v=31` → `?v=32`. Native build + cap sync ios/android complete.

---

## [Unreleased] — 2026-06-10 (supervisor-v4 + spot-check)

### 🛠 Supervisor v4 — Gate 4B.7 (assertion density) + SPOT-CHECK REQUIRED

**Gate 4B.7 — No empty or trivial tests.**
- For every NEW test case added to `scripts/perq-*-test.js`, the case must contain at least one real assertion. Patterns accepted: `assert.`, `assertEqual`, `assertStrictEqual`, `expect(`, `throws(`, `rejects(`, `toThrow(`, comparison operators on a return value (`===`, `!==`, `>=`, `<=`, `>`, `<`), or `.includes(`, `.match(`, `.contains(`, `.toBe(`, `.toEqual(`, Playwright `.toHaveText(` etc.
- A new test block lacking ALL of these is "trivial" and fails 4B.7. The deny line names each trivial test by its closest preceding `console.error` message, comment, or `it/test/describe` name.
- N/A only if no test files were modified in the commit.
- Output table now has 15 rows.

**Augmented Gate 4B.2 — SPOT-CHECK REQUIRED block.**
- When a new feature spec is added in the diff, the supervisor emits a mandatory `SPOT-CHECK REQUIRED:` block immediately after the gate table.
- Format: one row per declared edge case from the spec's § 5 'Edge cases + error states', listing the test that covers it and the exact assertion line. Cases with no covering test render as `Test: NOT COVERED → Assertion: —` (which also fails 4B.2 itself).
- Block does NOT block the push. It is the human's one required touchpoint per feature — a chance to eyeball whether the declared edge cases are actually covered by real assertions before the push lands on main.

**Reporter mirror.**
- `.kiro/hooks/perq-supervisor-report.kiro.hook` v2 now mirrors v4: 15-row table, Gate 4B.7 included, SPOT-CHECK REQUIRED block emitted in the end-of-turn report whenever a new spec is in the working-tree-or-unpushed diff.

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

# Perq Feature Spec — `feature-deal-dedupe`

> **Status:** APPROVED 2026-06-12 — implementing now
> **Workflow:** Requirements-first
> **Ship order:** 2 of 5 in current batch

---

## 1. Problem statement

A user can currently save the same deal multiple times. Screenshot evidence: two identical "Pizza Hut · $13.99 off · 45d left" cards stacked in the wallet. The cause is that every add path (`saveDealForm` for manual entry, `confirmShare` for share-target deals, OCR-add post-extraction) pushes directly into `state.deals` with zero duplicate detection. A user who taps Save twice, snaps the same coupon twice, or imports the same shared link twice ends up with redundant entries cluttering their wallet — wasting screen real-estate, double-counting in any future "potential savings" calculation, and producing duplicate expiry-reminder notifications.

The fix is a single helper that looks up the candidate deal against existing non-redeemed entries before allowing the add, with a clear toast explaining why the add was blocked.

---

## 2. OPEN GAPS CHECKLIST — required pre-flight

- [x] No cloud persistence added (localStorage stays primary)
- [x] No analytics events wired
- [x] No APNs / FCM push tokens or server-push integration
- [x] No paid geocoding provider swap
- [x] No freemium gate logic
- [x] No background geofencing / region monitoring
- [x] No RTL / VoiceOver / iPad landscape work added opportunistically
- [x] No third-party API key embedded client-side
- [x] No fake/sample data shipped without curated label

All boxes checked.

---

## 3. Acceptance criteria

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| 1 | User taps **Save deal** in `saveDealForm` and the candidate's `merchant + discount + expiry + code` exactly match (after normalization) an existing **non-redeemed** wallet deal | New deal is NOT added to `state.deals`. Toast appears: `You already saved this deal — <merchant>`. Modal stays open so user can correct or close. `state.rewards.spins` is NOT incremented. `completeMission('save')` is NOT called. `scheduleReminders()` is NOT called. |
| 2 | Same merchant + same discount + same expiry but **different code** (e.g., online code `Y39` vs in-store code `YY YA` — legitimate distinct variants) | New deal IS added. No dedupe block. |
| 3 | Same merchant + same discount but **different expiry** | New deal IS added. No dedupe block. |
| 4 | A matching deal exists but is `redeemed === true` (user used the prior one and is now saving the same offer again — intentional) | New deal IS added. No dedupe block. |
| 5 | Normalization rules — comparison is duplicate iff ALL of these hold: `merchant.toLowerCase().trim() === existing.merchant.toLowerCase().trim()` AND `discount === existing.discount` (already normalized to `'$X off'` or `'X% off'` strings) AND `expiry === existing.expiry` (both empty or both same ISO date) AND `(code || '').trim() === (existing.code || '').trim()` | (definition only — no separate UI assertion) |
| 6 | Same dedupe rule fires in `confirmShare` (the share-target accept-deal flow at line ~1542) | Same toast, same no-add behavior |
| 7 | Same dedupe rule fires in the OCR-add path (`saveSnap` / OCR confirm at line ~1378) | Same toast, same no-add behavior |
| 8 | User is **editing** an existing deal (e.g., updating expiry on an existing entry) | Dedupe is NOT triggered. Editing is detected by the absence of a "new add" path — current code does not have an in-place edit modal that re-runs `saveDealForm`, so this is N/A in current product surface. If a future edit path is introduced, it must pass an `isEdit` flag or use a different code path. |
| 9 | Public global `findDuplicateDeal(candidate)` is exposed on `window` | Returns the matching deal object (truthy) or `null`. Pure function — no side effects. Used by all three add paths. |

---

## 4. UI contract (per affected screen)

### Surface: Deal review/save modal (`#modal-overlay` rendered by `openDealPreview` and `saveDealForm`)

- On dedupe hit: modal stays mounted, no DOM mutation. The toast renders over the modal as it already does for validation errors (e.g., "Merchant required", "Pick an expiry date").
- Toast copy: `You already saved this deal — <merchant>` (max 64 chars; merchant truncated to 30 chars if longer)
- Toast duration: standard 3s (existing toast() behavior)

### Surface: Share-import modal (when accepting a shared deal link)

- On dedupe hit: same toast pattern, modal stays open

### Surface: OCR-snap review (after Claude extracts deal fields)

- On dedupe hit: same toast pattern, modal stays open so user can adjust the merchant/discount/expiry/code if the duplicate detection was incorrect

No other UI changes. No badge, no banner, no settings toggle.

---

## 5. Edge cases + error states

- **Whitespace differences in merchant** (e.g., `"Pizza Hut"` vs `"Pizza Hut "` with trailing space) → AC #5 normalization (lowercase + trim) catches it as duplicate.
- **Case differences in merchant** (`"PIZZA HUT"` vs `"Pizza Hut"`) → AC #5 normalization catches.
- **Discount string differences with same numeric value** (`"$5 off"` vs `"5 off"` vs `"$5.00 off"`) → discount field is already normalized at save time by `saveDealForm` to either `'$X off'` or `'X% off'` format, so string-equal comparison is sufficient. Legacy entries from before the dual-symbol toggle may have non-normalized discount strings — those won't match new entries, so won't false-trigger. Acceptable.
- **Code differences** (one entry has code `''`, another has `null`, another has `undefined`) → AC #5 normalizes via `(code || '').trim()`.
- **Empty expiry vs empty expiry** → both empty strings, AC #5's `expiry === existing.expiry` returns true → match.
- **One has expiry, other doesn't** → expiry mismatch → not a duplicate (AC #3).
- **Redeemed match** → AC #4 — allow. User intentionally saving the same offer they already used.
- **Multiple matches** in `state.deals` → return the first one found. The toast just needs ONE merchant to display; doesn't matter which match.
- **`state.deals` empty** → no possible match, helper returns `null`, deal is added.
- **Candidate is itself in `state.deals`** (re-running save on a deal already added) — not currently possible because the modal closes on save. If a future code path introduces this, the candidate would match itself; we'd need an `isEdit` flag. Documented as Future-Proofing in spec § 8.
- **OCR multi-deal extraction** (Spec #4 will produce multiple candidates per snap) — each candidate runs through `findDuplicateDeal` independently before being added. A duplicate within a single snap (e.g., the same coupon image scanned twice with two extracted fragments) would block the second one.

No `fetch`, no permission prompts, no native dependency, no platform branching. Pure JS state mutation guarded by a comparison.

---

## 6. Test plan

### Existing tests this feature must not break

- [ ] `node scripts/perq-gamif-test.js` (20 cases)
- [ ] `node scripts/perq-load-test.js` (LOAD OK)
- [ ] `node scripts/perq-migration-test.js` (6 cases)
- [ ] `node scripts/perq-render-test.js` (59 cases — keep at 59 baseline before this spec adds new ones)
- [ ] `node scripts/perq-brand-test.js` (53 + 9 outline-warn)
- [ ] `node scripts/perq-splash-test.js` (18 cases)
- [ ] `npm run test:smoke` (6 cases)

### New tests this feature adds

| # | Test name | Type | Validates AC # |
|---|---|---|---|
| 1 | `findDuplicateDeal: exposed as window global, returns null when no match` | render-test (sandbox call with empty state.deals) | AC #9 |
| 2 | `findDuplicateDeal: returns existing deal when merchant+discount+expiry+code all match (case+whitespace insensitive)` | render-test (sandbox call with prepopulated state.deals) | AC #1, #5 |
| 3 | `findDuplicateDeal: returns null when only code differs (legitimate dual-code variant)` | render-test | AC #2 |
| 4 | `findDuplicateDeal: returns null when expiry differs` | render-test | AC #3 |
| 5 | `findDuplicateDeal: returns null when match is redeemed` | render-test | AC #4 |
| 6 | `saveDealForm: blocks add when duplicate found, leaves state.deals unchanged, no spin awarded` | render-test (call saveDealForm with f-merchant/f-discount-num/etc. populated to match an existing deal) | AC #1 |

6 new test cases. All assertion-bearing (Gate 4B.7 will pass).

---

## 7. Native impact

- [x] Does this require `npm run build:native && npx cap sync ios && npx cap sync android`? → **YES** (preview-app.js changed, Capacitor bundles dist/ into the iOS app)
- [ ] Does this require regenerating splash master PNG? → No
- [ ] Does this require new Capacitor permissions? → No
- [x] Does this require a cache-buster bump (`?v=N` in `preview.html`)? → **YES** (preview-app.js changed)
- [ ] Does this affect the Android CI workflow? → No

`sw.js` `CACHE_NAME` does NOT need to bump since the only file changing is `preview-app.js` (Gate 4A.2's "non-preview-app.js file changed" condition is not met). However, since any change at all is shipping, we'll bump anyway for clarity.

---

## 8. Out-of-scope / deferred to roadmap

- **Fuzzy matching** (e.g., "Pizza Hut" vs "PizzaHut" vs "Pizza Hut Restaurant") — too fragile, would need a normalization library; the strict-match-after-trim+lowercase rule covers 95% of the real-world dupe cases without false positives.
- **Cross-device dedupe** — wallet is local-only (Open Gap #1, no cloud persistence), so dedupe is per-device. If user has same deal on phone and tablet, both stand.
- **Edit-mode dedupe protection** — current product surface has no in-place edit; any future edit path must use a separate code path or pass `isEdit: true` to skip dedupe.
- **Dedupe against pool deals before claiming** — the pool/claim flow has its own existing "Block duplicate claims by same user" logic (line 692). Out of scope for this spec.
- **Soft-merge of duplicates** (e.g., when user tries to add a dupe, offer to "Update existing instead?") — over-engineering. Toast + block is sufficient.

---

## 9. Doc updates required

- [x] `docs/CHANGELOG.md` — add entry tagged `(deal-dedupe)`
- [ ] `docs/PRODUCT_ROADMAP.md` — no relevant entry exists
- [ ] `docs/CX_FLOWS.md` — no flow diagram change needed (the dedupe is a defensive guard, not a new flow)
- [x] `TEST_RESULTS.md` — re-run + update after merge (156 → 162 expected with the 6 new assertions)
- [x] Cache version in `preview.html` bumped (`?v=N`)
- [x] `sw.js` `CACHE_NAME` bumped to `perq-v40-deal-dedupe`
- [ ] Tagline / brand-system file unchanged
- [ ] `.kiro/steering/perq.md` — no change required

---

## 10. Sign-off

- [ ] Author: Kiro Agent
- [ ] Date: 2026-06-12
- [ ] Reviewer: <user>
- [ ] All ACs verified on iPhone Safari at the preview URL
- [ ] All ACs verified on native iPhone (▶ Play in Xcode)
- [ ] Supervisor hook gates passed on push
- [ ] CHANGELOG entry referencing this spec slug present

# Perq Feature Spec — `feature-reshare-community-claims`

> **Status:** APPROVED 2026-06-12 — implementing now
> **Workflow:** Requirements-first
> **Ship order:** 3 of 6 in current batch

---

## 1. Problem statement

Today a user who claims a deal from the community pool cannot share it back. The "Share to community pool" button is hidden by an `if(!fromCommunity)` guard in `shareDeal()` (preview-app.js line ~1095), and the modal shows an anti-fraud warning saying "it can't be re-pooled to prevent farming points." The intent — preventing point-farming — is sensible, but the implementation closes off a legitimate use case: a user claims a deal, then realizes they don't need it and would gladly hand it back to the community. Today they have to delete it instead, which removes value from the pool entirely.

The fix is small: allow re-share, but don't award points for it. The original sharer already earned the share + per-claim points; the re-sharer hasn't contributed new value to the pool, so they earn zero. The deal stays accessible to other community members.

---

## 2. OPEN GAPS CHECKLIST — required pre-flight

- [x] No cloud persistence added (community pool is already local-only via localStorage)
- [x] No analytics events wired (counters spec — `feature-action-counters` — will be a separate spec #4)
- [x] No APNs / FCM push tokens or server-push integration
- [x] No paid geocoding provider swap
- [x] No freemium gate logic
- [x] No background geofencing
- [x] No RTL / VoiceOver / iPad landscape work
- [x] No third-party API key embedded client-side
- [x] No fake/sample data shipped without curated label

All boxes checked.

---

## 3. Acceptance criteria

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| 1 | User opens the share modal (via `shareDeal(id)`) for a deal where `d.fromCommunity === true` | The "Share to community pool" button is **rendered** (today it's hidden by `if(!fromCommunity)`). Button label: `📤 Share back to community · 0 pts (already earned)`. Button styling identical to the standard share button (full-width, dark bg). |
| 2 | User taps the button → `confirmShare(id)` runs on a `fromCommunity` deal | Pool entry created identically to a fresh share (current user as `sharedBy`, fresh `sharedAt`, fresh `claimCount: 0`). Deal flagged `shared: true`, `sharedAt: Date.now()`. **`state.rewards.points` is NOT incremented.** **`completeMission('share')` is NOT called.** **`checkTierUp()` is NOT called.** Modal closes; navigation proceeds to community page (same as today). |
| 3 | Toast copy on successful re-share | `Shared back · 0 pts (already earned on first claim)` (was `🎉 Shared with community · +5 pts`) |
| 4 | Anti-fraud notice block in the share modal (the existing yellow `⚠️ Community-claimed deal` warning) | Body text updated from `"You can share via Message/WhatsApp/Email/Copy link, but it can't be re-pooled to prevent farming points."` to `"You can share back to the community pool for free, but no points are awarded since the original sharer (<sharedByOriginal>) already earned them."`. Block stays visible above the new share-back button. |
| 5 | Non-`fromCommunity` deals (user's own fresh deal) | UNCHANGED — share button still says `+5 pts`, `confirmShare` still awards `applyMultiplier(5*shareMultiplier())` points, `completeMission('share')` still called, `checkTierUp()` still called. |
| 6 | `unshareDeal(id)` for a community-claimed deal that was re-shared | UNCHANGED — pulls from pool, flips `d.shared = false`. Existing logic works correctly without special-casing because it doesn't touch points. |
| 7 | A different user later claims the re-shared deal | The pool entry has the re-sharer's `sharedBy` name, so subsequent claimants see it as shared by the re-sharer. The `claimCount` increments on the re-share's pool entry per existing `claimFromPool` logic. The original deal's pool entry (still in pool, owned by original sharer) is independent and unaffected. |
| 8 | A user redeems a community-claimed deal, then attempts to re-share | Existing share modal already does not render share button for redeemed deals (orthogonal to `fromCommunity`). Re-share is blocked the same way fresh shares are blocked for redeemed deals. No new behavior. |
| 9 | A user re-shares the same community-claimed deal twice (rapid double-tap) | First tap creates pool entry + flips `d.shared = true`. Second tap: existing `if(!pool.find(p=>p.id===d.id))` guard in `confirmShare` already handles this (no duplicate pool entry), AND modal would have closed after first tap so second tap requires re-opening. Idempotent. |

---

## 4. UI contract (per affected screen)

### Surface: Share modal (rendered by `window.shareDeal`)

#### When `d.fromCommunity === true`:
- Anti-fraud notice block: yellow background `#FFFBEB`, border `#FBBF24`, with updated copy from AC #4
- Below it: full-width dark share-back button: `📤 Share back to community · 0 pts (already earned)`
- Button calls `confirmShare(d.id)` exactly like a fresh share
- Below button: existing "Or share with someone specific" social share grid (unchanged)

#### When `d.fromCommunity === false` (user's own deal):
- Existing blue community-pool block (unchanged)
- Existing button: `📤 Share to community pool · +5 pts` OR if `d.shared===true` then the "✓ Shared with community" status + "Pull from community pool" button (unchanged)

### Surface: Wallet pass detail modal (`viewWalletDeal`)

- No change. The "Share Deal" button at the bottom of the modal continues to call `shareDealFromModal(id)` which delegates to `shareDeal(id)`. The new re-share path is just a deeper render in `shareDeal`.

### Surface: Community page

- No change to layout. The re-shared deal appears in the community pool as a normal entry shared by the re-sharer.

---

## 5. Edge cases + error states

- **Redeemed community-claimed deal** → AC #8. Redemption already disables the share path; no new gate needed.
- **Rapid double-tap on share-back button** → AC #9. Existing pool-entry-already-exists guard handles it.
- **Original sharer claims their own re-shared deal** → not preventable from this spec's scope; pool dedupe is out of scope. The `claimFromPool` already has a poolId-based block (line 692, `if(state.deals.some(d=>d.poolId===id))`). For a re-shared deal, the pool id is the re-sharer's local deal id, not the original poolId — so the original sharer COULD claim their own re-share back. Acceptable for now; if it becomes a real complaint, a follow-up spec can add a pool-side dedupe.
- **`d.fromCommunity` is true but `d.sharedByOriginal` is missing** (legacy data from before the field existed) → AC #4 fallback: copy renders as `"original sharer (someone)"`. Existing `escapeHtml(d.sharedByOriginal||'someone')` already handles this.
- **No active pool entries for original deal** (e.g., original sharer pulled it) → re-share creates a fresh pool entry independent of the original.
- **Pool entry creation fails to persist** → `save('perq-mvp:communityPool', pool)` is a localStorage write; the only failure mode is quota exceeded. No special handling beyond what `save()` already does (try/catch silent fallback).

No `fetch`, no permissions, no native dependencies, no platform branching.

---

## 6. Test plan

### Existing tests this feature must not break

- [ ] `node scripts/perq-gamif-test.js` (20 cases)
- [ ] `node scripts/perq-load-test.js` (LOAD OK)
- [ ] `node scripts/perq-migration-test.js` (6 cases)
- [ ] `node scripts/perq-render-test.js` (65 cases — keep at 65 baseline before this spec adds new ones)
- [ ] `node scripts/perq-brand-test.js` (53 + 9 outline-warn)
- [ ] `node scripts/perq-splash-test.js` (18 cases)
- [ ] `npm run test:smoke` (6 cases)

### New tests this feature adds

| # | Test name | Type | Validates AC # |
|---|---|---|---|
| 1 | `shareDeal renders 'Share back to community · 0 pts' button when d.fromCommunity is true` | render-test (sandbox HTML inspection) | AC #1 |
| 2 | `shareDeal anti-fraud block copy includes "no points are awarded"` | render-test | AC #4 |
| 3 | `confirmShare on fromCommunity deal: state.rewards.points unchanged after call` | render-test (sandbox state assertion) | AC #2 |
| 4 | `confirmShare on fromCommunity deal: pool entry created with current user as sharedBy` | render-test (inspect pool after call) | AC #2, AC #7 |
| 5 | `confirmShare on non-fromCommunity deal: state.rewards.points incremented (regression)` | render-test | AC #5 |

5 new test cases. All assertion-bearing for Gate 4B.7.

---

## 7. Native impact

- [x] Does this require `npm run build:native && npx cap sync ios && npx cap sync android`? → **YES** (preview-app.js changed)
- [ ] Does this require regenerating splash master PNG? → No
- [ ] Does this require new Capacitor permissions? → No
- [x] Does this require a cache-buster bump (`?v=N` in `preview.html`)? → **YES**
- [ ] Does this affect the Android CI workflow? → No

`sw.js` `CACHE_NAME` does not strictly need to bump (only `preview-app.js` is changing) but we'll bump anyway for consistency.

---

## 8. Out-of-scope / deferred to roadmap

- **Cooldown on re-shares** — e.g., "you can only re-share once per claim" or "wait 24h between shares of the same deal". Not requested.
- **Re-share count tracked on pool entry** — e.g., showing "this deal has been re-shared 3 times" to claimants. Not requested.
- **Different community-feed treatment for re-shared deals** — e.g., a "🔄 Re-shared" badge. Defer until users actually want this distinction.
- **Pool-side dedupe** — preventing the same deal from existing in the pool twice (once as original, once as re-share). Currently allowed; pool entries are distinct listings.
- **Server-side point attribution** — when backend lands, the original sharer's account would be the canonical point-recipient. Today's local logic is a stub; no change.

---

## 9. Doc updates required

- [x] `docs/CHANGELOG.md` — entry tagged `(reshare-community-claims)`
- [ ] `docs/PRODUCT_ROADMAP.md` — no relevant entry exists
- [ ] `docs/CX_FLOWS.md` — flow diagram update if one references the share-modal anti-fraud block (optional polish)
- [x] `TEST_RESULTS.md` — re-run + update after merge (162 → 167 expected)
- [x] Cache version in `preview.html` bumped (`?v=N`)
- [x] `sw.js` `CACHE_NAME` bumped to `perq-v41-reshare-community`
- [ ] `.kiro/steering/perq.md` — no change

---

## 10. Sign-off

- [ ] Author: Kiro Agent
- [ ] Date: 2026-06-12
- [ ] Reviewer: <user>
- [ ] All ACs verified on iPhone Safari
- [ ] All ACs verified on native iPhone (▶ Play in Xcode)
- [ ] Supervisor hook gates passed on push
- [ ] CHANGELOG entry referencing this spec slug present

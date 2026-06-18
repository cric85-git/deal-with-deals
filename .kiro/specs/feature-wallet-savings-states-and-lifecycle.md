# Perq Feature Spec — `feature-wallet-savings-states-and-lifecycle`

> **Status:** DRAFT v2 2026-06-17 — pending user approval
> **Workflow:** Requirements-first
> **Ship order:** 5 of 7 in current batch
> **Supersedes:** the earlier draft at `feature-savings-dual-header-and-redeemed.md` (slug renamed to reflect expanded scope: blocked-share-on-expired + parallel expired-deal visibility window + four explicit hero states)

---

## 1. Problem statement

Today the wallet treats a redeemed deal and an expired deal the same way it treats a deleted one — gone, no trace. That breaks four real user expectations:

1. **The savings hero forgets potential savings the moment you redeem your first deal.** Current behavior in `renderWallet()` (preview-app.js:559-580): if `state.deals.filter(d=>d.redeemed).length > 0`, the hero flips from "Potential savings · $X" to "Total saved this year · $Y" and the potential number disappears. A user with 12 active deals worth $340 and one $5 redemption sees only "$5 saved this year" — the $340 of opportunity-still-on-the-table is gone from the headline. Users need **all the relevant numbers visible at once**, not an exclusive toggle.

2. **Wallet deals are stacked in random order.** `renderDealsList(active)` (line 673) iterates `active` in insertion order. A deal expiring tomorrow can sit below a deal expiring in 90 days. Users have to mentally scan all cards to find the one running out.

3. **Redeemed and expired deals vanish immediately.** Once `d.redeemed=true` OR a deal's expiry passes, it's filtered out of the wallet. Two real problems with that:
   - The user loses the "yes, I used Pizza Hut on Tuesday" memory window — useful when a cashier disputes whether the discount was applied.
   - The user loses the "darn, I let Sephora expire — let me set a reminder for next time" memory window — a behavioral feedback loop the app currently breaks.

4. **Expired deals can still be shared into the community pool.** The current `shareDeal()` and `confirmShare()` paths have no expiry guard. A user can share a deal that expired yesterday into the community pool, where it pollutes the pool until the pool's own date filter (`renderCommunity` line 643) hides it on the next render. The window is small but real: anyone reading the pool between share-time and next-render-tick sees a useless deal. Worse, the social-share buttons (Message / WhatsApp / Email / Copy-link) have no expiry guard either — the user can text a friend a deal that expires today and the friend never knows.

The fix is three localized render-layer changes plus one new guard plus one tiny migration. No state-shape changes, no native impact beyond the standard cache-buster + sync. `d.redeemedAt` is already populated by `redeemDeal()` (line 1022) for every fresh redemption. `d.expiry` is already an ISO date string.

---

## 2. OPEN GAPS CHECKLIST — required pre-flight

- [x] No cloud persistence added — render-layer + filter-layer + share-guard changes only
- [x] **No analytics events wired** — Spec #4's `state.metrics` already counts the relevant lifecycle events (`dealsRedeemedGeneric`, `dealsExpiredUnused`); this spec adds zero new counters
- [x] No APNs / FCM push tokens or server-push integration
- [x] No paid geocoding provider swap
- [x] No freemium gate logic
- [x] No background geofencing
- [x] No RTL / VoiceOver / iPad landscape work
- [x] No third-party API key embedded client-side
- [x] No fake/sample data shipped without curated label

All boxes checked. Pure UX-tier change.

---

## 3. Acceptance criteria

### 3.1 Constants

Two module-level constants near the top of `preview-app.js` (alongside `K`, `METRIC_KEYS`, `TIERS`):

```js
const REDEEMED_VISIBILITY_DAYS = 7;  // recently-used deals stay visible 7 days post-redemption
const EXPIRED_VISIBILITY_DAYS  = 5;  // recently-expired deals stay visible 5 days post-expiry
```

Why different windows: a redemption is a positive memory ("I saved $5") and useful for cashier dispute resolution — 7 days. An expiry is a behavioral nudge ("I missed this") — 5 days, deliberately shorter so the wallet doesn't fill with regret. Both numbers are tunable; if feedback says either is wrong we tune the constant — we do NOT add a Settings toggle.

### 3.2 Lifecycle classification (pure derivation from `state.deals`)

Every deal `d` in `state.deals` falls into exactly one of four buckets at any given render:

| Bucket | Predicate | Visible in wallet? | Counts toward "Potential savings"? | Counts toward "Total saved"? |
|---|---|---|---|---|
| `active` | `!d.redeemed && (d.expiry === '' \|\| daysUntil(d.expiry) >= 0)` | Yes (Active deals section, sorted by expiry asc) | **Yes** | No |
| `recently-used` | `d.redeemed && (Date.now() - (d.redeemedAt \|\| 0) <= REDEEMED_VISIBILITY_DAYS × 86400000)` | Yes (Recently used section, sorted by `redeemedAt` desc, opacity 0.55) | No | **Yes** |
| `recently-expired` | `!d.redeemed && daysUntil(d.expiry) < 0 && (Date.now() - new Date(d.expiry).getTime() <= EXPIRED_VISIBILITY_DAYS × 86400000)` | Yes (Recently expired section, sorted by expiry desc, opacity 0.55) | No | No |
| `archived` | `d.redeemed` past 7-day window OR expired past 5-day window | No (still in `state.deals` for lifetime tally only) | No | **Yes** if redeemed; No if just expired |

Note on "Total saved": ONLY redeemed deals contribute. Expired-unused deals are dead value — they DO NOT count as savings and DO NOT show in the hero. That's the honest math.

### 3.3 Savings hero — four explicit states

The hero card at the top of the wallet renders one of exactly four layouts. State selection is mechanical based on the bucket counts above.

| State | Predicate | Layout |
|---|---|---|
| **Z. Zero** | `state.deals.length === 0` | Single line. Label: `Start adding deals to save`. Amount: hidden (no `$0` shown). Streak text: `Save your first deal to start a streak`. |
| **P. Potential only** | `state.deals.length > 0 AND no redeemed deals exist (lifetime)` | Single line. Label: `POTENTIAL SAVINGS`. Amount = sum of `parseFloat(d.value)` across `active` bucket only. Streak text: `Tap a deal and mark it redeemed to bank the savings`. |
| **A. Actual only** | `≥1 redeemed deal exists AND active bucket is empty` | Single line. Label: `TOTAL SAVED`. Amount = sum of `parseFloat(d.value)` across redeemed deals (lifetime — both still-visible and archived). Streak text: `+$Y saved · N day streak 🔥` if `streak > 0`, else `Snap your next deal to keep saving`. |
| **B. Both** | `≥1 redeemed deal exists AND active bucket is non-empty` | Dual line. Top: `SAVED THIS YEAR · $Y` (32px, weight 900). 1px divider (`rgba(0,0,0,0.08)`). Bottom: `STILL TO CLAIM · $X` (24px, weight 800, color `rgba(26,26,26,0.78)`). Streak text below both: `+$Y saved · N day streak 🔥` if streak, else `Tap a deal and mark it redeemed to bank more`. |

Recently-expired deals do NOT contribute to either amount and do NOT influence state selection.

### 3.4 AC table

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| **Hero state** | | |
| 1 | Empty wallet (`state.deals.length === 0`) | Hero State Z. Headline `Start adding deals to save`. No `$0`. Streak text `Save your first deal to start a streak`. |
| 2 | Wallet has ≥1 active deal, never redeemed any (lifetime) | Hero State P. Single-line `Potential savings · $X` where X = sum across `active` bucket. Streak text `Tap a deal and mark it redeemed to bank the savings`. |
| 3 | Wallet has ≥1 redeemed deal but no active deals | Hero State A. Single-line `Total saved · $Y` where Y = sum across all redeemed deals (lifetime). Streak text shows streak if > 0, else `Snap your next deal to keep saving`. |
| 4 | Wallet has both ≥1 redeemed and ≥1 active | Hero State B. Dual-line `Saved this year · $Y` + `Still to claim · $X`. Streak text below. Both numbers visible at the same time. |
| 5 | Wallet contains only `recently-expired` deals (no active, no redeemed) | Hero State **Z** — same as empty wallet. Recently-expired deals are visible in their section below, but they're not savings and not opportunity, so the hero treats this as "nothing to save". (Alternative considered + rejected: a fourth "Lost opportunity" line — adds noise without a clear next action.) |
| 6 | Wallet contains only `recently-expired` + ≥1 redeemed | Hero State A. Recently-expired deals don't promote the state. |
| 7 | Wallet contains `recently-expired` + ≥1 active | Hero State P. Same logic. |
| **Active deals — sort** | | |
| 8 | `renderDealsList(active)` invoked | Sorts `active` by `daysUntil(d.expiry)` ascending **before** rendering. Stable tiebreaker (insertion order). Already-expired deals (negative `daysUntil`) are NOT in this list — they're filtered into the `recently-expired` bucket. |
| 9 | Two deals with the same days-until-expiry | Render in insertion order (V8/JSC stable sort). |
| 10 | Deal with no expiry (`d.expiry === ''` or unset) | `daysUntil` returns `null`. Null-expiry deals sort to the **end** of `active`. |
| **Recently used section** | | |
| 11 | ≥1 deal in `recently-used` bucket | Section header `Recently used · N` rendered between active deals and reward programs. Header style matches existing `🎟️ Deals · N` all-caps treatment. |
| 12 | Cards in recently-used section | Same `.wpass` structure as `renderDealsList`, with: (a) opacity 0.55 on the entire card; (b) `✓ USED` badge (replaces the expiry chip); (c) sorted by `redeemedAt` desc; (d) tap target opens existing `viewWalletDeal` (read-only). |
| 13 | No deals in `recently-used` bucket | Section header AND body completely omitted from DOM. No "you haven't used any deals" copy. |
| **Recently expired section** | | |
| 14 | ≥1 deal in `recently-expired` bucket | Section header `Recently expired · N` rendered AFTER `Recently used` (or in its place if recently-used is empty). Header style matches the same all-caps treatment. |
| 15 | Cards in recently-expired section | Same `.wpass` structure, with: (a) opacity 0.55; (b) `⏰ EXPIRED` badge in red (`rgba(220,38,38,0.95)` bg, white text — same color as the expired chip in active list); (c) sorted by expiry **desc** (most recently expired first); (d) tap target opens `viewWalletDeal` — modal renders in a "this deal expired" mode (see § 4); (e) **no Mark Redeemed button**, **no Share button** in the modal for these deals; (f) Delete button works as today. |
| 16 | No deals in `recently-expired` bucket | Section header AND body completely omitted from DOM. |
| 17 | Section ordering when both `recently-used` and `recently-expired` are non-empty | Active deals → Recently used → Recently expired → Reward programs → Loyalty cards. Each section header omitted if its body is empty. |
| **Wallet sub-header count** | | |
| 18 | `wallet-sub` text under the wallet header | Shows `N item(s) saved` where `N = active.length + state.programs.length + state.loyalty.length`. Recently-used and recently-expired deals are NOT counted (they're memory, not "saved items"). |
| **Block share on expired deals** | | |
| 19 | User taps the Share button on a deal in the active list whose expiry passed between render and click (rare but possible) | `shareDeal(id)` short-circuits before opening the share modal. Toast: `Expired deals can't be shared`. No state change, no community pool write, no social-share modal opens. |
| 20 | User taps the Share button on a card in the `recently-expired` section | Same toast. (Belt-and-suspenders: § 4 also says the Share button is hidden on those cards. AC #19 + #20 together guarantee correctness even if hide-css fails.) |
| 21 | Share button visibility in `viewWalletDeal` modal for an expired deal | Hidden. Only Delete remains as the actionable button. Mark Redeemed also hidden (already today's behavior for redeemed deals; extending to expired). |
| 22 | `confirmShare(id)` invoked on an expired deal (defensive backup) | Same toast; no community pool write; no social-share modal. This catches any race where the share modal was reached for a borderline-expired deal. |
| 23 | Social share buttons (Message / WhatsApp / Email / Copy-link) for an expired deal | Not reachable — those buttons live inside the share modal, which is gated by AC #19. No additional guard needed at the social-button click handlers, but the share modal builder MUST also defensively check (so a stale modal in DOM after expiry-tick can't be used). |
| 24 | Re-share button on a `fromCommunity` deal that just expired | Same as AC #19 — share blocked. The "0 pts re-share" path goes through the same `shareDeal` → `confirmShare` flow, so a single guard at both functions covers both fresh and re-share. |
| 25 | A deal already in the community pool that expires while shared | The pool's existing `renderCommunity` filter (line 643) already hides expired entries from the claim list. No change needed at the pool render. The deal stays in `localStorage.communityPool` until the original sharer unshares (or the pool gets pruned) — out of scope for this spec. |
| **Migration** | | |
| 26 | App boot — pre-existing redeemed deals without `redeemedAt` | Migration step in the existing migration block: for each `d` in `state.deals` where `d.redeemed === true && (d.redeemedAt == null \|\| typeof d.redeemedAt !== 'number')`, set `d.redeemedAt = 0`. Treats legacy redeemed deals as "redeemed long ago" — they immediately fall outside the 7-day window. `save(K.deals, state.deals)` after migration. |
| 27 | Recently-used or recently-expired card crosses its window boundary while wallet is open | Stale entry remains visible until the next `renderWallet()` call. We do NOT add a `setTimeout` to force re-render at the boundary — every page navigation, deal action, or modal close already triggers `renderAll()`. Acceptable. |

### 3.5 Public API additions

This spec adds **no new `window.X = function`** globals. The new logic lives entirely inside existing functions:
- `renderWallet` — gains state-classification + dual-state hero + recently-expired section
- `renderDealsList` — gains sort + a `(deals, opts)` signature with `opts.section: 'active' | 'used' | 'expired'`
- `shareDeal` — gains expired-deal guard at top
- `confirmShare` — gains defensive expired-deal guard at top
- `viewWalletDeal` — gains expired-deal mode (hide Share + Mark Redeemed buttons)
- migration block — gains the `redeemedAt` back-fill

Gate 0 (spec exists for new fns) → N-A on this spec since no new globals.

---

## 4. UI contract

### Screen: `wallet` (savings hero card — `preview.html` lines ~389-394)

Existing markup keeps `#savings-label` and `#total-saved` ids. Two new ids added to the hero card to support the dual-line State B:
- `#savings-label-2` — secondary label (hidden by default, shown only in State B)
- `#total-saved-2` — secondary amount (hidden by default, shown only in State B)
- `#savings-divider` — 1px line divider between the two rows (hidden by default)

`renderWallet` flips between the four states by setting `.style.display` on these elements + updating `textContent`. No `innerHTML` rebuild of the hero card → keeps the diff small and avoids any XSS surface.

**State P — Potential only (single line):**
- `#savings-label`: `Potential savings`, 11px, weight 700, letter-spacing 1.5px, uppercase, opacity 0.7
- `#total-saved`: 38px, weight 900, letter-spacing -1.2px (today's style preserved)
- secondary elements hidden

**State A — Actual only (single line):**
- `#savings-label`: `Total saved`, same style as State P
- `#total-saved`: same 38px style
- secondary elements hidden

**State B — Both (dual line):**
- `#savings-label`: `Saved this year`, same 11px style
- `#total-saved`: 32px (down from 38px to make room), weight 900
- `#savings-divider`: visible (1px, `rgba(0,0,0,0.08)`, 8px vertical margin)
- `#savings-label-2`: `Still to claim`, same 11px style, opacity 0.6 (vs 0.7 for primary — deprioritized)
- `#total-saved-2`: 24px, weight 800, color `rgba(26,26,26,0.78)`
- Card height grows from current ~110px to ~150px

**State Z — Zero (single line, no number):**
- `#savings-label`: `Start adding deals to save`, 14px (NOT all-caps; this is full sentence-case copy), weight 700, opacity 0.85 — different from State P's all-caps to signal "no number expected here"
- `#total-saved`: hidden (no `$0`)
- secondary elements hidden

**Streak text** (`#streak-text`) — copy varies per state per AC #1-#4 above. Style unchanged from today.

### Screen: `wallet` (deal sections)

**Section ordering (top-to-bottom for `walletFilter==='all'`):**
1. Savings hero
2. Wallet tabs row
3. `🎟️ Deals · N` header + active deals list (if any)
4. `Recently used · N` header + recently-used list (if any in 7-day window)
5. `Recently expired · N` header + recently-expired list (if any in 5-day window)
6. `⭐ Reward programs · N` header + programs (if any)
7. `💳 Loyalty cards · N` header + loyalty (if any)
8. Empty-wallet message (only if all five sections 3-7 are empty)

For `walletFilter==='deals'`: sections 3, 4, 5 only. Empty-state fires only if all three are empty.

**Active deals (section 3):** sorted by `daysUntil(d.expiry)` asc, null-last. Same card style as today. Already-expired deals do NOT appear here (they're in section 5).

**Recently used (section 4):** opacity 0.55, `✓ USED` badge in `rgba(0,0,0,0.3)` bg + white text (replaces expiry chip), sorted by `redeemedAt` desc.

**Recently expired (section 5):** opacity 0.55, `⏰ EXPIRED` badge in `rgba(220,38,38,0.95)` bg + white text (replaces expiry chip — chip color matches today's expired-chip color in active list for consistency), sorted by expiry desc.

### Screen: `modal:viewWalletDeal` (deal-detail modal)

For deals in `recently-expired` bucket, when `viewWalletDeal(id)` opens the modal:
- Header brand-tile bg gets a 0.55 opacity overlay or an `EXPIRED` ribbon (TBD in implementation — single-line spec rule: the user must IMMEDIATELY see this is expired, not a normal claimable deal)
- Existing `expRow` text becomes the primary visual cue: `Expired N day(s) ago` in `var(--warm-1)` (already today's style)
- Mark Redeemed button: hidden (extends today's `isRedeemed` branch)
- Share button: hidden
- Delete button: visible
- All other modal content (image, address, code, notes) renders normally as historical record

For deals in `recently-used` bucket: existing `isRedeemed` branch already handles this correctly. Verify and don't regress.

### Asset / preview.html change

`preview.html` lines ~389-394 (the hero card) gain the three new ids (`savings-label-2`, `total-saved-2`, `savings-divider`) — about 5 added lines, all with `display:none` by default. Both gates 4A.1 (`?v=` bump) and 4A.2 (`CACHE_NAME` bump) fire because preview.html changed.

---

## 5. Edge cases + error states

- **Mid-redemption render race** — user taps Mark Redeemed, `redeemDeal()` mutates `d.redeemed`/`d.redeemedAt`/`state.rewards`, then calls `renderAll()`. Single-threaded JS event loop guarantees the mutation completes before render. No race.
- **Future `redeemedAt`** (clock skew or tampered localStorage) — `Date.now() - redeemedAt` is negative, satisfies `≤ 7 × 86400000`, so the deal still shows. Acceptable — self-corrects within milliseconds.
- **Future `d.expiry`** — `daysUntil` returns positive; deal stays in `active` bucket. Already today's behavior. No change.
- **Deal that was redeemed AFTER expiry** (`d.redeemed === true && daysUntil(d.expiry) < 0`) — `recently-used` predicate wins (it doesn't check expiry). Deal lands in Recently used, NOT Recently expired. Honest: the user did claim the saving (cashier accepted late), so it's banked.
- **Deal with `d.redeemedAt = 0`** (post-migration legacy) — `Date.now() - 0` is huge, fails the 7-day window, falls into `archived` (still counts toward "Total saved" but not visible). Correct.
- **Deal with `d.expiry === ''`** (no expiry) — `daysUntil` returns `null`, never satisfies `daysUntil < 0`, so it can never enter `recently-expired`. Stays `active` forever (until redeemed or deleted). Today's behavior. No change.
- **Migration on corrupted `state.deals`** — `state.deals = load(K.deals, [])` already returns `[]` on parse failure. Migration loop runs over `state.deals.filter(d => d && typeof d === 'object')` to skip nulls. No crash on malformed state.
- **`d.value` is a string like `"$13.99"`** — `parseFloat(d.value)||0` handles. No new edge case.
- **`d.value` is missing** — `parseFloat(undefined) → NaN → 0`. Skip that deal's contribution. Acceptable.
- **Deal already in community pool that expires while shared** — pool's existing `renderCommunity` filter (line 643) hides expired pool entries. Pool localStorage entry stays until original sharer unshares. Out of scope for this spec.
- **Share button visibility race** — user has wallet open with active list rendered, deal expires in real time, taps Share before next render. `shareDeal` guard (AC #19) catches it. Toast fires.
- **Stale share modal after expiry-tick** — share modal already on screen, deal expires, user taps `Send` on a social-share button. The modal builder does the date check at modal-open time; once open the modal is a static `innerHTML`, so the expired deal's text would be sent. Mitigation: `confirmShare`'s defensive guard (AC #22) catches the actual community-pool write. Social-share buttons (Message/WhatsApp) build their share text inside `shareDeal` BEFORE the modal opens — so AC #19 prevents the modal from opening at all. This is fully covered.
- **Recently-used or recently-expired count in `wallet-sub`** — explicitly NOT counted (AC #18). Today's wallet-sub formula `state.deals.filter(d=>!d.redeemed).length + ...` keeps redeemed deals out, but currently includes expired-unused. Spec changes this: filter changes to only `active` bucket. Migration risk: a user with mostly expired deals will see their wallet-sub count drop. Acceptable — the recently-expired section makes the deals discoverable.
- **`state.metrics.dealsExpiredUnused` counter** (Spec #4) — should fire exactly once per deal when it transitions into the `recently-expired` bucket from `active`. Existing pattern: idempotent via a `metricsExpireSeen` flag on the deal record (per Spec #4 § 3.1). This spec doesn't change Spec #4's behavior; it just ensures the recently-expired section + the counter don't double-count.

No `fetch`, no permission prompts, no native dependencies, no platform branching.

---

## 6. Test plan

### Existing tests this feature must not break

- [ ] `node scripts/perq-gamif-test.js` (20 cases)
- [ ] `node scripts/perq-load-test.js` (LOAD OK)
- [ ] `node scripts/perq-migration-test.js` (9 cases — this spec adds 1)
- [ ] `node scripts/perq-render-test.js` (81 cases — this spec adds ~14)
- [ ] `node scripts/perq-brand-test.js` (53 + 9 outline-warn)
- [ ] `node scripts/perq-splash-test.js` (18 cases)
- [ ] `npm run test:smoke` (6 cases)

Baseline 181 → expected 196 after this spec.

### New tests this feature adds

| # | Test name | Type | Validates AC # |
|---|---|---|---|
| 1 | `migration: legacy redeemed deal without redeemedAt back-filled to 0` | migration-test | 26 |
| 2 | `hero State Z: empty wallet → "Start adding deals to save", no $0 shown` | render-test | 1 |
| 3 | `hero State P: active deals only → single-line "Potential savings"` | render-test | 2 |
| 4 | `hero State A: redeemed only, no active → single-line "Total saved"` | render-test | 3 |
| 5 | `hero State B: both buckets non-empty → dual-line "Saved this year" + "Still to claim"` | render-test | 4 |
| 6 | `hero state ignores recently-expired deals (only-expired wallet → State Z)` | render-test | 5 |
| 7 | `renderDealsList sorts active by daysUntil asc, null-last` | render-test | 8, 10 |
| 8 | `recently-used section renders for redeemed deal within 7-day window` | render-test | 11, 12 |
| 9 | `recently-used section omitted when all redeemed deals >7 days old` | render-test | 13 |
| 10 | `recently-expired section renders for expired deal within 5-day window` | render-test | 14, 15 |
| 11 | `recently-expired section omitted when all expired deals >5 days old` | render-test | 16 |
| 12 | `section ordering: active → used → expired → programs → loyalty` | render-test | 17 |
| 13 | `shareDeal blocked on expired deal — toast fires, no modal opens` | render-test | 19, 20 |
| 14 | `confirmShare defensive guard blocks expired deal even if modal reached` | render-test | 22 |
| 15 | `wallet-sub count excludes recently-used and recently-expired` | render-test | 18 |

15 tests total (1 migration + 14 render). Every numbered AC mapped except #6, #7, #9, #21, #23, #24, #25, #27 — which are corollaries of tests above:
- #6, #7 covered by hero state tests #2-#5 mechanics
- #9 (stable sort tiebreaker) covered by #7
- #21 (modal share-button hidden) is UI-only, eyeballed in spot-check
- #23 (social-share buttons unreachable) covered transitively by #13
- #24 (re-share path on expired) covered by #13 + #14 (same guard)
- #25 (community pool entry that expires) is no-op behavior
- #27 (window-boundary auto-expiry) is acceptable-stale documented behavior, no test needed

All render tests use the existing `runIsolated(seedFn)` factory at perq-render-test.js:612.

---

## 7. Native impact

- [x] Does this require `npm run build:native && npx cap sync ios && npx cap sync android`? → **YES** (preview-app.js + preview.html both change)
- [ ] Does this require regenerating splash master PNG? → No
- [ ] Does this require new Capacitor permissions? → No
- [x] Does this require a cache-buster bump (`?v=N` in `preview.html`)? → **YES** — `?v=47` → `?v=48`
- [x] Does this require a `sw.js` `CACHE_NAME` bump? → **YES** — `perq-v42-action-counters` → `perq-v43-wallet-states-and-lifecycle`
- [ ] Does this affect the Android CI workflow? → No

---

## 8. Out-of-scope / deferred to roadmap

- **User-configurable visibility windows** — no Settings toggle for either window. 7 and 5 are constants. If feedback says either is wrong, tune the constant.
- **Restoring a redeemed deal** — no "undo redemption" button. If the user redeemed by mistake, they delete + re-add.
- **Restoring an expired deal** — no "extend expiry" button. If the merchant honors a past-date deal, the user can re-add manually.
- **Per-deal redemption history** — no "you used Pizza Hut on Tuesday at 3:42pm" timeline anywhere.
- **Lifetime savings analytics** — no monthly/yearly breakdown, no merchant-level "you saved most at Sephora".
- **Sort by other criteria** — no "sort by value", no "sort by merchant alphabetical". Expiry asc is the only sort for active.
- **A "Lost opportunity" hero line** — considered for the case where the wallet has only `recently-expired` deals. Rejected: adds noise without a clear next action. State Z + the recently-expired section together communicate the situation without a third number in the hero.
- **Community pool entries that expire while shared** — the pool's existing `renderCommunity` date filter handles claim-list visibility. Pruning the localStorage `communityPool` entry itself when its source expires is out of scope (not user-facing — the entry is invisible to claimers).
- **Counting expired-unused deals toward a "missed savings" tally** — the steering doc Open Gap #2 keeps `state.metrics` local-only. Spec #4 already counts `dealsExpiredUnused`. We don't surface that as a hero number — too negative a vibe for the wallet.
- **Push notifications for "your deal is expiring tomorrow"** — already shipped in Spec #1 (`feature-notification-deep-link-and-app-name`). No change here.

---

## 9. Doc updates required

- [x] `docs/CHANGELOG.md` — entry tagged `(wallet-states-and-lifecycle)`
- [ ] `docs/PRODUCT_ROADMAP.md` — flip status icon if any wallet-UX item is listed (likely none directly; check on push)
- [ ] `docs/CX_FLOWS.md` — minor update to wallet-page flow diagram showing recently-used + recently-expired sections
- [x] `TEST_RESULTS.md` — re-run + update after merge (181 → 196 expected)
- [x] Cache version in `preview.html` bumped (`?v=48`)
- [x] `sw.js` `CACHE_NAME` bumped to `perq-v43-wallet-states-and-lifecycle`
- [ ] `.kiro/steering/perq.md` — no steering change required (spec doesn't touch any standing rule)

---

## 10. Sign-off

- [ ] Author: Kiro Agent
- [ ] Date: 2026-06-17 (draft v2)
- [ ] Reviewer: <user>
- [ ] All ACs verified on iPhone Safari at the preview URL with `?v=48` bumped
- [ ] All ACs verified on native iPhone (▶ Play in Xcode)
- [ ] Supervisor hook gates passed on push
- [ ] CHANGELOG entry referencing this spec slug present

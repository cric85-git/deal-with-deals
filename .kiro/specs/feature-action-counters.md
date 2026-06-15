# Perq Feature Spec — `feature-action-counters`

> **Status:** APPROVED 2026-06-12 — implementation in progress
> **Workflow:** Requirements-first
> **Ship order:** 4 of 6 in current batch

---

## 1. Problem statement

Today there's no way to see how often a Perq user does anything in the app. The state has `state.rewards.points` (current balance) and `state.deals.length` (current wallet size) but nothing answers: *how many photos has this user snapped vs uploaded? how many deals have they entered manually? how many redemptions in each mode? how many spins, missions, tier-ups, programs added?* These are the questions that tell us — and the user themselves — whether the app's loops are working.

The user has explicitly authorized a counter system **with one constraint**: it must be **local-only**, persisted to localStorage on device, **never transmitted externally**. This satisfies the project rule that bans external analytics pipes (Open Gap #2 in steering — "No PostHog/Plausible/GA/Segment, no event collector"). What we're building is fundamentally different: it's a UX feature where the user sees their own activity stats, not a tracking system that ships data to a server.

The fix is a single `state.metrics` object — a flat map of counter-name → integer — incremented at every action site via a `bumpMetric(key)` helper, persisted to localStorage on each bump, and surfaced to the user via a new "Activity stats" panel in Settings.

---

## 2. OPEN GAPS CHECKLIST — required pre-flight

- [x] No cloud persistence added (localStorage only — same as `state.deals`, `state.rewards`)
- [x] **No analytics events wired (no PostHog/Plausible/GA/Segment, no event collector, no network transmission)** — counters are LOCAL-ONLY in localStorage. The user can view them in Settings; they never leave the device. This is intentionally scoped to be NOT an event pipe per Open Gap #2.
- [x] No APNs / FCM push tokens or server-push integration
- [x] No paid geocoding provider swap
- [x] No freemium gate logic
- [x] No background geofencing
- [x] No RTL / VoiceOver / iPad landscape work
- [x] No third-party API key embedded client-side
- [x] No fake/sample data shipped without curated label

All boxes checked. The "no analytics" gap is explicitly satisfied by the local-only constraint.

---

## 3. Acceptance criteria

### 3.1 Counter inventory

`state.metrics` is a flat object with the following keys, all initialized to `0` for new users and back-filled to `0` for existing users via migration. Each key increments by 1 on the listed trigger.

| Category | Key | Trigger |
|---|---|---|
| **Capture** | `photosSnapped` | User chooses Camera in the snap action sheet AND the camera returns a successful photo (cancellation does NOT increment) |
| | `photosUploaded` | User chooses Photo Library AND a photo is returned (cancellation does NOT increment) |
| | `dealsEnteredManual` | User saves a deal via the "Type a deal" path (no `pendingDealImage` present at save time) |
| | `dealsAddedFromSnap` | `saveDealForm` succeeds AND the source was a camera snap (tracked via a flag set at snap time) |
| | `dealsAddedFromUpload` | `saveDealForm` succeeds AND the source was a photo library upload |
| | `dealsAddedFromShare` | A deal saves via the share-target import path |
| | `dealAddBlockedDedupe` | `findDuplicateDeal` returned a match in `saveDealForm` or `claimBrowseDeal` (the toast fired, no add happened) |
| **Discover / Claim** | `browseDealsClaimed` | `claimBrowseDeal` succeeds (post-dedupe) |
| | `communityDealsClaimed` | `claimFromPool` succeeds (post-pool-id dedupe) |
| **Share** | `dealsSharedFresh` | `confirmShare` runs on `d.fromCommunity===false` (the +5 pts branch) |
| | `dealsResharedToCommunity` | `confirmShare` runs on `d.fromCommunity===true` (the 0 pts branch) |
| | `dealsUnsharedFromCommunity` | `unshareDeal` succeeds |
| | `socialSharesUsed` | User taps Message / WhatsApp / Email / Copy-link in the share modal |
| **Redeem** | `dealsRedeemedShowCashier` | User completes the Show Cashier flow |
| | `dealsRedeemedCodeCopy` | User completes the Code & Copy flow |
| | `dealsRedeemedOnline` | User completes the Online flow |
| | `dealsRedeemedGeneric` | User taps "Mark as Used" from the deal-detail modal (`markDealUsed`) |
| **Lifecycle** | `dealsDeleted` | `deleteDeal` proceeds past the confirm |
| | `dealsExpiredUnused` | Background scan in `scheduleReminders` (or render time) detects a deal whose expiry passed without redemption — incremented exactly once per such deal (idempotent via a `metricsExpireSeen` flag on the deal record) |
| **Rewards** | `pointsEarnedTotal` | Every `state.rewards.points += N` (where N>0) anywhere in the app |
| | `pointsSpentTotal` | Every `state.rewards.points -= N` (where N>0) anywhere in the app |
| | `spinsCompleted` | Every successful `doSpin` execution (one increment per spin) |
| | `missionsCompleted` | Every transition of a mission's flag from `false` to `true` (transitions only, not idempotent re-saves) |
| | `tierUps` | Every transition of `state.rewards.lastSeenTier` from a lower tier to a higher tier (Bronze→Silver, Silver→Gold) |
| | `unlocksClaimed` | Every transition of an unlock id from "not in `unlocksSeen`" to "in `unlocksSeen`" |
| **Programs** | `programsAdded` | `addProgram` (or whatever the loyalty-program save handler is called) succeeds |
| | `programsBalanceUpdated` | An existing program's `balance` field is changed via the user-facing edit flow |
| | `programsExpired` | A loyalty program's `expiry` passes (idempotent via a `metricsExpireSeen` flag on the program record) |
| **Engagement** | `walletViewOpened` | `goPage('wallet')` runs |
| | `browseViewOpened` | `goPage('browse')` runs |
| | `rewardsViewOpened` | `goPage('rewards')` runs |
| | `communityViewOpened` | `goPage('community')` runs |
| | `settingsViewOpened` | `goPage('settings')` runs |
| | `notificationsTapped` | `openPendingDealOnReady` resolves a real dealId (not the missing-deal path) |
| **OCR diagnostics** | `ocrAttempted` | An image is submitted to the Cloudflare Worker proxy |
| | `ocrSucceeded` | OCR returns a non-empty deal payload |
| | `ocrFailed` | OCR returns empty / errors / times out |
| **Permissions** | `notificationPermissionGranted` | First-time `display === 'granted'` returned by `LocalNotifications.requestPermissions` |
| | `notificationPermissionDenied` | First-time non-granted result |
| | `geoPermissionGranted` | First-time `granted` from `Geolocation.requestPermissions` |
| | `geoPermissionDenied` | First-time non-granted result |

**41 counters total** (inventory count). All integers, initialized to 0.

### 3.2 AC table

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| 1 | App boots for a NEW user (no prior `state.metrics`) | Migration creates `state.metrics` with all 38 keys at 0. Saved to `K.metrics = 'perq-mvp:metrics'` localStorage key. |
| 2 | App boots for an EXISTING user with no `state.metrics` (pre-spec install) | Migration adds the missing keys with value 0. Existing rewards/deals data unaffected. |
| 3 | App boots for a user with PARTIAL `state.metrics` (mid-rollout) | Migration adds any missing keys with value 0. Existing counter values preserved. |
| 4 | User performs ANY action listed in the inventory (3.1) | The corresponding counter increments by 1 AND `save(K.metrics, state.metrics)` runs synchronously (so a crash doesn't lose the increment). |
| 5 | User opens **Settings → Activity stats** | A new collapsible panel renders showing all 38 counters grouped by category, each with its current value. Empty/zero counters show `0` (NOT hidden — visibility is the point). |
| 6 | "Reset stats" button at the bottom of the panel | After a confirm prompt, `state.metrics` resets to all zeros. Persists. Toast: `Activity stats reset`. |
| 7 | Multiple actions in rapid succession (e.g., 5 spins in 10 seconds) | Each one increments. No batching, no debouncing. |
| 8 | User uninstalls + reinstalls (localStorage cleared) | Counters reset to 0 (expected — local-only state). Documented limitation. |
| 9 | User has 2 devices (phone + iPad) | Counters are per-device. There is no cross-device sync — same as wallet content (Open Gap #1 — no cloud persistence). Documented. |
| 10 | `bumpMetric(key)` is called with an unknown key (e.g., a typo) | Defensive guard: the key is added to `state.metrics` with value 1 anyway, AND a `console.warn` logs `[metrics] Unknown counter key: <key>`. This way a typo doesn't lose data, but devs see the warning during development. |
| 11 | `state.metrics` becomes corrupted (e.g., a non-number value due to bad migration) | At read time, `bumpMetric` coerces non-numbers to 0 before incrementing. No crash. |

### 3.3 Public API

- `window.bumpMetric(key)` — exposed for testability AND for the loyalty-program save handler (which lives in `app.js`, separate file) to call. Always increments by 1.
- `window.toggleActivityStats()` — toggles the Activity stats panel body open/closed. Wired to the panel header in Settings. On open, calls the internal `renderActivityStatsBody()` helper to refresh values.
- `window.resetActionCounters()` — runs the AC #6 reset flow: confirm prompt, zero out every key in `state.metrics` (rebuilt from canonical `METRIC_KEYS` so legacy unknown keys also get dropped), persist, re-render the panel, toast.

---

## 4. UI contract (Settings → Activity stats panel)

### Layout

- Inserted in Settings under the existing "Notifications" group, before "Data".
- Section header: `<p>ACTIVITY STATS</p>` matching existing all-caps section header pattern.
- Container: `.settings-group` wrapper (matches existing visual style).
- Inside: collapsible accordion. Initially collapsed; tap header to expand.
- When expanded: 8 sub-sections (Capture, Discover, Share, Redeem, Lifecycle, Rewards, Programs, Engagement, OCR, Permissions — split into the 9 categories from inventory).
- Each row: `<counter label> · <value>` in two-column layout. Value is right-aligned, monospace.
- Bottom of panel: a `Reset stats` text button (red) that fires the confirm + reset flow (AC #6).

### Copy for each counter

User-facing label is human-readable, NOT the snake_case key. Examples:
- `photosSnapped` → "Photos snapped from camera"
- `dealsEnteredManual` → "Deals entered manually"
- `dealsResharedToCommunity` → "Deals shared back to community (0 pts)"
- `pointsEarnedTotal` → "Points earned (lifetime)"
- `tierUps` → "Tier promotions"

(Full label table in the implementation; the spec doesn't enumerate all 38 here, but the category groupings from 3.1 are the source of truth.)

---

## 5. Edge cases + error states

- **`bumpMetric` called before `state.metrics` is initialized** (e.g., during the migration race window) → guard at top of `bumpMetric`: `if (!state.metrics) state.metrics = {};` then proceed.
- **Two simultaneous bumps** (theoretical, since we're single-threaded JS) → not an issue; JS event loop serializes them.
- **localStorage quota exceeded on save** → `save()` already silently catches; counter increment lost on this one bump but state.metrics in memory still incremented. Next bump that succeeds on save will persist the catch-up.
- **User disables localStorage entirely** (private browsing in some browsers) → counters work in-session but don't persist across reloads. Existing app behavior already degrades gracefully in this case.
- **Migration race on cold start** — migration reads `state.metrics` from store BEFORE the app's first action. We block any `bumpMetric` calls until migration completes by ordering the migration code before any action handlers register. Already the pattern for `state.rewards` migration (line 49ish).
- **Counter drift due to a bug** (e.g., a spin double-bumps `spinsCompleted`) → user can hit "Reset stats" any time. Acceptable for a feature with no compliance value.

No `fetch`, no permission prompts, no native dependencies, no platform branching.

---

## 6. Test plan

### Existing tests this feature must not break

- [ ] `node scripts/perq-gamif-test.js` (20 cases)
- [ ] `node scripts/perq-load-test.js` (LOAD OK)
- [ ] `node scripts/perq-migration-test.js` (6 cases — this spec ADDS at least one new migration test)
- [ ] `node scripts/perq-render-test.js` (70 cases — keep at 70 baseline before this spec adds new ones)
- [ ] `node scripts/perq-brand-test.js` (53 + 9 outline-warn)
- [ ] `node scripts/perq-splash-test.js` (18 cases)
- [ ] `npm run test:smoke` (6 cases)

### New tests this feature adds

| # | Test name | Type | Validates AC # |
|---|---|---|---|
| 1 | `migration: state.metrics initialized with all 38 keys at 0 for new user` | migration-test | AC #1 |
| 2 | `migration: existing user with no state.metrics gets all keys back-filled at 0` | migration-test | AC #2 |
| 3 | `migration: existing user with partial state.metrics keeps existing values, fills missing at 0` | migration-test | AC #3 |
| 4 | `bumpMetric exposed as window global, increments by 1, saves to localStorage` | render-test | AC #4 |
| 5 | `bumpMetric on unknown key still increments and warns` | render-test | AC #10 |
| 6 | `bumpMetric coerces non-number to 0 before incrementing` | render-test | AC #11 |
| 7 | `goPage('wallet') bumps walletViewOpened` | render-test | AC #4 |
| 8 | `claimFromPool bumps communityDealsClaimed` | render-test | AC #4 |
| 9 | `confirmShare on fresh share bumps dealsSharedFresh AND pointsEarnedTotal` | render-test | AC #4 |
| 10 | `confirmShare on community re-share bumps dealsResharedToCommunity but NOT pointsEarnedTotal` | render-test | AC #4 |
| 11 | `findDuplicateDeal block bumps dealAddBlockedDedupe in saveDealForm path` | render-test | AC #4 |
| 12 | `Settings panel renders all 38 counters when activity-stats section is expanded` | render-test | AC #5 |
| 13 | `Reset stats button zeroes all counters and re-saves` | render-test | AC #6 |

13 new tests across migration-test (3) and render-test (10). All assertion-bearing.

---

## 7. Native impact

- [x] Does this require `npm run build:native && npx cap sync ios && npx cap sync android`? → **YES** (preview-app.js + preview.html change)
- [ ] Does this require regenerating splash master PNG? → No
- [ ] Does this require new Capacitor permissions? → No
- [x] Does this require a cache-buster bump? → **YES**
- [x] Does this affect the Android CI workflow? → **No** (workflow change not needed; existing tests cover the new logic)

`sw.js` `CACHE_NAME` will bump to `perq-v42-action-counters`.

---

## 8. Out-of-scope / deferred to roadmap

- **External analytics pipe** — Open Gap #2. We are NOT adding PostHog, Plausible, GA, Segment, or any custom event collector. Counters live ONLY in localStorage; no network transmission. If we ever DO want server-side aggregation, that would be a separate, explicitly-scoped spec.
- **Time-series / per-day breakdown** — counters are lifetime aggregates only. No "deals claimed this week" view.
- **Cross-device aggregation** — counters are per-device. Wallet itself is per-device (Open Gap #1).
- **Funnel analysis** — e.g., "% of snaps that resulted in a save". The user can compute these from the raw counters; we don't pre-compute funnels in the UI.
- **Counter-driven gamification** — e.g., "100 deals claimed → unlock special badge". That's gamification scope (Spec #6) — counters provide the data, gamification consumes them later.
- **Counter export / share** — no "copy stats to clipboard" or "screenshot stats" feature in this spec. Could add in a follow-up if user wants.

---

## 9. Doc updates required

- [x] `docs/CHANGELOG.md` — entry tagged `(action-counters)`
- [ ] `docs/PRODUCT_ROADMAP.md` — flip status icon if any "instrumentation" item is listed
- [ ] `docs/CX_FLOWS.md` — no flow change
- [x] `TEST_RESULTS.md` — re-run + update after merge (167 → 180 expected)
- [x] Cache version in `preview.html` bumped (`?v=N`)
- [x] `sw.js` `CACHE_NAME` bumped to `perq-v42-action-counters`
- [x] `.kiro/steering/perq.md` — **add a small clarifying note under Open Gap #2** distinguishing local counters from event pipes. Critical to prevent a future session from over-interpreting Open Gap #2 and incorrectly removing the counter system.

---

## 10. Sign-off

- [x] Author: Kiro Agent
- [x] Date: 2026-06-15 (implementation complete)
- [ ] Reviewer: <user>
- [ ] All ACs verified on iPhone Safari (manual; tests cover ACs 1–6, 10, 11)
- [ ] All ACs verified on native iPhone (▶ Play in Xcode)
- [ ] Supervisor hook gates passed on push
- [x] CHANGELOG entry referencing this spec slug present

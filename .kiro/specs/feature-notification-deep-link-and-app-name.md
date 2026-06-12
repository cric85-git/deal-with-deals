# Perq Feature Spec — `feature-notification-deep-link-and-app-name`

> **Status:** APPROVED 2026-06-12 — implementation in progress
> **Workflow:** Requirements-first
> **Ship order:** 1 of 4 in current batch (precedes `feature-savings-dual-header-and-redeemed`, `feature-snap-ocr-multi-deal-and-codes`, `feature-saver-levels-streak-milestones`)

---

## 1. Problem statement

A user who taps a Perq expiry-reminder notification on iOS sees two problems:

1. **The notification has no "Perq" source label.** iOS notifications normally show `[app icon] APP NAME · time` as a header, then the title and body underneath. In the user's screenshot the app-name slot is empty — only `[wallet icon] 🚨 Deal expires in 2 days   3m ago` appears, then the body. The user has no way to identify which app sent the alert at a glance, especially in a stack of mixed notifications.

2. **Tapping the notification does NOT open the deal it was about.** Today the tap routes to the Wallet tab and shows the entire deal list. The user has to scroll, scan for the merchant from the body text ("Ice Cold Parlor"), and tap the matching card. For a notification whose entire purpose is "go use this specific deal before it expires", the action that would naturally complete that intent — opening that deal's detail modal — does not happen.

Both fixes are foundational: without the app name, brand presence is invisible; without deep-link, the notification is a dead-end. Together they convert the reminder from a passive ping into a single-tap path to redemption.

---

## 2. OPEN GAPS CHECKLIST — required pre-flight

- [x] No cloud persistence added (localStorage stays primary)
- [x] No analytics events wired
- [x] No APNs / FCM push tokens or server-push integration — this spec is **scoped to `@capacitor/local-notifications` only**, no server push
- [x] No paid geocoding provider swap
- [x] No freemium gate logic
- [x] No background geofencing / region monitoring
- [x] No RTL / VoiceOver / iPad landscape work added opportunistically
- [x] No third-party API key embedded client-side
- [x] No fake/sample data shipped without curated label

All boxes checked. No open-gap items are touched.

---

## 3. Acceptance criteria

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| 1 | iOS lock screen / notification center / banner — any Perq expiry reminder | iOS notification header shows `[wallet icon]` + `Perq` + timestamp on the same line. The text "Perq" appears explicitly. Verified by a screenshot in the spec sign-off section. |
| 2 | Notification copy structure | Title: `<Merchant> · <Discount>` (e.g., `Ice Cold Parlor · $5 off sundae`) — no leading emoji. Body: short one-liner combining relative-expiry + CTA: `Expires in N days. Tap to open.` / `Expires today. Last chance.` / `Expires tomorrow. Tap to open.`. Note: `@capacitor/local-notifications` v8 does not expose the iOS `subtitle` slot, so expiry detail is folded into the body. Title stays single-line and body stays ≤ 1.5 lines so iOS retains the app-name source label in the header. |
| 3 | User taps a Perq expiry-reminder notification when the app is already running in the background | The Wallet tab is selected AND the deal-detail modal for the exact `dealId` from the notification's `extra` payload opens within 500ms of the tap. No intermediate "all deals" view. |
| 4 | User taps a Perq expiry-reminder notification when the app process is killed (cold launch) | The app boots, the splash sequence completes normally, then the deal-detail modal for the exact `dealId` opens within 200ms after `window.__perqAppReady === true`. The user does NOT see the deals list flash before the modal opens. |
| 5 | Notification's `extra.dealId` references a deal that no longer exists (user deleted it after notification was scheduled) | The Wallet tab is selected, NO modal opens, a toast appears: `This deal is no longer in your wallet`. Toast auto-dismisses after 3s. |
| 6 | Notification's `extra.dealId` references a deal that has been redeemed/used between scheduling and tap | The deal-detail modal still opens, with the existing redeemed-state UI (struck-through discount, "Used on <date>" subtitle, no Mark-as-Used button). |
| 7 | Notification's `extra.dealId` references a deal whose expiry has passed between scheduling and tap | The deal-detail modal still opens, with the existing expired-state UI (red expiry chip "Expired"). User can still see the original details. |
| 8 | Two notifications for two different deals, both unopened. User taps the second one. | Only the second notification's `dealId` modal opens. The first notification's pending action (if any) is discarded — last-tap-wins. |
| 9 | User on web PWA (no native notification API) | All in-app reminder banners continue to function as today. No regression to the in-app `expiringSoonBanner` flow. The deep-link code path is no-op when `window.PerqNative.isNative !== true`. |
| 10 | Permission denied / not granted | No notifications scheduled (existing behavior, not regressed). The deep-link listener still registers safely without error. |
| 11 | App in foreground when a scheduled notification fires | iOS does NOT show the banner by default. This is acceptable — the existing `expiringSoonBanner` covers in-app reminding. No new behavior required for this case. |

---

## 4. UI contract (per affected screen)

### Surface: iOS / Android Notification (system-rendered, not in-app)

- iOS notification source label: must read exactly `Perq` (matches `CFBundleDisplayName`)
- iOS notification icon: existing `ic_stat_perq` for Android, app icon for iOS
- Title: ≤ 64 chars (`Merchant · Discount` typical, e.g., `Ice Cold Parlor · $5 off sundae` = 31 chars)
- Body: ≤ 64 chars to keep iOS rendering in standard layout where source-label is visible (e.g., `Expires in 2 days. Tap to open.` = 31 chars)
- No emoji prefix on title (the alarm clock `⏰` was visually duplicating the system alarm icon AND adding length that pushed iOS into compact no-app-name mode — remove it)
- iOS `subtitle` slot: not used (Capacitor v8 LocalNotifications API does not expose it cross-platform)

### Surface: Wallet page after deep-link tap

- No layout changes
- Modal (`viewWalletDeal`) opens over the Wallet tab — exact same modal already used by tap-on-card and tap-on-info-button
- If `dealId` does not resolve, no modal; show toast `This deal is no longer in your wallet`

### Surface: Boot sequence after cold launch from notification

- No splash changes — boot proceeds normally per the splash contract in `.kiro/steering/perq.md`
- Modal opens AFTER `window.__perqAppReady === true` AND boot-splash has fully dismissed
- No flicker, no double-render of the wallet list before the modal

---

## 5. Edge cases + error states

- **Deleted deal between schedule and tap** → AC #5 — wallet tab + toast, no modal
- **Redeemed deal between schedule and tap** → AC #6 — modal opens with redeemed UI
- **Expired deal between schedule and tap** → AC #7 — modal opens with expired UI
- **Cold launch race** (notification tap fires before web layer is ready) → store the pending `dealId` in `window.__pendingDealOpen`; the web layer's bootstrap reads + clears it once `state.deals` is loaded and renders are ready
- **Multiple stacked notifications** → AC #8 — last-tap-wins; the listener overwrites `__pendingDealOpen` on each tap
- **Listener registered twice** (re-init from hot-reload during dev) → guard with `if (!window.__perqNotifListenerBound)` flag so the listener attaches exactly once per app lifetime
- **Notification permission revoked between schedule and fire** → existing native-bridge handles silently; deep-link listener never fires; no error path needed
- **`extra.dealId` missing or malformed** (e.g., legacy notification scheduled before this feature shipped) → log a console warning, route to wallet tab, no toast (legacy notification user can't blame current state)
- **Web PWA path** → AC #9 — `LocalNotifications` plugin not present; `addListener` call is guarded by `if (!nativePlugin('LocalNotifications')) return`
- **Android tap behavior** — Android delivers the same `localNotificationActionPerformed` event via Capacitor, so the same listener handles both platforms
- **Notification body containing unrelated merchant name** (legacy reminder format from old code) — listener trusts `extra.dealId`, ignores title/body string parsing

No `fetch`/XHR involved. No camera/geolocation/notification *permission* prompts in this feature. The only permission already requested is the existing `LocalNotifications.requestPermissions` in `app.js` — unchanged.

---

## 6. Test plan

### Existing tests this feature must not break

- [ ] `node scripts/perq-gamif-test.js` (20 cases)
- [ ] `node scripts/perq-load-test.js` (LOAD OK)
- [ ] `node scripts/perq-migration-test.js` (6 cases)
- [ ] `node scripts/perq-render-test.js` (51 cases)
- [ ] `node scripts/perq-brand-test.js` (53 + 9 outline-warn)
- [ ] `node scripts/perq-splash-test.js` (18 cases)
- [ ] `npm run test:smoke` (6 cases)

### New tests this feature adds

| Test name | Type | Validates AC # |
|---|---|---|
| `notification copy: title is Merchant · Discount, no leading emoji` | render-test (string check on `native-bridge.js` notification payload) | AC #2 |
| `notification copy: lead body matches "Expires in N day(s). Tap to open."` | render-test | AC #2 |
| `notification copy: day-of body matches "Expires today. Last chance."` | render-test | AC #2 |
| `notification payload: extra.dealId is set on every scheduled lead/eve/day notification` | render-test (grep `native-bridge.js` for `extra.dealId`) | AC #3, #4 |
| `localNotificationActionPerformed listener: registered exactly once via __perqNotifListenerBound guard` | load-test (search `native-bridge.js` for the guard token) | AC #3 |
| `deep-link handler: openPendingDealOnReady reads __pendingDealOpen and calls viewWalletDeal(id)` | render-test (grep `preview-app.js` for the function name + the call site) | AC #4 |
| `deep-link missing-deal path: toast "This deal is no longer in your wallet" on unresolved dealId` | render-test (grep `preview-app.js`) | AC #5 |
| `last-tap-wins: handler overwrites __pendingDealOpen, no queue` | load-test | AC #8 |

8 new test cases total (all assertion-bearing per Gate 4B.7). New tests will be added to `scripts/perq-render-test.js` and `scripts/perq-load-test.js` (no new test file, so Gate 4B.3 is N/A).

### Manual / device tests (sign-off only, not automated)

- iOS device: schedule a reminder for a deal expiring tomorrow; force-close the app; wait for notification; tap → cold-launch deep-link works → AC #4
- iOS device: app in background, tap notification → modal opens immediately → AC #3
- iOS device: schedule notification, delete deal, tap → toast appears → AC #5
- Android device: same three scenarios

---

## 7. Native impact

- [x] Does this require `npm run build:native && npx cap sync ios && npx cap sync android`? → **YES** (changes to `native-bridge.js`)
- [ ] Does this require regenerating splash master PNG via `npm run build:icons`? → No
- [ ] Does this require new Capacitor permissions in `Info.plist` or `AndroidManifest.xml`? → **No new permissions**. iOS `UNNotificationContent.subtitle` is part of the existing notifications entitlement. Android `POST_NOTIFICATIONS` is already declared.
- [ ] Does this require a cache-buster bump (`?v=N` in `preview.html`)? → **YES** if `preview-app.js` is modified for the deep-link reconciliation path
- [ ] Does this affect the Android CI workflow? → No

`sw.js` `CACHE_NAME` must be bumped (Gate 4A.2) since `native-bridge.js` and `preview-app.js` will both change.

---

## 8. Out-of-scope / deferred to roadmap

- **Server-side push notifications** (APNs / FCM) — requires backend, deferred per `TAKEOVER_REVIEW.md` priority #4 + steering Open Gap #3
- **Notification action buttons** (e.g., "Mark Used" / "Snooze" inline buttons on the notification itself) — would require category registration in iOS, additional listener wiring; not requested by user, defer to roadmap
- **Per-deal notification preferences** (let user set custom reminder days for one specific deal) — out of scope; the global `state.settings.reminderLeadDays` continues to apply
- **Reminder notification grouping** (collapse multiple Perq reminders into a single thread on iOS / Android notification group) — not requested; could be a follow-up
- **Rich notification with deal image** (`UNNotificationAttachment`) — not requested; defer to a polish pass
- **In-foreground banner display** (force iOS to show banner even when app is foreground) — AC #11 explicitly accepts current behavior; if user later requests, can revisit
- **Notification analytics** (open rate, time-to-tap) — gated by Open Gap #2 (no analytics wired)

---

## 9. Doc updates required

- [ ] `docs/CHANGELOG.md` — add entry tagged `(notification-deep-link-and-app-name)` in standard before/after format
- [ ] `docs/PRODUCT_ROADMAP.md` — flip status icon if Phase 2 "Notifications" or similar item lists this
- [ ] `docs/CX_FLOWS.md` — update reminder flow diagram if one exists; add the new "tap → modal" arrow
- [ ] `TEST_RESULTS.md` — re-run + update after merge (148 → 156 cases expected with the 8 new assertions)
- [ ] Cache version in `preview.html` bumped (`?v=N` if `preview-app.js` changes)
- [ ] `sw.js` `CACHE_NAME` bumped to `perq-v37-notification-deep-link`
- [ ] Tagline / brand-system file unchanged
- [ ] `.kiro/steering/perq.md` — no change required (this feature does not amend the splash contract or any standing rule)

---

## 10. Sign-off

- [ ] Author: Kiro Agent
- [ ] Date: 2026-06-12
- [ ] Reviewer: <user>
- [ ] All ACs verified on iPhone Safari at the preview URL with `?v=N` bumped (web PWA: AC #9, #10 only)
- [ ] All ACs verified on native iPhone (▶ Play in Xcode): AC #1–#8, #11
- [ ] All ACs verified on native Android (APK install): AC #3–#8
- [ ] Supervisor hook gates passed on push (Gate 0–5, including SPOT-CHECK REQUIRED block for §5 edge cases)
- [ ] CHANGELOG entry referencing this spec slug present on push

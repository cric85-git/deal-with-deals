# Perq Feature Spec — `<feature-name>`

> **Mandatory.** Fill out every section before writing any code. The supervisor
> hook will look for a CHANGELOG entry referencing this spec on push.

---

## 1. Problem statement

> What can a user not do today? What pain does this remove? One paragraph.

(write here)

---

## 2. OPEN GAPS CHECKLIST — required pre-flight

Before coding, confirm none of the following are touched without explicit
instruction. If ANY of these is touched, STOP and surface for approval first.
(See `.kiro/steering/perq.md` § "Open gaps".)

- [ ] No cloud persistence added (localStorage stays primary)
- [ ] No analytics events wired (no PostHog/Plausible/GA/Segment)
- [ ] No APNs / FCM push tokens or server-push integration
- [ ] No paid geocoding provider swap (stay on Nominatim)
- [ ] No freemium gate logic (X is undefined)
- [ ] No background geofencing / region monitoring (foreground only)
- [ ] No RTL, VoiceOver/TalkBack labels, iPad landscape, or Android landscape
      splash work added opportunistically
- [ ] No third-party API key embedded client-side (must use Cloudflare Worker proxy)
- [ ] No fake/sample data shipped without an explicit "curated" label in
      both code comment and user-visible copy

If any box is unchecked, document the gap and the user's authorization before
proceeding.

---

## 3. Acceptance criteria

> Use the notification-copy-table format from `docs/NATIVE_BUILD_GUIDE.md`.
> Each row is a concrete, testable assertion.

| # | Trigger / Surface | Expected behavior |
|---|---|---|
| 1 | (e.g., User taps Snap from wallet) | (e.g., Camera opens within 500ms; permission prompt fires only on first use) |
| 2 | | |
| 3 | | |

Numeric thresholds, exact copy strings, and timing requirements MUST appear
in this table. "Looks good" is not an AC.

---

## 4. UI contract (per affected screen)

For each screen this feature modifies, list explicit, testable rules:

### Screen: `<wallet | browse | rewards | settings | community | onboarding | modal:<name>>`

- (e.g., Logo width 64–130 CSS pt at iPhone 14 Pro viewport)
- (e.g., All text on dark bg uses `--text-on-dark` (`#FFFFFF`) or `var(--accent-light)` (`#34D399`))
- (e.g., Primary CTA contrast ≥ 4.5 vs surface)
- (e.g., No element overflows safe-area inset)

If no UI change, state "No UI change."

---

## 5. Edge cases + error states

For each, state how the code handles it:

- (e.g., User denies camera permission → ___)
- (e.g., OCR proxy returns 429 → ___)
- (e.g., localStorage full / quota exceeded → ___)
- (e.g., User offline → ___)
- (e.g., Returning user with pre-migration state shape → ___)
- (e.g., Native vs PWA divergence → `window.PerqNative.isNative` branch)

---

## 6. Test plan

### Existing tests this feature must not break

- [ ] `node scripts/perq-gamif-test.js`
- [ ] `node scripts/perq-load-test.js`
- [ ] `node scripts/perq-migration-test.js`
- [ ] `node scripts/perq-render-test.js`
- [ ] `node scripts/perq-brand-test.js`
- [ ] `node scripts/perq-splash-test.js`
- [ ] `npm run test:smoke`

### New tests this feature adds

| Test name | Type | Validates AC # |
|---|---|---|
| | | |

If no new test, justify why.

---

## 7. Native impact

- [ ] Does this require `npm run build:native && npx cap sync ios && npx cap sync android`? (yes / no)
- [ ] Does this require regenerating splash master PNG via `npm run build:icons`? (yes / no)
- [ ] Does this require new Capacitor permissions in `Info.plist` or `AndroidManifest.xml`? (list them)
- [ ] Does this require a cache-buster bump (`?v=N` in `preview.html`)? (yes / no — yes if any preview-app.js change)
- [ ] Does this affect the Android CI workflow (`.github/workflows/android-build.yml`)? (yes / no)

---

## 8. Out-of-scope / deferred to roadmap

> What you considered and explicitly chose not to do. Move corresponding
> items into `docs/ROADMAP.md` if they are net-new.

- (e.g., Cross-device referral attribution — requires backend, see `docs/ROADMAP.md` § Backend)

---

## 9. Doc updates required

- [ ] `docs/CHANGELOG.md` — add entry in "Before/after narrative" format
- [ ] `docs/PRODUCT_ROADMAP.md` — flip status icon if a Phase 1–4 item shipped
- [ ] `docs/CX_FLOWS.md` — add or update flow diagram if user journey changed
- [ ] `TEST_RESULTS.md` — re-run + update after merge
- [ ] Cache version in `preview.html` bumped (`?v=N`)
- [ ] Tagline / brand-system file unchanged (or, if changed, steering file
      `.kiro/steering/perq.md` updated)

---

## 10. Sign-off

- [ ] Author: <name / agent identifier>
- [ ] Date: YYYY-MM-DD
- [ ] Reviewer: <user>
- [ ] All ACs verified on iPhone Safari at the preview URL with `?v=N` bumped
- [ ] All ACs verified on native (▶ Play in Xcode for iOS, APK install for Android)
- [ ] Supervisor hook gates passed on push

# Perq PWA

Static GitHub Pages-compatible PWA wrapped with Capacitor for native iOS and Android. Automated extraction (OCR via Cloudflare Worker proxy → Claude), wallet-first deal management, expiry reminders, radius-based beacon alerts, gamified rewards.

## Project layout

This is the working tree of the `cric85-git/deal-with-deals` repo. On the local machine it lives at `/Users/itsshail/Kiro-workspace/Perq_Dev/` (the parent `Kiro-workspace/` hosts unrelated work and is NOT part of this git repo).

- **Live URL:** https://cric85-git.github.io/deal-with-deals/preview.html?v=N
- **Bundle ID:** `com.perqwallet.app`
- **Tagline:** "Save more, miss nothing"

## Authoritative context

Read these before making non-trivial changes:

| File | What's there |
|---|---|
| `.kiro/steering/perq.md` | Standing rules, brand system, splash contract, tech stack, open gaps. Auto-loaded into every Kiro session. |
| `docs/CHANGELOG.md` | Per-feature commit history, latest at top |
| `TEST_PLAN.md` | Manual QA checklist |
| `TEST_RESULTS.md` | Last automated pass/fail snapshot |
| `TAKEOVER_REVIEW.md` | Engineering takeover assessment + priority fixes |
| `docs/native-capacitor-release.md` | Native release checklist |
| `.kiro/hooks/perq-supervisor.kiro.hook` | Pre-push 15-gate quality supervisor (v5) — blocks `git push` if any gate fails |

## Native apps

Capacitor 8.x. iOS uses Swift Package Manager (no CocoaPods, no `.xcworkspace`).

```bash
npm run build:native     # bundles preview.* into dist/
npx cap sync ios         # mirrors dist/ into ios/App/App/public + plugin sync
npx cap sync android     # same for android/
open ios/App/App.xcodeproj    # opens iOS project in Xcode
npx cap open android          # opens android/ in Android Studio
```

The Android APK auto-builds on every push to `main` via `.github/workflows/android-build.yml`. The iOS build requires a developer hitting ▶ Play in Xcode (or TestFlight upload).

## Splash asset generation

```bash
node scripts/build-splash.js     # regenerates 35 native splash PNGs
node scripts/build-boot-logo.js  # regenerates boot-logo.png (transparent bg)
npm run build:icons              # regenerates iOS + Android launcher icons
```

## Tests

```bash
npm test            # 148 cases — gamif / load / migration / render / brand / splash
npm run test:smoke  # 6 cases — Playwright cold-launch smoke
```

Both run on every push via the supervisor hook.

## Cache invalidation

Two independent mechanisms — bump BOTH when changes ship:

1. `?v=N` in `preview.html` (when `preview-app.js` changed)
2. `CACHE_NAME` in `sw.js` (when any other shipping file changed)

The supervisor hook enforces this at Gate 4A.1 + 4A.2.

## Native release checklist

See `docs/native-capacitor-release.md`.

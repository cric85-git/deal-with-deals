# Perq · Native Build Guide

Two paths to get Perq on a phone for beta testing.

## Path A: Android (today, automated)

You don't need any local Android tooling. GitHub Actions builds an APK on every push to `main`.

### Get the latest APK
1. Open https://github.com/cric85-git/deal-with-deals/releases on your Android phone
2. Find the most recent `Perq Android · build N` release
3. Tap the `perq-debug-*.apk` asset to download
4. Android will warn "install unknown apps" — allow for your browser
5. Tap the downloaded file → **Install**
6. Open Perq, grant Camera + Notifications when prompted

### Trigger a build manually
1. Go to https://github.com/cric85-git/deal-with-deals/actions
2. Click **Build Android APK** in the left sidebar
3. Click **Run workflow** → `main` → **Run workflow**
4. Wait ~3-4 minutes
5. New release with the APK appears on the Releases page

### What works in the Android build
- ✅ Camera + photo library (native picker via Capacitor Camera plugin)
- ✅ Local notifications scheduled per deal expiry (3 days, 1 day, day-of)
- ✅ Weekly digest notification ("3 deals expiring this week")
- ✅ Native share sheet (Capacitor Share plugin)
- ✅ Geolocation when permission granted
- ✅ Splash screen with brand color (`#0D1B2A`)
- ✅ Adaptive launcher icon (Navy + Mint pocket)
- ✅ Status-bar notification icon (`ic_stat_perq`)

---

## Path B: iOS (requires Apple Developer account)

iOS apps cannot be sideloaded like Android — you need TestFlight, which requires:
- An Apple Developer Program membership ($99/year)
- A Mac with Xcode 15+ installed (OR a CI service that provides macOS runners)

Once you have those, here's the build:

### One-time setup
1. Enroll at https://developer.apple.com/programs/ ($99/year, ~24-48h approval)
2. Install Xcode from the Mac App Store (free, but ~10GB download)
3. Open Xcode → Preferences → Accounts → add your Apple ID
4. Create an App ID + Provisioning profile in https://developer.apple.com/account
5. App Store Connect → My Apps → New App (bundle ID: `com.perqwallet.app`)

### Local build (one-time per release)
```bash
npm run build:icons       # regenerate brand assets if SVGs changed
npm run cap:sync          # bundles preview.html + preview-app.js into ios/
npm run cap:open:ios      # opens Xcode
```

In Xcode:
1. Select the **App** target
2. Set Team to your Apple Developer team (Signing & Capabilities tab)
3. Product → Archive
4. Window → Organizer → Distribute App → App Store Connect → Upload
5. Wait ~10-15 min for Apple to process
6. App Store Connect → TestFlight → add internal testers (up to 100 free)
7. Tester gets email → installs TestFlight on their iPhone → invites Perq

### Automating iOS builds
GitHub Actions can build iOS too, but each build minute on macOS runners costs 10x more than Linux. For now Android-only auto-build saves cost; iOS is manual until you're closer to public launch.

If you want iOS auto-build later, add `.github/workflows/ios-build.yml` with `runs-on: macos-latest` and either:
- Manual TestFlight upload via `xcrun altool` + an App Store Connect API key
- Use a service like [Codemagic](https://codemagic.io) or [Bitrise](https://bitrise.io) that's optimized for iOS builds

---

## Local development (testing native features without CI)

### Android
Requires: Android Studio + Android SDK + a connected device or emulator
```bash
npm run cap:open:android
# In Android Studio: Run > Run 'app'
```

### iOS
Requires: Xcode + a connected iPhone (or simulator)
```bash
npm run cap:open:ios
# In Xcode: Product > Run
```

---

## What lives where

| Path | Purpose |
|------|---------|
| `preview.html`, `preview-app.js` | The actual app — both web preview and native |
| `native-bridge.js` | Capacitor plugin wrapper (notifications, camera, geo, share). No-ops on web |
| `brand/perq-icon.svg` | Brand source of truth |
| `scripts/build-icons.js` | SVG → PWA PNGs (icon-192/512/180/maskable) |
| `scripts/build-app-icons.js` | SVG → Android mipmaps + iOS asset catalog |
| `scripts/build-native.js` | Bundles `preview.*` into `dist/` for Capacitor |
| `dist/` | Generated; copied into `ios/App/App/public` and `android/.../assets/public` by `cap sync` |
| `android/`, `ios/` | Capacitor native projects — committed to git |
| `.github/workflows/android-build.yml` | CI that auto-builds APK on push |

## Development cycle

```bash
# 1. Make changes to preview.html / preview-app.js / native-bridge.js
# 2. Test in browser:
open preview.html

# 3. Run tests
npm test

# 4. Commit + push — Android APK auto-builds on CI
git add -A && git commit -m "feat: ..." && git push

# 5. For local native testing:
npm run cap:sync
npm run cap:open:android   # or :ios
```

## Reminder notification copy reference

These are the exact texts that fire on native (Android + iOS):

| Trigger | Title | Body |
|---------|-------|------|
| 3 days before expiry, 6 PM local | `⏰ Deal expires in 3 days` | `{Merchant} · {Discount} expires {date}. Don't forget to use it.` |
| 1 day before expiry, 6 PM local | `⚠️ Last chance — expires tomorrow` | `{Merchant} · {Discount}. Tomorrow is the last day to use this deal.` |
| Day of expiry, 10 AM local | `🔥 Final day to use this deal` | `{Merchant} · {Discount} expires today. Open Perq.` |
| Sundays at 9 AM (if 3+ deals expire that week) | `📋 N deals expiring this week` | `Open Perq to review what to use before they're gone.` |

Schedules are recomputed and de-duplicated whenever:
- A deal is saved, redeemed, or deleted
- The reminders toggle is flipped on
- The bell icon is tapped
- The app is opened (cold start)

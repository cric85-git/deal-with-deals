# Perq PWA

Static GitHub Pages-compatible PWA with automated extraction, branding, onboarding, expiry reminders, and radius-based beacon alerts.

Backend design notes live in `docs/` for AI capture, email ingestion, crawler-fed discovery, and always-on beacon upgrades.

## Native apps

Capacitor is configured for iOS and Android without changing the root GitHub Pages deployment.

- `npm run build:native` copies the static app into `dist/`.
- `npm run cap:sync` refreshes iOS/Android web assets, config, and plugins.
- `npm run cap:open:ios` opens the Xcode project after sync.
- `npm run cap:open:android` opens the Android Studio project after sync.

See `docs/native-capacitor-release.md` for the release checklist.

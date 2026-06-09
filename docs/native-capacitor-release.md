# Perq Native App Release Path

Perq now uses Capacitor for iOS and Android while staying a static GitHub Pages PWA from the repo root.

## Hands-off local flow

1. `npm install`
2. `npm run build:native`
3. `npm run cap:sync`

The platform folders are already present in this repo. Use:

- `npm run cap:open:ios` to open Xcode
- `npm run cap:open:android` to open Android Studio

## Local machine prerequisites

- Full Xcode install for iOS builds. Command Line Tools alone are not enough for `xcodebuild`.
- Java runtime/JDK and Android Studio for Android Gradle builds.
- Apple and Google signing credentials for release binaries.

## What Capacitor owns

- `capacitor.config.json` sets the native app name to `Perq`, app id to `com.perqwallet.app`, and web output to `dist`.
- `scripts/build-native.js` copies the static root app into `dist` for native packaging.
- Native icons and splash screens are already generated in the iOS and Android projects from the approved root `icon-512.png`.
- GitHub Pages still serves from repo root. The `dist` folder is generated and is not the website deployment source.

## Native capabilities to wire into production

- Camera: use `@capacitor/camera` for coupon photos and gallery imports.
- Geolocation: use `@capacitor/geolocation` for nearby deal checks.
- Local notifications: use `@capacitor/local-notifications` for configurable expiry and proximity reminders.
- Push notifications: use `@capacitor/push-notifications` when the backend can send server-side reminders.
- Share: use `@capacitor/share` for native sharing.
- Preferences: use `@capacitor/preferences` when local profile/settings should move beyond browser storage.

## External items still required

- Apple Developer account, app record, bundle id ownership, signing team, App Store screenshots, privacy nutrition labels.
- Google Play Console account, app record, Play App Signing, release track, store listing, data safety form.
- Production OCR/email/push backend secrets. These should not be embedded in the static app.

## Release checklist

- Run `npm test`.
- Run `npm run test:smoke` when a browser is available.
- Run `npm run cap:sync`.
- Confirm iOS permission strings in `ios/App/App/Info.plist`.
- Confirm Android permissions in `android/app/src/main/AndroidManifest.xml`.
- Confirm native app icons and splash assets are present in the platform projects.
- Archive iOS from Xcode and upload with Transporter or Xcode Organizer.
- Build Android `.aab` from Android Studio and upload to Google Play.

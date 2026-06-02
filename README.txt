PERQ APPROVED BRANDING BUILD

Upload ALL files in this ZIP to the root of your GitHub repo and replace existing files.

This version uses only the approved Perq PNG assets for the PWA icon, splash screen, and header logo.
It also adds first-run profile setup, configurable expiry reminders, radius-based beacon alerts, richer deal fields, and email/discovery module designs.
Capacitor native app projects are included for iOS and Android while GitHub Pages still serves from the repo root.

Files included:
- index.html
- app.js
- sw.js
- manifest.json
- apple-touch-icon.png
- icon-192.png
- icon-512.png
- capacitor.config.json
- ios/
- android/
- scripts/build-native.js
- TEST_RESULTS.md

Native app flow:
1. npm install
2. npm run cap:sync
3. npm run cap:open:ios, or npm run cap:open:android

After commit:
1. Wait 2-3 minutes for GitHub Pages.
2. On iPhone: delete the installed Perq PWA.
3. Settings > Safari > Advanced > Website Data > remove cric85-git.github.io, or clear website data.
4. Reboot if iOS still shows the old cached icon.
5. Open the site in Safari and Add to Home Screen again.

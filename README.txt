PERQ LOGO FIX — HEADER + SPLASH + ICONS

Upload these files to the root of your GitHub repo and replace existing files:

- index.html
- manifest.json
- sw.js
- icon-180.png
- apple-touch-icon.png
- icon-192.png
- icon-512.png
- icon-maskable-512.png

What this fixes:
- Old DwD logo on launch/loading screen
- Old DwD logo in app header
- Old app theme color
- iPhone home-screen icon references
- Service worker cache version

After committing:
1. Wait 2-3 minutes for GitHub Pages.
2. Delete the installed Perq PWA from your iPhone.
3. Reboot iPhone if the old splash/icon remains cached.
4. Open https://cric85-git.github.io/deal-with-deals/ in Safari.
5. Add to Home Screen again.

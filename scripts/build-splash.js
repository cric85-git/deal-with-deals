/**
 * Generate the launch splash for iOS + Android with the Perq wallet logo,
 * "Perq" wordmark in mint, and the tagline "Save more, miss nothing".
 *
 * Source artwork: rendered to a single 2732×2732 PNG (the largest size any
 * Capacitor splash slot needs). Then copied to every required location —
 * Capacitor's CENTER_CROP scaling handles per-device sizing.
 *
 * Run: node scripts/build-splash.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SIZE = 2732;

// All target splash locations (iOS asset catalog + Android drawables).
// Capacitor + the LaunchScreen.storyboard center-crop on each device.
const TARGETS = [
  // iOS Splash.imageset
  'ios/App/App/Assets.xcassets/Splash.imageset/Default@1x~universal~anyany.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/Default@2x~universal~anyany.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/Default@3x~universal~anyany.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/Default@1x~universal~anyany-dark.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/Default@2x~universal~anyany-dark.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/Default@3x~universal~anyany-dark.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png',
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png',
  // Android drawables — covers port/land × ldpi…xxxhdpi × default/night
  'android/app/src/main/res/drawable/splash.png',
  'android/app/src/main/res/drawable-night/splash.png',
  'android/app/src/main/res/drawable-port-ldpi/splash.png',
  'android/app/src/main/res/drawable-port-mdpi/splash.png',
  'android/app/src/main/res/drawable-port-hdpi/splash.png',
  'android/app/src/main/res/drawable-port-xhdpi/splash.png',
  'android/app/src/main/res/drawable-port-xxhdpi/splash.png',
  'android/app/src/main/res/drawable-port-xxxhdpi/splash.png',
  'android/app/src/main/res/drawable-port-night-ldpi/splash.png',
  'android/app/src/main/res/drawable-port-night-mdpi/splash.png',
  'android/app/src/main/res/drawable-port-night-hdpi/splash.png',
  'android/app/src/main/res/drawable-port-night-xhdpi/splash.png',
  'android/app/src/main/res/drawable-port-night-xxhdpi/splash.png',
  'android/app/src/main/res/drawable-port-night-xxxhdpi/splash.png',
  'android/app/src/main/res/drawable-land-ldpi/splash.png',
  'android/app/src/main/res/drawable-land-mdpi/splash.png',
  'android/app/src/main/res/drawable-land-hdpi/splash.png',
  'android/app/src/main/res/drawable-land-xhdpi/splash.png',
  'android/app/src/main/res/drawable-land-xxhdpi/splash.png',
  'android/app/src/main/res/drawable-land-xxxhdpi/splash.png',
  'android/app/src/main/res/drawable-land-night-ldpi/splash.png',
  'android/app/src/main/res/drawable-land-night-mdpi/splash.png',
  'android/app/src/main/res/drawable-land-night-hdpi/splash.png',
  'android/app/src/main/res/drawable-land-night-xhdpi/splash.png',
  'android/app/src/main/res/drawable-land-night-xxhdpi/splash.png',
  'android/app/src/main/res/drawable-land-night-xxxhdpi/splash.png'
];

// Splash artwork — square 2732×2732. Capacitor / iOS LaunchScreen apply
// scaleAspectFill so on iPhone (1170×2532 device px) the content gets
// scaled by ~0.927 and cropped horizontally. To make the displayed sizes
// match human-readable target sizes we render content small in the
// source: logo ~12% canvas, "Perq" word ~4% font, tagline ~1.6% font.
// Vertically the content sits in the upper portion (top-aligned) so it
// reads like a launch frame, not centered like a hero unit.
function splashHtml(size) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${size}px;height:${size}px;overflow:hidden;
      font-family:-apple-system,'SF Pro Display','Helvetica Neue',sans-serif;
      background:linear-gradient(160deg,#082b6f 0%,#020817 100%)}
    .stage{width:100%;height:100%;display:flex;flex-direction:column;
      align-items:center;justify-content:flex-start;padding-top:${Math.round(size*0.27)}px;gap:${Math.round(size*0.012)}px}
    .logo{width:${Math.round(size*0.12)}px;height:${Math.round(size*0.12)}px}
    .word{font-size:${Math.round(size*0.042)}px;font-weight:850;color:#34D399;
      letter-spacing:-0.02em;line-height:1;margin-top:${Math.round(size*0.008)}px}
    .tag{font-size:${Math.round(size*0.0155)}px;font-weight:500;
      color:rgba(255,255,255,0.72);letter-spacing:0.02em}
  </style></head><body>
    <div class="stage">
      <svg class="logo" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="card" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#A7F3D0"/><stop offset="1" stop-color="#FCD34D"/>
          </linearGradient>
          <linearGradient id="wallet" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#10B981"/><stop offset="1" stop-color="#047857"/>
          </linearGradient>
          <linearGradient id="clasp" x1="0" y1="0" x2="1" y2="1">
            <stop stop-color="#FCD34D"/><stop offset="1" stop-color="#F59E0B"/>
          </linearGradient>
          <filter id="ws" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="14" stdDeviation="14" flood-opacity="0.4"/>
          </filter>
        </defs>
        <rect x="150" y="105" width="210" height="130" rx="24" fill="url(#card)"
              transform="rotate(-9 256 170)" opacity="0.95"/>
        <text x="255" y="195" font-family="-apple-system,'SF Pro Display',sans-serif"
              font-size="72" font-weight="800" fill="#0F172A" text-anchor="middle">$</text>
        <path d="M112 178 Q112 145 145 145 H367 Q400 145 400 178 V350 Q400 395 355 395 H157 Q112 395 112 350 Z"
              fill="url(#wallet)" filter="url(#ws)"/>
        <path d="M112 178 Q112 145 145 145 H367 Q400 145 400 178"
              fill="none" stroke="#065F46" stroke-width="8"/>
        <rect x="350" y="245" width="58" height="78" rx="20" fill="#0F172A"/>
        <circle cx="378" cy="284" r="13" fill="url(#clasp)"/>
      </svg>
      <div class="word">Perq</div>
      <div class="tag">Save more, miss nothing</div>
    </div>
  </body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: SIZE, height: SIZE });
  await page.setContent(splashHtml(SIZE), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  // Render once to a tmp PNG, then copy to every target.
  const tmp = path.join(ROOT, 'dist', 'splash-master.png');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  await page.screenshot({ path: tmp, omitBackground: false,
    clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
  await page.close();
  await ctx.close();
  await browser.close();

  const masterBuf = fs.readFileSync(tmp);
  let written = 0;
  for (const rel of TARGETS) {
    const out = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, masterBuf);
    written++;
  }
  const kb = (masterBuf.length / 1024).toFixed(1);
  console.log(`  ✓ Splash master: ${SIZE}×${SIZE} (${kb} KB)`);
  console.log(`  ✓ Wrote to ${written} platform locations`);
}

main().catch(err => {
  console.error('Splash build failed:', err);
  process.exit(1);
});

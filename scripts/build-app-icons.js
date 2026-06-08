/**
 * Generate Android mipmap icons + iOS asset catalog icons from brand SVGs.
 * Run after: node scripts/build-icons.js (which produces the source SVGs)
 *
 * Android: writes ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png
 *          across mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi
 * iOS:     writes AppIcon images at all required sizes into the asset catalog
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BRAND_SVG = path.join(ROOT, 'brand', 'perq-icon.svg');
const BRAND_MASKABLE_SVG = path.join(ROOT, 'brand', 'perq-icon-maskable.svg');

// Android adaptive icon sizes per density (108dp icon, 72dp foreground safe zone)
// Standard ic_launcher: mdpi=48, hdpi=72, xhdpi=96, xxhdpi=144, xxxhdpi=192
// Foreground (full canvas): mdpi=108, hdpi=162, xhdpi=216, xxhdpi=324, xxxhdpi=432
const ANDROID_TARGETS = [
  // Square launcher
  { svg: BRAND_SVG, size: 48,  out: 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png' },
  { svg: BRAND_SVG, size: 72,  out: 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png' },
  { svg: BRAND_SVG, size: 96,  out: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png' },
  { svg: BRAND_SVG, size: 144, out: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png' },
  { svg: BRAND_SVG, size: 192, out: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png' },
  // Round launcher (same artwork — Android masks to circle)
  { svg: BRAND_SVG, size: 48,  out: 'android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png' },
  { svg: BRAND_SVG, size: 72,  out: 'android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png' },
  { svg: BRAND_SVG, size: 96,  out: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png' },
  { svg: BRAND_SVG, size: 144, out: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png' },
  { svg: BRAND_SVG, size: 192, out: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png' },
  // Adaptive foreground (uses maskable variant — content in 80% safe zone)
  { svg: BRAND_MASKABLE_SVG, size: 108, out: 'android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png' },
  { svg: BRAND_MASKABLE_SVG, size: 162, out: 'android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png' },
  { svg: BRAND_MASKABLE_SVG, size: 216, out: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png' },
  { svg: BRAND_MASKABLE_SVG, size: 324, out: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png' },
  { svg: BRAND_MASKABLE_SVG, size: 432, out: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png' }
];

// iOS asset catalog (Capacitor's default AppIcon.appiconset)
// Spec: https://developer.apple.com/design/human-interface-guidelines/app-icons
const IOS_DIR = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
const IOS_TARGETS = [
  // iPhone Notification, Settings, Spotlight (2x, 3x)
  { svg: BRAND_SVG, size: 40,  out: `${IOS_DIR}/AppIcon-20@2x.png` },   // 20pt @2x
  { svg: BRAND_SVG, size: 60,  out: `${IOS_DIR}/AppIcon-20@3x.png` },   // 20pt @3x
  { svg: BRAND_SVG, size: 58,  out: `${IOS_DIR}/AppIcon-29@2x.png` },   // 29pt @2x
  { svg: BRAND_SVG, size: 87,  out: `${IOS_DIR}/AppIcon-29@3x.png` },   // 29pt @3x
  { svg: BRAND_SVG, size: 80,  out: `${IOS_DIR}/AppIcon-40@2x.png` },   // 40pt @2x
  { svg: BRAND_SVG, size: 120, out: `${IOS_DIR}/AppIcon-40@3x.png` },   // 40pt @3x
  // App
  { svg: BRAND_SVG, size: 120, out: `${IOS_DIR}/AppIcon-60@2x.png` },   // 60pt @2x (iPhone)
  { svg: BRAND_SVG, size: 180, out: `${IOS_DIR}/AppIcon-60@3x.png` },   // 60pt @3x (iPhone Plus)
  // iPad (mostly nice-to-have for universal binary)
  { svg: BRAND_SVG, size: 76,  out: `${IOS_DIR}/AppIcon-76.png` },      // 76pt @1x (iPad)
  { svg: BRAND_SVG, size: 152, out: `${IOS_DIR}/AppIcon-76@2x.png` },   // 76pt @2x (iPad Pro)
  { svg: BRAND_SVG, size: 167, out: `${IOS_DIR}/AppIcon-83.5@2x.png` }, // 83.5pt @2x (iPad Pro 12.9")
  // App Store / marketing (REQUIRED for TestFlight + App Store)
  { svg: BRAND_SVG, size: 1024, out: `${IOS_DIR}/AppIcon-512@2x.png` }  // 1024×1024 for App Store
];

const TARGETS = [...ANDROID_TARGETS, ...IOS_TARGETS];

// Status-bar icon for Android notifications (monochrome, tinted by iconColor)
const STAT_TARGETS = [
  { svg: 'brand/perq-stat-icon.svg', size: 24,  out: 'android/app/src/main/res/drawable-mdpi/ic_stat_perq.png' },
  { svg: 'brand/perq-stat-icon.svg', size: 36,  out: 'android/app/src/main/res/drawable-hdpi/ic_stat_perq.png' },
  { svg: 'brand/perq-stat-icon.svg', size: 48,  out: 'android/app/src/main/res/drawable-xhdpi/ic_stat_perq.png' },
  { svg: 'brand/perq-stat-icon.svg', size: 72,  out: 'android/app/src/main/res/drawable-xxhdpi/ic_stat_perq.png' },
  { svg: 'brand/perq-stat-icon.svg', size: 96,  out: 'android/app/src/main/res/drawable-xxxhdpi/ic_stat_perq.png' }
];

async function main() {
  for (const t of [BRAND_SVG, BRAND_MASKABLE_SVG]) {
    if (!fs.existsSync(t)) {
      console.error(`Missing brand SVG: ${t}`);
      console.error('Run: node scripts/build-icons.js first');
      process.exit(1);
    }
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });

  for (const t of TARGETS) {
    const svgRaw = fs.readFileSync(t.svg, 'utf8');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0}
      html,body{width:${t.size}px;height:${t.size}px;background:transparent}
      svg{width:${t.size}px !important;height:${t.size}px !important;display:block}
    </style></head><body>${svgRaw}</body></html>`;

    const page = await ctx.newPage();
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts && document.fonts.ready);

    const outPath = path.join(ROOT, t.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({
      path: outPath,
      omitBackground: false,
      clip: { x: 0, y: 0, width: t.size, height: t.size }
    });
    await page.close();

    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`  ✓ ${t.out} (${t.size}px, ${sizeKb} KB)`);
  }

  // Status icons need transparent background
  for (const t of STAT_TARGETS) {
    const svgPath = path.join(ROOT, t.svg);
    const svgRaw = fs.readFileSync(svgPath, 'utf8');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0}
      html,body{width:${t.size}px;height:${t.size}px;background:transparent}
      svg{width:${t.size}px !important;height:${t.size}px !important;display:block}
    </style></head><body>${svgRaw}</body></html>`;

    const page = await ctx.newPage();
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(html, { waitUntil: 'load' });
    const outPath = path.join(ROOT, t.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({
      path: outPath,
      omitBackground: true, // transparent for status bar tinting
      clip: { x: 0, y: 0, width: t.size, height: t.size }
    });
    await page.close();
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`  ✓ ${t.out} (${t.size}px, ${sizeKb} KB)`);
  }

  await ctx.close();
  await browser.close();

  // Write iOS Contents.json so Xcode knows about all the images
  const iosContents = {
    images: [
      { idiom: 'iphone', scale: '2x', size: '20x20', filename: 'AppIcon-20@2x.png' },
      { idiom: 'iphone', scale: '3x', size: '20x20', filename: 'AppIcon-20@3x.png' },
      { idiom: 'iphone', scale: '2x', size: '29x29', filename: 'AppIcon-29@2x.png' },
      { idiom: 'iphone', scale: '3x', size: '29x29', filename: 'AppIcon-29@3x.png' },
      { idiom: 'iphone', scale: '2x', size: '40x40', filename: 'AppIcon-40@2x.png' },
      { idiom: 'iphone', scale: '3x', size: '40x40', filename: 'AppIcon-40@3x.png' },
      { idiom: 'iphone', scale: '2x', size: '60x60', filename: 'AppIcon-60@2x.png' },
      { idiom: 'iphone', scale: '3x', size: '60x60', filename: 'AppIcon-60@3x.png' },
      { idiom: 'ipad',   scale: '1x', size: '20x20', filename: 'AppIcon-20@2x.png' },
      { idiom: 'ipad',   scale: '2x', size: '20x20', filename: 'AppIcon-20@2x.png' },
      { idiom: 'ipad',   scale: '1x', size: '29x29', filename: 'AppIcon-29@2x.png' },
      { idiom: 'ipad',   scale: '2x', size: '29x29', filename: 'AppIcon-29@2x.png' },
      { idiom: 'ipad',   scale: '1x', size: '40x40', filename: 'AppIcon-40@2x.png' },
      { idiom: 'ipad',   scale: '2x', size: '40x40', filename: 'AppIcon-40@2x.png' },
      { idiom: 'ipad',   scale: '1x', size: '76x76', filename: 'AppIcon-76.png' },
      { idiom: 'ipad',   scale: '2x', size: '76x76', filename: 'AppIcon-76@2x.png' },
      { idiom: 'ipad',   scale: '2x', size: '83.5x83.5', filename: 'AppIcon-83.5@2x.png' },
      { idiom: 'ios-marketing', scale: '1x', size: '1024x1024', filename: 'AppIcon-512@2x.png' }
    ],
    info: { author: 'xcode', version: 1 }
  };
  const iosContentsPath = path.join(ROOT, IOS_DIR, 'Contents.json');
  fs.mkdirSync(path.dirname(iosContentsPath), { recursive: true });
  fs.writeFileSync(iosContentsPath, JSON.stringify(iosContents, null, 2));
  console.log(`  ✓ ${IOS_DIR}/Contents.json`);

  console.log(`\nGenerated ${TARGETS.length} platform icons.`);
}

main().catch(err => {
  console.error('Icon build failed:', err);
  process.exit(1);
});

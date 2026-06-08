/**
 * Build the native web bundle into dist/.
 * Capacitor copies dist/ -> ios/App/App/public/ and android/app/src/main/assets/public/.
 *
 * Source files used:
 *   preview.html  -> dist/index.html (with Capacitor runtime bridge injected)
 *   preview-app.js -> dist/preview-app.js
 *   native-bridge.js -> dist/native-bridge.js (loaded BEFORE preview-app.js)
 *   manifest.json, icons, sw.js -> copied as-is
 *
 * Produces a real index.html so Capacitor's native shell loads our actual app
 * (the legacy app.js/index.html is intentionally NOT bundled).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

// Tuple: [source-relative, dist-target-name, transform?]
const ASSETS = [
  ['preview.html', 'index.html', transformIndexHtml],
  ['preview-app.js', 'preview-app.js'],
  ['native-bridge.js', 'native-bridge.js'],
  ['manifest.json', 'manifest.json'],
  ['icon-192.png', 'icon-192.png'],
  ['icon-512.png', 'icon-512.png'],
  ['icon-180.png', 'icon-180.png'],
  ['apple-touch-icon.png', 'apple-touch-icon.png'],
  ['icon-maskable-512.png', 'icon-maskable-512.png']
];

function transformIndexHtml(html) {
  // 1) Inject Capacitor runtime BEFORE the app script
  // 2) Inject native-bridge BEFORE preview-app.js
  // 3) Strip any cache-buster ?v=N (irrelevant inside native bundle)
  let out = html;

  // Strip ?v=N from preview-app.js script tag
  out = out.replace(/preview-app\.js\?v=\d+/g, 'preview-app.js');

  // Inject native-bridge + capacitor before preview-app.js
  const bridgeTag = '<script src="native-bridge.js"></script>';
  const capTag = '<script src="capacitor.js"></script>';

  if (!out.includes('capacitor.js')) {
    out = out.replace(
      /<script src="preview-app\.js"><\/script>/,
      `${capTag}\n${bridgeTag}\n<script src="preview-app.js"></script>`
    );
  } else if (!out.includes('native-bridge.js')) {
    out = out.replace(
      /<script src="capacitor\.js"><\/script>/,
      `${capTag}\n${bridgeTag}`
    );
  }

  return out;
}

function ensureCleanDist() {
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist, { recursive: true });
}

function copyOne([src, dstName, transform]) {
  const srcPath = path.join(root, src);
  const dstPath = path.join(dist, dstName);
  if (!fs.existsSync(srcPath)) {
    if (src.endsWith('.png') && !src.includes('icon-')) {
      console.warn(`  ⚠ optional asset missing: ${src}`);
      return;
    }
    throw new Error(`Missing required native asset: ${src}`);
  }
  if (transform) {
    const text = fs.readFileSync(srcPath, 'utf8');
    fs.writeFileSync(dstPath, transform(text));
  } else {
    fs.copyFileSync(srcPath, dstPath);
  }
  const size = (fs.statSync(dstPath).size / 1024).toFixed(1);
  console.log(`  ✓ ${dstName} (${size} KB)`);
}

ensureCleanDist();
console.log('Building native web bundle to dist/');
ASSETS.forEach(copyOne);

const marker = {
  app: 'Perq',
  generatedAt: new Date().toISOString(),
  source: 'scripts/build-native.js',
  entryPoint: 'index.html (from preview.html)',
  appLogic: 'preview-app.js',
  bridge: 'native-bridge.js'
};
fs.writeFileSync(path.join(dist, 'native-build.json'), JSON.stringify(marker, null, 2));

console.log(`\nBuilt ${ASSETS.length} files in ${path.relative(root, dist)}/`);
console.log('Next: npx cap sync   # syncs dist/ into ios/ and android/');

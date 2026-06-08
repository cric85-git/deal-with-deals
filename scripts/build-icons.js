/**
 * Render Perq brand SVGs to PNG icons at the sizes the PWA + iOS Apple Touch need.
 * Uses Playwright (already a dev dep) so output is consistent across machines —
 * no native imagemagick / sips dependencies required.
 *
 * Outputs to repo root (where index.html / manifest.json live):
 *   icon-512.png            — 512×512 (PWA)
 *   icon-192.png            — 192×192 (PWA)
 *   icon-180.png            — 180×180 (Apple Touch)
 *   icon-maskable-512.png   — 512×512 maskable
 *   apple-touch-icon.png    — 180×180 alias for iOS
 *
 * Run: node scripts/build-icons.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BRAND_DIR = path.join(ROOT, 'brand');

const TARGETS = [
  { svg: 'perq-icon.svg',          out: 'icon-512.png',          size: 512 },
  { svg: 'perq-icon.svg',          out: 'icon-192.png',          size: 192 },
  { svg: 'perq-icon.svg',          out: 'icon-180.png',          size: 180 },
  { svg: 'perq-icon.svg',          out: 'apple-touch-icon.png',  size: 180 },
  { svg: 'perq-icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 }
];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });

  for (const t of TARGETS) {
    const svgPath = path.join(BRAND_DIR, t.svg);
    if (!fs.existsSync(svgPath)) {
      console.error(`Missing SVG: ${svgPath}`);
      process.exit(1);
    }
    const svgRaw = fs.readFileSync(svgPath, 'utf8');

    // Wrap in an HTML page sized exactly to the target with no margins, and
    // force the SVG to fill the viewport. The "shape-rendering" hint and
    // explicit width/height on the SVG ensure pixel-perfect output.
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0}
      html,body{width:${t.size}px;height:${t.size}px;background:transparent}
      svg{width:${t.size}px !important;height:${t.size}px !important;display:block}
    </style></head><body>${svgRaw}</body></html>`;

    const page = await ctx.newPage();
    await page.setViewportSize({ width: t.size, height: t.size });
    await page.setContent(html, { waitUntil: 'load' });
    // Allow webfonts to settle (we use system fonts but be safe)
    await page.evaluate(() => document.fonts && document.fonts.ready);

    const outPath = path.join(ROOT, t.out);
    await page.screenshot({
      path: outPath,
      omitBackground: false,
      clip: { x: 0, y: 0, width: t.size, height: t.size }
    });
    await page.close();

    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`✓ ${t.out} (${t.size}×${t.size}, ${sizeKb} KB)`);
  }

  await ctx.close();
  await browser.close();
  console.log('\nAll icons rendered.');
}

main().catch(err => {
  console.error('Icon build failed:', err);
  process.exit(1);
});

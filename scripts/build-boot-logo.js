/**
 * Generate boot-logo.png — a transparent-background PNG of just the Perq
 * wallet logo, sized for the in-webview boot splash overlay.
 *
 * Why this exists: the boot overlay used to reference icon-192.png (the PWA
 * launcher icon). That file has a white square background designed to be
 * masked by iOS rounded corners or Android adaptive shapes — when rendered
 * directly on the dark splash background it shows the white frame. This
 * script renders the same SVG used in build-splash.js to a TRANSPARENT
 * 208×208 PNG (2× the displayed 104×104 size, for retina sharpness).
 *
 * Run: node scripts/build-boot-logo.js
 *
 * Output: <repo-root>/boot-logo.png
 */
const { chromium } = require('playwright');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'boot-logo.png');

// Render at 2x the displayed size (104px) so the raster is crisp on retina.
// width="104" height="104" in the <img> tag will downsample 208→104 with
// the browser's native bilinear/bicubic for sharp edges.
const RENDER_SIZE = 208;

const SVG = `<svg width="${RENDER_SIZE}" height="${RENDER_SIZE}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
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
</svg>`;

const HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${RENDER_SIZE}px;height:${RENDER_SIZE}px;overflow:hidden;background:transparent}
</style></head><body>${SVG}</body></html>`;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    deviceScaleFactor: 1,
    viewport: { width: RENDER_SIZE, height: RENDER_SIZE }
  });
  const page = await ctx.newPage();
  await page.setContent(HTML, { waitUntil: 'load' });
  // omitBackground:true preserves alpha — this is what makes the PNG
  // transparent rather than picking up the page bg.
  await page.screenshot({ path: OUT, omitBackground: true, type: 'png' });
  await browser.close();
  const stat = require('fs').statSync(OUT);
  console.log(`  ✓ boot-logo.png: ${RENDER_SIZE}×${RENDER_SIZE} (${(stat.size/1024).toFixed(1)} KB) — transparent bg`);
  console.log(`  → Wrote to ${path.relative(ROOT, OUT)}`);
}

main().catch(e => { console.error(e); process.exit(1); });

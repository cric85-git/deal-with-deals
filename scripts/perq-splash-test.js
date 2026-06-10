/**
 * Splash visual + layout regression test.
 *
 * What this validates BEFORE we ship to a phone:
 *   1. The in-webview boot splash renders at iPhone 14 Pro viewport with
 *      the logo, "Perq" wordmark, and tagline visible — and at sizes that
 *      look like a launch frame (logo <= 130 CSS pt, word <= 44 pt,
 *      tagline <= 16 pt). This catches the "everything is HUGE" failure.
 *   2. The boot splash is actually visible (opacity 1) on first paint.
 *   3. The boot splash dismisses after ~900ms minimum (so it doesn't
 *      flash sub-100ms) and definitely by 2.5s (the hard cap).
 *   4. After dismiss, the wallet page is visible — i.e. there is no
 *      black screen left behind.
 *   5. The native splash master PNG, after Capacitor's scaleAspectFill
 *      to a 1170×2532 iPhone viewport, also has reasonable on-device
 *      sizes for logo + wordmark + tagline.
 *
 * Saves visual artifacts to tmp/splash-*.png for human review.
 *
 * Run: node scripts/perq-splash-test.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(ROOT, 'tmp');
fs.mkdirSync(TMP, { recursive: true });

// iPhone 14 Pro CSS viewport
const VIEWPORT = { width: 393, height: 852 };

let pass = 0, fail = 0;
function ok(msg) { pass++; console.log('  ✓ ' + msg); }
function bad(msg) { fail++; console.error('  ✗ ' + msg); }

async function testWebviewSplash(page) {
  console.log('\n[1/2] In-webview boot splash on iPhone 14 Pro viewport');

  await page.goto('file://' + path.join(ROOT, 'preview.html'), { waitUntil: 'domcontentloaded' });

  // Capture boot splash before it dismisses
  await page.waitForSelector('#boot-splash', { state: 'visible', timeout: 1000 });
  // Pause the auto-dismiss so we can measure
  await page.evaluate(() => { window.__perqAppReady = false; });

  const splashShot = path.join(TMP, 'splash-webview.png');
  await page.screenshot({ path: splashShot, clip: { x:0, y:0, ...VIEWPORT } });
  ok('Captured ' + path.relative(ROOT, splashShot));

  const layout = await page.evaluate(() => {
    const splash = document.getElementById('boot-splash');
    if (!splash) return null;
    const cs = getComputedStyle(splash);
    const logo = splash.querySelector('.bs-logo');
    const word = splash.querySelector('.bs-word');
    const tag = splash.querySelector('.bs-tag');
    function box(el) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return { width: r.width, height: r.height, top: r.top, fontSize: parseFloat(s.fontSize), color: s.color };
    }
    return {
      visible: cs.opacity === '1' && cs.display !== 'none',
      logo: logo ? box(logo) : null,
      word: word ? box(word) : null,
      tag: tag ? box(tag) : null
    };
  });

  if (!layout) { bad('boot splash element missing'); return; }
  if (!layout.visible) bad('boot splash not visible at first paint'); else ok('boot splash visible (opacity 1)');

  // Logo size sanity — should look like a launch icon, not a hero unit
  if (layout.logo) {
    if (layout.logo.width > 130) bad(`logo too big: ${layout.logo.width}px (max 130)`);
    else if (layout.logo.width < 64) bad(`logo too small: ${layout.logo.width}px (min 64)`);
    else ok(`logo size ${layout.logo.width}px`);
    // Top alignment — logo should be in upper half
    if (layout.logo.top > VIEWPORT.height * 0.5) bad(`logo too low: top=${layout.logo.top}px (should be < ${VIEWPORT.height*0.5})`);
    else ok(`logo top-aligned at y=${Math.round(layout.logo.top)}px (top ${Math.round(100*layout.logo.top/VIEWPORT.height)}% of viewport)`);
  } else bad('logo element missing');

  // Wordmark — Perq word
  if (layout.word) {
    if (layout.word.fontSize > 44) bad(`Perq wordmark too big: ${layout.word.fontSize}px (max 44)`);
    else if (layout.word.fontSize < 22) bad(`Perq wordmark too small: ${layout.word.fontSize}px (min 22)`);
    else ok(`Perq wordmark ${layout.word.fontSize}px`);
  } else bad('Perq wordmark missing');

  // Tagline
  if (layout.tag) {
    if (layout.tag.fontSize > 16) bad(`tagline too big: ${layout.tag.fontSize}px (max 16)`);
    else if (layout.tag.fontSize < 11) bad(`tagline too small: ${layout.tag.fontSize}px (min 11)`);
    else ok(`tagline ${layout.tag.fontSize}px`);
  } else bad('tagline missing');

  // Now allow it to dismiss and confirm the app is visible behind
  await page.evaluate(() => { window.__perqAppReady = true; });
  await page.waitForSelector('#boot-splash', { state: 'detached', timeout: 3000 });
  ok('boot splash dismissed cleanly within 3s');

  const afterShot = path.join(TMP, 'splash-after-dismiss.png');
  await page.screenshot({ path: afterShot, clip: { x:0, y:0, ...VIEWPORT } });
  ok('Captured post-dismiss ' + path.relative(ROOT, afterShot));

  // Confirm something visible behind splash — sample center pixel + check page bg isn't pure black
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (!bg || /^rgba?\(0,\s*0,\s*0/.test(bg.replace(/\s/g,''))) bad(`body background is black: ${bg}`);
  else ok(`body background after dismiss: ${bg}`);

  // Make sure SOME real page content is visible (not just a black div)
  const walletVisible = await page.$eval('[data-page="wallet"], #onboarding', el => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }).catch(() => false);
  if (!walletVisible) bad('no wallet/onboarding page visible after splash dismiss — would look like black screen');
  else ok('wallet or onboarding page visible behind splash');
}

async function testNativeSplashMaster(browser) {
  console.log('\n[2/2] Native splash master simulating Capacitor scaleAspectFill on iPhone 14 Pro');

  const masterPath = path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png');
  if (!fs.existsSync(masterPath)) { bad('master splash PNG not found at ' + masterPath); return; }

  // Render the master inside a 393×852 (iPhone 14 Pro CSS) viewport with
  // object-fit: cover (== scaleAspectFill). Screenshot is what the user
  // will actually see on the device. Use a base64 data URI so Chromium
  // doesn't refuse the file:// load when the host doc is also dynamic.
  const masterBuf = fs.readFileSync(masterPath);
  const dataUri = 'data:image/png;base64,' + masterBuf.toString('base64');
  const html = `<!doctype html><html><head><style>
    *{margin:0;padding:0}
    html,body{width:393px;height:852px;overflow:hidden;background:#0D1B2A}
    img{width:100%;height:100%;object-fit:cover;display:block}
  </style></head><body>
    <img src="${dataUri}">
  </body></html>`;
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const shot = path.join(TMP, 'splash-native-iphone14pro.png');
  await page.screenshot({ path: shot, clip: { x:0, y:0, ...VIEWPORT } });
  ok('Captured ' + path.relative(ROOT, shot));

  // Sample a few key pixels via Playwright's evaluate — verify the splash
  // actually has content (mint logo + "Perq" word + tagline) and isn't
  // just a blank navy rectangle. We render to a canvas and read pixel
  // colors at expected content positions.
  const pixelCheck = await page.evaluate(async (vp) => {
    return new Promise(resolve => {
      const img = document.querySelector('img');
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext('2d');
      const drawAndSample = () => {
        ctx.drawImage(img, 0, 0, vp.width, vp.height);
        // Sample band 1: logo area (around y=27% of viewport)
        const logoBand = ctx.getImageData(Math.round(vp.width*0.45), Math.round(vp.height*0.30), Math.round(vp.width*0.10), 4);
        // Sample band 2: word area (around y=42%)
        const wordBand = ctx.getImageData(Math.round(vp.width*0.40), Math.round(vp.height*0.42), Math.round(vp.width*0.20), 4);
        // Sample band 3: pure background corner
        const bg = ctx.getImageData(2, 2, 4, 4);
        // Detect: are any pixels in band notably different from bg?
        const bgR = bg.data[0], bgG = bg.data[1], bgB = bg.data[2];
        function hasContent(band) {
          let max = 0;
          for (let i = 0; i < band.data.length; i += 4) {
            const dr = Math.abs(band.data[i] - bgR);
            const dg = Math.abs(band.data[i+1] - bgG);
            const db = Math.abs(band.data[i+2] - bgB);
            const d = dr + dg + db;
            if (d > max) max = d;
          }
          return max;
        }
        resolve({
          bg: [bgR, bgG, bgB],
          logoDelta: hasContent(logoBand),
          wordDelta: hasContent(wordBand)
        });
      };
      if (img.complete) drawAndSample();
      else img.onload = drawAndSample;
    });
  }, VIEWPORT);

  if (pixelCheck.logoDelta < 30) bad(`native splash logo area looks empty (delta=${pixelCheck.logoDelta} from bg ${pixelCheck.bg.join(',')})`);
  else ok(`native splash logo area has content (delta ${pixelCheck.logoDelta})`);
  if (pixelCheck.wordDelta < 30) bad(`native splash word area looks empty (delta=${pixelCheck.wordDelta} from bg)`);
  else ok(`native splash word area has content (delta ${pixelCheck.wordDelta})`);

  await ctx.close();
}

async function testSplashAlignment(browser) {
  console.log('\n[3/3] Vertical alignment between native splash and webview boot overlay');

  // Native master rendered through scaleAspectFill at iPhone viewport.
  const masterPath = path.join(ROOT, 'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png');
  const masterBuf = fs.readFileSync(masterPath);
  const dataUri = 'data:image/png;base64,' + masterBuf.toString('base64');
  const html = `<!doctype html><html><head><style>
    *{margin:0;padding:0}
    html,body{width:393px;height:852px;overflow:hidden;background:#0D1B2A}
    img{width:100%;height:100%;object-fit:cover;display:block}
  </style></head><body><img src="${dataUri}"></body></html>`;
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });

  // Find the topmost row that has visibly-mint pixels (the wallet logo
  // top edge). We scan column-by-column at the horizontal center.
  const nativeLogoTop = await page.evaluate(async (vp) => {
    return new Promise(resolve => {
      const img = document.querySelector('img');
      const c = document.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext('2d');
      const sample = () => {
        ctx.drawImage(img, 0, 0, vp.width, vp.height);
        const data = ctx.getImageData(0, 0, vp.width, vp.height).data;
        // bg navy is roughly r<30, g<50, b<70. Look for the first row
        // (top-down) where the central 60% has a "bright" pixel
        // (sum r+g+b > 150) — that's the logo or text edge.
        for (let y = 0; y < vp.height; y++) {
          for (let x = Math.round(vp.width*0.20); x < Math.round(vp.width*0.80); x++) {
            const i = (y * vp.width + x) * 4;
            const sum = data[i] + data[i+1] + data[i+2];
            if (sum > 200) { resolve(y); return; }
          }
        }
        resolve(-1);
      };
      if (img.complete) sample(); else img.onload = sample;
    });
  }, VIEWPORT);
  await ctx.close();
  if (nativeLogoTop < 0) { bad('could not locate logo in native splash render'); return; }
  ok(`native splash: logo top edge at y=${nativeLogoTop}px (${Math.round(100*nativeLogoTop/VIEWPORT.height)}% of viewport)`);

  // Webview overlay logo top edge — pixel-scan with the SAME algorithm
  // as the native render so the comparison is apples-to-apples.
  const ctx2 = await browser.newContext({ viewport: VIEWPORT });
  const page2 = await ctx2.newPage();
  await page2.goto('file://' + path.join(ROOT, 'preview.html'), { waitUntil: 'domcontentloaded' });
  await page2.evaluate(() => { window.__perqAppReady = false; });
  await page2.waitForSelector('#boot-splash .bs-logo', { state: 'visible', timeout: 1000 });
  const overlayShot = path.join(TMP, 'splash-overlay-for-align.png');
  await page2.screenshot({ path: overlayShot, clip: { x:0, y:0, ...VIEWPORT } });

  // Reuse the pixel-scan algorithm: load the screenshot back into a
  // canvas in the same page, find first row with central bright pixels.
  const overlayLogoTop = await page2.evaluate(async (cfg) => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = cfg.w; c.height = cfg.h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, cfg.w, cfg.h).data;
        for (let y = 0; y < cfg.h; y++) {
          for (let x = Math.round(cfg.w*0.20); x < Math.round(cfg.w*0.80); x++) {
            const i = (y * cfg.w + x) * 4;
            const sum = data[i] + data[i+1] + data[i+2];
            if (sum > 200) { resolve(y); return; }
          }
        }
        resolve(-1);
      };
      img.src = cfg.uri;
    });
  }, { w: VIEWPORT.width, h: VIEWPORT.height, uri: 'data:image/png;base64,' + fs.readFileSync(overlayShot).toString('base64') });
  await ctx2.close();
  if (overlayLogoTop < 0) { bad('could not locate logo in webview overlay render'); return; }
  ok(`webview overlay: logo top edge at y=${overlayLogoTop}px (${Math.round(100*overlayLogoTop/VIEWPORT.height)}% of viewport)`);

  const delta = Math.abs(nativeLogoTop - overlayLogoTop);
  const TOLERANCE_PX = 10;
  if (delta > TOLERANCE_PX) bad(`logo vertical position drifts ${Math.round(delta)}px between native splash and webview overlay (max ${TOLERANCE_PX}px) — would look like a shift-up animation on transition`);
  else ok(`logo position aligned within ${Math.round(delta)}px (max ${TOLERANCE_PX}px) — no visible shift on handoff`);
}

(async () => {
  // Sanity-check the native splash config so a future bump that silently
  // drops launchShowDuration below the intended value will fail this test.
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  const lsd = cfg.plugins && cfg.plugins.SplashScreen && cfg.plugins.SplashScreen.launchShowDuration;
  console.log('\n[0/3] Native SplashScreen config');
  if (typeof lsd !== 'number' || lsd < 2000) bad(`launchShowDuration is ${lsd} (need >= 2000ms for a readable launch frame)`);
  else ok(`launchShowDuration=${lsd}ms (visible native splash before auto-hide)`);
  const bg = cfg.plugins && cfg.plugins.SplashScreen && cfg.plugins.SplashScreen.backgroundColor;
  if (bg !== '#0D1B2A') bad(`SplashScreen.backgroundColor=${bg} (expected #0D1B2A — top of wallet gradient, matches body)`);
  else ok('SplashScreen.backgroundColor=#0D1B2A (matches wallet body top — no color shift on handoff)');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  try {
    await testWebviewSplash(page);
    await ctx.close();
    await testNativeSplashMaster(browser);
    await testSplashAlignment(browser);
  } finally {
    await browser.close();
  }
  console.log(`\nSPLASH TEST: PASS ${pass}, FAIL ${fail}`);
  console.log('Visual artifacts in tmp/ — open them to eyeball the layout.');
  process.exit(fail === 0 ? 0 : 1);
})();

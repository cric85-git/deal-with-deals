/**
 * Brand color contrast test.
 *
 * Verifies that every entry in MERCHANT_BRANDS:
 *   1. Has the right shape (bg, bg2, text, mono fields).
 *   2. Has at least 3.0:1 text-on-brand-bg contrast.
 *      We use 3.0 (WCAG AA large-text minimum) instead of 4.5 because brand
 *      colors on these cards are only used for large/bold elements: the
 *      headline discount line is 22px+ font-weight:800 and the merchant name
 *      is 16px+ bold. WCAG considers 18.66px+ bold as "large text", which
 *      matches every spot brand colors actually render in the app. Body-size
 *      text inside the card always falls back to high-contrast white on a
 *      dark inset (see renderDealsList) so it passes 4.5 there.
 *   3. Doesn't fully blend with the navy app background — we either pass
 *      a 1.5:1 raw contrast ratio against navy, OR rely on the
 *      brandCardShadow outline (1px white + drop shadow) which adds an
 *      explicit edge regardless of bg luminance.
 *
 * Also verifies PERQ_GENERIC_BRAND.
 */
const fs = require('fs');
const path = require('path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'preview-app.js'), 'utf8');

// Extract MERCHANT_BRANDS object literal
function extractObj(src, name) {
  const start = src.indexOf('const ' + name + '=');
  if (start < 0) start = src.indexOf('const ' + name + ' =');
  if (start < 0) throw new Error('Could not find ' + name);
  // Find matching brace
  const open = src.indexOf('{', start);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  // Eval-as-JS-fragment safely
  const literal = src.slice(open, i);
  // Use Function constructor — no `eval` in module scope
  return new Function('return ' + literal)();
}

const MERCHANT_BRANDS = extractObj(APP, 'MERCHANT_BRANDS');
const PERQ_GENERIC_BRAND = extractObj(APP, 'PERQ_GENERIC_BRAND');

// Page background (Wallet/Browse navy gradient — use the brighter top-stop)
const PAGE_BG = '#0D1B2A';

// WCAG luminance + contrast helpers
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function relLum(rgb) {
  const a = rgb.map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function contrast(c1, c2) {
  const l1 = relLum(hexToRgb(c1));
  const l2 = relLum(hexToRgb(c2));
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

let pass = 0, fail = 0, warn = 0;
const requiredFields = ['bg', 'bg2', 'text', 'accent', 'mono'];

function checkBrand(name, b) {
  // 1. Shape
  for (const f of requiredFields) {
    if (!(f in b)) { fail++; console.error('  FAIL ' + name + ': missing field ' + f); return; }
  }
  // 2. Text vs bg (text readability — WCAG AA large-text threshold; see header)
  const textBgRatio = contrast(b.text, b.bg);
  if (textBgRatio < 3.0) {
    fail++;
    console.error(`  FAIL ${name}: text "${b.text}" on bg "${b.bg}" ratio ${textBgRatio.toFixed(2)} (need 3.0)`);
    return;
  }
  // 3. Brand bg vs page bg (anti-blend)
  const bgPageRatio = contrast(b.bg, PAGE_BG);
  if (bgPageRatio < 1.5) {
    warn++;
    console.warn(`  WARN ${name}: bg "${b.bg}" vs page navy ratio ${bgPageRatio.toFixed(2)} (relies on white outline)`);
  }
  pass++;
}

console.log('Checking PERQ_GENERIC_BRAND…');
checkBrand('PERQ_GENERIC', PERQ_GENERIC_BRAND);

console.log('Checking ' + Object.keys(MERCHANT_BRANDS).length + ' merchant brands…');
for (const k of Object.keys(MERCHANT_BRANDS)) checkBrand(k, MERCHANT_BRANDS[k]);

console.log(`\nBRAND CONTRAST TEST: PASS ${pass}, WARN ${warn} (relies on outline), FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);

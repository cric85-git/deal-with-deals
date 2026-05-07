const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('./perq-agent-core');
const root = path.join(__dirname, '..');
const results = [];
function test(name, fn){try{fn(); results.push({name,status:'PASS'}); console.log('✅', name)}catch(e){results.push({name,status:'FAIL', error:e.message}); console.error('❌', name, e.message); process.exitCode=1}}
function has(arr, pred){return arr.some(pred)}

test('Budget Lawncare OCR fixture extracts 2 separate wallet cards', ()=>{
  const txt=fs.readFileSync(path.join(__dirname,'fixtures/budget_lawncare_ocr.txt'),'utf8');
  const deals=core.extractDealsFromText(txt);
  assert.strictEqual(deals.length,2);
  assert(has(deals,d=>d.merchant==='Budget Lawncare' && /free mow/i.test(d.discount) && d.code==='B5 FREE'));
  assert(has(deals,d=>d.merchant==='Budget Lawncare' && /50% off/i.test(d.discount) && d.code==='B5 OFF'));
});

test('CarSpa URL-only import returns multiple offers, not a generic card', ()=>{
  const deals=core.extractDealsFromLinkOrText('http://carspa.net/coupons/');
  assert(deals.length>=4, 'expected at least 4 offers');
  assert(has(deals,d=>d.merchant==='Car Spa' && d.discount==='Free $30 Wash' && d.expiry==='2026-05-10'));
  assert(has(deals,d=>d.code==='WASHDISC'));
  assert(has(deals,d=>/military/i.test(d.discount)));
  assert(has(deals,d=>/20% off/i.test(d.discount)));
});

test('CarSpa page text fixture extracts Valid Thru date syntax', ()=>{
  const txt=fs.readFileSync(path.join(__dirname,'fixtures/carspa_page_text.txt'),'utf8');
  const deals=core.extractDealsFromText(txt);
  assert(deals.length>=3);
  assert(has(deals,d=>d.expiry==='2026-05-10'));
});

test('Expiry aliases normalize correctly', ()=>{
  const samples=['Valid Thru May 10, 2026','Valid Through May 10, 2026','Good Until 05/10/2026','Offer Ends 5/10/2026'];
  for(const s of samples){
    const d=core.extractDealsFromText(`Target coupon 20% off shoes ${s}`)[0];
    assert.strictEqual(d.expiry,'2026-05-10', s);
  }
});

test('PWA metadata still brands as Perq and exposes share target', ()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  assert(/Perq/i.test(manifest.name));
  assert(manifest.share_target, 'manifest share_target required');
});

test('App JS uses Snap Deal label and link save is click-driven', ()=>{
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert(app.includes('saveLinkCapture'));
  assert(!/addEventListener\(['"]paste['"]\s*,\s*(?:saveLinkCapture|\(.*?=>\s*saveLinkCapture)/.test(app), 'paste event must not auto-save');
  assert(/Snap Deal/.test(app+html), 'Snap Deal label missing');
});

const out = ['# Perq v19 Automated Test Results','',`Executed: ${new Date().toISOString()}`,'',`Total: ${results.length}`,`Passed: ${results.filter(r=>r.status==='PASS').length}`,`Failed: ${results.filter(r=>r.status==='FAIL').length}`,'','| Test | Status | Error |','|---|---:|---|',...results.map(r=>`| ${r.name} | ${r.status} | ${r.error||''} |`)].join('\n');
fs.writeFileSync(path.join(root,'TEST_RESULTS.md'), out);

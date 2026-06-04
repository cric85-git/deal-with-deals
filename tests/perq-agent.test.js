const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const core = require('./perq-agent-core');
const root = path.join(__dirname, '..');
const results = [];
function test(name, fn){try{fn(); results.push({name,status:'PASS'}); console.log('✅', name)}catch(e){results.push({name,status:'FAIL', error:e.message}); console.error('❌', name, e.message); process.exitCode=1}}
function has(arr, pred){return arr.some(pred)}
function readRootFile(file){return fs.readFileSync(path.join(root,file),'utf8')}
function walkFiles(dir){
  const entries = fs.readdirSync(dir,{withFileTypes:true});
  return entries.flatMap(entry=>{
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'package-lock.json') return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

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
  const manifest=JSON.parse(readRootFile('manifest.json'));
  assert.strictEqual(manifest.name, 'Perq');
  assert.strictEqual(manifest.short_name, 'Perq');
  assert.strictEqual(manifest.description, 'Perq — Your AI savings agent');
  assert(manifest.share_target, 'manifest share_target required');
});

test('PWA uses only approved root icon files', ()=>{
  const manifest=JSON.parse(readRootFile('manifest.json'));
  assert.deepStrictEqual(manifest.icons.map(icon=>icon.src).sort(), ['icon-192.png','icon-512.png']);

  const html=readRootFile('index.html');
  assert(/<link rel="icon" type="image\/png" href="icon-192\.png">/.test(html), 'favicon must use icon-192.png');
  assert(/<link rel="apple-touch-icon" href="apple-touch-icon\.png">/.test(html), 'iOS app icon must use apple-touch-icon.png');
  assert(!/rel="apple-touch-icon"[^>]+href="icon-(192|512)\.png"/.test(html), 'iOS app icon should not bypass apple-touch-icon.png');
});

test('Header and splash render approved image assets', ()=>{
  const html=readRootFile('index.html');
  assert(/class="splash-mark"[\s\S]*?<img src="icon-512\.png" alt="Perq"/.test(html), 'splash must render icon-512.png');
  assert(/class="brand-mark"[\s\S]*?<img src="icon-192\.png" alt="Perq"/.test(html), 'header logo must render icon-192.png');
  assert(!/\.brand-mark::(before|after)|\.splash-mark::(before|after)/.test(html), 'brand marks must not be generated with CSS pseudo-elements');
});

test('Splash has a fail-safe hide path', ()=>{
  const html=readRootFile('index.html');
  const app=readRootFile('app.js');
  assert(html.includes('window.PerqSplash'), 'inline splash controller missing');
  assert(/DOMContentLoaded[\s\S]*?hideSplash/.test(html), 'splash must hide without waiting only on load');
  assert(/setTimeout\(hideSplash,\s*2500\)/.test(html), 'splash must have a hard timeout fallback');
  assert(/setTimeout\(hideSplash,\s*500\)/.test(app), 'app init should also release splash');
});

test('Service worker bumps cache and purges older caches', ()=>{
  const sw=readRootFile('sw.js');
  assert(sw.includes("const CACHE_NAME = 'perq-v25-profile-beacon';"));
  assert(/caches\.keys\(\)[\s\S]*caches\.delete\(key\)/.test(sw), 'activate handler must delete stale caches');
  assert(sw.includes("'./icon-192.png'"));
  assert(sw.includes("'./icon-512.png'"));
  assert(sw.includes("'./apple-touch-icon.png'"));
});

test('First-run profile captures identity, preferences, and email connect intent', ()=>{
  const html=readRootFile('index.html');
  const app=readRootFile('app.js');
  assert(html.includes('id="profile-screen"'), 'profile setup screen missing');
  assert(html.includes('id="profile-name"'));
  assert(html.includes('id="profile-email"'));
  assert(html.includes('id="profile-phone"'));
  assert((html.match(/data-pref/g)||[]).length >= 8, 'deal preference choices missing');
  assert(html.includes('id="profile-connect-email"'));
  assert(app.includes('validProfile'));
  assert(app.includes('KEYS.profile'));
  assert(app.includes('KEYS.emailConnection'));
});

test('Deal capture stores mandatory payload fields', ()=>{
  const html=readRootFile('index.html');
  const app=readRootFile('app.js');
  ['f-merchant','f-discount','f-expiry','f-code','f-barcode','f-url','f-address','f-notes'].forEach(id=>{
    assert(html.includes(`id="${id}"`), `${id} field missing`);
  });
  assert(app.includes('"barcode": "barcode number or scannable numeric value if visible, else null"'));
  assert(app.includes('"address": "business address if visible, else null"'));
  assert(app.includes('extractDealFromText'));
  assert(app.includes('parseIncomingShare'));
});

test('Beacon alerts are configurable and notify nearby unexpired deals', ()=>{
  const html=readRootFile('index.html');
  const app=readRootFile('app.js');
  assert(html.includes('Beacon alerts'));
  assert(html.includes('id="s-nearby-radius"'));
  assert(app.includes('beaconNotified'));
  assert(app.includes('watchPosition'));
  assert(app.includes('notifyNearbyDeals'));
  assert(app.includes('perq-beacon-'));
  assert(app.includes('getUnexpiredDeals'));
});

test('Capacitor config packages Perq for native iOS and Android', ()=>{
  const config=JSON.parse(readRootFile('capacitor.config.json'));
  const pkg=JSON.parse(readRootFile('package.json'));
  assert.strictEqual(config.appName, 'Perq');
  assert.strictEqual(config.appId, 'com.perq.app');
  assert.strictEqual(config.webDir, 'dist');
  ['@capacitor/core','@capacitor/ios','@capacitor/android','@capacitor/camera','@capacitor/geolocation','@capacitor/local-notifications','@capacitor/push-notifications','@capacitor/share','@capacitor/splash-screen'].forEach(dep=>{
    assert(pkg.dependencies[dep], `${dep} dependency missing`);
  });
  ['build:native','cap:sync','cap:open:ios','cap:open:android'].forEach(script=>{
    assert(pkg.scripts[script], `${script} script missing`);
  });
});

test('Native build keeps root Pages static and injects Capacitor only into dist', ()=>{
  execFileSync('node', ['scripts/build-native.js'], { cwd: root, stdio: 'pipe' });
  const rootHtml=readRootFile('index.html');
  const distHtml=fs.readFileSync(path.join(root,'dist','index.html'),'utf8');
  assert(!rootHtml.includes('src="capacitor.js"'), 'root GitHub Pages HTML should not request capacitor.js');
  assert(distHtml.includes('src="capacitor.js"'), 'native dist HTML should load Capacitor bridge');
  ['icon-192.png','icon-512.png','apple-touch-icon.png','app.js','manifest.json','sw.js'].forEach(file=>{
    assert(fs.existsSync(path.join(root,'dist',file)), `${file} missing from native dist`);
  });
});

test('Native projects carry Perq package names and required permissions', ()=>{
  const iosPlist=readRootFile('ios/App/App/Info.plist');
  const androidManifest=readRootFile('android/app/src/main/AndroidManifest.xml');
  const androidStrings=readRootFile('android/app/src/main/res/values/strings.xml');
  assert(iosPlist.includes('<string>Perq</string>'), 'iOS display name missing');
  ['NSCameraUsageDescription','NSPhotoLibraryUsageDescription','NSLocationWhenInUseUsageDescription'].forEach(key=>{
    assert(iosPlist.includes(key), `${key} missing`);
  });
  assert(androidStrings.includes('<string name="app_name">Perq</string>'), 'Android app name missing');
  ['android.permission.CAMERA','android.permission.ACCESS_COARSE_LOCATION','android.permission.ACCESS_FINE_LOCATION','android.permission.POST_NOTIFICATIONS'].forEach(permission=>{
    assert(androidManifest.includes(permission), `${permission} missing`);
  });
});

test('Legacy brand terms are absent from app-facing files', ()=>{
  const legacyPatterns=[
    new RegExp(['D','w','D'].join(''),'i'),
    new RegExp(['Deal',' with ','deals'].join(''),'i')
  ];
  const textExts=new Set(['.html','.js','.json','.md','.txt']);
  const files=walkFiles(root).filter(file=>textExts.has(path.extname(file)));
  const offenders=[];
  for (const file of files) {
    const rel=path.relative(root,file);
    const content=fs.readFileSync(file,'utf8');
    if (legacyPatterns.some(pattern=>pattern.test(content))) offenders.push(rel);
  }
  assert.deepStrictEqual(offenders, []);
});

test('Stale generated logo assets are not referenced', ()=>{
  const staleNames=[
    ['icon','-180','.png'].join(''),
    ['icon','-maskable','-512','.png'].join(''),
    ['perq','-logo','.svg'].join('')
  ];
  const files=walkFiles(root).filter(file=>['.html','.js','.json','.md','.txt'].includes(path.extname(file)));
  const offenders=[];
  for (const file of files) {
    const rel=path.relative(root,file);
    const content=fs.readFileSync(file,'utf8');
    if (staleNames.some(name=>content.includes(name))) offenders.push(rel);
  }
  assert.deepStrictEqual(offenders, []);
});

test('Photo capture entry is click-driven', ()=>{
  const app=readRootFile('app.js');
  const html=readRootFile('index.html');
  assert(app.includes("document.getElementById('btn-snap').addEventListener('click'"));
  assert(html.includes('id="capture-input"'));
  assert(!/addEventListener\(['"]paste['"]\s*,\s*(?:saveLinkCapture|\(.*?=>\s*saveLinkCapture)/.test(app), 'paste event must not auto-save');
  assert(/Snap/.test(html), 'Snap action label missing');
});

const out = ['# Perq Automated Test Results','',`Executed: ${new Date().toISOString()}`,'',`Total: ${results.length}`,`Passed: ${results.filter(r=>r.status==='PASS').length}`,`Failed: ${results.filter(r=>r.status==='FAIL').length}`,'','| Test | Status | Error |','|---|---:|---|',...results.map(r=>`| ${r.name} | ${r.status} | ${r.error||''} |`)].join('\n');
fs.writeFileSync(path.join(root,'TEST_RESULTS.md'), out);

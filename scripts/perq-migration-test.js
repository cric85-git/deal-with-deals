// Test: returning user with old-shape rewards gets migrated cleanly
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'preview-app.js'), 'utf8');

// Pre-seed legacy state (no missions, no lastSeenTier, no unlocksSeen)
const store = {
  'perq-mvp:rewards': JSON.stringify({ points: 250, spins: 3, streak: 5, saved: 75, lastClaim: '2025-06-07' })
};
const fakeEl = () => ({
  textContent: '', value: '', innerHTML: '', style: {},
  classList: { add() {}, remove() {}, toggle() {} },
  setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
  appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
  querySelector: () => fakeEl(), querySelectorAll: () => [],
  files: [], src: '', disabled: false, dataset: {}
});
const fakeDoc = {
  getElementById: () => fakeEl(),
  querySelector: () => fakeEl(),
  querySelectorAll: () => [],
  createElement: () => fakeEl(),
  addEventListener() {}, body: fakeEl()
};
const sandbox = {
  console, setTimeout, clearTimeout,
  document: fakeDoc,
  window: {}, navigator: { clipboard: null },
  location: { origin: 'http://test', pathname: '/', reload() {} },
  localStorage: {
    getItem: (k) => store[k] === undefined ? null : store[k],
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  fetch: () => Promise.reject(new Error('no network')),
  FileReader: function() { this.readAsDataURL = () => {}; },
  Image: function() { Object.defineProperty(this, 'src', { set() { setTimeout(() => this.onerror && this.onerror(), 0); } }); },
  alert: () => {}, confirm: () => true, prompt: () => ''
};
sandbox.window = sandbox;

const ctx = vm.createContext(sandbox);
try { vm.runInContext(code, ctx, { filename: 'preview-app.js' }); }
catch (e) { console.error('FAIL', e.message); process.exit(1); }

const r = JSON.parse(store['perq-mvp:rewards']);
let pass = 0, fail = 0;

// Old fields should still exist
if (r.points === 250) pass++; else { fail++; console.error('points lost'); }
if (r.spins === 3) pass++; else { fail++; console.error('spins lost'); }
if (r.streak === 5) pass++; else { fail++; console.error('streak lost'); }

// New fields should be added
if (r.missions && typeof r.missions === 'object' && 'date' in r.missions && 'done' in r.missions) pass++;
else { fail++; console.error('missions missing'); }

// SILVER tier (250 pts is in SILVER range 100-299)
if (r.lastSeenTier === 'SILVER') pass++; else { fail++; console.error('lastSeenTier wrong:', r.lastSeenTier); }

if (Array.isArray(r.unlocksSeen)) pass++; else { fail++; console.error('unlocksSeen not array'); }

// ============================================================
// Spec: feature-action-counters — 3 migration tests for state.metrics
// ============================================================
// AC #1: NEW user (no prior state.metrics) gets all 38 keys at 0
// AC #2: EXISTING user with no state.metrics key gets all keys back-filled at 0
// AC #3: PARTIAL state.metrics preserves existing values, fills missing keys at 0

function runMetricsMigration(seedStoreOverrides) {
  const localStore = Object.assign({}, seedStoreOverrides || {});
  const localCtx = vm.createContext({
    console, setTimeout, clearTimeout,
    document: fakeDoc, navigator: { clipboard: null },
    location: { origin: 'http://test', pathname: '/', reload() {} },
    localStorage: {
      getItem: (k) => localStore[k] === undefined ? null : localStore[k],
      setItem: (k, v) => { localStore[k] = String(v); },
      removeItem: (k) => { delete localStore[k]; }
    },
    fetch: () => Promise.reject(new Error('no network')),
    FileReader: function() { this.readAsDataURL = () => {}; },
    Image: function() { Object.defineProperty(this, 'src', { set() { setTimeout(() => this.onerror && this.onerror(), 0); } }); },
    alert: () => {}, confirm: () => true, prompt: () => ''
  });
  localCtx.window = localCtx;
  vm.runInContext(code, localCtx, { filename: 'preview-app.js' });
  return localStore;
}

// T7 (AC #1) — NEW user: state.metrics absent on boot, all keys initialized to 0
{
  const s = runMetricsMigration({});
  const m = JSON.parse(s['perq-mvp:metrics'] || '{}');
  const expected = ['photosSnapped','dealsRedeemedGeneric','walletViewOpened','tierUps','programsAdded','ocrAttempted','notificationPermissionGranted','geoPermissionGranted'];
  let allZero = true, allPresent = true;
  for (const k of expected) {
    if (!(k in m)) { allPresent = false; break; }
    if (m[k] !== 0) { allZero = false; break; }
  }
  // Also count keys — should be at least 38
  const keyCount = Object.keys(m).length;
  if (allPresent && allZero && keyCount >= 38) pass++;
  else { fail++; console.error('AC1 NEW user: allPresent=' + allPresent + ' allZero=' + allZero + ' keyCount=' + keyCount); }
}

// T8 (AC #2) — EXISTING user with no state.metrics gets all keys back-filled at 0
{
  // Simulate a returning user who has rewards/deals but never had metrics.
  const s = runMetricsMigration({
    'perq-mvp:rewards': JSON.stringify({ points: 500, spins: 2, missions: { date: null, done: {} }, lastSeenTier: 'GOLD', unlocksSeen: [] }),
    'perq-mvp:deals': JSON.stringify([{ id: 'old', merchant: 'Costco', discount: '$10 off', value: 10, redeemed: false, createdAt: Date.now() }])
  });
  const m = JSON.parse(s['perq-mvp:metrics'] || '{}');
  // Existing data preserved
  const r = JSON.parse(s['perq-mvp:rewards']);
  const d = JSON.parse(s['perq-mvp:deals']);
  const dataPreserved = r.points === 500 && d.length === 1 && d[0].id === 'old';
  // Metrics keys filled
  const metricsFilled = m.photosSnapped === 0 && m.dealsRedeemedGeneric === 0 && Object.keys(m).length >= 38;
  if (dataPreserved && metricsFilled) pass++;
  else { fail++; console.error('AC2 EXISTING user: dataPreserved=' + dataPreserved + ' metricsFilled=' + metricsFilled); }
}

// T9 (AC #3) — PARTIAL state.metrics: existing values preserved, missing keys filled at 0
{
  const s = runMetricsMigration({
    'perq-mvp:metrics': JSON.stringify({
      photosSnapped: 17,
      walletViewOpened: 42,
      legacyJunkKey: 99   // Survives migration (back-fill is additive only)
    })
  });
  const m = JSON.parse(s['perq-mvp:metrics'] || '{}');
  const preserved = m.photosSnapped === 17 && m.walletViewOpened === 42 && m.legacyJunkKey === 99;
  const filled = m.dealsRedeemedGeneric === 0 && m.tierUps === 0 && m.communityDealsClaimed === 0;
  if (preserved && filled) pass++;
  else { fail++; console.error('AC3 PARTIAL user: preserved=' + preserved + ' filled=' + filled + ' state=' + JSON.stringify(m).slice(0,300)); }
}

// ============================================================
// Spec: feature-wallet-savings-states-and-lifecycle — 1 migration test
// ============================================================
// AC #26: legacy redeemed deals without redeemedAt get back-filled to 0.
// Verifies migrateRedeemedAt() runs at boot and treats unset/null/wrong-type
// redeemedAt as "redeemed long ago" (= 0). These deals immediately fall
// outside the 7-day Recently-used visibility window.

// T10 (AC #26) — legacy redeemed deals get redeemedAt back-filled to 0
{
  // Seed a returning user with multiple shapes of legacy redeemed deal:
  //   d1: redeemed=true, redeemedAt missing entirely
  //   d2: redeemed=true, redeemedAt explicit null
  //   d3: redeemed=true, redeemedAt is a string (corrupted)
  //   d4: redeemed=true, redeemedAt already a valid number (must NOT change)
  //   d5: redeemed=false (must NOT touch — non-redeemed deals never get redeemedAt)
  const validTs = 1700000000000;
  const seed = {
    'perq-mvp:deals': JSON.stringify([
      { id: 'd1', merchant: 'A', discount: '$1', redeemed: true,                    createdAt: 1 },
      { id: 'd2', merchant: 'B', discount: '$2', redeemed: true, redeemedAt: null,  createdAt: 2 },
      { id: 'd3', merchant: 'C', discount: '$3', redeemed: true, redeemedAt: 'oops',createdAt: 3 },
      { id: 'd4', merchant: 'D', discount: '$4', redeemed: true, redeemedAt: validTs, createdAt: 4 },
      { id: 'd5', merchant: 'E', discount: '$5', redeemed: false,                   createdAt: 5 }
    ])
  };
  const s = runMetricsMigration(seed);
  const deals = JSON.parse(s['perq-mvp:deals']);
  const byId = Object.fromEntries(deals.map(d => [d.id, d]));
  // d1, d2, d3 should now have redeemedAt === 0 (back-filled)
  const d1ok = byId.d1.redeemedAt === 0;
  const d2ok = byId.d2.redeemedAt === 0;
  const d3ok = byId.d3.redeemedAt === 0;
  // d4 must keep its valid timestamp (no clobber)
  const d4ok = byId.d4.redeemedAt === validTs;
  // d5 must NOT have redeemedAt added (non-redeemed deals are untouched)
  const d5ok = !('redeemedAt' in byId.d5) || byId.d5.redeemedAt == null;
  if (d1ok && d2ok && d3ok && d4ok && d5ok) pass++;
  else { fail++; console.error('AC26: redeemedAt back-fill — d1=' + byId.d1.redeemedAt + ' d2=' + byId.d2.redeemedAt + ' d3=' + byId.d3.redeemedAt + ' d4=' + byId.d4.redeemedAt + ' d5=' + byId.d5.redeemedAt); }
}

console.log(`MIGRATION TEST: PASS ${pass}, FAIL ${fail}`);
console.log('Final rewards:', JSON.stringify(r));
process.exit(fail === 0 ? 0 : 1);

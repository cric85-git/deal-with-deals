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

console.log(`MIGRATION TEST: PASS ${pass}, FAIL ${fail}`);
console.log('Final rewards:', JSON.stringify(r));
process.exit(fail === 0 ? 0 : 1);

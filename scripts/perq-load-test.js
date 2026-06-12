// Minimal smoke test: load preview-app.js into a fake DOM and ensure no errors at startup
const fs = require('fs');
const path = require('path');

const code = fs.readFileSync(path.join(__dirname, '..', 'preview-app.js'), 'utf8');

// Build sandbox
const store = {};
const fakeEl = () => ({
  textContent: '', value: '', innerHTML: '', style: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
  appendChild() {}, removeChild() {}, click() {}, focus() {},
  addEventListener() {}, removeEventListener() {},
  querySelector: () => fakeEl(), querySelectorAll: () => [],
  onclick: null, dataset: {}, scrollTop: 0, parentElement: null,
  files: [], src: '', disabled: false
});
const fakeDocument = {
  getElementById: () => fakeEl(),
  querySelector: () => fakeEl(),
  querySelectorAll: () => [],
  createElement: () => fakeEl(),
  body: fakeEl(),
  documentElement: fakeEl(),
  addEventListener() {}
};
const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  document: fakeDocument,
  window: {},
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
  location: { origin: 'http://test', pathname: '/', reload() {} },
  localStorage: {
    getItem: (k) => store[k] === undefined ? null : store[k],
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  fetch: () => Promise.reject(new Error('no network in test')),
  FileReader: function() { this.readAsDataURL = () => {}; },
  Image: function() { Object.defineProperty(this, 'src', { set() { setTimeout(() => this.onerror && this.onerror(), 0); } }); },
  alert: () => {}, confirm: () => true, prompt: () => ''
};
sandbox.window = sandbox; // self-reference

const vm = require('vm');
const ctx = vm.createContext(sandbox);

let err = null;
try {
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
} catch (e) {
  err = e;
}

if (err) {
  console.error('LOAD FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
}

// Check key globals were exposed
const required = ['goPage','redeemDeal','viewWalletDeal','markDealUsed','shareDealFromModal','deleteDealFromModal','calculateDiscount','setDiscountSymbol','setHasExpiry','saveDealForm','toggleDealImage','confirmShare','claimFromPool','claimBrowseDeal','doSpin','closeModal','openPendingDealOnReady','testNotification'];
const missing = required.filter(k => typeof sandbox[k] !== 'function');
if (missing.length) {
  console.error('MISSING GLOBALS:', missing.join(','));
  process.exit(1);
}

// Verify migration ran: rewards in localStorage should have new fields
const rewardsRaw = store['perq-mvp:rewards'];
if (!rewardsRaw) {
  console.error('Rewards not persisted at startup');
  process.exit(1);
}
const rewards = JSON.parse(rewardsRaw);
const requiredFields = ['missions', 'lastSeenTier', 'unlocksSeen'];
const missingFields = requiredFields.filter(f => !(f in rewards));
if (missingFields.length) {
  console.error('REWARDS MIGRATION MISSING:', missingFields.join(','));
  console.error('Got:', JSON.stringify(rewards));
  process.exit(1);
}

console.log('LOAD OK');
console.log('Rewards initial state:', JSON.stringify(rewards));
console.log('Globals exposed:', required.join(', '));

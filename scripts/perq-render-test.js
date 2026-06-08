// Test: renderRewards executes without throwing (proves the rewards-root template works)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'preview-app.js'), 'utf8');

const store = {};
const els = {};
function fakeEl(id) {
  const el = {
    id, textContent: '', value: '', innerHTML: '', style: new Proxy({}, { set() { return true; }, get() { return ''; } }),
    classList: { add() {}, remove() {}, toggle() { return true; }, contains: () => false },
    setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    appendChild() {}, removeChild() {},
    addEventListener() {}, removeEventListener() {},
    querySelector: (sel) => fakeEl(sel),
    querySelectorAll: () => [],
    onclick: null, dataset: {}, scrollTop: 0,
    files: [], src: '', disabled: false
  };
  return el;
}
const fakeDoc = {
  getElementById: (id) => { if (!els[id]) els[id] = fakeEl(id); return els[id]; },
  querySelector: (sel) => fakeEl(sel),
  querySelectorAll: (sel) => {
    // Always return list of fake elements with full element interface
    const e1 = fakeEl(sel);
    return [e1];
  },
  createElement: (tag) => fakeEl(tag),
  body: fakeEl('body'),
  addEventListener() {}
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
catch (e) { console.error('LOAD FAIL', e.message); process.exit(1); }

let pass = 0, fail = 0;

// Capture renderRewards output by intercepting innerHTML on rewards-root
let lastHTML = '';
els['rewards-root'].innerHTML = ''; // ensure it exists in els map
Object.defineProperty(els['rewards-root'], 'innerHTML', {
  set(v) { lastHTML = v; },
  get() { return lastHTML; }
});

// Trigger render via goPage
try {
  sandbox.goPage('rewards');
} catch (e) {
  console.error('goPage(rewards) threw:', e.message);
  fail++;
}

// Check rendered content has expected sections
if (lastHTML.includes('Daily missions') || lastHTML.includes('🎯')) pass++;
else { fail++; console.error('Missing missions section'); }
if (lastHTML.includes('BRONZE') || lastHTML.includes('SILVER') || lastHTML.includes('pts')) pass++;
else { fail++; console.error('Missing points/tier section'); }
if (lastHTML.includes('Spin to win') || lastHTML.includes('SPIN NOW')) pass++;
else { fail++; console.error('Missing spin section'); }
if (lastHTML.includes('Unlocks') || lastHTML.includes('🔓')) pass++;
else { fail++; console.error('Missing unlocks section'); }
if (lastHTML.includes('Streak') || lastHTML.includes('streak') || lastHTML.includes('STREAK')) pass++;
else { fail++; console.error('Missing streak section'); }

// Test mission completion
const beforePoints = JSON.parse(store['perq-mvp:rewards']).points;
// Simulate redeem by directly invoking redeemDeal — but we need a deal first
const dealsRaw = store['perq-mvp:deals'];
const deals = dealsRaw ? JSON.parse(dealsRaw) : [];
deals.push({ id:'test1', merchant:'Test', discount:'$10 off', value:10, redeemed:false, createdAt:Date.now() });
store['perq-mvp:deals'] = JSON.stringify(deals);
// Reload to pick up the deal
try { vm.runInContext(code, ctx, { filename: 'preview-app.js' }); } catch (e) { fail++; console.error(e.message); }
try {
  sandbox.redeemDeal('test1');
  const after = JSON.parse(store['perq-mvp:rewards']);
  // Should have +10 (redeem points) +25 (mission) = 35 more
  if (after.points >= beforePoints + 10) pass++;
  else { fail++; console.error('redeem points not added'); }
  if (after.missions && after.missions.done && after.missions.done.redeem) pass++;
  else { fail++; console.error('redeem mission not marked'); }
} catch (e) {
  fail++;
  console.error('redeemDeal threw:', e.message);
}

// Test share mission via confirmShare on a non-community deal
const deals2 = JSON.parse(store['perq-mvp:deals']);
deals2.push({ id:'shareTest', merchant:'Sharable', discount:'$5 off', value:5, redeemed:false, fromCommunity:false, createdAt:Date.now() });
store['perq-mvp:deals'] = JSON.stringify(deals2);
try { vm.runInContext(code, ctx, { filename: 'preview-app.js' }); } catch (e) { fail++; console.error(e.message); }
try {
  sandbox.confirmShare('shareTest');
  const after = JSON.parse(store['perq-mvp:rewards']);
  if (after.missions && after.missions.done && after.missions.done.share) pass++;
  else { fail++; console.error('share mission not marked'); }
} catch (e) {
  fail++;
  console.error('confirmShare threw:', e.message);
}

// Test bonus_pool unlock fires correctly when crossing 100 pts
try {
  // Reset state via direct localStorage manipulation
  const baseRewards = { points: 95, spins: 0, streak: 0, saved: 0, lastClaim: null, missions: { date: null, done: {} }, lastSeenTier: 'BRONZE', unlocksSeen: [] };
  store['perq-mvp:rewards'] = JSON.stringify(baseRewards);
  // Push a deal we can redeem to push past 100
  const dealsX = JSON.parse(store['perq-mvp:deals'] || '[]');
  dealsX.push({ id: 'unlockTrigger', merchant: 'Trigger', discount: '$10 off', value: 10, redeemed: false, createdAt: Date.now() });
  store['perq-mvp:deals'] = JSON.stringify(dealsX);
  // Reload code to pick up fresh state
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  // Trigger redeem (gives +10 redeem + +25 mission = +35 pts -> 130)
  sandbox.redeemDeal('unlockTrigger');
  const finalRewards = JSON.parse(store['perq-mvp:rewards']);
  if (finalRewards.unlocksSeen && finalRewards.unlocksSeen.includes('bonus_pool')) pass++;
  else { fail++; console.error('bonus_pool unlock not marked seen'); }
  // Verify bonus deal got dropped into wallet
  const finalDeals = JSON.parse(store['perq-mvp:deals']);
  const bonus = finalDeals.find(d => d.isBonus);
  if (bonus) pass++;
  else { fail++; console.error('bonus deal not added to wallet'); }
} catch (e) {
  fail++;
  console.error('unlock flow threw:', e.message);
}

console.log(`RENDER TEST: PASS ${pass}, FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);

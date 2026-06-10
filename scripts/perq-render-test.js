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

// ---- Deal Detail Modal tests (feature-deal-detail-modal spec, ACs 1, 8, 9, edge case 1) ----
try {
  // Capture the modal overlay's innerHTML the same way we do for rewards-root.
  let modalHTML = '';
  // Fresh modal-overlay fake element (recreate to install the setter)
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();

  // Case A: viewWalletDeal with a bad id should NOT open a modal (toast fires but DOM unchanged).
  modalHTML = '';
  sandbox.viewWalletDeal('definitely-not-a-real-id');
  if (modalHTML === '') pass++;
  else { fail++; console.error('viewWalletDeal(badId) opened a modal when it should not have'); }

  // Case B: viewWalletDeal on an ACTIVE deal renders the "Mark as Used" CTA.
  const activeDealsX = JSON.parse(store['perq-mvp:deals'] || '[]');
  activeDealsX.push({ id: 'detailActive', merchant: 'Starbucks', discount: '$5 off', value: 5, expiry: '2099-12-31', redeemed: false, createdAt: Date.now() });
  store['perq-mvp:deals'] = JSON.stringify(activeDealsX);
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  // Re-install setter on modal-overlay since fakeDoc.getElementById creates fresh elements after reload
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();
  modalHTML = '';
  sandbox.viewWalletDeal('detailActive');
  if (modalHTML.includes('Mark as Used')) pass++;
  else { fail++; console.error('viewWalletDeal(active) missing "Mark as Used" CTA — got:\n' + modalHTML.slice(0, 400)); }

  // Case C: viewWalletDeal on a REDEEMED deal renders the disabled "Already used" pill.
  const redeemedDealsX = JSON.parse(store['perq-mvp:deals']);
  redeemedDealsX.push({ id: 'detailRedeemed', merchant: 'Target', discount: '20% off', value: 20, expiry: '2099-12-31', redeemed: true, createdAt: Date.now() });
  store['perq-mvp:deals'] = JSON.stringify(redeemedDealsX);
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();
  modalHTML = '';
  sandbox.viewWalletDeal('detailRedeemed');
  if (modalHTML.includes('Already used') && modalHTML.includes('disabled')) pass++;
  else { fail++; console.error('viewWalletDeal(redeemed) missing disabled "Already used" pill — got:\n' + modalHTML.slice(0, 400)); }

  // Case D: viewWalletDeal renders the secondary "Share Deal" button (active deal).
  modalHTML = '';
  sandbox.viewWalletDeal('detailActive');
  if (modalHTML.includes('Share Deal') && modalHTML.includes('shareDealFromModal')) pass++;
  else { fail++; console.error('viewWalletDeal(active) missing "Share Deal" secondary CTA — got:\n' + modalHTML.slice(0, 400)); }

  // Case E: Share button is also present for REDEEMED deals (sharing a used deal is valid).
  modalHTML = '';
  sandbox.viewWalletDeal('detailRedeemed');
  if (modalHTML.includes('Share Deal') && modalHTML.includes('shareDealFromModal')) pass++;
  else { fail++; console.error('viewWalletDeal(redeemed) missing "Share Deal" — should be available even for used deals'); }
} catch (e) {
  fail++;
  console.error('viewWalletDeal tests threw:', e.message);
}

// ---- calculateDiscount tests (feature-calculate-discount spec, ACs 1–7 + edge cases) ----
try {
  // AC1: basic 10% discount on $100 → $90
  if (sandbox.calculateDiscount(100, 10) === 90) pass++;
  else { fail++; console.error('calculateDiscount(100,10) expected 90, got', sandbox.calculateDiscount(100, 10)); }

  // AC2: zero price short-circuits to 0
  if (sandbox.calculateDiscount(0, 50) === 0) pass++;
  else { fail++; console.error('calculateDiscount(0,50) expected 0, got', sandbox.calculateDiscount(0, 50)); }

  // AC3: zero percent leaves price unchanged
  if (sandbox.calculateDiscount(100, 0) === 100) pass++;
  else { fail++; console.error('calculateDiscount(100,0) expected 100, got', sandbox.calculateDiscount(100, 0)); }

  // AC4: 100% discount returns 0
  if (sandbox.calculateDiscount(100, 100) === 0) pass++;
  else { fail++; console.error('calculateDiscount(100,100) expected 0, got', sandbox.calculateDiscount(100, 100)); }

  // AC5: fractional result preserved (50 - 50*0.25 = 37.5)
  if (sandbox.calculateDiscount(50, 25) === 37.5) pass++;
  else { fail++; console.error('calculateDiscount(50,25) expected 37.5, got', sandbox.calculateDiscount(50, 25)); }

  // AC6: invalid/null input — null price coerces to 0 in JS arithmetic, so
  // calculateDiscount(null, 10) === 0 (NOT NaN — null is numerically 0).
  // Callers wanting to reject null must check `price == null` before calling.
  if (sandbox.calculateDiscount(null, 10) === 0) pass++;
  else { fail++; console.error('calculateDiscount(null,10) expected 0 (null coerces to 0), got', sandbox.calculateDiscount(null, 10)); }

  // AC7: invalid/null input — undefined percent propagates NaN.
  if (Number.isNaN(sandbox.calculateDiscount(100, undefined))) pass++;
  else { fail++; console.error('calculateDiscount(100,undefined) expected NaN, got', sandbox.calculateDiscount(100, undefined)); }

  // AC8: invalid/null input — undefined price also propagates NaN.
  if (Number.isNaN(sandbox.calculateDiscount(undefined, 10))) pass++;
  else { fail++; console.error('calculateDiscount(undefined,10) expected NaN, got', sandbox.calculateDiscount(undefined, 10)); }
} catch (e) {
  fail++;
  console.error('calculateDiscount tests threw:', e.message);
}

// ---- saveDealForm + setDiscountSymbol + setHasExpiry tests ----
// Spec: feature-deal-form-discount-expiry.md
// state.deals is closed over inside the IIFE, so we can't read sandbox.state directly.
// saveDealForm writes via save(K.deals, state.deals) which persists to localStorage.
// We read back from store['perq-mvp:deals'] to verify.
try {
  function setEl(id, value) {
    const el = sandbox.document.getElementById(id);
    el.value = value;
  }
  function readToasts() {
    return sandbox.document.getElementById('toast').textContent || '';
  }
  function getDeals() { return JSON.parse(store['perq-mvp:deals'] || '[]'); }
  function lastDeal() { const d = getDeals(); return d[d.length - 1]; }
  function dealCount() { return getDeals().length; }
  function resetState() {
    // Reset localStorage to empty + re-run IIFE so the in-closure state.deals
    // is fresh.  The rewards reset prevents cross-test pollution from earlier
    // calculateDiscount etc cases.
    store['perq-mvp:deals'] = '[]';
    store['perq-mvp:rewards'] = JSON.stringify({points:0,spins:0,streak:0,saved:0,lastClaim:null,missions:{date:null,done:{}},lastSeenTier:'BRONZE',unlocksSeen:[]});
    vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  }
  function primeForm(opts) {
    setEl('f-merchant', opts.merchant || '');
    setEl('f-discount-num', opts.num != null ? String(opts.num) : '');
    setEl('f-symbol', opts.symbol || '$');
    setEl('f-value', opts.value != null ? String(opts.value) : '');
    setEl('f-category', opts.category || 'Groceries');
    setEl('f-code', opts.code || '');
    setEl('f-has-expiry', opts.hasExpiry || 'N');
    setEl('f-expiry', opts.expiry || '');
    setEl('f-address', opts.address || '');
    setEl('toast', '');
  }

  // AC7: empty merchant → toast Merchant required, no save
  resetState();
  primeForm({ num: 10, symbol: '$' });
  sandbox.saveDealForm();
  if (dealCount() === 0 && readToasts().includes('Merchant required')) pass++;
  else { fail++; console.error('saveDealForm(empty merchant) expected toast+no-save — got toast', JSON.stringify(readToasts()), 'count', dealCount()); }

  // AC8: empty discount number → toast, no save (edge: invalid/null input)
  resetState();
  primeForm({ merchant: 'Target', num: '', symbol: '$' });
  sandbox.saveDealForm();
  if (dealCount() === 0 && readToasts().includes('Discount amount required')) pass++;
  else { fail++; console.error('saveDealForm(empty num) expected toast+no-save — got toast', JSON.stringify(readToasts())); }

  // AC9: % selected, value empty → toast, no save (edge: invalid/null input)
  resetState();
  primeForm({ merchant: 'Target', num: 20, symbol: '%', value: '' });
  sandbox.saveDealForm();
  if (dealCount() === 0 && readToasts().includes('Total value required')) pass++;
  else { fail++; console.error('saveDealForm(% no value) expected toast+no-save — got toast', JSON.stringify(readToasts())); }

  // AC10: hasExpiry=Y, date empty → toast, no save (edge: invalid/null input)
  resetState();
  primeForm({ merchant: 'Target', num: 10, symbol: '$', hasExpiry: 'Y', expiry: '' });
  sandbox.saveDealForm();
  if (dealCount() === 0 && readToasts().includes('Pick an expiry date')) pass++;
  else { fail++; console.error('saveDealForm(Y no date) expected toast+no-save — got toast', JSON.stringify(readToasts())); }

  // AC11: $ symbol num=10 → discount '$10 off', value=10
  resetState();
  primeForm({ merchant: 'Target', num: 10, symbol: '$', hasExpiry: 'N' });
  sandbox.saveDealForm();
  const d11 = lastDeal();
  if (dealCount() === 1 && d11.discount === '$10 off' && d11.value === 10) pass++;
  else { fail++; console.error('saveDealForm($ 10) expected "$10 off"/value=10, got', JSON.stringify(d11)); }

  // AC12: % symbol num=20 value=50 → discount '20% off', value=10 (50×0.20)
  resetState();
  primeForm({ merchant: 'Target', num: 20, symbol: '%', value: 50, hasExpiry: 'N' });
  sandbox.saveDealForm();
  const d12 = lastDeal();
  if (dealCount() === 1 && d12.discount === '20% off' && d12.value === 10) pass++;
  else { fail++; console.error('saveDealForm(% 20 of 50) expected "20% off"/value=10, got', JSON.stringify(d12)); }

  // AC13: hasExpiry=N → expiry === ''
  resetState();
  primeForm({ merchant: 'Target', num: 10, symbol: '$', hasExpiry: 'N' });
  sandbox.saveDealForm();
  const d13 = lastDeal();
  if (dealCount() === 1 && d13.expiry === '') pass++;
  else { fail++; console.error('saveDealForm(N expiry) expected "" got', JSON.stringify(d13 && d13.expiry)); }

  // AC14: hasExpiry=Y date=2026-12-31 → preserved
  resetState();
  primeForm({ merchant: 'Target', num: 10, symbol: '$', hasExpiry: 'Y', expiry: '2026-12-31' });
  sandbox.saveDealForm();
  const d14 = lastDeal();
  if (dealCount() === 1 && d14.expiry === '2026-12-31') pass++;
  else { fail++; console.error('saveDealForm(Y 2026-12-31) expected "2026-12-31" got', JSON.stringify(d14 && d14.expiry)); }

  // ---- Pre-fill edge cases (spec § 5 cases 5-8) ----
  // Re-install modal-overlay setter because resetState() re-runs the IIFE
  // and earlier `els['modal-overlay']` may have been replaced. modalHTML
  // captures the openModal() innerHTML so we can grep pre-fill markers.
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();

  // Edge case 5: pre-fill OCR with non-numeric discount → defaults to $ toggle,
  // num input empty. Modal HTML must mark f-sym-dollar active and f-sym-pct inactive.
  modalHTML = '';
  sandbox.openDealPreview({ merchant: 'X', discount: 'twenty bucks' });
  if (modalHTML.includes('id="f-sym-dollar"') && modalHTML.includes('data-active="true"') && !/f-sym-pct"[^>]*data-active="true"/.test(modalHTML)) pass++;
  else { fail++; console.error('openDealPreview(non-numeric discount) expected $-active default, got modalHTML[0..400]:', modalHTML.slice(0, 400)); }

  // Edge case 6: pre-fill OCR with data.expiry set → has-expiry=Y, date prefilled.
  modalHTML = '';
  sandbox.openDealPreview({ merchant: 'X', expiry: '2026-12-31' });
  if (modalHTML.includes('value="2026-12-31"') && modalHTML.includes('value="Y"') && /f-exp-y"[^>]*data-active="true"/.test(modalHTML)) pass++;
  else { fail++; console.error('openDealPreview(expiry=2026-12-31) expected has-expiry=Y + date prefilled, got:', modalHTML.slice(0, 600)); }

  // Edge case 7: pre-fill OCR with data.expiry empty/undefined → has-expiry=N,
  // date input hidden via display:none.
  modalHTML = '';
  sandbox.openDealPreview({ merchant: 'X' });
  if (modalHTML.includes('value="N"') && /f-exp-n"[^>]*data-active="true"/.test(modalHTML) && modalHTML.includes('display:none')) pass++;
  else { fail++; console.error('openDealPreview(no expiry) expected has-expiry=N + date hidden, got:', modalHTML.slice(0, 600)); }

  // Edge case 8: returning user with pre-existing free-form discount strings —
  // wallet render must not crash on legacy shape (no `value` field, free-form
  // discount text). Load old-shape deal, navigate to wallet, confirm no throw
  // and the merchant string appears somewhere downstream.
  store['perq-mvp:deals'] = JSON.stringify([
    { id: 'legacy1', merchant: 'OldStyleStore', discount: '20% off entire purchase', redeemed: false, createdAt: Date.now() }
  ]);
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  let legacyOk = false;
  try {
    sandbox.goPage('wallet');
    // No throw is the primary assertion. Also verify localStorage round-trip preserved the legacy shape.
    const back = JSON.parse(store['perq-mvp:deals']);
    if (back[0].discount === '20% off entire purchase' && back[0].value === undefined) legacyOk = true;
  } catch (e) {
    console.error('legacy free-form deal crashed wallet render:', e.message);
  }
  if (legacyOk) pass++;
  else fail++;
} catch (e) {
  fail++;
  console.error('saveDealForm tests threw:', e.message);
}

console.log(`RENDER TEST: PASS ${pass}, FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);

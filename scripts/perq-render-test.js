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

  // AC20: setHasExpiry('Y') auto-fills today's date when input is empty.
  // openDealPreview with no expiry primes f-expiry to ''. Toggling Y must populate it.
  // Also verifies that toggling Y when the input is ALREADY populated preserves the value.
  resetState();
  // Re-install modal-overlay setter (resetState recreates the IIFE).
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();
  // Force the form input fakeEls to exist with empty values.
  sandbox.document.getElementById('f-expiry').value = '';
  sandbox.document.getElementById('f-has-expiry').value = 'N';
  sandbox.document.getElementById('f-exp-y').setAttribute && sandbox.document.getElementById('f-exp-y');
  sandbox.document.getElementById('f-exp-n');
  sandbox.setHasExpiry('Y');
  const expiredDateAfterY = sandbox.document.getElementById('f-expiry').value;
  const t = new Date();
  const expectedToday = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  if (expiredDateAfterY === expectedToday) pass++;
  else { fail++; console.error('setHasExpiry(Y empty) expected today=' + expectedToday + ', got=' + JSON.stringify(expiredDateAfterY)); }
  // Toggling Y again with existing value must NOT overwrite it.
  sandbox.document.getElementById('f-expiry').value = '2027-03-15';
  sandbox.setHasExpiry('Y');
  if (sandbox.document.getElementById('f-expiry').value === '2027-03-15') pass++;
  else { fail++; console.error('setHasExpiry(Y, prefilled) overwrote existing date'); }

  // AC21+22: openDealPreview with image renders the collapsed thumbnail frame
  // (data-expanded="false") with the Expand toggle pill. The legacy hard-crop
  // (height:100px) must be gone. object-fit:cover is now intentional FOR THE
  // COLLAPSED THUMBNAIL — the frame uses cover when collapsed and contain when
  // expanded (toggled at runtime).
  modalHTML = '';
  sandbox.openDealPreview({ merchant: 'X' }, 'data:image/png;base64,iVBORw0KGgo=');
  if (modalHTML.includes('data-expanded="false"') && modalHTML.includes('toggleDealImage') && modalHTML.includes('>Expand</span>') && !modalHTML.includes('height:100px')) pass++;
  else { fail++; console.error('openDealPreview(image) expected collapsed frame + Expand toggle, got modalHTML[0..600]:', modalHTML.slice(0, 600)); }

  // AC23: viewWalletDeal renders the image frame when the deal has d.image.
  // Set up an active deal with an image, open the modal, verify the frame markers.
  store['perq-mvp:deals'] = JSON.stringify([
    { id: 'imgDeal', merchant: 'TestStore', discount: '20% off', value: 10, redeemed: false, image: 'data:image/png;base64,iVBORw0KGgo=', createdAt: Date.now() }
  ]);
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();
  modalHTML = '';
  sandbox.viewWalletDeal('imgDeal');
  if (modalHTML.includes('data-expanded="false"') && modalHTML.includes('wallet-detail-img-imgDeal') && modalHTML.includes('toggleDealImage')) pass++;
  else { fail++; console.error('viewWalletDeal(deal with image) missing image frame, got modalHTML[0..800]:', modalHTML.slice(0, 800)); }

  // AC24: viewWalletDeal does NOT render the frame when the deal has no image.
  // Legacy / Type-a-deal entries skip the frame cleanly — no empty container.
  store['perq-mvp:deals'] = JSON.stringify([
    { id: 'noImgDeal', merchant: 'TypedStore', discount: '$5 off', value: 5, redeemed: false, createdAt: Date.now() }
  ]);
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();
  modalHTML = '';
  sandbox.viewWalletDeal('noImgDeal');
  if (!modalHTML.includes('toggleDealImage') && !modalHTML.includes('data-expanded')) pass++;
  else { fail++; console.error('viewWalletDeal(no image) unexpectedly rendered image frame, got modalHTML[0..600]:', modalHTML.slice(0, 600)); }

  // AC25: window.toggleDealImage exposed and is a function (also covered in load-test
  // but kept here so render-test self-validates the new public global).
  if (typeof sandbox.toggleDealImage === 'function') pass++;
  else { fail++; console.error('toggleDealImage not exposed on window, got:', typeof sandbox.toggleDealImage); }

  // Image-frame layout fix: dealImageFrame wrapper must use display:block (no flex),
  // because display:flex + justify-content:center + <img width:100%> caused a subpixel
  // right-shift on iOS Safari after a fresh camera snap. Scope the assertion to the
  // image-frame slice so other flex usages (e.g., the Expand pill button itself) are
  // not flagged.
  modalHTML = '';
  sandbox.openDealPreview({ merchant: 'X' }, 'data:image/png;base64,iVBORw0KGgo=');
  const imgFrameStart = modalHTML.indexOf('id="deal-form-img"');
  const imgFrameImgEnd = modalHTML.indexOf('alt="Deal image"');
  const wrapperStyleSlice = imgFrameStart > 0 ? modalHTML.slice(imgFrameStart, imgFrameImgEnd) : '';
  if (imgFrameStart > 0 && imgFrameImgEnd > imgFrameStart && !wrapperStyleSlice.includes('display:flex')) pass++;
  else { fail++; console.error('Image frame wrapper still uses flex — slice:', wrapperStyleSlice); }

  // AC26: Discount row consolidates $/% toggle, discount number, value, and code
  // onto one line. Standalone Code row and standalone Total-value row are gone.
  modalHTML = '';
  sandbox.openDealPreview({ merchant: 'X' });
  const idxNum = modalHTML.indexOf('id="f-discount-num"');
  const idxValue = modalHTML.indexOf('id="f-value"');
  const idxCode = modalHTML.indexOf('id="f-code"');
  const idxCategory = modalHTML.indexOf('id="f-category"');
  const inlineOrderOk = idxNum > 0 && idxValue > idxNum && idxCode > idxValue && idxCategory > idxCode;
  const noStandaloneCodeLabel = !modalHTML.includes('<label>Code</label>');
  if (inlineOrderOk && noStandaloneCodeLabel) pass++;
  else { fail++; console.error('Discount row inline merge failed — order:', { num: idxNum, value: idxValue, code: idxCode, category: idxCategory }, 'standaloneCodeLabel:', !noStandaloneCodeLabel); }

  // ---- feature-deal-detail-modal-v2 tests (AC1-7) ----
  // AC1: Wallet pass card onclick calls viewWalletDeal (NOT togglePass).
  // Mechanical: render wallet, capture wallet-content innerHTML, search for the
  // deal id inside an onclick="viewWalletDeal(...)" attribute on a .wpass div.
  let walletHTML = '';
  els['wallet-content'] = (function () {
    const e = fakeEl('wallet-content');
    Object.defineProperty(e, 'innerHTML', { set(v) { walletHTML = v; }, get() { return walletHTML; } });
    return e;
  })();
  store['perq-mvp:deals'] = JSON.stringify([
    { id: 'aXcBnQ', merchant: 'Trader Joes', discount: '20% off entire purchase', value: 10, redeemed: false, category: 'Groceries', expiry: '2026-06-25', address: '123 Main St, Anywhere', image: 'data:image/png;base64,iVBORw0KGgo=', createdAt: Date.now() }
  ]);
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  // Re-install interceptors AFTER IIFE reload (it recreates els lazily).
  els['wallet-content'] = (function () {
    const e = fakeEl('wallet-content');
    Object.defineProperty(e, 'innerHTML', { set(v) { walletHTML = v; }, get() { return walletHTML; } });
    return e;
  })();
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();
  walletHTML = '';
  try { sandbox.goPage('wallet'); } catch (e) { console.error('goPage(wallet) threw:', e.message); fail++; }
  if (walletHTML.includes('class="wpass"') && walletHTML.includes("viewWalletDeal('aXcBnQ')") && !walletHTML.includes("togglePass(this)")) pass++;
  else { fail++; console.error('Wallet pass onclick should call viewWalletDeal not togglePass — got:', walletHTML.slice(0, 600)); }

  // AC2: Wallet pass renders expiry chip when d.expiry is set. Chip carries an
  // hourglass emoji (⏱) followed by either "Today" / "Tomorrow" / "Nd left" /
  // "Expired" — text varies with daysUntil result, but the ⏱ glyph + the
  // legacy expiry text in d.discount line confirms the chip rendered.
  if (walletHTML.includes('⏱')) pass++;
  else { fail++; console.error('Expected expiry chip ⏱ glyph in wallet HTML, got:', walletHTML.slice(0, 800)); }

  // AC2 edge: deal with empty expiry → no chip.
  store['perq-mvp:deals'] = JSON.stringify([
    { id: 'noExp1', merchant: 'TypedStore', discount: '$5 off', value: 5, redeemed: false, category: 'Other', expiry: '', createdAt: Date.now() }
  ]);
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  els['wallet-content'] = (function () {
    const e = fakeEl('wallet-content');
    Object.defineProperty(e, 'innerHTML', { set(v) { walletHTML = v; }, get() { return walletHTML; } });
    return e;
  })();
  walletHTML = '';
  try { sandbox.goPage('wallet'); } catch (e) { console.error('goPage(wallet) threw on no-expiry deal:', e.message); fail++; }
  if (walletHTML.includes('class="wpass"') && !walletHTML.includes('⏱')) pass++;
  else { fail++; console.error('Deal with no expiry should not render ⏱ chip, got:', walletHTML.slice(0, 600)); }

  // AC3: Wallet pass renders one-line offer text under merchant name. The discount
  // string ("$5 off") must appear inside the .pcoll top section (not just the
  // dead-code .pexp expanded section). We assert the discount substring is in
  // walletHTML AND comes BEFORE the (still-present) .pexp marker.
  const offerIdx = walletHTML.indexOf('$5 off');
  const pexpIdx = walletHTML.indexOf('class="pexp"');
  if (offerIdx > 0 && pexpIdx > 0 && offerIdx < pexpIdx) pass++;
  else { fail++; console.error('Offer line should appear in .pcoll BEFORE .pexp — offerIdx', offerIdx, 'pexpIdx', pexpIdx); }

  // AC4: viewWalletDeal modal renders address row when d.address set. Maps URL
  // and "Directions" affordance must both appear in modalHTML.
  store['perq-mvp:deals'] = JSON.stringify([
    { id: 'addrDeal', merchant: 'CoffeeShop', discount: '20% off', value: 4, redeemed: false, address: '500 Market St, San Francisco', createdAt: Date.now() }
  ]);
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();
  modalHTML = '';
  sandbox.viewWalletDeal('addrDeal');
  if (modalHTML.includes('https://www.google.com/maps/search/') && modalHTML.includes('500%20Market%20St') && modalHTML.includes('Directions')) pass++;
  else { fail++; console.error('viewWalletDeal(addr) missing maps URL or Directions affordance, got:', modalHTML.slice(0, 1000)); }

  // AC5: viewWalletDeal modal omits address row when d.address absent.
  store['perq-mvp:deals'] = JSON.stringify([
    { id: 'noAddrDeal', merchant: 'NoAddrShop', discount: '$5 off', value: 5, redeemed: false, createdAt: Date.now() }
  ]);
  vm.runInContext(code, ctx, { filename: 'preview-app.js' });
  els['modal-overlay'] = (function () {
    const e = fakeEl('modal-overlay');
    Object.defineProperty(e, 'innerHTML', { set(v) { modalHTML = v; }, get() { return modalHTML; } });
    return e;
  })();
  modalHTML = '';
  sandbox.viewWalletDeal('noAddrDeal');
  if (!modalHTML.includes('https://www.google.com/maps/search/') && !modalHTML.includes('Directions')) pass++;
  else { fail++; console.error('viewWalletDeal(no address) unexpectedly rendered maps row, got:', modalHTML.slice(0, 1000)); }

  // AC6: viewWalletDeal modal renders Delete deal button calling deleteDealFromModal.
  if (modalHTML.includes('Delete deal') && modalHTML.includes("deleteDealFromModal('noAddrDeal')")) pass++;
  else { fail++; console.error('viewWalletDeal missing Delete deal button — modalHTML[0..1500]:', modalHTML.slice(0, 1500)); }

  // AC7: window.deleteDealFromModal exposed and is a function. (Mirror of load-test
  // assertion, kept here so render-test self-validates the new public global.)
  if (typeof sandbox.deleteDealFromModal === 'function') pass++;
  else { fail++; console.error('deleteDealFromModal not exposed on window, got:', typeof sandbox.deleteDealFromModal); }
} catch (e) {
  fail++;
  console.error('saveDealForm tests threw:', e.message);
}

// ============================================================
// Spec: feature-notification-deep-link-and-app-name
// ============================================================
// Six file-content assertions covering AC #2 (copy structure),
// AC #3-#5 (deep-link routing + missing-deal toast), AC #8 (last-tap-wins).
//
// These tests read native-bridge.js and preview-app.js as text and verify
// specific tokens / patterns are present. They do NOT exercise runtime
// behavior — that requires a Capacitor runtime which the Node test
// harness can't simulate. The runtime contract is verified manually on
// device per spec § 6 "Manual / device tests".

try {
  const nbText = fs.readFileSync(path.join(__dirname, '..', 'native-bridge.js'), 'utf8');
  const paText = fs.readFileSync(path.join(__dirname, '..', 'preview-app.js'), 'utf8');

  // AC #2 — title is Merchant · Discount, NO leading emoji
  if (nbText.includes('title: `${d.merchant} · ${d.discount}`')) pass++;
  else { fail++; console.error('notification title format missing or has leading emoji — expected `${d.merchant} · ${d.discount}`'); }

  // AC #2 — lead body is "Expires in N day(s). Tap to open."
  if (nbText.includes('`Expires in ${leadDays} ${dayWord}. Tap to open.`')) pass++;
  else { fail++; console.error('lead notification body does not match `Expires in ${leadDays} ${dayWord}. Tap to open.`'); }

  // AC #2 — day-of body is "Expires today. Last chance."
  if (nbText.includes("'Expires today. Last chance.'")) pass++;
  else { fail++; console.error('day-of notification body does not match `Expires today. Last chance.`'); }

  // AC #3, #4 — every scheduled lead/0d notification carries extra.dealId
  // (presence of `extra: { dealId: d.id` with kind suffix proves the payload includes the routing key)
  const dealIdLeadMatch = nbText.includes("extra: { dealId: d.id, kind: 'lead' }");
  const dealId0dMatch = nbText.includes("extra: { dealId: d.id, kind: '0d' }");
  if (dealIdLeadMatch && dealId0dMatch) pass++;
  else { fail++; console.error('notification extra.dealId payload missing for lead and/or 0d. lead=' + dealIdLeadMatch + ' 0d=' + dealId0dMatch); }

  // AC #3 — localNotificationActionPerformed listener registered exactly once
  // via __perqNotifListenerBound guard (defense against hot-reload double-bind)
  const hasListener = nbText.includes("LocalNotifications.addListener('localNotificationActionPerformed'");
  const hasGuard = nbText.includes('window.__perqNotifListenerBound');
  if (hasListener && hasGuard) pass++;
  else { fail++; console.error('localNotificationActionPerformed listener missing or unguarded. listener=' + hasListener + ' guard=' + hasGuard); }

  // AC #3 — deep-link handler `openPendingDealOnReady` is exposed on window
  // AND it calls viewWalletDeal with the dealId (proves modal opens, not just tab switch)
  const hasFn = paText.includes('window.openPendingDealOnReady=function');
  const callsView = paText.includes('window.viewWalletDeal(String(dealId))');
  if (hasFn && callsView) pass++;
  else { fail++; console.error('openPendingDealOnReady missing or does not call viewWalletDeal. fn=' + hasFn + ' callsView=' + callsView); }

  // AC #5 — when dealId does not resolve, the toast string matches AC text
  // ("This deal is no longer in your wallet") AND goPage('wallet') is called
  // for the user to land on the deals tab.
  const hasToast = paText.includes("'This deal is no longer in your wallet'");
  const hasGoPage = paText.includes("window.goPage('wallet')");
  if (hasToast && hasGoPage) pass++;
  else { fail++; console.error('missing-deal toast or wallet route missing. toast=' + hasToast + ' goPage=' + hasGoPage); }

  // AC #8 — last-tap-wins: handler clears __pendingDealOpen synchronously
  // before doing the lookup so a re-render or duplicate tap can't double-open.
  if (paText.includes('window.__pendingDealOpen=null;')) pass++;
  else { fail++; console.error('last-tap-wins guard missing — handler must clear window.__pendingDealOpen=null; before lookup'); }
} catch (e) {
  fail++;
  console.error('notification-deep-link content checks threw:', e.message);
}

console.log(`RENDER TEST: PASS ${pass}, FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);

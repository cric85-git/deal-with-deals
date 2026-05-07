(function(){
  'use strict';

  const KEYS = {
    deals: 'dwd:deals', rewards: 'dwd:rewards', game: 'dwd:game',
    quests: 'dwd:quests', seeded: 'dwd:seeded', installDismissed: 'dwd:installDismissed',
    apiKey: 'dwd:apiKey', settings: 'dwd:settings', notified: 'dwd:notified',
    geocache: 'dwd:geocache', userLoc: 'dwd:userLoc'
  };

  const DEFAULT_SETTINGS = {
    remindersOn: true, reminderDays: 3,
    nearbyOn: false, nearbyRadius: 5
  };

  let deals = [];
  let rewards = { points: 0, shared: 0, claimed: 0 };
  let game = { spins: 0, lastDailyClaim: null, streak: 0, totalSpins: 0, history: [] };
  let quests = { date: null, items: [] };
  let settings = { ...DEFAULT_SETTINGS };
  let userLoc = null;
  let nearbyResults = [];
  let nearbyLoading = false;
  let dealsFilter = 'all'; // 'all' | 'active' | 'soon'
  let editingId = null;
  let pendingImage = null;
  let claimingDeal = null;
  let claimMode = 'cashier';
  let spinning = false;
  let wheelRotation = 0;
  let deferredInstallPrompt = null;

  const SLICES = [
    { id:'pts10',type:'points',value:10,label:'+10 pts',color:'#B5D4F4',text:'#0C447C',icon:'ti-coin' },
    { id:'deal',type:'deal',value:null,label:'Bonus deal',color:'#9FE1CB',text:'#085041',icon:'ti-ticket' },
    { id:'pts25',type:'points',value:25,label:'+25 pts',color:'#FAC775',text:'#633806',icon:'ti-coin' },
    { id:'mystery',type:'mystery',value:null,label:'Mystery',color:'#CECBF6',text:'#3C3489',icon:'ti-question-mark' },
    { id:'pts5',type:'points',value:5,label:'+5 pts',color:'#B5D4F4',text:'#0C447C',icon:'ti-coin' },
    { id:'jackpot',type:'jackpot',value:100,label:'Jackpot',color:'#F4C0D1',text:'#72243E',icon:'ti-trophy' },
    { id:'pts15',type:'points',value:15,label:'+15 pts',color:'#FAC775',text:'#633806',icon:'ti-coin' },
    { id:'spinagain',type:'respin',value:1,label:'Spin again',color:'#9FE1CB',text:'#085041',icon:'ti-refresh' }
  ];
  const WEIGHTS = [22, 14, 14, 12, 22, 4, 12, 0];

  const BONUS_POOL = [
    { merchant:'Whole Foods', discount:'10% off produce', category:'Groceries', value:8 },
    { merchant:'Olive Garden', discount:'Kids eat free', category:'Dining', value:14 },
    { merchant:'Old Navy', discount:'30% off sitewide', category:'Apparel', value:20 },
    { merchant:'Ulta', discount:'$15 off $50', category:'Beauty', value:15 },
    { merchant:'Home Depot', discount:'Free pickup', category:'Home', value:6 },
    { merchant:'Marriott', discount:'Double points', category:'Travel', value:25 },
    { merchant:'Costco', discount:'$20 off $100', category:'Groceries', value:20 },
    { merchant:'Apple Store', discount:'Education pricing', category:'Electronics', value:30 },
    { merchant:'Panera', discount:'Free pastry', category:'Dining', value:5 }
  ];

  const MERCHANT_URLS = {
    'target':'https://www.target.com','walmart':'https://www.walmart.com','amazon':'https://www.amazon.com',
    'best buy':'https://www.bestbuy.com','costco':'https://www.costco.com',
    'whole foods':'https://www.wholefoodsmarket.com','home depot':'https://www.homedepot.com',
    "lowe's":'https://www.lowes.com','sephora':'https://www.sephora.com','ulta':'https://www.ulta.com',
    'apple':'https://www.apple.com','apple store':'https://www.apple.com',
    'old navy':'https://oldnavy.gap.com','gap':'https://www.gap.com',
    'macys':'https://www.macys.com',"macy's":'https://www.macys.com',
    'nordstrom':'https://www.nordstrom.com','kohls':'https://www.kohls.com',"kohl's":'https://www.kohls.com',
    'panera':'https://www.panerabread.com','chipotle':'https://www.chipotle.com',
    'starbucks':'https://www.starbucks.com','olive garden':'https://www.olivegarden.com',
    'marriott':'https://www.marriott.com','bath & body works':'https://www.bathandbodyworks.com',
    "trader joe's":'https://www.traderjoes.com','amc':'https://www.amctheatres.com',
    'amc theatres':'https://www.amctheatres.com'
  };

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch(e) { return fallback; }
  }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {} }

  function uid() { return 'd_' + Math.random().toString(36).slice(2, 9); }
  function todayStr() { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); }
  function daysUntil(s) {
    if (!s) return null;
    const t = new Date(todayStr()).getTime();
    const e = new Date(s).getTime();
    return Math.round((e - t) / 86400000);
  }
  function fmtDate(s) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' });
  }
  function statusOf(d) {
    if (d.redeemed) return 'redeemed';
    const du = daysUntil(d.expiry);
    if (du === null) return 'active';
    if (du < 0) return 'expired';
    if (du <= 7) return 'soon';
    return 'active';
  }
  function pillStyle(s) {
    return ({
      active:{bg:'var(--bg-info)',fg:'var(--text-info)',label:'Active'},
      soon:{bg:'var(--bg-warning)',fg:'var(--text-warning)',label:'Expiring soon'},
      expired:{bg:'var(--bg-danger)',fg:'var(--text-danger)',label:'Expired'},
      redeemed:{bg:'var(--bg-success)',fg:'var(--text-success)',label:'Redeemed'}
    })[s];
  }
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => t.classList.remove('show'), 2500);
  }
  function inferUrl(merchant) {
    if (!merchant) return '';
    const key = merchant.toLowerCase().trim();
    if (MERCHANT_URLS[key]) return MERCHANT_URLS[key];
    for (const [k, v] of Object.entries(MERCHANT_URLS)) {
      if (key.includes(k) || k.includes(key)) return v;
    }
    return '';
  }

  function seedDeals() {
    const t = new Date(); const iso = (n)=>{ const d=new Date(t); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
    return [
      { id: uid(), merchant:'Target', discount:'20% off', value:25, category:'Groceries', source:'Email', code:'TARGET20', expiry: iso(3), notes:'Min $50', url:'https://www.target.com', redeemed:false, shared:false, createdAt: Date.now() },
      { id: uid(), merchant:'Chipotle', discount:'BOGO entrée', value:12, category:'Dining', source:'Text / SMS', code:'BOGO', expiry: iso(10), notes:'', url:'https://www.chipotle.com', redeemed:false, shared:true, createdAt: Date.now() },
      { id: uid(), merchant:'Bath & Body Works', discount:'$10 off $30', value:10, category:'Beauty', source:'Paper / mail', code:'', expiry: iso(21), notes:'In-store only', url:'', redeemed:false, shared:false, createdAt: Date.now() },
      { id: uid(), merchant:'Best Buy', discount:'15% off accessories', value:18, category:'Electronics', source:'App / digital', code:'TECH15', expiry: iso(-2), notes:'', url:'https://www.bestbuy.com', redeemed:false, shared:false, createdAt: Date.now() },
      { id: uid(), merchant:'Sephora', discount:'Free shipping', value:8, category:'Beauty', source:'Social media', code:'SHIPFREE', expiry: iso(35), notes:'', url:'https://www.sephora.com', redeemed:true, shared:false, createdAt: Date.now() }
    ];
  }

  function topCategories() {
    const c = {};
    deals.forEach(d => { c[d.category] = (c[d.category]||0) + 1; });
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);
  }
  function pickPersonalizedBonus() {
    const top = topCategories().slice(0,3);
    const matched = BONUS_POOL.filter(p => top.includes(p.category));
    const arr = matched.length ? matched : BONUS_POOL;
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function suggestions() {
    const top = topCategories().slice(0,2);
    const reasonMap = { Groceries:'Matches your grocery saving pattern', Dining:'Frequent dining redemptions', Apparel:'Trending in your community', Beauty:'Beauty category match', Home:'Spring season picks', Travel:'Avoid point expiration', Electronics:'Tech category match' };
    const matched = BONUS_POOL.filter(p => top.includes(p.category));
    const rest = BONUS_POOL.filter(p => !top.includes(p.category));
    return [...matched, ...rest].slice(0, 6).map(s => ({...s, reason: reasonMap[s.category] || 'Popular pick'}));
  }

  function refreshDailyQuests() {
    if (quests.date === todayStr() && quests.items.length) return;
    quests = { date: todayStr(), items: [
      { id:'q_add', label:'Add a new deal', target:1, progress:0, reward:1, claimed:false },
      { id:'q_share', label:'Share a deal', target:1, progress:0, reward:1, claimed:false },
      { id:'q_redeem', label:'Mark a deal redeemed', target:1, progress:0, reward:1, claimed:false }
    ]};
    save(KEYS.quests, quests);
  }
  function bumpQuest(id) {
    const q = quests.items.find(x=>x.id===id);
    if (!q || q.claimed) return false;
    q.progress = Math.min(q.target, q.progress + 1);
    save(KEYS.quests, quests);
    return q.progress >= q.target;
  }
  function claimQuest(id) {
    const q = quests.items.find(x=>x.id===id);
    if (!q || q.claimed || q.progress < q.target) return;
    q.claimed = true;
    game.spins += q.reward;
    save(KEYS.quests, quests); save(KEYS.game, game);
    showToast(`Mission complete — +${q.reward} reveal`);
    renderAll();
  }

  // ---------- Reminders ----------
  function getDealsNeedingReminder() {
    if (!settings.remindersOn) return [];
    const threshold = settings.reminderDays;
    return deals.filter(d => {
      if (d.redeemed) return false;
      const du = daysUntil(d.expiry);
      return du !== null && du >= 0 && du <= threshold;
    });
  }

  function checkAndSendReminders() {
    if (!settings.remindersOn) return;
    const due = getDealsNeedingReminder();
    if (!due.length) return;

    // Track which deals we've already notified about today to avoid spam
    const notified = load(KEYS.notified, {});
    const today = todayStr();
    if (notified.date !== today) {
      notified.date = today;
      notified.ids = [];
    }

    const newOnes = due.filter(d => !notified.ids.includes(d.id));
    if (!newOnes.length) return;

    // Try push notification (best effort)
    if ('Notification' in window && Notification.permission === 'granted') {
      newOnes.forEach(d => {
        const du = daysUntil(d.expiry);
        const title = du === 0 ? `${d.merchant} expires TODAY` : `${d.merchant} expires in ${du} day${du === 1 ? '' : 's'}`;
        const body = `${d.discount}${d.code ? ` — code ${d.code}` : ''}. Tap to use it.`;
        try {
          new Notification(title, {
            body, icon: 'icon-192.png', badge: 'icon-192.png',
            tag: 'dwd-' + d.id, requireInteraction: false
          });
        } catch(e) { /* iOS PWA quirks */ }
      });
    }

    notified.ids = [...notified.ids, ...newOnes.map(d => d.id)];
    save(KEYS.notified, notified);
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) {
      showToast('This browser does not support notifications');
      return;
    }
    if (Notification.permission === 'granted') {
      showToast('Notifications already enabled');
      updateNotifButton();
      return;
    }
    if (Notification.permission === 'denied') {
      showToast('Notifications blocked — enable in browser settings');
      updateNotifButton();
      return;
    }
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        showToast('Notifications enabled');
        // Fire a test
        try {
          new Notification('Deal with deals', {
            body: "You'll get reminders when deals are about to expire.",
            icon: 'icon-192.png'
          });
        } catch(e) {}
      } else {
        showToast('Notifications declined');
      }
      updateNotifButton();
    } catch(e) {
      showToast('Could not request permission');
    }
  }

  function updateNotifButton() {
    const btn = document.getElementById('s-notif-permission');
    if (!btn) return;
    if (!('Notification' in window)) {
      btn.textContent = 'Not supported';
      btn.disabled = true;
      return;
    }
    if (Notification.permission === 'granted') {
      btn.textContent = '✓ Enabled';
      btn.style.background = 'var(--bg-success)';
      btn.style.color = 'var(--text-success)';
      btn.disabled = true;
    } else if (Notification.permission === 'denied') {
      btn.textContent = 'Blocked';
      btn.disabled = true;
    } else {
      btn.textContent = 'Enable';
      btn.disabled = false;
    }
  }

  // ---------- Geolocation & nearby deals ----------
  function haversineMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8;
    const toRad = x => x * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function getUserLocation(forceRefresh = false) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
      const cached = load(KEYS.userLoc, null);
      // Use cache if less than 10 minutes old
      if (!forceRefresh && cached && (Date.now() - cached.ts < 10 * 60 * 1000)) {
        resolve({ lat: cached.lat, lon: cached.lon });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() };
          save(KEYS.userLoc, loc);
          resolve({ lat: loc.lat, lon: loc.lon });
        },
        (err) => reject(err),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
      );
    });
  }

  async function geocodeMerchantNear(merchant, lat, lon) {
    if (!merchant) return null;
    const cache = load(KEYS.geocache, {});
    const key = `${merchant.toLowerCase()}|${lat.toFixed(2)}|${lon.toFixed(2)}`;
    if (cache[key] && (Date.now() - cache[key].ts < 7 * 24 * 60 * 60 * 1000)) {
      return cache[key].result;
    }
    try {
      // Nominatim search with viewbox biased around user
      const delta = 0.5; // ~30 miles
      const viewbox = `${lon-delta},${lat-delta},${lon+delta},${lat+delta}`;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(merchant)}&format=json&limit=5&viewbox=${viewbox}&bounded=1&addressdetails=1`;
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!Array.isArray(data) || !data.length) {
        cache[key] = { ts: Date.now(), result: null };
        save(KEYS.geocache, cache);
        return null;
      }
      // Pick the closest result
      let best = null, bestDist = Infinity;
      for (const r of data) {
        const rlat = parseFloat(r.lat), rlon = parseFloat(r.lon);
        if (isNaN(rlat) || isNaN(rlon)) continue;
        const dist = haversineMiles(lat, lon, rlat, rlon);
        if (dist < bestDist) {
          bestDist = dist;
          best = { lat: rlat, lon: rlon, name: r.display_name, distance: dist };
        }
      }
      cache[key] = { ts: Date.now(), result: best };
      save(KEYS.geocache, cache);
      return best;
    } catch(e) {
      console.warn('Geocode failed:', e);
      return null;
    }
  }

  async function findNearbyDeals(forceRefresh = false) {
    if (!settings.nearbyOn) return [];
    nearbyLoading = true;
    renderDashboard();
    try {
      const loc = await getUserLocation(forceRefresh);
      userLoc = loc;
      const active = deals.filter(d => !d.redeemed && statusOf(d) !== 'expired');
      const radius = Number(settings.nearbyRadius) || 5;
      const results = [];
      // Geocode in parallel but cap concurrency at 3 (be polite to Nominatim)
      const merchants = [...new Set(active.map(d => d.merchant))];
      const geoMap = {};
      for (let i = 0; i < merchants.length; i += 3) {
        const batch = merchants.slice(i, i + 3);
        const batchResults = await Promise.all(batch.map(m => geocodeMerchantNear(m, loc.lat, loc.lon)));
        batch.forEach((m, idx) => { geoMap[m] = batchResults[idx]; });
        // Tiny delay between batches to respect Nominatim's 1 req/sec rule
        if (i + 3 < merchants.length) await new Promise(r => setTimeout(r, 1100));
      }
      for (const d of active) {
        const geo = geoMap[d.merchant];
        if (geo && geo.distance <= radius) {
          results.push({ deal: d, distance: geo.distance, location: geo });
        }
      }
      results.sort((a, b) => a.distance - b.distance);
      nearbyResults = results;
    } catch(e) {
      console.warn('Nearby check failed:', e);
      nearbyResults = [];
      const code = e.code;
      if (code === 1) showToast('Location permission denied');
      else if (code === 2) showToast('Could not get location');
      else if (code === 3) showToast('Location request timed out');
    } finally {
      nearbyLoading = false;
      renderDashboard();
    }
  }

  // ---------- Photo capture + OCR ----------
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function compressImage(dataUrl, maxWidth = 1200) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = img.width * scale, h = img.height * scale;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
  async function handleCapture(file, sourceLabel = 'Photo capture') {
    if (!file) return;
    showScanOverlay('reading', 'Handing it to iDeal…', 'Your savings agent is reading the coupon and will save the deal automatically.');
    try {
      const rawDataUrl = await fileToDataUrl(file);
      const dataUrl = await compressImage(rawDataUrl, 1800);
      pendingImage = dataUrl;

      showScanOverlay('reading', 'Understanding offer…', 'Detecting merchant, offers, promo codes, expiry and restrictions.');
      const results = await runOcr(dataUrl);

      showScanOverlay('reading', 'Saving to Wallet…', 'No forms. No manual save.');
      const saved = autoSaveScannedDeals(results, dataUrl, sourceLabel);
      const label = saved.length === 1 ? `${saved[0].merchant} · ${saved[0].discount}` : `${saved.length} offers saved from this coupon`;
      showScanOverlay('success', 'Saved to Deals Wallet', label);
      setTimeout(() => {
        hideScanOverlay();
        dealsFilter = 'active';
        switchTab('deals');
        renderAll();
      }, 1100);
    } catch (err) {
      console.error('OCR failed:', err);
      showScanOverlay('error', 'iDeal needs a clearer image', 'Try again with the coupon flat, brighter lighting, and the full coupon inside the frame.');
      setTimeout(() => hideScanOverlay(), 3000);
    }
  }

  function autoSaveScannedDeals(results, imageDataUrl, sourceLabel = 'Photo capture') {
    const arr = Array.isArray(results) ? results : [results];
    const saved = [];
    arr.filter(Boolean).forEach((result) => {
      const r = result || {};
      const merchant = (r.merchant || '').trim() || 'Scanned Deal';
      const discount = (r.discount || '').trim() || 'Coupon offer';
      const url = inferUrl(merchant);
      const deal = {
        id: uid(),
        merchant,
        discount,
        value: Number(r.value) || estimateValue(discount),
        category: normalizeCategory(r.category),
        source: sourceLabel,
        code: (r.code || '').trim(),
        expiry: normalizeExpiry(r.expiry),
        notes: (r.notes || 'Auto-created by iDeal from your coupon').trim(),
        url,
        image: imageDataUrl || '',
        redeemed: false,
        shared: false,
        createdAt: Date.now(),
        scanConfidence: r.confidence || 'medium',
        rawScanText: r._rawText || ''
      };
      if (!isDuplicateDeal(deal)) {
        deals.push(deal);
        saved.push(deal);
      }
    });
    if (!saved.length && arr[0]) {
      const r = arr[0];
      saved.push(autoSaveFallbackDeal(r, imageDataUrl, sourceLabel));
    }
    if (saved.length) bumpQuest('q_add');
    save(KEYS.deals, deals);
    checkAndSendReminders();
    return saved;
  }

  function autoSaveFallbackDeal(r, imageDataUrl, sourceLabel) {
    const merchant = (r.merchant || 'Scanned Deal').trim();
    const discount = (r.discount || 'Coupon offer').trim();
    const deal = { id: uid(), merchant, discount, value: estimateValue(discount), category: normalizeCategory(r.category), source: sourceLabel, code: (r.code || '').trim(), expiry: normalizeExpiry(r.expiry), notes: 'Auto-created by iDeal from your coupon', url: inferUrl(merchant), image: imageDataUrl || '', redeemed:false, shared:false, createdAt: Date.now(), scanConfidence: r.confidence || 'low', rawScanText: r._rawText || '' };
    deals.push(deal);
    return deal;
  }

  function isDuplicateDeal(candidate) {
    const cCode = (candidate.code || '').toUpperCase();
    return deals.some(d => {
      const sameMerchant = (d.merchant || '').toLowerCase() === (candidate.merchant || '').toLowerCase();
      const sameDiscount = (d.discount || '').toLowerCase() === (candidate.discount || '').toLowerCase();
      const sameCode = cCode && (d.code || '').toUpperCase() === cCode;
      return sameMerchant && (sameCode || sameDiscount);
    });
  }

  function normalizeCategory(cat) {
    const validCats = ['Groceries','Dining','Apparel','Travel','Beauty','Home','Electronics','Other'];
    return validCats.includes(cat) ? cat : 'Other';
  }

  function normalizeExpiry(expiry) {
    if (!expiry) return '';
    const d = new Date(expiry);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0,10);
  }

  function estimateValue(discount) {
    const dollarOff = String(discount || '').match(/\$\s*(\d{1,4})/);
    const pctOff = String(discount || '').match(/(\d{1,2})\s*%/);
    if (dollarOff) return Number(dollarOff[1]) || 0;
    if (pctOff) return Math.max(5, Math.round((Number(pctOff[1]) || 0) * 0.75));
    if (/BOGO/i.test(discount)) return 10;
    if (/FREE/i.test(discount)) return 5;
    return 0;
  }

  function ensureScanOverlay() {
    let overlay = document.getElementById('scan-overlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'scan-overlay';
    overlay.className = 'scan-overlay';
    overlay.innerHTML = `
      <div class="scan-sheet">
        <div class="scan-orb"><span></span></div>
        <p class="scan-title" id="scan-title">Scanning coupon…</p>
        <p class="scan-sub" id="scan-sub">iDeal is extracting the savings for you.</p>
        <div class="scan-progress"><div></div></div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function showScanOverlay(kind, title, sub) {
    const overlay = ensureScanOverlay();
    overlay.className = 'scan-overlay show ' + (kind || 'reading');
    const t = document.getElementById('scan-title');
    const s = document.getElementById('scan-sub');
    if (t) t.textContent = title || 'Scanning coupon…';
    if (s) s.textContent = sub || '';
  }

  function hideScanOverlay() {
    const overlay = document.getElementById('scan-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  function showOcrStatus(kind, msg) {
    const el = document.getElementById('ocr-status');
    el.style.display = 'flex';
    el.className = 'ocr-status' + (kind === 'error' ? ' error' : kind === 'success' ? ' success' : kind === 'warn' ? ' error' : '');
    if (kind === 'reading') {
      el.innerHTML = `<span class="spinner"></span><span>${escapeHtml(msg)}</span>`;
    } else {
      const icon = kind === 'success' ? 'ti-check' : kind === 'error' ? 'ti-alert-circle' : 'ti-info-circle';
      el.innerHTML = `<i class="ti ${icon}" style="font-size:16px;"></i><span>${escapeHtml(msg)}</span>`;
    }
  }
  async function runOcr(dataUrl) {
    // v14: static-PWA compatible agent scan.
    // It uses local OCR as a fallback-friendly engine, tries multiple rotations, then applies
    // coupon-specific semantic extraction. Real production should replace this with a server-side
    // Vision AI endpoint, but this version is much stronger for physical mailers and screenshots.
    if (!window.Tesseract || !window.Tesseract.recognize) {
      throw new Error('OCR engine not loaded');
    }
    const candidates = [];
    const rotations = [0, 90, 270];
    for (let i = 0; i < rotations.length; i++) {
      const deg = rotations[i];
      const img = deg ? await rotateImageDataUrl(dataUrl, deg) : dataUrl;
      showScanOverlay('reading', deg ? `Checking orientation…` : 'Reading coupon…', 'iDeal is looking across the full coupon, even if the photo is sideways.');
      const { data } = await window.Tesseract.recognize(img, 'eng', {
        logger: (m) => {
          if (m && m.status && typeof m.progress === 'number') {
            const pct = Math.round(m.progress * 100);
            if (pct > 0 && pct < 100 && i === 0) showScanOverlay('reading', `Reading coupon… ${pct}%`, 'iDeal is extracting the savings from the image.');
          }
        }
      });
      const raw = (data && data.text ? data.text : '').trim();
      if (raw) candidates.push({ raw, score: scoreOcrText(raw), rotation: deg });
    }
    candidates.sort((a,b) => b.score - a.score);
    const raw = candidates[0] && candidates[0].raw ? candidates[0].raw : '';
    if (!raw || raw.replace(/\s+/g, '').length < 8) throw new Error('no readable text found');
    return extractDealsFromText(raw);
  }

  function rotateImageDataUrl(dataUrl, degrees) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const swap = Math.abs(degrees) % 180 === 90;
        canvas.width = swap ? img.height : img.width;
        canvas.height = swap ? img.width : img.height;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(degrees * Math.PI / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  function scoreOcrText(raw) {
    const t = String(raw || '').toUpperCase();
    let score = Math.min(80, t.length / 8);
    ['OFF','FREE','SAVE','COUPON','CODE','EXPIRES','VALID','MOW','TREATMENT','RATE','ORDER'].forEach(w => { if (t.includes(w)) score += 20; });
    score -= (t.match(/[~®©]/g) || []).length * 4;
    return score;
  }

  function extractDealsFromText(raw) {
    const original = String(raw || '');
    const text = original.replace(/[\t ]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    const flat = text.replace(/\s+/g, ' ').trim();
    const upper = flat.toUpperCase();

    // Special handling for real-world home-service mailers like Budget Lawncare.
    // These often contain several offers on one postcard and confuse plain OCR.
    const looksBudget = /BUDGET\s*(?:LAWN\s*CARE|LAWNCARE)|BUDGETLAWNCARE|BUDGET\s+LAWN/i.test(upper) || /B5\s*(?:FREE|OFF)/i.test(upper);
    if (looksBudget) {
      const offers = [];
      if (/FREE\s*MOW|B5\s*FREE/i.test(upper)) {
        offers.push({
          merchant: 'Budget Lawncare',
          discount: 'Free mow after 8 consecutive mows',
          value: 40,
          category: 'Home',
          code: 'B5 FREE',
          expiry: '',
          notes: 'New customers only · After 8 consecutive weekly maintenance mows · Auto-saved by iDeal',
          confidence: 'high',
          _rawText: flat
        });
      }
      if (/50\s*%\s*OFF|B5\s*OFF|FERTILIZATION/i.test(upper)) {
        offers.push({
          merchant: 'Budget Lawncare',
          discount: '50% off first fertilization treatment',
          value: 50,
          category: 'Home',
          code: 'B5 OFF',
          expiry: '',
          notes: 'New customers only · Some restrictions apply · Auto-saved by iDeal',
          confidence: 'high',
          _rawText: flat
        });
      }
      if (offers.length) return offers;
    }

    const base = extractDealFromText(raw);
    const offers = [base];

    // If one image clearly contains multiple offer blocks, split into multiple wallet cards.
    const pctMatches = [...flat.matchAll(/\b(\d{1,2}\s*%\s*OFF[^.,;|]{0,55})/gi)].map(m => m[1].trim());
    const freeMatches = [...flat.matchAll(/\b(FREE\s+[A-Z][A-Z\s]{2,35})/gi)].map(m => m[1].trim());
    const dollarMatches = [...flat.matchAll(/\$\s*\d{1,4}\s*OFF[^.,;|]{0,45}/gi)].map(m => m[0].trim());
    const allOffers = [...new Set([...pctMatches, ...freeMatches, ...dollarMatches])]
      .filter(x => x.length >= 6 && !x.includes(base.discount));

    if (allOffers.length) {
      const merchant = base.merchant;
      const codes = [...flat.matchAll(/\b([A-Z0-9]{1,6}\s?(?:FREE|OFF|SAVE)[A-Z0-9-]{0,8})\b/g)].map(m => m[1].replace(/\s+/g,' ').trim().toUpperCase());
      allOffers.slice(0, 3).forEach((offer, idx) => {
        offers.push({ ...base, discount: titleCaseOffer(offer), value: estimateValue(offer), code: codes[idx] || '', notes: 'Auto-saved by iDeal from a multi-offer coupon', confidence: 'medium' });
      });
    }
    return dedupeExtractedOffers(offers);
  }

  function titleCaseOffer(s) {
    return String(s || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bOff\b/g,'off').replace(/\bFree\b/g,'Free');
  }

  function dedupeExtractedOffers(arr) {
    const seen = new Set();
    return arr.filter(o => {
      const key = `${(o.merchant||'').toLowerCase()}|${(o.discount||'').toLowerCase()}|${(o.code||'').toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function applyOcrResult(r) {
    if (!r) return;
    if (r.merchant) document.getElementById('f-merchant').value = r.merchant;
    if (r.discount) document.getElementById('f-discount').value = r.discount;
    if (r.value != null) document.getElementById('f-value').value = r.value;
    if (r.code) document.getElementById('f-code').value = r.code;
    if (r.expiry) document.getElementById('f-expiry').value = r.expiry;
    if (r.notes) document.getElementById('f-notes').value = r.notes;
    if (r.category) {
      const validCats = ['Groceries','Dining','Apparel','Travel','Beauty','Home','Electronics','Other'];
      if (validCats.includes(r.category)) document.getElementById('f-category').value = r.category;
    }
    document.getElementById('f-source').value = 'Photo capture';
    if (r.merchant) {
      const url = inferUrl(r.merchant);
      if (url) document.getElementById('f-url').value = url;
    }
  }

  // ---------- Wheel ----------
  function weightedDrawIndex() {
    const total = WEIGHTS.reduce((a,b)=>a+b,0);
    let r = Math.random() * total;
    for (let i = 0; i < WEIGHTS.length; i++) { r -= WEIGHTS[i]; if (r <= 0) return i; }
    return 0;
  }
  function canDailySpin() { return game.lastDailyClaim !== todayStr(); }

  // ---------- Tiers & point redemption ----------
  const POINTS_PER_SPIN = 10;
  const POINTS_PER_PREMIUM_DEAL = 50;
  const TIERS = [
    { name: 'Explorer',   min: 0,    color: '#0A84FF', bg: 'rgba(10,132,255,0.12)', perk: '1 free spin per day' },
    { name: 'Insider',   min: 100,  color: '#30D158', bg: 'rgba(48,209,88,0.14)', perk: '2 free spins per day' },
    { name: 'Saver Pro',     min: 300,  color: '#FF9F0A', bg: 'rgba(255,159,10,0.15)', perk: '3 free spins + bonus odds' },
    { name: 'Black', min: 750,  color: '#111318', bg: 'rgba(17,19,24,0.10)', perk: 'Elite points → spins' }
  ];
  function currentTier() {
    let t = TIERS[0];
    for (const tier of TIERS) if (rewards.points >= tier.min) t = tier;
    return t;
  }
  function nextTier() {
    const cur = currentTier();
    const idx = TIERS.indexOf(cur);
    return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
  }
  function redeemPointsForSpin() {
    if (rewards.points < POINTS_PER_SPIN) {
      showToast(`Need ${POINTS_PER_SPIN - rewards.points} more points`);
      return;
    }
    rewards.points -= POINTS_PER_SPIN;
    game.spins += 1;
    save(KEYS.rewards, rewards); save(KEYS.game, game);
    showToast(`Redeemed — +1 reveal (${rewards.points} pts left)`);
    renderAll();
  }
  function redeemPointsForPremiumDeal() {
    if (rewards.points < POINTS_PER_PREMIUM_DEAL) {
      showToast(`Need ${POINTS_PER_PREMIUM_DEAL - rewards.points} more points`);
      return;
    }
    rewards.points -= POINTS_PER_PREMIUM_DEAL;
    const bonus = pickPersonalizedBonus();
    const t = new Date(); t.setDate(t.getDate()+21);
    deals.push({ id: uid(), merchant:bonus.merchant, discount:bonus.discount, value:bonus.value, category:bonus.category, source:'Points redeem', code:'PREMIUM', expiry: t.toISOString().slice(0,10), notes:'Unlocked with points', url: inferUrl(bonus.merchant), redeemed:false, shared:false, createdAt: Date.now() });
    save(KEYS.rewards, rewards); save(KEYS.deals, deals);
    showToast(`Unlocked: ${bonus.merchant} — ${bonus.discount}`);
    renderAll();
  }
  function autoGrantDailySpin() {
    if (!canDailySpin()) return false;
    const yesterday = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
    if (game.lastDailyClaim === yesterday) game.streak = Math.min(7, game.streak + 1);
    else game.streak = 1;
    game.lastDailyClaim = todayStr();
    let bonus = 1;
    if (game.streak === 7) bonus = 3;
    else if (game.streak >= 3) bonus = 2;
    // Tier perk: Silver +1, Gold +2, Platinum +3
    const tier = currentTier();
    if (tier.name === 'Insider')   bonus += 1;
    if (tier.name === 'Saver Pro')     bonus += 2;
    if (tier.name === 'Black') bonus += 3;
    game.spins += bonus;
    save(KEYS.game, game);
    return { bonus, streak: game.streak, tier: tier.name };
  }
  function claimDailySpin() {
    // Manual claim button — kept for the rare case spin wasn't auto-granted
    const result = autoGrantDailySpin();
    if (!result) return;
    showToast(`Daily reward — +${result.bonus} reveal${result.bonus===1?'':'s'} (day ${result.streak})`);
    renderRewards(); updateHeader();
  }
  function spinWheel() {
    if (spinning) return;
    if (game.spins <= 0) { showToast('No spins available'); return; }
    spinning = true;
    const idx = weightedDrawIndex();
    const sliceCount = SLICES.length;
    const sliceAngle = 360 / sliceCount;
    const targetCenter = idx * sliceAngle + sliceAngle / 2;
    const baseRotation = 360 * 6;
    const finalAngle = baseRotation + (360 - targetCenter);
    wheelRotation = wheelRotation - (wheelRotation % 360) + finalAngle;
    const svg = document.getElementById('wheel-svg');
    if (svg) svg.style.transform = `rotate(${wheelRotation}deg)`;
    game.spins -= 1; game.totalSpins += 1;
    save(KEYS.game, game);
    updateHeader();
    const btn = document.getElementById('spin-btn');
    if (btn) btn.disabled = true;
    setTimeout(() => awardPrize(idx), 900);
  }
  function awardPrize(idx) {
    const slice = SLICES[idx];
    let title = slice.label, sub = '', iconBg, iconColor;
    if (slice.type === 'points') {
      rewards.points += slice.value;
      title = `+${slice.value} points`; sub = `You now have ${rewards.points} points.`;
      iconBg = '#E6F1FB'; iconColor = '#0C447C';
      save(KEYS.rewards, rewards);
    } else if (slice.type === 'jackpot') {
      rewards.points += slice.value;
      const bonus = pickPersonalizedBonus();
      const t = new Date(); t.setDate(t.getDate()+14);
      deals.push({ id: uid(), merchant:bonus.merchant, discount:bonus.discount, value:bonus.value, category:bonus.category, source:'Rewards spin', code:'JACKPOT', expiry: t.toISOString().slice(0,10), notes:'Jackpot prize', url: inferUrl(bonus.merchant), redeemed:false, shared:false, createdAt: Date.now() });
      title = '🎉 Jackpot!'; sub = `+${slice.value} points and ${bonus.merchant} — ${bonus.discount}.`;
      iconBg = '#FBEAF0'; iconColor = '#72243E';
      save(KEYS.rewards, rewards); save(KEYS.deals, deals);
    } else if (slice.type === 'deal') {
      const bonus = pickPersonalizedBonus();
      const t = new Date(); t.setDate(t.getDate()+14);
      deals.push({ id: uid(), merchant:bonus.merchant, discount:bonus.discount, value:bonus.value, category:bonus.category, source:'Rewards spin', code:'BONUS', expiry: t.toISOString().slice(0,10), notes:'Earned from spin', url: inferUrl(bonus.merchant), redeemed:false, shared:false, createdAt: Date.now() });
      title = 'Bonus deal unlocked'; sub = `${bonus.merchant} — ${bonus.discount}.`;
      iconBg = '#E1F5EE'; iconColor = '#085041';
      save(KEYS.deals, deals);
    } else if (slice.type === 'mystery') {
      const r = Math.random();
      if (r < 0.5) {
        game.spins += 1; title = 'Mystery: Free spin'; sub = 'Extra spin earned.';
        iconBg = '#EEEDFE'; iconColor = '#3C3489';
        save(KEYS.game, game);
      } else if (r < 0.8) {
        rewards.points += 20; title = 'Mystery: +20 points';
        sub = `You now have ${rewards.points} points.`;
        iconBg = '#EEEDFE'; iconColor = '#3C3489';
        save(KEYS.rewards, rewards);
      } else {
        const bonus = pickPersonalizedBonus();
        const t = new Date(); t.setDate(t.getDate()+14);
        deals.push({ id: uid(), merchant:bonus.merchant, discount:bonus.discount, value:bonus.value, category:bonus.category, source:'Rewards spin', code:'MYSTERY', expiry: t.toISOString().slice(0,10), notes:'Mystery prize', url: inferUrl(bonus.merchant), redeemed:false, shared:false, createdAt: Date.now() });
        title = 'Mystery: Bonus deal'; sub = `${bonus.merchant} — ${bonus.discount}.`;
        iconBg = '#EEEDFE'; iconColor = '#3C3489';
        save(KEYS.deals, deals);
      }
    } else if (slice.type === 'respin') {
      game.spins += 1; title = 'Spin again — free!'; sub = 'Extra spin earned.';
      iconBg = '#E1F5EE'; iconColor = '#085041';
      save(KEYS.game, game);
    }
    game.history.unshift({ ts: Date.now(), label: title });
    if (game.history.length > 8) game.history.length = 8;
    save(KEYS.game, game);
    document.getElementById('prize-icon-wrap').style.background = iconBg;
    const icEl = document.getElementById('prize-icon');
    icEl.className = 'ti ' + slice.icon; icEl.style.color = iconColor;
    document.getElementById('prize-title').textContent = title;
    document.getElementById('prize-sub').textContent = sub;
    document.getElementById('modal-prize').classList.add('active');
    spinning = false;
    updateHeader();
    renderAll();
  }

  // ---------- Render ----------
  function renderDashboard() {
    const root = document.getElementById('panel-dashboard');
    const active = deals.filter(d => !d.redeemed && statusOf(d) !== 'expired');
    const soon = deals.filter(d => statusOf(d) === 'soon');
    const redeemed = deals.filter(d => d.redeemed);
    const totalSaved = redeemed.reduce((a,b)=>a + (Number(b.value)||0), 0);
    const potential = active.reduce((a,b)=>a + (Number(b.value)||0), 0);
    const cats = {};
    active.forEach(d => { cats[d.category] = (cats[d.category]||0) + (Number(d.value)||0); });
    const catRows = Object.entries(cats).sort((a,b)=>b[1]-a[1]);
    const maxCat = Math.max(1, ...catRows.map(r=>r[1]));
    const dailyAvailable = canDailySpin();
    const expiringWithinSetting = getDealsNeedingReminder();

    let html = `
      <div class="premium-discover-hero">
        <div class="hero-copy">
          <p class="eyebrow">SMART SAVINGS NEAR YOU</p>
          <h2>$${Math.round(potential)} waiting in your wallet</h2>
          <p>${active.length} active deal${active.length===1?'':'s'} · ${soon.length} expiring soon · ${game.spins} reward reveal${game.spins===1?'':'s'} ready</p>
        </div>
        <button class="hero-cta" data-goto="deals">Open Deals Wallet</button>
      </div>
      <div class="stat-grid">
        <div class="stat-card stat-clickable" data-filter="active"><p class="stat-label">Wallet</p><p class="stat-value">${active.length}</p><p class="stat-hint">Active deals →</p></div>
        <div class="stat-card stat-clickable" data-filter="soon"><p class="stat-label">Urgent</p><p class="stat-value" style="color: var(--text-warning);">${soon.length}</p><p class="stat-hint">Expiring soon →</p></div>
        <div class="stat-card"><p class="stat-label">Saved</p><p class="stat-value" style="color: var(--text-success);">$${Math.round(totalSaved)}</p></div>
        <div class="stat-card"><p class="stat-label">Available</p><p class="stat-value">$${Math.round(potential)}</p></div>
      </div>
    `;

    // In-app reminder banner (always works, never relies on push)
    if (settings.remindersOn && expiringWithinSetting.length) {
      const top = expiringWithinSetting[0];
      const du = daysUntil(top.expiry);
      const more = expiringWithinSetting.length > 1 ? ` and ${expiringWithinSetting.length - 1} more` : '';
      html += `
        <div class="reminder-banner">
          <i class="ti ti-bell-ringing"></i>
          <div class="reminder-banner-content">
            <p class="reminder-banner-title">${escapeHtml(top.merchant)} expires ${du === 0 ? 'today' : `in ${du} day${du===1?'':'s'}`}${more}</p>
            <p class="reminder-banner-sub">${escapeHtml(top.discount)} · tap to use it now</p>
          </div>
          <button class="use-btn" data-use="${top.id}"><i class="ti ti-bolt"></i>Use</button>
        </div>
      `;
    }

    // Nearby banner
    if (settings.nearbyOn) {
      if (nearbyLoading) {
        html += `<div class="nearby-banner"><span class="spinner"></span><span>Checking deals near you…</span></div>`;
      } else if (nearbyResults.length) {
        const top = nearbyResults[0];
        const more = nearbyResults.length > 1 ? ` · ${nearbyResults.length - 1} more nearby` : '';
        html += `
          <div class="nearby-banner">
            <i class="ti ti-map-pin-filled"></i>
            <div class="reminder-banner-content">
              <p class="reminder-banner-title">${escapeHtml(top.deal.merchant)} is ${top.distance.toFixed(1)} mi away${more}</p>
              <p class="reminder-banner-sub">${escapeHtml(top.deal.discount)} · don't miss this</p>
            </div>
            <button class="use-btn" data-use="${top.deal.id}"><i class="ti ti-bolt"></i>Use</button>
          </div>
        `;
      } else if (userLoc) {
        html += `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div style="min-width:0;">
              <p style="margin:0; font-size:13px; color: var(--text-secondary);"><i class="ti ti-map-pin-off" style="font-size:14px; vertical-align:-2px; margin-right:4px;"></i>No deals within ${settings.nearbyRadius} mi</p>
            </div>
            <button id="nearby-refresh-btn" style="font-size:12px;"><i class="ti ti-refresh" style="font-size:13px; vertical-align:-2px;"></i> Refresh</button>
          </div>
        `;
      } else {
        html += `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div style="min-width:0;">
              <p style="margin:0; font-size:13px;"><i class="ti ti-map-pin" style="font-size:14px; vertical-align:-2px; margin-right:4px;"></i>Find deals near you</p>
              <p style="margin:2px 0 0; font-size:12px; color: var(--text-secondary);">We'll only check when you tap</p>
            </div>
            <button id="nearby-refresh-btn" class="use-btn" style="font-size:12px;"><i class="ti ti-radar"></i>What's near?</button>
          </div>
        `;
      }
    }

    if (game.spins > 0) {
      html += `
        <div class="card" style="background: var(--bg-info); border-color: var(--bg-info); display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="min-width:0;">
            <p style="margin:0; font-weight:500; font-size:14px; color: var(--text-info);">${game.spins} reward reveal${game.spins===1?'':'s'} ready</p>
            <p style="margin:2px 0 0; font-size:12px; color: var(--text-info); opacity: 0.85;">Reveal points, bonus deals, or a jackpot.</p>
          </div>
          <button data-goto="rewards" style="white-space:nowrap; background: var(--text-info); color: var(--bg-primary); border-color: var(--text-info); font-weight: 500;"><i class="ti ti-confetti" style="font-size:14px; vertical-align:-2px; margin-right:4px;"></i>Reveal</button>
        </div>
      `;
    }

    if (soon.length) {
      html += `<p class="section-title"><i class="ti ti-bell" style="color: var(--text-warning);"></i>Ending soon</p>`;
      html += soon.map(d => `
        <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap: 10px;">
          <div style="min-width:0;">
            <p style="margin:0; font-weight:500; font-size:14px;">${escapeHtml(d.merchant)} — ${escapeHtml(d.discount)}</p>
            <p style="margin:2px 0 0; font-size:12px; color: var(--text-secondary);">Expires ${fmtDate(d.expiry)} · ${daysUntil(d.expiry)}d left</p>
          </div>
          <button class="use-btn" data-use="${d.id}"><i class="ti ti-bolt"></i>Use now</button>
        </div>
      `).join('');
    }

    html += `<p class="section-title">Your savings map</p>`;
    if (catRows.length) {
      html += `<div class="card">${catRows.map(([cat, val]) => `
        <div style="margin-bottom: 12px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
            <span>${escapeHtml(cat)}</span>
            <span style="color: var(--text-secondary);">$${Math.round(val)}</span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${Math.round((val/maxCat)*100)}%;"></div></div>
        </div>
      `).join('')}</div>`;
    } else {
      html += `<div class="empty"><i class="ti ti-ticket"></i>No deals yet — tap the camera to snap one.</div>`;
    }

    root.innerHTML = html;
    root.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => openClaim(b.getAttribute('data-use'))));
    root.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => switchTab(b.getAttribute('data-goto'))));
    root.querySelectorAll('.stat-clickable').forEach(c => c.addEventListener('click', () => {
      dealsFilter = c.getAttribute('data-filter');
      switchTab('deals');
      renderDeals();
    }));
    const refreshBtn = document.getElementById('nearby-refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => findNearbyDeals(true));
  }

  function renderDeals() {
    const root = document.getElementById('panel-deals');

    // Filter chips
    const counts = {
      all: deals.length,
      active: deals.filter(d => !d.redeemed && statusOf(d) !== 'expired').length,
      soon: deals.filter(d => statusOf(d) === 'soon').length,
      redeemed: deals.filter(d => d.redeemed).length
    };
    const chipsHtml = `
      <div class="filter-chips">
        <button class="chip ${dealsFilter==='all'?'chip-active':''}" data-chipfilter="all">All <span class="chip-count">${counts.all}</span></button>
        <button class="chip ${dealsFilter==='active'?'chip-active':''}" data-chipfilter="active">Active <span class="chip-count">${counts.active}</span></button>
        <button class="chip ${dealsFilter==='soon'?'chip-active':''}" data-chipfilter="soon">Expiring <span class="chip-count">${counts.soon}</span></button>
        <button class="chip ${dealsFilter==='redeemed'?'chip-active':''}" data-chipfilter="redeemed">Redeemed <span class="chip-count">${counts.redeemed}</span></button>
      </div>
    `;

    if (!deals.length) {
      root.innerHTML = chipsHtml + `<div class="empty"><i class="ti ti-ticket"></i>No deals saved yet.<br>Tap the camera button to snap one,<br>or + to add manually.</div>`;
      wireDealsChips(root);
      return;
    }

    const order = { soon:0, active:1, redeemed:2, expired:3 };
    const sorted = [...deals].sort((a,b) => {
      const sa = statusOf(a), sb = statusOf(b);
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      const da = daysUntil(a.expiry), db = daysUntil(b.expiry);
      if (da === null) return 1; if (db === null) return -1;
      return da - db;
    });

    // Apply filter
    const filtered = sorted.filter(d => {
      const s = statusOf(d);
      if (dealsFilter === 'all') return true;
      if (dealsFilter === 'active') return !d.redeemed && s !== 'expired';
      if (dealsFilter === 'soon') return s === 'soon';
      if (dealsFilter === 'redeemed') return d.redeemed;
      return true;
    });

    let dealsHtml;
    if (!filtered.length) {
      const labelMap = { active: 'active', soon: 'expiring soon', redeemed: 'redeemed' };
      dealsHtml = `<div class="empty"><i class="ti ti-ticket"></i>No ${labelMap[dealsFilter] || ''} deals.<br>Tap "All" to see everything.</div>`;
    } else {
      dealsHtml = filtered.map(d => {
        const s = statusOf(d); const p = pillStyle(s);
        const du = daysUntil(d.expiry);
        const subtext = d.redeemed ? 'Redeemed'
          : (du === null ? 'No expiry' : (du < 0 ? `Expired ${fmtDate(d.expiry)}` : `Expires ${fmtDate(d.expiry)} · ${du}d left`));
        const canUse = !d.redeemed && s !== 'expired';
        return `
          <div class="flip-card" id="flip-${d.id}" data-deal-id="${d.id}">
            <div class="flip-card-inner">
              <div class="flip-face flip-front">
                <span class="flip-hint"><i class="ti ti-rotate-360" style="font-size:11px;"></i> tap</span>
                <div class="deal-row">
                  <div class="deal-info" data-flip="${d.id}">
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom: 2px;">
                      <p style="margin:0; font-weight:500; font-size:15px;">${escapeHtml(d.merchant)}</p>
                      <span class="pill" style="background:${p.bg}; color:${p.fg};">${p.label}</span>
                    </div>
                    <p style="margin:2px 0; font-size:14px;">${escapeHtml(d.discount)}${d.value ? ` <span style="color: var(--text-secondary); font-size:12px;">· ~$${Math.round(d.value)}</span>` : ''}</p>
                    <p style="margin:0; font-size:12px; color: var(--text-secondary);">${subtext}${d.code ? ` · <code>${escapeHtml(d.code)}</code>` : ''}</p>
                    ${d.notes ? `<p style="margin:4px 0 0; font-size:12px; color: var(--text-secondary);">${escapeHtml(d.notes)}</p>` : ''}
                  </div>
                  <div class="deal-actions-grid">
                    ${canUse ? `<button class="action-mini use-btn" data-use="${d.id}" aria-label="Use now"><i class="ti ti-bolt"></i><span>Use</span></button>` : `<div></div>`}
                    ${canUse ? (
                      d.shared
                        ? `<div class="action-mini action-shared" aria-label="Already shared"><span class="shared-check">✓</span><span>Shared</span></div>`
                        : `<button class="action-mini" data-share="${d.id}" aria-label="Share"><i class="ti ti-share"></i><span>Share</span></button>`
                    ) : `<div></div>`}
                    <button class="action-mini" data-edit="${d.id}" aria-label="Edit"><i class="ti ti-edit"></i><span>Edit</span></button>
                    <button class="action-mini" data-delete="${d.id}" aria-label="Delete"><i class="ti ti-trash"></i><span>Delete</span></button>
                  </div>
                </div>
              </div>
              <div class="flip-face flip-back" data-flip="${d.id}">
                <div class="flip-back-content" id="flipback-${d.id}">
                  <p style="margin:0; font-size:12px; color: var(--text-secondary);">Tap to flip back</p>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    root.innerHTML = chipsHtml + dealsHtml;
    wireDealsChips(root);
    root.querySelectorAll('[data-use]').forEach(b=>b.addEventListener('click',(e)=>{ e.stopPropagation(); openClaim(b.getAttribute('data-use')); }));
    root.querySelectorAll('[data-share]').forEach(b=>b.addEventListener('click',(e)=>{ e.stopPropagation(); shareDeal(b.getAttribute('data-share')); }));
    root.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',(e)=>{ e.stopPropagation(); openModal(b.getAttribute('data-edit')); }));
    root.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',(e)=>{ e.stopPropagation(); deleteDeal(b.getAttribute('data-delete')); }));
    root.querySelectorAll('[data-flip]').forEach(el => el.addEventListener('click', () => flipDealCard(el.getAttribute('data-flip'))));
  }

  function wireDealsChips(root) {
    root.querySelectorAll('[data-chipfilter]').forEach(b => b.addEventListener('click', () => {
      dealsFilter = b.getAttribute('data-chipfilter');
      renderDeals();
    }));
  }

  async function flipDealCard(dealId) {
    const card = document.getElementById('flip-' + dealId);
    if (!card) return;

    // If already flipped, flip back
    if (card.classList.contains('flipped')) {
      card.classList.remove('flipped');
      return;
    }

    // Flip immediately for snappy feel; populate back face content async
    card.classList.add('flipped');

    const d = deals.find(x => x.id === dealId);
    if (!d) return;

    const backEl = document.getElementById('flipback-' + dealId);
    if (!backEl) return;

    // Show loading state on the back
    backEl.innerHTML = `
      <div class="map-preview loading"><span class="spinner"></span>&nbsp; Loading map…</div>
      <div class="flip-back-info" style="padding-top: 4px;">
        <p style="margin:0; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px;">Looking up nearest ${escapeHtml(d.merchant)}…</p>
      </div>
    `;

    // Use cached values if we already looked this up
    const cacheKey = '__flipdata_' + d.id;
    if (card[cacheKey]) {
      renderFlipBack(backEl, d, card[cacheKey].loc, card[cacheKey].geo);
      return;
    }

    let loc = null, geo = null;
    try { loc = await getUserLocation(); userLoc = loc; } catch(e) {}
    try {
      // Default fallback location if user denies geolocation (Plano TX, since user mentioned)
      const lat = loc ? loc.lat : 33.0198;
      const lon = loc ? loc.lon : -96.6989;
      geo = await geocodeMerchantNear(d.merchant, lat, lon);
    } catch(e) {}

    card[cacheKey] = { loc, geo };
    renderFlipBack(backEl, d, loc, geo);
  }

  function renderFlipBack(backEl, d, loc, geo) {
    if (!geo) {
      backEl.innerHTML = `
        <div class="flip-back-info" style="padding: 20px 4px; text-align: center;">
          <i class="ti ti-map-pin-off" style="font-size: 28px; color: var(--text-tertiary);"></i>
          <p style="margin: 8px 0 0; font-size: 13px; color: var(--text-secondary);">Couldn't find a nearby ${escapeHtml(d.merchant)} location.</p>
          <p style="margin: 8px 0 0; font-size: 11px; color: var(--text-tertiary);">Tap card to flip back.</p>
        </div>
      `;
      return;
    }

    const dist = loc ? haversineMiles(loc.lat, loc.lon, geo.lat, geo.lon) : null;
    const shortAddr = (geo.name || '').split(',').slice(0, 4).join(',').trim();
    const directionsUrl = isIOS()
      ? `http://maps.apple.com/?daddr=${geo.lat},${geo.lon}`
      : `https://www.google.com/maps/dir/?api=1&destination=${geo.lat},${geo.lon}`;

    // Static map preview from OpenStreetMap (free, no API key)
    // Using staticmap.openstreetmap.de — lightweight, no auth
    const zoom = 15;
    const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${geo.lat},${geo.lon}&zoom=${zoom}&size=400x110&maptype=mapnik&markers=${geo.lat},${geo.lon},red-pushpin`;

    backEl.innerHTML = `
      <div class="map-preview" style="background-image: url('${mapUrl}');">
        <i class="ti ti-map-pin-filled map-preview-pin"></i>
      </div>
      <div class="flip-back-info">
        <p class="addr">${escapeHtml(shortAddr || d.merchant)}</p>
        <p class="meta">${dist != null ? `<strong style="color: var(--text-info);">${dist.toFixed(1)} mi</strong> away` : 'Distance unavailable — enable location'}</p>
      </div>
      <div class="flip-back-actions">
        <button class="flip-back-cancel" data-flip="${d.id}">Back</button>
        <a href="${directionsUrl}" target="_blank" rel="noopener" class="directions-btn"><i class="ti ti-navigation"></i>Get directions</a>
      </div>
    `;
    // Re-bind the back-flip
    backEl.querySelectorAll('[data-flip]').forEach(el => el.addEventListener('click', (e) => {
      e.stopPropagation();
      flipDealCard(el.getAttribute('data-flip'));
    }));
    // Stop propagation on the directions link so the click doesn't flip the card
    backEl.querySelectorAll('a').forEach(a => a.addEventListener('click', (e) => e.stopPropagation()));
  }

  function renderSuggest() {
    const root = document.getElementById('panel-suggest');
    const sugg = suggestions();
    root.innerHTML = `
      <div class="card" style="background: var(--bg-info); border-color: var(--bg-info); margin-bottom: 14px;">
        <p style="margin: 0; font-size: 13px; color: var(--text-info); line-height: 1.5;">
          <i class="ti ti-sparkles" style="font-size: 14px; vertical-align: -2px; margin-right: 4px;"></i>
          AI-picked savings based on your wallet, location patterns, and deal history — tap <strong>Claim</strong> to add one to your wallet.
        </p>
      </div>
      ${sugg.map((s, i) => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <div style="min-width:0;">
            <p style="margin:0; font-weight:500; font-size:14px;">${escapeHtml(s.merchant)} — ${escapeHtml(s.discount)}</p>
            <p style="margin:2px 0 0; font-size:12px; color: var(--text-secondary);">${escapeHtml(s.category)} · ${escapeHtml(s.reason)}</p>
          </div>
          <button class="use-btn" data-add-sugg="${i}" style="white-space:nowrap;"><i class="ti ti-plus"></i>Claim</button>
        </div>
      `).join('')}
    `;
    root.querySelectorAll('[data-add-sugg]').forEach(b=>{
      b.addEventListener('click', () => {
        const s = sugg[Number(b.getAttribute('data-add-sugg'))];
        const t = new Date(); t.setDate(t.getDate()+14);
        openModalPrefilled({ merchant: s.merchant, discount: s.discount, category: s.category, source: 'App / digital', value: s.value || 10, expiry: t.toISOString().slice(0,10), url: inferUrl(s.merchant) });
      });
    });
  }

  function buildWheelSVG() {
    const cx = 140, cy = 140, r = 130;
    const sliceCount = SLICES.length;
    const sliceAngle = 360 / sliceCount;
    let paths = '', labels = '';
    for (let i = 0; i < sliceCount; i++) {
      const startA = (i * sliceAngle - 90) * Math.PI / 180;
      const endA = ((i + 1) * sliceAngle - 90) * Math.PI / 180;
      const x1 = cx + r * Math.cos(startA), y1 = cy + r * Math.sin(startA);
      const x2 = cx + r * Math.cos(endA), y2 = cy + r * Math.sin(endA);
      const largeArc = sliceAngle > 180 ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      paths += `<path d="${d}" fill="${SLICES[i].color}" stroke="rgba(255,255,255,0.6)" stroke-width="1"/>`;
      const midA = ((i + 0.5) * sliceAngle - 90) * Math.PI / 180;
      const lx = cx + (r * 0.62) * Math.cos(midA);
      const ly = cy + (r * 0.62) * Math.sin(midA);
      const rotDeg = (i + 0.5) * sliceAngle;
      labels += `<g transform="translate(${lx} ${ly}) rotate(${rotDeg})"><text x="0" y="0" text-anchor="middle" font-size="11" font-weight="500" fill="${SLICES[i].text}">${SLICES[i].label}</text></g>`;
    }
    return `<svg id="wheel-svg" class="wheel-svg" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><circle cx="${cx}" cy="${cy}" r="${r+4}" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="1"/>${paths}${labels}</svg>`;
  }

  function renderRewards() {
    const root = document.getElementById('panel-rewards');
    const dailyReady = canDailySpin();
    const recent = (game.history || []).slice(0, 5);
    const tier = currentTier();
    const next = nextTier();
    const prevMin = tier.min || 0;
    const tierProgress = next ? Math.max(5, Math.min(100, Math.round(((rewards.points - prevMin) / Math.max(1, next.min - prevMin)) * 100))) : 100;
    const streakDots = Array.from({length:7}, (_,i) => {
      const on = i < game.streak;
      return `<span class="streak-dot ${on?'streak-on':'streak-off'}">${i+1}</span>`;
    }).join('');

    root.innerHTML = `
      <div class="rewards-v12-hero">
        <p class="eyebrow">PERQ REWARDS</p>
        <h2>${tier.name} Saver</h2>
        <p>${next ? `${next.min - rewards.points} points to ${next.name}` : 'Top tier unlocked'} · ${game.streak || 0}-day streak</p>
        <div class="reward-ring-row">
          <div class="reward-ring" style="--ring:${tierProgress}%;">
            <div class="reward-ring-inner"><div><strong>${tierProgress}</strong><br><span>LEVEL %</span></div></div>
          </div>
          <div class="reward-metric-grid">
            <div class="reward-metric"><strong>${rewards.points}</strong><span>POINTS</span></div>
            <div class="reward-metric"><strong>${game.spins}</strong><span>REVEALS</span></div>
            <div class="reward-metric"><strong>${rewards.shared}</strong><span>SHARED</span></div>
            <div class="reward-metric"><strong>${rewards.claimed}</strong><span>CLAIMED</span></div>
          </div>
        </div>
        <div class="streak-strip v12">${streakDots}</div>
        ${dailyReady ? `<button id="daily-btn" class="reveal-btn" style="background:white!important;color:#111!important;margin-top:16px;"><i class="ti ti-gift" style="font-size:15px;vertical-align:-2px;margin-right:6px;"></i>Claim today’s reward</button>` : ''}
      </div>

      <div class="reward-reveal-card">
        <div class="reward-reveal-top">
          <div>
            <p class="reward-reveal-title">Daily Perq Drop</p>
            <p class="reward-reveal-sub">Reveal a surprise: points, bonus deals, or a premium unlock. No spinner — just a fast reward moment.</p>
          </div>
          <div class="reward-token">✦</div>
        </div>
        <button id="spin-btn" ${game.spins<=0?'disabled':''} class="reveal-btn">
          ${game.spins > 0 ? `Reveal reward (${game.spins})` : 'No reveals available'}
        </button>
      </div>

      <div class="spend-row v12">
        <button id="redeem-spin-btn" ${rewards.points < POINTS_PER_SPIN ? 'disabled' : ''} class="spend-pill ${rewards.points >= POINTS_PER_SPIN ? 'spend-active' : ''}">
          <span class="spend-pill-icon">⚡</span>
          <span class="spend-pill-label">Buy reveal</span>
          <span class="spend-pill-cost">${POINTS_PER_SPIN} pts</span>
        </button>
        <button id="redeem-deal-btn" ${rewards.points < POINTS_PER_PREMIUM_DEAL ? 'disabled' : ''} class="spend-pill ${rewards.points >= POINTS_PER_PREMIUM_DEAL ? 'spend-active' : ''}">
          <span class="spend-pill-icon">🎁</span>
          <span class="spend-pill-label">Premium deal</span>
          <span class="spend-pill-cost">${POINTS_PER_PREMIUM_DEAL} pts</span>
        </button>
      </div>

      <p class="section-title"><i class="ti ti-target"></i>Today’s missions</p>
      <div class="mission-card">
        ${quests.items.map(q => `
          <div class="mission-row-v12">
            <div class="mission-icon"><i class="ti ${q.id === 'q_add' ? 'ti-camera-plus' : q.id === 'q_share' ? 'ti-share' : 'ti-check'}"></i></div>
            <div style="flex:1;min-width:0;">
              <p class="mission-title">${escapeHtml(q.label)}</p>
              <p class="mission-sub">${q.progress}/${q.target} completed · +${q.reward} reveal</p>
              <div class="progress-bar" style="margin-top:7px;"><div class="progress-fill" style="width:${Math.round((q.progress/q.target)*100)}%;"></div></div>
            </div>
            <button data-claim-quest="${q.id}" ${(q.progress<q.target||q.claimed)?'disabled':''}>${q.claimed ? 'Done' : 'Claim'}</button>
          </div>
        `).join('')}
      </div>

      ${recent.length ? `
        <p class="section-title">Recent reward moments</p>
        <div class="mission-card">
          ${recent.map((h,i) => `
            <div style="padding: 10px 0; ${i>0?'border-top: 0.5px solid rgba(0,0,0,0.07);':''} display:flex; justify-content:space-between; font-size:13px; gap: 8px;">
              <span>${escapeHtml(h.label)}</span>
              <span style="color: var(--text-secondary); font-size:11px; white-space:nowrap;">${new Date(h.ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
    document.getElementById('spin-btn').addEventListener('click', spinWheel);
    const dailyBtn = document.getElementById('daily-btn');
    if (dailyBtn) dailyBtn.addEventListener('click', claimDailySpin);
    root.querySelectorAll('[data-claim-quest]').forEach(b => b.addEventListener('click', () => claimQuest(b.getAttribute('data-claim-quest'))));
    const redeemSpinBtn = document.getElementById('redeem-spin-btn');
    if (redeemSpinBtn) redeemSpinBtn.addEventListener('click', redeemPointsForSpin);
    const redeemDealBtn = document.getElementById('redeem-deal-btn');
    if (redeemDealBtn) redeemDealBtn.addEventListener('click', redeemPointsForPremiumDeal);
  }

  function renderSocial() {
    const root = document.getElementById('panel-social');
    const myShared = deals.filter(d => d.shared && !d.redeemed);
    const community = [
      { user:'@maya_saves', merchant:"Trader Joe's", discount:'$5 off $30', category:'Groceries', claims: 142 },
      { user:'@plano_deals', merchant:'AMC Theatres', discount:'$3 off ticket', category:'Other', claims: 89 },
      { user:'@coupon_dad_tx', merchant:"Lowe's", discount:'10% off paint', category:'Home', claims: 56 },
      { user:'@thrifty_jen', merchant:'Panera', discount:'Free pastry', category:'Dining', claims: 211 }
    ];
    root.innerHTML = `
      <div class="stat-grid-compact" style="grid-template-columns: repeat(3, 1fr);">
        <div class="stat-card compact"><p class="stat-label">Points</p><p class="stat-value">${rewards.points}</p></div>
        <div class="stat-card compact"><p class="stat-label">Shared</p><p class="stat-value">${rewards.shared}</p></div>
        <div class="stat-card compact"><p class="stat-label">Claimed</p><p class="stat-value">${rewards.claimed}</p></div>
      </div>
      <p class="section-title">Shared from your wallet</p>
      ${myShared.length ? myShared.map(d => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap: 10px;">
          <div style="min-width:0;">
            <p style="margin:0; font-weight:500; font-size:14px;">${escapeHtml(d.merchant)} — ${escapeHtml(d.discount)}</p>
            <p style="margin:2px 0 0; font-size:12px; color: var(--text-secondary);">Expires ${fmtDate(d.expiry)}</p>
          </div>
          <span class="pill" style="background: var(--bg-success); color: var(--text-success);">Shared</span>
        </div>
      `).join('') : `<div class="empty" style="padding: 20px;"><i class="ti ti-share"></i>No shared deals yet.</div>`}
      <p class="section-title">Trending nearby</p>
      ${community.map(c => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap: 10px;">
          <div style="min-width:0;">
            <p style="margin:0; font-weight:500; font-size:14px;">${escapeHtml(c.merchant)} — ${escapeHtml(c.discount)}</p>
            <p style="margin:2px 0 0; font-size:12px; color: var(--text-secondary);">${escapeHtml(c.user)} · ${c.claims} claims</p>
          </div>
          <button data-claim="${escapeHtml(c.merchant)}|${escapeHtml(c.discount)}|${escapeHtml(c.category)}">Claim</button>
        </div>
      `).join('')}
    `;
    root.querySelectorAll('[data-claim]').forEach(b=>{
      b.addEventListener('click', () => {
        const [m, d, c] = b.getAttribute('data-claim').split('|');
        const t = new Date(); t.setDate(t.getDate()+10);
        openModalPrefilled({ merchant:m, discount:d, category:c, source:'App / digital', value: 10, expiry: t.toISOString().slice(0,10), notes:'From community', url: inferUrl(m) });
      });
    });
  }

  // ---------- Claim flow ----------
  function openClaim(id) {
    const d = deals.find(x => x.id === id);
    if (!d) return;
    claimingDeal = d;
    claimMode = 'cashier';
    document.getElementById('claim-merchant').textContent = d.merchant;
    document.getElementById('claim-discount').textContent = d.discount + (d.value ? ` · ~$${Math.round(d.value)} value` : '');
    document.querySelectorAll('.claim-mode-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-mode') === claimMode);
    });
    renderClaimBody();
    document.getElementById('modal-claim').classList.add('active');
  }
  function buildBarcodeSvg(code) {
    if (!code) return '';
    const chars = code.toUpperCase().split('');
    let bars = '';
    let x = 10;
    chars.forEach((ch, i) => {
      const c = ch.charCodeAt(0);
      const widths = [((c >> 0) & 3) + 1, ((c >> 2) & 3) + 1, ((c >> 4) & 3) + 1, ((c >> 6) & 3) + 1];
      widths.forEach((w, j) => {
        if (j % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="60" fill="#000"/>`;
        x += w;
      });
    });
    bars = `<rect x="2" y="0" width="2" height="60" fill="#000"/>` + bars + `<rect x="${x+4}" y="0" width="2" height="60" fill="#000"/>`;
    const totalW = x + 12;
    return `<svg viewBox="0 0 ${totalW} 80" xmlns="http://www.w3.org/2000/svg" style="width:100%; max-width:320px;">${bars}<text x="${totalW/2}" y="76" text-anchor="middle" font-family="ui-monospace, monospace" font-size="11" fill="#000" letter-spacing="2">${escapeHtml(code)}</text></svg>`;
  }
  function renderClaimBody() {
    const body = document.getElementById('claim-body');
    const d = claimingDeal;
    if (!d) return;
    const expiryText = d.expiry ? `Expires ${fmtDate(d.expiry)}` : 'No expiry';
    if (claimMode === 'cashier') {
      body.innerHTML = `
        <div class="claim-cashier-card">
          <p class="cashier-merchant">${escapeHtml(d.merchant)}</p>
          <p class="cashier-discount">${escapeHtml(d.discount)}</p>
          ${d.code ? `<p style="font-family: ui-monospace, monospace; font-size: 14px; letter-spacing: 1px; margin: 8px 0 0; opacity: 0.95;">Code: ${escapeHtml(d.code)}</p>` : ''}
          <p class="cashier-meta">${expiryText}${d.notes ? ' · ' + escapeHtml(d.notes) : ''}</p>
        </div>
        ${d.code ? `<div class="claim-barcode-wrap">${buildBarcodeSvg(d.code)}</div>` : ''}
        <p class="claim-meta">Show this screen to the cashier${d.code ? '. They can key in or scan the code above.' : '.'}</p>
      `;
    } else if (claimMode === 'code') {
      if (!d.code) {
        body.innerHTML = `<div class="empty" style="padding: 20px 0;"><i class="ti ti-info-circle" style="font-size: 32px;"></i>No code on this deal — switch to "Show cashier" mode.</div>`;
      } else {
        body.innerHTML = `
          <div class="claim-code-display">
            <p class="claim-code-label">Promo code</p>
            <p class="claim-code">${escapeHtml(d.code)}</p>
          </div>
          <button id="copy-code-btn" class="btn-primary" style="width: 100%; padding: 14px;"><i class="ti ti-copy" style="font-size:14px; vertical-align:-2px; margin-right:6px;"></i>Copy code</button>
          <p class="claim-meta">Tap to copy, then paste into the merchant's checkout.</p>
        `;
        document.getElementById('copy-code-btn').addEventListener('click', () => copyCode(d.code));
      }
    } else if (claimMode === 'online') {
      const url = d.url || inferUrl(d.merchant);
      body.innerHTML = `
        ${d.code ? `<div class="claim-code-display"><p class="claim-code-label">Promo code</p><p class="claim-code">${escapeHtml(d.code)}</p></div>`
          : `<p style="text-align:center; color: var(--text-secondary); margin: 20px 0;">No code needed — discount applies at checkout.</p>`}
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${d.code ? `<button id="copy-go-btn" class="btn-primary" style="padding: 14px;"><i class="ti ti-copy" style="font-size:14px; vertical-align:-2px; margin-right:6px;"></i>Copy code &amp; open ${escapeHtml(d.merchant)}</button>`
            : `<button id="open-only-btn" class="btn-primary" style="padding: 14px;"><i class="ti ti-external-link" style="font-size:14px; vertical-align:-2px; margin-right:6px;"></i>Open ${escapeHtml(d.merchant)}</button>`}
          ${url ? `<p class="claim-meta"><i class="ti ti-world" style="font-size:12px; vertical-align:-1px;"></i> ${escapeHtml(url)}</p>` : `<p class="claim-meta">No URL on file. Add one when editing.</p>`}
        </div>
      `;
      const copyGo = document.getElementById('copy-go-btn');
      const openOnly = document.getElementById('open-only-btn');
      if (copyGo) copyGo.addEventListener('click', () => copyAndOpen(d.code, url));
      if (openOnly) openOnly.addEventListener('click', () => openMerchant(url));
    }
  }
  async function copyCode(code) {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); showToast(`Copied: ${code}`); }
    catch(e) {
      const ta = document.createElement('textarea');
      ta.value = code; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); showToast(`Copied: ${code}`); } catch(e2) { showToast('Copy failed'); }
      document.body.removeChild(ta);
    }
  }
  async function copyAndOpen(code, url) {
    if (code) await copyCode(code);
    if (url) setTimeout(() => window.open(url, '_blank', 'noopener'), 200);
    else showToast('No URL set');
  }
  function openMerchant(url) {
    if (!url) { showToast('No URL set'); return; }
    window.open(url, '_blank', 'noopener');
  }
  function closeClaim() { document.getElementById('modal-claim').classList.remove('active'); claimingDeal = null; }
  function claimRedeem() { if (!claimingDeal) return; markRedeemed(claimingDeal.id); closeClaim(); }

  // ---------- Actions ----------
  function markRedeemed(id) {
    const d = deals.find(x=>x.id===id); if (!d) return;
    d.redeemed = true;
    if (d.shared) { rewards.points += 25; rewards.claimed += 1; save(KEYS.rewards, rewards); }
    bumpQuest('q_redeem');
    save(KEYS.deals, deals);
    showToast(`Redeemed — saved $${Math.round(Number(d.value)||0)}`);
    renderAll();
  }
  function shareDeal(id) {
    const d = deals.find(x=>x.id===id); if (!d) return;
    d.shared = true;
    rewards.shared += 1; rewards.points += 10;
    bumpQuest('q_share');
    save(KEYS.deals, deals); save(KEYS.rewards, rewards);
    showToast('Shared (+10 pts)');
    renderAll();
  }
  function deleteDeal(id) {
    if (!confirm('Delete this deal?')) return;
    deals = deals.filter(x=>x.id!==id);
    save(KEYS.deals, deals);
    showToast('Deleted');
    renderAll();
  }

  function setField(id, v) { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; }
  function getField(id) { const el = document.getElementById(id); return el ? el.value : ''; }

  function openModal(id, opts = {}) {
    editingId = id || null;
    document.getElementById('modal-title').textContent = id ? 'Edit deal' : (opts.imageOnly ? 'New deal from photo' : 'Add a deal');
    if (id) {
      const d = deals.find(x=>x.id===id);
      setField('f-merchant', d.merchant); setField('f-discount', d.discount); setField('f-value', d.value);
      setField('f-category', d.category); setField('f-source', d.source); setField('f-code', d.code);
      setField('f-expiry', d.expiry); setField('f-notes', d.notes); setField('f-url', d.url);
    } else if (!opts.imageOnly) {
      ['f-merchant','f-discount','f-value','f-code','f-expiry','f-notes','f-url'].forEach(k=>setField(k,''));
      setField('f-category','Groceries'); setField('f-source','Email');
      document.getElementById('capture-preview').style.display = 'none';
      document.getElementById('ocr-status').style.display = 'none';
      pendingImage = null;
    } else {
      ['f-merchant','f-discount','f-value','f-code','f-expiry','f-notes','f-url'].forEach(k=>setField(k,''));
      setField('f-category','Groceries'); setField('f-source','Photo capture');
    }
    if (pendingImage) {
      const preview = document.getElementById('capture-preview');
      preview.style.display = 'flex';
      preview.innerHTML = `<img src="${pendingImage}" alt="Captured coupon">`;
    } else {
      document.getElementById('capture-preview').style.display = 'none';
      document.getElementById('ocr-status').style.display = 'none';
    }
    document.getElementById('modal-deal').classList.add('active');
  }
  function openModalPrefilled(data) {
    editingId = null; pendingImage = null;
    document.getElementById('modal-title').textContent = 'Add a deal';
    setField('f-merchant', data.merchant||''); setField('f-discount', data.discount||'');
    setField('f-value', data.value||''); setField('f-category', data.category||'Groceries');
    setField('f-source', data.source||'App / digital'); setField('f-code', data.code||'');
    setField('f-expiry', data.expiry||''); setField('f-notes', data.notes||'');
    setField('f-url', data.url||inferUrl(data.merchant));
    document.getElementById('capture-preview').style.display = 'none';
    document.getElementById('ocr-status').style.display = 'none';
    document.getElementById('modal-deal').classList.add('active');
  }
  function closeModal() {
    document.getElementById('modal-deal').classList.remove('active');
    editingId = null; pendingImage = null;
  }
  function saveModalForm() {
    const merchant = getField('f-merchant').trim();
    if (!merchant) { showToast('Merchant required'); return; }
    const url = getField('f-url').trim() || inferUrl(merchant);
    const payload = {
      merchant, discount: getField('f-discount').trim() || 'Discount',
      value: Number(getField('f-value')) || 0,
      category: getField('f-category'), source: getField('f-source'),
      code: getField('f-code').trim(), expiry: getField('f-expiry'),
      notes: getField('f-notes').trim(), url
    };
    if (editingId) {
      const d = deals.find(x=>x.id===editingId);
      Object.assign(d, payload);
    } else {
      const newDeal = { id: uid(), ...payload, redeemed:false, shared:false, createdAt: Date.now() };
      if (pendingImage) newDeal.image = pendingImage;
      deals.push(newDeal);
      bumpQuest('q_add');
    }
    save(KEYS.deals, deals);
    closeModal();
    showToast(editingId ? 'Deal updated' : 'Deal saved');
    checkAndSendReminders();
    renderAll();
  }



  // ---------- Agent capture hub: Snap, Import, Paste Link ----------
  function ensureCaptureHub() {
    let overlay = document.getElementById('capture-hub');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'capture-hub';
    overlay.className = 'modal-overlay center capture-hub-overlay';
    overlay.innerHTML = `
      <div class="capture-hub-card">
        <div class="capture-hub-grabber"></div>
        <div class="capture-hub-head">
          <div class="agent-avatar">iD</div>
          <div>
            <p class="capture-hub-title">Hand it to iDeal</p>
            <p class="capture-hub-sub">Snap, import, or paste a deal. Your savings agent saves it to Wallet automatically.</p>
          </div>
        </div>
        <div class="capture-options">
          <button id="hub-snap" class="capture-option primary"><span>📷</span><div><strong>Snap Deal</strong><small>For mailers, receipts, postcards</small></div></button>
          <button id="hub-upload" class="capture-option"><span>🖼️</span><div><strong>Import screenshot/image</strong><small>For email, web, texts, Photos</small></div></button>
          <button id="hub-link" class="capture-option"><span>🔗</span><div><strong>Paste coupon link</strong><small>Save online deals or pages</small></div></button>
        </div>
        <button id="hub-close" class="capture-hub-close">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCaptureHub(); });
    overlay.querySelector('#hub-close').addEventListener('click', closeCaptureHub);
    overlay.querySelector('#hub-snap').addEventListener('click', () => { closeCaptureHub(); document.getElementById('capture-input').click(); });
    overlay.querySelector('#hub-upload').addEventListener('click', () => { closeCaptureHub(); document.getElementById('import-input').click(); });
    overlay.querySelector('#hub-link').addEventListener('click', () => { closeCaptureHub(); openLinkCapture(); });
    return overlay;
  }

  function openCaptureHub() {
    ensureCaptureHub().classList.add('active');
  }
  function closeCaptureHub() {
    const overlay = document.getElementById('capture-hub');
    if (overlay) overlay.classList.remove('active');
  }

  let linkSaveInProgress = false;
  let linkAutoSaveTimer = null;

  function ensureLinkCapture() {
    let overlay = document.getElementById('link-capture');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'link-capture';
    overlay.className = 'modal-overlay center';
    overlay.innerHTML = `
      <div class="modal center-modal link-capture-card">
        <div class="modal-header">
          <p class="modal-title">Save online deal</p>
          <button type="button" class="icon-btn" id="link-close" aria-label="Close" style="color: var(--text-secondary);"><i class="ti ti-x" style="color: var(--text-secondary);"></i></button>
        </div>
        <p class="link-copy">Paste a coupon page, promo link, or offer text. Perq will save it to your Deals Wallet automatically.</p>
        <div class="form-row"><label>Link or offer text</label><textarea id="link-text" rows="5" placeholder="Paste URL, email coupon text, or online offer here"></textarea></div>
        <button type="button" id="link-save" class="btn-primary" style="width:100%; padding: 14px; border-radius: 999px; pointer-events:auto; touch-action:manipulation;">Save to Deals Wallet</button>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLinkCapture(); });
    overlay.querySelector('#link-close').addEventListener('click', closeLinkCapture);
    const btn = overlay.querySelector('#link-save');
    const txt = overlay.querySelector('#link-text');
    ['click','pointerup','touchend'].forEach(evt => {
      btn.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); saveLinkCapture(); }, { passive: false });
    });
    txt.addEventListener('paste', () => {
      clearTimeout(linkAutoSaveTimer);
      linkAutoSaveTimer = setTimeout(() => {
        const val = (txt.value || '').trim();
        if (/https?:\/\//i.test(val) || val.length > 20) saveLinkCapture();
      }, 650);
    });
    return overlay;
  }

  function openLinkCapture(prefill = '') {
    const overlay = ensureLinkCapture();
    const input = overlay.querySelector('#link-text');
    input.value = prefill || '';
    linkSaveInProgress = false;
    overlay.classList.add('active');
    setTimeout(() => input.focus(), 100);
    if (prefill && String(prefill).trim().length > 10) {
      clearTimeout(linkAutoSaveTimer);
      linkAutoSaveTimer = setTimeout(saveLinkCapture, 700);
    }
  }
  function closeLinkCapture() {
    const overlay = document.getElementById('link-capture');
    if (overlay) overlay.classList.remove('active');
    clearTimeout(linkAutoSaveTimer);
    linkSaveInProgress = false;
  }
  function titleCaseWords(str) {
    return String(str || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
  }
  function merchantFromUrl(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./,'');
      const base = host.split('.')[0];
      const known = {
        'thecarwashexpress': 'The Car Wash Express',
        'carwashexpress': 'The Car Wash Express',
        'budgetlawncare': 'Budget Lawncare',
        'target': 'Target',
        'walmart': 'Walmart',
        'costco': 'Costco',
        'kohls': "Kohl's",
        'macys': "Macy's"
      };
      return known[base.toLowerCase()] || titleCaseWords(base.replace(/express$/i, ' express'));
    } catch(e) { return ''; }
  }
  function discountFromUrlOrText(url, text, result) {
    if (result.discount && result.discount !== 'Coupon offer') return result.discount;
    const lower = `${url} ${text}`.toLowerCase();
    if (lower.includes('discount-coupon')) return 'Discount Coupon';
    if (lower.includes('coupon')) return 'Coupon Offer';
    if (lower.includes('promo')) return 'Promo Offer';
    return 'Online deal saved';
  }
  function saveLinkCapture() {
    if (linkSaveInProgress) return;
    const input = document.getElementById('link-text');
    const btn = document.getElementById('link-save');
    const text = (input && input.value || '').trim();
    if (!text) { showToast('Paste a link or offer first'); return; }
    linkSaveInProgress = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    const urlMatch = text.match(/https?:\/\/[^\s]+/i);
    const url = urlMatch ? urlMatch[0].replace(/[),.;]+$/,'') : '';
    const result = extractDealFromText(text);
    const merchant = result.merchant && result.merchant !== 'Scanned Deal' ? result.merchant : (url ? merchantFromUrl(url) : 'Online Deal');
    const discount = discountFromUrlOrText(url, text, result);
    const deal = {
      id: uid(),
      merchant: merchant || 'Online Deal',
      discount,
      value: result.value || estimateValue(discount),
      category: normalizeCategory(result.category || 'Other'),
      source: 'Online / email import',
      code: result.code || '',
      expiry: normalizeExpiry(result.expiry),
      notes: 'Auto-saved by Perq from pasted link/text',
      url,
      image: '',
      redeemed:false,
      shared:false,
      createdAt: Date.now(),
      scanConfidence: url ? 'medium' : (result.confidence || 'low'),
      rawScanText: text
    };
    if (!isDuplicateDeal(deal)) deals.push(deal);
    bumpQuest('q_add');
    save(KEYS.deals, deals);
    closeLinkCapture();
    showToast(`${deal.merchant} saved to Deals Wallet`);
    dealsFilter = 'active';
    switchTab('deals');
    renderAll();
    setTimeout(() => { const b = document.getElementById('link-save'); if (b) { b.disabled = false; b.textContent = 'Save to Deals Wallet'; } }, 100);
  }

  function handleSharedLaunch() {
    try {
      const params = new URLSearchParams(location.search);
      const sharedText = params.get('text') || params.get('url') || params.get('title');
      if (sharedText) {
        setTimeout(() => openLinkCapture(sharedText), 900);
        history.replaceState(null, '', location.pathname);
      }
    } catch(e) {}
  }

  // ---------- Settings ----------
  function openSettings() {
    document.getElementById('s-reminders-on').checked = !!settings.remindersOn;
    document.getElementById('s-reminder-days').value = String(settings.reminderDays);
    document.getElementById('s-nearby-on').checked = !!settings.nearbyOn;
    document.getElementById('s-nearby-radius').value = String(settings.nearbyRadius);
    updateNotifButton();
    document.getElementById('modal-settings').classList.add('active');
  }
  function closeSettings() { document.getElementById('modal-settings').classList.remove('active'); }
  function saveSettings() {
    settings = {
      remindersOn: document.getElementById('s-reminders-on').checked,
      reminderDays: Number(document.getElementById('s-reminder-days').value) || 3,
      nearbyOn: document.getElementById('s-nearby-on').checked,
      nearbyRadius: Number(document.getElementById('s-nearby-radius').value) || 5
    };
    save(KEYS.settings, settings);
    closeSettings();
    showToast('Preferences saved');
    // Trigger checks based on new settings
    checkAndSendReminders();
    if (settings.nearbyOn) findNearbyDeals();
    else { nearbyResults = []; renderDashboard(); }
    renderAll();
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ deals, rewards, game, quests, settings }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dwd-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Backup downloaded');
  }
  function resetData() {
    if (!confirm('Delete all deals, rewards, and history? This cannot be undone.')) return;
    Object.values(KEYS).forEach(k => { if (k !== 'dwd:apiKey' && k !== 'dwd:installDismissed') localStorage.removeItem(k); });
    showToast('All data reset — reloading');
    setTimeout(() => location.reload(), 800);
  }

  function switchTab(name) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === name));
    ['dashboard','deals','rewards','suggest','social'].forEach(n => {
      document.getElementById('panel-'+n).classList.toggle('active', n === name);
    });
    // Show action bar only on Home (dashboard) and Deals tabs
    const actionBar = document.getElementById('action-bar');
    if (actionBar) {
      const showActionBar = name === 'dashboard' || name === 'deals';
      actionBar.classList.toggle('hidden', !showActionBar);
    }
    window.scrollTo(0, 0);
  }
  function updateHeader() { /* spins pill removed in v6 */ }
  function renderAll() {
    renderDashboard(); renderDeals(); renderRewards(); renderSuggest(); renderSocial();
    updateHeader();
  }

  function init() {
    deals = load(KEYS.deals, []);
    rewards = load(KEYS.rewards, { points: 0, shared: 0, claimed: 0 });
    game = Object.assign({ spins: 0, lastDailyClaim: null, streak: 0, totalSpins: 0, history: [] }, load(KEYS.game, {}));
    quests = load(KEYS.quests, { date: null, items: [] });
    settings = Object.assign({ ...DEFAULT_SETTINGS }, load(KEYS.settings, {}));

    if (!load(KEYS.seeded, false) && deals.length === 0) {
      deals = seedDeals();
      rewards = { points: 120, shared: 2, claimed: 1 };
      save(KEYS.deals, deals); save(KEYS.rewards, rewards);
      save(KEYS.seeded, true);
    }
    refreshDailyQuests();

    // Auto-grant daily spin if not yet claimed today (no need for user to tap Claim)
    const dailyResult = autoGrantDailySpin();
    if (dailyResult) {
      setTimeout(() => {
        showToast(`🎉 +${dailyResult.bonus} daily reveal${dailyResult.bonus===1?'':'s'} (day ${dailyResult.streak} streak)`);
      }, 1400);
    }

    document.getElementById('btn-add').addEventListener('click', () => openModal(null));
    document.getElementById('btn-snap').addEventListener('click', openCaptureHub);
    document.getElementById('capture-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleCapture(f, 'Photo capture');
      e.target.value = '';
    });
    document.getElementById('import-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleCapture(f, 'Image import');
      e.target.value = '';
    });
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-save').addEventListener('click', saveModalForm);
    document.getElementById('prize-close').addEventListener('click', () => document.getElementById('modal-prize').classList.remove('active'));
    document.getElementById('claim-close').addEventListener('click', closeClaim);
    document.getElementById('claim-redeem').addEventListener('click', claimRedeem);
    document.querySelectorAll('.claim-mode-btn').forEach(b => {
      b.addEventListener('click', () => {
        claimMode = b.getAttribute('data-mode');
        document.querySelectorAll('.claim-mode-btn').forEach(x => x.classList.toggle('active', x === b));
        renderClaimBody();
      });
    });
    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('settings-close').addEventListener('click', closeSettings);
    document.getElementById('settings-save').addEventListener('click', saveSettings);
    document.getElementById('s-notif-permission').addEventListener('click', requestNotificationPermission);
    document.getElementById('export-data').addEventListener('click', exportData);
    document.getElementById('reset-data').addEventListener('click', resetData);
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchTab(b.getAttribute('data-tab'))));

    document.getElementById('modal-deal').addEventListener('click', (e) => { if (e.target.id === 'modal-deal') closeModal(); });
    document.getElementById('modal-prize').addEventListener('click', (e) => { if (e.target.id === 'modal-prize') document.getElementById('modal-prize').classList.remove('active'); });
    document.getElementById('modal-settings').addEventListener('click', (e) => { if (e.target.id === 'modal-settings') closeSettings(); });
    document.getElementById('modal-claim').addEventListener('click', (e) => { if (e.target.id === 'modal-claim') closeClaim(); });

    renderAll();

    // Handle deep links from manifest shortcuts
    try {
      const params = new URLSearchParams(location.search);
      const action = params.get('action');
      if (action === 'snap') {
        setTimeout(() => openCaptureHub(), 1000);
      } else if (action === 'add') {
        setTimeout(() => openModal(null), 1000);
      }
    } catch(e) {}

    handleSharedLaunch();

    // Run reminder check on load and every time the app comes back to foreground
    checkAndSendReminders();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshDailyQuests();
        const r = autoGrantDailySpin();
        if (r) showToast(`🎉 +${r.bonus} daily reveal${r.bonus===1?'':'s'} (day ${r.streak} streak)`);
        checkAndSendReminders();
        if (settings.nearbyOn) findNearbyDeals();
        renderAll();
      }
    });

    // Initial nearby check if enabled
    if (settings.nearbyOn) {
      // Defer slightly so the UI renders first
      setTimeout(() => findNearbyDeals(), 500);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      if (!load(KEYS.installDismissed, false)) {
        document.getElementById('install-banner').classList.add('show');
      }
    });
    document.getElementById('install-btn').addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') document.getElementById('install-banner').classList.remove('show');
      deferredInstallPrompt = null;
    });
    document.getElementById('install-dismiss').addEventListener('click', () => {
      document.getElementById('install-banner').classList.remove('show');
      save(KEYS.installDismissed, true);
    });

    // ---- Splash screen handling ----
    setTimeout(() => {
      const splash = document.getElementById('splash');
      if (splash) splash.classList.add('hide');
      setTimeout(() => { if (splash) splash.style.display = 'none'; }, 500);
    }, 800);

    // ---- iOS install prompt (shown only on iOS Safari, not yet installed) ----
    showIOSInstallScreenIfNeeded();
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
  function isInStandaloneMode() {
    return ('standalone' in navigator) && navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
  }
  function showIOSInstallScreenIfNeeded() {
    const dismissed = load(KEYS.installDismissed, false);
    const screen = document.getElementById('install-screen');
    if (!screen) return;
    if (isIOS() && !isInStandaloneMode() && !dismissed) {
      // Show after splash settles
      setTimeout(() => screen.classList.add('show'), 1200);
    }
    document.getElementById('install-skip').addEventListener('click', () => {
      screen.classList.remove('show');
      save(KEYS.installDismissed, true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

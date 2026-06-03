(function(){
  'use strict';

  const STORAGE_PREFIX = 'perq:';
  const STORAGE_KEY_NAMES = [
    'deals', 'rewards', 'game', 'quests', 'seeded', 'installDismissed',
    'settings', 'notified', 'geocache', 'userLoc', 'profile',
    'emailConnection', 'beaconNotified'
  ];
  const LEGACY_STORAGE_PREFIX = String.fromCharCode(100, 119, 100, 58);
  const KEYS = Object.fromEntries(STORAGE_KEY_NAMES.map(name => [name, STORAGE_PREFIX + name]));

  const DEFAULT_SETTINGS = {
    remindersOn: true, reminderDays: 3,
    nearbyOn: false, nearbyRadius: 5
  };

  let deals = [];
  let rewards = { points: 0, shared: 0, claimed: 0 };
  let game = { spins: 0, lastDailyClaim: null, streak: 0, totalSpins: 0, history: [] };
  let quests = { date: null, items: [] };
  let settings = { ...DEFAULT_SETTINGS };
  let profile = null;
  let emailConnection = { requested: false, provider: '', status: 'not_connected' };
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
  let beaconWatchId = null;

  const AI_CAPTURE_FIELDS = [
    'merchant', 'discount', 'code', 'barcode', 'expiry', 'validBy',
    'category', 'value', 'url', 'address', 'notes'
  ];

  function nativePlugin(name) {
    const cap = window.Capacitor;
    return cap && cap.Plugins && cap.Plugins[name] ? cap.Plugins[name] : null;
  }
  function isNativeApp() {
    const cap = window.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === 'function') return cap.isNativePlatform();
    return typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web';
  }
  function notificationId(seed) {
    const text = String(seed || 'perq-notification');
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash) || 1;
  }
  async function requestNativeNotifications() {
    const LocalNotifications = nativePlugin('LocalNotifications');
    if (!LocalNotifications) return false;
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return true;
      const requested = await LocalNotifications.requestPermissions();
      return requested.display === 'granted';
    } catch(e) {
      return false;
    }
  }
  async function sendNativeNotification(title, body, tag) {
    const LocalNotifications = nativePlugin('LocalNotifications');
    if (!LocalNotifications) return false;
    const granted = await requestNativeNotifications();
    if (!granted) return false;
    try {
      await LocalNotifications.schedule({
        notifications: [{
          id: notificationId(tag || title),
          title,
          body,
          smallIcon: 'ic_stat_perq',
          iconColor: '#1B6C8C'
        }]
      });
      return true;
    } catch(e) {
      return false;
    }
  }

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

  const DEAL_CATEGORIES = ['Groceries','Dining','Apparel','Travel','Beauty','Home','Electronics','Other'];

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

  function storageKeyVariants(name) {
    return [STORAGE_PREFIX + name, LEGACY_STORAGE_PREFIX + name];
  }

  function migrateLegacyStorage() {
    try {
      STORAGE_KEY_NAMES.forEach(name => {
        const currentKey = STORAGE_PREFIX + name;
        const legacyKey = LEGACY_STORAGE_PREFIX + name;
        const legacyValue = localStorage.getItem(legacyKey);
        if (legacyValue === null) return;
        if (localStorage.getItem(currentKey) === null) {
          localStorage.setItem(currentKey, legacyValue);
        }
        localStorage.removeItem(legacyKey);
      });
    } catch(e) {}
  }

  function cleanupLegacyBrowserSecrets() {
    try {
      storageKeyVariants('apiKey').forEach(key => localStorage.removeItem(key));
    } catch(e) {}
  }

  function getAiCaptureEndpoint() {
    const meta = document.querySelector('meta[name="perq-ai-endpoint"]');
    const fromMeta = meta ? meta.getAttribute('content') : '';
    return String(window.PERQ_AI_ENDPOINT || fromMeta || '').trim();
  }

  function renderAiCaptureStatus() {
    const el = document.getElementById('ai-capture-status');
    if (!el) return;
    el.textContent = getAiCaptureEndpoint()
      ? 'Perq AI service connected'
      : 'Perq AI service not connected';
  }

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

  function titleCaseWords(str) {
    return String(str || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
  }
  function titleCaseOffer(str) {
    return String(str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\bOff\b/g, 'off').replace(/\bFree\b/g, 'Free');
  }
  function merchantFromUrl(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      const base = host.split('.')[0];
      const known = { target:'Target', walmart:'Walmart', costco:'Costco', kohls:"Kohl's", macys:"Macy's", carspa:'Car Spa', budgetlawncare:'Budget Lawncare' };
      return known[base.toLowerCase()] || titleCaseWords(base);
    } catch(e) { return ''; }
  }
  function normalizeExpiry(exp) {
    if (!exp) return '';
    const d = new Date(String(exp).trim());
    return isNaN(d) ? '' : d.toISOString().slice(0,10);
  }
  function estimateValue(discount) {
    const text = String(discount || '');
    let m = text.match(/\$\s*(\d+)/);
    if (m) return Number(m[1]);
    m = text.match(/(\d{1,2})\s*%/);
    if (m) return Number(m[1]);
    if (/free/i.test(text)) return 30;
    return 10;
  }
  function categoryFromText(text) {
    if (/grocery|market|produce|food|costco|target|walmart|whole foods/i.test(text)) return 'Groceries';
    if (/restaurant|coffee|pizza|burger|dining|panera|chipotle|olive/i.test(text)) return 'Dining';
    if (/clothes|apparel|shoes|navy|gap|macy|kohls|nordstrom/i.test(text)) return 'Apparel';
    if (/hotel|flight|travel|marriott/i.test(text)) return 'Travel';
    if (/beauty|makeup|sephora|ulta|skin/i.test(text)) return 'Beauty';
    if (/home|paint|lawn|mow|repair|depot|lowe|furniture/i.test(text)) return 'Home';
    if (/tech|electronics|phone|computer|best buy|apple/i.test(text)) return 'Electronics';
    return 'Other';
  }
  function extractAddress(text) {
    const m = String(text || '').match(/\b\d{2,6}\s+[A-Za-z0-9 .'-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b(?:[^,.\n]*,?\s*[A-Za-z .'-]+,?\s*[A-Z]{2}\s*\d{5})?/i);
    return m ? m[0].trim() : '';
  }
  function extractDealFromText(raw, source = 'Online / email import') {
    const text = String(raw || '').replace(/[\t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    const urlMatch = text.match(/https?:\/\/[^\s)>,]+/i);
    const url = urlMatch ? urlMatch[0].replace(/[),.;]+$/, '') : '';
    const merchant = merchantFromUrl(url) || titleCaseWords((text.split(/[|•.;]/).map(x => x.trim()).find(x => x.length >= 3 && x.length <= 42 && !/coupon|discount|offer|promo|https?:/i.test(x))) || 'Online Deal');
    const discountMatch = text.match(/(?:\d{1,2}\s*%\s*(?:to\s*\d{1,2}\s*%\s*)?off[^.,;|]{0,80}|\$\s*\d{1,4}\s*off[^.,;|]{0,60}|buy\s+one\s+get\s+one[^.,;|]{0,60}|bogo[^.,;|]{0,45}|free\s+[A-Z0-9$][^.,;|]{1,45})/i);
    const discount = discountMatch ? titleCaseOffer(discountMatch[0]) : 'Online deal saved';
    const codeMatch = text.match(/(?:BARCODE|CODE|PROMO\s*CODE|COUPON\s*CODE)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\s-]{2,24})/i);
    const barcodeMatch = text.match(/(?:BARCODE|UPC|SKU)\s*[:#-]?\s*([0-9][0-9\s-]{7,24})/i);
    const expiryMatch = text.match(/(?:EXPIRES?|EXPIRATION|VALID\s+(?:BY|THROUGH|THRU|UNTIL|TO)|GOOD\s+(?:THROUGH|THRU|UNTIL)|OFFER\s+ENDS|VALID)\s*[:#-]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|[A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})/i);
    const address = extractAddress(text);
    return {
      merchant,
      discount,
      value: estimateValue(discount),
      category: categoryFromText(`${merchant} ${discount} ${text}`),
      source,
      code: codeMatch && !/BARCODE|UPC|SKU/i.test(codeMatch[0]) ? codeMatch[1].replace(/\s+/g, ' ').trim().toUpperCase() : '',
      barcode: barcodeMatch ? barcodeMatch[1].replace(/\D/g, '') : '',
      expiry: normalizeExpiry(expiryMatch && expiryMatch[1]),
      notes: address ? 'Address captured from source' : 'Saved from shared text or link',
      url,
      address,
      rawScanText: text,
      scanConfidence: url || discountMatch || codeMatch ? 'medium' : 'low'
    };
  }
  function validProfile(p) {
    return !!(p && p.name && p.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
  }
  function selectedProfileCategories(root = document) {
    return Array.from(root.querySelectorAll('[data-pref]:checked')).map(el => el.value);
  }
  function showProfileScreen() {
    const screen = document.getElementById('profile-screen');
    if (!screen) return;
    screen.classList.add('show');
    screen.setAttribute('aria-hidden', 'false');
    const first = document.getElementById('profile-name');
    if (first) setTimeout(() => first.focus(), 120);
  }
  function hideProfileScreen() {
    const screen = document.getElementById('profile-screen');
    if (!screen) return;
    screen.classList.remove('show');
    screen.setAttribute('aria-hidden', 'true');
  }
  function renderProfileSummary() {
    const nameEl = document.getElementById('profile-summary-name');
    const emailEl = document.getElementById('profile-summary-email');
    const prefEl = document.getElementById('profile-summary-preferences');
    const emailStatusEl = document.getElementById('email-connect-status');
    if (nameEl) nameEl.textContent = profile && profile.name ? profile.name : 'Not set';
    if (emailEl) emailEl.textContent = profile && profile.email ? profile.email : 'Add an email in profile setup';
    if (prefEl) prefEl.textContent = profile && profile.preferences && profile.preferences.length ? profile.preferences.join(', ') : 'No deal preferences selected';
    if (emailStatusEl) {
      const provider = emailConnection.provider ? ` · ${emailConnection.provider}` : '';
      emailStatusEl.textContent = emailConnection.requested ? `Requested${provider}` : 'Not connected';
    }
  }
  function saveProfileFromScreen() {
    const name = getField('profile-name').trim();
    const email = getField('profile-email').trim();
    const phone = getField('profile-phone').trim();
    const preferences = selectedProfileCategories(document.getElementById('profile-screen'));
    const wantsEmail = !!document.getElementById('profile-connect-email').checked;
    const provider = getField('profile-email-provider');
    const candidate = { name, email, phone, preferences, createdAt: Date.now() };
    if (!validProfile(candidate)) {
      showToast('Name and email are required');
      return;
    }
    profile = candidate;
    emailConnection = wantsEmail
      ? { requested: true, provider, status: 'oauth_required', requestedAt: Date.now() }
      : { requested: false, provider: '', status: 'not_connected' };
    save(KEYS.profile, profile);
    save(KEYS.emailConnection, emailConnection);
    hideProfileScreen();
    renderProfileSummary();
    showToast(wantsEmail ? 'Profile saved. Email connect is ready for OAuth setup.' : 'Profile saved');
    renderAll();
  }
  function saveEmailConnectIntent() {
    const provider = getField('email-provider');
    emailConnection = { requested: true, provider, status: 'oauth_required', requestedAt: Date.now() };
    save(KEYS.emailConnection, emailConnection);
    renderProfileSummary();
    showToast('Email connect request saved');
  }
  function hydrateProfileScreen() {
    if (profile) {
      setField('profile-name', profile.name || '');
      setField('profile-email', profile.email || '');
      setField('profile-phone', profile.phone || '');
      document.querySelectorAll('#profile-screen [data-pref]').forEach(el => {
        el.checked = !!(profile.preferences || []).includes(el.value);
      });
    }
    document.getElementById('profile-connect-email').checked = !!emailConnection.requested;
    if (emailConnection.provider) setField('profile-email-provider', emailConnection.provider);
  }
  function parseIncomingShare(params) {
    const parts = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean);
    if (!parts.length) return null;
    const sourceText = parts.join(' ');
    return extractDealFromText(sourceText, 'Browser / email share');
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
    (profile && profile.preferences || []).forEach(cat => { c[cat] = (c[cat]||0) + 2; });
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
    const reasonMap = { Groceries:'Matches your grocery saving pattern', Dining:'Frequent dining redemptions', Apparel:'Matches apparel preference', Beauty:'Beauty category match', Home:'Home savings pick', Travel:'Travel savings pick', Electronics:'Tech category match' };
    const matched = BONUS_POOL.filter(p => top.includes(p.category));
    const rest = BONUS_POOL.filter(p => !top.includes(p.category));
    return [...matched, ...rest].slice(0, 6).map(s => ({...s, reason: reasonMap[s.category] || 'Popular pick'}));
  }

  function referralCode() {
    const source = `${profile && (profile.email || profile.name) || 'perq'}:${STORAGE_PREFIX}`;
    let hash = 0;
    for (let i = 0; i < source.length; i++) hash = ((hash << 5) - hash + source.charCodeAt(i)) | 0;
    const namePart = String(profile && profile.name || 'SAVE').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4) || 'SAVE';
    return `PERQ-${namePart}-${String(Math.abs(hash) % 10000).padStart(4, '0')}`;
  }
  function referralLink() {
    const base = `${location.origin}${location.pathname}`;
    return `${base}?ref=${encodeURIComponent(referralCode())}`;
  }
  function referralInviteText() {
    return `Join me on Perq and start tracking deals before they expire: ${referralLink()}`;
  }
  async function copyReferralInvite() {
    const text = referralInviteText();
    try {
      await navigator.clipboard.writeText(text);
    } catch(e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch(e2) {}
      document.body.removeChild(ta);
    }
    showToast('Invite copied');
  }

  function refreshDailyQuests() {
    if (quests.date === todayStr() && quests.items.length) {
      if (typeof quests.bonusClaimed !== 'boolean') {
        quests.bonusClaimed = false;
        save(KEYS.quests, quests);
      }
      return;
    }
    quests = { date: todayStr(), items: [
      { id:'q_add', label:'Add a new deal', target:1, progress:0, reward:1, claimed:false },
      { id:'q_share', label:'Share a deal', target:1, progress:0, reward:1, claimed:false },
      { id:'q_redeem', label:'Mark a deal redeemed', target:1, progress:0, reward:1, claimed:false }
    ], bonusClaimed: false };
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
    showToast(`Quest complete — +${q.reward} spin`);
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
  function getUnexpiredDeals() {
    return deals.filter(d => !d.redeemed && statusOf(d) !== 'expired');
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

    newOnes.forEach(d => {
      const du = daysUntil(d.expiry);
      const title = du === 0 ? `${d.merchant} expires TODAY` : `${d.merchant} expires in ${du} day${du === 1 ? '' : 's'}`;
      const body = `${d.discount}${d.code ? ` — code ${d.code}` : ''}. Tap to use it.`;
      const tag = 'perq-' + d.id;
      sendNativeNotification(title, body, tag).then(sent => {
        if (sent) return;
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(title, {
              body, icon: 'icon-192.png', badge: 'icon-192.png',
              tag, requireInteraction: false
            });
          } catch(e) { /* iOS PWA quirks */ }
        }
      });
    });

    notified.ids = [...notified.ids, ...newOnes.map(d => d.id)];
    save(KEYS.notified, notified);
  }

  function notifyNearbyDeals(results) {
    if (!settings.nearbyOn || !results.length) return;
    const today = todayStr();
    const notified = load(KEYS.beaconNotified, {});
    if (notified.date !== today) {
      notified.date = today;
      notified.ids = [];
    }
    const fresh = results.filter(r => !notified.ids.includes(r.deal.id));
    if (!fresh.length) return;
    const first = fresh[0];
    const title = `${first.deal.merchant} deal nearby`;
    const body = `${first.deal.discount} is ${first.distance.toFixed(1)} mi away${first.deal.expiry ? ` · expires ${fmtDate(first.deal.expiry)}` : ''}`;
    sendNativeNotification(title, body, 'perq-beacon-' + first.deal.id).then(sent => {
      if (sent) return;
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, {
            body,
            icon: 'icon-192.png',
            badge: 'icon-192.png',
            tag: 'perq-beacon-' + first.deal.id,
            requireInteraction: false
          });
        } catch(e) {
          showToast(`${title}: ${first.deal.discount}`);
        }
      } else {
        showToast(`${title}: ${first.deal.discount}`);
      }
    });
    notified.ids = [...notified.ids, ...fresh.map(r => r.deal.id)];
    save(KEYS.beaconNotified, notified);
  }

  function startBeaconWatch() {
    if (!settings.nearbyOn || beaconWatchId !== null) return;
    const NativeGeolocation = nativePlugin('Geolocation');
    if (NativeGeolocation && NativeGeolocation.watchPosition) {
      beaconWatchId = { native: true, id: 'starting' };
      NativeGeolocation.watchPosition(
        { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 12000 },
        (pos) => {
          if (pos && pos.coords) {
            findNearbyDeals(false, { lat: pos.coords.latitude, lon: pos.coords.longitude });
          }
        }
      ).then(id => {
        beaconWatchId = { native: true, id };
      }).catch(() => {
        beaconWatchId = null;
      });
      return;
    }
    if (!('geolocation' in navigator)) return;
    try {
      beaconWatchId = navigator.geolocation.watchPosition(
        pos => findNearbyDeals(false, { lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 12000 }
      );
    } catch(e) {}
  }
  function stopBeaconWatch() {
    if (beaconWatchId === null) return;
    const NativeGeolocation = nativePlugin('Geolocation');
    if (beaconWatchId && beaconWatchId.native && NativeGeolocation && NativeGeolocation.clearWatch) {
      if (beaconWatchId.id !== 'starting') {
        NativeGeolocation.clearWatch({ id: beaconWatchId.id }).catch(() => {});
      }
    } else if ('geolocation' in navigator) {
      try { navigator.geolocation.clearWatch(beaconWatchId); } catch(e) {}
    }
    beaconWatchId = null;
  }

  async function requestNotificationPermission() {
    if (nativePlugin('LocalNotifications')) {
      const granted = await requestNativeNotifications();
      showToast(granted ? 'Notifications enabled' : 'Notifications declined');
      updateNotifButton();
      return;
    }
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
          new Notification('Perq', {
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
    if (nativePlugin('LocalNotifications')) {
      btn.textContent = 'Enable';
      btn.disabled = false;
      return;
    }
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
      const cached = load(KEYS.userLoc, null);
      // Use cache if less than 10 minutes old
      if (!forceRefresh && cached && (Date.now() - cached.ts < 10 * 60 * 1000)) {
        resolve({ lat: cached.lat, lon: cached.lon });
        return;
      }
      const NativeGeolocation = nativePlugin('Geolocation');
      if (NativeGeolocation && NativeGeolocation.getCurrentPosition) {
        NativeGeolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 })
          .then(pos => {
            const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, ts: Date.now() };
            save(KEYS.userLoc, loc);
            resolve({ lat: loc.lat, lon: loc.lon });
          })
          .catch(reject);
        return;
      }
      if (!navigator.geolocation) { reject(new Error('Geolocation not supported')); return; }
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

  async function geocodeMerchantNear(merchant, lat, lon, address = '') {
    if (!merchant && !address) return null;
    const query = address || merchant;
    const cache = load(KEYS.geocache, {});
    const key = `${query.toLowerCase()}|${lat.toFixed(2)}|${lon.toFixed(2)}`;
    if (cache[key] && (Date.now() - cache[key].ts < 7 * 24 * 60 * 60 * 1000)) {
      return cache[key].result;
    }
    try {
      // Nominatim search with viewbox biased around user
      const delta = 0.5; // ~30 miles
      const viewbox = `${lon-delta},${lat-delta},${lon+delta},${lat+delta}`;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${viewbox}&bounded=1&addressdetails=1`;
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

  async function findNearbyDeals(forceRefresh = false, locOverride = null) {
    if (!settings.nearbyOn) return [];
    nearbyLoading = true;
    renderDashboard();
    try {
      const loc = locOverride || await getUserLocation(forceRefresh);
      userLoc = loc;
      const active = getUnexpiredDeals();
      const radius = Number(settings.nearbyRadius) || 5;
      const results = [];
      // Geocode in parallel but cap concurrency at 3 (be polite to Nominatim)
      const merchants = [...new Set(active.map(d => d.merchant))];
      const geoMap = {};
      for (let i = 0; i < merchants.length; i += 3) {
        const batch = merchants.slice(i, i + 3);
        const batchResults = await Promise.all(batch.map(m => {
          const sample = active.find(d => d.merchant === m && d.address) || active.find(d => d.merchant === m);
          return geocodeMerchantNear(m, loc.lat, loc.lon, sample && sample.address);
        }));
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
      notifyNearbyDeals(results);
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
  function dataUrlToFile(dataUrl, fileName = 'perq-coupon.jpg') {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid image data');
    const bytes = atob(match[2]);
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
    return new File([buffer], fileName, { type: match[1] });
  }
  async function captureDealPhotoNative() {
    const Camera = nativePlugin('Camera');
    if (!Camera || !Camera.getPhoto) return false;
    try {
      const photo = await Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: 'dataUrl',
        source: 'PROMPT',
        direction: 'REAR',
        promptLabelHeader: 'Deal image',
        promptLabelPicture: 'Take photo',
        promptLabelPhoto: 'Upload image'
      });
      const dataUrl = photo.dataUrl || (photo.base64String ? `data:image/${photo.format || 'jpeg'};base64,${photo.base64String}` : '');
      if (!dataUrl) return false;
      await handleCapture(dataUrlToFile(dataUrl));
      return true;
    } catch(e) {
      const msg = String(e && (e.message || e)).toLowerCase();
      if (msg.includes('cancel')) return true;
      return false;
    }
  }
  async function handleCapture(file) {
    if (!file) return;
    showOcrStatus('reading', 'Reading photo…');
    const rawDataUrl = await fileToDataUrl(file);
    const dataUrl = await compressImage(rawDataUrl, 1200);
    pendingImage = dataUrl;
    openModal(null, { imageOnly: true });
    const endpoint = getAiCaptureEndpoint();
    if (!endpoint) {
      showOcrStatus('warn', 'Image captured. AI extraction needs the Perq AI service; review manually for now.');
      return;
    }
    showOcrStatus('reading', 'Extracting deal details with AI…');
    try {
      const result = await runOcr(dataUrl, endpoint);
      applyOcrResult(result);
      showOcrStatus('success', 'Got it — review and save below.');
    } catch (err) {
      console.error('OCR failed:', err);
      showOcrStatus('error', `Couldn't read it (${err.message}). Fill in manually.`);
    }
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
  async function runOcr(dataUrl, endpoint) {
    const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid image format');
    const mediaType = match[1];
    const b64 = match[2];
    const sameOrigin = endpoint.startsWith('/') || endpoint.startsWith(location.origin);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: sameOrigin ? 'same-origin' : 'omit',
      body: JSON.stringify({
        image: { mimeType: mediaType, data: b64 },
        requestedFields: AI_CAPTURE_FIELDS,
        source: 'perq-camera-capture'
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `AI service error ${response.status}`;
      try { const errJson = JSON.parse(errText); if (errJson.error && errJson.error.message) errMsg = errJson.error.message; } catch(e) {}
      throw new Error(errMsg);
    }
    const data = await response.json();
    const result = data.deal || data.result || data;
    if (!result || typeof result !== 'object') throw new Error('AI service returned an invalid payload');
    return result;
  }
  function applyOcrResult(r) {
    if (!r) return;
    if (r.merchant) document.getElementById('f-merchant').value = r.merchant;
    if (r.discount) document.getElementById('f-discount').value = r.discount;
    if (r.value != null) document.getElementById('f-value').value = r.value;
    if (r.code) document.getElementById('f-code').value = r.code;
    if (r.barcode) document.getElementById('f-barcode').value = r.barcode;
    if (r.expiry) document.getElementById('f-expiry').value = r.expiry;
    if (r.address) document.getElementById('f-address').value = r.address;
    const notes = [r.notes, r.validBy ? `Original date label: ${r.validBy}` : ''].filter(Boolean).join(' · ');
    if (notes) document.getElementById('f-notes').value = notes;
    if (r.category) {
      const validCats = ['Groceries','Dining','Apparel','Travel','Beauty','Home','Electronics','Other'];
      if (validCats.includes(r.category)) document.getElementById('f-category').value = r.category;
    }
    document.getElementById('f-source').value = 'Photo capture';
    if (r.url) document.getElementById('f-url').value = r.url;
    if (r.merchant && !r.url) {
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
  const DAILY_RUN_BONUS = { points: 25, spins: 1 };
  const TIERS = [
    { name: 'Bronze',   min: 0,    color: '#A07248', bg: '#F5EBDD', perk: '1 free spin per day' },
    { name: 'Silver',   min: 100,  color: '#6B7280', bg: '#E8EAED', perk: '2 free spins per day' },
    { name: 'Gold',     min: 300,  color: '#9A6B0F', bg: '#FAEEDA', perk: '3 free spins + bonus odds' },
    { name: 'Platinum', min: 750,  color: '#3C3489', bg: '#EEEDFE', perk: 'Unlimited points → spins' }
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
  function pct(current, target) {
    if (!target) return 0;
    return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
  }
  function timeToMidnightLabel() {
    const now = new Date();
    const end = new Date(now);
    end.setHours(24, 0, 0, 0);
    const minutes = Math.max(1, Math.round((end - now) / 60000));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h <= 0) return `${m}m`;
    return `${h}h ${m}m`;
  }
  function questStats() {
    const items = quests.items || [];
    const total = items.length || 1;
    const done = items.filter(q => q.claimed).length;
    const ready = items.filter(q => !q.claimed && q.progress >= q.target).length;
    const progress = items.reduce((sum, q) => sum + Math.min(q.progress, q.target), 0);
    const target = items.reduce((sum, q) => sum + q.target, 0) || total;
    return { total, done, ready, progress, target, pct: pct(progress, target) };
  }
  function canClaimDailyRunBonus() {
    const stats = questStats();
    return stats.done >= stats.total && !quests.bonusClaimed;
  }
  function dailyRunBonusLabel() {
    if (quests.bonusClaimed) return 'Claimed';
    return `+${DAILY_RUN_BONUS.spins} spin · +${DAILY_RUN_BONUS.points} pts`;
  }
  function claimDailyRunBonus() {
    if (!canClaimDailyRunBonus()) return;
    quests.bonusClaimed = true;
    rewards.points += DAILY_RUN_BONUS.points;
    game.spins += DAILY_RUN_BONUS.spins;
    game.history.unshift({ ts: Date.now(), label: 'Daily run bonus' });
    if (game.history.length > 8) game.history.length = 8;
    save(KEYS.quests, quests); save(KEYS.rewards, rewards); save(KEYS.game, game);
    showToast(`Daily run complete — +${DAILY_RUN_BONUS.spins} spin, +${DAILY_RUN_BONUS.points} pts`);
    renderAll();
  }
  function nextStreakTarget() {
    if (game.streak < 3) return { day: 3, label: 'Day 3 boost', detail: '2 daily spins' };
    if (game.streak < 7) return { day: 7, label: 'Day 7 bonus', detail: '3 daily spins' };
    return { day: 7, label: 'Weekly streak maxed', detail: 'Keep it alive' };
  }
  function streakMilestones() {
    const target = nextStreakTarget();
    return [
      { day: 1, label: 'Check in', detail: '+1 spin', state: game.streak >= 1 ? 'done' : 'next' },
      { day: 3, label: 'Boost', detail: '2 daily spins', state: game.streak >= 3 ? 'done' : (target.day === 3 ? 'next' : '') },
      { day: 7, label: 'Bonus', detail: '3 daily spins', state: game.streak >= 7 ? 'done' : (target.day === 7 ? 'next' : '') }
    ];
  }
  function tierProgressInfo() {
    const tier = currentTier();
    const next = nextTier();
    if (!next) return { tier, next: null, pct: 100, label: 'Top tier' };
    const earnedWithinTier = Math.max(0, rewards.points - tier.min);
    const tierSpan = Math.max(1, next.min - tier.min);
    return { tier, next, pct: pct(earnedWithinTier, tierSpan), label: `${next.min - rewards.points} pts to ${next.name}` };
  }
  function personalizedRewardPicks() {
    return suggestions().slice(0, 3);
  }
  function rewardPulseRows() {
    const active = deals.filter(d => !d.redeemed && statusOf(d) !== 'expired').length;
    const expiring = deals.filter(d => !d.redeemed && statusOf(d) === 'soon').length;
    const rows = (game.history || []).slice(0, 4).map(h => ({
      label: h.label,
      meta: new Date(h.ts).toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' })
    }));
    if (rows.length) return rows;
    return [
      { label: `${active} active deal${active === 1 ? '' : 's'} in your wallet`, meta: 'Wallet' },
      { label: `${expiring} expiring soon`, meta: 'Reminder' },
      { label: `${rewards.shared || 0} shared and ${rewards.claimed || 0} redeemed`, meta: 'Momentum' }
    ];
  }
  function nextRewardAction(dailyReady) {
    const readyQuest = (quests.items || []).find(q => !q.claimed && q.progress >= q.target);
    const nextQuest = (quests.items || []).find(q => !q.claimed && q.progress < q.target);
    if (dailyReady) return { title: 'Daily spin ready', detail: 'Claim today to keep your streak warm.', icon: 'ti-gift', label: 'Claim', action: 'claim-daily' };
    if (game.spins > 0) return { title: 'Spin ready', detail: 'Use a spin for points or a bonus deal.', icon: 'ti-player-play', label: 'Spin', action: 'spin' };
    if (readyQuest) return { title: 'Quest reward ready', detail: readyQuest.label, icon: 'ti-rosette-discount-check', label: `+${readyQuest.reward} spin`, action: `claim-quest:${readyQuest.id}` };
    if (nextQuest && nextQuest.id === 'q_add') return { title: 'Next quest', detail: 'Add a new deal to earn a spin.', icon: 'ti-camera-plus', label: 'Add deal', action: 'add-deal' };
    if (nextQuest && nextQuest.id === 'q_share') return { title: 'Next quest', detail: 'Share a deal to earn a spin.', icon: 'ti-share', label: 'Share', action: 'share-deal' };
    if (nextQuest && nextQuest.id === 'q_redeem') return { title: 'Next quest', detail: 'Redeem a saved deal to earn a spin.', icon: 'ti-ticket', label: 'Use deal', action: 'redeem-deal' };
    return { title: 'Pick a bonus', detail: 'Track a personalized deal and keep earning.', icon: 'ti-sparkles', label: 'See picks', action: 'suggest' };
  }
  function runRewardAction(action) {
    if (action === 'claim-daily') return claimDailySpin();
    if (action === 'spin') return spinWheel();
    if (action === 'add-deal') return openModal(null);
    if (action === 'share-deal') return switchTab('social');
    if (action === 'redeem-deal') return switchTab('deals');
    if (action === 'suggest') return switchTab('suggest');
    if (action && action.startsWith('claim-quest:')) return claimQuest(action.split(':')[1]);
  }
  function runWalletAction(action) {
    if (action === 'spin') return redeemPointsForSpin();
    if (action === 'deal') return redeemPointsForPremiumDeal();
    if (action === 'social') return switchTab('social');
    if (action === 'rescue') return switchTab('deals');
  }
  function addRewardPick(index) {
    const pick = personalizedRewardPicks()[index];
    if (!pick) return;
    const t = new Date();
    t.setDate(t.getDate() + 14);
    openModalPrefilled({
      merchant: pick.merchant,
      discount: pick.discount,
      category: pick.category,
      source: 'Rewards pick',
      value: pick.value || 10,
      expiry: t.toISOString().slice(0, 10),
      notes: pick.reason || 'Personalized reward pick',
      url: inferUrl(pick.merchant)
    });
  }
  function redeemPointsForSpin() {
    if (rewards.points < POINTS_PER_SPIN) {
      showToast(`Need ${POINTS_PER_SPIN - rewards.points} more points`);
      return;
    }
    rewards.points -= POINTS_PER_SPIN;
    game.spins += 1;
    save(KEYS.rewards, rewards); save(KEYS.game, game);
    showToast(`Redeemed — +1 spin (${rewards.points} pts left)`);
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
    if (tier.name === 'Silver')   bonus += 1;
    if (tier.name === 'Gold')     bonus += 2;
    if (tier.name === 'Platinum') bonus += 3;
    game.spins += bonus;
    save(KEYS.game, game);
    return { bonus, streak: game.streak, tier: tier.name };
  }
  function claimDailySpin() {
    // Manual claim button — kept for the rare case spin wasn't auto-granted
    const result = autoGrantDailySpin();
    if (!result) return;
    showToast(`Daily reward — +${result.bonus} spin${result.bonus===1?'':'s'} (day ${result.streak})`);
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
    setTimeout(() => awardPrize(idx), 4600);
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
      <div class="stat-grid">
        <div class="stat-card stat-clickable" data-filter="active"><p class="stat-label">Active deals</p><p class="stat-value">${active.length}</p><p class="stat-hint">Tap to view →</p></div>
        <div class="stat-card stat-clickable" data-filter="soon"><p class="stat-label">Expiring ≤ 7d</p><p class="stat-value" style="color: var(--text-warning);">${soon.length}</p><p class="stat-hint">Tap to view →</p></div>
        <div class="stat-card"><p class="stat-label">Total saved</p><p class="stat-value" style="color: var(--text-success);">$${Math.round(totalSaved)}</p></div>
        <div class="stat-card"><p class="stat-label">Potential</p><p class="stat-value">$${Math.round(potential)}</p></div>
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

    // Beacon banner
    if (settings.nearbyOn) {
      if (nearbyLoading) {
        html += `<div class="nearby-banner"><span class="spinner"></span><span>Checking saved deals inside your beacon radius…</span></div>`;
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
              <p style="margin:0; font-size:13px; color: var(--text-secondary);"><i class="ti ti-map-pin-off" style="font-size:14px; vertical-align:-2px; margin-right:4px;"></i>No unexpired deals within ${settings.nearbyRadius} mi</p>
            </div>
            <button id="nearby-refresh-btn" style="font-size:12px;"><i class="ti ti-refresh" style="font-size:13px; vertical-align:-2px;"></i> Refresh</button>
          </div>
        `;
      } else {
        html += `
          <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div style="min-width:0;">
              <p style="margin:0; font-size:13px;"><i class="ti ti-radar" style="font-size:14px; vertical-align:-2px; margin-right:4px;"></i>Beacon alerts are ready</p>
              <p style="margin:2px 0 0; font-size:12px; color: var(--text-secondary);">Tap to check unexpired deals near you.</p>
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
            <p style="margin:0; font-weight:500; font-size:14px; color: var(--text-info);">${game.spins} spin${game.spins===1?'':'s'} ready</p>
            <p style="margin:2px 0 0; font-size:12px; color: var(--text-info); opacity: 0.85;">Spin to win points, bonus deals, or jackpot.</p>
          </div>
          <button data-goto="rewards" style="white-space:nowrap; background: var(--text-info); color: var(--bg-primary); border-color: var(--text-info); font-weight: 500;"><i class="ti ti-confetti" style="font-size:14px; vertical-align:-2px; margin-right:4px;"></i>Spin now</button>
        </div>
      `;
    }

    if (soon.length) {
      html += `<p class="section-title"><i class="ti ti-bell" style="color: var(--text-warning);"></i>Use these soon</p>`;
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

    html += `<p class="section-title">Savings by category</p>`;
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
                    <p style="margin:0; font-size:12px; color: var(--text-secondary);">${subtext}${d.code ? ` · <code>${escapeHtml(d.code)}</code>` : ''}${d.barcode ? ` · barcode ${escapeHtml(d.barcode)}` : ''}</p>
                    ${d.address ? `<p style="margin:4px 0 0; font-size:12px; color: var(--text-secondary);"><i class="ti ti-map-pin" style="font-size:12px; vertical-align:-1px;"></i> ${escapeHtml(d.address)}</p>` : ''}
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
      geo = await geocodeMerchantNear(d.merchant, lat, lon, d.address);
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
          Based on your preferences and saved deals, here are picks you might like — tap <strong>Claim</strong> to add them to your tracked deals.
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
    const action = nextRewardAction(dailyReady);
    const questSummary = questStats();
    const tierInfo = tierProgressInfo();
    const streakTarget = nextStreakTarget();
    const streakPath = streakMilestones();
    const rewardPicks = personalizedRewardPicks();
    const pulseRows = rewardPulseRows();
    const streakDots = Array.from({length:7}, (_,i) => {
      const on = i < game.streak;
      return `<span class="streak-dot ${on?'streak-on':'streak-off'}">${i+1}</span>`;
    }).join('');
    const streakProgress = pct(Math.min(game.streak, streakTarget.day), streakTarget.day);
    const expiringSoon = deals.filter(d => !d.redeemed && statusOf(d) === 'soon').length;
    const dailyRunReady = canClaimDailyRunBonus();
    const dailyRunProgress = quests.bonusClaimed ? 100 : questSummary.pct;
    const questIcons = { q_add: 'ti-camera-plus', q_share: 'ti-share', q_redeem: 'ti-ticket' };
    const walletRows = [
      {
        icon: 'ti-bolt',
        title: 'Spin token',
        meta: rewards.points >= POINTS_PER_SPIN ? 'Ready to redeem now' : `${POINTS_PER_SPIN - rewards.points} pts away`,
        cta: rewards.points >= POINTS_PER_SPIN ? 'Redeem' : 'Earn',
        action: rewards.points >= POINTS_PER_SPIN ? 'spin' : 'social',
        disabled: false
      },
      {
        icon: 'ti-gift',
        title: 'Premium deal drop',
        meta: rewards.points >= POINTS_PER_PREMIUM_DEAL ? 'Personalized deal ready' : `${POINTS_PER_PREMIUM_DEAL - rewards.points} pts away`,
        cta: rewards.points >= POINTS_PER_PREMIUM_DEAL ? 'Unlock' : 'Build',
        action: rewards.points >= POINTS_PER_PREMIUM_DEAL ? 'deal' : 'social',
        disabled: false
      },
      {
        icon: 'ti-clock-exclamation',
        title: 'Expiry rescue',
        meta: expiringSoon ? `${expiringSoon} deal${expiringSoon === 1 ? '' : 's'} need attention` : 'No urgent deals today',
        cta: 'Review',
        action: 'rescue',
        disabled: expiringSoon === 0
      }
    ];

    root.innerHTML = `
      <div class="reward-command">
        <div class="reward-command-top">
          <div style="min-width:0;">
            <h2>${escapeHtml(action.title)}</h2>
            <p class="reward-command-sub">${escapeHtml(action.detail)} Boost resets in ${timeToMidnightLabel()}.</p>
          </div>
          <button class="reward-action-pill" data-reward-action="${escapeHtml(action.action)}">
            <i class="ti ${escapeHtml(action.icon)}"></i>${escapeHtml(action.label)}
          </button>
        </div>
        <div class="reward-command-grid">
          <div class="reward-command-metric">
            <p class="reward-command-value">${questSummary.done}/${questSummary.total}</p>
            <p class="reward-command-label">Quests</p>
          </div>
          <div class="reward-command-metric">
            <p class="reward-command-value">${game.streak}/7</p>
            <p class="reward-command-label">Streak</p>
          </div>
          <div class="reward-command-metric">
            <p class="reward-command-value">${expiringSoon}</p>
            <p class="reward-command-label">Expiring</p>
          </div>
        </div>
      </div>

      <div class="daily-run-card">
        <div class="daily-run-head">
          <div style="min-width:0;">
            <p class="daily-run-title">Today's savings run</p>
            <p class="daily-run-sub">${quests.bonusClaimed ? 'Run complete. Come back tomorrow for a fresh bonus.' : "Complete useful deal actions to open today's bonus."}</p>
          </div>
          <div class="daily-run-bonus">
            <p>Run bonus</p>
            <strong>${dailyRunBonusLabel()}</strong>
          </div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${dailyRunProgress}%;"></div></div>
        <div class="daily-run-steps">
          ${quests.items.map(q => {
            const state = q.claimed ? 'done' : (q.progress >= q.target ? 'ready' : '');
            const label = q.id === 'q_add' ? 'Capture' : (q.id === 'q_share' ? 'Share' : 'Use');
            const sub = q.claimed ? 'Done' : (q.progress >= q.target ? 'Ready' : `${q.progress}/${q.target}`);
            return `
              <div class="daily-run-step ${state}">
                <i class="ti ${questIcons[q.id] || 'ti-circle'}"></i>
                <p>${escapeHtml(label)}</p>
                <span>${escapeHtml(sub)}</span>
              </div>
            `;
          }).join('')}
        </div>
        <button id="daily-run-bonus-btn" data-daily-run-bonus class="daily-run-claim ${dailyRunReady ? 'btn-primary' : ''}" ${dailyRunReady ? '' : 'disabled'}>
          <i class="ti ${quests.bonusClaimed ? 'ti-check' : 'ti-gift'}" style="font-size:14px; vertical-align:-2px; margin-right:5px;"></i>${quests.bonusClaimed ? 'Daily run claimed' : (dailyRunReady ? 'Claim run bonus' : 'Finish run to unlock')}
        </button>
      </div>

      <div class="rewards-hero">
        <div class="reward-main-grid">
          <div class="reward-hero-copy">
            <h3>Reward wheel</h3>
            <p>${game.spins > 0 ? 'Spin for points, bonus deals, or another chance.' : 'Finish a quest or trade points to unlock your next spin.'}</p>
            <div class="reward-tile-row">
              <div class="reward-tile">
                <p class="reward-tile-value">${rewards.points}</p>
                <p class="reward-tile-label">Points</p>
              </div>
              <div class="reward-tile">
                <p class="reward-tile-value" style="color: var(--text-warning);">${game.spins}</p>
                <p class="reward-tile-label">Spins</p>
              </div>
              <div class="reward-tile">
                <p class="reward-tile-value">${escapeHtml(tierInfo.tier.name)}</p>
                <p class="reward-tile-label">Tier</p>
              </div>
            </div>
          </div>
          <div class="wheel-container compact">
            <div class="wheel-pointer"><svg width="18" height="22" viewBox="0 0 22 28"><polygon points="11,28 0,4 22,4" fill="var(--text-primary)"/><polygon points="11,4 4,0 18,0" fill="var(--text-primary)"/></svg></div>
            ${buildWheelSVG()}
            <div class="wheel-hub">SPIN</div>
          </div>
        </div>
        <button id="spin-btn" ${game.spins<=0?'disabled':''} class="btn-primary spin-cta">
          <i class="ti ti-player-play" style="font-size:14px; vertical-align:-2px; margin-right:6px;"></i>${game.spins > 0 ? `Spin to win (${game.spins})` : 'No spins yet'}
        </button>
        <div class="wheel-odds">
          <div class="wheel-odds-item"><p>Points</p><span>Most spins</span></div>
          <div class="wheel-odds-item"><p>Bonus deals</p><span>Personalized</span></div>
          <div class="wheel-odds-item"><p>Jackpot</p><span>Rare drop</span></div>
        </div>
        <div class="streak-strip">
          ${streakDots}
        </div>
        <div class="reward-path">
          ${streakPath.map(item => `
            <div class="reward-path-step ${item.state}">
              <p class="reward-path-day">Day ${item.day}</p>
              <p class="reward-path-name">${escapeHtml(item.label)}</p>
              <p class="reward-path-prize">${escapeHtml(item.detail)}</p>
            </div>
          `).join('')}
        </div>
        <div class="tier-strip" style="background: ${tierInfo.tier.bg};">
          <div style="display:flex; justify-content:space-between; align-items:center; gap: 8px;">
            <p style="margin:0; font-size:11px; font-weight:600; color:${tierInfo.tier.color}; text-transform:uppercase; letter-spacing:0.4px;">${escapeHtml(tierInfo.tier.name)} · ${escapeHtml(tierInfo.tier.perk)}</p>
            <p style="margin:0; font-size:10px; color: var(--text-secondary); white-space: nowrap;">${escapeHtml(tierInfo.label)}</p>
          </div>
          <div class="progress-bar" style="margin-top:4px;"><div class="progress-fill" style="width:${tierInfo.pct}%;"></div></div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;">
          <div>
            <p style="margin:0 0 4px; font-size:10px; color: var(--text-secondary); font-weight:700; text-transform:uppercase; letter-spacing:0.4px;">Next streak</p>
            <div class="progress-bar"><div class="progress-fill" style="width:${streakProgress}%;"></div></div>
          </div>
          <div>
            <p style="margin:0 0 4px; font-size:10px; color: var(--text-secondary); font-weight:700; text-transform:uppercase; letter-spacing:0.4px;">Today quests</p>
            <div class="progress-bar"><div class="progress-fill" style="width:${questSummary.pct}%;"></div></div>
          </div>
        </div>
      </div>

      <div class="spend-row">
        <button id="redeem-spin-btn" ${rewards.points < POINTS_PER_SPIN ? 'disabled' : ''} class="spend-pill ${rewards.points >= POINTS_PER_SPIN ? 'spend-active' : ''}">
          <i class="ti ti-bolt spend-pill-icon"></i>
          <span class="spend-pill-label">Buy spin</span>
          <span class="spend-pill-cost">${POINTS_PER_SPIN} pts</span>
        </button>
        <button id="redeem-deal-btn" ${rewards.points < POINTS_PER_PREMIUM_DEAL ? 'disabled' : ''} class="spend-pill ${rewards.points >= POINTS_PER_PREMIUM_DEAL ? 'spend-active' : ''}">
          <i class="ti ti-gift spend-pill-icon"></i>
          <span class="spend-pill-label">Premium deal</span>
          <span class="spend-pill-cost">${POINTS_PER_PREMIUM_DEAL} pts</span>
        </button>
      </div>

      <p class="section-title"><i class="ti ti-wallet"></i>Reward wallet</p>
      <div class="reward-wallet">
        ${walletRows.map(row => `
          <div class="reward-wallet-row">
            <div class="reward-wallet-icon"><i class="ti ${escapeHtml(row.icon)}"></i></div>
            <div style="flex:1; min-width:0;">
              <p class="reward-wallet-title">${escapeHtml(row.title)}</p>
              <p class="reward-wallet-meta">${escapeHtml(row.meta)}</p>
            </div>
            <button data-wallet-action="${escapeHtml(row.action)}" ${row.disabled ? 'disabled' : ''}>${escapeHtml(row.cta)}</button>
          </div>
        `).join('')}
      </div>

      <p class="section-title"><i class="ti ti-sparkles"></i>Bonus picks</p>
      <div class="reward-picks">
        ${rewardPicks.map((pick, i) => `
          <div class="reward-pick">
            <span class="reward-pick-badge"><i class="ti ti-category"></i>${escapeHtml(pick.category)}</span>
            <p class="reward-pick-title">${escapeHtml(pick.merchant)} — ${escapeHtml(pick.discount)}</p>
            <p class="reward-pick-meta">${escapeHtml(pick.reason || 'Personalized pick')} · ~$${Math.round(pick.value || 10)} value</p>
            <button data-reward-pick="${i}"><i class="ti ti-plus" style="font-size:13px; vertical-align:-2px; margin-right:4px;"></i>Track deal</button>
          </div>
        `).join('')}
      </div>

      <div class="quest-board">
        <div class="quest-board-head">
          <p class="quest-board-title"><i class="ti ti-target" style="font-size:14px; vertical-align:-2px; margin-right:4px;"></i>Daily quests</p>
          <p class="quest-board-score">${questSummary.ready} ready · ${questSummary.done}/${questSummary.total} claimed</p>
        </div>
        <div class="progress-bar" style="margin-bottom: 4px;"><div class="progress-fill" style="width:${questSummary.pct}%;"></div></div>
        ${quests.items.map(q => `
          <div class="quest-row reward-quest-row">
            <div class="quest-status-dot ${q.claimed ? 'done' : (q.progress >= q.target ? 'ready' : '')}">
              <i class="ti ${q.claimed ? 'ti-check' : (q.progress >= q.target ? 'ti-gift' : 'ti-circle')}" style="font-size:13px;"></i>
            </div>
            <div style="flex:1; min-width:0;">
              <p style="margin:0; font-size:13px;">${escapeHtml(q.label)}</p>
              <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
                <div class="progress-bar" style="flex:1;"><div class="progress-fill" style="width:${Math.round((q.progress/q.target)*100)}%;"></div></div>
                <span style="font-size:10px; color: var(--text-secondary);">${q.progress}/${q.target}</span>
              </div>
            </div>
            <button data-claim-quest="${q.id}" ${(q.progress<q.target||q.claimed)?'disabled':''} style="font-size:12px; padding: 6px 10px;">${q.claimed ? 'Claimed' : `+${q.reward}`}</button>
          </div>
        `).join('')}
      </div>

      <p class="section-title"><i class="ti ti-activity"></i>Your reward pulse</p>
      <div class="reward-feed">
        ${pulseRows.map(row => `
          <div class="reward-feed-row">
            <span>${escapeHtml(row.label)}</span>
            <span class="reward-feed-time">${escapeHtml(row.meta)}</span>
          </div>
        `).join('')}
      </div>
    `;
    document.getElementById('spin-btn').addEventListener('click', spinWheel);
    const dailyRunBtn = document.getElementById('daily-run-bonus-btn');
    if (dailyRunBtn) dailyRunBtn.addEventListener('click', claimDailyRunBonus);
    const rewardAction = root.querySelector('[data-reward-action]');
    if (rewardAction) rewardAction.addEventListener('click', () => runRewardAction(rewardAction.getAttribute('data-reward-action')));
    root.querySelectorAll('[data-claim-quest]').forEach(b => b.addEventListener('click', () => claimQuest(b.getAttribute('data-claim-quest'))));
    root.querySelectorAll('[data-reward-pick]').forEach(b => b.addEventListener('click', () => addRewardPick(Number(b.getAttribute('data-reward-pick')))));
    root.querySelectorAll('[data-wallet-action]').forEach(b => b.addEventListener('click', () => runWalletAction(b.getAttribute('data-wallet-action'))));
    const redeemSpinBtn = document.getElementById('redeem-spin-btn');
    if (redeemSpinBtn) redeemSpinBtn.addEventListener('click', redeemPointsForSpin);
    const redeemDealBtn = document.getElementById('redeem-deal-btn');
    if (redeemDealBtn) redeemDealBtn.addEventListener('click', redeemPointsForPremiumDeal);
  }

  function renderSocial() {
    const root = document.getElementById('panel-social');
    const myShared = deals.filter(d => d.shared && !d.redeemed);
    const starterPicks = suggestions().slice(0, 3);
    const unsharedDeals = getUnexpiredDeals().filter(d => !d.shared);
    const inviteCode = referralCode();
    root.innerHTML = `
      <div class="social-loop">
        <div class="social-loop-top">
          <div style="min-width:0;">
            <p class="social-loop-title">Share useful savings</p>
            <p class="social-loop-sub">${myShared.length ? `${myShared.length} deal${myShared.length === 1 ? '' : 's'} ready for your circle.` : 'Start with one deal from your wallet or a Perq pick.'}</p>
          </div>
          <div class="referral-code">${escapeHtml(inviteCode)}</div>
        </div>
        <div class="social-action-row">
          <button id="copy-referral-btn" class="btn-primary"><i class="ti ti-copy"></i>Copy invite</button>
          <button data-open-deals><i class="ti ti-ticket"></i>${unsharedDeals.length ? 'Share a deal' : 'Add a deal'}</button>
        </div>
      </div>

      <div class="stat-grid-compact" style="grid-template-columns: repeat(3, 1fr);">
        <div class="stat-card compact"><p class="stat-label">Points</p><p class="stat-value">${rewards.points}</p></div>
        <div class="stat-card compact"><p class="stat-label">Shared</p><p class="stat-value">${rewards.shared}</p></div>
        <div class="stat-card compact"><p class="stat-label">Claimed</p><p class="stat-value">${rewards.claimed}</p></div>
      </div>

      <p class="section-title"><i class="ti ti-share"></i>Your shared deals</p>
      ${myShared.length ? myShared.map(d => `
        <div class="social-list-row" style="background: var(--bg-primary); border: 0.5px solid var(--border-tertiary); border-radius: var(--radius-md); padding: 12px; margin-bottom: 8px;">
          <div style="min-width:0;">
            <p class="social-list-title">${escapeHtml(d.merchant)} — ${escapeHtml(d.discount)}</p>
            <p class="social-list-meta">${d.expiry ? `Expires ${fmtDate(d.expiry)}` : 'No expiry'}${d.code ? ` · ${escapeHtml(d.code)}` : ''}</p>
          </div>
          <span class="pill" style="background: var(--bg-success); color: var(--text-success);">Shared</span>
        </div>
      `).join('') : `<div class="empty" style="padding: 20px;"><i class="ti ti-share"></i>No shared deals yet.</div>`}

      <p class="section-title"><i class="ti ti-sparkles"></i>Starter picks</p>
      <div class="social-list">
        ${starterPicks.map((pick, i) => `
        <div class="social-list-row">
          <div style="min-width:0;">
            <p class="social-list-title">${escapeHtml(pick.merchant)} — ${escapeHtml(pick.discount)}</p>
            <p class="social-list-meta">${escapeHtml(pick.category)} · ${escapeHtml(pick.reason || 'Personalized pick')}</p>
          </div>
          <button data-social-pick="${i}">Track</button>
        </div>
      `).join('')}
      </div>
    `;
    const referralBtn = document.getElementById('copy-referral-btn');
    if (referralBtn) referralBtn.addEventListener('click', copyReferralInvite);
    root.querySelectorAll('[data-open-deals]').forEach(b => b.addEventListener('click', () => switchTab(unsharedDeals.length ? 'deals' : 'dashboard')));
    root.querySelectorAll('[data-social-pick]').forEach(b=>{
      b.addEventListener('click', () => {
        const pick = starterPicks[Number(b.getAttribute('data-social-pick'))];
        if (!pick) return;
        const t = new Date(); t.setDate(t.getDate()+10);
        openModalPrefilled({ merchant:pick.merchant, discount:pick.discount, category:pick.category, source:'Social pick', value: pick.value || 10, expiry: t.toISOString().slice(0,10), notes:pick.reason || 'Perq starter pick', url: inferUrl(pick.merchant) });
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
          ${d.barcode ? `<p style="font-family: ui-monospace, monospace; font-size: 13px; letter-spacing: 1px; margin: 6px 0 0; opacity: 0.9;">Barcode: ${escapeHtml(d.barcode)}</p>` : ''}
          <p class="cashier-meta">${expiryText}${d.address ? ' · ' + escapeHtml(d.address) : ''}${d.notes ? ' · ' + escapeHtml(d.notes) : ''}</p>
        </div>
        ${(d.barcode || d.code) ? `<div class="claim-barcode-wrap">${buildBarcodeSvg(d.barcode || d.code)}</div>` : ''}
        <p class="claim-meta">Show this screen to the cashier${(d.barcode || d.code) ? '. They can key in or scan the code above.' : '.'}</p>
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

  function openImportModal() {
    setField('import-text', '');
    document.getElementById('modal-import').classList.add('active');
    setTimeout(() => document.getElementById('import-text').focus(), 80);
  }
  function closeImportModal() {
    document.getElementById('modal-import').classList.remove('active');
  }
  function importDealFromText() {
    const text = getField('import-text').trim();
    if (!text) {
      showToast('Paste deal text or a link first');
      return;
    }
    const deal = extractDealFromText(text, 'Browser / email import');
    closeImportModal();
    openModalPrefilled(deal);
    showToast('Deal details extracted. Review and save.');
  }

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
    if (d.shared) { switchTab('social'); return; }
    d.shared = true;
    rewards.shared += 1; rewards.points += 10;
    bumpQuest('q_share');
    save(KEYS.deals, deals); save(KEYS.rewards, rewards);
    showToast('Shared (+10 pts)');
    renderAll();
    switchTab('social');
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
      setField('f-barcode', d.barcode); setField('f-expiry', d.expiry); setField('f-address', d.address);
      setField('f-notes', d.notes); setField('f-url', d.url);
    } else if (!opts.imageOnly) {
      ['f-merchant','f-discount','f-value','f-code','f-barcode','f-expiry','f-address','f-notes','f-url'].forEach(k=>setField(k,''));
      setField('f-category','Groceries'); setField('f-source','Email');
      document.getElementById('capture-preview').style.display = 'none';
      document.getElementById('ocr-status').style.display = 'none';
      pendingImage = null;
    } else {
      ['f-merchant','f-discount','f-value','f-code','f-barcode','f-expiry','f-address','f-notes','f-url'].forEach(k=>setField(k,''));
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
    setField('f-barcode', data.barcode||''); setField('f-expiry', data.expiry||'');
    setField('f-address', data.address||''); setField('f-notes', data.notes||'');
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
      barcode: getField('f-barcode').trim(), address: getField('f-address').trim(),
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

  // ---------- Settings ----------
  function openSettings() {
    document.getElementById('s-reminders-on').checked = !!settings.remindersOn;
    document.getElementById('s-reminder-days').value = String(settings.reminderDays);
    document.getElementById('s-nearby-on').checked = !!settings.nearbyOn;
    document.getElementById('s-nearby-radius').value = String(settings.nearbyRadius);
    if (emailConnection.provider) setField('email-provider', emailConnection.provider);
    renderProfileSummary();
    renderAiCaptureStatus();
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
    showToast('Settings saved');
    // Trigger checks based on new settings
    checkAndSendReminders();
    if (settings.nearbyOn) {
      startBeaconWatch();
      findNearbyDeals();
    } else {
      stopBeaconWatch();
      nearbyResults = [];
      renderDashboard();
    }
    renderAll();
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ profile, emailConnection, deals, rewards, game, quests, settings }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `perq-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Backup downloaded');
  }
  function resetData() {
    if (!confirm('Delete all deals, rewards, and history? This cannot be undone.')) return;
    const keepKeys = new Set(storageKeyVariants('installDismissed'));
    STORAGE_KEY_NAMES.forEach(name => {
      storageKeyVariants(name).forEach(key => {
        if (!keepKeys.has(key)) localStorage.removeItem(key);
      });
    });
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

  function hideSplash() {
    if (window.PerqSplash && typeof window.PerqSplash.hide === 'function') {
      window.PerqSplash.hide();
      return;
    }
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('hide');
    setTimeout(() => { splash.style.display = 'none'; }, 500);
  }

  function init() {
    migrateLegacyStorage();
    cleanupLegacyBrowserSecrets();
    deals = load(KEYS.deals, []);
    rewards = load(KEYS.rewards, { points: 0, shared: 0, claimed: 0 });
    game = Object.assign({ spins: 0, lastDailyClaim: null, streak: 0, totalSpins: 0, history: [] }, load(KEYS.game, {}));
    quests = load(KEYS.quests, { date: null, items: [] });
    settings = Object.assign({ ...DEFAULT_SETTINGS }, load(KEYS.settings, {}));
    profile = load(KEYS.profile, null);
    emailConnection = Object.assign({ requested: false, provider: '', status: 'not_connected' }, load(KEYS.emailConnection, {}));

    const params = new URLSearchParams(location.search);
    if (params.get('demo') === '1' && !load(KEYS.seeded, false) && deals.length === 0) {
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
        showToast(`🎉 +${dailyResult.bonus} daily spin${dailyResult.bonus===1?'':'s'} (day ${dailyResult.streak} streak)`);
      }, 1400);
    }

    document.getElementById('btn-add').addEventListener('click', () => openModal(null));
    document.getElementById('btn-snap').addEventListener('click', async () => {
      const handledNative = await captureDealPhotoNative();
      if (!handledNative) document.getElementById('capture-input').click();
    });
    document.getElementById('btn-import').addEventListener('click', openImportModal);
    document.getElementById('capture-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) handleCapture(f);
      e.target.value = '';
    });
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-save').addEventListener('click', saveModalForm);
    document.getElementById('prize-close').addEventListener('click', () => document.getElementById('modal-prize').classList.remove('active'));
    document.getElementById('claim-close').addEventListener('click', closeClaim);
    document.getElementById('claim-redeem').addEventListener('click', claimRedeem);
    document.getElementById('import-close').addEventListener('click', closeImportModal);
    document.getElementById('import-cancel').addEventListener('click', closeImportModal);
    document.getElementById('import-save').addEventListener('click', importDealFromText);
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
    document.getElementById('profile-save').addEventListener('click', saveProfileFromScreen);
    document.getElementById('profile-edit').addEventListener('click', () => { hydrateProfileScreen(); showProfileScreen(); });
    document.getElementById('email-connect-btn').addEventListener('click', saveEmailConnectIntent);
    document.querySelectorAll('.nav-btn').forEach(b => b.addEventListener('click', () => switchTab(b.getAttribute('data-tab'))));

    document.getElementById('modal-deal').addEventListener('click', (e) => { if (e.target.id === 'modal-deal') closeModal(); });
    document.getElementById('modal-prize').addEventListener('click', (e) => { if (e.target.id === 'modal-prize') document.getElementById('modal-prize').classList.remove('active'); });
    document.getElementById('modal-settings').addEventListener('click', (e) => { if (e.target.id === 'modal-settings') closeSettings(); });
    document.getElementById('modal-claim').addEventListener('click', (e) => { if (e.target.id === 'modal-claim') closeClaim(); });
    document.getElementById('modal-import').addEventListener('click', (e) => { if (e.target.id === 'modal-import') closeImportModal(); });

    renderAll();
    hydrateProfileScreen();
    renderProfileSummary();
    const installWillShow = shouldShowMobileInstallScreen();
    if (!validProfile(profile) && !installWillShow) showProfileScreen();

    // Handle deep links from manifest shortcuts
    try {
      const action = params.get('action');
      const sharedPayload = parseIncomingShare(params);
      if (sharedPayload) {
        setTimeout(() => openModalPrefilled(sharedPayload), 900);
      } else if (action === 'snap') {
        setTimeout(() => document.getElementById('capture-input').click(), 1000);
      } else if (action === 'add') {
        setTimeout(() => openModal(null), 1000);
      }
    } catch(e) {}

    // Run reminder check on load and every time the app comes back to foreground
    checkAndSendReminders();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshDailyQuests();
        const r = autoGrantDailySpin();
        if (r) showToast(`🎉 +${r.bonus} daily spin${r.bonus===1?'':'s'} (day ${r.streak} streak)`);
        checkAndSendReminders();
        if (settings.nearbyOn) {
          startBeaconWatch();
          findNearbyDeals();
        }
        renderAll();
      }
    });

    // Initial nearby check if enabled
    if (settings.nearbyOn) {
      // Defer slightly so the UI renders first
      startBeaconWatch();
      setTimeout(() => findNearbyDeals(), 500);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      updateInstallAction();
      if (!load(KEYS.installDismissed, false)) {
        document.getElementById('install-banner').classList.add('show');
      }
    });
    document.getElementById('install-btn').addEventListener('click', promptInstall);
    document.getElementById('install-screen-action').addEventListener('click', promptInstall);
    document.getElementById('install-dismiss').addEventListener('click', () => {
      document.getElementById('install-banner').classList.remove('show');
      save(KEYS.installDismissed, true);
    });

    // ---- Splash screen handling ----
    setTimeout(hideSplash, 500);

    // ---- Mobile install guidance (shown in mobile browsers, not installed) ----
    showMobileInstallScreenIfNeeded();
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }
  function isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }
  function isMobileBrowser() {
    return isIOS() || isAndroid() || /Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
  function isInStandaloneMode() {
    return ('standalone' in navigator) && navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
  }
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function configureInstallScreenCopy() {
    if (isIOS()) {
      setText('install-title', 'Add Perq to your home screen');
      setText('install-lead', "Save Perq as a web app so it opens full screen, stays handy, and works offline.");
      setText('install-step-1-title', 'Tap the Share button');
      setText('install-step-1-sub', "It's the square with an arrow at the bottom of Safari.");
      setText('install-step-2-title', 'Tap Add to Home Screen');
      setText('install-step-2-sub', 'Scroll the share sheet if you do not see it right away.');
      setText('install-step-3-title', 'Tap Add');
      setText('install-step-3-sub', 'The Perq icon will appear on your home screen.');
      return;
    }
    if (isAndroid()) {
      setText('install-title', 'Install Perq');
      setText('install-lead', 'Save Perq as a web app so it opens like a native app and stays available offline.');
      setText('install-step-1-title', 'Tap Install now');
      setText('install-step-1-sub', 'If the button is not shown, open the Chrome menu.');
      setText('install-step-2-title', 'Choose Install app');
      setText('install-step-2-sub', 'Some browsers call this Add to Home screen.');
      setText('install-step-3-title', 'Confirm Install');
      setText('install-step-3-sub', 'The Perq icon will appear on your home screen.');
      return;
    }
    setText('install-title', 'Save Perq as an app');
    setText('install-lead', 'Install Perq from your mobile browser for a faster app-style experience.');
    setText('install-step-1-title', 'Open the browser menu');
    setText('install-step-1-sub', 'Look for the menu or share button in your browser.');
    setText('install-step-2-title', 'Choose Install app');
    setText('install-step-2-sub', 'Some browsers call this Add to Home screen.');
    setText('install-step-3-title', 'Confirm');
    setText('install-step-3-sub', 'The Perq icon will appear on your home screen.');
  }
  function updateInstallAction() {
    const action = document.getElementById('install-screen-action');
    if (!action) return;
    action.style.display = deferredInstallPrompt ? 'block' : 'none';
  }
  function shouldShowMobileInstallScreen() {
    return isMobileBrowser() && !isInStandaloneMode() && !load(KEYS.installDismissed, false);
  }
  function continueAfterInstallScreen() {
    if (!validProfile(profile)) showProfileScreen();
  }
  async function promptInstall() {
    if (!deferredInstallPrompt) return;
    const screen = document.getElementById('install-screen');
    const fromInstallScreen = screen && screen.classList.contains('show');
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      document.getElementById('install-banner').classList.remove('show');
      save(KEYS.installDismissed, true);
    }
    if (screen) screen.classList.remove('show');
    deferredInstallPrompt = null;
    updateInstallAction();
    if (fromInstallScreen) continueAfterInstallScreen();
  }
  function showMobileInstallScreenIfNeeded() {
    const screen = document.getElementById('install-screen');
    if (!screen) return;
    configureInstallScreenCopy();
    updateInstallAction();
    if (shouldShowMobileInstallScreen()) {
      // Show after splash settles
      setTimeout(() => screen.classList.add('show'), 1200);
    }
    document.getElementById('install-skip').addEventListener('click', () => {
      screen.classList.remove('show');
      save(KEYS.installDismissed, true);
      continueAfterInstallScreen();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

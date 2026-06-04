(function(){
  'use strict';

  const STORAGE_PREFIX = 'perq:';
  const STORAGE_KEY_NAMES = [
    'deals', 'rewards', 'game', 'quests', 'seeded', 'installDismissed',
    'apiKey', 'settings', 'notified', 'geocache', 'userLoc', 'profile',
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

  // ---------- Scheduled Notifications (fire even when app is closed) ----------
  async function scheduleExpiryReminders(deal) {
    if (!settings.remindersOn || !deal.expiry) return;
    const LocalNotifications = nativePlugin('LocalNotifications');
    if (!LocalNotifications) return;
    const granted = await requestNativeNotifications();
    if (!granted) return;

    const expiryDate = new Date(deal.expiry + 'T09:00:00');
    if (isNaN(expiryDate.getTime())) return;

    const reminderDays = settings.reminderDays || 3;
    const notifications = [];

    // Schedule reminder X days before expiry
    const reminderDate = new Date(expiryDate);
    reminderDate.setDate(reminderDate.getDate() - reminderDays);
    if (reminderDate > new Date()) {
      notifications.push({
        id: notificationId(deal.id + '-pre'),
        title: `${deal.merchant} expires in ${reminderDays} day${reminderDays === 1 ? '' : 's'}`,
        body: `${deal.discount}${deal.code ? ' — code ' + deal.code : ''}. Don't forget to use it!`,
        schedule: { at: reminderDate },
        smallIcon: 'ic_stat_perq',
        iconColor: '#1B6C8C'
      });
    }

    // Schedule day-of reminder at 9am
    if (expiryDate > new Date()) {
      notifications.push({
        id: notificationId(deal.id + '-day'),
        title: `⏰ ${deal.merchant} expires TODAY`,
        body: `${deal.discount}${deal.code ? ' — code ' + deal.code : ''}. Last chance!`,
        schedule: { at: expiryDate },
        smallIcon: 'ic_stat_perq',
        iconColor: '#A32D2D'
      });
    }

    // Schedule 1 day before at 6pm (evening reminder)
    const eveningBefore = new Date(expiryDate);
    eveningBefore.setDate(eveningBefore.getDate() - 1);
    eveningBefore.setHours(18, 0, 0, 0);
    if (eveningBefore > new Date()) {
      notifications.push({
        id: notificationId(deal.id + '-eve'),
        title: `${deal.merchant} expires tomorrow`,
        body: `${deal.discount} — use it before it's gone!`,
        schedule: { at: eveningBefore },
        smallIcon: 'ic_stat_perq',
        iconColor: '#854F0B'
      });
    }

    if (notifications.length) {
      try {
        await LocalNotifications.schedule({ notifications });
      } catch(e) { console.warn('Failed to schedule notifications:', e); }
    }
  }

  async function cancelExpiryReminders(dealId) {
    const LocalNotifications = nativePlugin('LocalNotifications');
    if (!LocalNotifications) return;
    try {
      const ids = [
        { id: notificationId(dealId + '-pre') },
        { id: notificationId(dealId + '-day') },
        { id: notificationId(dealId + '-eve') }
      ];
      await LocalNotifications.cancel({ notifications: ids });
    } catch(e) { /* ignore */ }
  }

  async function scheduleAllDealReminders() {
    if (!settings.remindersOn) return;
    const active = deals.filter(d => !d.redeemed && d.expiry && daysUntil(d.expiry) > 0);
    for (const deal of active) {
      await scheduleExpiryReminders(deal);
    }
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
    const apiKey = load(KEYS.apiKey, '');
    if (!apiKey && !OCR_PROXY_URL) {
      showOcrStatus('warn', 'No API key set — fill in the details manually, or deploy the OCR proxy.');
      return;
    }
    showOcrStatus('reading', 'Extracting deal details with AI…');
    try {
      const result = await runOcr(dataUrl, apiKey);
      applyOcrResult(result);
      showOcrStatus('success', 'Got it — review and save below.');
      showQuickSave(result);
    } catch (err) {
      console.error('OCR failed:', err);
      showOcrStatus('error', `Couldn't read it (${err.message}). Fill in manually.`);
    }
  }
  // ---------- Barcode/QR Scanner ----------
  let scannerStream = null;
  let scannerInterval = null;
  let scannerDetector = null;

  async function openScanner() {
    const overlay = document.getElementById('scanner-overlay');
    const video = document.getElementById('scanner-video');
    overlay.classList.add('active');
    document.getElementById('scanner-result').style.display = 'none';

    try {
      scannerStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      video.srcObject = scannerStream;
      await video.play();
      startBarcodeDetection(video);
    } catch (e) {
      showToast('Camera access denied');
      closeScanner();
    }
  }

  function closeScanner() {
    const overlay = document.getElementById('scanner-overlay');
    const video = document.getElementById('scanner-video');
    overlay.classList.remove('active');
    if (scannerInterval) { clearInterval(scannerInterval); scannerInterval = null; }
    if (scannerStream) {
      scannerStream.getTracks().forEach(t => t.stop());
      scannerStream = null;
    }
    video.srcObject = null;
  }

  function startBarcodeDetection(video) {
    // Try native BarcodeDetector API (Chrome, Safari 17.2+)
    if ('BarcodeDetector' in window) {
      scannerDetector = new BarcodeDetector({
        formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'data_matrix']
      });
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    scannerInterval = setInterval(async () => {
      if (video.readyState < 2) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      let results = [];

      // Try native API
      if (scannerDetector) {
        try {
          results = await scannerDetector.detect(canvas);
        } catch (e) { /* ignore detection errors */ }
      }

      // Fallback: try reading numeric sequences from center strip (basic heuristic)
      if (!results.length) {
        try {
          const imageData = ctx.getImageData(
            canvas.width * 0.15, canvas.height * 0.4,
            canvas.width * 0.7, canvas.height * 0.2
          );
          const code = detectNumericBarcode(imageData);
          if (code) results = [{ rawValue: code, format: 'numeric' }];
        } catch (e) { /* ignore */ }
      }

      if (results.length > 0) {
        const code = results[0].rawValue;
        if (code && code.length >= 4) {
          onBarcodeDetected(code);
        }
      }
    }, 250); // Scan 4 times/second
  }

  function detectNumericBarcode(imageData) {
    // Simple heuristic: look for alternating dark/light pattern in center row
    // This is a basic fallback — the native BarcodeDetector handles real detection
    return null; // Rely on native API; this is a placeholder for jsQR integration later
  }

  function onBarcodeDetected(code) {
    // Stop continuous scanning
    if (scannerInterval) { clearInterval(scannerInterval); scannerInterval = null; }

    // Vibrate for haptic feedback
    if (navigator.vibrate) navigator.vibrate(100);

    // Show result
    const resultEl = document.getElementById('scanner-result');
    const codeEl = document.getElementById('scanner-result-code');
    codeEl.textContent = code;
    resultEl.style.display = 'flex';
    document.querySelector('.scanner-hint').textContent = 'Code detected!';
  }

  function useScannerCode() {
    const code = document.getElementById('scanner-result-code').textContent;
    closeScanner();
    // Open deal form pre-filled with barcode
    openModal(null);
    setTimeout(() => {
      const isUrl = /^https?:\/\//i.test(code);
      if (isUrl) {
        document.getElementById('f-url').value = code;
        const merchant = merchantFromUrl(code);
        if (merchant) document.getElementById('f-merchant').value = merchant;
        document.getElementById('f-source').value = 'QR scan';
      } else {
        // Could be a barcode number or promo code
        const isNumeric = /^\d{8,}$/.test(code);
        if (isNumeric) {
          document.getElementById('f-barcode').value = code;
        } else {
          document.getElementById('f-code').value = code;
        }
        document.getElementById('f-source').value = 'Barcode scan';
      }
      showToast('Code captured — fill in the deal details');
    }, 100);
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
  // OCR proxy endpoint — set after deploying backend/ocr-proxy
  const OCR_PROXY_URL = ''; // e.g. 'https://perq-ocr-proxy.yourname.workers.dev'

  async function runOcr(dataUrl, apiKey) {
    const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid image format');
    const mediaType = match[1];
    const b64 = match[2];

    // Try proxy first (no API key needed on client)
    if (OCR_PROXY_URL) {
      try {
        const proxyResp = await fetch(OCR_PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64, mediaType })
        });
        const proxyData = await proxyResp.json();
        if (proxyData.ok && proxyData.result) return proxyData.result;
        if (!proxyResp.ok && proxyResp.status === 429) throw new Error('Too many scans — try again in a minute');
        // If proxy failed but we have a local key, fall through
        if (!apiKey) throw new Error(proxyData.error || 'OCR service unavailable');
      } catch (e) {
        if (!apiKey) throw e;
        // Fall through to direct API call with user's key
      }
    }

    // Fallback: direct API call with user's own key
    if (!apiKey) throw new Error('No OCR service available. Set your API key in Settings.');
    const prompt = `Extract coupon/deal details from this image. Return ONLY a JSON object:
{
  "merchant": "store/brand name",
  "discount": "discount amount like '20% off' or '$10 off $50'",
  "code": "promo code if visible, else null",
  "barcode": "barcode number or scannable numeric value if visible, else null",
  "expiry": "YYYY-MM-DD format if a date is visible, else null",
  "validBy": "original visible expiry wording such as valid by/valid thru if present, else null",
  "category": "one of: Groceries, Dining, Apparel, Travel, Beauty, Home, Electronics, Other",
  "value": estimated dollar value as a number,
  "url": "deal link if visible, else null",
  "address": "business address if visible, else null",
  "notes": "any restrictions like 'min $50', 'in-store only', else null"
}
Return only the JSON, no other text.`;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 500,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: prompt }
        ]}]
      })
    });
    if (!response.ok) {
      const errText = await response.text();
      let errMsg = `API error ${response.status}`;
      try { const errJson = JSON.parse(errText); if (errJson.error && errJson.error.message) errMsg = errJson.error.message; } catch(e) {}
      throw new Error(errMsg);
    }
    const data = await response.json();
    const text = (data.content || []).map(b => b.text || '').join('').trim();
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try { return JSON.parse(cleaned); } catch(e) { throw new Error('AI returned non-JSON response'); }
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

  function showQuickSave(ocrResult) {
    if (!ocrResult || !ocrResult.merchant) return;
    const el = document.getElementById('ocr-status');
    const expiryLabel = ocrResult.expiry ? ` · expires ${ocrResult.expiry}` : '';
    el.innerHTML = `
      <div style="width:100%;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <i class="ti ti-check" style="font-size:16px;color:var(--text-success);"></i>
          <span style="font-size:13px;color:var(--text-primary);">
            <strong>${escapeHtml(ocrResult.merchant)}</strong> — ${escapeHtml(ocrResult.discount || 'Deal')}${expiryLabel}
          </span>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="quick-save-btn" style="flex:1;background:var(--brand);color:white;border:none;border-radius:8px;padding:10px;font-weight:600;font-size:14px;">
            <i class="ti ti-check"></i> Save & Set Reminder
          </button>
          <button id="quick-edit-btn" style="flex:0 0 auto;background:var(--bg-secondary);border:1px solid var(--border-secondary);border-radius:8px;padding:10px 14px;font-size:13px;">
            Edit
          </button>
        </div>
      </div>
    `;
    el.className = 'ocr-status success';
    el.style.display = 'flex';
    document.getElementById('quick-save-btn').addEventListener('click', () => {
      saveModalForm();
      showToast('✨ Deal saved with reminders set!');
    });
    document.getElementById('quick-edit-btn').addEventListener('click', () => {
      el.innerHTML = `<i class="ti ti-check" style="font-size:16px;"></i><span>Edit the details below and save.</span>`;
    });
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
    const streakDots = Array.from({length:7}, (_,i) => {
      const on = i < game.streak;
      return `<span class="streak-dot ${on?'streak-on':'streak-off'}">${i+1}</span>`;
    }).join('');
    const recent = (game.history || []).slice(0, 5);
    const tier = currentTier();
    const next = nextTier();

    root.innerHTML = `
      <!-- Hero card: wheel + stats + spin button + tier all in one block -->
      <div class="rewards-hero">
        <div class="rewards-hero-top">
          <div class="rewards-stats-side">
            <div class="hero-stat">
              <p class="hero-stat-val">${rewards.points}</p>
              <p class="hero-stat-lbl">POINTS</p>
            </div>
            <div class="hero-stat">
              <p class="hero-stat-val" style="color: var(--text-warning);">${game.spins}</p>
              <p class="hero-stat-lbl">SPINS</p>
            </div>
            <div class="hero-stat">
              <p class="hero-stat-val">${game.streak}</p>
              <p class="hero-stat-lbl">STREAK</p>
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
        <div class="streak-strip">
          ${streakDots}
        </div>
        <div class="tier-strip" style="background: ${tier.bg};">
          <div style="display:flex; justify-content:space-between; align-items:center; gap: 8px;">
            <p style="margin:0; font-size:11px; font-weight:600; color:${tier.color}; text-transform:uppercase; letter-spacing:0.4px;">${tier.name} · ${tier.perk}</p>
            ${next ? `<p style="margin:0; font-size:10px; color: var(--text-secondary); white-space: nowrap;">${next.min - rewards.points} pts to ${next.name}</p>` : ''}
          </div>
          ${next ? `<div class="progress-bar" style="margin-top:4px;"><div class="progress-fill" style="width:${Math.min(100, Math.round((rewards.points / next.min) * 100))}%;"></div></div>` : ''}
        </div>
        ${dailyReady ? `
          <div style="text-align: center; margin-top: 8px;">
            <button id="daily-btn" style="font-size: 11px; padding: 4px 10px;"><i class="ti ti-gift" style="font-size:11px; vertical-align:-2px; margin-right:3px;"></i>Claim today's free spin</button>
          </div>
        ` : ''}
      </div>

      <!-- Spend points: compact horizontal pills -->
      <div class="spend-row">
        <button id="redeem-spin-btn" ${rewards.points < POINTS_PER_SPIN ? 'disabled' : ''} class="spend-pill ${rewards.points >= POINTS_PER_SPIN ? 'spend-active' : ''}">
          <span class="spend-pill-icon">⚡</span>
          <span class="spend-pill-label">Buy spin</span>
          <span class="spend-pill-cost">${POINTS_PER_SPIN} pts</span>
        </button>
        <button id="redeem-deal-btn" ${rewards.points < POINTS_PER_PREMIUM_DEAL ? 'disabled' : ''} class="spend-pill ${rewards.points >= POINTS_PER_PREMIUM_DEAL ? 'spend-active' : ''}">
          <span class="spend-pill-icon">🎁</span>
          <span class="spend-pill-label">Premium deal</span>
          <span class="spend-pill-cost">${POINTS_PER_PREMIUM_DEAL} pts</span>
        </button>
      </div>

      <!-- Below the fold: Daily quests + recent wins -->
      <p class="section-title"><i class="ti ti-target"></i>Daily quests</p>
      <div class="card" style="padding: 2px 14px;">
        ${quests.items.map(q => `
          <div class="quest-row">
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
      ${recent.length ? `
        <p class="section-title">Recent wins</p>
        <div class="card" style="padding: 2px 14px;">
          ${recent.map((h,i) => `
            <div style="padding: 8px 0; ${i>0?'border-top: 0.5px solid var(--border-tertiary);':''} display:flex; justify-content:space-between; font-size:12px; gap: 8px;">
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
    const activity = loadActivity();

    // Community trending (static seed + dynamic)
    const community = [
      { user:'@maya_saves', merchant:"Trader Joe's", discount:'$5 off $30', category:'Groceries', claims: 142 },
      { user:'@plano_deals', merchant:'AMC Theatres', discount:'$3 off ticket', category:'Other', claims: 89 },
      { user:'@coupon_dad_tx', merchant:"Lowe's", discount:'10% off paint', category:'Home', claims: 56 },
      { user:'@thrifty_jen', merchant:'Panera', discount:'Free pastry', category:'Dining', claims: 211 }
    ];

    const activityHtml = activity.length ? activity.slice(0, 15).map(a => {
      const icon = a.type === 'share' ? 'ti-share' : a.type === 'claim' ? 'ti-download' : 'ti-bell';
      const color = a.type === 'share' ? 'var(--text-info)' : 'var(--text-success)';
      let desc = '';
      if (a.type === 'share') desc = `You shared <strong>${escapeHtml(a.data.merchant)}</strong>`;
      else if (a.type === 'claim') desc = `You claimed <strong>${escapeHtml(a.data.merchant)}</strong>${a.data.from ? ` from ${escapeHtml(a.data.from)}` : ''}`;
      else desc = escapeHtml(a.data.text || 'Activity');
      return `
        <div style="display:flex; align-items:center; gap:10px; padding:10px 0; border-bottom:0.5px solid var(--border-tertiary);">
          <i class="ti ${icon}" style="font-size:18px; color:${color}; flex-shrink:0;"></i>
          <div style="flex:1; min-width:0;">
            <p style="margin:0; font-size:13px; line-height:1.3;">${desc}</p>
            <p style="margin:2px 0 0; font-size:11px; color:var(--text-tertiary);">${timeAgo(a.timestamp)}</p>
          </div>
        </div>
      `;
    }).join('') : `<p style="text-align:center; color:var(--text-tertiary); font-size:13px; padding:16px 0;">Share or claim deals to see activity here.</p>`;

    root.innerHTML = `
      <div class="stat-grid-compact" style="grid-template-columns: repeat(3, 1fr);">
        <div class="stat-card compact"><p class="stat-label">Points</p><p class="stat-value">${rewards.points}</p></div>
        <div class="stat-card compact"><p class="stat-label">Shared</p><p class="stat-value">${rewards.shared}</p></div>
        <div class="stat-card compact"><p class="stat-label">Claimed</p><p class="stat-value">${rewards.claimed}</p></div>
      </div>

      <p class="section-title"><i class="ti ti-share"></i>Your shared deals</p>
      ${myShared.length ? myShared.map(d => `
        <div class="card" style="display:flex; justify-content:space-between; align-items:center; gap: 10px;">
          <div style="min-width:0;">
            <p style="margin:0; font-weight:500; font-size:14px;">${escapeHtml(d.merchant)} — ${escapeHtml(d.discount)}</p>
            <p style="margin:2px 0 0; font-size:12px; color: var(--text-secondary);">Expires ${fmtDate(d.expiry)}${d.shareCount > 1 ? ` · shared ${d.shareCount}x` : ''}</p>
          </div>
          <button data-reshare="${d.id}" style="font-size:12px; padding:6px 10px;">
            <i class="ti ti-share" style="font-size:13px; vertical-align:-1px; margin-right:2px;"></i>Again
          </button>
        </div>
      `).join('') : `<div class="empty" style="padding: 20px;"><i class="ti ti-share"></i>No shared deals yet. Share from your deal cards!</div>`}

      <p class="section-title"><i class="ti ti-activity"></i>Activity</p>
      <div class="card" style="padding: 4px 14px;">
        ${activityHtml}
      </div>

      <p class="section-title"><i class="ti ti-flame"></i>Trending in community</p>
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
        openModalPrefilled({ merchant:m, discount:d, category:c, source:'Community / trending', value: 10, expiry: t.toISOString().slice(0,10), notes:'From community', url: inferUrl(m) });
      });
    });
    root.querySelectorAll('[data-reshare]').forEach(b=>{
      b.addEventListener('click', () => shareDeal(b.getAttribute('data-reshare')));
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
    cancelExpiryReminders(id);
    if (d.shared) { rewards.points += 25; rewards.claimed += 1; save(KEYS.rewards, rewards); }
    bumpQuest('q_redeem');
    save(KEYS.deals, deals);
    showToast(`Redeemed — saved $${Math.round(Number(d.value)||0)}`);
    renderAll();
  }
  async function shareDeal(id) {
    const d = deals.find(x=>x.id===id); if (!d) return;

    // Build a shareable deep link with encoded deal data
    const sharePayload = {
      m: d.merchant,
      d: d.discount,
      v: d.value || 0,
      c: d.category,
      code: d.code || '',
      exp: d.expiry || '',
      url: d.url || '',
      by: (profile && profile.name) || 'A Perq user'
    };
    const encoded = btoa(JSON.stringify(sharePayload)).replace(/=/g, '');
    const baseUrl = location.origin + location.pathname;
    const shareLink = `${baseUrl}?claim=${encoded}`;

    const text = `🎟️ ${d.merchant}: ${d.discount}${d.code ? ` (code: ${d.code})` : ''}${d.expiry ? ` — expires ${fmtDate(d.expiry)}` : ''}\n\nClaim this deal on Perq: ${shareLink}`;

    const NativeShare = nativePlugin('Share');
    if (NativeShare && NativeShare.share) {
      try {
        await NativeShare.share({ title: `Perq deal: ${d.merchant}`, text, url: shareLink, dialogTitle: 'Share deal' });
      } catch(e) { return; }
    } else if (navigator.share) {
      try {
        await navigator.share({ title: `Perq deal: ${d.merchant}`, text, url: shareLink });
      } catch(e) { return; }
    } else {
      try { await navigator.clipboard.writeText(text); }
      catch(e) {}
    }
    d.shared = true;
    d.shareCount = (d.shareCount || 0) + 1;
    rewards.shared += 1; rewards.points += 10;
    bumpQuest('q_share');

    // Log to activity feed
    addActivity('share', { merchant: d.merchant, discount: d.discount, dealId: d.id });

    save(KEYS.deals, deals); save(KEYS.rewards, rewards);
    showToast('Shared (+10 pts)');
    renderAll();
  }

  // ---------- Social: Claim shared deals ----------
  function handleIncomingClaim(params) {
    const claimData = params.get('claim');
    if (!claimData) return false;
    try {
      const padded = claimData + '='.repeat((4 - claimData.length % 4) % 4);
      const payload = JSON.parse(atob(padded));
      if (!payload.m) return false;
      showClaimSharedDeal(payload);
      return true;
    } catch(e) {
      return false;
    }
  }

  function showClaimSharedDeal(payload) {
    const expiryLabel = payload.exp ? `Expires ${fmtDate(payload.exp)}` : 'No expiry date';
    const overlay = document.getElementById('modal-claim-shared');
    overlay.innerHTML = `
      <div class="modal center-modal" style="text-align:center; padding:28px 20px;">
        <div style="font-size:40px; margin-bottom:12px;">🎟️</div>
        <h2 style="font-size:20px; font-weight:600; margin:0 0 4px;">${escapeHtml(payload.m)}</h2>
        <p style="font-size:16px; color:var(--text-secondary); margin:0 0 12px;">${escapeHtml(payload.d)}</p>
        <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:16px;">
          <span class="pill" style="background:var(--bg-info); color:var(--text-info);">${escapeHtml(payload.c || 'Deal')}</span>
          <span class="pill" style="background:var(--bg-warning); color:var(--text-warning);">${expiryLabel}</span>
        </div>
        ${payload.code ? `<p style="font-family:ui-monospace,monospace; font-size:18px; letter-spacing:2px; background:var(--bg-secondary); padding:10px; border-radius:8px; margin:0 0 12px;">${escapeHtml(payload.code)}</p>` : ''}
        <p style="font-size:13px; color:var(--text-tertiary); margin:0 0 20px;">Shared by ${escapeHtml(payload.by)}</p>
        <div style="display:flex; gap:8px;">
          <button style="flex:1; padding:14px; background:var(--text-primary); color:var(--bg-primary); border:none; border-radius:10px; font-weight:600; font-size:15px;" id="claim-shared-accept">
            <i class="ti ti-check" style="margin-right:4px;"></i> Claim deal
          </button>
          <button style="flex:0 0 auto; padding:14px 20px; border-radius:10px;" id="claim-shared-dismiss">Not now</button>
        </div>
      </div>
    `;
    overlay.classList.add('active');

    document.getElementById('claim-shared-accept').addEventListener('click', () => {
      const t = new Date(); t.setDate(t.getDate() + 14);
      const newDeal = {
        id: uid(),
        merchant: payload.m,
        discount: payload.d,
        value: payload.v || estimateValue(payload.d),
        category: payload.c || 'Other',
        source: 'Shared by ' + (payload.by || 'friend'),
        code: payload.code || '',
        barcode: '',
        expiry: payload.exp || t.toISOString().slice(0, 10),
        notes: 'Claimed from a shared link',
        url: payload.url || inferUrl(payload.m),
        redeemed: false,
        shared: false,
        createdAt: Date.now()
      };
      deals.push(newDeal);
      scheduleExpiryReminders(newDeal);
      rewards.claimed += 1;
      rewards.points += 5;
      save(KEYS.deals, deals);
      save(KEYS.rewards, rewards);
      addActivity('claim', { merchant: payload.m, discount: payload.d, from: payload.by });
      overlay.classList.remove('active');
      showToast('🎉 Deal claimed (+5 pts)');
      switchTab('deals');
      renderAll();
    });

    document.getElementById('claim-shared-dismiss').addEventListener('click', () => {
      overlay.classList.remove('active');
    });
  }

  // ---------- Social: Activity Feed ----------
  const KEYS_ACTIVITY = STORAGE_PREFIX + 'activity';

  function loadActivity() {
    return load(KEYS_ACTIVITY, []);
  }

  function addActivity(type, data) {
    const feed = loadActivity();
    feed.unshift({
      id: uid(),
      type,
      data,
      timestamp: Date.now(),
      user: (profile && profile.name) || 'You'
    });
    // Keep last 50 entries
    if (feed.length > 50) feed.length = 50;
    save(KEYS_ACTIVITY, feed);
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
  function deleteDeal(id) {
    if (!confirm('Delete this deal?')) return;
    cancelExpiryReminders(id);
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
      cancelExpiryReminders(editingId);
      scheduleExpiryReminders(d);
    } else {
      const newDeal = { id: uid(), ...payload, redeemed:false, shared:false, createdAt: Date.now() };
      if (pendingImage) newDeal.image = pendingImage;
      deals.push(newDeal);
      scheduleExpiryReminders(newDeal);
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
    document.getElementById('s-api-key').value = load(KEYS.apiKey, '');
    document.getElementById('s-reminders-on').checked = !!settings.remindersOn;
    document.getElementById('s-reminder-days').value = String(settings.reminderDays);
    document.getElementById('s-nearby-on').checked = !!settings.nearbyOn;
    document.getElementById('s-nearby-radius').value = String(settings.nearbyRadius);
    if (emailConnection.provider) setField('email-provider', emailConnection.provider);
    renderProfileSummary();
    updateNotifButton();
    document.getElementById('modal-settings').classList.add('active');
  }
  function closeSettings() { document.getElementById('modal-settings').classList.remove('active'); }
  function saveSettings() {
    const key = document.getElementById('s-api-key').value.trim();
    save(KEYS.apiKey, key);
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
    const keepKeys = new Set(storageKeyVariants('apiKey').concat(storageKeyVariants('installDismissed')));
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

    document.getElementById('btn-add').addEventListener('click', () => openModal(null));
    document.getElementById('btn-snap').addEventListener('click', async () => {
      const handledNative = await captureDealPhotoNative();
      if (!handledNative) document.getElementById('capture-input').click();
    });
    document.getElementById('btn-scan').addEventListener('click', openScanner);
    document.getElementById('scanner-close').addEventListener('click', closeScanner);
    document.getElementById('scanner-use-code').addEventListener('click', useScannerCode);
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
    if (!validProfile(profile)) showProfileScreen();

    // Handle deep links from manifest shortcuts
    try {
      const action = params.get('action');
      // Check for incoming claim link first
      const claimHandled = handleIncomingClaim(params);
      if (!claimHandled) {
        const sharedPayload = parseIncomingShare(params);
        if (sharedPayload) {
          setTimeout(() => openModalPrefilled(sharedPayload), 900);
        } else if (action === 'snap') {
          setTimeout(() => document.getElementById('capture-input').click(), 1000);
        } else if (action === 'add') {
          setTimeout(() => openModal(null), 1000);
        }
      }
    } catch(e) {}

    // Run reminder check on load and every time the app comes back to foreground
    checkAndSendReminders();
    scheduleAllDealReminders();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        refreshDailyQuests();
        const r = autoGrantDailySpin();
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
    setTimeout(hideSplash, 500);

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

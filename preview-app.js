/* Perq MVP — Ground-zero working app v0.2 */
(function(){
'use strict';

const KEY='perq-mvp:';
const K={
  profile:KEY+'profile',deals:KEY+'deals',programs:KEY+'programs',loyalty:KEY+'loyalty',
  rewards:KEY+'rewards',settings:KEY+'settings',onboarded:KEY+'onboarded'
};

const TIERS=[
  {name:'BRONZE',min:0,emoji:'🥉',colors:['#A07248','#8B5A2B'],next:100},
  {name:'SILVER',min:100,emoji:'🥈',colors:['#9CA3AF','#6B7280'],next:300},
  {name:'GOLD',min:300,emoji:'🥇',colors:['#FFD700','#FFA500'],next:750},
  {name:'PLATINUM',min:750,emoji:'💎',colors:['#6366F1','#3B82F6'],next:Infinity}
];
const CATEGORIES=['Groceries','Dining','Apparel','Travel','Beauty','Home','Electronics','Other'];

let state={
  profile:load(K.profile,null),
  deals:load(K.deals,[]),
  programs:load(K.programs,[]),
  loyalty:load(K.loyalty,[]),
  rewards:load(K.rewards,{points:0,spins:0,streak:0,saved:0,lastClaim:null,missions:{date:null,done:{}},lastSeenTier:'BRONZE',unlocksSeen:[]}),
  settings:load(K.settings,{reminders:true,proximity:true,social:false,reminderDays:2,proximityMiles:1}),
  selectedPrefs:[]
};

let onboardStep=1;
let pendingDealImage=null;
let walletFilter='all';
let currentBrowseTab='local';

// Migration: ensure new gamification fields exist on reward state for returning users
(function migrateRewards(){
  const r=state.rewards||{};
  if(!r.missions)r.missions={date:null,done:{}};
  if(!r.lastSeenTier)r.lastSeenTier=getTierForPoints(r.points||0).name;
  if(!Array.isArray(r.unlocksSeen))r.unlocksSeen=[];
  if(!r.lastSundaySpin)r.lastSundaySpin=null;
  state.rewards=r;
  save(K.rewards,state.rewards);
})();

// Migration: ensure new settings fields for reminder days + proximity radius
(function migrateSettings(){
  const s=state.settings||{};
  if(s.reminderDays===undefined)s.reminderDays=2;
  if(s.proximityMiles===undefined)s.proximityMiles=2;
  state.settings=s;
  save(K.settings,state.settings);
})();

// Migration: every profile gets a referralCode + referral counter
(function migrateProfile(){
  const p=state.profile;
  if(!p)return;
  let dirty=false;
  if(!p.referralCode){p.referralCode=genReferralCode(p.name);dirty=true;}
  if(typeof p.referralCount!=='number'){p.referralCount=0;dirty=true;}
  if(dirty){state.profile=p;save(K.profile,state.profile);}
})();

// Capture inbound ?ref= on first open. Stored locally — true cross-device
// crediting requires a backend (roadmap v2). For now we award the new user a
// small welcome bonus and persist the referrer code so we can backfill later.
(function captureIncomingReferral(){
  try{
    const params=new URLSearchParams(location.search||'');
    const ref=params.get('ref');
    if(ref){
      const existing=load('perq-mvp:referredBy',null);
      if(!existing){
        save('perq-mvp:referredBy',ref);
        state.rewards.points=(state.rewards.points||0)+10;
        save(K.rewards,state.rewards);
        setTimeout(()=>toast('🎁 Welcome via '+ref+' · +10 pts'),1500);
      }
    }
  }catch(e){}
})();

// Sunday bonus spin perk — runs once per Sunday for users with the double_spin unlock
(function grantSundayBonus(){
  if(!(state.rewards.unlocksSeen||[]).includes('double_spin'))return;
  const now=new Date();
  if(now.getDay()!==0)return; // 0 = Sunday
  const today=todayStr();
  if(state.rewards.lastSundaySpin===today)return;
  state.rewards.spins=(state.rewards.spins||0)+1;
  state.rewards.lastSundaySpin=today;
  save(K.rewards,state.rewards);
  setTimeout(()=>toast('☀️ Sunday bonus: +1 spin'),1500);
})();

function load(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function uid(){return 'd'+Math.random().toString(36).slice(2,9);}
function todayStr(){const d=new Date();d.setHours(0,0,0,0);return d.toISOString().slice(0,10);}
function fmtDate(s){if(!s)return '—';return new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function daysUntil(s){if(!s)return null;return Math.round((new Date(s).getTime()-new Date(todayStr()).getTime())/86400000);}
function escapeHtml(s){if(s==null)return '';return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// Block adding a duplicate of an existing non-redeemed wallet deal.
// Spec: feature-deal-dedupe AC #1, #5, #9.
//
// Match rule: a candidate is a duplicate of an existing wallet entry
// when ALL of these hold:
//   - merchant matches (case-insensitive + trimmed)
//   - discount string matches exactly (already normalized to "$X off"
//     or "X% off" by saveDealForm)
//   - expiry matches exactly (both empty counts as match)
//   - code matches exactly (null/undefined/'' all normalize to '')
// Redeemed deals are skipped — re-saving a deal you already used is
// intentional (AC #4). Returns the matching deal or null.
window.findDuplicateDeal=function(candidate){
  if(!candidate||!candidate.merchant)return null;
  var cm=String(candidate.merchant||'').toLowerCase().trim();
  var cd=String(candidate.discount||'');
  var ce=String(candidate.expiry||'');
  var cc=String(candidate.code||'').trim();
  return state.deals.find(function(d){
    if(d.redeemed)return false;
    var dm=String(d.merchant||'').toLowerCase().trim();
    var dd=String(d.discount||'');
    var de=String(d.expiry||'');
    var dc=String(d.code||'').trim();
    return dm===cm&&dd===cd&&de===ce&&dc===cc;
  })||null;
};

// -------- Referral + sharing infrastructure --------
const PERQ_PUBLIC_URL='https://cric85-git.github.io/deal-with-deals/preview.html';

function genReferralCode(name){
  const seed=(name||'PERQ').toUpperCase().replace(/[^A-Z]/g,'').slice(0,3)||'PRQ';
  const rand=Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4)||'X1Y2';
  return seed+rand;
}

function getReferralLink(){
  const code=state.profile&&state.profile.referralCode;
  return PERQ_PUBLIC_URL+(code?'?ref='+encodeURIComponent(code):'');
}

// Build a clean, shareable text for a deal — uses merchant URL when present,
// always appends the user's Perq referral link so recipients can install + earn.
function buildShareText(d){
  const lines=[];
  lines.push(d.merchant+': '+d.discount);
  if(d.code)lines.push('Code: '+d.code);
  if(d.expiry)lines.push('Expires '+fmtDate(d.expiry));
  if(d.url)lines.push('🛒 '+d.url);
  lines.push('');
  lines.push('🎟️ Saved with Perq — get the app: '+getReferralLink());
  return lines.join('\n');
}

// Build an SMS / WhatsApp / Email URL safely. We deliberately use only a `body=`
// parameter (no second URL) so SMS clients don't render the WebView's
// capacitor://localhost as a broken link.
function buildSmsHref(text){return 'sms:?&body='+encodeURIComponent(text);}
function buildWhatsAppHref(text){return 'https://wa.me/?text='+encodeURIComponent(text);}
function buildMailtoHref(subject,text){return 'mailto:?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(text);}
function getGradient(cat){
  const map={Groceries:'green',Dining:'warm',Apparel:'pink',Travel:'purple',Beauty:'pink',Home:'warm',Electronics:'purple',Other:'green'};
  return map[cat]||'warm';
}

// -------- Merchant Brands --------
// Real brand colors for known merchants. Used everywhere a deal card is rendered.
// For unknown merchants we fall back to PERQ_GENERIC_BRAND (mint/emerald).
// Always paired with a subtle white outline + drop shadow on dark backgrounds
// so the card never blends into the navy app bg, even for darker brand colors.
const MERCHANT_BRANDS={
  // Coffee & dining
  'starbucks':       {bg:'#00754A',bg2:'#1E3932',text:'#FFFFFF',accent:'#D4E9E2',mono:'★'},
  'panera':          {bg:'#007936',bg2:'#005D29',text:'#FFFFFF',accent:'#FFD200',mono:'P'},
  'panera bread':    {bg:'#007936',bg2:'#005D29',text:'#FFFFFF',accent:'#FFD200',mono:'P'},
  'chipotle':        {bg:'#A81612',bg2:'#7A0D0A',text:'#FAF3E0',accent:'#FAF3E0',mono:'C'},
  'mcdonalds':       {bg:'#FFC72C',bg2:'#DA291C',text:'#1A1A1A',accent:'#1A1A1A',mono:'M'},
  'mcdonald\'s':     {bg:'#FFC72C',bg2:'#DA291C',text:'#1A1A1A',accent:'#1A1A1A',mono:'M'},
  'dunkin':          {bg:'#FF671F',bg2:'#DA1884',text:'#1A1A1A',accent:'#FFFFFF',mono:'D'},
  'subway':          {bg:'#008C15',bg2:'#FFC600',text:'#FFFFFF',accent:'#FFC600',mono:'S'},
  // Grocery
  'trader joe\'s':   {bg:'#C8102E',bg2:'#9A0E22',text:'#FFFFFF',accent:'#FFEB7A',mono:'TJ'},
  'trader joes':     {bg:'#C8102E',bg2:'#9A0E22',text:'#FFFFFF',accent:'#FFEB7A',mono:'TJ'},
  'whole foods':     {bg:'#1DAB47',bg2:'#095728',text:'#FFFFFF',accent:'#FFFFFF',mono:'WF'},
  'kroger':          {bg:'#004D9E',bg2:'#002F66',text:'#FFFFFF',accent:'#FFFFFF',mono:'K'},
  'safeway':         {bg:'#E1251B',bg2:'#9C1812',text:'#FFFFFF',accent:'#FFFFFF',mono:'S'},
  'aldi':            {bg:'#00549A',bg2:'#003366',text:'#FFFFFF',accent:'#FFB600',mono:'A'},
  'costco':          {bg:'#E31837',bg2:'#B30E27',text:'#FFFFFF',accent:'#0060AC',mono:'C'},
  'costco online':   {bg:'#E31837',bg2:'#B30E27',text:'#FFFFFF',accent:'#0060AC',mono:'C'},
  // Big box / general
  'target':          {bg:'#CC0000',bg2:'#990000',text:'#FFFFFF',accent:'#FFFFFF',mono:'⊙'},
  'target circle':   {bg:'#CC0000',bg2:'#990000',text:'#FFFFFF',accent:'#FFFFFF',mono:'⊙'},
  'walmart':         {bg:'#0071CE',bg2:'#004F8C',text:'#FFC220',accent:'#FFC220',mono:'W'},
  'amazon':          {bg:'#FF9900',bg2:'#CC7A00',text:'#232F3E',accent:'#232F3E',mono:'a'},
  'amazon prime':    {bg:'#0F1111',bg2:'#232F3E',text:'#FF9900',accent:'#00A8E1',mono:'P'},
  // Drugstore
  'cvs':             {bg:'#CC0000',bg2:'#A30000',text:'#FFFFFF',accent:'#FFFFFF',mono:'CVS'},
  'cvs extracare':   {bg:'#CC0000',bg2:'#A30000',text:'#FFFFFF',accent:'#FFFFFF',mono:'CVS'},
  'walgreens':       {bg:'#E11B22',bg2:'#9A1117',text:'#FFFFFF',accent:'#FFFFFF',mono:'W'},
  'rite aid':        {bg:'#0046A8',bg2:'#002F73',text:'#FFFFFF',accent:'#E91E26',mono:'R'},
  // Beauty
  'sephora':                 {bg:'#1A1A1A',bg2:'#000000',text:'#FFFFFF',accent:'#FF0048',mono:'S'},
  'sephora beauty insider':  {bg:'#1A1A1A',bg2:'#000000',text:'#FFFFFF',accent:'#FF0048',mono:'S'},
  'sephora online':          {bg:'#1A1A1A',bg2:'#000000',text:'#FFFFFF',accent:'#FF0048',mono:'S'},
  'ulta':            {bg:'#3B0F4D',bg2:'#1F0828',text:'#FFFFFF',accent:'#FFFFFF',mono:'U'},
  // Apparel
  'nike':            {bg:'#1A1A1A',bg2:'#0A0A0A',text:'#FFFFFF',accent:'#FFFFFF',mono:'✓'},
  'old navy':        {bg:'#0257B8',bg2:'#003B7A',text:'#FFFFFF',accent:'#FF8800',mono:'ON'},
  'gap':             {bg:'#002B5C',bg2:'#001A38',text:'#FFFFFF',accent:'#FFFFFF',mono:'G'},
  'lululemon':       {bg:'#D12631',bg2:'#A21D26',text:'#FFFFFF',accent:'#FFFFFF',mono:'LL'},
  'h&m':             {bg:'#E50010',bg2:'#A50009',text:'#FFFFFF',accent:'#FFFFFF',mono:'H'},
  // Electronics
  'best buy':        {bg:'#0046BE',bg2:'#003494',text:'#FFFFFF',accent:'#FFD52A',mono:'BB'},
  'apple':                   {bg:'#1A1A1A',bg2:'#0A0A0A',text:'#FFFFFF',accent:'#FFFFFF',mono:''},
  'apple watch trade-in':    {bg:'#1A1A1A',bg2:'#0A0A0A',text:'#FFFFFF',accent:'#FFFFFF',mono:''},
  // Travel & Hotels
  'marriott':        {bg:'#1A5380',bg2:'#003E5F',text:'#FFFFFF',accent:'#A0855B',mono:'M'},
  'marriott bonvoy': {bg:'#1A5380',bg2:'#003E5F',text:'#FFFFFF',accent:'#A0855B',mono:'M'},
  'hilton':          {bg:'#104C97',bg2:'#0A3973',text:'#FFFFFF',accent:'#FFFFFF',mono:'H'},
  'hilton honors':   {bg:'#104C97',bg2:'#0A3973',text:'#FFFFFF',accent:'#FFFFFF',mono:'H'},
  // Food delivery
  'uber eats':       {bg:'#06C167',bg2:'#057E48',text:'#000000',accent:'#000000',mono:'U'},
  'doordash':        {bg:'#FF3008',bg2:'#C92500',text:'#FFFFFF',accent:'#FFFFFF',mono:'D'},
  'doordash dashpass': {bg:'#FF3008',bg2:'#C92500',text:'#FFFFFF',accent:'#FFFFFF',mono:'D'},
  'grubhub':         {bg:'#F1502F',bg2:'#C13E22',text:'#FFFFFF',accent:'#FFFFFF',mono:'G'},
  // Subscriptions / streaming
  'spotify':         {bg:'#1DB954',bg2:'#118C40',text:'#000000',accent:'#000000',mono:'S'},
  'spotify premium': {bg:'#1DB954',bg2:'#118C40',text:'#000000',accent:'#000000',mono:'S'},
  'youtube':         {bg:'#FF0000',bg2:'#CC0000',text:'#FFFFFF',accent:'#FFFFFF',mono:'▶'},
  'youtube premium': {bg:'#FF0000',bg2:'#CC0000',text:'#FFFFFF',accent:'#FFFFFF',mono:'▶'},
  'netflix':         {bg:'#E50914',bg2:'#831010',text:'#FFFFFF',accent:'#FFFFFF',mono:'N'},
  'disney+':         {bg:'#113CCF',bg2:'#0A2585',text:'#FFFFFF',accent:'#FFFFFF',mono:'D+'},
  'disney plus':     {bg:'#113CCF',bg2:'#0A2585',text:'#FFFFFF',accent:'#FFFFFF',mono:'D+'}
};
// Generic Perq theme for unknown merchants — bright mint to emerald.
// High contrast vs navy app background so cards never blend in.
const PERQ_GENERIC_BRAND={bg:'#059669',bg2:'#047857',text:'#FFFFFF',accent:'#A7F3D0',mono:'P'};

function getBrandFor(merchant){
  if(!merchant)return PERQ_GENERIC_BRAND;
  const key=String(merchant).toLowerCase().trim();
  if(MERCHANT_BRANDS[key])return MERCHANT_BRANDS[key];
  // Fuzzy: longest matching merchant key wins (e.g. "Sephora online" -> "sephora online")
  let best=null,bestLen=0;
  for(const k in MERCHANT_BRANDS){
    if((key.includes(k)||k.includes(key))&&k.length>bestLen){best=k;bestLen=k.length;}
  }
  if(best)return MERCHANT_BRANDS[best];
  return PERQ_GENERIC_BRAND;
}

function brandGradientCss(brand){
  return 'linear-gradient(135deg,'+brand.bg+','+brand.bg2+')';
}
// Card framing on dark navy bg — subtle white outline so brand colors never
// blend into the page background, plus depth shadow.
function brandCardShadow(){
  return '0 0 0 1px rgba(255,255,255,0.12),0 8px 24px rgba(0,0,0,0.4)';
}
function getGradStyle(g){
  return {warm:'linear-gradient(135deg,#FF6B6B,#FFA06B)',green:'linear-gradient(135deg,#00C9A7,#4FACFE)',purple:'linear-gradient(135deg,#6366F1,#C084FC)',pink:'linear-gradient(135deg,#F472B6,#FB923C)',yellow:'linear-gradient(135deg,#FFD700,#FFA500)'}[g]||'linear-gradient(135deg,#FF6B6B,#FFA06B)';
}
function futureDate(days){const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}

function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>t.classList.remove('show'),2400);
}

// -------- Onboarding --------
window.nextStep=function(){
  if(onboardStep===2){
    const name=document.getElementById('ob-name').value.trim();
    if(!name){toast('Enter your name or skip');return;}
    state.profile={name,createdAt:Date.now(),preferences:[],referralCode:genReferralCode(name),referralCount:0};
    save(K.profile,state.profile);
  }
  if(onboardStep===3){
    // Capture preferences before moving to install step
    if(state.selectedPrefs.length>0&&state.profile){
      state.profile.preferences=state.selectedPrefs;
      save(K.profile,state.profile);
    }
    // If running as a native app, the install step is meaningless — finish onboarding now.
    if(window.PerqNative&&window.PerqNative.isNative){
      finishOnboarding();
      return;
    }
  }
  onboardStep++;
  document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('active'));
  const target=document.querySelector('.ob-step[data-step="'+onboardStep+'"]');
  if(target)target.classList.add('active');
  document.querySelectorAll('.ob-dot').forEach((d,i)=>{d.classList.toggle('active',(i+1)<=onboardStep);});
  if(onboardStep===4)renderInstallInstructions();
};

function detectPlatform(){
  const ua=navigator.userAgent||'';
  const standalone=window.matchMedia&&window.matchMedia('(display-mode:standalone)').matches||window.navigator.standalone;
  if(standalone)return 'installed';
  if(/iPhone|iPad|iPod/.test(ua)){
    return /CriOS|FxiOS|EdgiOS/.test(ua)?'ios-other':'ios-safari';
  }
  if(/Android/.test(ua))return 'android';
  return 'desktop';
}

function renderInstallInstructions(){
  const el=document.getElementById('install-instructions');
  const sub=document.getElementById('install-platform-sub');
  if(!el)return;
  const platform=detectPlatform();
  // iOS Safari share icon (square with up arrow)
  const shareIcon='<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:#0A84FF;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
  const plusIcon='<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:#1A1A1A;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>';
  const dotsIcon='<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:none;stroke:#1A1A1A;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>';

  function step(num,iconHtml,text){
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'+
      '<div style="width:28px;height:28px;border-radius:50%;background:#1A1A1A;color:#FFE16B;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">'+num+'</div>'+
      iconHtml+
      '<p style="font-size:13px;margin:0;line-height:1.4;flex:1">'+text+'</p>'+
    '</div>';
  }

  if(platform==='ios-safari'){
    sub.textContent='On iPhone — takes 5 seconds. Run Perq full-screen like a real app.';
    el.innerHTML=
      step(1,shareIcon,'Tap the <strong>Share</strong> icon in Safari\'s bottom bar')+
      step(2,plusIcon,'Scroll down and tap <strong>Add to Home Screen</strong>')+
      '<div style="display:flex;align-items:center;gap:12px;padding:10px 0"><div style="width:28px;height:28px;border-radius:50%;background:#1A1A1A;color:#FFE16B;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">3</div><img src="icon-192.png" alt="Perq" style="width:24px;height:24px;border-radius:6px;flex-shrink:0"><p style="font-size:13px;margin:0;line-height:1.4;flex:1">Tap <strong>Add</strong> — Perq lives on your home screen</p></div>';
  } else if(platform==='ios-other'){
    sub.textContent='Switch to Safari to install Perq on your home screen.';
    el.innerHTML=
      '<div style="padding:10px 0;border-bottom:1px solid var(--border)"><p style="font-size:13px;margin:0;line-height:1.4">iOS only allows installing web apps from <strong>Safari</strong>.</p></div>'+
      step(1,shareIcon,'Open <strong>app.perq.app</strong> in Safari (not Chrome/Firefox)')+
      step(2,plusIcon,'Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>');
  } else if(platform==='android'){
    sub.textContent='On Android — takes 5 seconds. Run Perq like a real app.';
    el.innerHTML=
      step(1,dotsIcon,'Tap the <strong>⋮ menu</strong> in Chrome\'s top-right')+
      step(2,plusIcon,'Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>')+
      '<div style="display:flex;align-items:center;gap:12px;padding:10px 0"><div style="width:28px;height:28px;border-radius:50%;background:#1A1A1A;color:#FFE16B;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">3</div><img src="icon-192.png" alt="Perq" style="width:24px;height:24px;border-radius:6px;flex-shrink:0"><p style="font-size:13px;margin:0;line-height:1.4;flex:1">Confirm <strong>Install</strong> — Perq joins your app drawer</p></div>';
  } else if(platform==='installed'){
    sub.textContent='You\'re all set!';
    el.innerHTML='<div style="text-align:center;padding:12px"><p style="font-size:32px;margin:0">✅</p><p style="font-size:14px;font-weight:700;margin:8px 0 4px">Perq is already installed</p><p style="font-size:12px;color:var(--text-dim);margin:0">You\'re running in app mode.</p></div>';
  } else {
    sub.textContent='Open Perq on your phone to install it as an app.';
    el.innerHTML='<div style="text-align:center;padding:12px"><p style="font-size:32px;margin:0">📱</p><p style="font-size:14px;font-weight:700;margin:8px 0 4px">Install on mobile</p><p style="font-size:12px;color:var(--text-dim);margin:0;line-height:1.5">Open this URL on your iPhone (Safari) or Android phone (Chrome) to add it to your home screen.</p></div>';
  }
}

window.finishOnboarding=function(){
  if(state.selectedPrefs.length>0&&state.profile){
    state.profile.preferences=state.selectedPrefs;
    save(K.profile,state.profile);
  }
  if(!state.profile){
    state.profile={name:'You',createdAt:Date.now(),preferences:state.selectedPrefs,referralCode:genReferralCode('You'),referralCount:0};
    save(K.profile,state.profile);
  }
  save(K.onboarded,true);
  document.getElementById('onboarding').classList.add('hidden');
  renderAll();
};

function checkOnboarding(){
  const onboarded=load(K.onboarded,false);
  document.getElementById('onboarding').classList.toggle('hidden',onboarded);
  // On native, hide the install-instructions step + its progress dot — irrelevant.
  if(window.PerqNative&&window.PerqNative.isNative){
    const installStep=document.querySelector('.ob-step[data-step="4"]');
    if(installStep)installStep.style.display='none';
    document.querySelectorAll('.ob-dot-install').forEach(d=>d.style.display='none');
    // Update step 3 button label to "Start using Perq" since it's now the final step
    const step3btn=document.querySelector('.ob-step[data-step="3"] .ob-btn:not(.secondary)');
    if(step3btn)step3btn.textContent='Start using Perq';
  }
}

document.querySelectorAll('.ob-pref').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const pref=btn.getAttribute('data-pref');
    btn.classList.toggle('active');
    if(state.selectedPrefs.includes(pref))state.selectedPrefs=state.selectedPrefs.filter(p=>p!==pref);
    else state.selectedPrefs.push(pref);
  });
});

// -------- Navigation --------
window.goPage=function(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const t=document.querySelector('.page[data-page="'+page+'"]');
  if(t){t.classList.add('active');t.scrollTop=0;}
  document.querySelectorAll('.tabbar-btn').forEach(b=>b.classList.remove('active'));
  const b=document.querySelector('.tabbar-btn[data-tab="'+page+'"]');
  if(b)b.classList.add('active');
  if(page==='wallet')renderWallet();
  if(page==='browse')renderBrowse();
  if(page==='rewards')renderRewards();
  if(page==='settings')renderSettings();
  if(page==='community')renderCommunity();
};

window.setWalletFilter=function(f){
  walletFilter=f;
  goPage('wallet');
  setTimeout(()=>{
    document.querySelectorAll('.wallet-tab').forEach(t=>t.classList.remove('active'));
    const a=document.querySelector('.wallet-tab[data-wfilter="'+f+'"]');
    if(a)a.classList.add('active');
    renderWallet();
  },50);
};

// -------- Home --------
// Home page removed — savings hero now lives at top of Wallet
function renderHome(){return;}
function _legacyHome(){
  const redeemedDeals=state.deals.filter(d=>d.redeemed);
  const totalRedeemed=redeemedDeals.reduce((s,d)=>s+(parseFloat(d.value)||0),0);
  const potentialFromActive=state.deals.filter(d=>!d.redeemed).reduce((s,d)=>s+(parseFloat(d.value)||0),0);

  const lblEl=document.getElementById('savings-label');
  const amtEl=document.getElementById('total-saved');
  if(redeemedDeals.length>0){
    lblEl.textContent='Total saved this year';
    amtEl.textContent='$'+totalRedeemed.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  } else {
    lblEl.textContent='Potential savings';
    amtEl.textContent='$'+potentialFromActive.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  }

  document.getElementById('streak-text').textContent=
    state.rewards.streak>0
      ?'+$'+totalRedeemed+' saved · '+state.rewards.streak+' day streak 🔥'
      :(state.deals.length>0?'Tap a deal and mark it redeemed to bank the savings':'Save your first deal to start a streak');

  // Deals
  const dealsSection=document.getElementById('deals-section');
  const active=state.deals.filter(d=>!d.redeemed);
  if(active.length===0){
    document.getElementById('see-all-deals').style.display='none';
    dealsSection.innerHTML='<div class="empty-state"><div class="empty-icon">🎟️</div><p class="empty-title">No deals yet</p><p class="empty-sub">Snap a coupon or upload a screenshot to add your first deal.</p><button class="empty-cta" onclick="openSnapSheet()"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Snap your first deal</button></div>';
  } else {
    document.getElementById('see-all-deals').style.display='inline-block';
    const expiring=active.filter(d=>{const du=daysUntil(d.expiry);return du!==null&&du>=0&&du<=7;});
    const showList=expiring.length?expiring:active.slice(0,3);
    let html='<div class="h-carousel">';
    showList.forEach(d=>{
      const grad=getGradient(d.category);
      const du=daysUntil(d.expiry);
      const pct=d.discount.match(/\$\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+%|FREE/i);
      const pctText=pct?pct[0].toUpperCase():d.discount.slice(0,8);
      const expiryText=du===null?'No expiry':du===0?'⏰ Today!':du===1?'⏰ Tomorrow':du<0?'Expired':'⏰ '+du+'d left';
      html+='<button class="h-deal" onclick="openDealCard(\''+d.id+'\')"><div class="h-hero gradient-'+grad+'"><span class="h-pct">'+escapeHtml(pctText)+'</span><span class="h-merch-overlay">'+escapeHtml(d.merchant)+'</span></div><div class="h-body"><p class="h-discount">'+escapeHtml(d.discount)+'</p><p class="h-expiry">'+expiryText+'</p><span class="h-cta">View</span></div></button>';
    });
    html+='</div>';
    dealsSection.innerHTML=html;
  }

  // Home no longer shows reward programs / loyalty cards inline
  // (entry only via center "+" button)
  document.getElementById('home-extras').innerHTML='';
}

window.openDealCard=function(id){
  walletFilter='deals';
  goPage('wallet');
  setTimeout(()=>{
    const el=document.querySelector('[data-deal-id="'+id+'"]');
    if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
  },200);
};

// -------- Wallet (unified — deals + programs + loyalty + savings hero) --------
function renderWallet(){
  // Savings hero (now lives at top of Wallet)
  const redeemedDeals=state.deals.filter(d=>d.redeemed);
  const totalRedeemed=redeemedDeals.reduce((s,d)=>s+(parseFloat(d.value)||0),0);
  const potentialFromActive=state.deals.filter(d=>!d.redeemed).reduce((s,d)=>s+(parseFloat(d.value)||0),0);
  const lblEl=document.getElementById('savings-label');
  const amtEl=document.getElementById('total-saved');
  const streakEl=document.getElementById('streak-text');
  if(lblEl&&amtEl){
    if(redeemedDeals.length>0){
      lblEl.textContent='Total saved this year';
      amtEl.textContent='$'+totalRedeemed.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
    } else {
      lblEl.textContent='Potential savings';
      amtEl.textContent='$'+potentialFromActive.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
    }
  }
  if(streakEl){
    streakEl.textContent=
      state.rewards.streak>0
        ?'+$'+totalRedeemed+' saved · '+state.rewards.streak+' day streak 🔥'
        :(state.deals.length>0?'Tap a deal and mark it redeemed to bank the savings':'Save your first deal to start a streak');
  }

  document.querySelectorAll('.wallet-tab').forEach(t=>t.classList.toggle('active',t.getAttribute('data-wfilter')===walletFilter));
  const c=document.getElementById('wallet-content');
  const dealsCount=state.deals.filter(d=>!d.redeemed).length;
  const totalCount=dealsCount+state.programs.length+state.loyalty.length;
  const subEl=document.getElementById('wallet-sub');
  if(subEl)subEl.textContent=totalCount===0?'Empty wallet':totalCount+' item'+(totalCount===1?'':'s')+' saved';

  let html='';
  if(walletFilter==='all'||walletFilter==='deals'){
    const active=state.deals.filter(d=>!d.redeemed);
    if(active.length>0){
      if(walletFilter==='all')html+='<p style="color:rgba(255,255,255,0.6);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:8px 0 12px">🎟️ Deals · '+active.length+'</p>';
      html+=renderDealsList(active);
    } else if(walletFilter==='deals'){
      html+=emptyWalletSection('🎟️','No deals yet','Snap a coupon to add your first deal','openSnapSheet');
    }
  }

  if(walletFilter==='all'||walletFilter==='programs'){
    if(state.programs.length>0){
      if(walletFilter==='all')html+='<p style="color:rgba(255,255,255,0.6);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:24px 0 12px">⭐ Reward programs · '+state.programs.length+'</p>';
      html+=renderProgramsList();
    } else if(walletFilter==='programs'){
      html+=emptyWalletSection('⭐','No reward programs','Track airline miles, hotel points, credit card rewards','openAddProgram');
    }
  }

  if(walletFilter==='all'||walletFilter==='loyalty'){
    if(state.loyalty.length>0){
      if(walletFilter==='all')html+='<p style="color:rgba(255,255,255,0.6);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:24px 0 12px">💳 Loyalty cards · '+state.loyalty.length+'</p>';
      html+=renderLoyaltyList();
    } else if(walletFilter==='loyalty'){
      html+=emptyWalletSection('💳','No loyalty cards','Skip the physical cards at checkout','openAddLoyalty');
    }
  }

  if(walletFilter==='all'&&totalCount===0){
    html=emptyWalletSection('📭','Your wallet is empty','Snap a deal, add a card, or track points','openSnapSheet');
  }

  c.innerHTML=html;

  // Hook up wallet pass interactions
  document.querySelectorAll('.wpass').forEach(p=>{
    const bg=p.getAttribute('data-brand-bg')||'#10B981';
    const bg2=p.getAttribute('data-brand-bg2')||'#047857';
    p.style.background='linear-gradient(135deg,'+bg+','+bg2+')';
  });
}

function emptyWalletSection(emoji,title,sub,cta){
  const ctaHtml=cta?'<button class="empty-cta" onclick="'+cta+'()">+ Add</button>':'';
  return '<div style="background:white;border-radius:18px;padding:40px 24px;text-align:center;margin-top:14px"><div style="font-size:48px;opacity:0.4;margin-bottom:8px">'+emoji+'</div><p style="font-size:15px;font-weight:700;margin:0 0 4px;color:#1A1A1A">'+title+'</p><p style="font-size:12px;color:#777;margin:0 0 '+(cta?'16px':'0')+'">'+sub+'</p>'+ctaHtml+'</div>';
}

// -------- Community page (Shared by you + Pool from others) --------
function renderCommunity(){
  const c=document.getElementById('community-content');
  const sharedByMe=state.deals.filter(d=>d.shared);
  const pool=load('perq-mvp:communityPool',[]);
  const today=todayStr();
  const sharedByOthers=pool.filter(p=>{
    if(state.deals.find(d=>d.id===p.id))return false;
    if(!p.expiry)return true;
    return new Date(p.expiry)>=new Date(today);
  });

  let html='';

  // SECTION 1: Shared by you
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin:8px 0 12px"><p style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0">📤 Shared by you · '+sharedByMe.length+'</p>'+
    (sharedByMe.length>0?'<span style="color:rgba(255,225,107,0.9);font-size:11px;font-weight:700">'+sharedByMe.reduce((s,d)=>s+(d.claimCount||0),0)+' claims · '+sharedByMe.reduce((s,d)=>s+5+((d.claimCount||0)*5),0)+' pts earned</span>':'')+
  '</div>';
  if(sharedByMe.length>0){
    html+=renderSharedByMeList(sharedByMe);
  } else {
    html+='<div style="background:rgba(255,255,255,0.05);border:1px dashed rgba(255,255,255,0.2);border-radius:14px;padding:24px;text-align:center;margin-bottom:24px"><p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 4px">No deals shared yet</p><p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0">Open any deal in your Wallet → tap share icon → "Share to community pool"</p></div>';
  }

  // SECTION 2: Community pool from other users
  html+='<div style="display:flex;align-items:center;justify-content:space-between;margin:24px 0 12px"><p style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0">👥 Community deals · '+sharedByOthers.length+'</p>'+
    (sharedByOthers.length>0?'<span style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:600">Tap to claim</span>':'')+
  '</div>';
  if(sharedByOthers.length>0){
    html+=renderCommunityPoolList(sharedByOthers);
  } else {
    html+='<div style="background:rgba(255,255,255,0.05);border:1px dashed rgba(255,255,255,0.2);border-radius:14px;padding:24px;text-align:center"><p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 4px">No community deals yet</p><p style="color:rgba(255,255,255,0.4);font-size:11px;margin:0">When other Perq users share their deals,<br>they\'ll appear here for you to claim</p></div>';
  }

  c.innerHTML=html;
}

function renderDealsList(active){
  let html='';
  active.forEach((d,i)=>{
    const brand=getBrandFor(d.merchant);
    const bgCss=brandGradientCss(brand);
    const txt=brand.text;
    const du=daysUntil(d.expiry);
    const expText=du===null?'No expiry':du===0?'Expires TODAY':du===1?'Expires tomorrow':du<0?'Expired':'Expires in '+du+' days';
    // Compact expiry chip for the always-visible top of stacked cards.
    // Color-coded by urgency. Hidden entirely if no expiry. Spec: feature-deal-detail-modal-v2 AC2.
    let expChip='';
    if(du!==null){
      let chipBg,chipTxt;
      if(du<0){chipBg='rgba(220,38,38,0.95)';chipTxt='Expired';}
      else if(du===0){chipBg='rgba(220,38,38,0.95)';chipTxt='Today';}
      else if(du===1){chipBg='rgba(245,158,11,0.95)';chipTxt='Tomorrow';}
      else if(du<=3){chipBg='rgba(245,158,11,0.95)';chipTxt=du+'d left';}
      else{chipBg='rgba(255,255,255,0.25)';chipTxt=du+'d left';}
      expChip='<span style="background:'+chipBg+';color:white;padding:3px 8px;border-radius:6px;font-size:9px;font-weight:700;letter-spacing:0.5px;white-space:nowrap">⏱ '+chipTxt+'</span>';
    }
    const isLast=i===active.length-1;
    // Tap target opens the modal (the inline expand is now dead code, kept in DOM
    // for safety but no longer triggered). Spec: feature-deal-detail-modal-v2 AC1.
    html+='<div class="wpass" data-deal-id="'+d.id+'" onclick="viewWalletDeal(\''+d.id+'\')" data-brand-bg="'+brand.bg+'" data-brand-bg2="'+brand.bg2+'" data-brand-text="'+brand.text+'" style="border-radius:18px;padding:18px 20px;'+(isLast?'margin-bottom:14px':'margin-bottom:-90px')+';position:relative;box-shadow:'+brandCardShadow()+';color:'+txt+';background:'+bgCss+';cursor:pointer">';
    html+='<div class="pcoll" style="display:flex;flex-direction:column;gap:60px">';
    const sharedBadge=d.shared?'<span style="background:rgba(0,0,0,0.3);padding:3px 8px;border-radius:6px;font-size:9px;font-weight:700;letter-spacing:0.5px">SHARED</span>':'';
    const sourceBadge=d.source==='local'?'<span style="background:rgba(255,255,255,0.25);padding:3px 8px;border-radius:6px;font-size:9px;font-weight:700;letter-spacing:0.5px">📍 LOCAL DEAL</span>':d.source==='online'?'<span style="background:rgba(255,255,255,0.25);padding:3px 8px;border-radius:6px;font-size:9px;font-weight:700;letter-spacing:0.5px">🌐 ONLINE DEAL</span>':d.fromCommunity?'<span style="background:rgba(255,255,255,0.25);padding:3px 8px;border-radius:6px;font-size:9px;font-weight:700;letter-spacing:0.5px">👥 COMMUNITY</span>':'';
    const badges=[sharedBadge,sourceBadge,expChip].filter(b=>b).join(' ');
    // One-line offer summary under the merchant name — visible on every stacked card.
    // Truncated to 1 line via ellipsis so long discount strings don't break layout. Spec AC3.
    const offerLine=d.discount?'<p style="font-size:12px;font-weight:600;margin:3px 0 0;opacity:0.92;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(d.discount)+'</p>':'';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px"><div style="flex:1;min-width:0"><p style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.85;margin:0">'+escapeHtml(d.category||'Deal')+'</p><h3 style="font-size:16px;font-weight:700;margin:2px 0 0">'+escapeHtml(d.merchant)+'</h3>'+offerLine+'</div><div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;flex-shrink:0">'+badges+'</div></div>';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-end"><div><p style="font-size:22px;font-weight:800;margin:0">'+escapeHtml(d.discount)+'</p><p style="font-size:11px;opacity:0.9;margin:2px 0 0">'+expText+'</p></div>';
    if(d.code)html+='<span style="background:rgba(0,0,0,0.25);padding:4px 10px;border-radius:6px;font-family:ui-monospace,monospace;font-size:11px;font-weight:600">'+escapeHtml(d.code)+'</span>';
    html+='</div></div>';
    // Expanded
    html+='<div class="pexp" style="display:none">';
    html+='<div style="height:140px;padding:18px;display:flex;flex-direction:column;justify-content:space-between;margin:-18px -20px 0;background:'+bgCss+';color:'+txt+'">';
    html+='<span style="background:rgba(255,255,255,0.95);color:#1A1A1A;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;padding:5px 10px;border-radius:999px;align-self:flex-start">'+escapeHtml(d.category)+' · '+expText+'</span>';
    html+='<h2 style="font-size:32px;font-weight:900;margin:0;letter-spacing:-1px;line-height:1">'+escapeHtml(d.discount)+'</h2></div>';
    html+='<div style="padding:14px 18px 18px;background:white;color:#1A1A1A;margin:0 -20px -18px">';
    html+='<h3 style="font-size:18px;font-weight:800;margin:0">'+escapeHtml(d.merchant)+'</h3>';
    if(d.notes)html+='<p style="font-size:12px;color:#777;margin:4px 0 10px">'+escapeHtml(d.notes)+'</p>';
    if(d.address){
      const mapsUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(d.address);
      html+='<a href="'+escapeHtml(mapsUrl)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="background:#f5f5f5;border-radius:10px;padding:8px 10px;margin:8px 0 12px;display:flex;align-items:center;gap:8px;text-decoration:none;color:#1A1A1A"><svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:#4FACFE;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span style="flex:1;font-size:12px;font-weight:600;color:#1A1A1A">'+escapeHtml(d.address)+'</span><span style="font-size:10px;color:#4FACFE;font-weight:700">Directions</span></a>';
    }
    if(d.code){
      html+='<div style="background:white;border:1px solid rgba(0,0,0,0.08);border-radius:10px;padding:10px;text-align:center;margin-bottom:10px">';
      html+='<div style="height:40px;background-image:repeating-linear-gradient(90deg,#1A1A1A 0px,#1A1A1A 2px,transparent 2px,transparent 4px,#1A1A1A 4px,#1A1A1A 8px,transparent 8px,transparent 10px,#1A1A1A 10px,#1A1A1A 12px,transparent 12px,transparent 16px);margin-bottom:6px"></div>';
      html+='<p style="font-family:ui-monospace,monospace;font-size:13px;font-weight:700;letter-spacing:2px;margin:0">'+escapeHtml(d.code)+'</p></div>';
    }
    html+='<div style="display:flex;gap:6px">';
    html+='<button onclick="event.stopPropagation();redeemDeal(\''+d.id+'\')" style="flex:1;padding:11px;border-radius:10px;font-size:13px;font-weight:700;background:#1A1A1A;color:white;border:none">✓ Mark redeemed</button>';
    html+='<button onclick="event.stopPropagation();viewWalletDeal(\''+d.id+'\')" title="Details" style="flex:0 0 44px;padding:0;border-radius:10px;background:#F4F8F6;color:#1A1A1A;border:none;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>';
    html+='<button onclick="event.stopPropagation();shareDeal(\''+d.id+'\')" title="Share" style="flex:0 0 44px;padding:0;border-radius:10px;background:#F0F9FF;color:#2563EB;border:none;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>';
    html+='<button onclick="event.stopPropagation();deleteDeal(\''+d.id+'\')" title="Delete" style="flex:0 0 44px;padding:0;border-radius:10px;background:#FFE5E5;color:#DC2626;border:none;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg></button>';
    html+='</div>';
    html+='</div></div></div>';
  });
  return html;
}

function renderSharedByMeList(deals){
  return deals.map(d=>{
    const grad=getGradient(d.category);
    const du=daysUntil(d.expiry);
    const expText=du===null?'No expiry':du===0?'Expires today':du===1?'Expires tomorrow':du<0?'Expired':du+' days left';
    const claims=d.claimCount||0;
    const earned=5+claims*5;
    return '<div style="background:white;border-radius:18px;padding:14px 16px;margin-bottom:10px;box-shadow:0 4px 12px rgba(0,0,0,0.2)">'+
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">'+
        '<div class="gradient-'+grad+'" style="width:44px;height:44px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:14px;flex-shrink:0;text-align:center;line-height:1">'+escapeHtml((d.discount.match(/\$\d{1,3}(?:,\d{3})*|\d+%|FREE/i)||['?'])[0]).slice(0,5)+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<p style="font-size:14px;font-weight:700;margin:0;color:#1A1A1A">'+escapeHtml(d.merchant)+'</p>'+
          '<p style="font-size:11px;color:#777;margin:2px 0 0">'+escapeHtml(d.discount)+' · '+expText+'</p>'+
        '</div>'+
      '</div>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;background:#FAFAFA;border-radius:10px;padding:8px 12px">'+
        '<div style="display:flex;align-items:center;gap:14px">'+
          '<div><span style="font-size:18px;font-weight:800;color:#1A1A1A">'+claims+'</span><span style="font-size:11px;color:#777;margin-left:4px;font-weight:600">claim'+(claims===1?'':'s')+'</span></div>'+
          '<div><span style="font-size:18px;font-weight:800;color:#B45309">+'+earned+'</span><span style="font-size:11px;color:#777;margin-left:4px;font-weight:600">pts earned</span></div>'+
        '</div>'+
        '<button onclick="unshareDeal(\''+d.id+'\')" style="background:#FFE5E5;color:#DC2626;border:none;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer">Pull</button>'+
      '</div>'+
    '</div>';
  }).join('');
}

function renderCommunityPoolList(pool){
  return pool.map(p=>{
    const grad=getGradient(p.category);
    const du=daysUntil(p.expiry);
    const expText=du===null?'No expiry':du===0?'Today!':du===1?'Tomorrow':du+'d left';
    const initial=(p.sharedBy||'?').charAt(0).toUpperCase();
    const hash=Array.from(p.sharedBy||'').reduce((a,c)=>a+c.charCodeAt(0),0);
    const hue=(hash*47)%360;
    const alreadyClaimed=state.deals.some(d=>d.poolId===p.id);
    return '<div style="background:white;border-radius:18px;padding:14px 16px;margin-bottom:10px;box-shadow:0 4px 12px rgba(0,0,0,0.2);'+(alreadyClaimed?'opacity:0.7':'')+'">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'+
        '<div style="width:32px;height:32px;border-radius:50%;background:hsl('+hue+',60%,55%);color:white;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;flex-shrink:0">'+escapeHtml(initial)+'</div>'+
        '<div style="flex:1;min-width:0"><p style="font-size:13px;font-weight:700;margin:0;color:#1A1A1A">'+escapeHtml(p.sharedBy)+'</p><p style="font-size:11px;color:#777;margin:1px 0 0">'+(p.claimCount||0)+' claim'+(p.claimCount===1?'':'s')+' · '+expText+'</p></div>'+
      '</div>'+
      '<div class="gradient-'+grad+'" style="border-radius:12px;padding:14px;color:white;margin-bottom:10px">'+
        '<p style="font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;opacity:0.9;margin:0">'+escapeHtml(p.category)+'</p>'+
        '<h4 style="font-size:18px;font-weight:800;margin:4px 0">'+escapeHtml(p.merchant)+'</h4>'+
        '<p style="font-size:14px;opacity:0.95;margin:0">'+escapeHtml(p.discount)+'</p>'+
      '</div>'+
      (alreadyClaimed
        ?'<button disabled style="width:100%;background:#EAFBF4;color:#065F46;border:none;padding:11px;border-radius:10px;font-size:13px;font-weight:700;cursor:not-allowed">✓ Already in your wallet</button>'
        :'<button onclick="claimFromPool(\''+p.id+'\')" style="width:100%;background:#1A1A1A;color:white;border:none;padding:11px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">Claim deal</button>')+
    '</div>';
  }).join('');
}

window.claimFromPool=function(id){
  const pool=load('perq-mvp:communityPool',[]);
  const p=pool.find(x=>x.id===id);
  if(!p){toast('Deal no longer available');return;}
  // Block duplicate claims by same user
  if(state.deals.some(d=>d.poolId===id)){
    toast('Already in your wallet');
    return;
  }
  // Add to user's wallet — flagged as community-claimed (cannot be re-shared to pool)
  const newDeal={
    id:uid(),
    poolId:id,
    fromCommunity:true,
    sharedByOriginal:p.sharedBy,
    merchant:p.merchant,
    discount:p.discount,
    category:p.category,
    code:p.code||'',
    expiry:p.expiry||'',
    address:p.address||'',
    url:p.url||'',
    value:p.value||5,
    notes:'Claimed from community',
    redeemed:false,
    createdAt:Date.now()
  };
  state.deals.push(newDeal);
  // Increment claim count on pool
  p.claimCount=(p.claimCount||0)+1;
  save('perq-mvp:communityPool',pool);
  // If the original sharer is also you (testing), credit yourself
  const original=state.deals.find(d=>d.id===id);
  if(original){
    original.claimCount=(original.claimCount||0)+1;
    const sharePts=applyMultiplier(5);
    state.rewards.points+=sharePts;
    if(original.claimCount%5===0){
      state.rewards.spins=(state.rewards.spins||0)+1;
      toast('🎉 +'+sharePts+' pts · +1 bonus spin (5 claims!)');
    } else {
      toast('🎉 Claimed · +'+sharePts+' pts to '+(p.sharedBy||'sharer'));
    }
  } else {
    toast('🎉 Added to your wallet');
  }
  save(K.deals,state.deals);
  save(K.rewards,state.rewards);
  completeMission('save');
  checkTierUp();
  scheduleReminders();
  renderAll();
};

// Provider-specific brand colors and gradients
const PROVIDER_BRANDS={
  'Delta SkyMiles':{bg:'linear-gradient(135deg,#003366,#003B7B)',accent:'#E01933',logo:'△'},
  'United MileagePlus':{bg:'linear-gradient(135deg,#002677,#0F2D7B)',accent:'#FFD700',logo:'U'},
  'American AAdvantage':{bg:'linear-gradient(135deg,#0078D2,#1B438C)',accent:'#E81E26',logo:'A'},
  'Southwest Rapid Rewards':{bg:'linear-gradient(135deg,#304CB2,#1A2B7C)',accent:'#F9B612',logo:'SW'},
  'JetBlue TrueBlue':{bg:'linear-gradient(135deg,#0033A0,#001F5C)',accent:'#9DC8E8',logo:'JB'},
  'Alaska Mileage Plan':{bg:'linear-gradient(135deg,#01426A,#015488)',accent:'#41B6E6',logo:'AS'},
  'Marriott Bonvoy':{bg:'linear-gradient(135deg,#1C1C1C,#3D3D3D)',accent:'#A0855B',logo:'M'},
  'Hilton Honors':{bg:'linear-gradient(135deg,#104C97,#0A3973)',accent:'#FFFFFF',logo:'H'},
  'IHG One Rewards':{bg:'linear-gradient(135deg,#003D7C,#005EB8)',accent:'#F7B500',logo:'IHG'},
  'World of Hyatt':{bg:'linear-gradient(135deg,#5C2D5F,#3D1F45)',accent:'#FFD700',logo:'H'},
  'Wyndham Rewards':{bg:'linear-gradient(135deg,#FFD200,#FFA500)',accent:'#1F3A93',logo:'W'},
  'Choice Privileges':{bg:'linear-gradient(135deg,#003F7F,#1B5E9C)',accent:'#FFFFFF',logo:'CP'},
  'Chase Ultimate Rewards':{bg:'linear-gradient(135deg,#117ACA,#0A5BA0)',accent:'#FFFFFF',logo:'C'},
  'Amex Membership Rewards':{bg:'linear-gradient(135deg,#016FD0,#0056A4)',accent:'#FFFFFF',logo:'AX'},
  'Capital One Miles':{bg:'linear-gradient(135deg,#D03027,#A8221A)',accent:'#004977',logo:'C1'},
  'Citi ThankYou':{bg:'linear-gradient(135deg,#003B7B,#002356)',accent:'#FFFFFF',logo:'C'},
  'Discover Cashback':{bg:'linear-gradient(135deg,#FF6000,#D14E00)',accent:'#FFFFFF',logo:'D'},
  'Bank of America Travel Rewards':{bg:'linear-gradient(135deg,#012169,#E31837)',accent:'#FFFFFF',logo:'B'}
};

function getProgramBrand(name){
  return PROVIDER_BRANDS[name]||{bg:'linear-gradient(135deg,#6366F1,#C084FC)',accent:'#FFFFFF',logo:name.charAt(0)};
}

function renderProgramsList(){
  return state.programs.map(p=>{
    const brand=getProgramBrand(p.name);
    const du=p.expiry?daysUntil(p.expiry):null;
    let expState='no-expiry',expText='No expiry';
    if(du!==null){
      if(du<0){expState='expired';expText='Expired';}
      else if(du<=30){expState='urgent';expText=du+' days left';}
      else if(du<=90){expState='warning';expText=du+' days left';}
      else {expState='healthy';expText=du+' days left';}
    }
    const expColors={
      expired:'background:#FFE5E5;color:#DC2626',
      urgent:'background:#FFE5E5;color:#DC2626',
      warning:'background:#FEF3C7;color:#92400E',
      healthy:'background:rgba(255,255,255,0.2);color:white',
      'no-expiry':'background:rgba(255,255,255,0.15);color:rgba(255,255,255,0.7)'
    };
    const balance=parseFloat(p.balance||0);
    const formatted=balance>=1000?balance.toLocaleString():p.balance;
    return '<div onclick="viewProgram(\''+p.id+'\')" style="background:'+brand.bg+';border-radius:18px;padding:18px;color:white;margin-bottom:12px;box-shadow:0 6px 16px rgba(0,0,0,0.25);cursor:pointer;position:relative;overflow:hidden">'+
      '<div style="position:absolute;top:-30px;right:-30px;font-size:140px;font-weight:900;opacity:0.07;line-height:1;letter-spacing:-8px">'+escapeHtml(brand.logo)+'</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;position:relative">'+
        '<div>'+
          '<p style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.7;margin:0">'+(p.type==='airline'?'Airline':p.type==='hotel'?'Hotel':p.type==='creditcard'?'Credit Card':'Rewards')+'</p>'+
          '<h3 style="font-size:17px;font-weight:800;margin:4px 0 0;letter-spacing:-0.2px">'+escapeHtml(p.name)+'</h3>'+
        '</div>'+
        '<span style="background:'+brand.accent+';color:'+(brand.accent==='#FFFFFF'?'#1A1A1A':'white')+';padding:4px 10px;border-radius:6px;font-size:11px;font-weight:800;letter-spacing:0.5px">'+(p.icon||'⭐')+'</span>'+
      '</div>'+
      '<div style="position:relative;margin-bottom:14px">'+
        '<p style="font-size:32px;font-weight:900;margin:0;letter-spacing:-1.5px;line-height:1">'+escapeHtml(formatted)+'</p>'+
        '<p style="font-size:12px;opacity:0.85;margin:2px 0 0;font-weight:600">'+escapeHtml(p.unit)+'</p>'+
      '</div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;position:relative">'+
        '<div style="font-size:11px;opacity:0.85">'+(p.memberId?'Member: '+escapeHtml(p.memberId.slice(-4).padStart(p.memberId.length,'•')):'No member ID')+'</div>'+
        '<span style="'+expColors[expState]+';padding:5px 10px;border-radius:999px;font-size:10px;font-weight:700">'+expText+'</span>'+
      '</div>'+
    '</div>';
  }).join('');
}

window.viewProgram=function(id){
  const p=state.programs.find(x=>x.id===id);
  if(!p)return;
  const brand=getProgramBrand(p.name);
  const du=p.expiry?daysUntil(p.expiry):null;
  let expBlock='';
  if(du!==null){
    if(du<0){expBlock='<div style="background:#FFE5E5;color:#DC2626;border-radius:10px;padding:10px;margin-bottom:14px;font-size:13px;font-weight:700;text-align:center">⚠️ Points expired</div>';}
    else if(du<=30){expBlock='<div style="background:#FFE5E5;color:#DC2626;border-radius:10px;padding:10px;margin-bottom:14px;font-size:13px;font-weight:700;text-align:center">⏰ Expires in '+du+' days — use soon!</div>';}
    else if(du<=90){expBlock='<div style="background:#FEF3C7;color:#92400E;border-radius:10px;padding:10px;margin-bottom:14px;font-size:13px;font-weight:700;text-align:center">⏰ Expires in '+du+' days</div>';}
  }
  const html='<div class="modal-handle"></div>'+
    '<div style="background:'+brand.bg+';border-radius:18px;padding:18px;color:white;margin-bottom:14px;position:relative;overflow:hidden">'+
      '<div style="position:absolute;top:-30px;right:-30px;font-size:140px;font-weight:900;opacity:0.08;line-height:1">'+escapeHtml(brand.logo)+'</div>'+
      '<p style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.7;margin:0;position:relative">'+(p.type==='airline'?'Airline':p.type==='hotel'?'Hotel':p.type==='creditcard'?'Credit Card':'Rewards')+'</p>'+
      '<h3 style="font-size:20px;font-weight:800;margin:4px 0 18px;position:relative">'+escapeHtml(p.name)+'</h3>'+
      '<p style="font-size:36px;font-weight:900;margin:0;letter-spacing:-1.5px;line-height:1;position:relative">'+escapeHtml((parseFloat(p.balance||0)).toLocaleString())+'</p>'+
      '<p style="font-size:13px;opacity:0.85;margin:2px 0 0;position:relative">'+escapeHtml(p.unit)+'</p>'+
    '</div>'+
    expBlock+
    (p.memberId?'<div style="background:#F8F8F8;border-radius:10px;padding:12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:0.8px">Member ID</span><span style="font-family:ui-monospace,monospace;font-size:13px;font-weight:700">'+escapeHtml(p.memberId)+'</span></div>':'')+
    (p.expiry?'<div style="background:#F8F8F8;border-radius:10px;padding:12px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between"><span style="font-size:11px;color:#777;font-weight:600;text-transform:uppercase;letter-spacing:0.8px">Points expire</span><span style="font-size:13px;font-weight:700">'+fmtDate(p.expiry)+'</span></div>':'')+
    '<div style="display:flex;gap:8px">'+
      '<button onclick="updateProgramBalance(\''+p.id+'\')" style="flex:1;padding:12px;border-radius:12px;font-size:13px;font-weight:700;background:#1A1A1A;color:white;border:none">Update balance</button>'+
      '<button onclick="deleteProgram(\''+p.id+'\')" style="flex:0 0 50px;padding:12px;border-radius:12px;background:#FFE5E5;color:#DC2626;border:none"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/></svg></button>'+
    '</div>';
  openModal(html);
};

window.updateProgramBalance=function(id){
  const p=state.programs.find(x=>x.id===id);
  if(!p)return;
  closeModal();
  setTimeout(()=>{
    const html='<div class="modal-handle"></div><h3 class="modal-title">Update '+escapeHtml(p.name)+'</h3>'+
      '<div class="form-row"><label>Current balance</label><input id="upd-balance" type="number" inputmode="numeric" value="'+escapeHtml(p.balance)+'"></div>'+
      '<div class="form-row"><label>Member ID (optional)</label><input id="upd-memberid" value="'+escapeHtml(p.memberId||'')+'" placeholder="Your account number"></div>'+
      '<div class="form-row"><label>Points expire (optional)</label><input id="upd-expiry" type="date" value="'+escapeHtml(p.expiry||'')+'"></div>'+
      '<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveProgramUpdate(\''+id+'\')">Save</button></div>';
    openModal(html);
  },200);
};

window.saveProgramUpdate=function(id){
  const p=state.programs.find(x=>x.id===id);
  if(!p)return;
  p.balance=document.getElementById('upd-balance').value||p.balance;
  p.memberId=document.getElementById('upd-memberid').value.trim();
  p.expiry=document.getElementById('upd-expiry').value||null;
  p.lastUpdated=Date.now();
  save(K.programs,state.programs);
  closeModal();
  toast('✓ Balance updated');
  renderAll();
};

window.deleteProgram=function(id){
  if(!confirm('Delete this program?'))return;
  state.programs=state.programs.filter(x=>x.id!==id);
  save(K.programs,state.programs);
  closeModal();
  toast('Deleted');
  renderAll();
};

function renderLoyaltyList(){
  return state.loyalty.map(c=>{
    const masked=c.number.length>4?'**** '+c.number.slice(-4):c.number;
    return '<div onclick="showLoyaltyBarcode(\''+c.id+'\')" style="background:'+c.color+';border-radius:18px;padding:20px;color:white;margin-bottom:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);cursor:pointer"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px"><div><p style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.9;margin:0">Loyalty Card</p><h3 style="font-size:18px;font-weight:800;margin:4px 0 0">'+escapeHtml(c.name)+'</h3></div><svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:none;stroke:white;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:0.7"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/><line x1="14" y1="10" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/></svg></div><p style="font-family:ui-monospace,monospace;font-size:14px;letter-spacing:3px;margin:0;opacity:0.95">'+escapeHtml(masked)+'</p></div>';
  }).join('');
}

window.togglePass=function(el){
  const expanded=el.classList.contains('expanded');
  document.querySelectorAll('.wpass').forEach(p=>collapsePass(p));
  if(!expanded)expandPass(el);
};

function expandPass(el){
  el.classList.add('expanded');
  el.querySelector('.pcoll').style.display='none';
  el.querySelector('.pexp').style.display='block';
  el.style.padding='18px 20px';
  el.style.background='white';
  el.style.color='#1A1A1A';
  el.style.marginBottom='14px';
  el.style.borderRadius='24px';
  el.style.overflow='hidden';
}

function collapsePass(el){
  el.classList.remove('expanded');
  el.querySelector('.pcoll').style.display='flex';
  el.querySelector('.pcoll').style.flexDirection='column';
  el.querySelector('.pexp').style.display='none';
  el.style.padding='18px 20px';
  const bg=el.getAttribute('data-brand-bg')||'#10B981';
  const bg2=el.getAttribute('data-brand-bg2')||'#047857';
  el.style.background='linear-gradient(135deg,'+bg+','+bg2+')';
  el.style.color=el.getAttribute('data-brand-text')||'#FFFFFF';
  el.style.borderRadius='18px';
  el.style.overflow='visible';
  const all=document.querySelectorAll('.wpass');
  const last=all[all.length-1];
  el.style.marginBottom=el===last?'14px':'-90px';
}

window.redeemDeal=function(id){
  const d=state.deals.find(x=>x.id===id);
  if(!d)return;
  d.redeemed=true;
  d.redeemedAt=Date.now();
  const pts=applyMultiplier(10);
  state.rewards.points+=pts;
  state.rewards.saved+=parseFloat(d.value)||0;
  if(state.rewards.lastClaim!==todayStr()){
    const yest=new Date();yest.setDate(yest.getDate()-1);
    if(state.rewards.lastClaim===yest.toISOString().slice(0,10))state.rewards.streak+=1;
    else state.rewards.streak=1;
    state.rewards.lastClaim=todayStr();
  }
  state.rewards.spins+=1;
  save(K.deals,state.deals);save(K.rewards,state.rewards);
  toast('✓ Saved $'+(parseFloat(d.value)||0).toFixed(0)+' · +'+pts+' pts · +1 spin');
  completeMission('redeem');
  checkTierUp();
  scheduleReminders();
  renderAll();
};

// -------- Deal Detail Modal --------
// Focused, modal-style view of a single saved wallet deal. Shows merchant,
// discount, expiry. Primary CTA is "Mark as Used" which calls redeemDeal().
// Existing inline pass expand/collapse stays as the primary at-a-glance view —
// this modal is the deeper, screenshot-friendly surface. Spec:
// .kiro/specs/feature-deal-detail-modal.md
window.viewWalletDeal=function(id){
  const d=state.deals.find(x=>x.id===id);
  if(!d){toast('Deal not found');return;}
  const brand=getBrandFor(d.merchant);
  const headerBg=brandGradientCss(brand);
  const headerText=brand.text||'#FFFFFF';
  const du=daysUntil(d.expiry);
  let expRow,expColor='var(--text)';
  if(!d.expiry){expRow='No expiry';expColor='var(--text-faint)';}
  else if(du===0){expRow='Expires today';expColor='var(--warm-1)';}
  else if(du<0){expRow='Expired '+Math.abs(du)+' day'+(Math.abs(du)===1?'':'s')+' ago';expColor='var(--warm-1)';}
  else{expRow='Expires '+fmtDate(d.expiry);}
  const isRedeemed=!!d.redeemed;
  const merchantText=d.merchant?escapeHtml(d.merchant):'Untitled deal';
  const discountText=escapeHtml(d.discount||'');

  let html='<div class="modal-handle"></div>';
  html+='<button onclick="closeModal()" aria-label="Close" style="position:absolute;top:14px;right:14px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.06);border:none;display:flex;align-items:center;justify-content:center;cursor:pointer"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:#1A1A1A;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
  // Brand-tile header (merchant + discount as one visual headline)
  html+='<div style="background:'+headerBg+';color:'+headerText+';border-radius:18px;padding:20px;margin:8px 0 16px;box-shadow:'+brandCardShadow()+'">';
  html+='<p style="font-size:22px;font-weight:800;margin:0;line-height:1.1">'+merchantText+'</p>';
  if(discountText)html+='<p style="font-size:32px;font-weight:900;margin:6px 0 0;letter-spacing:-1px;line-height:1">'+discountText+'</p>';
  html+='</div>';
  // Image preview (only when the deal has an image — legacy/Type-a-deal entries skip cleanly)
  html+=dealImageFrame(d.image,'wallet-detail-img-'+d.id);
  // Info rows
  html+='<div style="background:var(--surface-soft);border-radius:14px;padding:4px 14px;margin-bottom:12px">';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);font-size:14px"><span style="color:var(--text-dim)">🏷️ Merchant</span><span style="color:var(--text);font-weight:600">'+merchantText+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--border);font-size:14px"><span style="color:var(--text-dim)">💰 Discount</span><span style="color:var(--text);font-weight:600">'+(discountText||'<span style="color:var(--text-faint)">—</span>')+'</span></div>';
  html+='<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;font-size:14px"><span style="color:var(--text-dim)">📅 Expiry</span><span style="color:'+expColor+';font-weight:600">'+escapeHtml(expRow)+'</span></div>';
  html+='</div>';
  // Address row — clickable, opens platform maps. Spec: feature-deal-detail-modal-v2 AC4-5.
  // Same Google-Maps URL the inline-expanded view uses; Apple Maps recognizes it on iOS,
  // Google Maps app handles it on Android. event.stopPropagation prevents the modal-overlay's
  // backdrop-tap handler from firing when the user taps the link.
  if(d.address){
    const mapsUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(d.address);
    html+='<a href="'+escapeHtml(mapsUrl)+'" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--surface-soft);border-radius:14px;margin-bottom:12px;text-decoration:none;color:var(--text)">'
      +'<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:none;stroke:#4FACFE;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
      +'<span style="flex:1;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+escapeHtml(d.address)+'</span>'
      +'<span style="font-size:11px;color:#4FACFE;font-weight:700;flex-shrink:0">Directions</span>'
      +'</a>';
  }
  // Primary CTA + Share + Delete
  if(isRedeemed){
    html+='<button disabled style="width:100%;padding:14px;border-radius:14px;background:var(--surface-soft);color:var(--text-faint);border:none;font-size:15px;font-weight:800;cursor:not-allowed;margin-bottom:8px">Already used</button>';
  } else {
    html+='<button onclick="markDealUsed(\''+d.id+'\')" style="width:100%;padding:14px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent-dark));color:white;border:none;font-size:15px;font-weight:800;cursor:pointer;margin-bottom:8px">Mark as Used</button>';
  }
  // Share button — secondary, outlined. Available for both active and redeemed
  // deals (sharing a "look at the deal I just used" recommendation is valid).
  html+='<button onclick="shareDealFromModal(\''+d.id+'\')" style="width:100%;padding:13px;border-radius:14px;background:transparent;color:var(--accent-dark);border:2px solid var(--accent);font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Share Deal</button>';
  // Delete button — destructive, outlined faint-red. Calls deleteDealFromModal which
  // closes modal first then runs deleteDeal (which prompts native confirm + toasts).
  // Spec: feature-deal-detail-modal-v2 AC6-7.
  html+='<button onclick="deleteDealFromModal(\''+d.id+'\')" style="width:100%;padding:13px;border-radius:14px;background:transparent;color:#DC2626;border:2px solid #FFE5E5;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"><svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>Delete deal</button>';
  openModal(html);
};

// Wraps redeemDeal with modal close, so the modal is the entry point.
window.markDealUsed=function(id){
  closeModal();
  redeemDeal(id);
};

// Wraps shareDeal with modal close so the system share sheet (or share modal)
// has a clean stacking context. Returns control to existing shareDeal flow.
window.shareDealFromModal=function(id){
  closeModal();
  shareDeal(id);
};

// Wraps deleteDeal with modal close so the system confirm() and the post-delete
// toast surface cleanly without the modal stacking context. Spec: feature-deal-detail-modal-v2 AC7.
window.deleteDealFromModal=function(id){
  closeModal();
  deleteDeal(id);
};

// -------- calculateDiscount --------
// Pure helper. Given a numeric price and percent, returns the post-discount
// price. Spec: .kiro/specs/feature-calculate-discount.md
// Returns NaN when either input is null/undefined; caller is responsible for
// checking Number.isFinite() before consuming.
window.calculateDiscount=function(price,percent){return price-(price*percent/100);};

window.shareDeal=function(id){
  const d=state.deals.find(x=>x.id===id);
  if(!d)return;
  const claimed=d.claimCount||0;
  const sharedAlready=d.shared;
  const fromCommunity=d.fromCommunity;

  const text=buildShareText(d);
  const encodedText=encodeURIComponent(text);

  let html='<div class="modal-handle"></div><h3 class="modal-title">Share this deal</h3>';

  // Deal preview card
  html+='<div style="background:linear-gradient(135deg,'+(d.category==='Travel'?'#6366F1,#C084FC':d.category==='Groceries'?'#00C9A7,#4FACFE':d.category==='Apparel'?'#F472B6,#FB923C':'#FF6B6B,#FFA06B')+');border-radius:14px;padding:14px;color:white;margin-bottom:14px">'+
    '<p style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.9;margin:0">'+escapeHtml(d.category||'Deal')+'</p>'+
    '<h4 style="font-size:18px;font-weight:800;margin:4px 0 6px">'+escapeHtml(d.merchant)+'</h4>'+
    '<p style="font-size:14px;font-weight:600;margin:0;opacity:0.95">'+escapeHtml(d.discount)+'</p>'+
    (d.expiry?'<p style="font-size:11px;opacity:0.85;margin:6px 0 0">Expires '+fmtDate(d.expiry)+'</p>':'')+
  '</div>';

  // Anti-fraud notice if claimed from community
  if(fromCommunity){
    html+='<div style="background:#FFFBEB;border:1px solid #FBBF24;border-radius:12px;padding:12px;margin-bottom:14px">'+
      '<p style="font-size:12px;font-weight:700;color:#92400E;margin:0 0 4px;display:flex;align-items:center;gap:6px">⚠️ Community-claimed deal</p>'+
      '<p style="font-size:11px;color:#78350F;margin:0;line-height:1.5">This was claimed from the community pool (originally shared by <strong>'+escapeHtml(d.sharedByOriginal||'someone')+'</strong>). You can share via Message/WhatsApp/Email/Copy link, but it can\'t be re-pooled to prevent farming points.</p>'+
    '</div>';
  } else {
    html+='<div style="background:#F0F9FF;border:1px solid #4FACFE;border-radius:12px;padding:12px;margin-bottom:14px">'+
      '<p style="font-size:12px;font-weight:700;color:#075985;margin:0 0 4px;display:flex;align-items:center;gap:6px">'+
        '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:#075985;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="17" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>'+
        'Pool with the Perq community</p>'+
      '<p style="font-size:11px;color:#0c4a6e;margin:0;line-height:1.5">Other Perq users can claim until expiry. <strong>+5 pts</strong> on share, <strong>+5 pts</strong> per claim, <strong>+1 spin</strong> every 5 claims.</p>'+
    '</div>';
  }

  // Community pool button (only if not from community)
  if(!fromCommunity){
    if(sharedAlready){
      html+='<div style="background:#EAFBF4;border:1px solid #00C9A7;border-radius:10px;padding:10px;margin-bottom:14px;font-size:12px;color:#065F46;font-weight:600;text-align:center">✓ Shared with community · '+claimed+' claim'+(claimed===1?'':'s')+' · earned '+(claimed*5+5)+' pts</div>';
      html+='<button onclick="unshareDeal(\''+d.id+'\')" style="width:100%;background:#FFE5E5;color:#DC2626;border:none;padding:12px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:14px">Pull from community pool</button>';
    } else {
      html+='<button onclick="confirmShare(\''+d.id+'\')" style="width:100%;background:#1A1A1A;color:white;border:none;padding:14px;border-radius:14px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:14px">📤 Share to community pool · +5 pts</button>';
    }
  }

  // Social share options (always available)
  html+='<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin:8px 0 8px">Or share with someone specific</p>';
  html+='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">'+
    '<a href="'+buildSmsHref(text)+'" style="text-decoration:none;background:#F0F0F0;border-radius:14px;padding:14px 8px;text-align:center;color:#1A1A1A">'+
      '<div style="width:36px;height:36px;border-radius:50%;background:#34D399;color:white;margin:0 auto 6px;display:flex;align-items:center;justify-content:center">'+
      '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'+
      '</div><span style="font-size:11px;font-weight:600">Message</span></a>'+
    '<a href="'+buildWhatsAppHref(text)+'" target="_blank" rel="noopener" style="text-decoration:none;background:#F0F0F0;border-radius:14px;padding:14px 8px;text-align:center;color:#1A1A1A">'+
      '<div style="width:36px;height:36px;border-radius:50%;background:#25D366;color:white;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900">W</div>'+
      '<span style="font-size:11px;font-weight:600">WhatsApp</span></a>'+
    '<a href="'+buildMailtoHref('Deal on Perq',text)+'" style="text-decoration:none;background:#F0F0F0;border-radius:14px;padding:14px 8px;text-align:center;color:#1A1A1A">'+
      '<div style="width:36px;height:36px;border-radius:50%;background:#4FACFE;color:white;margin:0 auto 6px;display:flex;align-items:center;justify-content:center">'+
      '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>'+
      '</div><span style="font-size:11px;font-weight:600">Email</span></a>'+
    '<button onclick="copyShareText(\''+d.id+'\')" style="background:#F0F0F0;border:none;border-radius:14px;padding:14px 8px;text-align:center;color:#1A1A1A;cursor:pointer">'+
      '<div style="width:36px;height:36px;border-radius:50%;background:#6366F1;color:white;margin:0 auto 6px;display:flex;align-items:center;justify-content:center">'+
      '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'+
      '</div><span style="font-size:11px;font-weight:600">Copy link</span></button>'+
  '</div>';

  html+='<button onclick="closeModal()" style="width:100%;padding:14px;border-radius:14px;font-size:14px;font-weight:700;background:#F0F0F0;color:#333;border:none">Cancel</button>';
  openModal(html);
};

window.copyShareText=function(id){
  const d=state.deals.find(x=>x.id===id);
  if(!d)return;
  const text=buildShareText(d);
  // Prefer native share sheet on iOS/Android
  if(window.PerqNative&&window.PerqNative.isNative){
    window.PerqNative.nativeShare({title:'Perq deal',text,url:d.url||getReferralLink()})
      .then(ok=>{if(ok)toast('Shared');else toast('Share cancelled');});
    return;
  }
  if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard')).catch(()=>toast('Copy failed'));
  } else {
    toast('Copy not supported');
  }
};

// -------- Refer & Earn --------
window.openReferralSheet=function(){
  // Ensure we have a code (defensive)
  if(state.profile&&!state.profile.referralCode){
    state.profile.referralCode=genReferralCode(state.profile.name);
    save(K.profile,state.profile);
  }
  const code=state.profile&&state.profile.referralCode||'PERQXX';
  const link=getReferralLink();
  const friendsCount=(state.profile&&state.profile.referralCount)||0;
  const text='Try Perq — snap a coupon, forget about it, save money. Use my invite code '+code+' for +10 bonus points: '+link;

  const html='<div class="modal-handle"></div>'+
    '<h3 class="modal-title" style="margin-bottom:6px">🎁 Invite friends</h3>'+
    '<p style="font-size:13px;color:var(--text-dim);text-align:center;margin:0 0 18px;line-height:1.5">Share your code. When a friend joins via your link, you both earn rewards.</p>'+
    // Code display
    '<div style="background:linear-gradient(135deg,#10B981,#047857);border-radius:18px;padding:18px;margin-bottom:14px;text-align:center;color:white">'+
      '<p style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.85;margin:0">Your invite code</p>'+
      '<p style="font-family:ui-monospace,monospace;font-size:32px;font-weight:900;letter-spacing:4px;margin:8px 0 4px">'+escapeHtml(code)+'</p>'+
      '<p style="font-size:11px;opacity:0.85;margin:0;word-break:break-all">'+escapeHtml(link)+'</p>'+
    '</div>'+
    // Stats
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'+
      '<div style="background:#F8F8F8;border-radius:12px;padding:12px;text-align:center">'+
        '<p style="font-size:24px;font-weight:900;margin:0;color:#1A1A1A">'+friendsCount+'</p>'+
        '<p style="font-size:10px;color:var(--text-dim);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:2px 0 0">Friends joined</p>'+
      '</div>'+
      '<div style="background:#F8F8F8;border-radius:12px;padding:12px;text-align:center">'+
        '<p style="font-size:24px;font-weight:900;margin:0;color:#10B981">+'+(friendsCount*50)+'</p>'+
        '<p style="font-size:10px;color:var(--text-dim);font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:2px 0 0">Pts earned</p>'+
      '</div>'+
    '</div>'+
    // Reward breakdown
    '<div style="background:#F0F9FF;border:1px solid #4FACFE;border-radius:12px;padding:12px;margin-bottom:14px">'+
      '<p style="font-size:12px;font-weight:700;color:#075985;margin:0 0 6px">How it works</p>'+
      '<p style="font-size:12px;color:#0c4a6e;margin:0;line-height:1.6">'+
        '• Friend installs via your link → <strong>+50 pts to you</strong><br>'+
        '• Friend gets <strong>+10 welcome pts</strong> automatically<br>'+
        '• Bonus: every 5 friends → <strong>+1 spin</strong>'+
      '</p>'+
    '</div>'+
    // Share buttons
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">'+
      '<a href="'+buildSmsHref(text)+'" style="text-decoration:none;background:#F0F0F0;border-radius:14px;padding:14px 8px;text-align:center;color:#1A1A1A">'+
        '<div style="width:36px;height:36px;border-radius:50%;background:#34D399;color:white;margin:0 auto 6px;display:flex;align-items:center;justify-content:center">'+
        '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'+
        '</div><span style="font-size:11px;font-weight:600">Message</span></a>'+
      '<a href="'+buildWhatsAppHref(text)+'" target="_blank" rel="noopener" style="text-decoration:none;background:#F0F0F0;border-radius:14px;padding:14px 8px;text-align:center;color:#1A1A1A">'+
        '<div style="width:36px;height:36px;border-radius:50%;background:#25D366;color:white;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900">W</div>'+
        '<span style="font-size:11px;font-weight:600">WhatsApp</span></a>'+
      '<a href="'+buildMailtoHref('Try Perq · save with me',text)+'" style="text-decoration:none;background:#F0F0F0;border-radius:14px;padding:14px 8px;text-align:center;color:#1A1A1A">'+
        '<div style="width:36px;height:36px;border-radius:50%;background:#4FACFE;color:white;margin:0 auto 6px;display:flex;align-items:center;justify-content:center">'+
        '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>'+
        '</div><span style="font-size:11px;font-weight:600">Email</span></a>'+
      '<button onclick="copyReferralLink()" style="background:#F0F0F0;border:none;border-radius:14px;padding:14px 8px;text-align:center;color:#1A1A1A;cursor:pointer">'+
        '<div style="width:36px;height:36px;border-radius:50%;background:#6366F1;color:white;margin:0 auto 6px;display:flex;align-items:center;justify-content:center">'+
        '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'+
        '</div><span style="font-size:11px;font-weight:600">Copy link</span></button>'+
    '</div>'+
    '<button onclick="closeModal()" style="width:100%;padding:14px;border-radius:14px;font-size:14px;font-weight:700;background:#F0F0F0;color:#333;border:none">Close</button>';
  openModal(html);
};

window.copyReferralLink=function(){
  const link=getReferralLink();
  const code=state.profile&&state.profile.referralCode||'';
  const text='Try Perq — snap a coupon, forget about it, save money. Use my invite code '+code+' for +10 bonus points: '+link;
  if(window.PerqNative&&window.PerqNative.isNative){
    window.PerqNative.nativeShare({title:'Try Perq',text,url:link})
      .then(ok=>{if(ok)toast('Shared');});
    return;
  }
  if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(()=>toast('Invite copied to clipboard')).catch(()=>toast('Copy failed'));
  } else {
    toast('Copy not supported');
  }
};

window.confirmShare=function(id){
  const d=state.deals.find(x=>x.id===id);
  if(!d)return;
  d.shared=true;
  d.sharedAt=Date.now();
  d.claimCount=d.claimCount||0;
  const sharePts=applyMultiplier(5*shareMultiplier());
  state.rewards.points+=sharePts;
  save(K.deals,state.deals);save(K.rewards,state.rewards);
  // Also save to community pool (local-first; will become a backend call later)
  const pool=load('perq-mvp:communityPool',[]);
  if(!pool.find(p=>p.id===d.id)){
    pool.push({
      id:d.id,
      sharedBy:state.profile?.name||'You',
      sharedAt:Date.now(),
      merchant:d.merchant,
      discount:d.discount,
      category:d.category,
      code:d.code,
      expiry:d.expiry,
      address:d.address,
      url:d.url,
      value:d.value,
      priority:hasUnlock('priority_share')?true:false,
      claimCount:0
    });
    save('perq-mvp:communityPool',pool);
  }
  closeModal();
  toast('🎉 Shared with community · +'+sharePts+' pts');
  completeMission('share');
  checkTierUp();
  goPage('community');
};

window.unshareDeal=function(id){
  const d=state.deals.find(x=>x.id===id);
  if(!d)return;
  d.shared=false;
  d.sharedAt=null;
  save(K.deals,state.deals);
  // Remove from community pool
  const pool=load('perq-mvp:communityPool',[]).filter(p=>p.id!==id);
  save('perq-mvp:communityPool',pool);
  closeModal();
  toast('Pulled from community pool');
  renderAll();
};

window.deleteDeal=function(id){
  if(!confirm('Delete this deal?'))return;
  state.deals=state.deals.filter(d=>d.id!==id);
  save(K.deals,state.deals);
  toast('Deleted');
  scheduleReminders();
  renderAll();
};

// -------- Browse --------
function renderBrowse(){
  const slider=document.getElementById('browse-radius');
  const radius=slider?parseInt(slider.value):5;
  const radiusVal=document.getElementById('radius-val');
  if(radiusVal)radiusVal.textContent=radius+' mi';
  // Update slider track fill (visual feedback)
  if(slider){
    const max=parseInt(slider.max||'20');
    const min=parseInt(slider.min||'1');
    const pct=((radius-min)/(max-min))*100;
    slider.style.background='linear-gradient(to right,#10B981 0%,#10B981 '+pct+'%,#e5e5e5 '+pct+'%,#e5e5e5 100%)';
    if(!slider._wired){
      slider._wired=true;
      slider.addEventListener('input',renderBrowse);
    }
  }

  const local=document.getElementById('local-deals-list');
  const allLocal=getSampleLocalDeals();
  const sample=allLocal.filter(d=>parseFloat(d.distance)<=radius);
  local.innerHTML='<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.7);margin:0 0 12px">📍 '+sample.length+' deal'+(sample.length===1?'':'s')+' within '+radius+' mi</p>'+
    (sample.length===0?'<div style="background:rgba(255,255,255,0.95);border-radius:16px;padding:24px;text-align:center;color:var(--text-dim)"><div style="font-size:36px;margin-bottom:8px;opacity:0.4">📍</div><p style="font-size:13px;font-weight:600;color:#1A1A1A;margin:0 0 4px">Nothing within '+radius+' mi</p><p style="font-size:11px;margin:0">Try increasing the radius</p></div>':
    sample.map(d=>{
    const brand=getBrandFor(d.merchant);
    const bgCss=brandGradientCss(brand);
    const claimed=isBrowseDealClaimed(d.merchant,d.discount);
    return '<div onclick="viewBrowseDeal(\''+escapeAttr(d.id)+'\',\'local\')" style="background:white;border-radius:16px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 14px rgba(0,0,0,0.08);text-align:left;cursor:pointer;'+(claimed?'opacity:0.7':'')+'"><div style="background:'+bgCss+';width:56px;height:56px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:'+brand.text+';font-weight:800;font-size:18px;flex-shrink:0">'+escapeHtml(brand.mono||d.merchant.charAt(0).toUpperCase())+'</div><div style="flex:1;min-width:0"><p style="font-size:14px;font-weight:700;margin:0">'+escapeHtml(d.merchant)+'</p><p style="font-size:12px;color:var(--text-dim);margin:2px 0 0">'+escapeHtml(d.discount)+'</p><p style="font-size:11px;color:#047857;font-weight:700;margin:4px 0 0">📍 '+d.distance+' mi · '+d.time+'</p></div>'+(claimed?'<span style="background:#EAFBF4;color:#065F46;padding:8px 12px;border-radius:999px;font-size:11px;font-weight:700">✓ In wallet</span>':'<button onclick="event.stopPropagation();claimBrowseDeal(\''+escapeAttr(d.id)+'\',\'local\')" style="background:#10B981;color:white;border:none;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer">Claim</button>')+'</div>';
  }).join(''));

  const onl=document.getElementById('online-deals-list');
  const od=getSampleOnlineDeals();
  onl.innerHTML='<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.7);margin:0 0 12px">🌐 '+od.length+' online deals · no distance limit</p><div style="columns:2;column-gap:8px">'+od.map(d=>{
    const brand=getBrandFor(d.merchant);
    const bgCss=brandGradientCss(brand);
    const claimed=isBrowseDealClaimed(d.merchant,d.discount);
    return '<div onclick="viewBrowseDeal(\''+escapeAttr(d.id)+'\',\'online\')" style="break-inside:avoid;margin-bottom:8px;border-radius:16px;overflow:hidden;position:relative;width:100%;display:block;cursor:pointer;box-shadow:'+brandCardShadow()+';'+(claimed?'opacity:0.7':'')+'"><div style="background:'+bgCss+';height:'+d.h+'px;display:flex;align-items:center;justify-content:center;color:'+brand.text+';font-weight:800;font-size:'+(brand.mono.length>2?'24px':'48px')+'">'+escapeHtml(brand.mono||d.short)+'</div><div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(180deg,transparent,rgba(0,0,0,0.85));padding:24px 10px 10px;color:white"><p style="font-size:13px;font-weight:700;margin:0">'+escapeHtml(d.merchant)+'</p><p style="font-size:11px;opacity:0.9;margin:0 0 8px">'+escapeHtml(d.subtitle)+'</p>'+(claimed?'<span style="display:block;background:rgba(255,255,255,0.95);color:#065F46;padding:6px;border-radius:8px;font-size:11px;font-weight:700;text-align:center">✓ In wallet</span>':'<button onclick="event.stopPropagation();claimBrowseDeal(\''+escapeAttr(d.id)+'\',\'online\')" style="display:block;width:100%;background:#10B981;color:white;border:none;padding:6px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">Claim</button>')+'</div></div>';
  }).join('')+'</div>';
}

function escapeAttr(s){return String(s||'').replace(/'/g,"\\'").replace(/"/g,'&quot;');}

function isBrowseDealClaimed(merchant,discount){
  return state.deals.some(d=>d.merchant===merchant&&d.discount===discount);
}

// NOTE: These are curated sample deals representative of real well-known
// recurring promotions. Live deal-feed integration (RetailMeNot / Honey
// API / direct merchant partnerships) is on the roadmap for v2.
// For the beta, treat these as realistic placeholders, not live data.
function getSampleLocalDeals(){
  return [
    {id:'l-sb',merchant:'Starbucks',discount:'Free birthday drink',category:'Dining',code:'BD2026',expiry:futureDate(7),distance:'0.4',time:'2 min walk',description:'Any handcrafted drink free on your birthday week. Must be a Starbucks Rewards member.',terms:'Valid in-store only. One per member per year. Loyalty card required.',url:'https://www.starbucks.com/rewards'},
    {id:'l-tj',merchant:'Trader Joe\'s',discount:'$5 off $30 produce',category:'Groceries',code:'FRESH5',expiry:futureDate(10),distance:'0.7',time:'3 min drive',description:'Save $5 on any produce purchase of $30 or more. Cashier scans the code.',terms:'Excludes alcohol. One per visit. In-store only.',url:''},
    {id:'l-tg',merchant:'Target',discount:'5% off everything',category:'Home',code:'CIRCLE',expiry:futureDate(30),distance:'1.1',time:'5 min drive',description:'5% off every purchase with Target Circle (free to join). Stacks with Cartwheel offers.',terms:'Members get 5% off year-round. Sign up at target.com/circle.',url:'https://www.target.com/circle'},
    {id:'l-cv',merchant:'CVS ExtraCare',discount:'$3 off $15',category:'Beauty',code:'EXTRA3',expiry:futureDate(5),distance:'1.5',time:'7 min drive',description:'Spend $15+ on health & beauty, get $3 off automatically with ExtraCare card.',terms:'Excludes Rx, alcohol, gift cards.',url:'https://www.cvs.com/extracare'},
    {id:'l-ch',merchant:'Chipotle',discount:'Free guac with entrée',category:'Dining',code:'GUACFAM',expiry:futureDate(14),distance:'2.0',time:'8 min drive',description:'Free side of guacamole with any entrée order. Add to mobile app cart.',terms:'In-app order only. Once per Chipotle Rewards account.',url:'https://www.chipotle.com/rewards'},
    {id:'l-pn',merchant:'Panera',discount:'Free pastry MyPanera',category:'Dining',code:'MYPANERA',expiry:futureDate(7),distance:'2.6',time:'10 min drive',description:'Free pastry with any cafe order. MyPanera membership required (free).',terms:'Limit one. New members only this month.',url:'https://www.panerabread.com/mypanera'},
    {id:'l-bb',merchant:'Best Buy',discount:'$10 off $50',category:'Electronics',code:'TECHSAVE',expiry:futureDate(10),distance:'4.2',time:'14 min drive',description:'$10 off your $50+ purchase. My Best Buy members get early access.',terms:'Excludes Apple, gaming consoles. One per member.',url:'https://www.bestbuy.com'},
    {id:'l-wf',merchant:'Whole Foods',discount:'10% off Prime members',category:'Groceries',code:'PRIME10',expiry:futureDate(30),distance:'5.8',time:'18 min drive',description:'10% off select sale items every day with Amazon Prime + Whole Foods app.',terms:'Prime membership required. Scan app at checkout.',url:'https://www.amazon.com/wholefoods'},
    {id:'l-on',merchant:'Old Navy',discount:'30% off everything',category:'Apparel',code:'THIRTY',expiry:futureDate(3),distance:'7.2',time:'22 min drive',description:'30% off your purchase, including markdowns. Online + in-store.',terms:'Excludes Hotel Collection. One use per customer.',url:'https://oldnavy.gap.com'},
    {id:'l-sp',merchant:'Sephora Beauty Insider',discount:'Free shipping any order',category:'Beauty',code:'SHIPPED',expiry:futureDate(8),distance:'9.4',time:'28 min drive',description:'Free shipping with no minimum for Beauty Insider members (free to join).',terms:'Standard shipping only. Online orders.',url:'https://www.sephora.com/beauty-insider'},
    {id:'l-ll',merchant:'Lululemon',discount:'Free hemming',category:'Apparel',code:'HEM',expiry:futureDate(60),distance:'12.5',time:'35 min drive',description:'Free hemming on any pant or short purchase, in-store only.',terms:'Original purchase from Lululemon required. No expiration once active.',url:'https://shop.lululemon.com'},
    {id:'l-aw',merchant:'Apple Watch trade-in',discount:'Up to $200 credit',category:'Electronics',code:'TRADEUP',expiry:futureDate(45),distance:'15.0',time:'45 min drive',description:'Trade in any working Apple Watch toward a new model. Quote from apple.com first.',terms:'Trade-in value depends on model + condition. Valid in-store + online.',url:'https://www.apple.com/shop/trade-in'}
  ];
}

function getSampleOnlineDeals(){
  return [
    {id:'o-az',merchant:'Amazon Prime',discount:'30 days free trial',category:'Home',code:'PRIME30',expiry:futureDate(60),short:'FREE',subtitle:'30-day Prime trial',h:200,description:'Free 30-day Amazon Prime trial — free shipping, Prime Video, Music, Reading, more. New members only.',terms:'Cancel anytime before trial ends. Must be a new Prime member.',url:'https://www.amazon.com/prime'},
    {id:'o-bb',merchant:'Best Buy',discount:'$50 off laptops',category:'Electronics',code:'LAP50',expiry:futureDate(10),short:'$50',subtitle:'Laptops $500+',h:240,description:'Save $50 on any laptop $500 and above. My Best Buy member exclusive.',terms:'Online only. One per member. Excludes Apple.',url:'https://www.bestbuy.com'},
    {id:'o-mr',merchant:'Marriott Bonvoy',discount:'5,000 bonus points',category:'Travel',code:'WKND5K',expiry:futureDate(14),short:'5K',subtitle:'2-night weekend stays',h:180,description:'Earn 5,000 bonus points on weekend stays of 2+ nights at participating hotels. Register before booking.',terms:'Must register at marriott.com/bonus. Stay must complete by deadline.',url:'https://www.marriott.com/bonvoy'},
    {id:'o-sp',merchant:'Sephora online',discount:'30% off skincare',category:'Beauty',code:'GLOW30',expiry:futureDate(5),short:'30%',subtitle:'Sale skincare',h:220,description:'30% off skincare on the sale page. Code applies at checkout.',terms:'Online only. Excludes brands like Drunk Elephant.',url:'https://www.sephora.com/sale'},
    {id:'o-cs',merchant:'Costco online',discount:'$25 off $250',category:'Groceries',code:'COSTCO25',expiry:futureDate(12),short:'$25',subtitle:'Online orders $250+',h:160,description:'Save $25 on Costco.com orders of $250+. Members only.',terms:'Costco membership required. Excludes alcohol, gift cards.',url:'https://www.costco.com'},
    {id:'o-nk',merchant:'Nike',discount:'25% off sale items',category:'Apparel',code:'EXTRA25',expiry:futureDate(8),short:'25%',subtitle:'Sale section',h:200,description:'Extra 25% off sale items at Nike.com with member account (free to join).',terms:'Excludes Jordan, Yeezy, recent releases.',url:'https://www.nike.com/membership'},
    {id:'o-ub',merchant:'Uber Eats',discount:'$10 off $25',category:'Dining',code:'EATS10',expiry:futureDate(7),short:'$10',subtitle:'Order $25+',h:190,description:'$10 off any Uber Eats order of $25 or more. New customers only.',terms:'New users only. Some restaurants excluded.',url:'https://www.ubereats.com'},
    {id:'o-sf',merchant:'Spotify Premium',discount:'3 months free',category:'Other',code:'SPOT3',expiry:futureDate(30),short:'3MO',subtitle:'Premium trial',h:170,description:'3 months free Spotify Premium for new subscribers. Auto-converts to paid after trial.',terms:'New Premium subscribers only. Cancel anytime.',url:'https://www.spotify.com/premium'},
    {id:'o-dd',merchant:'DoorDash DashPass',discount:'$10 off first order',category:'Dining',code:'DASH10',expiry:futureDate(14),short:'$10',subtitle:'New customer deal',h:180,description:'$10 off your first DoorDash order with DashPass trial. Free trial included.',terms:'New customers only. DashPass auto-renews after trial.',url:'https://www.doordash.com/dashpass'},
    {id:'o-yt',merchant:'YouTube Premium',discount:'1 month free',category:'Other',code:'YTPREM',expiry:futureDate(30),short:'1MO',subtitle:'Ad-free streaming',h:160,description:'1 month free YouTube Premium — ad-free, background play, YouTube Music included.',terms:'New subscribers only. Auto-renews unless cancelled.',url:'https://www.youtube.com/premium'}
  ];
}

// View deal details (Local or Online tap-through)
window.viewBrowseDeal=function(id,source){
  const list=source==='local'?getSampleLocalDeals():getSampleOnlineDeals();
  const d=list.find(x=>x.id===id);
  if(!d)return;
  const claimed=isBrowseDealClaimed(d.merchant,d.discount);
  const brand=getBrandFor(d.merchant);
  const bgCss=brandGradientCss(brand);
  const sourceLabel=source==='local'?'📍 Local · '+d.distance+' mi · '+d.time:'🌐 Online · no location needed';
  const html='<div class="modal-handle"></div>'+
    '<div style="background:'+bgCss+';border-radius:16px;padding:18px;color:'+brand.text+';margin-bottom:14px;text-align:center;box-shadow:'+brandCardShadow()+'">'+
      '<p style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.85;margin:0">'+escapeHtml(d.category)+'</p>'+
      '<h3 style="font-size:22px;font-weight:800;margin:6px 0 4px">'+escapeHtml(d.merchant)+'</h3>'+
      '<p style="font-size:18px;font-weight:700;margin:0">'+escapeHtml(d.discount)+'</p>'+
    '</div>'+
    '<p style="font-size:11px;font-weight:700;letter-spacing:1px;color:var(--text-dim);text-transform:uppercase;margin:0 0 6px">'+sourceLabel+'</p>'+
    '<p style="font-size:14px;color:#1A1A1A;line-height:1.5;margin:0 0 14px">'+escapeHtml(d.description||d.subtitle||'')+'</p>'+
    (d.terms?'<div style="background:#F8F8F8;border-radius:10px;padding:12px;margin-bottom:14px"><p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);margin:0 0 4px">Terms</p><p style="font-size:12px;color:#333;margin:0;line-height:1.5">'+escapeHtml(d.terms)+'</p></div>':'')+
    (d.code?'<div style="background:#F0F9FF;border:1px dashed #2563EB;border-radius:10px;padding:12px;margin-bottom:14px;text-align:center"><p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#1E40AF;margin:0 0 4px">Code</p><p style="font-family:ui-monospace,monospace;font-size:18px;font-weight:800;color:#1A1A1A;margin:0;letter-spacing:2px">'+escapeHtml(d.code)+'</p></div>':'')+
    '<p style="font-size:11px;color:var(--text-dim);margin:0 0 12px">⏰ Expires '+fmtDate(d.expiry)+'</p>'+
    (d.url?'<a href="'+escapeHtml(d.url)+'" target="_blank" rel="noopener" style="display:block;text-align:center;width:100%;padding:12px;border-radius:12px;background:#F0F0F0;color:#333;font-size:13px;font-weight:700;text-decoration:none;margin-bottom:10px">Visit merchant ↗</a>':'')+
    (claimed
      ?'<button disabled style="width:100%;background:#EAFBF4;color:#065F46;border:none;padding:14px;border-radius:14px;font-size:14px;font-weight:700;cursor:not-allowed">✓ Already in your wallet</button>'
      :'<button onclick="claimBrowseDeal(\''+escapeAttr(d.id)+'\',\''+source+'\');closeModal();" style="width:100%;background:#10B981;color:white;border:none;padding:14px;border-radius:14px;font-size:14px;font-weight:800;cursor:pointer">Claim deal · +1 spin</button>');
  openModal(html);
};

window.claimBrowseDeal=function(idOrMerchant,source,maybeDiscount,maybeCategory,maybeCode,maybeExpiry){
  // Backward-compatible: old call signature was (merchant, discount, category, code, expiry)
  // New signature: (id, source) — looks up the full deal record
  let d;
  if(maybeDiscount===undefined){
    // New signature
    const list=source==='local'?getSampleLocalDeals():getSampleOnlineDeals();
    d=list.find(x=>x.id===idOrMerchant);
    if(!d){toast('Deal not found');return;}
  } else {
    // Legacy signature — synthesize a record
    d={merchant:idOrMerchant,discount:source,category:maybeDiscount,code:maybeCategory,expiry:maybeCode};
    source=null;
  }
  // Dedupe: block claiming the same Browse deal twice.
  // Spec: feature-deal-dedupe AC #7 (claim path).
  const dup=window.findDuplicateDeal({merchant:d.merchant,discount:d.discount,expiry:d.expiry||'',code:d.code||''});
  if(dup){
    toast('You already saved this deal — '+dup.merchant);
    return;
  }
  state.deals.push({
    id:uid(),
    merchant:d.merchant,
    discount:d.discount,
    category:d.category,
    code:d.code||'',
    expiry:d.expiry,
    address:d.address||'',
    url:d.url||'',
    value:parseValue(d.discount),
    notes:d.description||'Claimed from Browse',
    source:source||null,                 // 'local' | 'online' | null (legacy)
    sourceMeta:source==='local'?{distance:d.distance,time:d.time}:null,
    redeemed:false,
    createdAt:Date.now()
  });
  state.rewards.spins+=1;
  save(K.deals,state.deals);save(K.rewards,state.rewards);
  toast('✓ Added to wallet · +1 spin');
  completeMission('save');
  checkTierUp();
  scheduleReminders();
  renderAll();
  renderBrowse();
};

function parseValue(disc){
  const dol=disc.match(/\$(\d+)/);if(dol)return parseInt(dol[1]);
  const pct=disc.match(/(\d+)%/);if(pct)return parseInt(pct[1]);
  if(/free/i.test(disc))return 5;
  return 5;
}

window.setBrowseTab=function(tab){
  currentBrowseTab=tab;
  document.querySelectorAll('.btab').forEach(b=>{
    b.classList.remove('active');b.style.background='white';b.style.color='#6B6A64';b.style.borderColor='rgba(0,0,0,0.08)';
  });
  const a=document.querySelector('.btab[data-btab="'+tab+'"]');
  if(a){a.classList.add('active');a.style.background='#1A1A1A';a.style.color='white';a.style.borderColor='#1A1A1A';}
  document.querySelectorAll('.bsection').forEach(s=>s.style.display='none');
  document.querySelector('.bsection[data-bsection="'+tab+'"]').style.display='block';
};

// -------- Rewards (Gamified: Missions · Streak fire · Surprise unlocks · Tier celebrations) --------

// Mission templates - reset daily. Each id is unique; pts is bonus on completion.
const MISSION_TEMPLATES=[
  {id:'save',label:'Save a deal',sub:'Snap, upload, or claim from Browse',pts:10,emoji:'📸',gradient:'linear-gradient(135deg,#FF6B6B,#FFA06B)'},
  {id:'share',label:'Share with community',sub:'Pool a deal for others to claim',pts:15,emoji:'📤',gradient:'linear-gradient(135deg,#6366F1,#C084FC)'},
  {id:'redeem',label:'Redeem a deal',sub:'Mark one redeemed at checkout',pts:25,emoji:'✓',gradient:'linear-gradient(135deg,#00C9A7,#4FACFE)'}
];

// Streak levels — visual flame intensity + perks
const STREAK_LEVELS=[
  {min:0,emoji:'',label:'Start your streak',color:'#9CA3AF',glow:'none',perk:'Save a deal today to begin'},
  {min:1,emoji:'🔥',label:'On fire',color:'#FF6B6B',glow:'0 0 12px rgba(255,107,107,0.6)',perk:'+1 spin per redeem'},
  {min:3,emoji:'🔥🔥',label:'3-day streak',color:'#FF4500',glow:'0 0 18px rgba(255,69,0,0.7)',perk:'Unlocked: 3× points on Sundays'},
  {min:7,emoji:'🔥🔥🔥',label:'Week warrior',color:'#FF1A1A',glow:'0 0 24px rgba(255,26,26,0.85)',perk:'Unlocked: 2× spin wheel rewards'},
  {min:30,emoji:'🌋',label:'Inferno',color:'#9333EA',glow:'0 0 32px rgba(147,51,234,0.9)',perk:'Legendary: All rewards doubled'}
];

// Surprise unlocks — locked features visible to drive aspiration; deliverUnlockPerk grants the actual benefit
const UNLOCKS=[
  {id:'bonus_pool',pts:100,title:'Bonus deal pool',sub:'Free curated deal added to your wallet',emoji:'🎁',gradient:'linear-gradient(135deg,#FFD700,#FFA500)'},
  {id:'priority_share',pts:200,title:'Priority sharing',sub:'2× points on every share you make',emoji:'⚡',gradient:'linear-gradient(135deg,#6366F1,#C084FC)'},
  {id:'double_spin',pts:300,title:'Sunday bonus spin',sub:'+1 free spin every Sunday automatically',emoji:'🎰',gradient:'linear-gradient(135deg,#F472B6,#FB923C)'},
  {id:'early_access',pts:500,title:'Early-access deals',sub:'See partner deals 24 hours early in Browse',emoji:'🚀',gradient:'linear-gradient(135deg,#00C9A7,#4FACFE)'},
  {id:'platinum_perks',pts:750,title:'Platinum perks',sub:'1.5× multiplier on all points earned',emoji:'💎',gradient:'linear-gradient(135deg,#A78BFA,#6366F1)'}
];

function getTierForPoints(p){let cur=TIERS[0];for(const t of TIERS){if(p>=t.min)cur=t;}return cur;}
function getCurrentTier(){return getTierForPoints(state.rewards.points);}

// Multipliers from active unlocks
function hasUnlock(id){return (state.rewards.unlocksSeen||[]).includes(id);}
function pointMultiplier(){return hasUnlock('platinum_perks')?1.5:1;}
function shareMultiplier(){return hasUnlock('priority_share')?2:1;}
function applyMultiplier(pts){return Math.round(pts*pointMultiplier());}

function getStreakLevel(){
  const s=state.rewards.streak||0;
  let lvl=STREAK_LEVELS[0];
  for(const l of STREAK_LEVELS){if(s>=l.min)lvl=l;}
  return lvl;
}

// Reset daily missions if date changed; called on every render
function refreshDailyMissions(){
  const today=todayStr();
  if(!state.rewards.missions||state.rewards.missions.date!==today){
    state.rewards.missions={date:today,done:{}};
    save(K.rewards,state.rewards);
  }
}

// Mark a mission complete; returns true if newly completed (so caller can show toast)
function completeMission(missionId){
  refreshDailyMissions();
  const tmpl=MISSION_TEMPLATES.find(m=>m.id===missionId);
  if(!tmpl)return false;
  if(state.rewards.missions.done[missionId])return false;
  state.rewards.missions.done[missionId]=Date.now();
  state.rewards.points+=tmpl.pts;
  save(K.rewards,state.rewards);
  toast('🎯 Mission complete: '+tmpl.label+' · +'+tmpl.pts+' pts');
  // Check if all missions for the day done -> bonus spin
  const allDone=MISSION_TEMPLATES.every(m=>state.rewards.missions.done[m.id]);
  if(allDone){
    state.rewards.spins=(state.rewards.spins||0)+1;
    save(K.rewards,state.rewards);
    setTimeout(()=>toast('🎁 All daily missions complete! +1 bonus spin'),1200);
  }
  // Tier-up check after points gained
  setTimeout(checkTierUp,300);
  return true;
}

// Detect tier crossings and trigger celebration
function checkTierUp(){
  const newTier=getCurrentTier();
  const lastTierName=state.rewards.lastSeenTier||'BRONZE';
  if(newTier.name!==lastTierName){
    const oldIdx=TIERS.findIndex(t=>t.name===lastTierName);
    const newIdx=TIERS.findIndex(t=>t.name===newTier.name);
    if(newIdx>oldIdx){
      state.rewards.lastSeenTier=newTier.name;
      save(K.rewards,state.rewards);
      celebrateTierUp(newTier);
    } else {
      // Just sync without celebrating downgrades
      state.rewards.lastSeenTier=newTier.name;
      save(K.rewards,state.rewards);
    }
  }
  // Also check unlocks
  checkUnlocks();
}

function checkUnlocks(){
  const seen=state.rewards.unlocksSeen||[];
  for(const u of UNLOCKS){
    if(state.rewards.points>=u.pts && !seen.includes(u.id)){
      state.rewards.unlocksSeen=[...seen,u.id];
      save(K.rewards,state.rewards);
      // Trigger the actual perk delivery
      deliverUnlockPerk(u);
      break; // one announcement at a time
    }
  }
}

// Deliver a tangible perk when an unlock fires
function deliverUnlockPerk(unlock){
  let bodyText='',extraReward=null;
  if(unlock.id==='bonus_pool'){
    // Drop a curated free deal into wallet right now
    const bonusDeals=[
      {merchant:'Starbucks',discount:'Free tall drink',category:'Dining',code:'PERQBONUS',value:6,expiry:futureDate(14)},
      {merchant:'Target',discount:'$10 off $50',category:'Groceries',code:'PERQ10',value:10,expiry:futureDate(21)},
      {merchant:'Chipotle',discount:'BOGO entrée',category:'Dining',code:'PERQBOGO',value:12,expiry:futureDate(10)},
      {merchant:'Sephora',discount:'15% off skincare',category:'Beauty',code:'PERQGLOW',value:15,expiry:futureDate(14)}
    ];
    const pick=bonusDeals[Math.floor(Math.random()*bonusDeals.length)];
    state.deals.push({
      id:uid(),merchant:pick.merchant,discount:pick.discount,category:pick.category,
      code:pick.code,value:pick.value,expiry:pick.expiry,
      notes:'Bonus deal — unlocked at 100 pts',redeemed:false,createdAt:Date.now(),isBonus:true
    });
    save(K.deals,state.deals);
    extraReward='<div style="background:linear-gradient(135deg,#FF6B6B,#FFA06B);border-radius:14px;padding:14px;color:white;margin:14px 0;text-align:left">'+
      '<p style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;opacity:0.9;margin:0">Added to your wallet</p>'+
      '<p style="font-size:18px;font-weight:800;margin:4px 0 2px">'+escapeHtml(pick.merchant)+'</p>'+
      '<p style="font-size:13px;font-weight:600;margin:0;opacity:0.95">'+escapeHtml(pick.discount)+'</p>'+
      '<p style="font-size:11px;opacity:0.85;margin:6px 0 0">Code: <strong style="font-family:ui-monospace,monospace">'+escapeHtml(pick.code)+'</strong> · Expires '+fmtDate(pick.expiry)+'</p>'+
    '</div>';
    bodyText='You scored a free curated deal — it\'s already in your Wallet, ready to redeem.';
  } else if(unlock.id==='priority_share'){
    bodyText='From now on, every deal you share to community earns <strong>2× points</strong> instead of 5. Your shares also surface at the top of community feeds.';
  } else if(unlock.id==='double_spin'){
    bodyText='Every Sunday from now on you get <strong>+1 bonus spin</strong> automatically. Spins also stack — they don\'t expire.';
    // Grant immediate bonus spin if today is Sunday
    if(new Date().getDay()===0){
      state.rewards.spins=(state.rewards.spins||0)+1;
      save(K.rewards,state.rewards);
      extraReward='<div style="background:#FEF3C7;border:1px solid #FBBF24;border-radius:12px;padding:12px;margin:14px 0;text-align:left;color:#92400E"><p style="font-size:12px;font-weight:700;margin:0">🎁 +1 Sunday bonus spin already added</p></div>';
    }
  } else if(unlock.id==='early_access'){
    bodyText='Browse now shows <strong>partner-exclusive deals 24 hours early</strong>, tagged with 🚀. First-claim wins.';
  } else if(unlock.id==='platinum_perks'){
    bodyText='All point gains are now <strong>1.5× multiplied</strong>. Plus monthly bonus pack delivered automatically.';
  }
  const html='<div class="modal-handle"></div>'+
    '<div style="text-align:center;padding:8px 0 4px">'+
      '<div style="font-size:64px;line-height:1;animation:tierPop 0.6s cubic-bezier(0.34,1.56,0.64,1);margin-bottom:6px">'+unlock.emoji+'</div>'+
      '<p style="font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin:14px 0 4px">🔓 Unlocked at '+unlock.pts+' pts</p>'+
      '<h2 style="font-size:24px;font-weight:900;letter-spacing:-0.5px;margin:0 0 12px;background:'+unlock.gradient+';-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">'+escapeHtml(unlock.title)+'</h2>'+
      '<p style="font-size:14px;color:var(--text);margin:0;line-height:1.5">'+bodyText+'</p>'+
      (extraReward||'')+
      '<button onclick="closeModal()" style="width:100%;background:#1A1A1A;color:white;padding:14px;border-radius:14px;font-size:14px;font-weight:800;margin-top:14px">'+(unlock.id==='bonus_pool'?'See it in my Wallet':'Got it')+'</button>'+
    '</div>';
  setTimeout(()=>{
    triggerConfetti();
    openModal(html);
    if(typeof renderAll==='function')renderAll();
  },300);
}

// Confetti burst — pure DOM, no library
function triggerConfetti(){
  const root=document.getElementById('confetti-root');
  if(!root)return;
  root.innerHTML='';
  const colors=['#FFE16B','#FF6B6B','#00C9A7','#6366F1','#F472B6','#FFA06B','#4FACFE'];
  const N=70;
  for(let i=0;i<N;i++){
    const el=document.createElement('span');
    el.className='confetti-piece';
    el.style.left=(Math.random()*100)+'%';
    el.style.background=colors[i%colors.length];
    el.style.animationDelay=(Math.random()*0.4)+'s';
    el.style.animationDuration=(1.8+Math.random()*1.4)+'s';
    el.style.transform='rotate('+(Math.random()*360)+'deg)';
    root.appendChild(el);
  }
  setTimeout(()=>{root.innerHTML='';},3500);
}

function celebrateTierUp(tier){
  triggerConfetti();
  const html='<div class="modal-handle"></div>'+
    '<div style="text-align:center;padding:8px 0 4px">'+
      '<div style="font-size:72px;line-height:1;animation:tierPop 0.6s cubic-bezier(0.34,1.56,0.64,1)">'+tier.emoji+'</div>'+
      '<p style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--text-dim);margin:14px 0 4px">Tier unlocked</p>'+
      '<h2 style="font-size:32px;font-weight:900;letter-spacing:-1px;margin:0 0 8px;background:linear-gradient(135deg,'+tier.colors[0]+','+tier.colors[1]+');-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">'+tier.name+'</h2>'+
      '<p style="font-size:14px;color:var(--text-dim);margin:0 0 24px;line-height:1.5">You\'ve hit '+tier.min+' points.<br>Welcome to the '+tier.name.toLowerCase()+' club.</p>'+
      '<div style="background:linear-gradient(135deg,'+tier.colors[0]+','+tier.colors[1]+');border-radius:20px;padding:20px;color:white;margin-bottom:20px;box-shadow:0 8px 24px rgba(0,0,0,0.15)">'+
        '<p style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;opacity:0.85;margin:0">'+(state.profile?.name||'You')+'\'s tier</p>'+
        '<p style="font-size:24px;font-weight:900;margin:6px 0 0;letter-spacing:-0.5px">'+tier.emoji+' '+tier.name+'</p>'+
        '<p style="font-size:12px;opacity:0.85;margin:8px 0 0">'+state.rewards.points.toLocaleString()+' points</p>'+
      '</div>'+
      '<button onclick="closeModal()" style="width:100%;background:#1A1A1A;color:white;padding:14px;border-radius:14px;font-size:14px;font-weight:800">Keep going</button>'+
    '</div>';
  setTimeout(()=>openModal(html),200);
}

function renderRewards(){
  refreshDailyMissions();
  const root=document.getElementById('rewards-root');
  if(!root)return;
  const tier=getCurrentTier();
  const streak=getStreakLevel();
  const nextTier=tier.next===Infinity?null:TIERS[TIERS.indexOf(tier)+1];
  const pct=tier.next===Infinity?100:Math.min(100,((state.rewards.points-tier.min)/(tier.next-tier.min))*100);

  // 1) Header
  let html='<div style="padding:0 20px 12px;display:flex;align-items:center;gap:12px">'+
    '<button class="icon-btn" onclick="goPage(\'wallet\')"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>'+
    '<h2 style="color:white;font-size:24px;font-weight:800;margin:0;flex:1">Rewards</h2>'+
  '</div>';

  // 2) Compact top row — streak + points side by side
  const streakCount=state.rewards.streak||0;
  html+='<div style="margin:0 20px 14px;display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
    // Streak tile
    '<div style="background:rgba(255,255,255,0.95);backdrop-filter:blur(20px);border-radius:18px;padding:14px;box-shadow:0 4px 14px rgba(0,0,0,0.08);position:relative;overflow:hidden">'+
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,'+(streakCount>0?streak.color:'#E5E7EB')+','+(streakCount>0?streak.color:'#D1D5DB')+');display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:'+streak.glow+';flex-shrink:0;'+(streakCount>0?'animation:flamePulse 1.4s ease-in-out infinite':'')+'">'+(streak.emoji||'❄️')+'</div>'+
        '<div style="min-width:0;flex:1">'+
          '<p style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);margin:0">Streak</p>'+
          '<p style="font-size:18px;font-weight:900;margin:0;letter-spacing:-0.5px;line-height:1.1">'+streakCount+'<span style="font-size:11px;font-weight:700;color:var(--text-dim);margin-left:3px">day'+(streakCount===1?'':'s')+'</span></p>'+
        '</div>'+
      '</div>'+
    '</div>'+
    // Points tile
    '<div style="background:white;border-radius:18px;padding:14px;box-shadow:0 4px 14px rgba(0,0,0,0.08);position:relative;overflow:hidden">'+
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,'+tier.colors[0]+','+tier.colors[1]+');display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;color:white">'+tier.emoji+'</div>'+
        '<div style="min-width:0;flex:1">'+
          '<p style="font-size:9px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);margin:0">'+tier.name+'</p>'+
          '<p style="font-size:18px;font-weight:900;margin:0;letter-spacing:-0.5px;line-height:1.1">'+state.rewards.points.toLocaleString()+'<span style="font-size:11px;font-weight:700;color:var(--text-dim);margin-left:3px">pts</span></p>'+
        '</div>'+
      '</div>'+
      '<div style="background:#f0f0f0;border-radius:999px;height:4px;overflow:hidden;margin-top:8px">'+
        '<div style="background:linear-gradient(90deg,'+tier.colors[0]+','+tier.colors[1]+');height:100%;width:'+pct+'%;border-radius:999px;transition:width .5s"></div>'+
      '</div>'+
    '</div>'+
  '</div>';

  // 3) Spin wheel (now above the fold)
  const spinsAvailable=state.rewards.spins||0;
  html+='<div style="margin:0 20px 14px;background:white;border-radius:24px;padding:18px;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.06)">'+
    '<p style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text-dim);margin:0 0 10px">🎰 Spin to win</p>'+
    '<div style="position:relative;width:200px;height:200px;margin:0 auto 12px">'+
      '<div style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-top:16px solid #1A1A1A;z-index:2;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))"></div>'+
      '<svg id="wheel" viewBox="0 0 220 220" style="width:100%;height:100%;transition:transform 4.5s cubic-bezier(0.17,0.67,0.21,0.99);transform-origin:50% 50%">'+
        '<path d="M110 110 L110 0 A110 110 0 0 1 187.78 32.22 Z" fill="#FF6B6B"/>'+
        '<path d="M110 110 L187.78 32.22 A110 110 0 0 1 220 110 Z" fill="#FFA06B"/>'+
        '<path d="M110 110 L220 110 A110 110 0 0 1 187.78 187.78 Z" fill="#FFE16B"/>'+
        '<path d="M110 110 L187.78 187.78 A110 110 0 0 1 110 220 Z" fill="#4FACFE"/>'+
        '<path d="M110 110 L110 220 A110 110 0 0 1 32.22 187.78 Z" fill="#C084FC"/>'+
        '<path d="M110 110 L32.22 187.78 A110 110 0 0 1 0 110 Z" fill="#F472B6"/>'+
        '<path d="M110 110 L0 110 A110 110 0 0 1 32.22 32.22 Z" fill="#34D399"/>'+
        '<path d="M110 110 L32.22 32.22 A110 110 0 0 1 110 0 Z" fill="#FBBF24"/>'+
        '<text x="132" y="58" text-anchor="middle" font-size="11" font-weight="800" fill="white">+10</text>'+
        '<text x="164" y="92" text-anchor="middle" font-size="11" font-weight="800" fill="white">DEAL</text>'+
        '<text x="164" y="135" text-anchor="middle" font-size="11" font-weight="800" fill="white">+25</text>'+
        '<text x="132" y="166" text-anchor="middle" font-size="13" font-weight="800" fill="white">?</text>'+
        '<text x="88" y="166" text-anchor="middle" font-size="11" font-weight="800" fill="white">+5</text>'+
        '<text x="56" y="135" text-anchor="middle" font-size="11" font-weight="800" fill="white">JACK</text>'+
        '<text x="56" y="92" text-anchor="middle" font-size="11" font-weight="800" fill="white">+15</text>'+
        '<text x="88" y="58" text-anchor="middle" font-size="11" font-weight="800" fill="white">SPIN</text>'+
      '</svg>'+
      '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:46px;height:46px;border-radius:50%;background:white;border:3px solid #1A1A1A;display:flex;align-items:center;justify-content:center;font-size:18px;z-index:1">🎰</div>'+
    '</div>'+
    '<p id="spins-available" style="font-size:12px;color:var(--text-dim);margin:0 0 10px">'+
      (spinsAvailable>0
        ?spinsAvailable+' spin'+(spinsAvailable===1?'':'s')+' available'
        :'Save a deal to earn spins (+1 per save)')+
    '</p>'+
    '<button id="spin-btn" onclick="doSpin()" '+(spinsAvailable<1?'disabled':'')+' style="background:linear-gradient(135deg,#1A1A1A,#2A2A3E);color:white;padding:12px 28px;border-radius:999px;font-size:13px;font-weight:800;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(0,0,0,0.2);'+(spinsAvailable<1?'opacity:0.5':'')+'">⚡ SPIN NOW</button>'+
    '<p id="spin-result" style="margin-top:8px;font-size:13px;font-weight:700;color:var(--accent-dark);min-height:16px"></p>'+
  '</div>';

  // 4) Daily missions
  const done=state.rewards.missions.done||{};
  const completedCount=MISSION_TEMPLATES.filter(m=>done[m.id]).length;
  html+='<div style="margin:0 20px 14px">'+
    '<div style="display:flex;align-items:baseline;justify-content:space-between;padding:0 4px 8px">'+
      '<p style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:white;margin:0">🎯 Daily missions</p>'+
      '<p style="font-size:11px;color:rgba(255,255,255,0.85);margin:0;font-weight:600">'+completedCount+'/'+MISSION_TEMPLATES.length+' done</p>'+
    '</div>'+
    MISSION_TEMPLATES.map(m=>{
      const isDone=!!done[m.id];
      return '<div style="background:white;border-radius:14px;padding:12px;margin-bottom:6px;display:flex;align-items:center;gap:10px;'+(isDone?'opacity:0.55':'box-shadow:0 2px 8px rgba(0,0,0,0.06)')+'">'+
        '<div style="width:38px;height:38px;border-radius:10px;background:'+m.gradient+';display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;'+(isDone?'filter:grayscale(0.5)':'')+'">'+m.emoji+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<p style="font-size:13px;font-weight:700;margin:0;'+(isDone?'text-decoration:line-through;color:var(--text-dim)':'')+'">'+escapeHtml(m.label)+'</p>'+
          '<p style="font-size:11px;color:var(--text-dim);margin:1px 0 0">'+escapeHtml(m.sub)+'</p>'+
        '</div>'+
        '<div style="flex-shrink:0">'+
          (isDone
            ?'<span style="background:#EAFBF4;color:#065F46;font-size:10px;font-weight:800;padding:5px 9px;border-radius:999px">✓ Done</span>'
            :'<span style="background:'+m.gradient+';color:white;font-size:10px;font-weight:800;padding:5px 9px;border-radius:999px">+'+m.pts+' pts</span>')+
        '</div>'+
      '</div>';
    }).join('')+
  '</div>';

  // 5) Streak perk text (small footer line so user knows what their streak buys them)
  if(streakCount>0){
    html+='<div style="margin:0 20px 14px;padding:10px 14px;background:rgba(255,255,255,0.95);border-radius:12px;display:flex;align-items:center;gap:8px">'+
      '<span style="font-size:14px">'+streak.emoji+'</span>'+
      '<p style="font-size:11px;color:var(--text);margin:0;font-weight:600;flex:1">'+escapeHtml(streak.perk)+'</p>'+
    '</div>';
  }

  // 6) Surprise unlocks
  html+='<div style="margin:0 20px 16px">'+
    '<p style="font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:white;margin:0 4px 10px">🔓 Unlocks</p>'+
    UNLOCKS.map(u=>{
      const unlocked=state.rewards.points>=u.pts;
      const remaining=u.pts-state.rewards.points;
      const unlockPct=Math.min(100,(state.rewards.points/u.pts)*100);
      return '<div style="background:'+(unlocked?u.gradient:'rgba(255,255,255,0.95)')+';border-radius:18px;padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:12px;color:'+(unlocked?'white':'#1A1A1A')+';'+(unlocked?'box-shadow:0 6px 18px rgba(0,0,0,0.15)':'box-shadow:0 2px 8px rgba(0,0,0,0.06)')+';position:relative;overflow:hidden">'+
        (!unlocked?'<div style="position:absolute;left:0;bottom:0;height:3px;width:'+unlockPct+'%;background:linear-gradient(90deg,#10B981,#059669);transition:width .5s"></div>':'')+
        '<div style="width:44px;height:44px;border-radius:12px;background:'+(unlocked?'rgba(255,255,255,0.25)':u.gradient)+';display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;'+(!unlocked?'filter:grayscale(0.4) opacity(0.85)':'')+'">'+u.emoji+'</div>'+
        '<div style="flex:1;min-width:0">'+
          '<p style="font-size:14px;font-weight:800;margin:0">'+escapeHtml(u.title)+'</p>'+
          '<p style="font-size:11px;margin:2px 0 0;line-height:1.4;'+(unlocked?'opacity:0.9':'color:var(--text-dim)')+'">'+escapeHtml(u.sub)+'</p>'+
        '</div>'+
        '<div style="flex-shrink:0">'+
          (unlocked
            ?'<span style="background:rgba(255,255,255,0.25);color:white;font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px">✓ ACTIVE</span>'
            :'<span style="background:#1A1A1A;color:white;font-size:10px;font-weight:800;padding:4px 8px;border-radius:999px">'+remaining+' to go</span>')+
        '</div>'+
      '</div>';
    }).join('')+
  '</div>';

  root.innerHTML=html;
}

let spinning=false;
window.doSpin=function(){
  if(spinning||state.rewards.spins<1)return;
  spinning=true;
  state.rewards.spins-=1;
  const slices=[
    {label:'+10 pts',pts:10},{label:'Bonus deal!',pts:5},{label:'+25 pts',pts:25},
    {label:'Mystery 🎁',pts:5},{label:'+5 pts',pts:5},{label:'JACKPOT 100 pts!',pts:100},
    {label:'+15 pts',pts:15},{label:'Spin again',pts:0,respin:true}
  ];
  // 7-day streak doubles spin rewards
  const streakBonus=(state.rewards.streak||0)>=7?2:1;
  const idx=weightedPick([22,8,14,12,22,4,12,6]);
  const wheel=document.getElementById('wheel');
  if(!wheel){spinning=false;return;}
  const cur=parseFloat((wheel.style.transform.match(/-?[\d.]+/)||[0])[0])||0;
  const target=cur+360*5+(idx*45)+22.5;
  wheel.style.transform='rotate('+target+'deg)';
  document.getElementById('spin-btn').disabled=true;
  document.getElementById('spin-result').textContent='';
  setTimeout(()=>{
    const slice=slices[idx];
    const earned=applyMultiplier(slice.pts*streakBonus);
    let label=slice.label;
    if(streakBonus>1&&slice.pts>0)label+=' (×'+streakBonus+' streak!)';
    if(pointMultiplier()>1&&slice.pts>0)label+=' (Platinum boost)';
    const resultEl=document.getElementById('spin-result');
    if(resultEl)resultEl.textContent='🎉 '+label;
    state.rewards.points+=earned;
    if(slice.respin)state.rewards.spins+=1;
    save(K.rewards,state.rewards);
    spinning=false;
    checkTierUp();
    renderRewards();
  },4600);
};

function weightedPick(w){const t=w.reduce((a,b)=>a+b,0);let r=Math.random()*t;for(let i=0;i<w.length;i++){r-=w[i];if(r<=0)return i;}return 0;}

// -------- Loyalty barcode modal --------
window.showLoyaltyBarcode=function(id){
  const card=state.loyalty.find(c=>c.id===id);
  if(!card)return;
  const o=document.getElementById('modal-overlay');
  o.style.background='rgba(0,0,0,0.85)';o.style.alignItems='center';o.style.justifyContent='center';
  o.innerHTML='<div onclick="event.stopPropagation()" style="background:white;border-radius:24px;padding:24px;text-align:center;max-width:340px;width:calc(100% - 40px);margin:20px"><h3 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#1A1A1A">'+escapeHtml(card.name)+'</h3><p style="font-family:ui-monospace,monospace;font-size:14px;color:#777;margin:0 0 16px;letter-spacing:2px">'+escapeHtml(card.number)+'</p><div style="background:white;padding:16px;border:1px solid rgba(0,0,0,0.08);border-radius:14px"><div style="height:90px;background-image:repeating-linear-gradient(90deg,#1A1A1A 0px,#1A1A1A 2px,transparent 2px,transparent 4px,#1A1A1A 4px,#1A1A1A 8px,transparent 8px,transparent 10px,#1A1A1A 10px,#1A1A1A 12px,transparent 12px,transparent 16px);margin-bottom:12px"></div><p style="font-family:ui-monospace,monospace;font-size:12px;font-weight:700;letter-spacing:2px;margin:0;color:#1A1A1A">'+escapeHtml(card.number)+'</p></div><p style="font-size:11px;color:#777;margin:12px 0 16px">Show at checkout</p><div style="display:flex;gap:8px"><button onclick="deleteLoyalty(\''+card.id+'\')" style="flex:0 0 auto;background:#FFE5E5;color:#DC2626;padding:12px 16px;border-radius:999px;font-size:13px;font-weight:700">Delete</button><button onclick="closeModal()" style="flex:1;background:'+card.color+';color:white;padding:12px 32px;border-radius:999px;font-size:14px;font-weight:700">Done</button></div></div>';
  o.classList.add('active');
  o.onclick=closeModal;
};

window.deleteLoyalty=function(id){
  if(!confirm('Delete this card?'))return;
  state.loyalty=state.loyalty.filter(c=>c.id!==id);
  save(K.loyalty,state.loyalty);
  closeModal();
  toast('Card deleted');
  renderAll();
};

// -------- Modal infrastructure --------
function openModal(html){
  const o=document.getElementById('modal-overlay');
  o.style.alignItems='flex-end';o.style.justifyContent='flex-start';o.style.background='rgba(0,0,0,0.5)';
  o.innerHTML='<div class="modal" onclick="event.stopPropagation()">'+html+'</div>';
  o.classList.add('active');
  o.onclick=closeModal;
}
window.closeModal=function(){
  const o=document.getElementById('modal-overlay');
  o.classList.remove('active');o.innerHTML='';
};

// -------- Snap Sheet (now includes ALL add types) --------
window.openSnapSheet=function(){
  const html='<div class="modal-handle"></div><h3 class="modal-title">What would you like to add?</h3>'+
    '<button class="snap-option" onclick="closeModal();triggerCamera()"><div class="snap-option-icon gradient-warm"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div><div class="snap-option-info"><p class="snap-option-title">Snap a deal</p><p class="snap-option-sub">Take a photo of a coupon</p></div></button>'+
    '<button class="snap-option" onclick="closeModal();triggerLibrary()"><div class="snap-option-icon gradient-purple"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div><div class="snap-option-info"><p class="snap-option-title">Upload from library</p><p class="snap-option-sub">Pick a screenshot or saved image</p></div></button>'+
    '<button class="snap-option" onclick="closeModal();openAddManual()"><div class="snap-option-icon gradient-pink"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div><div class="snap-option-info"><p class="snap-option-title">Type a deal</p><p class="snap-option-sub">Enter merchant and discount manually</p></div></button>'+
    '<div style="border-top:1px solid var(--border);margin:12px 0"></div>'+
    '<button class="snap-option" onclick="closeModal();openAddProgram()"><div class="snap-option-icon gradient-yellow"><svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div class="snap-option-info"><p class="snap-option-title">Add reward program</p><p class="snap-option-sub">Airline miles, hotel points, credit card</p></div></button>'+
    '<button class="snap-option" onclick="closeModal();openAddLoyalty()"><div class="snap-option-icon gradient-green"><svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="10" x2="6" y2="14"/><line x1="10" y1="10" x2="10" y2="14"/><line x1="14" y1="10" x2="14" y2="14"/><line x1="18" y1="10" x2="18" y2="14"/></svg></div><div class="snap-option-info"><p class="snap-option-title">Add loyalty card</p><p class="snap-option-sub">Costco, CVS, Walgreens — any card</p></div></button>';
  openModal(html);
};

window.triggerCamera=function(){
  const i=document.getElementById('capture-input');
  i.setAttribute('capture','environment');i.click();
};
window.triggerLibrary=function(){
  const i=document.getElementById('capture-input');
  i.removeAttribute('capture');i.click();
};

document.getElementById('capture-input').addEventListener('change',(e)=>{
  const f=e.target.files&&e.target.files[0];
  if(!f)return;
  const mode=e.target.getAttribute('data-mode');
  e.target.removeAttribute('data-mode');
  const r=new FileReader();
  r.onload=async ()=>{
    // Compress + normalize orientation for consistent OCR results
    const compressed=await compressAndOrient(r.result,1600,0.85);
    if(mode==='loyalty'){
      runLoyaltyScanFlow(compressed);
    } else {
      pendingDealImage=compressed;
      runScanFlow(pendingDealImage);
    }
  };
  r.readAsDataURL(f);
  e.target.value='';
});

// Compress + auto-orient camera images (helps OCR consistency between camera & upload)
async function compressAndOrient(dataUrl,maxDim,quality){
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      let w=img.naturalWidth,h=img.naturalHeight;
      if(w>maxDim||h>maxDim){
        const ratio=maxDim/Math.max(w,h);
        w=Math.round(w*ratio);h=Math.round(h*ratio);
      }
      const canvas=document.createElement('canvas');
      canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d');
      ctx.imageSmoothingQuality='high';
      ctx.drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL('image/jpeg',quality));
    };
    img.onerror=()=>resolve(dataUrl);
    img.src=dataUrl;
  });
}

async function runLoyaltyScanFlow(imageDataUrl){
  const overlay=document.getElementById('scan-overlay');
  document.getElementById('scan-image').src=imageDataUrl;
  overlay.style.display='flex';
  const steps=[
    {id:'scan-step-1',title:'Reading card…',sub:'Detecting store name'},
    {id:'scan-step-2',title:'Extracting number…',sub:'Locating card or member ID'},
    {id:'scan-step-3',title:'Polishing…',sub:'Almost done'},
    {id:'scan-step-4',title:'Ready!',sub:'Tap below to review'}
  ];
  for(let i=1;i<=4;i++){const el=document.getElementById('scan-step-'+i);el.removeAttribute('data-active');el.removeAttribute('data-done');}

  const extractPromise=extractLoyaltyFromImage(imageDataUrl);

  for(let i=0;i<steps.length-1;i++){
    document.getElementById('scan-title').textContent=steps[i].title;
    document.getElementById('scan-sub').textContent=steps[i].sub;
    document.getElementById(steps[i].id).setAttribute('data-active','true');
    await sleep(800);
    document.getElementById(steps[i].id).removeAttribute('data-active');
    document.getElementById(steps[i].id).setAttribute('data-done','true');
  }
  let extracted=null,extractError=null;
  try{extracted=await extractPromise;}catch(e){extractError=e;}

  if(extractError){
    document.getElementById('scan-title').textContent='Scan failed';
    document.getElementById('scan-sub').textContent='Fill in manually';
  } else {
    document.getElementById('scan-title').textContent='Ready!';
    document.getElementById('scan-sub').textContent='Review and save';
  }
  document.getElementById('scan-step-4').setAttribute('data-active','true');
  await sleep(extractError?1500:600);
  overlay.style.display='none';
  openLoyaltyManualPrefilled(extracted||{},imageDataUrl);
}

async function extractLoyaltyFromImage(imageDataUrl){
  const match=imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if(!match)throw new Error('Invalid image');
  const mediaType=match[1],b64=match[2];
  const prompt=`Extract loyalty/membership card details from this image. Return ONLY a JSON object:
{
  "name": "store or program name on the card",
  "number": "card or member number (digits and spaces only)",
  "expiry": "YYYY-MM-DD if visible, else empty string"
}
Read carefully — get the name and number EXACTLY as shown. Return only JSON.`;

  if(OCR_PROXY_URL){
    try{
      const resp=await fetch(OCR_PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:b64,mediaType,prompt})});
      if(resp.ok){
        const data=await resp.json();
        if(data.ok&&data.result)return data.result;
      }
    }catch(e){}
  }
  throw new Error('Scan service unavailable');
}

function openLoyaltyManualPrefilled(data,image){
  const colors=['#DC2626','#059669','#7C3AED','#2563EB','#D97706','#1F2937'];
  let html='<div class="modal-handle"></div><h3 class="modal-title">Review & save</h3>';
  html+=dealImageFrame(image,'loyalty-form-img');
  if(data.name||data.number){
    html+='<div style="background:#EAFBF4;border:1px solid #00C9A7;border-radius:12px;padding:10px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#065F46;font-weight:600"><span style="font-size:16px">✨</span>AI extracted these details</div>';
  }
  html+='<div class="form-row"><label>Store name *</label><input id="lc-name" placeholder="Costco" value="'+escapeHtml(data.name||'')+'"></div>';
  html+='<div class="form-row"><label>Card / member number *</label><input id="lc-number" placeholder="Card number, member ID, or alphanumeric" value="'+escapeHtml(data.number||'')+'"></div>';
  html+='<div class="form-row"><label>Card color</label><div style="display:flex;gap:8px;flex-wrap:wrap" id="color-picker">'+
    colors.map((c,i)=>'<button data-color="'+c+'" style="width:40px;height:40px;border-radius:10px;background:'+c+';border:'+(i===0?'3px solid #1A1A1A':'3px solid transparent')+'"></button>').join('')+
  '</div></div>';
  html+='<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveLoyalty()">Save</button></div>';
  openModal(html);
  let color='#DC2626';
  document.querySelectorAll('#color-picker button').forEach(b=>{
    b.addEventListener('click',()=>{
      color=b.getAttribute('data-color');
      document.querySelectorAll('#color-picker button').forEach(x=>x.style.border='3px solid transparent');
      b.style.border='3px solid #1A1A1A';
    });
  });
  window._lcColor=()=>color;
}

// -------- Scan Flow Animation + AI Extract --------
async function runScanFlow(imageDataUrl){
  const overlay=document.getElementById('scan-overlay');
  document.getElementById('scan-image').src=imageDataUrl;
  overlay.style.display='flex';

  const steps=[
    {id:'scan-step-1',title:'Analyzing image…',sub:'Detecting deal structure'},
    {id:'scan-step-2',title:'Extracting details…',sub:'Reading merchant, discount, code, expiry'},
    {id:'scan-step-3',title:'Polishing data…',sub:'Categorizing and normalizing'},
    {id:'scan-step-4',title:'Ready to save!',sub:'Tap below to review and save'}
  ];

  // Reset all steps
  for(let i=1;i<=4;i++){
    const el=document.getElementById('scan-step-'+i);
    el.removeAttribute('data-active');
    el.removeAttribute('data-done');
  }

  // Start extraction in parallel with animation
  const extractPromise=extractDealFromImage(imageDataUrl);

  // Animate steps
  for(let i=0;i<steps.length-1;i++){
    document.getElementById('scan-title').textContent=steps[i].title;
    document.getElementById('scan-sub').textContent=steps[i].sub;
    document.getElementById(steps[i].id).setAttribute('data-active','true');
    await sleep(900);
    document.getElementById(steps[i].id).removeAttribute('data-active');
    document.getElementById(steps[i].id).setAttribute('data-done','true');
  }

  // Wait for extraction to complete
  let extracted=null;
  let extractError=null;
  try{extracted=await extractPromise;}
  catch(e){extractError=e;}

  // Final step
  if(extractError&&extractError.message==='NO_KEY'){
    document.getElementById('scan-title').textContent='OCR not configured';
    document.getElementById('scan-sub').textContent='Add your Anthropic API key in Settings to enable AI scanning';
  } else if(extractError){
    document.getElementById('scan-title').textContent='Scan failed';
    document.getElementById('scan-sub').textContent=extractError.message+' — fill in manually';
  } else {
    document.getElementById('scan-title').textContent=steps[3].title;
    document.getElementById('scan-sub').textContent=steps[3].sub;
  }
  document.getElementById('scan-step-4').setAttribute('data-active','true');
  await sleep(extractError?1800:700);

  // Hide scan overlay, show preview with whatever we got (empty if error)
  overlay.style.display='none';
  openDealPreview(extracted||{},imageDataUrl);
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

// Real OCR — calls Claude Vision OR OpenAI Vision API
// Priority: 1) deployed proxy URL  2) user's API key (auto-detects provider)  3) error
const OCR_PROXY_URL='https://perq-ocr-proxy.shailbhatt.workers.dev'; // Deployed proxy
async function extractDealFromImage(imageDataUrl){
  const match=imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if(!match)throw new Error('Invalid image format');
  const mediaType=match[1];
  const b64=match[2];

  const prompt=`Extract coupon/deal details from this image. Read VERY carefully — handwritten and stylized text often gets misread. Pay close attention to letter shapes (especially l vs r, m vs n, e vs c, 0 vs O).

Return ONLY a JSON object with these fields:
{
  "merchant": "store/brand name as shown — read each letter carefully, do not autocorrect to a similar known brand",
  "discount": "the actual offer text, e.g. 'Up to $2,000 off' or '20% off produce'",
  "code": "promo code if visible, else empty string",
  "expiry": "YYYY-MM-DD format if a date is visible, else empty string",
  "category": "one of: Groceries, Dining, Apparel, Travel, Beauty, Home, Electronics, Other",
  "value": estimated dollar value as a number (e.g. 2000 for $2,000 off, 20 for 20% off),
  "address": "business address if visible, else empty string",
  "url": "website URL if visible, else empty string"
}

For handwritten text: trace each character carefully. If a word looks like a known brand but a letter is ambiguous, prefer what's actually written over what's common. Return only the JSON, no other text.`;

  // Try proxy first
  if(OCR_PROXY_URL){
    try{
      const resp=await fetch(OCR_PROXY_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({image:b64,mediaType})
      });
      if(resp.ok){
        const data=await resp.json();
        if(data.ok&&data.result)return data.result;
      }
    }catch(e){/* fall through */}
  }

  // Fallback: user's own API key — auto-detect provider
  const apiKey=load('perq-mvp:apiKey','');
  if(!apiKey)throw new Error('NO_KEY');
  const provider=load('perq-mvp:apiProvider','anthropic');

  if(provider==='openai'||apiKey.startsWith('sk-proj-')||(apiKey.startsWith('sk-')&&!apiKey.startsWith('sk-ant-'))){
    return await extractWithOpenAI(apiKey,imageDataUrl,prompt);
  }
  return await extractWithAnthropic(apiKey,mediaType,b64,prompt);
}

async function extractWithAnthropic(apiKey,mediaType,b64,prompt){
  const response=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key':apiKey,
      'anthropic-version':'2023-06-01',
      'anthropic-dangerous-direct-browser-access':'true'
    },
    body:JSON.stringify({
      model:'claude-sonnet-4-5',
      max_tokens:600,
      messages:[{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:mediaType,data:b64}},
        {type:'text',text:prompt}
      ]}]
    })
  });
  if(!response.ok){
    const errText=await response.text();
    let errMsg='Anthropic error '+response.status;
    try{const j=JSON.parse(errText);if(j.error&&j.error.message)errMsg=j.error.message;}catch(e){}
    throw new Error(errMsg);
  }
  const data=await response.json();
  const text=(data.content||[]).map(b=>b.text||'').join('').trim();
  return parseJsonResponse(text);
}

async function extractWithOpenAI(apiKey,imageDataUrl,prompt){
  const response=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer '+apiKey
    },
    body:JSON.stringify({
      model:'gpt-4o',
      max_tokens:600,
      messages:[{
        role:'user',
        content:[
          {type:'text',text:prompt},
          {type:'image_url',image_url:{url:imageDataUrl}}
        ]
      }]
    })
  });
  if(!response.ok){
    const errText=await response.text();
    let errMsg='OpenAI error '+response.status;
    try{const j=JSON.parse(errText);if(j.error&&j.error.message)errMsg=j.error.message;}catch(e){}
    throw new Error(errMsg);
  }
  const data=await response.json();
  const text=data.choices?.[0]?.message?.content||'';
  return parseJsonResponse(text);
}

function parseJsonResponse(text){
  const cleaned=text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'').trim();
  try{return JSON.parse(cleaned);}
  catch(e){
    // Try to find JSON object in the response
    const m=cleaned.match(/\{[\s\S]*\}/);
    if(m){try{return JSON.parse(m[0]);}catch(ee){}}
    throw new Error('AI returned non-JSON response');
  }
}

// Reusable image preview frame. Collapsed by default (90px thumbnail), tap the
// Expand pill (or the strip itself) to inflate to full size. Same component on
// the deal-form preview, loyalty-form preview, and wallet detail modal so the
// user gesture is consistent across surfaces. Spec: feature-deal-form-discount-expiry.md
function dealImageFrame(src,frameId){
  if(!src)return '';
  const id=frameId||'deal-img-'+Math.random().toString(36).slice(2,8);
  // Block-level wrapper. The previous version used display:flex+justify-content:center
  // which on iOS Safari with width:100% images caused a subpixel right-shift on first
  // paint after a fresh snap. With block layout, <img width:100%; display:block> fills
  // the wrapper edge-to-edge with zero positioning ambiguity. The button stays
  // absolute-positioned in the corner. Spec: feature-deal-form-discount-expiry.md edge case 16.
  return '<div id="'+id+'" data-expanded="false" style="position:relative;width:100%;background:#0a1628;border-radius:14px;margin-bottom:12px;overflow:hidden">'
    +'<img src="'+src+'" alt="Deal image" style="display:block;width:100%;max-height:90px;object-fit:cover;cursor:pointer" onclick="toggleDealImage(\''+id+'\')">'
    +'<button type="button" onclick="toggleDealImage(\''+id+'\')" aria-label="Expand image" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.65);color:white;border:none;border-radius:999px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:4px">'
    +'<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>'
    +'<span data-toggle-label>Expand</span></button>'
    +'</div>';
}

window.toggleDealImage=function(frameId){
  const frame=document.getElementById(frameId);
  if(!frame)return;
  const img=frame.querySelector('img');
  const label=frame.querySelector('[data-toggle-label]');
  const expanded=frame.getAttribute('data-expanded')==='true';
  if(expanded){
    frame.setAttribute('data-expanded','false');
    if(img){img.style.maxHeight='90px';img.style.objectFit='cover';}
    if(label)label.textContent='Expand';
  }else{
    frame.setAttribute('data-expanded','true');
    if(img){img.style.maxHeight='60vh';img.style.objectFit='contain';}
    if(label)label.textContent='Collapse';
  }
};

window.openDealPreview=function(data,image){
  const cats=CATEGORIES.map(c=>'<option value="'+c+'"'+(c===data.category?' selected':'')+'>'+c+'</option>').join('');
  // Pre-fill detection from OCR-extracted string. Default to $ if shape unclear.
  const incoming=String(data.discount||'');
  const pctMatch=incoming.match(/(\d+(?:\.\d+)?)\s*%/);
  const dollarMatch=incoming.match(/\$\s*(\d+(?:\.\d+)?)/);
  const initSymbol=pctMatch?'%':'$';
  const initNum=pctMatch?pctMatch[1]:(dollarMatch?dollarMatch[1]:'');
  const initValue=data.value!=null?String(data.value):'';
  const initExpiry=String(data.expiry||'');
  const initHasExpiry=initExpiry?'Y':'N';
  // Segmented toggle button styles. data-active drives the visual state.
  function segBtn(id,onclick,label,active){
    const bg=active?'var(--accent)':'#F0F0F0';
    const color=active?'#1A1A1A':'#777';
    return '<button id="'+id+'" type="button" data-active="'+(active?'true':'false')+'" onclick="'+onclick+'" style="flex:1;padding:10px 0;border:none;background:'+bg+';color:'+color+';font-weight:700;font-size:14px;cursor:pointer">'+label+'</button>';
  }
  let html='<div class="modal-handle"></div><h3 class="modal-title">Review & save</h3>';
  html+=dealImageFrame(image,'deal-form-img');
  html+='<div style="background:#EAFBF4;border:1px solid #00C9A7;border-radius:12px;padding:10px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#065F46;font-weight:600"><span style="font-size:16px">✨</span>AI extracted these details — review below</div>';
  html+='<div class="form-row"><label>Merchant *</label><input id="f-merchant" placeholder="Store name" value="'+escapeHtml(data.merchant||'')+'"></div>';
  // Discount row hosts $/% toggle + discount number + (when %) total-value + code, all on one line.
  // Saves two vertical rows (former f-value-row and former Code row). aria-labels carry the
  // semantics that individual <label> tags would have crowded out at 320-393px widths.
  html+='<div class="form-row"><label>Discount *</label>';
  html+='<div style="display:flex;gap:6px;align-items:stretch">';
  html+='<div style="display:flex;border-radius:10px;overflow:hidden;width:64px;flex-shrink:0">';
  html+=segBtn('f-sym-dollar','setDiscountSymbol(\'$\')','$',initSymbol==='$');
  html+=segBtn('f-sym-pct','setDiscountSymbol(\'%\')','%',initSymbol==='%');
  html+='</div>';
  html+='<input id="f-discount-num" type="number" inputmode="decimal" min="0" step="0.01" aria-label="Discount amount" placeholder="'+(initSymbol==='%'?'20':'10')+'" value="'+escapeHtml(initNum)+'" style="flex:1;min-width:0">';
  html+='<input id="f-value" type="number" inputmode="decimal" min="0" step="0.01" aria-label="Total value (required when % selected)" placeholder="$50" value="'+escapeHtml(initValue)+'" style="flex:1;min-width:0;display:'+(initSymbol==='%'?'block':'none')+'">';
  html+='<input id="f-code" type="text" aria-label="Promo code (optional)" placeholder="CODE" value="'+escapeHtml(data.code||'')+'" style="flex:1.2;min-width:0">';
  html+='</div>';
  html+='<input type="hidden" id="f-symbol" value="'+initSymbol+'">';
  html+='</div>';
  // Category (Code is now inline in the Discount row above; old separate Code row removed)
  html+='<div class="form-row"><label>Category</label><select id="f-category">'+cats+'</select></div>';
  // NEW: expiry = Y/N toggle, conditional date input
  html+='<div class="form-row"><label>Expires *</label>';
  html+='<div style="display:flex;border-radius:12px;overflow:hidden;width:120px;margin-bottom:8px">';
  html+=segBtn('f-exp-y','setHasExpiry(\'Y\')','Yes',initHasExpiry==='Y');
  html+=segBtn('f-exp-n','setHasExpiry(\'N\')','No',initHasExpiry==='N');
  html+='</div>';
  html+='<input type="hidden" id="f-has-expiry" value="'+initHasExpiry+'">';
  html+='<input id="f-expiry" type="date" value="'+escapeHtml(initExpiry)+'" style="display:'+(initHasExpiry==='Y'?'block':'none')+'">';
  html+='</div>';
  html+='<div class="form-row"><label>Address (optional)</label><input id="f-address" placeholder="For directions" value="'+escapeHtml(data.address||'')+'"></div>';
  html+='<div class="form-actions"><button class="btn-secondary" onclick="closeModal();pendingDealImage=null">Cancel</button><button class="btn-primary" onclick="saveDealForm()">Save deal</button></div>';
  openModal(html);
};

// Segmented-toggle helpers for the discount $/% switch and the has-expiry Y/N switch.
// They mutate the inline data-active + style attributes on the two buttons and
// hide/show the conditional input row. Spec: feature-deal-form-discount-expiry.md
window.setDiscountSymbol=function(sym){
  const dollar=document.getElementById('f-sym-dollar');
  const pct=document.getElementById('f-sym-pct');
  const valueInput=document.getElementById('f-value');
  const hidden=document.getElementById('f-symbol');
  const numInput=document.getElementById('f-discount-num');
  if(!dollar||!pct||!hidden)return;
  const isPct=sym==='%';
  dollar.setAttribute('data-active',isPct?'false':'true');
  dollar.style.background=isPct?'#F0F0F0':'var(--accent)';
  dollar.style.color=isPct?'#777':'#1A1A1A';
  pct.setAttribute('data-active',isPct?'true':'false');
  pct.style.background=isPct?'var(--accent)':'#F0F0F0';
  pct.style.color=isPct?'#1A1A1A':'#777';
  // Toggle the value input itself (the wrapper f-value-row no longer exists after the inline merge).
  if(valueInput)valueInput.style.display=isPct?'block':'none';
  hidden.value=sym;
  if(numInput)numInput.placeholder=isPct?'20':'10';
};

window.setHasExpiry=function(yn){
  const yBtn=document.getElementById('f-exp-y');
  const nBtn=document.getElementById('f-exp-n');
  const dateInput=document.getElementById('f-expiry');
  const hidden=document.getElementById('f-has-expiry');
  if(!yBtn||!nBtn||!dateInput||!hidden)return;
  const isY=yn==='Y';
  yBtn.setAttribute('data-active',isY?'true':'false');
  yBtn.style.background=isY?'var(--accent)':'#F0F0F0';
  yBtn.style.color=isY?'#1A1A1A':'#777';
  nBtn.setAttribute('data-active',isY?'false':'true');
  nBtn.style.background=isY?'#F0F0F0':'var(--accent)';
  nBtn.style.color=isY?'#777':'#1A1A1A';
  dateInput.style.display=isY?'block':'none';
  hidden.value=yn;
  if(!isY){dateInput.value='';}
  else if(!dateInput.value){
    // Default to today's date when toggling Y on an empty input. User can adjust via picker.
    const t=new Date();
    const m=String(t.getMonth()+1).padStart(2,'0');
    const d=String(t.getDate()).padStart(2,'0');
    dateInput.value=t.getFullYear()+'-'+m+'-'+d;
  }
};

// Replaces the old openAddManual — for "Type a deal" mode (no scan)
window.openAddManual=function(image){
  openDealPreview({},image||null);
};

window.saveDealForm=function(){
  const m=document.getElementById('f-merchant').value.trim();
  if(!m){toast('Merchant required');return;}
  const symbol=document.getElementById('f-symbol').value;
  const numRaw=document.getElementById('f-discount-num').value.trim();
  const num=parseFloat(numRaw);
  if(!numRaw||!Number.isFinite(num)||num<=0){toast('Discount amount required');return;}
  let discountStr,value;
  if(symbol==='%'){
    const valRaw=document.getElementById('f-value').value.trim();
    const totalValue=parseFloat(valRaw);
    if(!valRaw||!Number.isFinite(totalValue)||totalValue<=0){toast('Total value required for % discounts');return;}
    discountStr=num+'% off';
    value=totalValue*num/100;
  } else {
    discountStr='$'+num+' off';
    value=num;
  }
  const hasExpiry=document.getElementById('f-has-expiry').value;
  let expiry='';
  if(hasExpiry==='Y'){
    expiry=document.getElementById('f-expiry').value;
    if(!expiry){toast('Pick an expiry date');return;}
  }
  const codeVal=document.getElementById('f-code').value.trim();
  // Dedupe: block exact match against an existing non-redeemed deal.
  // Spec: feature-deal-dedupe AC #1.
  const dup=window.findDuplicateDeal({merchant:m,discount:discountStr,expiry:expiry,code:codeVal});
  if(dup){
    toast('You already saved this deal — '+dup.merchant);
    return;
  }
  state.deals.push({
    id:uid(),merchant:m,discount:discountStr,
    category:document.getElementById('f-category').value,
    value:value,
    code:codeVal,
    expiry:expiry,
    address:document.getElementById('f-address').value.trim(),
    notes:'',
    image:pendingDealImage||null,
    redeemed:false,createdAt:Date.now()
  });
  state.rewards.spins+=1;
  save(K.deals,state.deals);save(K.rewards,state.rewards);
  pendingDealImage=null;
  closeModal();
  toast('✓ Deal saved · +1 spin earned');
  completeMission('save');
  checkTierUp();
  scheduleReminders();
  renderAll();
};

window.openAddProgram=function(){
  const KNOWN={
    airline:[
      {name:'Delta SkyMiles',unit:'miles',loginUrl:'https://www.delta.com/login'},
      {name:'United MileagePlus',unit:'miles',loginUrl:'https://www.united.com/en/us/account/sign-in'},
      {name:'American AAdvantage',unit:'miles',loginUrl:'https://www.aa.com/login'},
      {name:'Southwest Rapid Rewards',unit:'points',loginUrl:'https://www.southwest.com/loyalty/login'},
      {name:'JetBlue TrueBlue',unit:'points',loginUrl:'https://www.jetblue.com/account/login'},
      {name:'Alaska Mileage Plan',unit:'miles',loginUrl:'https://www.alaskaair.com/account/login'}
    ],
    hotel:[
      {name:'Marriott Bonvoy',unit:'points',loginUrl:'https://www.marriott.com/sign-in.mi'},
      {name:'Hilton Honors',unit:'points',loginUrl:'https://www.hilton.com/en/hilton-honors/login/'},
      {name:'IHG One Rewards',unit:'points',loginUrl:'https://www.ihg.com/onerewards/content/us/en/login'},
      {name:'World of Hyatt',unit:'points',loginUrl:'https://world.hyatt.com/content/gp/en/login.html'},
      {name:'Wyndham Rewards',unit:'points',loginUrl:'https://www.wyndhamhotels.com/wyndham-rewards/sign-in'},
      {name:'Choice Privileges',unit:'points',loginUrl:'https://www.choicehotels.com/login'}
    ],
    creditcard:[
      {name:'Chase Ultimate Rewards',unit:'points',loginUrl:'https://ultimaterewards.chase.com'},
      {name:'Amex Membership Rewards',unit:'points',loginUrl:'https://www.americanexpress.com/login'},
      {name:'Capital One Miles',unit:'miles',loginUrl:'https://verified.capitalone.com/auth/signin'},
      {name:'Citi ThankYou',unit:'points',loginUrl:'https://www.thankyou.com'},
      {name:'Discover Cashback',unit:'$',loginUrl:'https://portal.discover.com/customersvcs/universalLogin/ac_main'},
      {name:'Bank of America Travel Rewards',unit:'points',loginUrl:'https://www.bankofamerica.com/login/sign-in/signOnV2Screen.go'}
    ]
  };
  const allOpts=[
    '<optgroup label="✈️ Airlines">'+KNOWN.airline.map(p=>'<option value="airline:'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</option>').join('')+'</optgroup>',
    '<optgroup label="🏨 Hotels">'+KNOWN.hotel.map(p=>'<option value="hotel:'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</option>').join('')+'</optgroup>',
    '<optgroup label="💳 Credit Cards">'+KNOWN.creditcard.map(p=>'<option value="creditcard:'+escapeHtml(p.name)+'">'+escapeHtml(p.name)+'</option>').join('')+'</optgroup>',
    '<option value="custom">+ Custom (enter manually)</option>'
  ].join('');

  const html='<div class="modal-handle"></div><h3 class="modal-title">Add reward program</h3>'+
    '<div class="form-row"><label>Program *</label><select id="rp-select" onchange="onProgramSelect(this.value)"><option value="">Select a program…</option>'+allOpts+'</select></div>'+
    '<div id="rp-login-section" style="display:none">'+
      '<div style="background:#F0F9FF;border:1px solid #4FACFE;border-radius:12px;padding:12px;margin-bottom:14px">'+
        '<p style="font-size:13px;font-weight:700;color:#075985;margin:0 0 6px">🔐 Connect your account</p>'+
        '<p style="font-size:11px;color:#0c4a6e;margin:0 0 10px;line-height:1.5">We\'ll redirect you to <strong id="rp-provider-name">the provider</strong> to log in. Perq receives only your member ID, balance, and expiry — never your password.</p>'+
        '<button id="rp-login-btn" onclick="loginToProgram()" style="width:100%;background:#075985;color:white;border:none;padding:12px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer">Continue to login →</button>'+
      '</div>'+
      '<p style="font-size:11px;color:var(--text-dim);text-align:center;margin:0 0 12px">Or skip login and enter manually</p>'+
    '</div>'+
    '<div id="rp-manual-section" style="display:none">'+
      '<div class="form-row"><label>Custom name *</label><input id="rp-name" placeholder="e.g. Local Credit Union Rewards"></div>'+
      '<div class="form-row"><label>Type</label><select id="rp-type"><option value="airline">Airline miles</option><option value="hotel">Hotel points</option><option value="creditcard">Credit card rewards</option><option value="cashback">Cashback</option><option value="other">Other</option></select></div>'+
    '</div>'+
    '<div id="rp-fields" style="display:none">'+
      '<div class="form-grid"><div class="form-row"><label>Member ID</label><input id="rp-memberid" placeholder="Your account number"></div><div class="form-row"><label>Balance</label><input id="rp-balance" type="number" inputmode="numeric" placeholder="50000"></div></div>'+
      '<div class="form-grid"><div class="form-row"><label>Unit</label><input id="rp-unit" placeholder="miles" value="points"></div><div class="form-row"><label>Expiry (if any)</label><input id="rp-expiry" type="date"></div></div>'+
    '</div>'+
    '<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveProgram()" id="rp-save-btn" disabled style="opacity:0.4">Save</button></div>';
  openModal(html);
  // Stash KNOWN for the dropdown handlers
  window._knownPrograms=KNOWN;
};

window.onProgramSelect=function(val){
  const loginSec=document.getElementById('rp-login-section');
  const manualSec=document.getElementById('rp-manual-section');
  const fields=document.getElementById('rp-fields');
  const saveBtn=document.getElementById('rp-save-btn');

  if(!val){
    loginSec.style.display='none';
    manualSec.style.display='none';
    fields.style.display='none';
    saveBtn.disabled=true;saveBtn.style.opacity='0.4';
    return;
  }

  saveBtn.disabled=false;saveBtn.style.opacity='1';

  if(val==='custom'){
    loginSec.style.display='none';
    manualSec.style.display='block';
    fields.style.display='block';
  } else {
    const [type,name]=val.split(':');
    const list=window._knownPrograms[type]||[];
    const prog=list.find(p=>p.name===name);
    if(prog){
      document.getElementById('rp-provider-name').textContent=prog.name;
      document.getElementById('rp-login-btn').setAttribute('data-url',prog.loginUrl);
      document.getElementById('rp-unit').value=prog.unit||'points';
      window._currentProvider={type,name,unit:prog.unit,loginUrl:prog.loginUrl};
    }
    loginSec.style.display='block';
    manualSec.style.display='none';
    fields.style.display='block';
  }
};

window.loginToProgram=function(){
  const url=document.getElementById('rp-login-btn').getAttribute('data-url');
  if(url)window.open(url,'_blank','noopener,noreferrer');
  toast('Once logged in, return here and enter your balance');
};

window.saveProgram=function(){
  const sel=document.getElementById('rp-select').value;
  let name='',type='other',icon='⭐',unit='points';
  if(sel==='custom'){
    name=document.getElementById('rp-name').value.trim();
    type=document.getElementById('rp-type').value;
    icon={airline:'✈️',hotel:'🏨',creditcard:'💳',cashback:'💵',other:'⭐'}[type]||'⭐';
  } else if(sel){
    const parts=sel.split(':');
    type=parts[0];name=parts[1];
    icon={airline:'✈️',hotel:'🏨',creditcard:'💳'}[type]||'⭐';
    unit=window._currentProvider?.unit||'points';
  }
  if(!name){toast('Select or enter a program name');return;}
  state.programs.push({
    id:uid(),
    name,type,icon,
    memberId:document.getElementById('rp-memberid').value.trim(),
    balance:document.getElementById('rp-balance').value||'0',
    unit:document.getElementById('rp-unit').value||unit,
    expiry:document.getElementById('rp-expiry').value||null,
    addedAt:Date.now()
  });
  save(K.programs,state.programs);
  closeModal();
  toast('✓ Program added');
  walletFilter='programs';
  renderAll();
};

window.openAddLoyalty=function(){
  const html='<div class="modal-handle"></div><h3 class="modal-title">Add loyalty card</h3>'+
    '<p style="font-size:13px;color:var(--text-dim);text-align:center;margin:0 0 16px">How would you like to add this card?</p>'+
    '<button class="snap-option" onclick="closeModal();triggerLoyaltyCamera()" style="margin-bottom:8px"><div class="snap-option-icon gradient-warm"><svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div><div class="snap-option-info"><p class="snap-option-title">Scan card</p><p class="snap-option-sub">AI reads store name + card number from photo</p></div></button>'+
    '<button class="snap-option" onclick="closeModal();openLoyaltyManual()"><div class="snap-option-icon gradient-purple"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div><div class="snap-option-info"><p class="snap-option-title">Type details</p><p class="snap-option-sub">Enter manually with color picker</p></div></button>';
  openModal(html);
};

window.triggerLoyaltyCamera=function(){
  const i=document.getElementById('capture-input');
  i.setAttribute('capture','environment');
  i.setAttribute('data-mode','loyalty');
  i.click();
};

window.openLoyaltyManual=function(){
  const colors=['#DC2626','#059669','#7C3AED','#2563EB','#D97706','#1F2937'];
  const html='<div class="modal-handle"></div><h3 class="modal-title">Add loyalty card</h3>'+
    '<div class="form-row"><label>Store name *</label><input id="lc-name" placeholder="Costco, CVS ExtraCare"></div>'+
    '<div class="form-row"><label>Card / member number *</label><input id="lc-number" placeholder="Card number, member ID, or alphanumeric"></div>'+
    '<div class="form-row"><label>Card color</label><div style="display:flex;gap:8px;flex-wrap:wrap" id="color-picker">'+
      colors.map((c,i)=>'<button data-color="'+c+'" style="width:40px;height:40px;border-radius:10px;background:'+c+';border:'+(i===0?'3px solid #1A1A1A':'3px solid transparent')+'"></button>').join('')+
    '</div></div>'+
    '<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveLoyalty()">Save</button></div>';
  openModal(html);
  let color='#DC2626';
  document.querySelectorAll('#color-picker button').forEach(b=>{
    b.addEventListener('click',()=>{
      color=b.getAttribute('data-color');
      document.querySelectorAll('#color-picker button').forEach(x=>x.style.border='3px solid transparent');
      b.style.border='3px solid #1A1A1A';
    });
  });
  window._lcColor=()=>color;
};

window.saveLoyalty=function(){
  const name=document.getElementById('lc-name').value.trim();
  const num=document.getElementById('lc-number').value.trim();
  if(!name||!num){toast('Name and number required');return;}
  state.loyalty.push({
    id:uid(),name,number:num,
    color:window._lcColor?window._lcColor():'#DC2626',
    addedAt:Date.now()
  });
  save(K.loyalty,state.loyalty);
  closeModal();
  toast('✓ Card added');
  renderAll();
};

// -------- Settings --------
function renderSettings(){
  if(state.profile){
    const initial=state.profile.name.charAt(0).toUpperCase();
    document.getElementById('profile-avatar').textContent=initial;
    document.getElementById('profile-name-display').textContent=state.profile.name;
    document.getElementById('profile-email-display').textContent=state.profile.email||'Tap to add email';
  }
  // Referral stats
  const refStatsEl=document.getElementById('referral-stats');
  if(refStatsEl){
    const n=(state.profile&&state.profile.referralCount)||0;
    refStatsEl.textContent=n===0?'Tap to share your invite code':n+' friend'+(n===1?'':'s')+' joined · earned '+(n*50)+' pts';
  }
  document.querySelectorAll('.toggle').forEach(t=>{
    const k=t.getAttribute('data-setting');
    if(state.settings[k])t.classList.add('on');else t.classList.remove('on');
  });
  // API key status
  const apiKey=load('perq-mvp:apiKey','');
  const provider=load('perq-mvp:apiProvider','anthropic');
  const statusEl=document.getElementById('api-key-status');
  if(statusEl){
    // Check if proxy is configured (set in OCR_PROXY_URL constant)
    const hasProxy=typeof window!=='undefined'&&true; // proxy URL is set in code
    if(hasProxy&&!apiKey){
      statusEl.textContent='✓ AI scan active (via Perq cloud)';
      statusEl.style.color='#059669';
    } else if(apiKey){
      const provName=provider==='openai'?'OpenAI GPT-4o':'Claude';
      statusEl.textContent='✓ '+provName+' connected (your key)';
      statusEl.style.color='#059669';
    } else {
      statusEl.textContent='Tap to add — Anthropic or OpenAI';
      statusEl.style.color='';
    }
  }
}

window.toggleSetting=function(el,key){
  el.classList.toggle('on');
  state.settings[key]=el.classList.contains('on');
  save(K.settings,state.settings);
  toast(el.classList.contains('on')?'Enabled':'Disabled');
  if(key==='reminders')scheduleReminders();
};

window.openReminderSettings=function(){
  const cur=state.settings.reminderDays||2;
  const opts=[1,2,3];
  const html='<div class="modal-handle"></div>'+
    '<h3 class="modal-title">Expiry reminders</h3>'+
    '<p style="font-size:13px;color:var(--text-dim);text-align:center;margin:0 0 16px;line-height:1.5">How many days before a deal expires should we remind you?</p>'+
    '<div style="display:flex;gap:10px;margin-bottom:16px">'+
      opts.map(d=>'<button onclick="setReminderDays('+d+')" style="flex:1;padding:18px 0;border-radius:14px;font-size:18px;font-weight:800;border:2px solid '+(cur===d?'#10B981':'#E5E7EB')+';background:'+(cur===d?'#D1FAE5':'#FFFFFF')+';color:'+(cur===d?'#065F46':'#1A1A1A')+'">'+d+(d===1?' day':' days')+'</button>').join('')+
    '</div>'+
    '<p style="font-size:11px;color:var(--text-dim);text-align:center;margin:0 0 16px">Plus a same-day reminder at 10 AM as a final nudge.</p>'+
    '<button onclick="closeModal()" style="width:100%;background:#1A1A1A;color:white;padding:14px;border-radius:14px;font-size:14px;font-weight:800">Done</button>';
  openModal(html);
};
window.setReminderDays=function(d){
  state.settings.reminderDays=d;
  save(K.settings,state.settings);
  const sub=document.getElementById('reminders-sub');
  if(sub)sub.textContent=d+(d===1?' day':' days')+' before · evening · day-of';
  scheduleReminders();
  closeModal();
  toast('Reminders set to '+d+(d===1?' day':' days')+' before');
};

window.openProximitySettings=function(){
  const cur=state.settings.proximityMiles||2;
  const opts=[1,2,3];
  const html='<div class="modal-handle"></div>'+
    '<h3 class="modal-title">Proximity alerts</h3>'+
    '<p style="font-size:13px;color:var(--text-dim);text-align:center;margin:0 0 16px;line-height:1.5">Notify you when you\'re near a store with a saved deal — within how many miles?</p>'+
    '<div style="display:flex;gap:10px;margin-bottom:16px">'+
      opts.map(m=>'<button onclick="setProximityMiles('+m+')" style="flex:1;padding:18px 0;border-radius:14px;font-size:18px;font-weight:800;border:2px solid '+(cur===m?'#10B981':'#E5E7EB')+';background:'+(cur===m?'#D1FAE5':'#FFFFFF')+';color:'+(cur===m?'#065F46':'#1A1A1A')+'">'+m+' mi</button>').join('')+
    '</div>'+
    '<p style="font-size:11px;color:var(--text-dim);text-align:center;margin:0 0 16px">Foreground geolocation only. Battery impact: minimal.</p>'+
    '<button onclick="closeModal()" style="width:100%;background:#1A1A1A;color:white;padding:14px;border-radius:14px;font-size:14px;font-weight:800">Done</button>';
  openModal(html);
};
window.setProximityMiles=function(m){
  state.settings.proximityMiles=m;
  save(K.settings,state.settings);
  const sub=document.getElementById('proximity-sub');
  if(sub)sub.textContent='Notify within '+m+' mi of a store';
  closeModal();
  toast('Proximity set to '+m+' mi');
};

// Native bridge: schedule expiry notifications via Capacitor LocalNotifications
// when running as native iOS/Android app. No-op on web preview.
function scheduleReminders(){
  if(!window.PerqNative||!window.PerqNative.isNative)return;
  window.PerqNative.rescheduleExpiryReminders(state.deals,state.settings)
    .then(r=>{
      if(r&&r.scheduled>0)console.log('[Perq] Scheduled '+r.scheduled+' expiry reminders');
      else if(r&&r.skipped)console.log('[Perq] Reminder schedule skipped:',r.skipped);
    })
    .catch(e=>console.warn('[Perq] Reminder schedule failed:',e));
}

window.editProfile=function(){
  const html='<div class="modal-handle"></div><h3 class="modal-title">Profile</h3>'+
    '<div class="form-row"><label>Name</label><input id="p-name" value="'+escapeHtml(state.profile?.name||'')+'"></div>'+
    '<div class="form-row"><label>Email</label><input id="p-email" type="email" value="'+escapeHtml(state.profile?.email||'')+'" placeholder="for email integration later"></div>'+
    '<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveProfile()">Save</button></div>';
  openModal(html);
};

window.editApiKey=function(){
  const current=load('perq-mvp:apiKey','');
  const provider=load('perq-mvp:apiProvider','anthropic');
  const masked=current?current.slice(0,8)+'…'+current.slice(-4):'';
  const html='<div class="modal-handle"></div><h3 class="modal-title">AI Scanning</h3>'+
    '<div style="background:#F0F9FF;border:1px solid #4FACFE;border-radius:12px;padding:12px;margin-bottom:14px;font-size:12px;color:#075985;line-height:1.5">'+
    '🔑 Use your own API key — stored only on this device. ~$0.001-0.01 per scan.'+
    '</div>'+
    '<div class="form-row"><label>Provider</label>'+
    '<div style="display:flex;gap:8px">'+
      '<button id="prov-anthropic" onclick="setProvider(\'anthropic\')" style="flex:1;padding:12px;border-radius:12px;font-size:13px;font-weight:700;'+(provider==='anthropic'?'background:#1A1A1A;color:white':'background:#F0F0F0;color:#666')+'">Anthropic (Claude)</button>'+
      '<button id="prov-openai" onclick="setProvider(\'openai\')" style="flex:1;padding:12px;border-radius:12px;font-size:13px;font-weight:700;'+(provider==='openai'?'background:#1A1A1A;color:white':'background:#F0F0F0;color:#666')+'">OpenAI (GPT-4o)</button>'+
    '</div></div>'+
    '<div id="prov-help" style="font-size:11px;color:var(--text-dim);margin:0 0 12px;line-height:1.5"></div>'+
    (current?'<p style="font-size:12px;color:var(--text-dim);margin:0 0 8px">Current: <code style="background:#f5f5f5;padding:2px 6px;border-radius:4px">'+escapeHtml(masked)+'</code></p>':'')+
    '<div class="form-row"><label>API key</label><input id="ak-input" type="password" placeholder="" autocomplete="off"></div>'+
    '<div class="form-actions">'+(current?'<button class="btn-secondary" onclick="clearApiKey()" style="background:#FFE5E5;color:#DC2626">Remove</button>':'<button class="btn-secondary" onclick="closeModal()">Cancel</button>')+
    '<button class="btn-primary" onclick="saveApiKey()">Save</button></div>';
  openModal(html);
  updateProviderHelp(provider);
};

window.setProvider=function(p){
  save('perq-mvp:apiProvider',p);
  document.getElementById('prov-anthropic').style.cssText='flex:1;padding:12px;border-radius:12px;font-size:13px;font-weight:700;'+(p==='anthropic'?'background:#1A1A1A;color:white':'background:#F0F0F0;color:#666');
  document.getElementById('prov-openai').style.cssText='flex:1;padding:12px;border-radius:12px;font-size:13px;font-weight:700;'+(p==='openai'?'background:#1A1A1A;color:white':'background:#F0F0F0;color:#666');
  updateProviderHelp(p);
};

function updateProviderHelp(p){
  const help=document.getElementById('prov-help');
  const input=document.getElementById('ak-input');
  if(p==='openai'){
    help.innerHTML='Get a key from <a href="https://platform.openai.com/api-keys" target="_blank" style="color:#2563EB;font-weight:700">platform.openai.com/api-keys</a>. Requires billing setup with $5+ credit. Uses GPT-4o vision.';
    if(input)input.placeholder='sk-proj-… or sk-…';
  } else {
    help.innerHTML='Get a key from <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:#2563EB;font-weight:700">console.anthropic.com</a>. Uses Claude Sonnet 4.5 vision.';
    if(input)input.placeholder='sk-ant-api03-…';
  }
}

window.saveApiKey=function(){
  const key=document.getElementById('ak-input').value.trim();
  if(!key){toast('Paste your API key first');return;}
  const provider=load('perq-mvp:apiProvider','anthropic');
  if(provider==='anthropic'&&!key.startsWith('sk-ant-')){toast('Anthropic key should start with sk-ant-');return;}
  if(provider==='openai'&&!key.startsWith('sk-')){toast('OpenAI key should start with sk-');return;}
  save('perq-mvp:apiKey',key);
  closeModal();
  toast('✓ API key saved — AI scan enabled');
  renderSettings();
};

window.clearApiKey=function(){
  localStorage.removeItem('perq-mvp:apiKey');
  closeModal();
  toast('API key removed');
  renderSettings();
};

window.saveProfile=function(){
  const name=document.getElementById('p-name').value.trim();
  if(!name){toast('Name required');return;}
  state.profile={...state.profile,name,email:document.getElementById('p-email').value.trim()};
  save(K.profile,state.profile);
  closeModal();
  toast('✓ Profile saved');
  renderAll();
};

window.resetApp=function(){
  if(!confirm('Reset everything? This will delete all your deals, points, programs, and cards. This cannot be undone.'))return;
  Object.values(K).forEach(k=>localStorage.removeItem(k));
  localStorage.removeItem('perq-mvp:communityPool');
  location.reload();
};

window.seedCommunityPool=function(){
  const now=Date.now();
  const fut=days=>{const d=new Date();d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);};
  const demos=[
    {id:'demo_'+now+'_1',sharedBy:'Maya Chen',sharedAt:now-3600000,merchant:"Trader Joe's",discount:'$5 off $30',category:'Groceries',code:'',expiry:fut(14),value:5,claimCount:12,address:''},
    {id:'demo_'+now+'_2',sharedBy:'Alex Park',sharedAt:now-7200000,merchant:'AMC Theatres',discount:'$3 off any ticket',category:'Other',code:'AMC3',expiry:fut(21),value:3,claimCount:47,address:''},
    {id:'demo_'+now+'_3',sharedBy:'Jen Tanaka',sharedAt:now-14400000,merchant:'Panera',discount:'Free pastry with entrée',category:'Dining',code:'',expiry:fut(7),value:5,claimCount:23,address:''},
    {id:'demo_'+now+'_4',sharedBy:"Coupon Dad",sharedAt:now-86400000,merchant:"Lowe's",discount:'10% off paint',category:'Home',code:'PAINT10',expiry:fut(10),value:25,claimCount:8,address:''}
  ];
  const existing=load('perq-mvp:communityPool',[]);
  // Merge — don't duplicate
  const merged=[...existing,...demos.filter(d=>!existing.find(e=>e.id===d.id))];
  save('perq-mvp:communityPool',merged);
  toast('✓ Added 4 demo deals · check Community tab');
  goPage('community');
};

window.checkReminders=function(){
  // On native, this also triggers a re-schedule pass so users can confirm
  // notifications are wired even if they previously denied permission.
  scheduleReminders();
  const expiring=state.deals.filter(d=>{
    if(d.redeemed||!d.expiry)return false;
    const du=daysUntil(d.expiry);
    return du!==null&&du>=0&&du<=3;
  });
  if(expiring.length===0)toast('No deals expiring soon — you\'re all set!');
  else toast(expiring.length+' deal'+(expiring.length===1?'':'s')+' expiring soon!');
};

// -------- Render All --------
function renderAll(){
  renderWallet();
  renderRewards();
  renderCommunity();
  renderSettings();
}

// -------- Notification deep-link reconciliation --------
// When the user taps an expiry-reminder notification, native-bridge.js's
// `localNotificationActionPerformed` listener stashes the dealId on
// window.__pendingDealOpen. This function reads it, looks up the deal, and
// either opens the detail modal (live tap or cold-launch tap) or shows a
// "no longer in your wallet" toast if the deal was deleted between schedule
// and tap. Spec: feature-notification-deep-link-and-app-name AC #3-#5, #8.
//
// Last-tap-wins: clear the pending value immediately so a re-render or a
// follow-up tap doesn't double-open the modal.
// QA helper — fires a notification 10 seconds out using the first
// non-redeemed wallet deal, so the user can validate the new copy
// structure AND the tap-to-deal-modal deep-link without waiting for a
// real expiry. Calls into native-bridge's scheduleTestNotification which
// uses the same kind/extra payload as production reminders so the deep-
// link reconciliation path is exercised end-to-end.
window.testNotification=function(){
  if(!window.PerqNative||!window.PerqNative.isNative){
    toast('Test notifications only work on the native iOS/Android app');
    return;
  }
  var deal=state.deals.find(function(d){return !d.redeemed;});
  if(!deal){
    toast('Save a deal first — the test uses your wallet data');
    return;
  }
  window.PerqNative.scheduleTestNotification(deal).then(function(r){
    if(r&&r.error){toast(r.message||'Could not schedule test notification');return;}
    toast('Notification scheduled — check in 10 seconds');
  }).catch(function(e){console.warn('testNotification:',e);toast('Could not schedule test notification');});
};

window.openPendingDealOnReady=function(){
  var dealId=window.__pendingDealOpen;
  if(!dealId)return;
  window.__pendingDealOpen=null;
  var deal=state.deals.find(function(d){return String(d.id)===String(dealId);});
  // Always land on the Wallet tab — that's where deal modals are scoped.
  if(typeof window.goPage==='function'){try{window.goPage('wallet');}catch(e){}}
  if(!deal){
    // Deal was deleted between notification schedule and tap.
    if(typeof toast==='function')toast('This deal is no longer in your wallet');
    return;
  }
  // Open the deal-detail modal directly — same modal the user gets from
  // tapping a wallet pass or the ⓘ button. AC #6 (redeemed) and AC #7
  // (expired) are handled inside viewWalletDeal's existing branches.
  if(typeof window.viewWalletDeal==='function'){
    try{window.viewWalletDeal(String(dealId));}catch(e){console.warn('viewWalletDeal threw:',e);}
  }
};

// -------- Init --------
checkOnboarding();
renderAll();
scheduleReminders(); // No-op on web; schedules iOS/Android local notifications on native
// Signal the boot splash overlay (in preview.html) that the first render
// has completed so it can fade out.
try{ window.__perqAppReady = true; }catch(e){}
// If the user cold-launched the app by tapping a notification, the dealId
// is already on window.__pendingDealOpen. Reconcile now that state.deals
// is loaded and renders are mounted.
try{ if(window.__pendingDealOpen) window.openPendingDealOnReady(); }catch(e){}
})();

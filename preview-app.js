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
  rewards:load(K.rewards,{points:0,spins:0,streak:0,saved:0,lastClaim:null}),
  settings:load(K.settings,{reminders:true,proximity:true,social:false}),
  selectedPrefs:[]
};

let onboardStep=1;
let pendingDealImage=null;
let walletFilter='all';
let currentBrowseTab='local';

function load(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch(e){return d;}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function uid(){return 'd'+Math.random().toString(36).slice(2,9);}
function todayStr(){const d=new Date();d.setHours(0,0,0,0);return d.toISOString().slice(0,10);}
function fmtDate(s){if(!s)return '—';return new Date(s).toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function daysUntil(s){if(!s)return null;return Math.round((new Date(s).getTime()-new Date(todayStr()).getTime())/86400000);}
function escapeHtml(s){if(s==null)return '';return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function getGradient(cat){
  const map={Groceries:'green',Dining:'warm',Apparel:'pink',Travel:'purple',Beauty:'pink',Home:'warm',Electronics:'purple',Other:'green'};
  return map[cat]||'warm';
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
    state.profile={name,createdAt:Date.now(),preferences:[]};
    save(K.profile,state.profile);
  }
  onboardStep++;
  document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('active'));
  document.querySelector('.ob-step[data-step="'+onboardStep+'"]').classList.add('active');
  document.querySelectorAll('.ob-dot').forEach((d,i)=>{d.classList.toggle('active',(i+1)<=onboardStep);});
};

window.finishOnboarding=function(){
  if(state.selectedPrefs.length>0&&state.profile){
    state.profile.preferences=state.selectedPrefs;
    save(K.profile,state.profile);
  }
  if(!state.profile){
    state.profile={name:'You',createdAt:Date.now(),preferences:state.selectedPrefs};
    save(K.profile,state.profile);
  }
  save(K.onboarded,true);
  document.getElementById('onboarding').classList.add('hidden');
  renderAll();
};

function checkOnboarding(){
  const onboarded=load(K.onboarded,false);
  document.getElementById('onboarding').classList.toggle('hidden',onboarded);
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
  if(page==='home')renderHome();
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
function renderHome(){
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

// -------- Wallet (unified — deals + programs + loyalty) --------
function renderWallet(){
  document.querySelectorAll('.wallet-tab').forEach(t=>t.classList.toggle('active',t.getAttribute('data-wfilter')===walletFilter));
  const c=document.getElementById('wallet-content');
  const dealsCount=state.deals.filter(d=>!d.redeemed).length;
  const totalCount=dealsCount+state.programs.length+state.loyalty.length;
  document.getElementById('wallet-sub').textContent=totalCount===0?'Empty wallet':totalCount+' item'+(totalCount===1?'':'s')+' saved';

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

  if(walletFilter==='shared'){
    const sharedDeals=state.deals.filter(d=>d.shared);
    if(sharedDeals.length>0){
      html+=renderDealsList(sharedDeals);
    } else {
      html+=emptyWalletSection('📤','No shared deals yet','Tap the share icon on any deal to share it with friends','closeModal');
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
    const g=p.getAttribute('class-grad');
    p.style.background=getGradStyle(g);
  });
}

function emptyWalletSection(emoji,title,sub,cta){
  return '<div style="background:white;border-radius:18px;padding:40px 24px;text-align:center;margin-top:14px"><div style="font-size:48px;opacity:0.4;margin-bottom:8px">'+emoji+'</div><p style="font-size:15px;font-weight:700;margin:0 0 4px;color:#1A1A1A">'+title+'</p><p style="font-size:12px;color:#777;margin:0 0 16px">'+sub+'</p><button class="empty-cta" onclick="'+cta+'()">+ Add</button></div>';
}

function renderDealsList(active){
  let html='';
  active.forEach((d,i)=>{
    const grad=getGradient(d.category);
    const du=daysUntil(d.expiry);
    const expText=du===null?'No expiry':du===0?'Expires TODAY':du===1?'Expires tomorrow':du<0?'Expired':'Expires in '+du+' days';
    const isLast=i===active.length-1;
    html+='<div class="wpass" data-deal-id="'+d.id+'" onclick="togglePass(this)" class-grad="'+grad+'" style="border-radius:18px;padding:18px 20px;'+(isLast?'margin-bottom:14px':'margin-bottom:-90px')+';position:relative;box-shadow:0 8px 24px rgba(0,0,0,0.4);color:white;cursor:pointer">';
    html+='<div class="pcoll" style="display:flex;flex-direction:column;gap:60px">';
    const sharedBadge=d.shared?'<span style="background:rgba(0,0,0,0.3);padding:3px 8px;border-radius:6px;font-size:9px;font-weight:700;letter-spacing:0.5px">SHARED</span>':'';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><p style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.9;margin:0">'+escapeHtml(d.category||'Deal')+'</p><h3 style="font-size:16px;font-weight:700;margin:2px 0 0">'+escapeHtml(d.merchant)+'</h3></div>'+sharedBadge+'</div>';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-end"><div><p style="font-size:22px;font-weight:800;margin:0">'+escapeHtml(d.discount)+'</p><p style="font-size:11px;opacity:0.9;margin:2px 0 0">'+expText+'</p></div>';
    if(d.code)html+='<span style="background:rgba(0,0,0,0.25);padding:4px 10px;border-radius:6px;font-family:ui-monospace,monospace;font-size:11px;font-weight:600">'+escapeHtml(d.code)+'</span>';
    html+='</div></div>';
    // Expanded
    html+='<div class="pexp" style="display:none">';
    html+='<div class="gradient-'+grad+'" style="height:140px;padding:18px;display:flex;flex-direction:column;justify-content:space-between;margin:-18px -20px 0">';
    html+='<span style="background:rgba(255,255,255,0.95);color:#1A1A1A;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;padding:5px 10px;border-radius:999px;align-self:flex-start">'+escapeHtml(d.category)+' · '+expText+'</span>';
    html+='<h2 style="color:white;font-size:32px;font-weight:900;margin:0;letter-spacing:-1px;line-height:1">'+escapeHtml(d.discount)+'</h2></div>';
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
    html+='<button onclick="event.stopPropagation();shareDeal(\''+d.id+'\')" title="Share" style="flex:0 0 44px;padding:0;border-radius:10px;background:#F0F9FF;color:#2563EB;border:none;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>';
    html+='<button onclick="event.stopPropagation();deleteDeal(\''+d.id+'\')" title="Delete" style="flex:0 0 44px;padding:0;border-radius:10px;background:#FFE5E5;color:#DC2626;border:none;display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg></button>';
    html+='</div>';
    html+='</div></div></div>';
  });
  return html;
}

function renderProgramsList(){
  return state.programs.map((p,i)=>{
    const grads=['linear-gradient(135deg,#6366F1,#C084FC)','linear-gradient(135deg,#F472B6,#FB923C)','linear-gradient(135deg,#1E40AF,#3B82F6)','linear-gradient(135deg,#00C9A7,#4FACFE)'];
    return '<div onclick="viewProgram(\''+p.id+'\')" style="background:'+grads[i%4]+';border-radius:18px;padding:20px;color:white;margin-bottom:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);cursor:pointer"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px"><div><p style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.9;margin:0">Reward Program</p><h3 style="font-size:18px;font-weight:800;margin:4px 0 0">'+escapeHtml(p.name)+'</h3></div><span style="font-size:28px">'+(p.icon||'⭐')+'</span></div><div style="display:flex;justify-content:space-between;align-items:flex-end"><div><p style="font-size:24px;font-weight:900;margin:0">'+escapeHtml(p.balance)+'</p><p style="font-size:11px;opacity:0.9;margin:2px 0 0">'+escapeHtml(p.unit)+(p.expiry?' · expires '+fmtDate(p.expiry):' · no expiry')+'</p></div></div></div>';
  }).join('');
}

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
  el.style.background=getGradStyle(el.getAttribute('class-grad'));
  el.style.color='white';
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
  state.rewards.points+=10;
  state.rewards.saved+=parseFloat(d.value)||0;
  if(state.rewards.lastClaim!==todayStr()){
    const yest=new Date();yest.setDate(yest.getDate()-1);
    if(state.rewards.lastClaim===yest.toISOString().slice(0,10))state.rewards.streak+=1;
    else state.rewards.streak=1;
    state.rewards.lastClaim=todayStr();
  }
  state.rewards.spins+=1;
  save(K.deals,state.deals);save(K.rewards,state.rewards);
  toast('✓ Saved $'+(parseFloat(d.value)||0).toFixed(0)+' · +10 pts · +1 spin');
  renderAll();
};

window.shareDeal=function(id){
  const d=state.deals.find(x=>x.id===id);
  if(!d)return;
  const text=d.merchant+': '+d.discount+(d.code?' (code '+d.code+')':'')+(d.expiry?' — expires '+fmtDate(d.expiry):'');
  if(navigator.share){
    navigator.share({title:'Perq deal: '+d.merchant,text}).then(()=>{
      d.shared=true;
      d.sharedAt=Date.now();
      state.rewards.points+=5;
      save(K.deals,state.deals);save(K.rewards,state.rewards);
      toast('✓ Shared · +5 pts');
      renderAll();
    }).catch(()=>{});
  } else if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(()=>{
      d.shared=true;
      d.sharedAt=Date.now();
      state.rewards.points+=5;
      save(K.deals,state.deals);save(K.rewards,state.rewards);
      toast('Copied to clipboard · +5 pts');
      renderAll();
    });
  }
};

window.deleteDeal=function(id){
  if(!confirm('Delete this deal?'))return;
  state.deals=state.deals.filter(d=>d.id!==id);
  save(K.deals,state.deals);
  toast('Deleted');
  renderAll();
};

window.viewProgram=function(id){
  const p=state.programs.find(x=>x.id===id);
  if(!p)return;
  if(confirm(p.name+'\nBalance: '+p.balance+' '+p.unit+(p.expiry?'\nExpires: '+p.expiry:'')+'\n\nDelete this program?')){
    state.programs=state.programs.filter(x=>x.id!==id);
    save(K.programs,state.programs);
    toast('Deleted');
    renderAll();
  }
};

// -------- Browse --------
function renderBrowse(){
  const local=document.getElementById('local-deals-list');
  const sample=getSampleLocalDeals();
  local.innerHTML='<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin:0 0 12px">📍 '+sample.length+' deals nearby</p>'+sample.map(d=>{
    const grad=getGradient(d.category);
    return '<button onclick="claimBrowseDeal(\''+d.merchant+'\',\''+d.discount+'\',\''+d.category+'\',\''+(d.code||'')+'\',\''+d.expiry+'\')" style="width:100%;background:white;border-radius:16px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);text-align:left"><div class="gradient-'+grad+'" style="width:56px;height:56px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:14px;flex-shrink:0">'+escapeHtml(d.discount.split(' ')[0])+'</div><div style="flex:1;min-width:0"><p style="font-size:14px;font-weight:700;margin:0">'+escapeHtml(d.merchant)+'</p><p style="font-size:12px;color:var(--text-dim);margin:2px 0 0">'+escapeHtml(d.discount)+'</p><p style="font-size:11px;color:var(--accent-dark);font-weight:700;margin:4px 0 0">📍 '+d.distance+' mi · '+d.time+'</p></div><span style="background:var(--accent);color:#1A1A1A;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700">Claim</span></button>';
  }).join('');

  const onl=document.getElementById('online-deals-list');
  const od=getSampleOnlineDeals();
  onl.innerHTML='<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin:0 0 12px">🌐 Top online deals</p><div style="columns:2;column-gap:8px">'+od.map(d=>{
    const grad=getGradient(d.category);
    return '<button onclick="claimBrowseDeal(\''+d.merchant+'\',\''+d.discount+'\',\''+d.category+'\',\''+(d.code||'')+'\',\''+d.expiry+'\')" style="break-inside:avoid;margin-bottom:8px;border-radius:16px;overflow:hidden;position:relative;width:100%;padding:0;display:block;text-align:left"><div class="gradient-'+grad+'" style="height:'+d.h+'px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:30px">'+escapeHtml(d.short)+'</div><div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(180deg,transparent,rgba(0,0,0,0.85));padding:24px 12px 12px;color:white"><p style="font-size:13px;font-weight:700;margin:0">'+escapeHtml(d.merchant)+'</p><p style="font-size:11px;opacity:0.9;margin:0">'+escapeHtml(d.subtitle)+'</p></div></button>';
  }).join('')+'</div>';

  const fr=document.getElementById('friends-deals-list');
  fr.innerHTML='<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin:0 0 12px">👥 Shared by friends</p><div style="background:white;border-radius:16px;padding:24px;text-align:center;color:var(--text-dim)"><div style="font-size:40px;margin-bottom:8px;opacity:0.4">👥</div><p style="font-size:14px;font-weight:700;margin:0 0 4px;color:#1A1A1A">No friends yet</p><p style="font-size:12px;margin:0">Connect with friends to see their shared deals here.</p></div>';
}

function getSampleLocalDeals(){
  return [
    {merchant:'Starbucks',discount:'FREE grande drink',category:'Dining',code:'BD2026',expiry:futureDate(7),distance:'0.3',time:'5 min walk'},
    {merchant:'Whole Foods',discount:'20% off produce',category:'Groceries',code:'FRESH20',expiry:futureDate(10),distance:'0.8',time:'3 min drive'},
    {merchant:'Target',discount:'$10 off $50',category:'Home',code:'SAVE10',expiry:futureDate(14),distance:'1.2',time:'5 min drive'},
    {merchant:'Nike',discount:'25% off sale',category:'Apparel',code:'EXTRA25',expiry:futureDate(5),distance:'2.1',time:'8 min drive'},
    {merchant:'Sephora',discount:'Free shipping',category:'Beauty',code:'BEAUTY3',expiry:futureDate(8),distance:'2.8',time:'10 min drive'},
    {merchant:'Old Navy',discount:'40% off everything',category:'Apparel',code:'FORTY',expiry:futureDate(3),distance:'3.4',time:'12 min drive'}
  ];
}
function getSampleOnlineDeals(){
  return [
    {merchant:'Amazon',discount:'15% off',category:'Home',code:'HOME15',expiry:futureDate(7),short:'15%',subtitle:'Household items',h:200},
    {merchant:'Best Buy',discount:'$50 off',category:'Electronics',code:'LAP50',expiry:futureDate(10),short:'$50',subtitle:'Laptops $500+',h:240},
    {merchant:'Marriott',discount:'$50 off',category:'Travel',code:'WKND50',expiry:futureDate(14),short:'$50',subtitle:'Weekend stays',h:180},
    {merchant:'Sephora',discount:'30% off',category:'Beauty',code:'GLOW30',expiry:futureDate(5),short:'30%',subtitle:'Skincare sale',h:220},
    {merchant:'Costco',discount:'$25 off',category:'Groceries',code:'SAVE25',expiry:futureDate(12),short:'$25',subtitle:'$250+ orders',h:160},
    {merchant:'Nike',discount:'25% off',category:'Apparel',code:'EXTRA25',expiry:futureDate(8),short:'25%',subtitle:'Sale items',h:200}
  ];
}

window.claimBrowseDeal=function(merchant,discount,category,code,expiry){
  state.deals.push({
    id:uid(),merchant,discount,category,code:code||'',expiry,
    value:parseValue(discount),notes:'Claimed from Browse',redeemed:false,createdAt:Date.now()
  });
  state.rewards.spins+=1;
  save(K.deals,state.deals);save(K.rewards,state.rewards);
  toast('✓ Added to wallet · +1 spin');
  renderAll();
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

// -------- Rewards --------
function getCurrentTier(){let cur=TIERS[0];for(const t of TIERS){if(state.rewards.points>=t.min)cur=t;}return cur;}

function renderRewards(){
  document.getElementById('points-display').textContent=state.rewards.points.toLocaleString();
  const tier=getCurrentTier();
  const tb=document.getElementById('tier-badge');
  tb.textContent=tier.emoji+' '+tier.name;
  tb.style.background='linear-gradient(135deg,'+tier.colors[0]+','+tier.colors[1]+')';
  const fill=document.getElementById('progress-fill');
  fill.style.background='linear-gradient(90deg,'+tier.colors[0]+','+tier.colors[1]+')';
  const pct=tier.next===Infinity?100:Math.min(100,((state.rewards.points-tier.min)/(tier.next-tier.min))*100);
  fill.style.width=pct+'%';
  document.getElementById('next-tier-text').textContent=tier.next===Infinity?'Max tier':(tier.next-state.rewards.points)+' to '+TIERS[TIERS.indexOf(tier)+1].name;
  document.getElementById('streak-pill').textContent='🔥 '+state.rewards.streak+' day streak';

  const spinBtn=document.getElementById('spin-btn');
  const avail=document.getElementById('spins-available');
  if(state.rewards.spins>0){
    spinBtn.disabled=false;spinBtn.style.opacity='1';
    avail.textContent=state.rewards.spins+' spin'+(state.rewards.spins===1?'':'s')+' available';
  } else {
    spinBtn.disabled=true;spinBtn.style.opacity='0.5';
    avail.textContent='Save a deal to earn spins (+1 per save)';
  }
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
  const idx=weightedPick([22,8,14,12,22,4,12,6]);
  const wheel=document.getElementById('wheel');
  const cur=parseFloat((wheel.style.transform.match(/-?[\d.]+/)||[0])[0])||0;
  const target=cur+360*5+(idx*45)+22.5;
  wheel.style.transform='rotate('+target+'deg)';
  document.getElementById('spin-btn').disabled=true;
  document.getElementById('spin-result').textContent='';
  setTimeout(()=>{
    const slice=slices[idx];
    document.getElementById('spin-result').textContent='🎉 '+slice.label;
    state.rewards.points+=slice.pts;
    if(slice.respin)state.rewards.spins+=1;
    save(K.rewards,state.rewards);
    spinning=false;
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
  const r=new FileReader();
  r.onload=()=>{
    pendingDealImage=r.result;
    runScanFlow(pendingDealImage);
  };
  r.readAsDataURL(f);
  e.target.value='';
});

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
const OCR_PROXY_URL=''; // set after deploying backend/ocr-proxy
async function extractDealFromImage(imageDataUrl){
  const match=imageDataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if(!match)throw new Error('Invalid image format');
  const mediaType=match[1];
  const b64=match[2];

  const prompt=`Extract coupon/deal details from this image. Return ONLY a JSON object with these fields:
{
  "merchant": "store/brand name as shown on the coupon",
  "discount": "the actual offer text, e.g. 'Up to $2,000 off' or '20% off produce'",
  "code": "promo code if visible, else empty string",
  "expiry": "YYYY-MM-DD format if a date is visible, else empty string",
  "category": "one of: Groceries, Dining, Apparel, Travel, Beauty, Home, Electronics, Other",
  "value": estimated dollar value as a number (e.g. 2000 for $2,000 off, 20 for 20% off),
  "address": "business address if visible, else empty string",
  "url": "website URL if visible, else empty string"
}
Read carefully — get the merchant name and discount EXACTLY as they appear. Return only the JSON, no other text.`;

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

window.openDealPreview=function(data,image){
  const cats=CATEGORIES.map(c=>'<option value="'+c+'"'+(c===data.category?' selected':'')+'>'+c+'</option>').join('');
  let html='<div class="modal-handle"></div><h3 class="modal-title">Review & save</h3>';
  if(image)html+='<div style="width:100%;height:100px;background:#f5f5f5;border-radius:12px;margin-bottom:12px;overflow:hidden"><img src="'+image+'" style="width:100%;height:100%;object-fit:cover"></div>';
  html+='<div style="background:#EAFBF4;border:1px solid #00C9A7;border-radius:12px;padding:10px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#065F46;font-weight:600"><span style="font-size:16px">✨</span>AI extracted these details — review below</div>';
  html+='<div class="form-row"><label>Merchant *</label><input id="f-merchant" placeholder="Store name" value="'+escapeHtml(data.merchant||'')+'"></div>';
  html+='<div class="form-row"><label>Discount *</label><input id="f-discount" placeholder="20% off" value="'+escapeHtml(data.discount||'')+'"></div>';
  html+='<div class="form-grid"><div class="form-row"><label>Category</label><select id="f-category">'+cats+'</select></div><div class="form-row"><label>Value ($)</label><input id="f-value" type="number" inputmode="numeric" placeholder="10" value="'+escapeHtml(String(data.value||''))+'"></div></div>';
  html+='<div class="form-grid"><div class="form-row"><label>Code</label><input id="f-code" placeholder="SAVE20" value="'+escapeHtml(data.code||'')+'"></div><div class="form-row"><label>Expires</label><input id="f-expiry" type="date" value="'+escapeHtml(data.expiry||'')+'"></div></div>';
  html+='<div class="form-row"><label>Address (optional)</label><input id="f-address" placeholder="For directions" value="'+escapeHtml(data.address||'')+'"></div>';
  html+='<div class="form-actions"><button class="btn-secondary" onclick="closeModal();pendingDealImage=null">Cancel</button><button class="btn-primary" onclick="saveDealForm()">Save deal</button></div>';
  openModal(html);
};

// Replaces the old openAddManual — for "Type a deal" mode (no scan)
window.openAddManual=function(image){
  openDealPreview({},image||null);
};

window.saveDealForm=function(){
  const m=document.getElementById('f-merchant').value.trim();
  const d=document.getElementById('f-discount').value.trim();
  if(!m||!d){toast('Merchant and discount required');return;}
  state.deals.push({
    id:uid(),merchant:m,discount:d,
    category:document.getElementById('f-category').value,
    value:parseFloat(document.getElementById('f-value').value)||parseValue(d),
    code:document.getElementById('f-code').value.trim(),
    expiry:document.getElementById('f-expiry').value||'',
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
  renderAll();
};

window.openAddProgram=function(){
  const html='<div class="modal-handle"></div><h3 class="modal-title">Add reward program</h3>'+
    '<div class="form-row"><label>Program name *</label><input id="rp-name" placeholder="Delta SkyMiles, Marriott Bonvoy"></div>'+
    '<div class="form-grid"><div class="form-row"><label>Balance</label><input id="rp-balance" type="number" inputmode="numeric" placeholder="50000"></div><div class="form-row"><label>Unit</label><input id="rp-unit" placeholder="miles" value="points"></div></div>'+
    '<div class="form-row"><label>Type</label><select id="rp-type"><option value="✈️">Airline miles</option><option value="🏨">Hotel points</option><option value="💳">Credit card rewards</option><option value="💵">Cashback</option><option value="⭐">Other</option></select></div>'+
    '<div class="form-row"><label>Expiry (if any)</label><input id="rp-expiry" type="date"></div>'+
    '<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveProgram()">Save</button></div>';
  openModal(html);
};

window.saveProgram=function(){
  const name=document.getElementById('rp-name').value.trim();
  if(!name){toast('Name required');return;}
  state.programs.push({
    id:uid(),name,
    balance:document.getElementById('rp-balance').value||'0',
    unit:document.getElementById('rp-unit').value||'points',
    icon:document.getElementById('rp-type').value,
    expiry:document.getElementById('rp-expiry').value||null,
    addedAt:Date.now()
  });
  save(K.programs,state.programs);
  closeModal();
  toast('✓ Program added');
  renderAll();
};

window.openAddLoyalty=function(){
  const colors=['#DC2626','#059669','#7C3AED','#2563EB','#D97706','#1F2937'];
  const html='<div class="modal-handle"></div><h3 class="modal-title">Add loyalty card</h3>'+
    '<div class="form-row"><label>Store name *</label><input id="lc-name" placeholder="Costco, CVS ExtraCare"></div>'+
    '<div class="form-row"><label>Card / member number *</label><input id="lc-number" placeholder="1234 5678 9012" inputmode="numeric"></div>'+
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
  document.querySelectorAll('.toggle').forEach(t=>{
    const k=t.getAttribute('data-setting');
    if(state.settings[k])t.classList.add('on');else t.classList.remove('on');
  });
  // API key status
  const apiKey=load('perq-mvp:apiKey','');
  const provider=load('perq-mvp:apiProvider','anthropic');
  const statusEl=document.getElementById('api-key-status');
  if(statusEl){
    if(apiKey){
      const provName=provider==='openai'?'OpenAI GPT-4o':'Claude';
      statusEl.textContent='✓ '+provName+' connected — AI scan active';
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
};

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
  location.reload();
};

window.checkReminders=function(){
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
  renderHome();
  renderWallet();
  renderRewards();
  renderSettings();
}

// -------- Init --------
checkOnboarding();
renderAll();
})();

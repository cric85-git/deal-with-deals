/* Perq MVP — Ground-zero working app */
(function(){
'use strict';

const KEY = 'perq-mvp:';
const K = {
  profile: KEY+'profile',
  deals: KEY+'deals',
  programs: KEY+'programs',
  loyalty: KEY+'loyalty',
  rewards: KEY+'rewards',
  settings: KEY+'settings',
  onboarded: KEY+'onboarded'
};

const TIERS = [
  {name:'BRONZE',min:0,emoji:'🥉',colors:['#A07248','#8B5A2B'],next:100},
  {name:'SILVER',min:100,emoji:'🥈',colors:['#9CA3AF','#6B7280'],next:300},
  {name:'GOLD',min:300,emoji:'🥇',colors:['#FFD700','#FFA500'],next:750},
  {name:'PLATINUM',min:750,emoji:'💎',colors:['#6366F1','#3B82F6'],next:Infinity}
];

const GRADIENTS = ['warm','green','purple','pink'];
const CATEGORIES = ['Groceries','Dining','Apparel','Travel','Beauty','Home','Electronics','Other'];

let state = {
  profile: load(K.profile, null),
  deals: load(K.deals, []),
  programs: load(K.programs, []),
  loyalty: load(K.loyalty, []),
  rewards: load(K.rewards, {points:0,spins:0,streak:0,saved:0,lastClaim:null}),
  settings: load(K.settings, {reminders:true,proximity:true,social:false}),
  selectedPrefs: []
};

let currentBrowseTab = 'local';
let onboardStep = 1;
let pendingDealImage = null;

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

function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t=setTimeout(()=>t.classList.remove('show'),2400);
}

// -------- Onboarding --------
function nextStep(){
  if(onboardStep===2){
    const name=document.getElementById('ob-name').value.trim();
    if(!name){toast('Enter your name or skip');return;}
    state.profile={name,createdAt:Date.now(),preferences:[]};
    save(K.profile,state.profile);
  }
  onboardStep++;
  document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('active'));
  document.querySelector('.ob-step[data-step="'+onboardStep+'"]').classList.add('active');
  document.querySelectorAll('.ob-dot').forEach((d,i)=>{
    d.classList.toggle('active',(i+1)<=onboardStep);
  });
}

function finishOnboarding(){
  if(state.selectedPrefs.length>0 && state.profile){
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
}

function checkOnboarding(){
  const onboarded=load(K.onboarded,false);
  if(!onboarded){
    document.getElementById('onboarding').classList.remove('hidden');
  } else {
    document.getElementById('onboarding').classList.add('hidden');
  }
}

document.querySelectorAll('.ob-pref').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const pref=btn.getAttribute('data-pref');
    btn.classList.toggle('active');
    if(state.selectedPrefs.includes(pref)){
      state.selectedPrefs=state.selectedPrefs.filter(p=>p!==pref);
    } else {
      state.selectedPrefs.push(pref);
    }
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
  if(page==='loyalty')renderLoyalty();
  if(page==='settings')renderSettings();
  if(page==='home')renderHome();
};

window.nextStep=nextStep;
window.finishOnboarding=finishOnboarding;

// -------- Home --------
function renderHome(){
  const totalSaved=state.deals.filter(d=>d.redeemed).reduce((s,d)=>s+(parseFloat(d.value)||0),0);
  document.getElementById('total-saved').textContent='$'+totalSaved.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  document.getElementById('streak-text').innerHTML=
    state.rewards.streak>0
      ?'+$'+totalSaved+' total · '+state.rewards.streak+' day streak 🔥'
      :'Save your first deal to start a streak';

  const dealsSection=document.getElementById('deals-section');
  const active=state.deals.filter(d=>!d.redeemed);
  const expiring=active.filter(d=>{
    const du=daysUntil(d.expiry);
    return du!==null && du>=0 && du<=7;
  });

  if(active.length===0){
    document.getElementById('see-all-deals').style.display='none';
    dealsSection.innerHTML='<div class="empty-state"><div class="empty-state-icon">🎟️</div><p class="empty-state-title">No deals yet</p><p class="empty-state-sub">Snap a coupon photo or upload a screenshot to add your first deal.</p><button class="empty-state-cta" onclick="openSnapSheet()">📷 Snap your first deal</button></div>';
  } else {
    document.getElementById('see-all-deals').style.display='block';
    const showList=expiring.length?expiring:active.slice(0,3);
    let html='<div class="h-carousel">';
    showList.forEach(d=>{
      const grad=getGradient(d.category);
      const du=daysUntil(d.expiry);
      const pct=d.discount.match(/(\d+%|FREE|\$\d+)/i);
      const pctText=pct?pct[1]:d.discount.slice(0,8);
      const expiryText=du===null?'No expiry':du===0?'⏰ Today!':du===1?'⏰ Tomorrow':du<0?'Expired':'⏰ '+du+'d left';
      html+='<button class="h-deal" onclick="openDealCard(\''+d.id+'\')"><div class="h-hero gradient-'+grad+'"><span class="h-pct">'+escapeHtml(pctText)+'</span><span class="h-merchant-overlay">'+escapeHtml(d.merchant)+'</span></div><div class="h-body"><p class="h-discount">'+escapeHtml(d.discount)+'</p><p class="h-expiry">'+expiryText+'</p><span class="h-cta">View</span></div></button>';
    });
    html+='</div>';
    dealsSection.innerHTML=html;
  }

  // Programs row
  const progRow=document.getElementById('programs-row');
  let pHtml='';
  if(state.programs.length===0){
    pHtml='<button class="program-tile add-tile" style="min-width:200px;min-height:90px" onclick="openAddProgram()"><i class="ti ti-plus"></i><span>Add airline miles, hotel points, or credit card rewards</span></button>';
  } else {
    state.programs.forEach((p,i)=>{
      const grad=['linear-gradient(135deg,#6366F1,#C084FC)','linear-gradient(135deg,#F472B6,#FB923C)','linear-gradient(135deg,#1E40AF,#3B82F6)','linear-gradient(135deg,#00C9A7,#4FACFE)'][i%4];
      pHtml+='<button class="program-tile" onclick="viewProgram(\''+p.id+'\')"><div class="program-icon" style="background:'+grad+'">'+(p.icon||'⭐')+'</div><p class="program-name">'+escapeHtml(p.name)+'</p><p class="program-balance">'+escapeHtml(p.balance)+' '+escapeHtml(p.unit)+'</p></button>';
    });
    pHtml+='<button class="program-tile add-tile" onclick="openAddProgram()"><i class="ti ti-plus"></i><span>Add</span></button>';
  }
  progRow.innerHTML=pHtml;

  // Loyalty row
  const lRow=document.getElementById('loyalty-row');
  let lHtml='';
  if(state.loyalty.length===0){
    lHtml='<button class="loyalty-card add-tile" style="background:rgba(0,0,0,0.05);color:#1a1a1a;border:2px dashed rgba(0,0,0,0.15);box-shadow:none;width:auto;min-width:240px" onclick="openAddLoyalty()"><i class="ti ti-plus"></i><span style="font-size:12px;font-weight:600;margin-top:4px">Add Costco, CVS, or any loyalty card</span></button>';
  } else {
    state.loyalty.forEach(c=>{
      const masked=c.number.length>4?'**** '+c.number.slice(-4):c.number;
      lHtml+='<button class="loyalty-card" style="background:'+c.color+'" onclick="showLoyaltyBarcode(\''+c.id+'\')"><p class="loyalty-name">'+escapeHtml(c.name)+'</p><p class="loyalty-num">'+escapeHtml(masked)+'</p></button>';
    });
    lHtml+='<button class="loyalty-card add-tile" style="background:rgba(0,0,0,0.05);color:#1a1a1a;border:2px dashed rgba(0,0,0,0.15);box-shadow:none" onclick="openAddLoyalty()"><i class="ti ti-plus"></i><span style="font-size:12px;font-weight:600;margin-top:4px">Add</span></button>';
  }
  lRow.innerHTML=lHtml;
}

window.openDealCard=function(id){
  goPage('wallet');
  setTimeout(()=>{
    const el=document.querySelector('[data-deal-id="'+id+'"]');
    if(el){el.click();el.scrollIntoView({behavior:'smooth',block:'center'});}
  },200);
};

// -------- Wallet --------
function renderWallet(){
  const active=state.deals.filter(d=>!d.redeemed);
  const sub=document.getElementById('wallet-sub');
  sub.textContent=active.length===0?'No deals yet':active.length+' active · saved $'+state.deals.filter(d=>d.redeemed).reduce((s,d)=>s+(parseFloat(d.value)||0),0);

  const c=document.getElementById('wallet-content');
  if(active.length===0){
    c.innerHTML='<div style="background:white;border-radius:18px;padding:40px 24px;text-align:center"><div style="font-size:56px;opacity:0.4;margin-bottom:8px">📭</div><p style="font-size:16px;font-weight:700;margin:0 0 4px;color:#1a1a1a">Your wallet is empty</p><p style="font-size:13px;color:#777;margin:0 0 16px">Snap a coupon to add your first deal.</p><button class="empty-state-cta" onclick="openSnapSheet()">📷 Snap a deal</button></div>';
    return;
  }

  let html='';
  active.forEach((d,i)=>{
    const grad=getGradient(d.category);
    const du=daysUntil(d.expiry);
    const expText=du===null?'No expiry':du===0?'Expires TODAY':du===1?'Expires tomorrow':du<0?'Expired':'Expires in '+du+' days';
    const isLast=i===active.length-1;
    html+='<div class="wpass" data-deal-id="'+d.id+'" onclick="togglePass(this)" style="border-radius:18px;padding:18px 20px;'+(isLast?'margin-bottom:14px':'margin-bottom:-90px')+';position:relative;box-shadow:0 8px 24px rgba(0,0,0,0.4);cursor:pointer;color:white" class-grad="'+grad+'">';
    html+='<div class="pcoll" style="display:flex;flex-direction:column;gap:60px">';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><p style="font-size:9px;font-weight:700;letter-spacing:1px;text-transform:uppercase;opacity:0.9;margin:0">'+escapeHtml(d.category||'Deal')+'</p><h3 style="font-size:16px;font-weight:700;margin:2px 0 0">'+escapeHtml(d.merchant)+'</h3></div></div>';
    html+='<div style="display:flex;justify-content:space-between;align-items:flex-end"><div><p style="font-size:22px;font-weight:800;margin:0">'+escapeHtml(d.discount)+'</p><p style="font-size:11px;opacity:0.9;margin:2px 0 0">'+expText+'</p></div>';
    if(d.code)html+='<span style="background:rgba(0,0,0,0.25);padding:4px 10px;border-radius:6px;font-family:ui-monospace,monospace;font-size:11px;font-weight:600">'+escapeHtml(d.code)+'</span>';
    html+='</div></div>';
    // Expanded
    html+='<div class="pexp" style="display:none">';
    html+='<div class="gradient-'+grad+'" style="height:140px;padding:18px;display:flex;flex-direction:column;justify-content:space-between;margin:-18px -20px 0">';
    html+='<span style="background:rgba(255,255,255,0.95);color:#1a1a1a;font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;padding:5px 10px;border-radius:999px;align-self:flex-start">'+escapeHtml(d.category)+' · '+expText+'</span>';
    html+='<h2 style="color:white;font-size:36px;font-weight:900;margin:0;letter-spacing:-1px;line-height:1">'+escapeHtml(d.discount)+'</h2></div>';
    html+='<div style="padding:16px 18px 18px;background:white;color:#1a1a1a;margin:0 -20px -18px">';
    html+='<h3 style="font-size:22px;font-weight:800;margin:0">'+escapeHtml(d.merchant)+'</h3>';
    if(d.notes)html+='<p style="font-size:13px;color:#777;margin:4px 0 14px">'+escapeHtml(d.notes)+'</p>';
    if(d.address){
      const mapsUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(d.address);
      html+='<a href="'+escapeHtml(mapsUrl)+'" target="_blank" onclick="event.stopPropagation()" style="background:#f5f5f5;border-radius:12px;padding:12px;margin-bottom:14px;display:flex;align-items:center;gap:10px;text-decoration:none;color:#1a1a1a"><div style="width:36px;height:36px;border-radius:8px;background:#4FACFE;display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0"><i class="ti ti-map-pin"></i></div><div style="flex:1"><p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#777;margin:0">Tap for directions</p><p style="font-size:13px;font-weight:600;margin:2px 0 0">'+escapeHtml(d.address)+'</p></div><i class="ti ti-chevron-right" style="color:#999;font-size:18px"></i></a>';
    }
    if(d.code){
      html+='<div style="background:white;border:1px solid rgba(0,0,0,0.08);border-radius:12px;padding:14px;text-align:center;margin-bottom:14px">';
      html+='<div style="height:60px;background-image:repeating-linear-gradient(90deg,#1a1a1a 0px,#1a1a1a 2px,transparent 2px,transparent 4px,#1a1a1a 4px,#1a1a1a 8px,transparent 8px,transparent 10px,#1a1a1a 10px,#1a1a1a 12px,transparent 12px,transparent 16px);margin-bottom:8px"></div>';
      html+='<p style="font-family:ui-monospace,monospace;font-size:14px;font-weight:700;letter-spacing:2px;margin:0">'+escapeHtml(d.code)+'</p></div>';
    }
    html+='<div style="display:flex;gap:8px"><button onclick="event.stopPropagation();redeemDeal(\''+d.id+'\')" style="flex:1;border:none;padding:12px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;background:#1a1a1a;color:white">✓ Mark redeemed</button>';
    html+='<button onclick="event.stopPropagation();shareDeal(\''+d.id+'\')" style="flex:0 0 50px;border:none;padding:12px;border-radius:12px;cursor:pointer;background:#f5f5f5;color:#1a1a1a"><i class="ti ti-share"></i></button>';
    html+='<button onclick="event.stopPropagation();deleteDeal(\''+d.id+'\')" style="flex:0 0 50px;border:none;padding:12px;border-radius:12px;cursor:pointer;background:#FFE5E5;color:#DC2626"><i class="ti ti-trash"></i></button></div>';
    html+='</div></div></div>';
  });
  c.innerHTML=html;
  // Set gradients
  document.querySelectorAll('.wpass').forEach(p=>{
    const g=p.getAttribute('class-grad');
    p.style.background=getGradStyle(g);
  });
}

function getGradStyle(g){
  const map={
    warm:'linear-gradient(135deg,#FF6B6B,#FFA06B)',
    green:'linear-gradient(135deg,#00C9A7,#4FACFE)',
    purple:'linear-gradient(135deg,#6366F1,#C084FC)',
    pink:'linear-gradient(135deg,#F472B6,#FB923C)'
  };
  return map[g]||map.warm;
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
  el.style.color='#1a1a1a';
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
  // marginBottom logic — last item different
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
  // Streak
  if(state.rewards.lastClaim===todayStr()){/* same day */}
  else {
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
    navigator.share({title:'Perq deal: '+d.merchant,text}).catch(()=>{});
  } else if(navigator.clipboard){
    navigator.clipboard.writeText(text).then(()=>toast('Copied to clipboard'));
  }
  state.rewards.points+=5;
  save(K.rewards,state.rewards);
  renderAll();
};

window.deleteDeal=function(id){
  if(!confirm('Delete this deal?'))return;
  state.deals=state.deals.filter(d=>d.id!==id);
  save(K.deals,state.deals);
  toast('Deleted');
  renderAll();
};

// -------- Browse --------
function renderBrowse(){
  // Local
  const local=document.getElementById('local-deals-list');
  const sample=getSampleLocalDeals();
  local.innerHTML='<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin:0 0 12px">📍 '+sample.length+' deals nearby</p>'+sample.map(d=>{
    const grad=getGradient(d.category);
    return '<button onclick="claimBrowseDeal(\''+d.merchant+'\',\''+d.discount+'\',\''+d.category+'\',\''+(d.code||'')+'\',\''+d.expiry+'\')" style="width:100%;background:white;border:none;border-radius:16px;padding:12px;margin-bottom:10px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);cursor:pointer;text-align:left"><div class="gradient-'+grad+'" style="width:56px;height:56px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:14px;flex-shrink:0">'+escapeHtml(d.discount.split(' ')[0])+'</div><div style="flex:1;min-width:0"><p style="font-size:14px;font-weight:700;margin:0">'+escapeHtml(d.merchant)+'</p><p style="font-size:12px;color:var(--text-dim);margin:2px 0 0">'+escapeHtml(d.discount)+'</p><p style="font-size:11px;color:var(--accent-dark);font-weight:700;margin:4px 0 0">📍 '+d.distance+' mi · '+d.time+'</p></div><span style="background:var(--accent);color:#1a1a1a;border:none;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:700">Claim</span></button>';
  }).join('');

  // Online — Pinterest grid
  const onl=document.getElementById('online-deals-list');
  const onlineDeals=getSampleOnlineDeals();
  onl.innerHTML='<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin:0 0 12px">🌐 Top online deals</p><div style="columns:2;column-gap:8px">'+onlineDeals.map(d=>{
    const grad=getGradient(d.category);
    return '<button onclick="claimBrowseDeal(\''+d.merchant+'\',\''+d.discount+'\',\''+d.category+'\',\''+(d.code||'')+'\',\''+d.expiry+'\')" style="break-inside:avoid;margin-bottom:8px;border-radius:16px;overflow:hidden;position:relative;cursor:pointer;width:100%;border:none;padding:0;display:block"><div class="gradient-'+grad+'" style="height:'+d.h+'px;display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:30px">'+escapeHtml(d.short)+'</div><div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(180deg,transparent,rgba(0,0,0,0.85));padding:24px 12px 12px;color:white;text-align:left"><p style="font-size:13px;font-weight:700;margin:0">'+escapeHtml(d.merchant)+'</p><p style="font-size:11px;opacity:0.9;margin:0">'+escapeHtml(d.subtitle)+'</p></div></button>';
  }).join('')+'</div>';

  // Friends
  const fr=document.getElementById('friends-deals-list');
  fr.innerHTML='<p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin:0 0 12px">👥 Shared by friends</p><div style="background:white;border-radius:16px;padding:24px;text-align:center;color:var(--text-dim)"><div style="font-size:40px;margin-bottom:8px;opacity:0.4">👥</div><p style="font-size:14px;font-weight:700;margin:0 0 4px;color:#1a1a1a">No friends yet</p><p style="font-size:12px;margin:0">Connect with friends to see their shared deals here.</p></div>';
}

function getSampleLocalDeals(){
  // Generate stable sample data — no random per render
  return [
    {merchant:'Starbucks',discount:'FREE grande drink',category:'Dining',code:'BD2026',expiry:futureDate(7),distance:'0.3',time:'5 min walk'},
    {merchant:'Whole Foods',discount:'20% off produce',category:'Groceries',code:'FRESH20',expiry:futureDate(10),distance:'0.8',time:'3 min drive'},
    {merchant:'Target',discount:'$10 off $50',category:'Home',code:'SAVE10',expiry:futureDate(14),distance:'1.2',time:'5 min drive'},
    {merchant:'Nike',discount:'25% off sale',category:'Apparel',code:'EXTRA25',expiry:futureDate(5),distance:'2.1',time:'8 min drive'},
    {merchant:'Sephora',discount:'Free shipping + samples',category:'Beauty',code:'BEAUTY3',expiry:futureDate(8),distance:'2.8',time:'10 min drive'},
    {merchant:'Old Navy',discount:'40% off everything',category:'Apparel',code:'FORTY',expiry:futureDate(3),distance:'3.4',time:'12 min drive'}
  ];
}

function getSampleOnlineDeals(){
  return [
    {merchant:'Amazon',discount:'15% off household',category:'Home',code:'HOME15',expiry:futureDate(7),short:'15%',subtitle:'Household items',h:200},
    {merchant:'Best Buy',discount:'$50 off laptops',category:'Electronics',code:'LAP50',expiry:futureDate(10),short:'$50',subtitle:'Laptops $500+',h:240},
    {merchant:'Marriott',discount:'$50 off weekends',category:'Travel',code:'WKND50',expiry:futureDate(14),short:'$50',subtitle:'Weekend stays',h:180},
    {merchant:'Sephora',discount:'30% off beauty',category:'Beauty',code:'GLOW30',expiry:futureDate(5),short:'30%',subtitle:'Skincare sale',h:220},
    {merchant:'Costco',discount:'$25 off online',category:'Groceries',code:'SAVE25',expiry:futureDate(12),short:'$25',subtitle:'$250+ orders',h:160},
    {merchant:'Nike',discount:'25% off sale',category:'Apparel',code:'EXTRA25',expiry:futureDate(8),short:'25%',subtitle:'Sale items',h:200}
  ];
}

function futureDate(days){
  const d=new Date();
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}

window.claimBrowseDeal=function(merchant,discount,category,code,expiry){
  const newDeal={
    id:uid(),
    merchant,discount,category,
    code:code||'',
    expiry,
    value:parseValue(discount),
    notes:'Claimed from Browse',
    redeemed:false,
    createdAt:Date.now()
  };
  state.deals.push(newDeal);
  save(K.deals,state.deals);
  toast('✓ Added to wallet');
  renderAll();
};

function parseValue(disc){
  const dol=disc.match(/\$(\d+)/);
  if(dol)return parseInt(dol[1]);
  const pct=disc.match(/(\d+)%/);
  if(pct)return parseInt(pct[1]);
  if(/free/i.test(disc))return 5;
  return 5;
}

window.setBrowseTab=function(tab){
  currentBrowseTab=tab;
  document.querySelectorAll('.btab').forEach(b=>{
    b.classList.remove('active');
    b.style.background='white';
    b.style.color='#6B6A64';
    b.style.borderColor='rgba(0,0,0,0.08)';
  });
  const a=document.querySelector('.btab[data-btab="'+tab+'"]');
  if(a){a.classList.add('active');a.style.background='#1a1a1a';a.style.color='white';a.style.borderColor='#1a1a1a';}
  document.querySelectorAll('.bsection').forEach(s=>s.style.display='none');
  document.querySelector('.bsection[data-bsection="'+tab+'"]').style.display='block';
};

// -------- Rewards --------
function getCurrentTier(){
  let cur=TIERS[0];
  for(const t of TIERS){if(state.rewards.points>=t.min)cur=t;}
  return cur;
}

function renderRewards(){
  document.getElementById('points-display').textContent=state.rewards.points.toLocaleString();
  const tier=getCurrentTier();
  const tierBadge=document.getElementById('tier-badge');
  tierBadge.textContent=tier.emoji+' '+tier.name;
  tierBadge.style.background='linear-gradient(135deg,'+tier.colors[0]+','+tier.colors[1]+')';
  const fill=document.getElementById('progress-fill');
  fill.style.background='linear-gradient(90deg,'+tier.colors[0]+','+tier.colors[1]+')';
  const pctToNext=tier.next===Infinity?100:Math.min(100,((state.rewards.points-tier.min)/(tier.next-tier.min))*100);
  fill.style.width=pctToNext+'%';
  document.getElementById('next-tier-text').textContent=tier.next===Infinity?'Max tier':(tier.next-state.rewards.points)+' to '+TIERS[TIERS.indexOf(tier)+1].name;
  document.getElementById('streak-pill').textContent='🔥 '+state.rewards.streak+' day streak';

  const spinBtn=document.getElementById('spin-btn');
  const avail=document.getElementById('spins-available');
  if(state.rewards.spins>0){
    spinBtn.disabled=false;
    spinBtn.style.opacity='1';
    avail.textContent=state.rewards.spins+' spin'+(state.rewards.spins===1?'':'s')+' available';
  } else {
    spinBtn.disabled=true;
    spinBtn.style.opacity='0.5';
    avail.textContent='Save a deal to earn spins (+1 per save)';
  }
}

let spinning=false;
window.doSpin=function(){
  if(spinning||state.rewards.spins<1)return;
  spinning=true;
  state.rewards.spins-=1;
  const slices=[
    {label:'+10 pts',pts:10},
    {label:'Bonus deal!',pts:0,deal:true},
    {label:'+25 pts',pts:25},
    {label:'Mystery 🎁',pts:5},
    {label:'+5 pts',pts:5},
    {label:'JACKPOT 100 pts!',pts:100},
    {label:'+15 pts',pts:15},
    {label:'Spin again',pts:0,respin:true}
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

function weightedPick(weights){
  const total=weights.reduce((a,b)=>a+b,0);
  let r=Math.random()*total;
  for(let i=0;i<weights.length;i++){r-=weights[i];if(r<=0)return i;}
  return 0;
}

// -------- Loyalty --------
function renderLoyalty(){
  const c=document.getElementById('loyalty-list');
  if(state.loyalty.length===0){
    c.innerHTML='<div style="background:white;border-radius:18px;padding:40px 20px;text-align:center"><div style="font-size:48px;opacity:0.4;margin-bottom:8px">💳</div><p style="font-size:15px;font-weight:700;margin:0 0 4px">No cards yet</p><p style="font-size:12px;color:#777;margin:0 0 16px">Add your Costco, CVS, Walgreens cards to skip the physical card.</p><button class="empty-state-cta" onclick="openAddLoyalty()">+ Add card</button></div>';
    return;
  }
  c.innerHTML=state.loyalty.map(card=>'<button onclick="showLoyaltyBarcode(\''+card.id+'\')" style="width:100%;background:'+card.color+';border:none;border-radius:18px;padding:20px;color:white;margin-bottom:12px;cursor:pointer;text-align:left;box-shadow:0 4px 12px rgba(0,0,0,0.15)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:30px"><h3 style="font-size:18px;font-weight:800;margin:0">'+escapeHtml(card.name)+'</h3><i class="ti ti-id" style="font-size:24px;opacity:0.7"></i></div><p style="font-family:ui-monospace,monospace;font-size:14px;letter-spacing:2px;margin:0;opacity:0.95">'+escapeHtml(card.number)+'</p></button>').join('');
}

window.showLoyaltyBarcode=function(id){
  const card=state.loyalty.find(c=>c.id===id);
  if(!card)return;
  const o=document.getElementById('modal-overlay');
  o.style.background='rgba(0,0,0,0.85)';
  o.style.alignItems='center';
  o.style.justifyContent='center';
  o.innerHTML='<div onclick="event.stopPropagation()" style="background:white;border-radius:24px;padding:24px;text-align:center;max-width:340px;width:calc(100% - 40px)"><h3 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#1a1a1a">'+escapeHtml(card.name)+'</h3><p style="font-family:ui-monospace,monospace;font-size:14px;color:#777;margin:0 0 16px;letter-spacing:2px">'+escapeHtml(card.number)+'</p><div style="background:white;padding:16px;border:1px solid rgba(0,0,0,0.08);border-radius:14px"><div style="height:90px;background-image:repeating-linear-gradient(90deg,#1a1a1a 0px,#1a1a1a 2px,transparent 2px,transparent 4px,#1a1a1a 4px,#1a1a1a 8px,transparent 8px,transparent 10px,#1a1a1a 10px,#1a1a1a 12px,transparent 12px,transparent 16px);margin-bottom:12px"></div><p style="font-family:ui-monospace,monospace;font-size:12px;font-weight:700;letter-spacing:2px;margin:0;color:#1a1a1a">'+escapeHtml(card.number)+'</p></div><p style="font-size:11px;color:#777;margin:12px 0 16px">Show at checkout</p><div style="display:flex;gap:8px"><button onclick="deleteLoyalty(\''+card.id+'\')" style="flex:0 0 auto;background:#FFE5E5;color:#DC2626;border:none;padding:12px 16px;border-radius:999px;font-size:13px;font-weight:700;cursor:pointer">Delete</button><button onclick="closeModal()" style="flex:1;background:'+card.color+';color:white;border:none;padding:12px 32px;border-radius:999px;font-size:14px;font-weight:700;cursor:pointer">Done</button></div></div>';
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

// -------- Modals --------
function openModal(html){
  const o=document.getElementById('modal-overlay');
  o.style.alignItems='flex-end';
  o.style.justifyContent='flex-start';
  o.style.background='rgba(0,0,0,0.5)';
  o.innerHTML='<div class="modal" onclick="event.stopPropagation()">'+html+'</div>';
  o.classList.add('active');
  o.onclick=closeModal;
}

window.closeModal=function(){
  const o=document.getElementById('modal-overlay');
  o.classList.remove('active');
  o.innerHTML='';
};

window.openSnapSheet=function(){
  openModal('<div class="modal-handle"></div><h3 class="modal-title">Add a deal</h3>'+
    '<button onclick="closeModal();triggerCamera()" style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:14px;background:#f8f8f8;margin-bottom:8px;cursor:pointer;width:100%;border:none;text-align:left"><div class="gradient-warm" style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;flex-shrink:0">📷</div><div style="flex:1"><p style="font-size:15px;font-weight:700;margin:0">Take a photo</p><p style="font-size:12px;color:var(--text-dim);margin:2px 0 0">Snap a coupon to add it</p></div></button>'+
    '<button onclick="closeModal();triggerLibrary()" style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:14px;background:#f8f8f8;margin-bottom:8px;cursor:pointer;width:100%;border:none;text-align:left"><div class="gradient-purple" style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;flex-shrink:0"><i class="ti ti-photo"></i></div><div style="flex:1"><p style="font-size:15px;font-weight:700;margin:0">Choose from library</p><p style="font-size:12px;color:var(--text-dim);margin:2px 0 0">Upload a screenshot</p></div></button>'+
    '<button onclick="closeModal();openAddManual()" style="display:flex;align-items:center;gap:14px;padding:16px;border-radius:14px;background:#f8f8f8;cursor:pointer;width:100%;border:none;text-align:left"><div class="gradient-pink" style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-size:20px;flex-shrink:0"><i class="ti ti-edit"></i></div><div style="flex:1"><p style="font-size:15px;font-weight:700;margin:0">Type it in</p><p style="font-size:12px;color:var(--text-dim);margin:2px 0 0">Enter deal details manually</p></div></button>');
};

window.triggerCamera=function(){
  const i=document.getElementById('capture-input');
  i.setAttribute('capture','environment');
  i.click();
};
window.triggerLibrary=function(){
  const i=document.getElementById('capture-input');
  i.removeAttribute('capture');
  i.click();
};

document.getElementById('capture-input').addEventListener('change',async (e)=>{
  const f=e.target.files&&e.target.files[0];
  if(!f)return;
  const reader=new FileReader();
  reader.onload=()=>{
    pendingDealImage=reader.result;
    openAddManual(pendingDealImage);
  };
  reader.readAsDataURL(f);
  e.target.value='';
});

window.openAddManual=function(image){
  const cats=CATEGORIES.map(c=>'<option value="'+c+'">'+c+'</option>').join('');
  let html='<div class="modal-handle"></div><h3 class="modal-title">Add deal</h3>';
  if(image)html+='<div style="width:100%;aspect-ratio:4/3;background:#f5f5f5;border-radius:12px;margin-bottom:12px;overflow:hidden"><img src="'+image+'" style="width:100%;height:100%;object-fit:cover"></div>';
  html+='<div class="form-row"><label>Merchant *</label><input id="f-merchant" placeholder="e.g. Target, Whole Foods"></div>';
  html+='<div class="form-row"><label>Discount *</label><input id="f-discount" placeholder="e.g. 20% off, $10 off, Free drink"></div>';
  html+='<div class="form-grid"><div class="form-row"><label>Category</label><select id="f-category">'+cats+'</select></div><div class="form-row"><label>Value ($)</label><input id="f-value" type="number" placeholder="10"></div></div>';
  html+='<div class="form-grid"><div class="form-row"><label>Code</label><input id="f-code" placeholder="SAVE20"></div><div class="form-row"><label>Expires</label><input id="f-expiry" type="date"></div></div>';
  html+='<div class="form-row"><label>Address (optional)</label><input id="f-address" placeholder="Store address for directions"></div>';
  html+='<div class="form-row"><label>Notes (optional)</label><textarea id="f-notes" rows="2" placeholder="Min purchase, restrictions, etc."></textarea></div>';
  html+='<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveDealForm()">Save deal</button></div>';
  openModal(html);
};

window.saveDealForm=function(){
  const m=document.getElementById('f-merchant').value.trim();
  const d=document.getElementById('f-discount').value.trim();
  if(!m||!d){toast('Merchant and discount required');return;}
  const newDeal={
    id:uid(),
    merchant:m,
    discount:d,
    category:document.getElementById('f-category').value,
    value:parseFloat(document.getElementById('f-value').value)||parseValue(d),
    code:document.getElementById('f-code').value.trim(),
    expiry:document.getElementById('f-expiry').value||'',
    address:document.getElementById('f-address').value.trim(),
    notes:document.getElementById('f-notes').value.trim(),
    image:pendingDealImage||null,
    redeemed:false,
    createdAt:Date.now()
  };
  state.deals.push(newDeal);
  state.rewards.spins+=1;
  save(K.deals,state.deals);
  save(K.rewards,state.rewards);
  pendingDealImage=null;
  closeModal();
  toast('✓ Deal saved · +1 spin earned');
  renderAll();
};

window.openImportModal=function(){
  let html='<div class="modal-handle"></div><h3 class="modal-title">Upload deal</h3>';
  html+='<div class="form-row"><label>Paste deal text or URL</label><textarea id="imp-text" rows="6" placeholder="Paste the email text, deal description, or website link..."></textarea></div>';
  html+='<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="parseImported()">Continue</button></div>';
  openModal(html);
};

window.parseImported=function(){
  const text=document.getElementById('imp-text').value.trim();
  if(!text){toast('Paste something first');return;}
  // Simple parsing
  const merchantMatch=text.match(/(?:from|at)\s+([A-Z][\w\s'&]+?)(?:\s|[.,!])/i)||text.match(/^([A-Z][\w\s'&]+?)[:.\-]/m);
  const discountMatch=text.match(/(\d{1,3}%\s*off[^.]{0,30}|\$\d+\s*off[^.]{0,30}|free\s+\w+|buy\s+one\s+get\s+one)/i);
  const codeMatch=text.match(/(?:code|promo)[:\s]+([A-Z0-9]{3,15})/i);
  const expiryMatch=text.match(/(?:expires?|valid|ends)\s+(?:by|thru|until|on)?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i);

  const merchant=merchantMatch?merchantMatch[1].trim():'';
  const discount=discountMatch?discountMatch[1].trim():'';

  closeModal();
  setTimeout(()=>{
    openAddManual();
    setTimeout(()=>{
      if(merchant)document.getElementById('f-merchant').value=merchant;
      if(discount)document.getElementById('f-discount').value=discount;
      if(codeMatch)document.getElementById('f-code').value=codeMatch[1].toUpperCase();
      if(expiryMatch){
        try{
          const d=new Date(expiryMatch[1]);
          if(!isNaN(d))document.getElementById('f-expiry').value=d.toISOString().slice(0,10);
        }catch(e){}
      }
    },300);
  },300);
};

// -------- Add Program / Loyalty --------
window.openAddProgram=function(){
  const html='<div class="modal-handle"></div><h3 class="modal-title">Add reward program</h3>'+
    '<div class="form-row"><label>Program name *</label><input id="rp-name" placeholder="Delta SkyMiles, Marriott Bonvoy"></div>'+
    '<div class="form-grid"><div class="form-row"><label>Balance</label><input id="rp-balance" type="number" placeholder="50000"></div><div class="form-row"><label>Unit</label><input id="rp-unit" placeholder="miles" value="points"></div></div>'+
    '<div class="form-row"><label>Type</label><select id="rp-type"><option value="✈️">Airline miles</option><option value="🏨">Hotel points</option><option value="💳">Credit card rewards</option><option value="💵">Cashback</option><option value="⭐">Other</option></select></div>'+
    '<div class="form-row"><label>Expiry (if any)</label><input id="rp-expiry" type="date"></div>'+
    '<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveProgram()">Save</button></div>';
  openModal(html);
};

window.saveProgram=function(){
  const name=document.getElementById('rp-name').value.trim();
  if(!name){toast('Name required');return;}
  const p={
    id:uid(),
    name,
    balance:document.getElementById('rp-balance').value||'0',
    unit:document.getElementById('rp-unit').value||'points',
    icon:document.getElementById('rp-type').value,
    expiry:document.getElementById('rp-expiry').value||null,
    addedAt:Date.now()
  };
  state.programs.push(p);
  save(K.programs,state.programs);
  closeModal();
  toast('✓ Program added');
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

window.openAddLoyalty=function(){
  const html='<div class="modal-handle"></div><h3 class="modal-title">Add loyalty card</h3>'+
    '<div class="form-row"><label>Store name *</label><input id="lc-name" placeholder="Costco, CVS ExtraCare"></div>'+
    '<div class="form-row"><label>Card / member number *</label><input id="lc-number" placeholder="1234 5678 9012" inputmode="numeric"></div>'+
    '<div class="form-row"><label>Card color</label><div style="display:flex;gap:8px;flex-wrap:wrap" id="color-picker">'+
      ['#DC2626','#059669','#7C3AED','#2563EB','#D97706','#1F2937'].map((c,i)=>'<button data-color="'+c+'" style="width:40px;height:40px;border-radius:10px;background:'+c+';cursor:pointer;border:'+(i===0?'3px solid #1a1a1a':'3px solid transparent')+'"></button>').join('')+
    '</div></div>'+
    '<div class="form-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveLoyalty()">Save</button></div>';
  openModal(html);
  let color='#DC2626';
  document.querySelectorAll('#color-picker button').forEach(b=>{
    b.addEventListener('click',()=>{
      color=b.getAttribute('data-color');
      document.querySelectorAll('#color-picker button').forEach(x=>x.style.border='3px solid transparent');
      b.style.border='3px solid #1a1a1a';
    });
  });
  window._lcColor=()=>color;
};

window.saveLoyalty=function(){
  const name=document.getElementById('lc-name').value.trim();
  const num=document.getElementById('lc-number').value.trim();
  if(!name||!num){toast('Name and number required');return;}
  const c={
    id:uid(),
    name,
    number:num,
    color:window._lcColor?window._lcColor():'#DC2626',
    addedAt:Date.now()
  };
  state.loyalty.push(c);
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
  if(expiring.length===0){
    toast('No deals expiring soon — you\'re all set!');
  } else {
    toast(expiring.length+' deal'+(expiring.length===1?'':'s')+' expiring soon!');
  }
};

// -------- Render All --------
function renderAll(){
  renderHome();
  renderWallet();
  renderRewards();
  renderLoyalty();
  renderSettings();
}

// -------- Init --------
checkOnboarding();
renderAll();
})();

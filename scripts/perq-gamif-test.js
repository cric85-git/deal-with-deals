// Sanity test for new gamification logic
const TIERS = [
  { name: 'BRONZE', min: 0, next: 100 },
  { name: 'SILVER', min: 100, next: 300 },
  { name: 'GOLD', min: 300, next: 750 },
  { name: 'PLATINUM', min: 750, next: Infinity }
];
function getTierForPoints(p) { let cur = TIERS[0]; for (const t of TIERS) { if (p >= t.min) cur = t; } return cur; }

const STREAK_LEVELS = [
  {min:0, label:'Start your streak'},
  {min:1, label:'On fire'},
  {min:3, label:'3-day streak'},
  {min:7, label:'Week warrior'},
  {min:30, label:'Inferno'}
];
function getStreakLevel(s) { let lvl = STREAK_LEVELS[0]; for (const l of STREAK_LEVELS) { if (s >= l.min) lvl = l; } return lvl; }

const tierCases = [
  { p: 0, expected: 'BRONZE' },
  { p: 99, expected: 'BRONZE' },
  { p: 100, expected: 'SILVER' },
  { p: 299, expected: 'SILVER' },
  { p: 300, expected: 'GOLD' },
  { p: 749, expected: 'GOLD' },
  { p: 750, expected: 'PLATINUM' },
  { p: 9999, expected: 'PLATINUM' }
];
const streakCases = [
  { s: 0, expected: 'Start your streak' },
  { s: 1, expected: 'On fire' },
  { s: 2, expected: 'On fire' },
  { s: 3, expected: '3-day streak' },
  { s: 6, expected: '3-day streak' },
  { s: 7, expected: 'Week warrior' },
  { s: 29, expected: 'Week warrior' },
  { s: 30, expected: 'Inferno' },
  { s: 100, expected: 'Inferno' }
];

let pass = 0, fail = 0;
for (const c of tierCases) {
  const got = getTierForPoints(c.p).name;
  if (got === c.expected) pass++; else { fail++; console.error('FAIL tier', c.p, got, '!=', c.expected); }
}
for (const c of streakCases) {
  const got = getStreakLevel(c.s).label;
  if (got === c.expected) pass++; else { fail++; console.error('FAIL streak', c.s, got, '!=', c.expected); }
}

// Mission flow
function todayStr() { return new Date().toISOString().slice(0,10); }
let rewards = { points: 0, spins: 0, missions: { date: null, done: {} } };
function refreshDailyMissions(r) {
  const t = todayStr();
  if (!r.missions || r.missions.date !== t) r.missions = { date: t, done: {} };
}
const MISSIONS = [{id:'save', pts:10},{id:'share', pts:15},{id:'redeem', pts:25}];
function completeMission(r, id) {
  refreshDailyMissions(r);
  const m = MISSIONS.find(x => x.id === id);
  if (!m || r.missions.done[id]) return false;
  r.missions.done[id] = Date.now();
  r.points += m.pts;
  return true;
}
const a1 = completeMission(rewards, 'save');
const a2 = completeMission(rewards, 'save'); // duplicate
const a3 = completeMission(rewards, 'share');
const a4 = completeMission(rewards, 'redeem');
if (a1 && !a2 && a3 && a4 && rewards.points === 50) pass++;
else { fail++; console.error('FAIL mission flow', { a1, a2, a3, a4, points: rewards.points }); }

// Daily reset
rewards.missions.date = '2025-01-01';
refreshDailyMissions(rewards);
if (rewards.missions.date === todayStr() && Object.keys(rewards.missions.done).length === 0) pass++;
else { fail++; console.error('FAIL daily reset'); }

// Tier-up detection
let lastSeen = 'BRONZE';
function checkTier(pts) {
  const t = getTierForPoints(pts).name;
  const oldIdx = TIERS.findIndex(x => x.name === lastSeen);
  const newIdx = TIERS.findIndex(x => x.name === t);
  const celebrate = newIdx > oldIdx;
  lastSeen = t;
  return celebrate;
}
if (!checkTier(50) && checkTier(100) && !checkTier(150) && checkTier(300) && checkTier(750) && !checkTier(1000)) pass++;
else { fail++; console.error('FAIL tier-up detection'); }

console.log(`PASS ${pass}, FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);

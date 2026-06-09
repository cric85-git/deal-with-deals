/**
 * Perq native bridge — runs in both web preview and native (Capacitor) builds.
 *
 * In native: uses real Capacitor plugins for notifications, geolocation,
 * camera, share, and persistence.
 * In web: falls back to existing web behavior (in-app toasts, browser camera,
 * navigator.share, localStorage).
 *
 * Loaded BEFORE preview-app.js so window.PerqNative is available globally.
 */
(function(){
'use strict';

const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const platform = isNative ? window.Capacitor.getPlatform() : 'web';

// Lazy-load plugins so web preview never errors
let LocalNotifications, Geolocation, Camera, Share, Preferences, App, SplashScreen;
if (isNative) {
  try {
    ({ LocalNotifications } = window.Capacitor.Plugins);
    ({ Geolocation } = window.Capacitor.Plugins);
    ({ Camera } = window.Capacitor.Plugins);
    ({ Share } = window.Capacitor.Plugins);
    ({ Preferences } = window.Capacitor.Plugins);
    ({ App } = window.Capacitor.Plugins);
    ({ SplashScreen } = window.Capacitor.Plugins);
  } catch (e) {
    console.warn('[PerqNative] Plugin import failed:', e);
  }
}

// ============ Notification scheduling ============
// Builds a deterministic 32-bit integer ID from a deal id string for cancel/replace.
function notifIdFor(dealId, suffix) {
  const s = String(dealId) + ':' + suffix;
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h) % 2000000000; // stay within Java int range
}

function fmtShortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Schedule expiry reminders for ALL non-redeemed deals with an expiry.
 * Cancels any prior schedules first to keep things idempotent.
 *
 * Three reminder windows per deal:
 *   - 3 days before, 6 PM local
 *   - 1 day before, 6 PM local
 *   - day-of, 10 AM local (last chance)
 *
 * Plus one weekly digest if 3+ deals expire in the next 7 days.
 */
async function rescheduleExpiryReminders(deals, settings) {
  if (!isNative || !LocalNotifications) return { scheduled: 0, skipped: 'not-native' };
  if (settings && settings.reminders === false) {
    // User turned reminders off — clear pending and bail
    try { await LocalNotifications.cancel({ notifications: (await LocalNotifications.getPending()).notifications.map(n => ({ id: n.id })) }); } catch(e){}
    return { scheduled: 0, skipped: 'reminders-disabled' };
  }

  // Permission gate
  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') return { scheduled: 0, skipped: 'permission-denied' };

  // Cancel all pending Perq notifications first to avoid duplicates
  try {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications && pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    }
  } catch (e) { /* non-fatal */ }

  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  const toSchedule = [];

  const active = (deals || []).filter(d => !d.redeemed && d.expiry);
  // User-configurable lead time (1, 2, or 3 days). Default 2.
  const leadDays = (settings && settings.reminderDays) || 2;
  for (const d of active) {
    const expiryMs = new Date(d.expiry + 'T23:59:59').getTime();
    if (isNaN(expiryMs) || expiryMs <= now) continue;

    // Lead-time reminder at 6 PM local
    const tLead = atHour(expiryMs - leadDays*DAY, 18);
    if (tLead > now + 60_000) {
      toSchedule.push({
        id: notifIdFor(d.id, 'lead'),
        title: `⏰ Deal expires in ${leadDays} ${leadDays === 1 ? 'day' : 'days'}`,
        body: `${d.merchant} · ${d.discount} expires ${fmtShortDate(d.expiry)}. Don't forget to use it.`,
        schedule: { at: new Date(tLead) },
        extra: { dealId: d.id, kind: 'lead' },
        smallIcon: 'ic_stat_perq',
        iconColor: '#10B981'
      });
    }
    // Day-of at 10 AM local
    const t0 = atHour(expiryMs, 10);
    if (t0 > now + 60_000) {
      toSchedule.push({
        id: notifIdFor(d.id, '0d'),
        title: '🔥 Final day to use this deal',
        body: `${d.merchant} · ${d.discount} expires today. Open Perq.`,
        schedule: { at: new Date(t0) },
        extra: { dealId: d.id, kind: '0d' },
        smallIcon: 'ic_stat_perq',
        iconColor: '#DC2626'
      });
    }
  }

  // Weekly digest — fire Sunday at 9 AM if 3+ deals expire in the next 7 days
  const next7 = active.filter(d => {
    const m = new Date(d.expiry + 'T23:59:59').getTime();
    return m - now > 0 && m - now <= 7 * DAY;
  });
  if (next7.length >= 3) {
    const sunday9 = nextWeekday(0, 9); // 0 = Sunday
    if (sunday9 > now + 60_000) {
      toSchedule.push({
        id: notifIdFor('digest', String(sunday9)),
        title: `📋 ${next7.length} deals expiring this week`,
        body: 'Open Perq to review what to use before they\'re gone.',
        schedule: { at: new Date(sunday9) },
        extra: { kind: 'digest' },
        smallIcon: 'ic_stat_perq',
        iconColor: '#10B981'
      });
    }
  }

  if (toSchedule.length === 0) return { scheduled: 0 };

  await LocalNotifications.schedule({ notifications: toSchedule });
  return { scheduled: toSchedule.length };
}

function atHour(timestampMs, hour24) {
  const d = new Date(timestampMs);
  d.setHours(hour24, 0, 0, 0);
  return d.getTime();
}
function nextWeekday(targetDay, hour24) {
  const d = new Date();
  const diff = (targetDay - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff)); // always next, never today
  d.setHours(hour24, 0, 0, 0);
  return d.getTime();
}

// ============ Geolocation ============
async function getCurrentLocation() {
  if (!isNative || !Geolocation) {
    if (navigator.geolocation) {
      return new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(
          pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          () => resolve(null),
          { timeout: 10000, maximumAge: 60000 }
        );
      });
    }
    return null;
  }
  try {
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') return null;
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
  } catch (e) {
    return null;
  }
}

// ============ Camera ============
// Returns a data URL (consistent with current web flow) or null on cancel.
async function pickPhoto({ source = 'prompt' } = {}) {
  if (!isNative || !Camera) return null; // signal caller to fall back to web file input
  try {
    const sourceMap = { camera: 'CAMERA', library: 'PHOTOS', prompt: 'PROMPT' };
    const result = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: 'dataUrl',
      source: sourceMap[source] || 'PROMPT',
      saveToGallery: false,
      width: 1600
    });
    return result.dataUrl || null;
  } catch (e) {
    // user cancelled
    return null;
  }
}

// ============ Share ============
async function nativeShare({ title, text, url }) {
  if (isNative && Share) {
    try { await Share.share({ title, text, url, dialogTitle: 'Share deal' }); return true; }
    catch (e) { return false; }
  }
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return true; }
    catch (e) { return false; }
  }
  return false;
}

// ============ Splash hide on ready ============
async function hideSplash() {
  if (isNative && SplashScreen) {
    try { await SplashScreen.hide(); } catch (e) {}
  }
}

// ============ Public API ============
window.PerqNative = {
  isNative,
  platform,
  rescheduleExpiryReminders,
  getCurrentLocation,
  pickPhoto,
  nativeShare,
  hideSplash
};

// Auto-hide splash once DOM is ready
if (isNative) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(hideSplash, 100);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(hideSplash, 100));
  }
}

console.log('[PerqNative] Initialized · platform=' + platform);

})();

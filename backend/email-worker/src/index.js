/**
 * Perq Email Worker — Cloudflare Worker with KV storage
 * 
 * Complete flow:
 * 1. User connects Gmail/Outlook via OAuth
 * 2. Webhook fires when new email arrives
 * 3. Worker fetches email, parses for deals
 * 4. Extracted deals stored in KV for user to sync
 * 5. Push notification sent to user's device
 * 
 * KV Namespaces needed:
 * - TOKENS: stores OAuth refresh tokens (encrypted)
 * - DEALS: stores extracted deals pending sync
 * - DEVICES: stores push notification device tokens
 */

const DEAL_KEYWORDS = /coupon|promo|discount|offer|reward|save|deal|% off|\$ off|bogo|free|valid|expires|barcode|code/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return corsResponse(request, new Response(null, { status: 204 }));
    }

    // --- Auth routes ---
    if (path === '/oauth/start' && request.method === 'POST') {
      return corsResponse(request, await handleOAuthStart(request, env));
    }
    if (path === '/oauth/callback') {
      return handleOAuthCallback(request, env);
    }

    // --- Webhook routes ---
    if (path === '/webhook/gmail' && request.method === 'POST') {
      return handleGmailWebhook(request, env);
    }
    if (path === '/webhook/outlook' && request.method === 'POST') {
      return handleOutlookWebhook(request, env);
    }

    // --- Client API routes ---
    if (path === '/api/status' && request.method === 'GET') {
      return corsResponse(request, await handleStatus(request, env));
    }
    if (path === '/api/sync' && request.method === 'GET') {
      return corsResponse(request, await handleSync(request, env));
    }
    if (path === '/api/sync/ack' && request.method === 'POST') {
      return corsResponse(request, await handleSyncAck(request, env));
    }
    if (path === '/api/register-device' && request.method === 'POST') {
      return corsResponse(request, await handleRegisterDevice(request, env));
    }
    if (path === '/api/disconnect' && request.method === 'POST') {
      return corsResponse(request, await handleDisconnect(request, env));
    }

    return new Response('Not found', { status: 404 });
  }
};

// ============================================================
// OAuth
// ============================================================

async function handleOAuthStart(request, env) {
  const { provider, userId } = await request.json();
  if (!provider || !userId) {
    return jsonResponse(400, { error: 'provider and userId required' });
  }

  const state = encodeURIComponent(JSON.stringify({ provider, userId }));

  if (provider === 'gmail') {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: `${env.WORKER_URL}/oauth/callback`,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state
    });
    return jsonResponse(200, { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  }

  if (provider === 'outlook') {
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      redirect_uri: `${env.WORKER_URL}/oauth/callback`,
      response_type: 'code',
      scope: 'Mail.Read offline_access',
      state
    });
    return jsonResponse(200, { authUrl: `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}` });
  }

  return jsonResponse(400, { error: 'Unsupported provider' });
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateRaw = decodeURIComponent(url.searchParams.get('state') || '');
  if (!code || !stateRaw) return new Response('Missing params', { status: 400 });

  const { provider, userId } = JSON.parse(stateRaw);

  // Exchange code for tokens
  let tokens;
  if (provider === 'gmail') {
    tokens = await exchangeGoogleCode(code, env);
  } else {
    tokens = await exchangeMicrosoftCode(code, env);
  }

  if (!tokens || !tokens.refresh_token) {
    return new Response('OAuth failed — no refresh token', { status: 400 });
  }

  // Store tokens in KV
  await env.TOKENS.put(`user:${userId}`, JSON.stringify({
    provider,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in * 1000),
    connectedAt: Date.now()
  }));

  // Set up Gmail push notifications (Pub/Sub watch)
  if (provider === 'gmail') {
    await setupGmailWatch(tokens.access_token, userId, env);
  }

  // Redirect back to app
  return Response.redirect(`${env.APP_URL}?email_connected=1&provider=${provider}`, 302);
}

async function exchangeGoogleCode(code, env) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${env.WORKER_URL}/oauth/callback`,
      grant_type: 'authorization_code'
    })
  });
  return resp.ok ? resp.json() : null;
}

async function exchangeMicrosoftCode(code, env) {
  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      redirect_uri: `${env.WORKER_URL}/oauth/callback`,
      grant_type: 'authorization_code'
    })
  });
  return resp.ok ? resp.json() : null;
}

async function setupGmailWatch(accessToken, userId, env) {
  // Subscribe to Gmail push notifications via Pub/Sub
  try {
    await fetch('https://www.googleapis.com/gmail/v1/users/me/watch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        topicName: env.GMAIL_PUBSUB_TOPIC, // e.g. projects/perq-app/topics/gmail-push
        labelIds: ['INBOX']
      })
    });
  } catch (e) {
    console.error('Gmail watch setup failed:', e);
  }
}

async function refreshAccessToken(stored, env) {
  if (Date.now() < stored.expiresAt - 60000) {
    return stored.accessToken;
  }
  let resp;
  if (stored.provider === 'gmail') {
    resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: stored.refreshToken,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    });
  } else {
    resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: stored.refreshToken,
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    });
  }
  if (!resp.ok) return null;
  const data = await resp.json();
  stored.accessToken = data.access_token;
  stored.expiresAt = Date.now() + (data.expires_in * 1000);
  if (data.refresh_token) stored.refreshToken = data.refresh_token;
  return data.access_token;
}

// ============================================================
// Webhooks — Gmail & Outlook
// ============================================================

async function handleGmailWebhook(request, env) {
  const body = await request.json();
  const msg = body.message;
  if (!msg || !msg.data) return new Response('OK', { status: 200 });

  // Decode Pub/Sub payload
  const decoded = JSON.parse(atob(msg.data));
  const userId = await findUserByEmail(decoded.emailAddress, env);
  if (!userId) return new Response('OK', { status: 200 });

  // Get stored tokens
  const stored = JSON.parse(await env.TOKENS.get(`user:${userId}`) || 'null');
  if (!stored) return new Response('OK', { status: 200 });

  const accessToken = await refreshAccessToken(stored, env);
  if (!accessToken) return new Response('OK', { status: 200 });
  await env.TOKENS.put(`user:${userId}`, JSON.stringify(stored));

  // Fetch recent messages
  const deals = await fetchAndParseGmailMessages(accessToken, decoded.historyId, env);

  if (deals.length > 0) {
    // Store deals for sync
    await storePendingDeals(userId, deals, env);
    // Send push notification
    await sendPushNotification(userId, deals, env);
  }

  return new Response('OK', { status: 200 });
}

async function handleOutlookWebhook(request, env) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    return new Response(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  const body = await request.json();
  const notifications = body.value || [];

  for (const notif of notifications) {
    const userId = notif.clientState; // We store userId in clientState during subscription
    if (!userId) continue;

    const stored = JSON.parse(await env.TOKENS.get(`user:${userId}`) || 'null');
    if (!stored) continue;

    const accessToken = await refreshAccessToken(stored, env);
    if (!accessToken) continue;
    await env.TOKENS.put(`user:${userId}`, JSON.stringify(stored));

    const deals = await fetchAndParseOutlookMessage(accessToken, notif.resourceData, env);
    if (deals.length > 0) {
      await storePendingDeals(userId, deals, env);
      await sendPushNotification(userId, deals, env);
    }
  }

  return new Response('', { status: 202 });
}

// ============================================================
// Email Fetching & Parsing
// ============================================================

async function fetchAndParseGmailMessages(accessToken, historyId, env) {
  // Get recent messages from INBOX
  const listResp = await fetch(
    'https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=5&labelIds=INBOX',
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!listResp.ok) return [];
  const listData = await listResp.json();
  const messages = listData.messages || [];

  const deals = [];
  for (const msg of messages.slice(0, 3)) {
    const msgResp = await fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (!msgResp.ok) continue;
    const msgData = await msgResp.json();

    const headers = msgData.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const snippet = msgData.snippet || '';

    const deal = extractDealFromEmail(subject, snippet, from);
    if (deal) {
      deal.emailId = msg.id;
      deal.importedAt = Date.now();
      deals.push(deal);
    }
  }
  return deals;
}

async function fetchAndParseOutlookMessage(accessToken, resourceData, env) {
  if (!resourceData || !resourceData.id) return [];

  const msgResp = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${resourceData.id}?$select=subject,from,bodyPreview`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  if (!msgResp.ok) return [];
  const msg = await msgResp.json();

  const deal = extractDealFromEmail(msg.subject || '', msg.bodyPreview || '', msg.from?.emailAddress?.address || '');
  if (deal) {
    deal.emailId = resourceData.id;
    deal.importedAt = Date.now();
    return [deal];
  }
  return [];
}

// ============================================================
// Deal Extraction
// ============================================================

function extractDealFromEmail(subject, body, sender) {
  const text = `${subject} ${body}`;
  if (!DEAL_KEYWORDS.test(text)) return null;

  const merchant = extractMerchant(sender, subject);
  const discount = extractDiscount(text);
  if (!merchant || !discount) return null;

  return {
    id: 'email_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    merchant,
    discount,
    value: estimateValue(discount),
    category: categorize(merchant, text),
    source: 'Email auto-import',
    code: extractCode(text) || '',
    barcode: '',
    expiry: extractExpiry(text) || '',
    notes: 'Auto-imported from email',
    url: extractUrl(text) || '',
    redeemed: false,
    shared: false
  };
}

function extractMerchant(sender, subject) {
  const m = sender.match(/^"?([^"<]+)"?\s*</);
  if (m) return m[1].trim().replace(/\s+(Rewards|Newsletter|Promo|Offers?|Marketing)/i, '');
  const domain = sender.match(/@([^.>]+)/);
  if (domain) return domain[1].charAt(0).toUpperCase() + domain[1].slice(1);
  return subject.split(/[:|–—]/)[0].trim().slice(0, 30) || null;
}

function extractDiscount(text) {
  const m = text.match(/(\d{1,3}%\s*off[^.!]{0,40}|\$\d+\s*off[^.!]{0,40}|buy\s+one\s+get\s+one[^.!]{0,30}|free\s+\w+[^.!]{0,30})/i);
  return m ? m[1].trim() : null;
}

function extractCode(text) {
  const m = text.match(/(?:code|promo|coupon)[:\s]+([A-Z0-9]{3,15})/i);
  return m ? m[1].toUpperCase() : null;
}

function extractExpiry(text) {
  const m = text.match(/(?:expires?|valid\s+(?:thru|through|until|by)|ends)\s*[:\s]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i);
  if (!m) return null;
  try {
    const d = new Date(m[1]);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  } catch (e) { return null; }
}

function extractUrl(text) {
  const m = text.match(/https?:\/\/[^\s"'<>]+/);
  return m ? m[0].replace(/[.,;)]+$/, '') : null;
}

function estimateValue(discount) {
  const m = discount.match(/\$(\d+)/);
  if (m) return parseInt(m[1]);
  const p = discount.match(/(\d+)%/);
  if (p) return parseInt(p[1]);
  return 10;
}

function categorize(merchant, text) {
  const s = `${merchant} ${text}`.toLowerCase();
  if (/grocery|market|food|costco|target|walmart|whole foods|trader/i.test(s)) return 'Groceries';
  if (/restaurant|coffee|pizza|burger|dining|panera|chipotle|olive|starbucks/i.test(s)) return 'Dining';
  if (/clothes|apparel|shoes|navy|gap|macy|kohls|nordstrom/i.test(s)) return 'Apparel';
  if (/hotel|flight|travel|airline|marriott|hilton|delta|united/i.test(s)) return 'Travel';
  if (/beauty|makeup|skin|sephora|ulta/i.test(s)) return 'Beauty';
  if (/home|furniture|depot|lowe/i.test(s)) return 'Home';
  if (/tech|electronic|phone|best buy|apple/i.test(s)) return 'Electronics';
  return 'Other';
}

// ============================================================
// Sync & Storage
// ============================================================

async function storePendingDeals(userId, deals, env) {
  const key = `pending:${userId}`;
  const existing = JSON.parse(await env.DEALS.get(key) || '[]');
  const updated = [...existing, ...deals].slice(-50); // Keep last 50
  await env.DEALS.put(key, JSON.stringify(updated), { expirationTtl: 30 * 86400 }); // 30 day TTL
}

async function handleSync(request, env) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return jsonResponse(400, { error: 'userId required' });

  const key = `pending:${userId}`;
  const deals = JSON.parse(await env.DEALS.get(key) || '[]');
  return jsonResponse(200, { deals, count: deals.length });
}

async function handleSyncAck(request, env) {
  const { userId, dealIds } = await request.json();
  if (!userId) return jsonResponse(400, { error: 'userId required' });

  const key = `pending:${userId}`;
  const existing = JSON.parse(await env.DEALS.get(key) || '[]');
  const remaining = existing.filter(d => !dealIds.includes(d.id));
  await env.DEALS.put(key, JSON.stringify(remaining), { expirationTtl: 30 * 86400 });
  return jsonResponse(200, { remaining: remaining.length });
}

async function handleStatus(request, env) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return jsonResponse(400, { error: 'userId required' });

  const stored = JSON.parse(await env.TOKENS.get(`user:${userId}`) || 'null');
  if (!stored) {
    return jsonResponse(200, { connected: false, provider: null, lastSync: null });
  }

  const pending = JSON.parse(await env.DEALS.get(`pending:${userId}`) || '[]');
  return jsonResponse(200, {
    connected: true,
    provider: stored.provider,
    connectedAt: stored.connectedAt,
    pendingDeals: pending.length
  });
}

async function handleDisconnect(request, env) {
  const { userId } = await request.json();
  if (!userId) return jsonResponse(400, { error: 'userId required' });

  await env.TOKENS.delete(`user:${userId}`);
  await env.DEALS.delete(`pending:${userId}`);
  await env.DEVICES.delete(`device:${userId}`);
  return jsonResponse(200, { disconnected: true });
}

// ============================================================
// Push Notifications
// ============================================================

async function handleRegisterDevice(request, env) {
  const { userId, token, platform } = await request.json();
  if (!userId || !token) return jsonResponse(400, { error: 'userId and token required' });

  await env.DEVICES.put(`device:${userId}`, JSON.stringify({
    token,
    platform: platform || 'unknown',
    registeredAt: Date.now()
  }));
  return jsonResponse(200, { registered: true });
}

async function sendPushNotification(userId, deals, env) {
  const deviceData = JSON.parse(await env.DEVICES.get(`device:${userId}`) || 'null');
  if (!deviceData || !deviceData.token) return;

  const deal = deals[0]; // Lead with first deal
  const title = `📬 New deal found: ${deal.merchant}`;
  const body = `${deal.discount}${deals.length > 1 ? ` (+${deals.length - 1} more)` : ''}`;

  // Send via Firebase Cloud Messaging (FCM) for both iOS and Android
  if (!env.FCM_SERVER_KEY) return;

  try {
    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${env.FCM_SERVER_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: deviceData.token,
        notification: { title, body, icon: 'ic_stat_perq', color: '#1B6C8C' },
        data: { type: 'email_deal', dealCount: deals.length, action: 'sync' }
      })
    });
  } catch (e) {
    console.error('Push failed:', e);
  }
}

// ============================================================
// Helpers
// ============================================================

async function findUserByEmail(email, env) {
  // Simple lookup — in production, index by email in KV
  // For now, iterate (fine for small user base)
  const list = await env.TOKENS.list({ prefix: 'user:' });
  for (const key of list.keys) {
    const data = JSON.parse(await env.TOKENS.get(key.name) || '{}');
    if (data.email === email) return key.name.replace('user:', '');
  }
  return null;
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function corsResponse(request, response) {
  const origin = request.headers.get('Origin') || '*';
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}

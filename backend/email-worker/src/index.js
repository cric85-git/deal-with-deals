/**
 * Perq Email Worker — Cloudflare Worker
 * 
 * Handles:
 * 1. OAuth initiation for Gmail/Outlook
 * 2. Webhook receiver for new email notifications
 * 3. Email parsing → deal extraction
 * 4. Push extracted deals to user's Perq account
 */

const DEAL_KEYWORDS = /coupon|promo|discount|offer|reward|save|deal|% off|\$ off|bogo|free|valid|expires|barcode|code/i;
const MERCHANT_SENDERS = /target|walmart|costco|walgreens|cvs|kohls|macys|nordstrom|sephora|ulta|bestbuy|homedepot|lowes|starbucks|chipotle|panera|dominos|subway|marriott|hilton|hyatt|delta|united|southwest|amex|chase|capital.?one/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS
    if (request.method === 'OPTIONS') {
      return corsResponse(request, new Response(null, { status: 204 }));
    }

    if (path === '/oauth/start' && request.method === 'POST') {
      return corsResponse(request, await handleOAuthStart(request, env));
    }

    if (path === '/oauth/callback') {
      return handleOAuthCallback(request, env);
    }

    if (path === '/webhook/gmail' && request.method === 'POST') {
      return handleGmailWebhook(request, env);
    }

    if (path === '/webhook/outlook' && request.method === 'POST') {
      return handleOutlookWebhook(request, env);
    }

    if (path === '/status' && request.method === 'GET') {
      return corsResponse(request, await handleStatus(request, env));
    }

    if (path === '/disconnect' && request.method === 'POST') {
      return corsResponse(request, await handleDisconnect(request, env));
    }

    if (path === '/deals' && request.method === 'GET') {
      return corsResponse(request, await handleGetDeals(request, env));
    }

    return new Response('Not found', { status: 404 });
  }
};

async function handleOAuthStart(request, env) {
  const { provider, userId } = await request.json();
  if (!provider || !userId) {
    return jsonResponse(400, { error: 'provider and userId required' });
  }

  let authUrl;
  if (provider === 'gmail') {
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: `${env.WORKER_URL}/oauth/callback`,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state: JSON.stringify({ provider: 'gmail', userId })
    });
    authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  } else if (provider === 'outlook') {
    const params = new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      redirect_uri: `${env.WORKER_URL}/oauth/callback`,
      response_type: 'code',
      scope: 'Mail.Read offline_access',
      state: JSON.stringify({ provider: 'outlook', userId })
    });
    authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  } else {
    return jsonResponse(400, { error: 'Unsupported provider. Use gmail or outlook.' });
  }

  return jsonResponse(200, { authUrl });
}

async function handleOAuthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state');

  if (!code || !stateRaw) {
    return new Response('Missing code or state', { status: 400 });
  }

  const state = JSON.parse(stateRaw);
  // Exchange code for tokens (implementation depends on KV/D1 storage)
  // Store refresh token encrypted, set up webhook subscription
  // For now, redirect back to app with success status

  const appUrl = `${env.APP_URL}?email_connected=1&provider=${state.provider}`;
  return Response.redirect(appUrl, 302);
}

async function handleGmailWebhook(request, env) {
  // Gmail Pub/Sub push notification
  const body = await request.json();
  const message = body.message;
  if (!message || !message.data) {
    return new Response('OK', { status: 200 });
  }

  // Decode Pub/Sub message → contains historyId
  // Fetch new messages since last historyId
  // Parse and extract deals
  // Store in KV for user to fetch

  return new Response('OK', { status: 200 });
}

async function handleOutlookWebhook(request, env) {
  // Microsoft Graph subscription notification
  const url = new URL(request.url);
  // Validation token for subscription creation
  const validationToken = url.searchParams.get('validationToken');
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // Process notification
  return new Response('', { status: 202 });
}

async function handleStatus(request, env) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return jsonResponse(400, { error: 'userId required' });

  // Check if user has active connection in KV
  // Return status and last sync time
  return jsonResponse(200, {
    connected: false,
    provider: null,
    lastSync: null,
    dealsFound: 0
  });
}

async function handleDisconnect(request, env) {
  const { userId } = await request.json();
  if (!userId) return jsonResponse(400, { error: 'userId required' });

  // Delete stored tokens from KV
  // Remove webhook subscriptions
  return jsonResponse(200, { disconnected: true });
}

async function handleGetDeals(request, env) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return jsonResponse(400, { error: 'userId required' });

  // Return deals extracted from emails since last fetch
  return jsonResponse(200, { deals: [] });
}

// --- Utility: Parse email body into deal ---
function extractDealFromEmail(subject, body, sender) {
  const text = `${subject} ${body}`;
  if (!DEAL_KEYWORDS.test(text)) return null;

  const merchant = extractMerchant(sender, subject);
  const discount = extractDiscount(text);
  const code = extractCode(text);
  const expiry = extractExpiry(text);

  if (!merchant || !discount) return null;

  return {
    merchant,
    discount,
    value: estimateValue(discount),
    category: categorize(merchant, text),
    source: 'Email',
    code: code || '',
    barcode: '',
    expiry: expiry || '',
    notes: 'Auto-imported from email',
    url: extractUrl(text) || ''
  };
}

function extractMerchant(sender, subject) {
  // Try sender display name
  const match = sender.match(/^"?([^"<]+)"?\s*</);
  if (match) return match[1].trim();
  // Try domain
  const domain = sender.match(/@([^>]+)/);
  if (domain) {
    const name = domain[1].split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return subject.split(/[:|–—]/)[0].trim().slice(0, 30);
}

function extractDiscount(text) {
  const m = text.match(/(\d{1,2}%\s*off[^.]{0,40}|\$\d+\s*off[^.]{0,40}|buy\s+one\s+get\s+one[^.]{0,30}|free\s+\w+[^.]{0,30})/i);
  return m ? m[1].trim() : null;
}

function extractCode(text) {
  const m = text.match(/(?:code|promo|coupon)[:\s]+([A-Z0-9]{3,15})/i);
  return m ? m[1].toUpperCase() : null;
}

function extractExpiry(text) {
  const m = text.match(/(?:expires?|valid\s+(?:thru|through|until|by)|ends)[:\s]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i);
  if (!m) return null;
  const d = new Date(m[1]);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
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
  if (/grocery|market|food|costco|target|walmart/i.test(text)) return 'Groceries';
  if (/restaurant|coffee|pizza|dining/i.test(text)) return 'Dining';
  if (/clothes|apparel|shoes/i.test(text)) return 'Apparel';
  if (/hotel|flight|travel|airline/i.test(text)) return 'Travel';
  if (/beauty|makeup|skin/i.test(text)) return 'Beauty';
  if (/home|furniture|depot/i.test(text)) return 'Home';
  if (/tech|electronic|phone/i.test(text)) return 'Electronics';
  return 'Other';
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
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(response.body, { status: response.status, headers });
}

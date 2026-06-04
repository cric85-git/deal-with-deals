/**
 * Perq Deal Crawler — Cloudflare Worker (Cron Triggered)
 * 
 * Crawls public, non-copyrighted deal sources and stores results
 * in KV for the client to fetch as "Discovered Deals."
 * 
 * Sources:
 * - RSS feeds from coupon aggregators
 * - Public retailer deal pages (structured data / JSON-LD)
 * - Clearance/sale endpoints
 * 
 * Runs on a cron schedule (every 6 hours).
 * Deals are personalized on the client based on user preferences.
 */

const DEAL_SOURCES = [
  {
    id: 'slickdeals_rss',
    name: 'Slickdeals Popular',
    url: 'https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1',
    type: 'rss'
  },
  {
    id: 'dealnews_rss',
    name: 'DealNews Top',
    url: 'https://www.dealnews.com/c702/rss/',
    type: 'rss'
  },
  {
    id: 'retailmenot_trending',
    name: 'RetailMeNot Trending',
    url: 'https://www.retailmenot.com/feed',
    type: 'rss'
  }
];

export default {
  // HTTP handler for manual trigger / health check
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return corsResponse(request, new Response(null, { status: 204 }));
    }

    if (url.pathname === '/api/discover' && request.method === 'GET') {
      return corsResponse(request, await handleDiscover(request, env));
    }

    if (url.pathname === '/api/crawl' && request.method === 'POST') {
      await crawlAllSources(env);
      return corsResponse(request, jsonResponse(200, { ok: true, message: 'Crawl complete' }));
    }

    if (url.pathname === '/health') {
      return jsonResponse(200, { status: 'ok', sources: DEAL_SOURCES.length });
    }

    return new Response('Not found', { status: 404 });
  },

  // Cron trigger — runs every 6 hours
  async scheduled(event, env) {
    await crawlAllSources(env);
  }
};

// ============================================================
// Crawl Logic
// ============================================================

async function crawlAllSources(env) {
  const allDeals = [];

  for (const source of DEAL_SOURCES) {
    try {
      const deals = await crawlSource(source);
      allDeals.push(...deals);
    } catch (e) {
      console.error(`Crawl failed for ${source.id}:`, e.message);
    }
  }

  // Dedupe by merchant + discount
  const seen = new Set();
  const unique = allDeals.filter(d => {
    const key = `${d.merchant}|${d.discount}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Store top 100 deals, grouped by category
  const stored = unique.slice(0, 100).map(d => ({
    ...d,
    id: 'crawl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    crawledAt: Date.now()
  }));

  await env.CRAWLED_DEALS.put('latest', JSON.stringify(stored), {
    expirationTtl: 24 * 3600 // 24h TTL
  });

  // Store per-category for faster personalized lookup
  const byCategory = {};
  for (const deal of stored) {
    if (!byCategory[deal.category]) byCategory[deal.category] = [];
    byCategory[deal.category].push(deal);
  }
  for (const [cat, deals] of Object.entries(byCategory)) {
    await env.CRAWLED_DEALS.put(`cat:${cat}`, JSON.stringify(deals), {
      expirationTtl: 24 * 3600
    });
  }
}

async function crawlSource(source) {
  if (source.type === 'rss') return crawlRSS(source);
  return [];
}

async function crawlRSS(source) {
  const resp = await fetch(source.url, {
    headers: { 'User-Agent': 'Perq Deal Crawler/1.0 (+https://perq.app)' }
  });
  if (!resp.ok) return [];

  const xml = await resp.text();
  const deals = [];

  // Simple XML parser for RSS <item> elements
  const items = xml.split('<item>').slice(1);
  for (const item of items.slice(0, 25)) {
    const title = extractTag(item, 'title');
    const link = extractTag(item, 'link');
    const desc = extractTag(item, 'description');
    const pubDate = extractTag(item, 'pubDate');

    if (!title) continue;

    const deal = parseDealFromRSS(title, desc, link, pubDate, source.name);
    if (deal) deals.push(deal);
  }

  return deals;
}

function extractTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>(!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
  if (!m) return '';
  let content = m[2] || m[0];
  // Strip CDATA
  content = content.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
  // Strip HTML tags
  content = content.replace(/<[^>]+>/g, '').trim();
  // Decode entities
  content = content.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return content;
}

function parseDealFromRSS(title, desc, link, pubDate, sourceName) {
  const text = `${title} ${desc}`;

  // Extract discount
  const discountMatch = text.match(/(\d{1,3}%\s*off[^.]{0,30}|\$\d+\s*off[^.]{0,30}|free\s+\w+[^.]{0,20}|buy\s+one\s+get\s+one)/i);
  if (!discountMatch && !/deal|sale|save|coupon/i.test(text)) return null;

  const discount = discountMatch ? discountMatch[1].trim() : title.slice(0, 50);

  // Extract merchant from title (usually "Merchant: deal" or "deal at Merchant")
  let merchant = '';
  const atMatch = title.match(/at\s+([A-Z][A-Za-z\s&'.]+?)(?:\s*[-–:]|\s*$)/);
  const colonMatch = title.match(/^([A-Z][A-Za-z\s&'.]+?)[:–-]\s/);
  if (colonMatch) merchant = colonMatch[1].trim();
  else if (atMatch) merchant = atMatch[1].trim();
  else merchant = title.split(/[-–:|]/)[0].trim().slice(0, 25);

  // Expiry from description
  const expiryMatch = text.match(/(?:expires?|ends|valid\s+(?:thru|until))\s*[:\s]*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i);
  let expiry = '';
  if (expiryMatch) {
    try {
      const d = new Date(expiryMatch[1]);
      if (!isNaN(d.getTime())) expiry = d.toISOString().slice(0, 10);
    } catch (e) {}
  }
  // Default expiry: 14 days from now
  if (!expiry) {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    expiry = d.toISOString().slice(0, 10);
  }

  // Promo code
  const codeMatch = text.match(/(?:code|promo|coupon)[:\s]+([A-Z0-9]{3,15})/i);

  // Category
  const category = categorize(merchant, text);

  // Value estimate
  const value = estimateValue(discount);

  return {
    merchant: merchant || 'Online Deal',
    discount,
    value,
    category,
    source: `Discovered · ${sourceName}`,
    code: codeMatch ? codeMatch[1].toUpperCase() : '',
    expiry,
    url: link || '',
    notes: desc ? desc.slice(0, 100) : ''
  };
}

function estimateValue(discount) {
  const m = String(discount).match(/\$(\d+)/);
  if (m) return parseInt(m[1]);
  const p = String(discount).match(/(\d+)%/);
  if (p) return Math.min(parseInt(p[1]), 50);
  return 10;
}

function categorize(merchant, text) {
  const s = `${merchant} ${text}`.toLowerCase();
  if (/grocery|market|food|costco|target|walmart|whole foods/i.test(s)) return 'Groceries';
  if (/restaurant|coffee|pizza|dining|panera|chipotle|starbucks/i.test(s)) return 'Dining';
  if (/clothes|apparel|shoes|navy|gap|macy|kohls|nordstrom|nike|adidas/i.test(s)) return 'Apparel';
  if (/hotel|flight|travel|airline|marriott|hilton|delta/i.test(s)) return 'Travel';
  if (/beauty|makeup|skin|sephora|ulta/i.test(s)) return 'Beauty';
  if (/home|furniture|depot|lowe|bed bath|wayfair/i.test(s)) return 'Home';
  if (/tech|electronic|phone|best buy|apple|samsung|laptop|gaming/i.test(s)) return 'Electronics';
  return 'Other';
}

// ============================================================
// Client API — Discover deals
// ============================================================

async function handleDiscover(request, env) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

  let deals;
  if (category && category !== 'all') {
    const catData = await env.CRAWLED_DEALS.get(`cat:${category}`);
    deals = catData ? JSON.parse(catData) : [];
  } else {
    const allData = await env.CRAWLED_DEALS.get('latest');
    deals = allData ? JSON.parse(allData) : [];
  }

  return jsonResponse(200, {
    deals: deals.slice(0, limit),
    total: deals.length,
    lastCrawl: deals[0]?.crawledAt || null
  });
}

// ============================================================
// Helpers
// ============================================================

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
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, headers });
}

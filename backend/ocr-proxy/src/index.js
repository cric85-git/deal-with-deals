/**
 * Perq OCR Proxy — Cloudflare Worker
 * 
 * Proxies image → Claude Vision API calls so the mobile app
 * doesn't need to embed or expose the Anthropic API key.
 * 
 * Features:
 * - CORS handling for the PWA and native app origins
 * - Rate limiting (per-IP, configurable)
 * - Image size validation (max 4MB base64)
 * - Structured JSON response with error handling
 */

const OCR_PROMPT = `Extract coupon/deal details from this image. Return ONLY a JSON object:
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

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors(request, env, new Response(null, { status: 204 }));
    }

    if (request.method !== 'POST') {
      return jsonError(405, 'POST required');
    }

    // Origin check
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
    if (allowed.length && !allowed.includes(origin) && origin !== '') {
      return jsonError(403, 'Origin not allowed');
    }

    // Rate limiting (simple per-IP using Cloudflare's cf object)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateOk = await checkRateLimit(ip, env);
    if (!rateOk) {
      return handleCors(request, env, jsonError(429, 'Too many requests. Try again in a minute.'));
    }

    // Parse body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return handleCors(request, env, jsonError(400, 'Invalid JSON body'));
    }

    const { image, mediaType } = body;
    if (!image || !mediaType) {
      return handleCors(request, env, jsonError(400, 'Missing image or mediaType'));
    }

    // Validate image size (base64 ~4MB → ~3MB actual)
    if (image.length > 5_500_000) {
      return handleCors(request, env, jsonError(413, 'Image too large (max ~4MB)'));
    }

    // Call Anthropic
    const apiKey = env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return handleCors(request, env, jsonError(500, 'OCR service not configured'));
    }

    try {
      const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 500,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: OCR_PROMPT }
            ]
          }]
        })
      });

      if (!anthropicResponse.ok) {
        const errText = await anthropicResponse.text();
        let errMsg = `Upstream error ${anthropicResponse.status}`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error && errJson.error.message) errMsg = errJson.error.message;
        } catch (e) {}
        return handleCors(request, env, jsonError(502, errMsg));
      }

      const data = await anthropicResponse.json();
      const text = (data.content || []).map(b => b.text || '').join('').trim();
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

      let result;
      try {
        result = JSON.parse(cleaned);
      } catch (e) {
        return handleCors(request, env, jsonError(502, 'AI returned non-JSON response'));
      }

      return handleCors(request, env, new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

    } catch (e) {
      return handleCors(request, env, jsonError(500, `OCR processing failed: ${e.message}`));
    }
  }
};

function jsonError(status, message) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function handleCors(request, env, response) {
  const origin = request.headers.get('Origin') || '*';
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, {
    status: response.status,
    headers
  });
}

// Simple in-memory rate limiter (resets when worker cold-starts)
// For production, use Cloudflare's Rate Limiting or Durable Objects
const rateLimitMap = new Map();

async function checkRateLimit(ip, env) {
  const limit = parseInt(env.RATE_LIMIT_PER_MIN) || 10;
  const now = Date.now();
  const windowMs = 60_000;

  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, count: 0 };
    rateLimitMap.set(ip, entry);
  }

  entry.count++;
  if (entry.count > limit) return false;

  // Cleanup old entries periodically
  if (rateLimitMap.size > 10000) {
    for (const [key, val] of rateLimitMap) {
      if (now - val.windowStart > windowMs) rateLimitMap.delete(key);
    }
  }

  return true;
}

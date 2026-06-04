# Perq OCR Proxy

Cloudflare Worker that proxies coupon image → Claude Vision API calls so the mobile app doesn't need to store or expose the Anthropic API key.

## Setup

```bash
cd backend/ocr-proxy
npm install
wrangler login
wrangler secret put ANTHROPIC_API_KEY   # paste your key when prompted
```

## Deploy

```bash
npm run deploy
```

Your proxy will be live at `https://perq-ocr-proxy.<your-account>.workers.dev`

## Local development

```bash
npm run dev
```

Runs at `http://localhost:8787`

## API

### POST /

**Request body:**
```json
{
  "image": "<base64-encoded image data>",
  "mediaType": "image/jpeg"
}
```

**Success response:**
```json
{
  "ok": true,
  "result": {
    "merchant": "Target",
    "discount": "20% off",
    "code": "SAVE20",
    "expiry": "2026-06-20",
    "category": "Groceries",
    "value": 15,
    ...
  }
}
```

**Error response:**
```json
{
  "ok": false,
  "error": "Too many requests. Try again in a minute."
}
```

## Security

- CORS restricted to allowed origins (GitHub Pages + localhost + Capacitor)
- Rate limited: 10 requests/min per IP
- Image size capped at ~4MB
- API key stored as Cloudflare secret (never in code)

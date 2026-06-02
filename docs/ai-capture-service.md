# Perq AI Capture Service

Perq should not ask customers for an AI provider token in the browser. The app captures the image, compresses it, and sends it to a Perq-owned backend endpoint. That backend holds the provider credentials, calls the selected vision model, normalizes the result, and returns deal fields to the static PWA.

## Client Configuration

The static app reads the endpoint from one of these places:

- `window.PERQ_AI_ENDPOINT`
- `<meta name="perq-ai-endpoint" content="...">`

Leave the value empty until a backend is deployed. The camera flow still opens the review form and lets users save manually.

## Request

`POST /api/deals/extract`

```json
{
  "image": {
    "mimeType": "image/jpeg",
    "data": "base64-image-bytes"
  },
  "requestedFields": [
    "merchant",
    "discount",
    "code",
    "barcode",
    "expiry",
    "validBy",
    "category",
    "value",
    "url",
    "address",
    "notes"
  ],
  "source": "perq-camera-capture"
}
```

## Response

Return either the deal object directly or wrap it in `deal` or `result`.

```json
{
  "deal": {
    "merchant": "Example Market",
    "discount": "$10 off $50",
    "code": "SAVE10",
    "barcode": "012345678905",
    "expiry": "2026-08-31",
    "validBy": "Valid thru 8/31/2026",
    "category": "Groceries",
    "value": 10,
    "url": "https://example.com/coupon",
    "address": "123 Main St, Plano, TX",
    "notes": "In-store only"
  }
}
```

## Backend Responsibilities

- Authenticate the app request using a server-side policy.
- Keep AI provider credentials on the server.
- Validate image size and MIME type before calling the model.
- Ask the model to return strict JSON with the requested fields.
- Normalize dates to `YYYY-MM-DD`.
- Return empty strings or `null` for fields not visible in the image.
- Log failures without storing customer images unless explicit retention is enabled.

## Implementation Choices

- Serverless function: easiest for the PWA, but GitHub Pages itself cannot host it.
- Existing API service: best when Perq adds accounts, email ingestion, crawler results, and push notifications.
- On-device/native ML: avoids network calls but is larger, less flexible, and typically less accurate for coupons than a hosted vision model.

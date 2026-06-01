# Perq Email Ingestion Module

## Goal

Let a user connect an inbox so merchant emails can be converted into saved Perq deals without manual copy/paste.

## Static App Contract

The GitHub Pages PWA stores profile data and the user's email-connect intent locally:

- name
- email
- optional phone
- deal category preferences
- requested provider
- connection status

The static app cannot safely hold OAuth client secrets or poll an inbox. It should hand off to a backend OAuth flow when one is available.

## Backend Module

1. Start OAuth for Gmail or Outlook from the profile/settings email module.
2. Store refresh tokens server-side, encrypted at rest.
3. Watch inbox changes through Gmail Pub/Sub, Microsoft Graph subscriptions, or scheduled IMAP polling.
4. Filter likely merchant offers by sender, subject, structured markup, and terms such as coupon, promo, valid by, valid thru, expires, discount, barcode, offer, and reward.
5. Normalize each match into the Perq deal payload:

```json
{
  "merchant": "Target",
  "discount": "20% off",
  "value": 20,
  "category": "Groceries",
  "source": "Email",
  "code": "TARGET20",
  "barcode": "012345678905",
  "expiry": "2026-06-30",
  "address": "123 Main St, Plano, TX",
  "notes": "Min $50",
  "url": "https://www.target.com"
}
```

6. Send the normalized payload to the user's Perq account.
7. Trigger expiry reminders and beacon checks from the saved deal record.

## Security Notes

Use least-privilege inbox scopes, token rotation, webhook signature checks, rate limits, and a delete/disconnect path that removes server-side tokens.

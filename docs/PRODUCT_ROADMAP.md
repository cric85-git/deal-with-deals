# Perq — Product Roadmap

> Your Personal Savings Agent. Snap it. Forget it. Save money.

## Vision

A user never has to worry about remembering they have a coupon about to expire. They take a pic and forget — the app handles everything: creating the deal card, reminding them (configurable) about expiry, notifying when in close proximity, sharing socially, claiming deals surfaced by preference, and integrating with emails, reward platforms, airline miles, and hotel loyalty programs.

Eventually: freemium model, gamification, and crawled public deals.

---

## Phase 1: Core Mobile App (MVP)

The foundational **Capture → Remind → Redeem** loop.

| # | Feature | Status | Description |
|---|---------|--------|-------------|
| 1.1 | **Snap & Forget** | ✅ Done | Camera capture → AI OCR → auto-create deal card → one-tap save → scheduled reminders |
| 1.2 | Smart Reminders | ✅ Done | Configurable notifications: X days before, evening before, day-of. Works with app closed. |
| 1.3 | Deal Cards UI | ✅ Done | Swipeable cards with merchant, discount, days remaining, barcode, category chips |
| 1.4 | Proximity Alerts | ✅ Done | Geofencing — notify when near a store where you have an active deal |
| 1.5 | Manual Add | ✅ Done | Quick-add form as fallback |
| 1.6 | Backend AI Proxy | ✅ Done | Cloudflare Worker proxies OCR calls — users don't need their own API key |
| 1.7 | Barcode Scanner | ✅ Done | Real-time camera barcode/QR scanner with native BarcodeDetector API |

---

## Phase 2: Social & Sharing

| # | Feature | Status | Description |
|---|---------|--------|-------------|
| 2.1 | Share Deals | ✅ Done | Deep-link sharing with encoded deal data + native share sheet |
| 2.2 | Claim Shared Deals | ✅ Done | Tap share link → deal auto-imports with confirmation modal |
| 2.3 | Deal Feed | ✅ Done | Activity feed tracking shares, claims, community trending |

---

## Phase 3: Integrations & Aggregation

| # | Feature | Status | Description |
|---|---------|--------|-------------|
| 3.1 | Email Integration | ✅ Done | Backend email worker (Gmail/Outlook OAuth + webhook) + client connection UI |
| 3.2 | Rewards Platforms | ✅ Done | Track airline miles, hotel points, credit card rewards with expiry alerts |
| 3.3 | Loyalty Cards | ✅ Done | Store membership/loyalty cards with number, barcode, color-coded display |

---

## Phase 4: Discovery & Gamification

| # | Feature | Status | Description |
|---|---------|--------|-------------|
| 4.1 | Crawled Deals | ✅ Done | Cloudflare Worker crawler (RSS feeds, cron every 6h) + personalized discovery feed |
| 4.2 | Personalized Feed | ✅ Done | Category-filtered discovery, preference-ranked results |
| 4.3 | Gamification | ✅ Done | 10 achievements, streak system, spin wheel, tiers, daily quests, points |
| 4.4 | Freemium Gate | 📋 P1 Fast-follow | Free tier (X claims/month), premium unlocks unlimited |

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla JS PWA (no framework, fast & light) |
| Native wrapper | Capacitor 8.x (iOS + Android) |
| Hosting | GitHub Pages (static) |
| AI/OCR | Anthropic Claude API (vision) |
| Notifications | `@capacitor/local-notifications` (scheduled) |
| Geolocation | `@capacitor/geolocation` (beacon radius) |
| Testing | Playwright + custom Node test runner |

---

## Status Legend

| Icon | Meaning |
|------|---------|
| ✅ | Shipped and functional |
| 🔜 | Next up / in progress |
| 📐 | Design doc exists, not yet built |
| 📋 | Planned, not yet designed |

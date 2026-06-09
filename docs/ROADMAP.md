# Perq Wallet — Roadmap & Pending Items

This is the running list of features and improvements that are scoped but not
yet shipped. Items are grouped by category and roughly ordered by priority
within each section. We revisit this list at the start of each cycle.

Status legend:
- `[ ]` deferred / not started
- `[~]` partially shipped, needs follow-up
- `[!]` blocked on external dependency

---

## Backend & Infrastructure

- `[ ]` **Cross-device referral attribution.** Today `?ref=<code>` only
  credits the inviter when the new install opens the link on the same device
  that initially generated the code. Real attribution requires a backend
  that owns the code → user mapping. Cheapest path: a Cloudflare Worker
  fronting a KV namespace; mint a code at signup, look it up on inbound
  `?ref=`, increment the inviter's `referralCount`. Then surface that count
  on the Settings → Refer & Earn sheet instead of the local-only counter.
- `[ ]` **Real referral count surface.** `state.profile.referralCount`
  currently only tracks self-clicks for testing. Wire it to the backend
  attribution result above.
- `[ ]` **Account / sync.** No login today — everything is `localStorage`.
  Anonymous device ID + magic-link email backed by Workers + D1 would let
  us preserve the wallet across reinstalls and devices.

## Live Deals — Path 3 → Path 1 step function

We staged this deliberately: ship curated deals first, then scrape, then
license a real feed. We're at step 1.

- `[~]` **Step 1 — Curated.** ✅ Shipped 12 local + 10 online well-known
  recurring promos (Starbucks Rewards, Trader Joe's, Costco, Amazon Prime
  trial, etc.). Each has terms, code, merchant URL. **Honest gap:** these
  are static, not live.
- `[ ]` **Step 2 — Scraped (Path 3).** Cloudflare Worker on a cron trigger
  hitting RetailMeNot / Slickdeals weekly, parsing top deals into a KV cache,
  exposing a JSON endpoint the app polls. Respect robots.txt; fall back to
  curated when scrape fails. This is a roadmap commitment, not a customer
  promise — we'll only ship deals we're allowed to.
- `[ ]` **Step 3 — Licensed (Path 1).** RetailMeNot / Rakuten / Skimlinks
  affiliate APIs. Better data, monetization via affiliate links, no scrape
  fragility. Plan: graduate from Step 2 once we have product traction.
- `[ ]` **Local deal sourcing.** Curated list is national chains. Real local
  deals (independent restaurants, neighborhood salons) need a different
  pipeline — Yelp Fusion API + city-specific deal aggregators. Defer until
  after Step 2.

## Brand & Legal

- `[~]` **Brand colors for known merchants.** ✅ 52 entries shipped with
  WCAG AA large-text contrast (3.0+) verified by `scripts/perq-brand-test.js`.
- `[ ]` **Real merchant logos with licensing.** Currently using single-letter
  monograms (`mono` field) inside brand-colored chips. Real wordmarks/logos
  need either explicit license, fair-use justification (likely OK for
  identifying-discount context, but get legal review), or a logo provider
  like Brandfetch / Clearbit Logo API. Track per-merchant license status.
- `[ ]` **Trademark check on "Perq Wallet".** Apple App Store record is
  "Perq Wallet" (Perq alone was taken). Before any paid acquisition, run a
  USPTO TESS search and ideally file an intent-to-use application.
- `[ ]` **Merchant brand expansion.** Add: McDonald's app deals, Wendy's
  Rewards, Wegmans, Publix, Five Below, TJ Maxx, Marshalls, Macy's Star
  Rewards, Kohl's Cash, Aerie/American Eagle, Chick-fil-A One, Domino's,
  Pizza Hut, JCPenney, T-Mobile Tuesday, Verizon Up, AT&T Thanks, Mariano's,
  HEB, GameStop PowerUp, Microsoft Rewards, Google One, Dropbox.

## Native iOS / Android

- `[~]` **iOS native app.** ✅ Runs on physical iPhone via Xcode ▶ Play.
  Bundle `com.perqwallet.app`, App Store Connect record exists.
- `[ ]` **TestFlight build.** Archive → distribute → upload. Need a real
  app icon set audit (current icons regenerated from `brand/perq-icon.svg`)
  and a privacy nutrition label since we use Geolocation + Camera +
  Notifications.
- `[ ]` **Android Play Store listing.** APKs build on every push via
  GitHub Actions, but we haven't created the Play Console listing. Need
  signed AAB (release keystore in CI secret), screenshots, listing copy.
- `[ ]` **Address auto-detect for proximity alerts.** Today the proximity
  setting is just a radius (1/2/3 mi). We should detect the user's home /
  work via reverse geocoded GPS samples, or let them pin addresses. Then
  fire local notifications when within radius of any wallet pass merchant.
- `[ ]` **Background location.** Capacitor Geolocation only fires on
  foreground today. Real proximity alerts need a background job or
  region-monitoring (`CLLocationManager.startMonitoring` on iOS,
  `Geofencing API` on Android). Battery-sensitive — do not ship without
  testing.
- `[ ]` **Push notifications.** Currently only LocalNotifications. Real
  push (e.g. "new deal at a merchant you've claimed before") needs APNs +
  FCM + a backend that owns the device-token table.

## AI / Scrape / Auto-fetch

- `[ ]` **Reward program scraper for auto-fetch balances.** Today users
  manually enter Starbucks Stars / Sephora points. Wishlist: a Worker that
  scrapes loyalty portals on the user's behalf (with their stored creds in
  encrypted KV). Privacy-sensitive — needs an explicit consent flow and an
  audit trail. Ship behind an opt-in toggle.
- `[ ]` **Better OCR receipt categorization.** Current OCR proxy
  (`https://perq-ocr-proxy.shailbhatt.workers.dev`) returns text only.
  Should return structured `{merchant, total, lineItems, date}` so we can
  auto-suggest savings / cashback claims.
- `[ ]` **Auto-detect duplicate deals on share import.** When a friend
  shares a deal you already have, dedupe by merchant + amount + expiry
  rather than always creating a new pass.

## Settings / UX

- `[ ]` **Loyalty card barcode improvements.** Current implementation uses
  a generic Code128 SVG. Should detect the actual barcode format per
  merchant (Starbucks → Aztec / QR, CVS → Code39, Sephora → Code128) and
  render the right one for scanner compatibility.
- `[ ]` **Wallet pass appearance customization.** Let users pick the
  brand-color override for a generic pass (today they only get the
  PERQ_GENERIC mint). One-tap "use brand color" once auto-detection works.
- `[ ]` **Settings — Refer & Earn share grid.** Add SMS/Email/Twitter/
  Reddit alongside the current Message/WhatsApp/Email options. All channels
  should use `getReferralLink()`.
- `[ ]` **Reorder wallet passes.** Drag-and-drop priority on the Wallet
  page. Today order is by added date.
- `[ ]` **Wallet folders / categories.** Group passes by category
  (grocery, dining, travel) once a user has > 20 passes.

## Growth & Monetization

- `[ ]` **Affiliate revenue rails.** Once we move to Path 1 (licensed deal
  feeds), affiliate commission on click-throughs becomes the primary
  revenue line. Need a click-tracking redirect Worker that logs the click
  before forwarding to the merchant URL.
- `[ ]` **Premium tier.** Possible features: unlimited shared passes,
  priority deal alerts, scrape-on-demand for niche merchants, ad-free.
  Defer until we have ≥5k weekly actives.
- `[ ]` **Referral reward redemption.** Today `referralCount` increments
  but doesn't unlock anything. Need a tier ladder (5 referrals → exclusive
  deal, 10 → premium for 1 month) once attribution is real.

## Testing & Observability

- `[ ]` **Playwright smoke on every push.** `npm run test:smoke` exists but
  isn't wired into the GitHub Actions workflow yet.
- `[ ]` **Crash / error reporting in native shell.** Sentry or Bugsnag SDK.
  Today JS errors die silently in the WKWebView.
- `[ ]` **Analytics.** No event instrumentation today. Privacy-respecting
  options: PostHog self-hosted, Plausible, or roll a Worker-backed event
  pipe. Avoid GA / Segment.

---

_Last updated: 2026-06-09._

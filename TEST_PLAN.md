# Perq Manual Test Plan

## Install and launch

- Open in mobile Safari and Chrome
- Confirm splash screen appears
- Clear site data and confirm profile setup appears before first use
- Enter name, email, optional phone, and deal preferences
- Choose whether to request email connection
- Confirm iOS install guide appears only on iOS Safari when not installed
- Confirm Android install prompt appears when supported
- Confirm app launches standalone after install

## Deal capture

- Add manual deal
- Edit deal
- Delete deal
- Add deal with expiry date
- Add deal without expiry date
- Add deal with code
- Add deal without code
- Add deal with barcode
- Add deal with business address
- Paste an email or browser link into Import and confirm fields are extracted

## Photo/OCR

- Tap Snap a deal
- Select/take a photo
- Confirm preview appears
- Confirm no-key fallback works
- Confirm OCR success fills merchant, expiry/valid-by, discount, barcode, link, and address when visible
- Confirm OCR failure still allows manual save

## Claim flow

- Open Use Now
- Test Show Cashier mode
- Test Code & Copy mode
- Test Online mode
- Mark redeemed
- Confirm redeemed deal moves status
- Confirm shared redeemed deal awards points

## Rewards

- Confirm daily spin grant
- Spin wheel
- Confirm points update
- Redeem points for spin
- Redeem points for premium deal
- Complete daily quests
- Confirm streak strip updates

## Reminders

- Create expiring deal
- Confirm in-app reminder banner appears
- Enable notifications where supported
- Confirm daily dedupe prevents repeated notification spam

## Nearby deals

- Enable beacon alerts
- Allow location permission
- Set beacon radius
- Confirm a notification or in-app alert appears when an unexpired saved deal is inside radius
- Confirm alerts do not repeat for the same deal on the same day
- Flip a deal card
- Confirm map preview and directions link
- Deny location permission and confirm graceful fallback

## Email and discovery

- Request email connection from profile setup
- Request email connection from Settings
- Confirm email status is saved locally
- Review docs/email-ingestion-module.md for OAuth inbox implementation
- Review docs/discovery-and-beacon-module.md for crawler and always-on beacon implementation

## Offline

- Load app once online
- Turn on airplane mode
- Reopen app
- Confirm core UI and saved deals load
- Confirm API-dependent features fail gracefully

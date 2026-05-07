# Deal with Deals — Manual Test Plan

## Install and launch

- Open in mobile Safari and Chrome
- Confirm splash screen appears
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

## Photo/OCR

- Tap Snap a deal
- Select/take a photo
- Confirm preview appears
- Confirm no-key fallback works
- Confirm OCR success fills fields when API key is configured
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

- Enable nearby setting
- Allow location permission
- Confirm nearby banner or empty state
- Flip a deal card
- Confirm map preview and directions link
- Deny location permission and confirm graceful fallback

## Offline

- Load app once online
- Turn on airplane mode
- Reopen app
- Confirm core UI and saved deals load
- Confirm API-dependent features fail gracefully

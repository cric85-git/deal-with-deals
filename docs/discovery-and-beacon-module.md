# Perq Discovery And Beacon Module

## Differentiator

Perq should help users use deals before they expire and when they are physically close enough to act.

## Expiry Reminders

The app stores a configurable reminder window in days. On launch and foreground return, Perq scans unredeemed deals and shows an in-app reminder. If notification permission is granted, it also sends a browser notification and dedupes reminders for the day.

## Beacon Alerts

The app stores a configurable mile radius. When beacon alerts are enabled, Perq checks unexpired saved deals against the user's current location, geocodes the merchant or saved address, and notifies when a deal falls inside the radius. Alerts are deduped per deal per day.

Static PWA limitation: browsers do not allow a static page to run continuous background geofencing after the app is closed. The current implementation checks while the app is open, when it returns to foreground, and when the browser allows active geolocation watching.

## Backend Or Native Upgrade

For always-on beacons:

1. Store merchant locations for each saved deal.
2. Use native iOS/Android geofencing or a background-capable wrapper.
3. Send push notifications through APNs/FCM when a user enters the configured radius.
4. Keep the existing static PWA notification path as the foreground fallback.

## Deal Discovery

A crawler or partner-feed service should run outside GitHub Pages:

1. Crawl merchant coupon pages and affiliate feeds.
2. Normalize each offer to the Perq deal payload.
3. Rank offers by user preferences, saved categories, location, and redemption history.
4. Feed the static PWA through a JSON endpoint or account API.

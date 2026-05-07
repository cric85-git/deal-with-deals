# Perq v17 — Link Save Only Fix

This build removes all paste-triggered auto-save behavior. Pasted links/text stay idle until the user explicitly taps **Save to Deals Wallet**.

## Fixes
- Click-only save handler for online deal modal
- No autofocus on mobile to avoid accidental submit/touch events
- Reset button state when modal opens/closes
- 5-second safety reset if save ever gets stuck
- Keeps app name as Perq and camera CTA as Snap Deal

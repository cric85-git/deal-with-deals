# Perq — Customer Experience Flows

Complete end-to-end user journeys for all major features.

---

## 1. Email / Digital Deal — Auto-Import Flow

### The Promise
"You never have to remember a coupon from your email again."

### Setup (one-time, 30 seconds)
```
1. Open Perq → Settings → Email Connection
2. Tap "Connect Gmail" or "Connect Outlook"
3. OAuth consent screen appears → Grant read-only inbox access
4. Redirected back to Perq → "✅ Gmail connected — deals will auto-import"
5. Done. Never touch this again.
```

### Ongoing Experience (fully automatic)
```
📧  Tuesday 9am: Target sends "20% off — code SAVE20, expires June 15"
         ↓
🔧  Backend email worker webhook fires (< 5 seconds)
         ↓
🧠  Worker parses: merchant=Target, discount=20% off, code=SAVE20, expiry=06/15
         ↓
💾  Deal stored in KV sync queue
         ↓
🔔  Push notification → "📬 New deal found: Target — 20% off"
         ↓
📱  User taps notification (or opens app anytime later)
         ↓
🔄  App syncs → deal card appears in wallet
         ↓
⏰  3 reminders auto-scheduled: 3 days before, evening before, day-of
         ↓
📍  Walk near Target → proximity alert: "Target deal 0.3mi away!"
         ↓
✅  Show cashier → tap "Redeem" → saved $15
```

### Fallback Paths (when email isn't connected)
| Method | Steps | Effort |
|--------|-------|--------|
| **Share from email** | Open email → Share → pick Perq → auto-parsed → Save | 3 taps |
| **Screenshot** | Screenshot email → Open Perq → Snap → AI reads it → Quick Save | 4 taps |
| **Forward (future)** | Forward email to deals@perq.app → auto-imports | 1 tap |

### What Perq extracts from emails:
- Merchant name (from sender + subject)
- Discount amount (20% off, $10 off, BOGO, free item)
- Promo code (CODE: SAVE20)
- Expiry date (valid thru, expires, ends)
- Category (auto-classified)
- Store URL

---

## 2. Reward Program — Track & Remind Flow

### The Promise
"Never lose miles, points, or cashback to expiry again."

### Adding a Program

**Path A: Quick Select (most common)**
```
1. For You tab → "Add program"
2. Modal opens with 3 modes: [Choose program] [Login & sync] [Manual]
3. Select "Delta SkyMiles" from dropdown
4. Unit auto-fills to "miles"
5. Enter balance: 52,400
6. Enter expiry: 2027-03-15 (if known)
7. Tap "Save program"
8. Card appears:
   ┌──────────────────────────────────┐
   │ ✈️  Delta SkyMiles               │
   │    52,400 miles · 267 days left  │
   └──────────────────────────────────┘
```

**Path B: Login & Sync**
```
1. For You tab → "Add program" → tap "Login & sync"
2. Select "Marriott Bonvoy" from dropdown
3. Tap "Connect & fetch balance"
4. Marriott login page opens in browser
5. User logs in → checks their balance
6. Returns to Perq → enters balance (18,200 points)
7. Save → card with expiry tracking added
```
*Future: full OAuth scrub that reads balance automatically without user entering it.*

**Path C: Manual (custom programs)**
```
1. Tap "Manual" mode
2. Enter: name, balance, unit, expiry, type
3. Save → tracked with reminders
```

### Ongoing Experience
```
Program saved with expiry
         ↓
🔔  30 days before: "Delta SkyMiles points expire in 30 days"
         ↓
🔔  7 days before: "⚠️ Delta SkyMiles expires in 7 days!"
         ↓
💡  Visual indicators in For You tab:
    • > 90 days: normal (no warning)
    • ≤ 90 days: yellow text "90d left"
    • ≤ 30 days: red text "12d left"
```

### Known Programs (pre-loaded):
| Airlines | Hotels | Credit Cards |
|----------|--------|-------------|
| Delta SkyMiles | Marriott Bonvoy | Chase Ultimate Rewards |
| United MileagePlus | Hilton Honors | Amex Membership Rewards |
| American AAdvantage | IHG Rewards | Capital One Miles |
| Southwest Rapid Rewards | | Citi ThankYou |

---

## 3. Loyalty Card — Store & Use at Checkout

### The Promise
"Never fumble for a physical card at checkout again."

### Adding a Card

**Path A: Type it in (fastest)**
```
1. For You tab → "Add card"
2. Modal opens: [Type it] [📷 Scan card]
3. Enter: "Costco Membership"
4. Enter: "1234 5678 9012 3456"
5. Optional: set expiry date
6. Pick color: 🔴
7. Save
```

**Path B: Camera Scan (OCR)**
```
1. Tap "📷 Scan card" mode
2. Info banner: "Take a photo of your card. AI will read the details."
3. Tap the camera area → phone camera opens
4. Snap photo of physical loyalty card
5. AI reads:
   - Store name: "Costco"  
   - Card number: "1234 5678 9012 3456"
6. Results pre-fill the form
7. Pick color → Save
```

### Using at Checkout
```
1. Open Perq → For You tab
2. See your loyalty cards listed
3. Tap the card → barcode expands:
   ┌──────────────────────────────────┐
   │ 🔴 Costco Membership             │
   │    1234 5678 9012 3456           │
   │ ┌────────────────────────────┐   │
   │ │ ||||| |||| ||| |||| |||||  │   │
   │ │    1234567890123456        │   │
   │ └────────────────────────────┘   │
   │         Show at checkout         │
   └──────────────────────────────────┘
4. Show barcode to cashier → they scan it
5. Tap again to collapse
```

### Features:
- **Barcode rendering** — card number displayed as scannable barcode
- **Tap to expand/collapse** — barcode only shows when needed (saves space)
- **Color-coded** — 6 color options for easy visual identification
- **Monospace number** — easy to read and dictate if scanner fails
- **Expiry tracking** — optional expiry date for membership cards
- **Camera OCR** — AI reads card photos (same Claude Vision as deal snapping)

---

## 4. Summary: What "Zero Effort" Looks Like

| Feature | User Action | Perq Does |
|---------|------------|-----------|
| **Email deals** | Connected once | Everything — parse, import, remind, alert |
| **Photo deals** | Snap → one tap save | OCR, categorize, schedule 3 reminders, proximity watch |
| **Barcode deals** | Point & scan | Detect code, pre-fill form, save |
| **Reward programs** | Add once | Track balance, warn at 30d/7d before expiry |
| **Loyalty cards** | Type or scan | Store, render barcode, tap to show at checkout |
| **Shared deals** | Tap a link | Auto-import, set reminders, +5 pts |
| **Discovered deals** | Browse → Claim | Personalized feed refreshed every 6h |

---

## 5. Notification Timeline (for a typical deal lifecycle)

```
Day 0:   📬 "New deal found: Target 20% off" (push, from email)
Day 0:   Deal card appears in wallet
Day 12:  ⏰ "Target expires in 3 days" (scheduled notification, 9am)
Day 13:  ⏰ "Target expires tomorrow" (scheduled notification, 6pm)
Day 14:  ⏰ "Target expires TODAY — code SAVE20" (scheduled notification, 9am)
Day 14:  📍 "Target deal 0.3mi away!" (proximity alert, when near store)
Day 14:  ✅ User redeems → all notifications cancelled → +points
```

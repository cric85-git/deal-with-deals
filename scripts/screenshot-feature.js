/**
 * Captures screenshots demonstrating the Snap & Forget feature flow.
 * Run: node scripts/screenshot-feature.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const outputDir = path.join(__dirname, '..', 'docs', 'screenshots');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  // Inject localStorage BEFORE the page loads so onboarding is skipped
  await context.addInitScript(() => {
    localStorage.setItem('perq:profile', JSON.stringify({
      name: 'Demo User', email: 'demo@perq.app', phone: '',
      preferences: ['Groceries', 'Dining', 'Travel']
    }));
    localStorage.setItem('perq:seeded', 'true');
    localStorage.setItem('perq:settings', JSON.stringify({
      remindersOn: true, reminderDays: 3, nearbyOn: false, nearbyRadius: 5
    }));
    localStorage.setItem('perq:deals', JSON.stringify([]));
    localStorage.setItem('perq:rewards', JSON.stringify({ points: 45, shared: 2, claimed: 1 }));
    localStorage.setItem('perq:game', JSON.stringify({ spins: 0, lastDailyClaim: null, streak: 3, totalSpins: 12, history: [] }));
  });

  const page = await context.newPage();
  const indexPath = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(indexPath);
  await page.waitForTimeout(1500);

  // Screenshot 1: Home screen — empty state
  await page.screenshot({ path: path.join(outputDir, '01-home-empty.png') });
  console.log('✅ 01-home-empty.png — Home screen with "tap camera to snap" prompt');

  // Screenshot 2: Open the deal form (tap + button to simulate)
  // Find and click the add deal button in the nav/FAB
  const addBtn = await page.$('[data-action="add"], .fab-add, #btn-add');
  if (addBtn) {
    await addBtn.click();
    await page.waitForTimeout(500);
  } else {
    // Fallback: open modal via JS
    await page.evaluate(() => {
      if (typeof openModal === 'function') openModal(null);
      else {
        const modal = document.getElementById('modal-deal');
        if (modal) modal.classList.add('active');
      }
    });
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(outputDir, '02-deal-form-empty.png') });
  console.log('✅ 02-deal-form-empty.png — Add deal form (manual entry)');

  // Screenshot 3: Simulate AI OCR filled form with quick-save banner
  await page.evaluate(() => {
    // Fill form fields as if AI OCR just completed
    const fields = {
      'f-merchant': 'Whole Foods Market',
      'f-discount': '20% off all organic produce',
      'f-value': '15',
      'f-expiry': '2026-06-20',
      'f-category': 'Groceries',
      'f-source': 'Photo capture',
      'f-code': 'FRESH20',
      'f-barcode': '4901234567890'
    };
    Object.entries(fields).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });

    // Show the quick-save banner
    const el = document.getElementById('ocr-status');
    if (el) {
      el.style.display = 'flex';
      el.className = 'ocr-status success';
      el.innerHTML = `
        <div style="width:100%;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <i class="ti ti-check" style="font-size:16px;color:#3B6D11;"></i>
            <span style="font-size:13px;color:#1a1a1a;">
              <strong>Whole Foods Market</strong> — 20% off all organic produce · expires 2026-06-20
            </span>
          </div>
          <div style="display:flex;gap:8px;">
            <button style="flex:1;background:#071B4D;color:white;border:none;border-radius:8px;padding:12px;font-weight:600;font-size:14px;">
              ✓ Save & Set Reminder
            </button>
            <button style="flex:0 0 auto;background:#f5f4ef;border:1px solid rgba(0,0,0,0.15);border-radius:8px;padding:12px 14px;font-size:13px;">
              Edit
            </button>
          </div>
        </div>
      `;
    }

    // Show capture preview placeholder
    const preview = document.getElementById('capture-preview');
    if (preview) {
      preview.style.display = 'flex';
      preview.innerHTML = '<div style="width:100%;height:120px;background:linear-gradient(135deg,#eee,#ddd);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#888;font-size:13px;">📷 Coupon photo preview</div>';
    }

    // Update modal title
    const title = document.getElementById('modal-title');
    if (title) title.textContent = 'New deal from photo';
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDir, '03-ocr-quick-save.png') });
  console.log('✅ 03-ocr-quick-save.png — AI extracted deal + one-tap Quick Save');

  // Screenshot 4: Deals list with multiple cards
  await page.evaluate(() => {
    // Close modal
    const modal = document.getElementById('modal-deal');
    if (modal) modal.classList.remove('active');

    // Inject sample deals
    const now = Date.now();
    const deals = [
      {
        id: 'demo1', merchant: 'Whole Foods Market', discount: '20% off all organic produce',
        value: 15, category: 'Groceries', source: 'Photo capture', code: 'FRESH20',
        expiry: '2026-06-20', barcode: '4901234567890', address: '', notes: '',
        url: 'https://wholefoodsmarket.com', redeemed: false, shared: false, createdAt: now
      },
      {
        id: 'demo2', merchant: 'Target', discount: '$10 off $50+ purchase',
        value: 10, category: 'Home', source: 'Photo capture', code: 'SAVE10',
        expiry: '2026-06-07', barcode: '', address: '123 Main St', notes: 'In-store only',
        url: 'https://target.com', redeemed: false, shared: false, createdAt: now - 86400000
      },
      {
        id: 'demo3', merchant: 'Starbucks', discount: 'Free grande drink',
        value: 6, category: 'Dining', source: 'Photo capture', code: '',
        expiry: '2026-06-05', barcode: '', address: '', notes: 'Birthday reward',
        url: 'https://starbucks.com', redeemed: false, shared: true, createdAt: now - 172800000
      }
    ];
    localStorage.setItem('perq:deals', JSON.stringify(deals));
    localStorage.setItem('perq:rewards', JSON.stringify({ points: 75, shared: 3, claimed: 2 }));
  });
  // Reload to render the deals
  await page.reload();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outputDir, '04-deals-list.png') });
  console.log('✅ 04-deals-list.png — Deal cards with expiry countdown & status');

  // Screenshot 5: Social tab with activity feed
  await page.evaluate(() => {
    // Add activity feed data
    const activity = [
      { id: 'a1', type: 'share', data: { merchant: 'Whole Foods Market', discount: '20% off produce', dealId: 'demo1' }, timestamp: Date.now() - 3600000, user: 'Demo User' },
      { id: 'a2', type: 'claim', data: { merchant: 'Starbucks', discount: 'Free grande drink', from: '@thrifty_jen' }, timestamp: Date.now() - 7200000, user: 'Demo User' },
      { id: 'a3', type: 'share', data: { merchant: 'Target', discount: '$10 off $50+', dealId: 'demo2' }, timestamp: Date.now() - 86400000, user: 'Demo User' }
    ];
    localStorage.setItem('perq:activity', JSON.stringify(activity));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  // Navigate to Social tab
  await page.evaluate(() => {
    document.querySelectorAll('.nav-btn').forEach(b => {
      if (b.getAttribute('data-tab') === 'social') b.click();
    });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, '06-social-feed.png') });
  console.log('✅ 06-social-feed.png — Social tab with activity feed');

  // Screenshot 7: For You tab with reward programs + loyalty cards
  await page.evaluate(() => {
    // Add sample reward programs and loyalty cards
    localStorage.setItem('perq:rewardPrograms', JSON.stringify([
      { id: 'rp1', name: 'Delta SkyMiles', balance: '52400', unit: 'miles', expiry: '2027-03-15', type: 'airline', icon: 'plane', addedAt: Date.now() },
      { id: 'rp2', name: 'Marriott Bonvoy', balance: '18200', unit: 'points', expiry: '2026-08-01', type: 'hotel', icon: 'building', addedAt: Date.now() },
      { id: 'rp3', name: 'Chase Sapphire', balance: '34100', unit: 'points', expiry: null, type: 'creditcard', icon: 'credit-card', addedAt: Date.now() }
    ]));
    localStorage.setItem('perq:loyaltyCards', JSON.stringify([
      { id: 'lc1', name: 'Costco Membership', number: '1234 5678 9012 3456', color: '#DC2626', addedAt: Date.now() },
      { id: 'lc2', name: 'CVS ExtraCare', number: '8901234567', color: '#059669', addedAt: Date.now() }
    ]));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.querySelectorAll('.nav-btn').forEach(b => {
      if (b.getAttribute('data-tab') === 'suggest') b.click();
    });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, '07-for-you-programs.png') });
  console.log('✅ 07-for-you-programs.png — For You tab with rewards + loyalty cards');

  await browser.close();
  console.log('\n📸 All screenshots saved to docs/screenshots/');
})();

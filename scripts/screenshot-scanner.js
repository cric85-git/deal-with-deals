/**
 * Captures screenshot of the barcode scanner overlay.
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
  });

  const page = await context.newPage();
  const indexPath = 'file://' + path.resolve(__dirname, '..', 'index.html');
  await page.goto(indexPath);
  await page.waitForTimeout(1500);

  // Show scanner overlay with simulated detected code
  await page.evaluate(() => {
    const overlay = document.getElementById('scanner-overlay');
    overlay.classList.add('active');
    // Simulate a detected barcode
    const resultEl = document.getElementById('scanner-result');
    const codeEl = document.getElementById('scanner-result-code');
    codeEl.textContent = '4901234567890';
    resultEl.style.display = 'flex';
    document.querySelector('.scanner-hint').textContent = 'Code detected!';
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputDir, '05-scanner-detected.png') });
  console.log('✅ 05-scanner-detected.png — Barcode scanner with detected code');

  await browser.close();
})();

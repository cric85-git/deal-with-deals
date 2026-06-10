/**
 * Perq Wallet — Playwright smoke spec.
 *
 * Boots the actual preview.html in an iPhone-sized Chromium viewport and
 * asserts the cold-launch path the user actually sees:
 *   1. Boot splash renders with logo, "Perq" wordmark, and tagline
 *   2. Boot splash dismisses cleanly (no stuck overlay)
 *   3. Either onboarding (first run) or wallet (returning user) is visible
 *   4. Document title is "Perq"
 *   5. Wallet page header shows the mint "Perq" wordmark + wallet logo
 *   6. Tab bar is present with the 4 expected tabs
 *
 * Uses file:// so the tests don't require the Python http.server. This
 * matches the pattern in scripts/perq-splash-test.js.
 *
 * Wired into npm run test:smoke and into the supervisor hook on git push.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');

const PREVIEW_URL = 'file://' + path.resolve(__dirname, '..', 'preview.html');

test('Cold launch shows boot splash with brand wordmark + tagline', async ({ page }) => {
  await page.goto(PREVIEW_URL);
  // Pause auto-dismiss so we can measure the splash
  await page.evaluate(() => { window.__perqAppReady = false; });
  await expect(page.locator('#boot-splash')).toBeVisible({ timeout: 1500 });
  await expect(page.locator('#boot-splash .bs-logo')).toBeVisible();
  await expect(page.locator('#boot-splash .bs-word')).toHaveText('Perq');
  await expect(page.locator('#boot-splash .bs-tag')).toHaveText('Save more, miss nothing');
});

test('Boot splash dismisses cleanly within 3s when app signals ready', async ({ page }) => {
  await page.goto(PREVIEW_URL);
  await page.evaluate(() => { window.__perqAppReady = true; });
  await expect(page.locator('#boot-splash')).toBeHidden({ timeout: 3000 });
});

test('Document title is Perq', async ({ page }) => {
  await page.goto(PREVIEW_URL);
  await expect(page).toHaveTitle('Perq');
});

test('After dismiss, wallet OR onboarding is visible (no black screen)', async ({ page }) => {
  await page.goto(PREVIEW_URL);
  await expect(page.locator('#boot-splash')).toBeHidden({ timeout: 3000 });
  // One of these must be visible
  const wallet = page.locator('[data-page="wallet"]');
  const onboarding = page.locator('#onboarding:not(.hidden)');
  const oneVisible = await wallet.isVisible() || await onboarding.isVisible();
  expect(oneVisible).toBe(true);
});

test('Wallet page header renders Perq wordmark in mint', async ({ page }) => {
  await page.goto(PREVIEW_URL);
  // Force-finish onboarding so wallet is visible (returning-user path)
  await page.evaluate(() => {
    try { localStorage.setItem('perq-mvp:onboarded', 'true'); } catch (e) {}
  });
  await page.reload();
  await expect(page.locator('#boot-splash')).toBeHidden({ timeout: 3000 });
  const wordmark = page.locator('[data-page="wallet"] .home-logo-text');
  await expect(wordmark).toHaveText('Perq');
  // Confirm it's mint (#34D399) per steering rules
  const color = await wordmark.evaluate(el => getComputedStyle(el).color);
  // rgb(52, 211, 153) === #34D399
  expect(color.replace(/\s/g, '')).toBe('rgb(52,211,153)');
});

test('Tab bar shows 4 tabs (Wallet, Browse, Rewards, Community) plus snap', async ({ page }) => {
  await page.goto(PREVIEW_URL);
  await page.evaluate(() => {
    try { localStorage.setItem('perq-mvp:onboarded', 'true'); } catch (e) {}
  });
  await page.reload();
  await expect(page.locator('#boot-splash')).toBeHidden({ timeout: 3000 });
  await expect(page.locator('.tabbar .tabbar-btn[data-tab="wallet"]')).toBeVisible();
  await expect(page.locator('.tabbar .tabbar-btn[data-tab="browse"]')).toBeVisible();
  await expect(page.locator('.tabbar .tabbar-btn[data-tab="rewards"]')).toBeVisible();
  await expect(page.locator('.tabbar .tabbar-btn[data-tab="community"]')).toBeVisible();
  await expect(page.locator('.tabbar .tabbar-snap')).toBeVisible();
});

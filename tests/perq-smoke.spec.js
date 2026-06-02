const { test, expect } = require('@playwright/test');

test('Perq shell loads with approved brand images', async ({ page }) => {
  await page.goto('/index.html');

  await expect(page).toHaveTitle('Perq');
  await expect(page.locator('.header h1')).toHaveText('Perq');
  await expect(page.locator('.brand-mark img')).toHaveAttribute('src', 'icon-192.png');
  await expect(page.locator('#splash .splash-mark img')).toHaveAttribute('src', 'icon-512.png');
  await expect(page.locator('#splash')).toBeHidden({ timeout: 4000 });

  await expect(page.locator('#profile-screen')).toBeVisible();
  await page.fill('#profile-name', 'Test User');
  await page.fill('#profile-email', 'test@example.com');
  await page.locator('.preference-pill').filter({ hasText: 'Groceries' }).click();
  await page.click('#profile-save');
  await expect(page.locator('#profile-screen')).toBeHidden();
});

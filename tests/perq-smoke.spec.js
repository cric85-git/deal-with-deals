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

test('Rewards tab presents a tangible daily run and wallet', async ({ page }) => {
  await page.addInitScript(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const today = d.toISOString().slice(0, 10);
    localStorage.setItem('perq:profile', JSON.stringify({
      name: 'Rewards Tester',
      email: 'rewards@example.com',
      preferences: ['Groceries', 'Dining'],
      createdAt: Date.now()
    }));
    localStorage.setItem('perq:installDismissed', JSON.stringify(true));
    localStorage.setItem('perq:rewards', JSON.stringify({ points: 20, shared: 1, claimed: 0 }));
    localStorage.setItem('perq:game', JSON.stringify({ spins: 1, lastDailyClaim: today, streak: 2, totalSpins: 3, history: [] }));
    localStorage.setItem('perq:quests', JSON.stringify({
      date: today,
      bonusClaimed: false,
      items: [
        { id: 'q_add', label: 'Add a new deal', target: 1, progress: 1, reward: 1, claimed: true },
        { id: 'q_share', label: 'Share a deal', target: 1, progress: 1, reward: 1, claimed: true },
        { id: 'q_redeem', label: 'Mark a deal redeemed', target: 1, progress: 0, reward: 1, claimed: false }
      ]
    }));
  });

  await page.goto('/index.html?smoke=rewards');
  await page.click('button[data-tab="rewards"]');

  const rewards = page.locator('#panel-rewards');
  await expect(rewards.getByText("Today's savings run")).toBeVisible();
  await expect(rewards.getByText('Run bonus')).toBeVisible();
  await expect(rewards.getByText('Finish run to unlock')).toBeVisible();
  await expect(rewards.getByText('Reward wallet')).toBeVisible();
  await expect(rewards.getByText('Spin token')).toBeVisible();
  await expect(rewards.getByText('Premium deal drop')).toBeVisible();
  await expect(rewards.getByText('Expiry rescue')).toBeVisible();
  await expect(rewards.getByText('Rare drop')).toBeVisible();
  await expect(page.locator('[data-daily-run-bonus]')).toBeDisabled();
});

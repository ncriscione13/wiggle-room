import { expect, test } from '@playwright/test';

// M0.7: ?screen=lagtest shows a big wrist-following marker and a running ms
// counter for the phone slow-motion measurement (docs/LAG-TEST.md).

test('lag test screen: counter runs and the marker follows the wrist', async ({ page }) => {
  await page.goto('/?clip=jumps-x5&screen=lagtest');

  const counter = page.getByTestId('lag-counter');
  await expect(counter).toBeVisible({ timeout: 30000 });
  const c1 = (await counter.textContent()) ?? '';
  await page.waitForTimeout(400);
  const c2 = (await counter.textContent()) ?? '';
  expect(c2).not.toBe(c1);
  expect(c2).toMatch(/\d{6} ms/);

  const marker = page.getByTestId('lag-marker');
  await expect(marker).toBeVisible();
  const t1 = await marker.evaluate((el) => el.style.transform);
  await page.waitForTimeout(600); // jumps clip: arms swing, wrist moves
  const t2 = await marker.evaluate((el) => el.style.transform);
  expect(t2).not.toBe(t1);
});

import { expect, test } from '@playwright/test';
import { colors, cssRgb, playerColors } from '../src/ui/theme';

// Task 0.4 acceptance: `npm run dev` (and the built app) shows a pastel
// "Wiggle Room" start screen. Colors are asserted against theme tokens --
// never against literal values -- so theme.ts stays the single source.

test('start screen shows the Wiggle Room title on the night surface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Wiggle Room' })).toBeVisible();

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg).toBe(cssRgb(colors.surfaceNight));
});

test('start screen shows both player circles in their theme colors', async ({ page }) => {
  await page.goto('/');
  for (const slot of [0, 1] as const) {
    const circle = page.locator(`[data-player="${String(slot)}"]`);
    await expect(circle).toBeVisible();
    const bg = await circle.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe(cssRgb(colors[playerColors[slot]]));
  }
});

test('start screen mentions the privacy promise', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Nothing is recorded')).toBeVisible();
});

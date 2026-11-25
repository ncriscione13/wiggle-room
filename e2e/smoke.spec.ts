import { expect, test } from '@playwright/test';

test('the app loads and shows Wiggle Room', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Wiggle Room');
  await expect(page.locator('#app')).toContainText('Wiggle Room');
});

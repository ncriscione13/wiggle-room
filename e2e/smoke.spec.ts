import { expect, test } from '@playwright/test';

// Boot smoke test. Freezes boot at the start screen (getUserMedia pending)
// so the stage takeover can't remove the asserted text mid-test on a slow
// machine -- the same latent race that bit start-screen.spec on CI.

test('the app loads and shows Wiggle Room', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => new Promise<MediaStream>(() => undefined);
  });
  await page.goto('/');
  await expect(page).toHaveTitle('Wiggle Room');
  await expect(page.locator('#app')).toContainText('Wiggle Room');
});

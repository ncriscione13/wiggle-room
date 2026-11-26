import { expect, test } from '@playwright/test';

// M0.4: the debug overlay toggles with D and shows per-stage timings, fps and
// the last events. Since the M1 playtest fixes, the motion-kit row shows REAL
// per-frame cost (the kit runs on the stage), not the old placeholder text.

test('D toggles the overlay; it shows timings, fps and events', async ({ page }) => {
  await page.goto('/?clip=still-30s');
  await expect(page.getByTestId('replay-badge')).toHaveAttribute('data-state', 'ready', {
    timeout: 30000,
  });
  await expect(page.getByTestId('debug-overlay')).toBeHidden();

  await page.keyboard.press('d');
  const overlay = page.getByTestId('debug-overlay');
  await expect(overlay).toBeVisible();

  await expect(overlay.getByTestId('overlay-camera-ms')).toContainText('ms', { timeout: 10000 });
  await expect(overlay.getByTestId('overlay-inference-ms')).toContainText('ms');
  // Real measured numbers: "<avg> ms (p99 <p99> ms)" once frames have flowed.
  await expect(overlay.getByTestId('overlay-motion-ms')).toContainText('p99', { timeout: 10000 });
  await expect(overlay.getByTestId('overlay-motion-ms')).toContainText('ms');
  await expect(overlay.getByTestId('overlay-render-fps')).toContainText('fps');
  await expect(overlay.getByTestId('overlay-events')).toContainText('replay started');
  await expect(overlay.getByTestId('overlay-events')).toContainText('pose found');

  await page.keyboard.press('d');
  await expect(overlay).toBeHidden();
});

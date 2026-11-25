import { expect, test } from '@playwright/test';

// Task 0.7: ?source=replay&clip=<name> feeds a clip instead of the camera.
// Phase 0 proves the mode exists and loads clip data; M0.2 wires it into the
// PoseSource pipeline.

test('replay mode loads a synthetic clip instead of the camera', async ({ page }) => {
  await page.goto('/?source=replay&clip=still-30s');
  const badge = page.getByTestId('replay-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-state', 'ready');
  await expect(badge).toContainText('still-30s');
  await expect(badge).toContainText('frames');
});

test('replay mode fails friendly on a clip that does not exist', async ({ page }) => {
  await page.goto('/?source=replay&clip=no-such-clip');
  const badge = page.getByTestId('replay-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('data-state', 'error');
  await expect(badge).toContainText('could not be loaded');
});

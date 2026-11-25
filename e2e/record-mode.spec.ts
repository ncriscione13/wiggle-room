import { expect, test } from '@playwright/test';

// M0.8: the guided clip-recording flow, end to end with the fake camera.
// ?promptSeconds=2 shortens takes (the same override Nick can use for dry
// runs); the countdown stays real.

test('guided recording: space -> countdown -> recording -> download -> next prompt', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/?screen=record&promptSeconds=2');

  const director = page.getByTestId('record-director');
  await expect(director).toBeVisible({ timeout: 60_000 });
  await expect(director).toHaveAttribute('data-phase', 'idle');
  await expect(director).toHaveAttribute('data-prompt', 'standing-still-30s');
  await expect(page.getByTestId('record-title')).toContainText('statue');
  await expect(page.getByTestId('record-progress')).toContainText('1 of 8');

  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.keyboard.press('Space');
  // countdown -> recording are transient (3 s + 2 s) and owned by the reducer
  // unit tests; here we assert the stable outcomes only.
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('standing-still-30s.json');
  await expect(director).toHaveAttribute('data-phase', 'review', { timeout: 15_000 });

  await page.keyboard.press('n');
  await expect(director).toHaveAttribute('data-phase', 'idle');
  await expect(director).toHaveAttribute('data-prompt', 'bunny-hops-x5');
  await expect(page.getByTestId('record-progress')).toContainText('2 of 8');
});

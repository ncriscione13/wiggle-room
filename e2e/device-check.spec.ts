import { expect, test } from '@playwright/test';

// M0.6: first run benchmarks tracking and stores the result; later runs skip
// it. On a slow CI box the reduction ladder may legitimately run (3 passes),
// so timeouts are generous.

test.describe('device check (M0.6)', () => {
  test('first run performs the check and stores a record', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/');
    const chip = page.getByTestId('camera-chip');
    await expect(chip).toContainText('Device check', { timeout: 45_000 });
    await expect(chip).toContainText('Tracking', { timeout: 60_000 });

    const raw = await page.evaluate(() => localStorage.getItem('wiggle.device-check.v1'));
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw ?? '{}') as { avgMs: number; widthPx: number; atMs: number };
    expect(record.avgMs).toBeGreaterThan(0);
    expect(record.widthPx).toBeGreaterThan(0);
  });

  test('a stored record skips the check entirely', async ({ page }) => {
    const seeded = {
      avgMs: 11.5,
      p99Ms: 16.2,
      widthPx: 640,
      heightPx: 480,
      delegate: 'GPU',
      warned: false,
      atMs: 1_700_000_000_000,
    };
    await page.addInitScript((record) => {
      localStorage.setItem('wiggle.device-check.v1', JSON.stringify(record));
    }, seeded);

    await page.goto('/');
    const chip = page.getByTestId('camera-chip');
    await expect(chip).toContainText('Tracking', { timeout: 45_000 });

    const raw = await page.evaluate(() => localStorage.getItem('wiggle.device-check.v1'));
    expect((JSON.parse(raw ?? '{}') as { atMs: number }).atMs).toBe(seeded.atMs);
  });
});

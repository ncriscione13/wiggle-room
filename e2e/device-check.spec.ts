import { expect, test } from '@playwright/test';

// M0.6: first run benchmarks tracking and stores the result; later runs skip
// it. On a slow CI box the full slow-machine path may legitimately run: the
// delegate phase (bench the other delegate, maybe revert, with a worker
// re-init each swap) plus the 3-pass reduction ladder -- so timeouts are
// generous.

test.describe('device check (M0.6)', () => {
  test('first run performs the check and stores a record', async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto('/');
    const chip = page.getByTestId('camera-chip');
    await expect(chip).toContainText('Device check', { timeout: 45_000 });
    await expect(chip).toContainText('Tracking', { timeout: 180_000 });

    const raw = await page.evaluate(() => localStorage.getItem('wiggle.device-check.v1'));
    expect(raw).toBeTruthy();
    const record = JSON.parse(raw ?? '{}') as {
      avgMs: number;
      widthPx: number;
      posesSeen: number;
      atMs: number;
    };
    expect(record.avgMs).toBeGreaterThan(0);
    expect(record.widthPx).toBeGreaterThan(0);
    expect(record.posesSeen).toBeGreaterThanOrEqual(0); // validity marker (review fix)
  });

  test('a stored record skips the check entirely', async ({ page }) => {
    const seeded = {
      avgMs: 11.5,
      p99Ms: 16.2,
      widthPx: 640,
      heightPx: 480,
      delegate: 'GPU',
      posesSeen: 2,
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

  test('?recheck=1 forgets the stored record and re-runs the check (tuning hook)', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const seeded = {
      avgMs: 11.5,
      p99Ms: 16.2,
      widthPx: 640,
      heightPx: 480,
      delegate: 'GPU',
      posesSeen: 2,
      warned: false,
      atMs: 1_700_000_000_000,
    };
    await page.addInitScript((record) => {
      localStorage.setItem('wiggle.device-check.v1', JSON.stringify(record));
    }, seeded);

    await page.goto('/?recheck=1');
    const chip = page.getByTestId('camera-chip');
    await expect(chip).toContainText('Device check', { timeout: 45_000 });
    await expect(chip).toContainText('Tracking', { timeout: 180_000 });

    const raw = await page.evaluate(() => localStorage.getItem('wiggle.device-check.v1'));
    // The seeded record must be GONE either way. Normally a fresh record
    // stands in its place; on a starved box the re-run bench can legitimately
    // abort, and then nothing is saved (the next boot re-checks).
    if (raw !== null && raw !== '') {
      expect((JSON.parse(raw) as { atMs: number }).atMs).not.toBe(seeded.atMs);
    } else {
      expect(raw).toBe(''); // cleared by ?recheck=1, bench aborted: not saved
    }
  });
});

import { expect, test } from '@playwright/test';

// Perf measurements (the `perf` Playwright project: runs after the functional
// suite, serially -- fullyParallel is off for this project because two fps
// measurements running side by side starve each other and both lie).
//
// Trace retained on failure is the evidence trail when a number dips.

const measureFps = (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = (): void => {
          frames += 1;
          const elapsed = performance.now() - t0;
          if (elapsed >= 2000) resolve((frames * 1000) / elapsed);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );

// M0.3 acceptance: replay the two-kid clip at 2x speed; drawing holds 60 fps.
test('drawing holds 60 fps while the two-kid clip replays at 2x', async ({ page }) => {
  await page.goto('/?clip=two-kids-10min&speed=2');
  await expect(page.getByTestId('replay-badge')).toHaveAttribute('data-state', 'ready', {
    timeout: 30000,
  });
  await expect(page.getByTestId('pose-stage').locator('canvas')).toBeVisible();
  await page.waitForTimeout(800); // let the render loop settle

  expect(await measureFps(page)).toBeGreaterThan(55);
});

// M0.9 acceptance: rendering holds 60 fps WHILE live tracking runs -- the
// point of moving inference into the worker. A seeded device-check record
// skips the ladder so this measures steady-state play, not benchmarking.
test('rendering holds 60 fps while live tracking runs in the worker', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'wiggle.device-check.v1',
      JSON.stringify({
        avgMs: 10,
        p99Ms: 14,
        widthPx: 640,
        heightPx: 480,
        delegate: 'GPU',
        posesSeen: 2,
        warned: false,
        atMs: 1,
      }),
    );
  });
  await page.goto('/');
  const chip = page.getByTestId('camera-chip');
  await expect(chip).toContainText('Tracking', { timeout: 90_000 });
  await expect(chip).toContainText('worker(');
  await page.waitForTimeout(800); // let the loops settle

  // Guard against a vacuous pass (M0.9 review): 60 fps over a STALLED
  // pipeline proves nothing, so frames must flow across the measurement.
  const frameCount = async (): Promise<number> =>
    Number(/(\d+) frames/.exec((await chip.textContent()) ?? '')?.[1] ?? '0');
  const framesBefore = await frameCount();

  expect(await measureFps(page)).toBeGreaterThan(55);

  await expect.poll(frameCount, { timeout: 10_000 }).toBeGreaterThan(framesBefore + 10);
});

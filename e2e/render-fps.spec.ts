import { expect, test } from '@playwright/test';

// M0.3 acceptance: replay the two-kid clip at 2x speed and drawing still
// holds 60 fps. The fps is measured with an independent rAF counter; the
// Playwright trace (retained on failure) is the evidence trail when it dips.

test('drawing holds 60 fps while the two-kid clip replays at 2x', async ({ page }) => {
  await page.goto('/?clip=two-kids-10min&speed=2');
  await expect(page.getByTestId('replay-badge')).toHaveAttribute('data-state', 'ready', {
    timeout: 30000,
  });
  await expect(page.getByTestId('pose-stage').locator('canvas')).toBeVisible();
  await page.waitForTimeout(800); // let the render loop settle

  const fps = await page.evaluate(
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
  expect(fps).toBeGreaterThan(55);
});

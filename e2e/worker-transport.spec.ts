import { expect, test } from '@playwright/test';

// M0.9 review fix: the bitmap fallback transport was shipping with zero
// coverage anywhere (CI always takes the track path). ?transport=bitmap pins
// it, so BOTH transports are exercised: the track path in live-tracking.spec,
// the bitmap path here.

test('the bitmap fallback transport tracks frames end to end', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'wiggle.device-check.v1',
      JSON.stringify({
        avgMs: 10,
        p99Ms: 14,
        widthPx: 640,
        heightPx: 480,
        delegate: 'CPU',
        posesSeen: 2,
        warned: false,
        atMs: 1,
      }),
    );
  });
  await page.goto('/?transport=bitmap');
  const chip = page.getByTestId('camera-chip');
  await expect(chip).toContainText('Tracking', { timeout: 90_000 });
  await expect(chip).toContainText('worker(bitmap)');

  const count = async (): Promise<number> => {
    const text = (await chip.textContent()) ?? '';
    return Number(/(\d+) frames/.exec(text)?.[1] ?? '0');
  };
  await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(0);
  const before = await count();
  await expect.poll(count, { timeout: 15_000 }).toBeGreaterThan(before);
});

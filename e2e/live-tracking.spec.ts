import { expect, test } from '@playwright/test';

// M0.2: the live pipeline -- camera, local wasm + model, MediaPipe VIDEO
// mode, one detectForVideo per video frame. The fake camera shows a test
// pattern (no human), so this proves the pipeline runs and processes frames,
// not detection quality; the real two-kid numbers come from Nick's device
// check (M0.6).

test('live tracking starts from local assets and processes frames', async ({ page }) => {
  test.setTimeout(120_000); // the first-run device check (M0.6) may walk the ladder on CI
  await page.goto('/');
  const chip = page.getByTestId('camera-chip');
  // Wasm + model load from this origin; the first-run device check (possibly
  // walking the reduction ladder on a slow runner) happens before "Tracking".
  await expect(chip).toContainText('Tracking', { timeout: 90000 });
  // M0.9: inference must run in the worker with a NAMED transport -- 'worker('
  // catches both a silent fall-back-to-main and an unlabeled transport.
  await expect(chip).toContainText('worker(');

  const count = async (): Promise<number> => {
    const text = (await chip.textContent()) ?? '';
    return Number(/(\d+) frames/.exec(text)?.[1] ?? '0');
  };
  await expect.poll(count, { timeout: 10000 }).toBeGreaterThan(0);
  const before = await count();
  await expect.poll(count, { timeout: 10000 }).toBeGreaterThan(before);
});

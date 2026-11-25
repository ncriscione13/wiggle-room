import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { validateClipFile, type ClipFile } from '../src/tracking/clip-format';

// M0.5: R records landmarks to a downloadable clip JSON (never video);
// dropping a clip JSON onto the page replays it. Both behind ?debug=1.

test('R starts and stops a recording that downloads a valid clip', async ({ page }) => {
  await page.goto('/?clip=jumps-x5&debug=1');
  await expect(page.getByTestId('replay-badge')).toHaveAttribute('data-state', 'ready', {
    timeout: 30000,
  });

  await page.keyboard.press('r');
  const chip = page.getByTestId('recorder-chip');
  await expect(chip).toContainText('REC');
  // Poll the live frame counter instead of sleeping: under parallel-suite CPU
  // load a fixed wait records too few frames.
  await expect
    .poll(async () => Number(/(\d+) frames/.exec((await chip.textContent()) ?? '')?.[1] ?? '0'), {
      timeout: 30000,
    })
    .toBeGreaterThan(15);

  const downloadPromise = page.waitForEvent('download');
  await page.keyboard.press('r');
  const download = await downloadPromise;
  // The "Saved" chip self-dismisses after a few seconds, so check it before
  // the slower file reads below.
  await expect(chip).toContainText('Saved');
  expect(download.suggestedFilename()).toMatch(/^recording-\d{8}-\d{6}\.json$/);

  const path = await download.path();
  const clip = JSON.parse(readFileSync(path, 'utf8')) as ClipFile;
  expect(validateClipFile(clip)).toEqual([]);
  expect(clip.kind).toBe('recorded');
  expect(clip.frames.length).toBeGreaterThan(10);
});

test('dropping a clip JSON replays it on the stage', async ({ page }) => {
  await page.goto('/?clip=still-30s&debug=1');
  await expect(page.getByTestId('replay-badge')).toHaveAttribute('data-state', 'ready', {
    timeout: 30000,
  });

  const pose = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]);
  const dropped = {
    version: 1,
    name: 'dropped-mini',
    kind: 'recorded',
    nominalFps: 30,
    frames: Array.from({ length: 60 }, (_, i) => ({ tS: i / 30, poses: [pose] })),
  };

  await page.evaluate((json) => {
    const dt = new DataTransfer();
    dt.items.add(new File([json], 'dropped-mini.json', { type: 'application/json' }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, JSON.stringify(dropped));

  await expect(page.getByTestId('replay-badge')).toContainText('dropped-mini', { timeout: 10000 });
  await expect(page.getByTestId('pose-stage').locator('canvas')).toBeVisible();
});

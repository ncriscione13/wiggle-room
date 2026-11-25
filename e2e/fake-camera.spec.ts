import { expect, test } from '@playwright/test';

// Task 0.7: the harness launches Chrome with a fake camera, so camera-driven
// tests run headless on any machine with no permission prompts.

test('the fake camera hands over a video stream with no permission UI', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    const track = stream.getVideoTracks()[0];
    const label = track?.label ?? '';
    for (const t of stream.getTracks()) t.stop();
    return { hasTrack: track !== undefined, label };
  });
  expect(result.hasTrack).toBe(true);
  expect(result.label.toLowerCase()).toContain('fake');
});

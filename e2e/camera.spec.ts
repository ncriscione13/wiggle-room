import { expect, test } from '@playwright/test';

// M0.1: camera happy path (fake camera) and the three friendly failure
// screens, forced by stubbing getUserMedia before the app loads.

test('camera mode opens the fake camera and reports the actual resolution', async ({ page }) => {
  await page.goto('/');
  const chip = page.getByTestId('camera-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('640');
  await expect(chip).toContainText('fps');
});

for (const [name, kind, textProbe] of [
  ['NotAllowedError', 'denied', 'allow the camera'],
  ['NotFoundError', 'not-found', 'Plug in a webcam'],
  ['NotReadableError', 'busy', 'using the camera'],
] as const) {
  test(`shows the friendly ${kind} screen when getUserMedia throws ${name}`, async ({ page }) => {
    await page.addInitScript((errorName) => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('forced by test', errorName));
    }, name);
    await page.goto('/');
    const screen = page.getByTestId('camera-error');
    await expect(screen).toBeVisible();
    await expect(screen).toHaveAttribute('data-kind', kind);
    await expect(screen).toContainText(textProbe);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
}

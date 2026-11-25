import { expect, test } from '@playwright/test';
import { colors } from '../src/ui/theme';

// Review fix (Phase 0): the built PWA manifest must carry the comfort palette.
// vite-plugin-pwa's defaults are a pure-white background_color (the installed
// app's splash screen) and a green theme_color; both are forbidden here.

test('the built PWA manifest uses theme colors, not plugin defaults', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();
  const manifest = (await response.json()) as {
    name?: string;
    display?: string;
    background_color?: string;
    theme_color?: string;
  };
  expect(manifest.name).toBe('Wiggle Room');
  expect(manifest.display).toBe('fullscreen');
  expect(manifest.background_color).toBe(colors.surfaceNight);
  expect(manifest.theme_color).toBe(colors.surfaceNight);
});

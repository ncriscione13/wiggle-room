import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests run against the production build (`vite preview`), so
// `npm run e2e` expects `npm run build` to have run first -- `npm run check`
// guarantees that order. Task 0.7 adds the fake-camera harness.
const PORT = '4173';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: {
      // Task 0.7: every camera-driven test runs against Chrome's fake camera,
      // with permission prompts auto-accepted.
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});

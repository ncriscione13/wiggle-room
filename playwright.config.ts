import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests run against the production build (`vite preview`), so
// `npm run e2e` expects `npm run build` to have run first -- `npm run check`
// guarantees that order. Task 0.7 adds the fake-camera harness.
const PORT = '4173';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // The suite runs several MediaPipe-wasm browsers in parallel; under that CPU
  // contention the default 30 s per-test budget is too tight.
  timeout: 120_000,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Every fresh context used to install the PWA service worker and precache
    // ~27 MB DURING the test -- on CI's 2 cores that stole enough CPU to fail
    // the 60 fps guards as the clip library grew (playtest round 4). Nothing
    // in the suite tests the SW itself (the manifest spec reads built files),
    // so tests run without it; offline behavior stays a manual TV check.
    serviceWorkers: 'block',
    launchOptions: {
      // Task 0.7: every camera-driven test runs against Chrome's fake camera,
      // with permission prompts auto-accepted.
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /render-fps/ },
    {
      // Perf measurements run AFTER the functional suite, and serially among
      // themselves: sharing the machine with ANY parallel browser (incl. each
      // other) skews fps numbers badly (46 fps under contention vs 60 solo).
      name: 'perf',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['chromium'],
      testMatch: /render-fps/,
      fullyParallel: false,
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 30_000,
  },
});

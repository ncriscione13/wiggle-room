import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// base: '/' locally; CI sets BASE_PATH=/wiggle-room/ for GitHub Pages (task 0.8).
export default defineConfig(({ mode }) => ({
  base: process.env['BASE_PATH'] ?? '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'tools/**/*.test.ts'],
  },
  // Vitest runs with mode "test"; the PWA/SSL plugins have no business in unit tests.
  plugins:
    mode === 'test'
      ? []
      : [
          // The camera API needs a secure context. localhost counts as secure, so plain
          // `npm run dev` works at a desk; `npm run dev:lan` (mode "lan") adds HTTPS so
          // the TV computer can reach the dev server over the LAN.
          ...(mode === 'lan' ? [basicSsl()] : []),
          VitePWA({
            registerType: 'autoUpdate',
            manifest: {
              name: 'Wiggle Room',
              short_name: 'Wiggle Room',
              description:
                'Webcam motion games for kids, on your TV. Offline, no accounts, no ads.',
              display: 'fullscreen',
              orientation: 'landscape',
              icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
            },
            workbox: {
              // Precache everything the app needs offline, including the pose model
              // (~5.5 MB .task) and the MediaPipe wasm, so first visit = installed.
              globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,wasm,task,json,mp3,ogg,woff2}'],
              maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
            },
          }),
        ],
  server: {
    host: mode === 'lan' ? true : 'localhost',
  },
}));

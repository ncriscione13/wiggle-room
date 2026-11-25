import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import type { Connect, Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Dev/preview-only middleware (task 0.7): serves /clips/<name>.json from
 * test/clips/{real,synthetic} so `?source=replay&clip=<name>` works locally
 * and in e2e. Nothing is added to the production build -- clips are test
 * data, not shipped assets.
 */
function serveTestClips(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const match = /\/clips\/([a-z0-9][a-z0-9-]*)\.json(?:\?.*)?$/.exec(req.url ?? '');
    const name = match?.[1];
    if (name === undefined) {
      next();
      return;
    }
    void (async () => {
      for (const dir of ['real', 'synthetic']) {
        try {
          const data = await readFile(join('test', 'clips', dir, `${name}.json`));
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(data);
          return;
        } catch {
          // not in this dir; try the next
        }
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: `no clip named "${name}"` }));
    })();
  };
  return {
    name: 'wiggle:serve-test-clips',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

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
          serveTestClips(),
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
              // (~5.5 MB .task) and the MediaPipe wasm (two ~14.7 MB .wasm files),
              // so first visit = fully installed. ~35 MB once, on purpose.
              globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,wasm,task,json,mp3,ogg,woff2}'],
              maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
            },
          }),
        ],
  server: {
    host: mode === 'lan' ? true : 'localhost',
  },
}));

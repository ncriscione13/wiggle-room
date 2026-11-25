import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { copyMediapipeWasm } from './copy-mediapipe-wasm';

// Task 0.5: postinstall copies the MediaPipe wasm runtime into public/mediapipe
// so the app never loads it from a CDN. This runs the real copy into a temp dir.

let tempDest = '';

afterAll(async () => {
  if (tempDest !== '') await rm(tempDest, { recursive: true, force: true });
});

describe('copy-mediapipe-wasm (task 0.5)', () => {
  it('copies the wasm runtime files (.js + .wasm) out of node_modules', async () => {
    tempDest = await mkdtemp(join(tmpdir(), 'wiggle-wasm-'));
    const copied = await copyMediapipeWasm(tempDest);

    expect(copied.length).toBeGreaterThanOrEqual(2);
    expect(copied.some((f) => f.endsWith('.wasm'))).toBe(true);
    expect(copied.some((f) => f.endsWith('.js'))).toBe(true);

    const landed = await readdir(tempDest);
    expect(landed.sort()).toEqual([...copied].sort());
    for (const file of landed) {
      const info = await stat(join(tempDest, file));
      expect(info.size, `${file} is empty`).toBeGreaterThan(0);
    }
  });
});

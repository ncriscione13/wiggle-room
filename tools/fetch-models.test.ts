import { describe, expect, it } from 'vitest';
import { MODEL_DEST, MODEL_MIN_BYTES, MODEL_URL, validateModelBuffer } from './fetch-models';

// Task 0.5: npm run fetch-models downloads the pose model once, into
// public/models/. The download itself runs for real in CI; these tests cover
// the pieces that must not silently rot.

describe('fetch-models (task 0.5)', () => {
  it('downloads over https from the documented MediaPipe bucket', () => {
    expect(MODEL_URL).toMatch(/^https:\/\//);
    expect(MODEL_URL).toContain('pose_landmarker_lite');
    expect(MODEL_URL).toMatch(/\.task$/);
  });

  it('lands in public/models/ under the exact name the app loads', () => {
    expect(MODEL_DEST.replaceAll('\\', '/')).toBe('public/models/pose_landmarker_lite.task');
  });

  it('rejects a too-small download', () => {
    const tiny = new Uint8Array(1024);
    tiny.set([0x50, 0x4b]);
    expect(validateModelBuffer(tiny)).toMatch(/small/i);
  });

  it('rejects a buffer that is not a .task (zip) container', () => {
    const notZip = new Uint8Array(MODEL_MIN_BYTES + 1);
    notZip.set([0x3c, 0x68]); // "<h" -- e.g. an HTML error page
    expect(validateModelBuffer(notZip)).toMatch(/task|zip/i);
  });

  it('accepts a plausible model buffer', () => {
    const ok = new Uint8Array(MODEL_MIN_BYTES + 1);
    ok.set([0x50, 0x4b, 0x03, 0x04]); // zip magic
    expect(validateModelBuffer(ok)).toBeNull();
  });

  it('accepts the real-world layout: a short prefix before the zip magic', () => {
    const prefixed = new Uint8Array(MODEL_MIN_BYTES + 1);
    prefixed.set([0x00, 0x00, 0x50, 0x4b, 0x03, 0x04]); // observed in the live file
    expect(validateModelBuffer(prefixed)).toBeNull();
  });
});

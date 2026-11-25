import { describe, expect, it } from 'vitest';
import { assetUrl, mediapipeWasmRoot, poseModelUrl } from './paths';

// Task 0.5: the app loads models and wasm only from its own origin. These
// helpers are the single place asset URLs come from, BASE_URL-aware so the
// same build works at '/' (dev) and '/wiggle-room/' (GitHub Pages).

describe('asset paths (task 0.5)', () => {
  it('poseModelUrl points at the local copy fetch-models creates', () => {
    expect(poseModelUrl()).toBe('/models/pose_landmarker_lite.task');
  });

  it('mediapipeWasmRoot points at the postinstall copy', () => {
    expect(mediapipeWasmRoot()).toBe('/mediapipe');
  });

  it('assetUrl respects a GitHub Pages style base', () => {
    expect(assetUrl('models/pose_landmarker_lite.task', '/wiggle-room/')).toBe(
      '/wiggle-room/models/pose_landmarker_lite.task',
    );
    expect(assetUrl('/mediapipe', '/wiggle-room/')).toBe('/wiggle-room/mediapipe');
  });

  it('never produces a protocol-relative or absolute remote URL', () => {
    for (const url of [poseModelUrl(), mediapipeWasmRoot()]) {
      expect(url.startsWith('/')).toBe(true);
      expect(url.startsWith('//')).toBe(false);
      expect(url).not.toMatch(/^https?:/);
    }
  });
});

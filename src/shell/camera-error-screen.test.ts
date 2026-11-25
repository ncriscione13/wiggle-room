import { describe, expect, it } from 'vitest';
import { CAMERA_ERROR_COPY } from './camera-error-screen';
import type { CameraErrorKind } from '../tracking/camera';

// M0.1: friendly screens for camera problems. The copy is data, tested here;
// the rendering is proven in e2e/camera.spec.ts.

const KINDS: CameraErrorKind[] = ['denied', 'not-found', 'busy', 'insecure', 'unknown'];

describe('camera error copy (M0.1)', () => {
  it('covers every error kind with a title and a fix hint', () => {
    for (const kind of KINDS) {
      const copy = CAMERA_ERROR_COPY[kind];
      expect(copy.title.length, kind).toBeGreaterThan(5);
      expect(copy.hint.length, kind).toBeGreaterThan(10);
    }
  });

  it('stays friendly: no scary words, always a way forward', () => {
    for (const kind of KINDS) {
      const text = `${CAMERA_ERROR_COPY[kind].title} ${CAMERA_ERROR_COPY[kind].hint}`;
      expect(text.toLowerCase()).not.toContain('error');
      expect(text.toLowerCase()).not.toContain('fail');
      expect(text.toLowerCase()).toContain('try again');
    }
  });
});

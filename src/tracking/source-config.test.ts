import { describe, expect, it } from 'vitest';
import { sourceConfigFromUrl } from './source-config';

// Task 0.7: `?source=replay&clip=<name>` feeds a clip instead of the camera.

describe('sourceConfigFromUrl (task 0.7)', () => {
  it('defaults to the live camera', () => {
    expect(sourceConfigFromUrl('')).toEqual({ source: 'camera' });
    expect(sourceConfigFromUrl('?foo=bar')).toEqual({ source: 'camera' });
  });

  it('parses replay mode with a clip name', () => {
    expect(sourceConfigFromUrl('?source=replay&clip=still-30s')).toEqual({
      source: 'replay',
      clip: 'still-30s',
    });
  });

  it('also accepts the ?clip= shorthand (PLAN M0.5)', () => {
    expect(sourceConfigFromUrl('?clip=jumps-x5')).toEqual({
      source: 'replay',
      clip: 'jumps-x5',
    });
  });

  it('falls back to camera when replay is asked for without a clip', () => {
    expect(sourceConfigFromUrl('?source=replay')).toEqual({ source: 'camera' });
  });

  it('rejects clip names that are not simple slugs (no paths, no dots)', () => {
    for (const bad of ['../secrets', 'a/b', 'name.json', 'UPPER', 'sp ace', '']) {
      expect(sourceConfigFromUrl(`?source=replay&clip=${encodeURIComponent(bad)}`)).toEqual({
        source: 'camera',
      });
    }
  });
});

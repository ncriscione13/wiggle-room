import { describe, expect, it } from 'vitest';
import { sourceConfigFromUrl } from './source-config';

// Task 0.7 + M0.2: `?source=replay&clip=<name>` feeds a clip instead of the
// camera; `&speed=` scales playback (the M0.3 render stress mode).

describe('sourceConfigFromUrl', () => {
  it('defaults to the live camera', () => {
    expect(sourceConfigFromUrl('')).toEqual({ source: 'camera' });
    expect(sourceConfigFromUrl('?foo=bar')).toEqual({ source: 'camera' });
  });

  it('parses replay mode with a clip name (speed defaults to 1)', () => {
    expect(sourceConfigFromUrl('?source=replay&clip=still-30s')).toEqual({
      source: 'replay',
      clip: 'still-30s',
      speed: 1,
    });
  });

  it('also accepts the ?clip= shorthand (PLAN M0.5)', () => {
    expect(sourceConfigFromUrl('?clip=jumps-x5')).toEqual({
      source: 'replay',
      clip: 'jumps-x5',
      speed: 1,
    });
  });

  it('parses and clamps speed to 0.25..4', () => {
    expect(sourceConfigFromUrl('?clip=jumps-x5&speed=2')).toEqual({
      source: 'replay',
      clip: 'jumps-x5',
      speed: 2,
    });
    expect(sourceConfigFromUrl('?clip=jumps-x5&speed=99')).toMatchObject({ speed: 4 });
    expect(sourceConfigFromUrl('?clip=jumps-x5&speed=0.01')).toMatchObject({ speed: 0.25 });
    expect(sourceConfigFromUrl('?clip=jumps-x5&speed=nope')).toMatchObject({ speed: 1 });
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

import { describe, expect, it } from 'vitest';
import { validateClipFile, type ClipPose } from '../tracking/clip-format';
import type { PoseFrame } from '../tracking/pose-source';
import { buildClipFromFrames, isRecorderEnabled, parseDroppedClip } from './recorder';

// M0.5: the pose recorder saves landmarks + timestamps as JSON -- never video.

const pose = (): ClipPose => Array.from({ length: 33 }, () => [0.4, 0.6, 0, 0.95]);

const frame = (tS: number, frameIntervalS = 1 / 30): PoseFrame => ({
  tS,
  poses: [pose(), null],
  inferenceS: 0.012,
  frameIntervalS,
});

describe('buildClipFromFrames (M0.5)', () => {
  it('builds a valid recorded clip, timestamps rebased to 0', () => {
    const clip = buildClipFromFrames('my-rec', [frame(5.0), frame(5.033), frame(5.067)]);
    expect(clip.kind).toBe('recorded');
    expect(clip.name).toBe('my-rec');
    expect(validateClipFile(clip)).toEqual([]);
    expect(clip.frames[0]?.tS).toBe(0);
    expect(clip.frames[2]?.tS).toBeCloseTo(0.067, 6);
  });

  it('estimates nominalFps from the median frame interval', () => {
    const frames = Array.from({ length: 31 }, (_, i) => frame(i / 30));
    expect(buildClipFromFrames('r', frames).nominalFps).toBe(30);
    const sixty = Array.from({ length: 61 }, (_, i) => frame(i / 60, 1 / 60));
    expect(buildClipFromFrames('r', sixty).nominalFps).toBe(60);
  });

  it('keeps only landmark data (poses + timestamps), never anything video-like', () => {
    const clip = buildClipFromFrames('r', [frame(0), frame(0.033)]);
    const keys = Object.keys(clip).sort();
    expect(keys).toEqual(['frames', 'kind', 'name', 'nominalFps', 'version']);
    expect(Object.keys(clip.frames[0] ?? {}).sort()).toEqual(['poses', 'tS']);
  });

  it('refuses an empty recording', () => {
    expect(() => buildClipFromFrames('r', [])).toThrow(/empty/i);
  });
});

describe('isRecorderEnabled (M0.5, dev only)', () => {
  it('is on in dev builds, off in production builds', () => {
    expect(isRecorderEnabled('', true)).toBe(true);
    expect(isRecorderEnabled('', false)).toBe(false);
  });

  it('?debug=1 turns it on even in production builds (TV testing)', () => {
    expect(isRecorderEnabled('?debug=1', false)).toBe(true);
    expect(isRecorderEnabled('?clip=x&debug=1', false)).toBe(true);
  });
});

describe('parseDroppedClip (M0.5)', () => {
  it('parses and validates a dropped clip file', async () => {
    const clip = buildClipFromFrames('dropped', [frame(0), frame(0.033)]);
    const file = new File([JSON.stringify(clip)], 'dropped.json', { type: 'application/json' });
    const parsed = await parseDroppedClip(file);
    expect(parsed.name).toBe('dropped');
    expect(parsed.frames).toHaveLength(2);
  });

  it('rejects non-JSON and non-clip files with clear errors', async () => {
    await expect(parseDroppedClip(new File(['not json'], 'x.json'))).rejects.toThrow(/json/i);
    await expect(parseDroppedClip(new File(['{"a":1}'], 'x.json'))).rejects.toThrow(/clip/i);
  });
});

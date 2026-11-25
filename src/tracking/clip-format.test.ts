import { describe, expect, it } from 'vitest';
import {
  LANDMARK_COUNT,
  POSE,
  POSE_CONNECTIONS,
  validateClipFile,
  type ClipFile,
} from './clip-format';

// M0.3 (+ hardening): skeleton topology sanity and validator edge paths.

function validClip(): ClipFile {
  const pose = Array.from({ length: LANDMARK_COUNT }, (): [number, number, number, number] => [
    0.5, 0.5, 0, 1,
  ]);
  return {
    version: 1,
    name: 'ok',
    kind: 'recorded',
    nominalFps: 30,
    frames: [
      { tS: 0, poses: [pose] },
      { tS: 0.033, poses: [pose, null] },
    ],
  };
}

describe('POSE_CONNECTIONS (M0.3)', () => {
  it('uses only valid landmark indices and no self-loops', () => {
    for (const [a, b] of POSE_CONNECTIONS) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(LANDMARK_COUNT);
      expect(b).toBeLessThan(LANDMARK_COUNT);
      expect(a).not.toBe(b);
    }
  });

  it('is left/right symmetric', () => {
    const names = Object.entries(POSE) as [string, number][];
    const nameOf = (idx: number): string => names.find(([, i]) => i === idx)?.[0] ?? '?';
    const mirrored = POSE_CONNECTIONS.map(([a, b]) =>
      [nameOf(a), nameOf(b)]
        .map((n) => (n.startsWith('left') ? `right${n.slice(4)}` : n.replace(/^right/, 'left')))
        .sort()
        .join('-'),
    );
    const plain = POSE_CONNECTIONS.map(([a, b]) => [nameOf(a), nameOf(b)].sort().join('-'));
    expect([...mirrored].sort()).toEqual([...plain].sort());
  });
});

describe('validateClipFile edge paths', () => {
  it('accepts a well-formed clip', () => {
    expect(validateClipFile(validClip())).toEqual([]);
  });

  it('flags an unknown version', () => {
    const clip = { ...validClip(), version: 99 as unknown as 1 };
    expect(validateClipFile(clip).join(' ')).toMatch(/version/);
  });

  it('flags non-increasing timestamps', () => {
    const clip = validClip();
    const second = clip.frames[1];
    if (second) second.tS = 0;
    expect(validateClipFile(clip).join(' ')).toMatch(/increasing/);
  });

  it('flags a pose with the wrong landmark count', () => {
    const clip = validClip();
    clip.frames[0]?.poses[0]?.pop();
    expect(validateClipFile(clip).join(' ')).toMatch(/landmarks/);
  });

  it('flags out-of-bounds coordinates and visibility', () => {
    const clip = validClip();
    const lm = clip.frames[0]?.poses[0]?.[0];
    if (lm) lm[0] = 5;
    expect(validateClipFile(clip).join(' ')).toMatch(/bounds/);
  });

  it('flags an empty clip', () => {
    const clip = { ...validClip(), frames: [] };
    expect(validateClipFile(clip).join(' ')).toMatch(/frames/);
  });

  it('treats every field as untrusted JSON (review fix)', () => {
    const noName = { ...validClip(), name: undefined as unknown as string };
    expect(validateClipFile(noName).join(' ')).toMatch(/name/);

    const badKind = { ...validClip(), kind: 'video' as unknown as 'recorded' };
    expect(validateClipFile(badKind).join(' ')).toMatch(/kind/);

    const noFrames = { ...validClip(), frames: undefined as unknown as [] };
    expect(validateClipFile(noFrames).join(' ')).toMatch(/frames/);

    const badFrame = validClip();
    badFrame.frames[1] = { tS: 1 } as unknown as (typeof badFrame.frames)[number];
    expect(validateClipFile(badFrame).join(' ')).toMatch(/poses/);
  });
});

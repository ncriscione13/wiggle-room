import { describe, expect, it } from 'vitest';
import { convertPoseResult, MonotonicClock } from './live-pose-source';

// M0.2: the pure pieces of the live pipeline. The rVFC/MediaPipe loop itself
// is proven in e2e/live-tracking.spec.ts against the fake camera.

const lm = (x: number, visibility?: number) =>
  visibility === undefined ? { x, y: 0.5, z: 0 } : { x, y: 0.5, z: 0, visibility };

describe('convertPoseResult (M0.2)', () => {
  it('maps detected poses into fixed slots, null-padding the rest', () => {
    const poses = convertPoseResult({
      landmarks: [Array.from({ length: 33 }, () => lm(0.3, 0.9))],
    });
    expect(poses).toHaveLength(2);
    expect(poses[0]).toHaveLength(33);
    expect(poses[0]?.[0]).toEqual([0.3, 0.5, 0, 0.9]);
    expect(poses[1]).toBeNull();
  });

  it('keeps two poses in detection order (circle binding arrives in M1.2)', () => {
    const poses = convertPoseResult({
      landmarks: [
        Array.from({ length: 33 }, () => lm(0.2, 1)),
        Array.from({ length: 33 }, () => lm(0.8, 1)),
      ],
    });
    expect(poses[0]?.[0]?.[0]).toBe(0.2);
    expect(poses[1]?.[0]?.[0]).toBe(0.8);
  });

  it('truncates anything beyond the slot count', () => {
    const three = Array.from({ length: 3 }, (_, i) =>
      Array.from({ length: 33 }, () => lm(0.1 * (i + 1), 1)),
    );
    expect(convertPoseResult({ landmarks: three })).toHaveLength(2);
  });

  it('defaults missing visibility to 1 (absent field is not "invisible")', () => {
    const poses = convertPoseResult({ landmarks: [Array.from({ length: 33 }, () => lm(0.5))] });
    expect(poses[0]?.[0]?.[3]).toBe(1);
  });

  it('returns all-null slots when nothing is detected', () => {
    expect(convertPoseResult({ landmarks: [] })).toEqual([null, null]);
  });
});

describe('MonotonicClock (M0.2)', () => {
  it('passes through already-increasing timestamps', () => {
    const clock = new MonotonicClock();
    expect(clock.next(100)).toBe(100);
    expect(clock.next(116.7)).toBe(116.7);
  });

  it('bumps equal or backwards timestamps so MediaPipe never sees a repeat', () => {
    const clock = new MonotonicClock();
    clock.next(100);
    expect(clock.next(100)).toBeGreaterThan(100);
    expect(clock.next(50)).toBeGreaterThan(100);
  });

  it('stays strictly increasing over a jittery sequence', () => {
    const clock = new MonotonicClock();
    let prev = -Infinity;
    for (const t of [10, 10, 9, 26, 26, 25, 43]) {
      const out = clock.next(t);
      expect(out).toBeGreaterThan(prev);
      prev = out;
    }
  });
});

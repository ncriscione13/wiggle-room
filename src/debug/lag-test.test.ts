import { describe, expect, it } from 'vitest';
import { POSE, type ClipPose } from '../tracking/clip-format';
import type { PoseFrame } from '../tracking/pose-source';
import { formatCounterMs, pickRightWrist } from './lag-test';

// M0.7: the lag test screen -- a big marker follows the right wrist and an
// on-screen ms counter gives slow-motion phone videos a timestamp to read.

function frameWith(wrist: [number, number, number, number] | null): PoseFrame {
  const pose: ClipPose | null =
    wrist === null
      ? null
      : Array.from({ length: 33 }, (_, i) => (i === POSE.rightWrist ? wrist : [0.5, 0.5, 0, 1]));
  return { tS: 1, poses: [pose], inferenceS: 0.01, frameIntervalS: 0.033 };
}

describe('pickRightWrist (M0.7)', () => {
  it('returns the right wrist of the first visible pose', () => {
    const got = pickRightWrist(frameWith([0.3, 0.4, 0, 0.9]));
    expect(got).toEqual({ x: 0.3, y: 0.4 });
  });

  it('returns null when the wrist is below the visibility gate', () => {
    expect(pickRightWrist(frameWith([0.3, 0.4, 0, 0.2]))).toBeNull();
  });

  it('returns null when no pose is present', () => {
    expect(pickRightWrist(frameWith(null))).toBeNull();
    expect(pickRightWrist(null)).toBeNull();
  });
});

describe('formatCounterMs (M0.7)', () => {
  it('renders whole milliseconds, padded for steady video reading', () => {
    expect(formatCounterMs(0)).toBe('000000 ms');
    expect(formatCounterMs(1234.6)).toBe('001235 ms');
    expect(formatCounterMs(987654)).toBe('987654 ms');
  });
});

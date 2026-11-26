import { describe, expect, it } from 'vitest';
import { loadClip } from '../helpers/clip-runner';
import type { ClipPose } from '../../src/tracking/clip-format';
import { WARMUP_DEFAULT_CALIBRATION_TABLE } from '../../src/motion/config';
import { preparePose, type PreparedPose } from '../../src/motion/frame-prep';
import {
  measureArmSpan,
  measureHops,
  measureReach,
  measureSquatDepth,
  measureStanding,
  measureStatueWobble,
  measureStepRate,
  warmupPlanNext,
  type MeasuredFrame,
  type WarmupPlanState,
} from '../../src/motion/warmup';

// M1.5: each warm-up move's measurement, checked against the synthetic clips'
// known geometry within tolerance (PLAN), plus the 2-tries -> slow demo ->
// age-default plan as a pure reducer.

function framesOf(clipName: string, fromS = 0, toS = Infinity, slot: 0 | 1 = 0): MeasuredFrame[] {
  const clip = loadClip(clipName);
  const out: MeasuredFrame[] = [];
  let prev: PreparedPose | null = null;
  for (const frame of clip.frames) {
    if (frame.tS < fromS || frame.tS > toS) continue;
    const pose: ClipPose | null = frame.poses[slot] ?? null;
    if (pose === null) continue;
    const prepared = preparePose(pose, prev);
    if (prepared === null) continue;
    prev = prepared;
    out.push({ tS: frame.tS, pose: prepared });
  }
  return out;
}

describe('warm-up measurements vs synthetic clips (M1.5)', () => {
  it('stand tall: body size and standing hip height', () => {
    const m = measureStanding(framesOf('still-30s', 1, 3));
    expect(m.ok).toBe(true);
    expect(m.bodyLengthImage).toBeGreaterThan(0.16);
    expect(m.bodyLengthImage).toBeLessThan(0.18);
    expect(m.standingHipHeightBl).toBeGreaterThan(1.4);
    expect(m.standingHipHeightBl).toBeLessThan(1.8);
  });

  it('statue: wobble is small while holding still', () => {
    const m = measureStatueWobble(framesOf('still-30s', 5, 8));
    expect(m.ok).toBe(true);
    expect(m.statueWobbleBlPerS).toBeGreaterThan(0);
    expect(m.statueWobbleBlPerS).toBeLessThan(0.15);
  });

  it('reach up: highest hand reach above the hips (clip holds arms up 3-6.5 s)', () => {
    // Authored geometry: shoulder 1 BL above hips + 0.9 BL arm nearly
    // vertical = ~1.9 BL wrist height.
    const m = measureReach(framesOf('reach-and-arms-out', 3, 6.5));
    expect(m.ok).toBe(true);
    expect(m.reachHeightBl).toBeGreaterThan(1.8);
    expect(m.reachHeightBl).toBeLessThan(2.3);
  });

  it('airplane: arm span wide (clip holds the T 7.5-11 s)', () => {
    const m = measureArmSpan(framesOf('reach-and-arms-out', 7.5, 11));
    expect(m.ok).toBe(true);
    expect(m.armSpanBl).toBeGreaterThan(2.0);
    expect(m.armSpanBl).toBeLessThan(2.7);
  });

  it('frog squats: depth reaches the clip-authored 0.55 of standing', () => {
    const m = measureSquatDepth(framesOf('squats-x3'));
    expect(m.ok).toBe(true);
    expect(m.squatDepthRatio).toBeGreaterThan(0.45);
    expect(m.squatDepthRatio).toBeLessThan(0.65);
  });

  it('bunny hops: hop height near the clip-authored 0.32 BL rise', () => {
    const m = measureHops(framesOf('jumps-x5'));
    expect(m.ok).toBe(true);
    expect(m.hopHeightBl).toBeGreaterThan(0.25);
    expect(m.hopHeightBl).toBeLessThan(0.45);
  });

  it('run in place: step rate within 10% on both cadences', () => {
    const two = measureStepRate(framesOf('run-2sps-10s', 0.3, 9.8));
    expect(two.ok).toBe(true);
    expect(two.stepRatePerS).toBeGreaterThan(1.8);
    expect(two.stepRatePerS).toBeLessThan(2.2);
    const three = measureStepRate(framesOf('run-3sps-10s', 0.3, 9.8));
    expect(three.ok).toBe(true);
    expect(three.stepRatePerS).toBeGreaterThan(2.7);
    expect(three.stepRatePerS).toBeLessThan(3.3);
  });

  it('a move with nothing to find reports not-ok (stand clip has no hops)', () => {
    const m = measureHops(framesOf('still-30s', 1, 5));
    expect(m.ok).toBe(false);
  });
});

describe('warm-up plan reducer (M1.5)', () => {
  const start: WarmupPlanState = { phase: 'try', moveIndex: 0, tryNumber: 1 };

  it('a successful try advances to the next move', () => {
    expect(warmupPlanNext(start, 'measured-ok')).toEqual({
      phase: 'try',
      moveIndex: 1,
      tryNumber: 1,
    });
  });

  it('failures walk try -> try -> slow demo -> default, then advance', () => {
    let s = warmupPlanNext(start, 'measured-fail');
    expect(s).toEqual({ phase: 'try', moveIndex: 0, tryNumber: 2 });
    s = warmupPlanNext(s, 'measured-fail');
    expect(s).toEqual({ phase: 'slow-demo', moveIndex: 0, tryNumber: 3 });
    s = warmupPlanNext(s, 'measured-fail');
    expect(s).toEqual({ phase: 'use-default', moveIndex: 0, tryNumber: 3 });
    s = warmupPlanNext(s, 'defaults-applied');
    expect(s).toEqual({ phase: 'try', moveIndex: 1, tryNumber: 1 });
  });

  it('the slow demo try can still succeed', () => {
    const slow: WarmupPlanState = { phase: 'slow-demo', moveIndex: 2, tryNumber: 3 };
    expect(warmupPlanNext(slow, 'measured-ok')).toEqual({
      phase: 'try',
      moveIndex: 3,
      tryNumber: 1,
    });
  });

  it('finishing the last move reaches done', () => {
    const last: WarmupPlanState = { phase: 'try', moveIndex: 6, tryNumber: 1 };
    expect(warmupPlanNext(last, 'measured-ok').phase).toBe('done');
  });

  it('age defaults carry every calibration field', () => {
    for (const mode of ['little', 'big'] as const) {
      const d = WARMUP_DEFAULT_CALIBRATION_TABLE[mode];
      expect(Object.keys(d).sort()).toEqual(
        [
          'armSpanBl',
          'hopHeightBl',
          'reachHeightBl',
          'squatDepthRatio',
          'standingHipHeightBl',
          'statueWobbleBlPerS',
          'stepRatePerS',
        ].sort(),
      );
    }
  });
});

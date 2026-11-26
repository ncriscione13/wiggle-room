import { describe, expect, it } from 'vitest';
import { WarmupFlow, WARMUP_MOVES, type WarmupDirective } from '../../src/motion/warmup-flow';
import { WARMUP_DEFAULT_CALIBRATION_TABLE } from '../../src/motion/config';
import { preparePose, type PreparedPose } from '../../src/motion/frame-prep';
import { POSE, type ClipPose } from '../../src/tracking/clip-format';

// M1.10: the guided warm-up -- prompt, measure, two tries, slow demo, age
// default -- shared prompts, per-kid measurements (DESIGN side-by-side).

function standing(cx: number): ClipPose {
  const cy = 0.5;
  const pts: [number, number, number, number][] = Array.from({ length: 33 }, () => [cx, cy, 0, 1]);
  pts[POSE.nose] = [cx, cy - 0.3, 0, 1];
  pts[POSE.leftShoulder] = [cx - 0.05, cy - 0.2, 0, 1];
  pts[POSE.rightShoulder] = [cx + 0.05, cy - 0.2, 0, 1];
  pts[POSE.leftHip] = [cx - 0.04, cy, 0, 1];
  pts[POSE.rightHip] = [cx + 0.04, cy, 0, 1];
  pts[POSE.leftWrist] = [cx - 0.1, cy - 0.1, 0, 1];
  pts[POSE.rightWrist] = [cx + 0.1, cy - 0.1, 0, 1];
  pts[POSE.leftAnkle] = [cx - 0.04, cy + 0.32, 0, 1];
  pts[POSE.rightAnkle] = [cx + 0.04, cy + 0.32, 0, 1];
  return pts;
}

describe('WarmupFlow (M1.10)', () => {
  it('measures what it can, retries, slow-demos, then falls back to age defaults', () => {
    const flow = new WarmupFlow({ slots: [0], modes: ['little', 'little'] });
    const all: WarmupDirective[] = [];
    let prev: PreparedPose | null = null;
    let done: Extract<WarmupDirective, { type: 'done' }> | undefined;
    // A kid standing still passes stand + statue, fails the action moves.
    for (let i = 0; i < 30 * 160 && done === undefined; i += 1) {
      const tS = i / 30;
      const pose = preparePose(standing(0.3), prev);
      prev = pose;
      if (pose) flow.push(0, pose, tS);
      const out = flow.tick(tS);
      all.push(...out);
      done ??= out.find((d): d is Extract<WarmupDirective, { type: 'done' }> => d.type === 'done');
    }
    expect(done).toBeDefined();

    const says = all.filter(
      (d): d is Extract<WarmupDirective, { type: 'say' }> => d.type === 'say',
    );
    expect(says[0]?.lineId).toBe('warmup.intro');
    expect(says.some((s) => s.lineId === 'warmup.stand')).toBe(true);
    expect(says.some((s) => s.lineId === 'warmup.slow-demo')).toBe(true); // retries happened
    expect(says.filter((s) => s.lineId === 'warmup.reach').length).toBe(3); // 2 tries + slow demo
    expect(says[says.length - 1]?.lineId).toBe('warmup.done');

    const calibration = done?.calibrations[0];
    expect(calibration).toBeDefined();
    // Measured from the clip:
    expect(calibration?.standingHipHeightBl ?? 0).toBeGreaterThan(1.3);
    expect(calibration?.standingHipHeightBl ?? 9).toBeLessThan(1.9);
    expect(calibration?.statueWobbleBlPerS ?? 9).toBeLessThan(0.1);
    // Fallbacks from the age table for the moves the kid "failed":
    const d = WARMUP_DEFAULT_CALIBRATION_TABLE.little;
    expect(calibration?.reachHeightBl).toBe(d.reachHeightBl);
    expect(calibration?.stepRatePerS).toBe(d.stepRatePerS);
    expect(calibration?.bodyLengthImage ?? 0).toBeCloseTo(0.2, 1);
  });

  it('covers all seven DESIGN moves in order', () => {
    expect(WARMUP_MOVES.map((m) => m.id)).toEqual([
      'stand',
      'statue',
      'reach',
      'arms',
      'squat',
      'hop',
      'run',
    ]);
  });
});

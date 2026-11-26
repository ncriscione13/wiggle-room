import { describe, expect, it } from 'vitest';
import { BuddyPoseSampler } from '../../src/motion/buddy-pose';
import { BUDDY_PREDICTION_S } from '../../src/motion/config';
import { POSE, type ClipPose } from '../../src/tracking/clip-format';
import { preparePose } from '../../src/motion/frame-prep';

// M1.7: the buddy draws from a smoothed pose predicted ~30 ms ahead
// (DESIGN lag rule 3). Game rules keep using real, unpredicted events.

function poseAt(cx: number, cy: number): ClipPose {
  const pts: [number, number, number, number][] = Array.from({ length: 33 }, () => [cx, cy, 0, 1]);
  const set = (i: number, x: number, y: number): void => {
    pts[i] = [x, y, 0, 1];
  };
  set(POSE.leftShoulder, cx - 0.05, cy - 0.2);
  set(POSE.rightShoulder, cx + 0.05, cy - 0.2);
  set(POSE.leftHip, cx - 0.04, cy);
  set(POSE.rightHip, cx + 0.04, cy);
  set(POSE.leftWrist, cx - 0.12, cy - 0.1);
  set(POSE.rightWrist, cx + 0.12, cy - 0.1);
  set(POSE.leftAnkle, cx - 0.04, cy + 0.35);
  set(POSE.rightAnkle, cx + 0.04, cy + 0.35);
  set(POSE.nose, cx, cy - 0.3);
  return pts;
}

function pushWalk(
  sampler: BuddyPoseSampler,
  vxPerS: number,
  fromS: number,
  toS: number,
  stepS = 1 / 30,
): number {
  let prev = null;
  let cx = 0.5;
  let t = fromS;
  for (; t <= toS + 1e-9; t += stepS) {
    cx = 0.5 + vxPerS * (t - fromS);
    const prepared = preparePose(poseAt(cx, 0.5), prev);
    if (prepared) sampler.push(prepared, t);
    prev = prepared;
  }
  return cx; // last center x pushed
}

describe('BuddyPoseSampler (M1.7)', () => {
  it('predicts ~30 ms ahead under steady motion', () => {
    const sampler = new BuddyPoseSampler();
    const vx = 0.3; // image widths per second
    const lastCx = pushWalk(sampler, vx, 0, 2);
    const draw = sampler.sample(2);
    expect(draw).not.toBeNull();
    const lead = (draw?.hipMid.x ?? 0) - lastCx;
    // Should lead the latest pose by roughly v * BUDDY_PREDICTION_S.
    expect(lead).toBeGreaterThan(vx * BUDDY_PREDICTION_S * 0.4);
    expect(lead).toBeLessThan(vx * BUDDY_PREDICTION_S * 2.0);
  });

  it('smooths jitter: output wobbles less than input', () => {
    const sampler = new BuddyPoseSampler();
    let prev = null;
    const xs: number[] = [];
    for (let i = 0; i < 90; i += 1) {
      const t = i / 30;
      const noise = (i % 2 === 0 ? 1 : -1) * 0.01; // 1% alternating jitter
      const prepared = preparePose(poseAt(0.5 + noise, 0.5), prev);
      if (prepared) sampler.push(prepared, t);
      prev = prepared;
      const d = sampler.sample(t);
      if (d && i > 30) xs.push(d.hipMid.x);
    }
    expect(xs.length).toBeGreaterThan(30); // guard against a vacuous pass
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeLessThan(0.015); // raw input spread is 0.02
  });

  it('coasting: keeps last motion briefly, then settles (never flies off)', () => {
    const sampler = new BuddyPoseSampler();
    const lastCx = pushWalk(sampler, 0.3, 0, 1);
    // No more pushes: 1 s later the buddy must have stopped drifting.
    const later = sampler.sample(2);
    expect(later).not.toBeNull();
    const drift = (later?.hipMid.x ?? 0) - lastCx;
    expect(drift).toBeLessThan(0.3 * 0.5); // far less than full-speed extrapolation
    const muchLater = sampler.sample(4);
    // Settled: no further movement between 2 s and 4 s of silence.
    expect(Math.abs((muchLater?.hipMid.x ?? 0) - (later?.hipMid.x ?? 0))).toBeLessThan(0.002);
    expect(later?.fresh).toBe(false);
  });

  it('reports fresh only while poses keep arriving', () => {
    const sampler = new BuddyPoseSampler();
    pushWalk(sampler, 0, 0, 1);
    expect(sampler.sample(1.01)?.fresh).toBe(true);
    expect(sampler.sample(1.6)?.fresh).toBe(false);
  });

  it('returns null before any pose', () => {
    expect(new BuddyPoseSampler().sample(0)).toBeNull();
  });
});

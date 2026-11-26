import { describe, expect, it } from 'vitest';
import { loadClip } from '../helpers/clip-runner';
import type { ClipPose } from '../../src/tracking/clip-format';
import { MOVING_CONFIRM_S, STILL_MOVING_HOLD_S } from '../../src/motion/config';
import { preparePose, type PreparedPose } from '../../src/motion/frame-prep';
import { MovingStillDetector } from '../../src/motion/moving-still';

// M1.4 gates (PLAN): 30 s still clip -> ZERO false "moved" events; dancing ->
// "moving" within 150 ms of motion starting. Becoming still needs 0.5 s.

function runDetector(
  poses: { tS: number; pose: ClipPose | null }[],
): { tS: number; moving: boolean }[] {
  const detector = new MovingStillDetector();
  let prev: PreparedPose | null = null;
  const transitions: { tS: number; moving: boolean }[] = [];
  for (const { tS, pose } of poses) {
    if (pose === null) continue;
    const prepared = preparePose(pose, prev);
    if (prepared === null) continue;
    prev = prepared;
    const out = detector.update(prepared, tS);
    if (out.changed) transitions.push({ tS, moving: out.moving });
  }
  return transitions;
}

function slotPoses(clipName: string, slot: 0 | 1): { tS: number; pose: ClipPose | null }[] {
  return loadClip(clipName).frames.map((f) => ({ tS: f.tS, pose: f.poses[slot] ?? null }));
}

describe('MovingStillDetector clip gates (M1.4)', () => {
  it('still-30s: zero false "moving" events', () => {
    const transitions = runDetector(slotPoses('still-30s', 0));
    expect(transitions.filter((t) => t.moving)).toEqual([]);
  });

  it('jumps-x5: exactly 5 movement onsets, still again between hops', () => {
    const transitions = runDetector(slotPoses('jumps-x5', 0));
    const onsets = transitions.filter((t) => t.moving);
    expect(onsets).toHaveLength(5);
  });

  it('two-kids dancing: "moving" lands within 150 ms of the dance block starting', () => {
    // Kid 0's medley: still-ish block on [40, 60), dancing resumes at t = 60.
    const poses = slotPoses('two-kids-10min', 0).filter(({ tS }) => tS >= 45 && tS <= 70);
    const transitions = runDetector(poses);
    const onset = transitions.find((t) => t.moving && t.tS >= 59.5);
    expect(onset).toBeDefined();
    if (onset) {
      expect(onset.tS).toBeGreaterThanOrEqual(60 - 0.05);
      expect(onset.tS).toBeLessThanOrEqual(60 + 0.15);
    }
    // The window starts inside the quiet block, so the detector begins still
    // -- the claim is that it STAYS still until the dancing actually starts.
    expect(transitions.filter((t) => t.moving && t.tS < 59.5)).toEqual([]);
  });
});

describe('MovingStillDetector timing (M1.4)', () => {
  const FPS = 30;

  function syntheticRun(
    energyAt: (t: number) => number,
    untilS: number,
  ): { tS: number; moving: boolean }[] {
    // Drive the detector with a pose whose wrists move at a controlled speed.
    const detector = new MovingStillDetector();
    let prev: PreparedPose | null = null;
    let x = 0.3;
    const transitions: { tS: number; moving: boolean }[] = [];
    for (let i = 0; i <= untilS * FPS; i += 1) {
      const tS = i / FPS;
      x += (energyAt(tS) * 0.17) / FPS; // speed in BL/s converted to image units
      const pose: ClipPose = Array.from({ length: 33 }, () => [x, 0.5, 0, 0.95]);
      pose[11] = [0.45, 0.51, 0, 0.95];
      pose[12] = [0.55, 0.51, 0, 0.95];
      pose[23] = [0.47, 0.68, 0, 0.95];
      pose[24] = [0.53, 0.68, 0, 0.95];
      const prepared = preparePose(pose, prev);
      if (prepared === null) continue;
      prev = prepared;
      const out = detector.update(prepared, tS);
      if (out.changed) transitions.push({ tS, moving: out.moving });
    }
    return transitions;
  }

  it('a single spiky frame does not flip to moving; sustained motion does, fast', () => {
    const transitions = syntheticRun((t) => (t > 1 && t < 1.04 ? 3 : 0.02), 2);
    expect(transitions.filter((t) => t.moving)).toHaveLength(0);

    const sustained = syntheticRun((t) => (t > 1 ? 2 : 0.02), 2);
    const onset = sustained.find((t) => t.moving);
    expect(onset).toBeDefined();
    if (onset) expect(onset.tS - 1).toBeLessThanOrEqual(MOVING_CONFIRM_S + 0.07);
  });

  it('becoming still needs the full 0.5 s hold', () => {
    const transitions = syntheticRun((t) => (t < 1 ? 2 : 0.02), 3);
    const stillAt = transitions.find((t) => !t.moving && t.tS > 1);
    expect(stillAt).toBeDefined();
    if (stillAt) {
      expect(stillAt.tS - 1).toBeGreaterThanOrEqual(STILL_MOVING_HOLD_S - 0.05);
      expect(stillAt.tS - 1).toBeLessThanOrEqual(STILL_MOVING_HOLD_S + 0.3);
    }
  });
});

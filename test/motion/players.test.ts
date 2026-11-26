import { describe, expect, it } from 'vitest';
import { loadClip } from '../helpers/clip-runner';
import { POSE, type ClipPose } from '../../src/tracking/clip-format';
import { COASTING_MAX_S, REACQUIRE_CLEAR_S, REJOIN_WITHIN_S } from '../../src/motion/config';
import { PlayerTracker } from '../../src/motion/players';

// M1.2: circles map to screen halves, players bind to their half by hip
// center (never a face), and each kid has their own Tracked -> Coasting ->
// Paused machine. Clip gates from DESIGN's passing bar: ZERO swaps on the
// two-kid clip, playing again within 0.5 s after walking back in.

function poseAt(cx: number, visibility = 0.95): ClipPose {
  const bl = 0.17;
  const hipY = 0.68;
  const pose: ClipPose = Array.from({ length: 33 }, () => [cx, 0.5, 0, visibility]);
  pose[POSE.leftShoulder] = [cx - 0.047, hipY - bl, 0, visibility];
  pose[POSE.rightShoulder] = [cx + 0.047, hipY - bl, 0, visibility];
  pose[POSE.leftHip] = [cx - 0.03, hipY, 0, visibility];
  pose[POSE.rightHip] = [cx + 0.03, hipY, 0, visibility];
  return pose;
}

describe('PlayerTracker clip gates (M1.2)', () => {
  it('two-kids-10min: zero player swaps across crossing arms', () => {
    const clip = loadClip('two-kids-10min');
    const tracker = new PlayerTracker();
    let bothSeenFrames = 0;
    let orderViolations = 0;
    const pausedFrames: [number, number] = [0, 0];

    for (const frame of clip.frames) {
      const out = tracker.update(frame.tS, frame.poses);
      const [a, b] = out.players;
      if (a.seenNow && b.seenNow) {
        bothSeenFrames += 1;
        const ax = a.pose?.hipMid.x ?? 0;
        const bx = b.pose?.hipMid.x ?? 1;
        if (!(ax < bx)) orderViolations += 1; // a swap inverts the ordering
      }
      if (a.state === 'paused') pausedFrames[0] += 1;
      if (b.state === 'paused') pausedFrames[1] += 1;
    }

    expect(bothSeenFrames).toBeGreaterThan(clip.frames.length * 0.9);
    expect(orderViolations).toBe(0);
    // DESIGN passing bar: "Tracking lost < 2% of play time per kid" -- lost
    // means PAUSED; brief coasting over dropouts is designed behavior.
    expect(pausedFrames[0] / clip.frames.length).toBeLessThan(0.02);
    expect(pausedFrames[1] / clip.frames.length).toBeLessThan(0.02);
  });

  it('walk-out-and-back: paused while gone, tracked within 0.5 s of returning', () => {
    const clip = loadClip('walk-out-and-back');
    const tracker = new PlayerTracker();

    // DESIGN: "within 0.5 s of being FULLY in view" -- fully = both hips
    // confidently visible (re-entry edge frames are half-visible by design).
    const fullyInView = (poses: readonly (ClipPose | null)[]): boolean => {
      const p = poses[0];
      if (p == null) return false;
      const lh = p[POSE.leftHip];
      const rh = p[POSE.rightHip];
      return lh !== undefined && rh !== undefined && lh[3] >= 0.5 && rh[3] >= 0.5 && lh[0] > 0.1;
    };

    let lastFullBeforeGap: number | null = null;
    let pausedObserved = false;
    let returnedAt: number | null = null;
    let trackedAfterReturnAt: number | null = null;

    for (const frame of clip.frames) {
      const out = tracker.update(frame.tS, frame.poses);
      const player = out.players[0];
      if (fullyInView(frame.poses)) {
        if (lastFullBeforeGap !== null && frame.tS - lastFullBeforeGap > 2 && returnedAt === null) {
          returnedAt = frame.tS; // first FULLY-in-view frame after the long gap
        }
        lastFullBeforeGap = frame.tS;
      }
      if (!player.seenNow && player.state === 'paused') pausedObserved = true;
      if (returnedAt !== null && trackedAfterReturnAt === null && player.state === 'tracked') {
        trackedAfterReturnAt = frame.tS;
      }
    }

    expect(pausedObserved).toBe(true);
    expect(returnedAt).not.toBeNull();
    expect(trackedAfterReturnAt).not.toBeNull();
    if (returnedAt !== null && trackedAfterReturnAt !== null) {
      expect(trackedAfterReturnAt - returnedAt).toBeLessThanOrEqual(REJOIN_WITHIN_S);
    }
  });
});

describe('PlayerTracker state machine (M1.2)', () => {
  const FPS = 30;

  function run(
    tracker: PlayerTracker,
    fromS: number,
    toS: number,
    poses: (t: number) => (ClipPose | null)[],
  ): ReturnType<PlayerTracker['update']> {
    let out = tracker.update(fromS, poses(fromS));
    for (let t = fromS + 1 / FPS; t <= toS + 1e-9; t += 1 / FPS) {
      out = tracker.update(t, poses(t));
    }
    return out;
  }

  it('tracked -> coasting immediately when unseen, paused after 1 s', () => {
    const tracker = new PlayerTracker();
    run(tracker, 0, 1, () => [poseAt(0.3), null]);
    let out = tracker.update(1 + 1 / FPS, [null, null]);
    expect(out.players[0].state).toBe('coasting');
    expect(out.players[0].pose).not.toBeNull(); // buddy keeps the last pose
    out = run(tracker, 1 + 2 / FPS, 1 + COASTING_MAX_S + 0.2, () => [null, null]);
    expect(out.players[0].state).toBe('paused');
  });

  it('paused -> tracked only after 0.3 s of CONTINUOUS clear tracking', () => {
    const tracker = new PlayerTracker();
    run(tracker, 0, 0.5, () => [poseAt(0.3), null]);
    run(tracker, 0.5, 2.0, () => [null, null]); // long gone -> paused
    // Reappears, but with a one-frame dropout inside the clear window.
    let out = run(tracker, 2.0, 2.0 + REACQUIRE_CLEAR_S - 0.05, () => [poseAt(0.3), null]);
    expect(out.players[0].state).toBe('paused'); // not yet
    tracker.update(2.0 + REACQUIRE_CLEAR_S, [null, null]); // blip resets the window
    out = run(tracker, 2.0 + REACQUIRE_CLEAR_S + 1 / FPS, 2.0 + REACQUIRE_CLEAR_S + 0.2, () => [
      poseAt(0.3),
      null,
    ]);
    expect(out.players[0].state).toBe('paused'); // window restarted
    out = run(tracker, 2.0 + REACQUIRE_CLEAR_S + 0.2, 2.0 + 2 * REACQUIRE_CLEAR_S + 0.3, () => [
      poseAt(0.3),
      null,
    ]);
    expect(out.players[0].state).toBe('tracked');
  });

  it('two poses in one half: the half is crowded, the other slot stays unaffected', () => {
    const tracker = new PlayerTracker();
    const out = run(tracker, 0, 0.5, () => [poseAt(0.25), poseAt(0.4)]); // both LEFT
    expect(out.players[0].crowded).toBe(true);
    expect(out.players[0].seenNow).toBe(true); // one of them is still the player
    expect(out.players[1].seenNow).toBe(false);
    expect(out.players[1].crowded).toBe(false);
  });

  it('a kid straddling the middle keeps their slot (deadband, no flicker)', () => {
    const tracker = new PlayerTracker();
    run(tracker, 0, 0.5, () => [poseAt(0.45), poseAt(0.8)]);
    // Wiggle across 0.5 within the deadband: must stay slot 0.
    const out = run(tracker, 0.5, 1.5, (t) => [poseAt(0.5 + 0.02 * Math.sin(t * 20)), poseAt(0.8)]);
    expect(out.players[0].seenNow).toBe(true);
    expect(out.players[1].pose?.hipMid.x ?? 0).toBeCloseTo(0.8, 1);
  });

  it('assignment order does not depend on detection order', () => {
    const tracker = new PlayerTracker();
    // Detection slots deliberately deliver RIGHT kid first.
    const out = run(tracker, 0, 0.5, () => [poseAt(0.75), poseAt(0.25)]);
    expect(out.players[0].pose?.hipMid.x).toBeCloseTo(0.25, 1);
    expect(out.players[1].pose?.hipMid.x).toBeCloseTo(0.75, 1);
  });
});

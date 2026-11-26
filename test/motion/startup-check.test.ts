import { describe, expect, it } from 'vitest';
import { loadClip } from '../helpers/clip-runner';
import { POSE, type ClipPose } from '../../src/tracking/clip-format';
import type { LumaStats } from '../../src/tracking/pose-source';
import { STARTUP_CHECK_FULL_BODY_S } from '../../src/motion/config';
import { PlayerTracker } from '../../src/motion/players';
import {
  spareSlotToMute,
  StartupChecker,
  STARTUP_VOICE_LINES,
  type StartupProblem,
} from '../../src/motion/startup-check';

// M1.3: the circle goes green after 1 s of head-to-ankles visibility; each
// problem maps to its spoken fix. PLAN: tested with the low-visibility clip.

function fullBodyPose(
  cx = 0.5,
  opts: { ankleY?: number; noseY?: number; ankleVis?: number } = {},
): ClipPose {
  const bl = 0.17;
  const hipY = 0.6;
  const pose: ClipPose = Array.from({ length: 33 }, () => [cx, 0.5, 0, 0.95]);
  pose[POSE.nose] = [cx, opts.noseY ?? 0.15, 0, 0.95];
  pose[POSE.leftShoulder] = [cx - 0.047, hipY - bl, 0, 0.95];
  pose[POSE.rightShoulder] = [cx + 0.047, hipY - bl, 0, 0.95];
  pose[POSE.leftHip] = [cx - 0.03, hipY, 0, 0.95];
  pose[POSE.rightHip] = [cx + 0.03, hipY, 0, 0.95];
  pose[POSE.leftAnkle] = [cx - 0.03, opts.ankleY ?? 0.9, 0, opts.ankleVis ?? 0.95];
  pose[POSE.rightAnkle] = [cx + 0.03, opts.ankleY ?? 0.9, 0, opts.ankleVis ?? 0.95];
  return pose;
}

function flatLuma(mean: number): LumaStats {
  return { mean, cols: 8, rows: 6, cells: new Array<number>(48).fill(mean) };
}

/** Bright everywhere except the body's horizontal band. */
function backlitLuma(bodyMinX: number, bodyMaxX: number): LumaStats {
  const cols = 8;
  const rows = 6;
  const cells: number[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = (c + 0.5) / cols;
      cells.push(x >= bodyMinX && x <= bodyMaxX ? 0.25 : 0.95);
    }
  }
  const mean = cells.reduce((a, b) => a + b, 0) / cells.length;
  return { mean, cols, rows, cells };
}

const FPS = 30;

function runSteady(
  checker: StartupChecker,
  tracker: PlayerTracker,
  pose: () => ClipPose | null,
  seconds: number,
  luma?: LumaStats,
  startAtS = 0,
): ReturnType<StartupChecker['update']> {
  let out = checker.update(startAtS, tracker.update(startAtS, [pose(), null]).players[0], luma);
  for (let i = 1; i <= seconds * FPS; i += 1) {
    const tS = startAtS + i / FPS;
    out = checker.update(tS, tracker.update(tS, [pose(), null]).players[0], luma);
  }
  return out;
}

describe('StartupChecker (M1.3)', () => {
  it('goes ready after one continuous second of full-body visibility', () => {
    const checker = new StartupChecker();
    const tracker = new PlayerTracker();
    const half = runSteady(
      checker,
      tracker,
      () => fullBodyPose(0.3),
      STARTUP_CHECK_FULL_BODY_S / 2,
    );
    expect(half.ready).toBe(false);
    expect(half.progress01).toBeGreaterThan(0.3);
    const full = runSteady(
      checker,
      tracker,
      () => fullBodyPose(0.3),
      STARTUP_CHECK_FULL_BODY_S,
      undefined,
      STARTUP_CHECK_FULL_BODY_S / 2 + 1 / FPS,
    );
    expect(full.ready).toBe(true);
  });

  it('a PERSISTING problem resets the full-body second', () => {
    const checker = new StartupChecker();
    const tracker = new PlayerTracker();
    runSteady(checker, tracker, () => fullBodyPose(0.3), 0.8);
    runSteady(checker, tracker, () => null, 0.35, undefined, 0.81); // > blip tolerance
    const after = runSteady(checker, tracker, () => fullBodyPose(0.3), 0.8, undefined, 1.2);
    expect(after.ready).toBe(false); // restarted, not resumed
  });

  it('a single-frame flicker is reported but does NOT reset progress', () => {
    const checker = new StartupChecker();
    const tracker = new PlayerTracker();
    runSteady(checker, tracker, () => fullBodyPose(0.3), 0.8);
    const blip = checker.update(0.81, tracker.update(0.81, [null, null]).players[0]);
    expect(blip.problem).not.toBeNull();
    expect(blip.progress01).toBeGreaterThan(0.5); // progress survives the blip
    const after = runSteady(checker, tracker, () => fullBodyPose(0.3), 0.3, undefined, 0.84);
    expect(after.ready).toBe(true); // resumed, not restarted
  });

  const problemCases: [StartupProblem, () => ClipPose, LumaStats | undefined][] = [
    ['feet-out', () => fullBodyPose(0.3, { ankleVis: 0.2 }), undefined],
    ['too-close', () => fullBodyPose(0.3, { noseY: 0.01, ankleY: 0.99 }), undefined],
    ['dark', () => fullBodyPose(0.3), flatLuma(0.08)],
    ['backlight', () => fullBodyPose(0.3), backlitLuma(0.2, 0.4)],
  ];
  for (const [problem, pose, luma] of problemCases) {
    it(`detects ${problem} and never goes ready`, () => {
      const checker = new StartupChecker();
      const tracker = new PlayerTracker();
      const out = runSteady(checker, tracker, pose, 1.5, luma);
      expect(out.ready).toBe(false);
      expect(out.problem).toBe(problem);
      expect(STARTUP_VOICE_LINES[problem]).toContain('startup.');
    });
  }

  it('detects two bodies in one circle as crowded', () => {
    const checker = new StartupChecker();
    const tracker = new PlayerTracker();
    let out = checker.update(
      0,
      tracker.update(0, [fullBodyPose(0.25), fullBodyPose(0.4)]).players[0],
    );
    for (let i = 1; i <= 15; i += 1) {
      const tS = i / FPS;
      out = checker.update(
        tS,
        tracker.update(tS, [fullBodyPose(0.25), fullBodyPose(0.4)]).players[0],
      );
    }
    expect(out.problem).toBe('crowded');
  });

  it('low-visibility clip: never goes ready through the flicker', () => {
    const clip = loadClip('low-visibility-30s');
    const checker = new StartupChecker();
    const tracker = new PlayerTracker();
    let everReady = false;
    for (const frame of clip.frames) {
      const player = tracker.update(frame.tS, frame.poses).players[0];
      if (checker.update(frame.tS, player).ready) everReady = true;
    }
    expect(everReady).toBe(false);
  });

  it('still-30s clip: ready within ~1.2 s and stays ready', () => {
    const clip = loadClip('still-30s');
    const checker = new StartupChecker();
    const tracker = new PlayerTracker();
    let readyAt: number | null = null;
    let lostReadyAfter = false;
    for (const frame of clip.frames) {
      const player = tracker.update(frame.tS, frame.poses).players[0];
      const out = checker.update(frame.tS, player);
      if (out.ready && readyAt === null) readyAt = frame.tS;
      if (readyAt !== null && !out.ready && frame.tS > readyAt + 0.5) lostReadyAfter = true;
    }
    expect(readyAt).not.toBeNull();
    if (readyAt !== null) expect(readyAt).toBeLessThanOrEqual(1.5);
    expect(lostReadyAfter).toBe(false);
  });
});

describe('spareSlotToMute (playtest round 2: solo pick)', () => {
  it('mutes the empty circle once the solo kid is clearly in the other one', () => {
    expect(spareSlotToMute(1, ['not-seen', null])).toBe(0);
    expect(spareSlotToMute(1, [null, 'not-seen'])).toBe(1);
    expect(spareSlotToMute(1, ['not-seen', 'too-close'])).toBe(0); // being fixed over there
  });

  it('keeps both circles asking while nobody has arrived yet', () => {
    expect(spareSlotToMute(1, ['not-seen', 'not-seen'])).toBeNull();
  });

  it('never mutes anything with two kids picked (the missing kid IS the message)', () => {
    expect(spareSlotToMute(2, ['not-seen', null])).toBeNull();
    expect(spareSlotToMute(2, [null, 'not-seen'])).toBeNull();
  });
});

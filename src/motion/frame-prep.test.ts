import { describe, expect, it } from 'vitest';
import { POSE, type ClipPose } from '../tracking/clip-format';
import { OUTLIER_MAX_BL_PER_FRAME_BL, VISIBILITY_MIN_RATIO } from './config';
import { preparePose } from './frame-prep';

// M1.1: normalization + tracking safety gates (CLAUDE.md rule 6):
// low-visibility points are ignored (not guessed), single-frame teleports are
// rejected, every distance downstream is in body lengths.

function standingPose(cx = 0.5, bl = 0.17): ClipPose {
  // Minimal coherent body: shoulders 1 BL above hips, ankles below.
  const pose: ClipPose = Array.from({ length: 33 }, () => [cx, 0.5, 0, 0.95]);
  const hipY = 0.68;
  pose[POSE.leftShoulder] = [cx - 0.047, hipY - bl, 0, 0.95];
  pose[POSE.rightShoulder] = [cx + 0.047, hipY - bl, 0, 0.95];
  pose[POSE.leftHip] = [cx - 0.03, hipY, 0, 0.95];
  pose[POSE.rightHip] = [cx + 0.03, hipY, 0, 0.95];
  pose[POSE.leftAnkle] = [cx - 0.03, hipY + 1.6 * bl, 0, 0.95];
  pose[POSE.rightAnkle] = [cx + 0.03, hipY + 1.6 * bl, 0, 0.95];
  pose[POSE.leftWrist] = [cx - 0.12, hipY - 0.5 * bl, 0, 0.95];
  pose[POSE.rightWrist] = [cx + 0.12, hipY - 0.5 * bl, 0, 0.95];
  return pose;
}

describe('preparePose (M1.1)', () => {
  it('computes body length and midpoints from shoulders/hips', () => {
    const prepared = preparePose(standingPose(), null);
    expect(prepared).not.toBeNull();
    expect(prepared?.bodyLengthImage).toBeCloseTo(0.17, 3);
    expect(prepared?.hipMid.x).toBeCloseTo(0.5, 6);
    expect(prepared?.shoulderMid.y).toBeCloseTo(0.68 - 0.17, 6);
  });

  it('marks low-visibility points not-ok instead of guessing', () => {
    const pose = standingPose();
    const wrist = pose[POSE.leftWrist];
    if (wrist) wrist[3] = VISIBILITY_MIN_RATIO - 0.01;
    const prepared = preparePose(pose, null);
    expect(prepared?.points[POSE.leftWrist]?.ok).toBe(false);
    expect(prepared?.points[POSE.rightWrist]?.ok).toBe(true);
  });

  it('rejects a point that teleports more than one body length in a frame', () => {
    const first = preparePose(standingPose(), null);
    const pose = standingPose();
    const wrist = pose[POSE.rightWrist];
    if (wrist) wrist[0] += OUTLIER_MAX_BL_PER_FRAME_BL * 0.17 + 0.05; // > 1 BL jump
    const second = preparePose(pose, first);
    expect(second?.points[POSE.rightWrist]?.ok).toBe(false);
    // An ordinary move stays ok.
    const pose2 = standingPose();
    const wrist2 = pose2[POSE.rightWrist];
    if (wrist2) wrist2[0] += 0.02;
    const third = preparePose(pose2, first);
    expect(third?.points[POSE.rightWrist]?.ok).toBe(true);
  });

  it('a previously-bad point recovers once it moves plausibly again', () => {
    const first = preparePose(standingPose(), null);
    const spiked = standingPose();
    const w = spiked[POSE.rightWrist];
    if (w) w[0] += 0.5;
    const second = preparePose(spiked, first);
    expect(second?.points[POSE.rightWrist]?.ok).toBe(false);
    const third = preparePose(standingPose(), second);
    expect(third?.points[POSE.rightWrist]?.ok).toBe(true);
  });

  it('returns null when the torso anchors are unusable (upstream treats as unseen)', () => {
    const pose = standingPose();
    for (const idx of [POSE.leftHip, POSE.rightHip]) {
      const p = pose[idx];
      if (p) p[3] = 0.1;
    }
    expect(preparePose(pose, null)).toBeNull();
  });

  it('positions come out in body lengths relative to the hip midpoint', () => {
    const prepared = preparePose(standingPose(), null);
    const wristBl = prepared?.points[POSE.rightWrist];
    expect(wristBl?.xBl).toBeCloseTo(0.12 / 0.17, 2);
    expect(wristBl?.yBl).toBeCloseTo(-0.5, 2); // above hips = negative y in BL
    const shoulderBl = prepared?.points[POSE.leftShoulder];
    expect(shoulderBl?.yBl).toBeCloseTo(-1, 2); // definitionally one BL up
  });
});

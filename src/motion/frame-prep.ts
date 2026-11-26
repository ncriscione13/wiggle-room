// Frame preparation (M1.1): raw landmarks -> gated, body-length-normalized
// points. Implements CLAUDE.md rule 6's first two safeties:
//   - visibility < 0.5 -> the point is marked not-ok, never guessed;
//   - a point moving more than one body length in a single frame is rejected.
// Downstream detectors read ONLY prepared points, in BL units.

import { LANDMARK_COUNT, POSE, type ClipPose } from '../tracking/clip-format.ts';
import { OUTLIER_MAX_BL_PER_FRAME_BL, VISIBILITY_MIN_RATIO } from './config.ts';

export interface PreparedPoint {
  /** Normalized image coordinates (raw space, for drawing). */
  x: number;
  y: number;
  /** Position in body lengths relative to the hip midpoint (y up-negative). */
  xBl: number;
  yBl: number;
  visibility: number;
  /** Passed the visibility gate AND the teleport gate this frame. */
  ok: boolean;
}

export interface PreparedPose {
  points: PreparedPoint[];
  /** The BL unit: shoulder-mid to hip-mid distance in image units. */
  bodyLengthImage: number;
  hipMid: { x: number; y: number };
  shoulderMid: { x: number; y: number };
}

function usable(pose: ClipPose, idx: number): [number, number] | null {
  const p = pose[idx];
  if (p === undefined || p[3] < VISIBILITY_MIN_RATIO) return null;
  return [p[0], p[1]];
}

/**
 * Prepares one pose. Returns null when the torso anchors (both shoulders and
 * both hips) aren't reliably visible -- the player layer (M1.2) treats that
 * as "unseen this frame" and handles coasting.
 */
export function preparePose(pose: ClipPose, prev: PreparedPose | null): PreparedPose | null {
  const ls = usable(pose, POSE.leftShoulder);
  const rs = usable(pose, POSE.rightShoulder);
  const lh = usable(pose, POSE.leftHip);
  const rh = usable(pose, POSE.rightHip);
  if (ls === null || rs === null || lh === null || rh === null) return null;

  const shoulderMid = { x: (ls[0] + rs[0]) / 2, y: (ls[1] + rs[1]) / 2 };
  const hipMid = { x: (lh[0] + rh[0]) / 2, y: (lh[1] + rh[1]) / 2 };
  const bodyLengthImage = Math.hypot(shoulderMid.x - hipMid.x, shoulderMid.y - hipMid.y);
  if (!(bodyLengthImage > 1e-4)) return null;

  const maxStepImage = OUTLIER_MAX_BL_PER_FRAME_BL * bodyLengthImage;
  const points: PreparedPoint[] = new Array<PreparedPoint>(LANDMARK_COUNT);

  for (let i = 0; i < LANDMARK_COUNT; i += 1) {
    const raw = pose[i];
    const x = raw?.[0] ?? 0;
    const y = raw?.[1] ?? 0;
    const visibility = raw?.[3] ?? 0;
    let ok = visibility >= VISIBILITY_MIN_RATIO;
    if (ok && prev !== null) {
      const before = prev.points[i];
      // Teleport gate only against a previously-trusted position: a point
      // recovering from a bad frame must be able to come back.
      if (before !== undefined && before.ok) {
        const step = Math.hypot(x - before.x, y - before.y);
        if (step > maxStepImage) ok = false;
      }
    }
    points[i] = {
      x,
      y,
      xBl: (x - hipMid.x) / bodyLengthImage,
      yBl: (y - hipMid.y) / bodyLengthImage,
      visibility,
      ok,
    };
  }

  return { points, bodyLengthImage, hipMid, shoulderMid };
}

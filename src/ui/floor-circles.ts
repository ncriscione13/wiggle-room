// Floor circles (DESIGN: "two colored floor circles ... match the two halves
// of the screen"). ONE source of truth for where each slot's circle sits, in
// image space and on a (mirrored) screen viewport, shared by the debug stage,
// the start-up check and games -- so a kid never sees the circle on one side
// while the binding listens on the other. Slot 0 owns the image-LEFT half,
// which is the screen-RIGHT half once the display is mirrored.

import type { Slot } from '../games/types';
import type { BuddyPoint } from '../motion/buddy-pose';
import {
  FLOOR_CIRCLE_ADAPT_TAU_S,
  FLOOR_CIRCLE_CENTER_X_IMAGE_RATIO,
  FLOOR_CIRCLE_CENTER_Y_IMAGE_RATIO,
  FLOOR_CIRCLE_FOOT_DROP_IMAGE_RATIO,
  FLOOR_CIRCLE_HALF_INSET_RATIO,
  FLOOR_CIRCLE_RX_IMAGE_RATIO,
  FLOOR_CIRCLE_RX_MAX_IMAGE_RATIO,
  FLOOR_CIRCLE_RX_MIN_IMAGE_RATIO,
  FLOOR_CIRCLE_RX_PER_BL,
  FLOOR_CIRCLE_RY_PER_RX_RATIO,
  FLOOR_CIRCLE_Y_MAX_IMAGE_RATIO,
  FLOOR_CIRCLE_Y_MIN_IMAGE_RATIO,
} from '../motion/config';
import type { BuddyViewport } from './buddy';

export interface FloorCircle {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** The slot's circle in normalized image space (x right, y down, 0..1). */
export function floorCircleImage(slot: Slot): FloorCircle {
  const rx = FLOOR_CIRCLE_RX_IMAGE_RATIO;
  return {
    cx: FLOOR_CIRCLE_CENTER_X_IMAGE_RATIO[slot],
    cy: FLOOR_CIRCLE_CENTER_Y_IMAGE_RATIO,
    rx,
    ry: rx * FLOOR_CIRCLE_RY_PER_RX_RATIO,
  };
}

/** Any image-space circle mapped into screen pixels, using the SAME viewport
 * convention as paintBuddy (radii scale with viewport width; mirror flips x). */
export function circleToViewport(c: FloorCircle, vp: BuddyViewport): FloorCircle {
  return {
    cx: vp.x + (vp.mirrored ? 1 - c.cx : c.cx) * vp.width,
    cy: vp.y + c.cy * vp.height,
    rx: c.rx * vp.width,
    ry: c.ry * vp.width,
  };
}

/** The slot's DEFAULT circle in screen pixels (fixed framing: debug stage). */
export function floorCircleScreen(slot: Slot, vp: BuddyViewport): FloorCircle {
  return circleToViewport(floorCircleImage(slot), vp);
}

/** What the adaptive circle needs to know about the kid (image space). */
export interface CircleAnchorPose {
  hipMid: BuddyPoint;
  footL: BuddyPoint;
  footR: BuddyPoint;
  bodyLengthImage: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Phone play round 1: a phone's framing varies too much (field of view,
 * height, distance) for a fixed circle spot -- kids stood "in" circles that
 * floated nowhere near their feet. Once a kid is seen, their circle glides
 * UNDER them: centered near their hips, settled just below their feet, sized
 * from their own torso, and clamped well inside their binding half (so the
 * target never invites standing on the mid-line). Unseen slots drift back to
 * the default spot. The glide is a slow EWMA so hops and squats don't bounce
 * the target around.
 */
export class AdaptiveFloorCircle {
  private current: FloorCircle;
  private lastTS: number | null = null;
  private readonly slot: Slot;

  constructor(slot: Slot) {
    this.slot = slot;
    this.current = floorCircleImage(slot);
  }

  private target(pose: CircleAnchorPose | null): FloorCircle {
    if (pose === null) return floorCircleImage(this.slot);
    const inset = FLOOR_CIRCLE_HALF_INSET_RATIO;
    const [loX, hiX] = this.slot === 0 ? [inset, 0.5 - inset] : [0.5 + inset, 1 - inset];
    const rx = clamp(
      pose.bodyLengthImage * FLOOR_CIRCLE_RX_PER_BL,
      FLOOR_CIRCLE_RX_MIN_IMAGE_RATIO,
      FLOOR_CIRCLE_RX_MAX_IMAGE_RATIO,
    );
    return {
      cx: clamp(pose.hipMid.x, loX, hiX),
      cy: clamp(
        Math.max(pose.footL.y, pose.footR.y) + FLOOR_CIRCLE_FOOT_DROP_IMAGE_RATIO,
        FLOOR_CIRCLE_Y_MIN_IMAGE_RATIO,
        FLOOR_CIRCLE_Y_MAX_IMAGE_RATIO,
      ),
      rx,
      ry: rx * FLOOR_CIRCLE_RY_PER_RX_RATIO,
    };
  }

  /** Glide toward the kid (or back to the default); returns the circle to draw. */
  update(pose: CircleAnchorPose | null, tS: number): FloorCircle {
    const dtS = this.lastTS === null ? 0 : clamp(tS - this.lastTS, 0, 1);
    this.lastTS = tS;
    const t = this.target(pose);
    const alpha = dtS <= 0 ? 0 : 1 - Math.exp(-dtS / FLOOR_CIRCLE_ADAPT_TAU_S);
    this.current = {
      cx: this.current.cx + (t.cx - this.current.cx) * alpha,
      cy: this.current.cy + (t.cy - this.current.cy) * alpha,
      rx: this.current.rx + (t.rx - this.current.rx) * alpha,
      ry: this.current.ry + (t.ry - this.current.ry) * alpha,
    };
    return this.current;
  }
}

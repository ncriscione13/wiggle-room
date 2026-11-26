// Floor circles (DESIGN: "two colored floor circles ... match the two halves
// of the screen"). ONE source of truth for where each slot's circle sits, in
// image space and on a (mirrored) screen viewport, shared by the debug stage,
// the start-up check and games -- so a kid never sees the circle on one side
// while the binding listens on the other. Slot 0 owns the image-LEFT half,
// which is the screen-RIGHT half once the display is mirrored.

import type { Slot } from '../games/types';
import {
  FLOOR_CIRCLE_CENTER_X_IMAGE_RATIO,
  FLOOR_CIRCLE_CENTER_Y_IMAGE_RATIO,
  FLOOR_CIRCLE_RX_IMAGE_RATIO,
  FLOOR_CIRCLE_RY_PER_RX_RATIO,
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

/** The slot's circle in screen pixels, using the SAME viewport convention as
 * paintBuddy (radii scale with viewport width; mirroring flips x). */
export function floorCircleScreen(slot: Slot, vp: BuddyViewport): FloorCircle {
  const c = floorCircleImage(slot);
  return {
    cx: vp.x + (vp.mirrored ? 1 - c.cx : c.cx) * vp.width,
    cy: vp.y + c.cy * vp.height,
    rx: c.rx * vp.width,
    ry: c.ry * vp.width,
  };
}

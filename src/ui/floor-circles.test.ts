import { describe, expect, it } from 'vitest';
import {
  FLOOR_CIRCLE_CENTER_X_IMAGE_RATIO,
  FLOOR_CIRCLE_CENTER_Y_IMAGE_RATIO,
  FLOOR_CIRCLE_FOOT_DROP_IMAGE_RATIO,
  FLOOR_CIRCLE_HALF_INSET_RATIO,
  FLOOR_CIRCLE_RX_MAX_IMAGE_RATIO,
  FLOOR_CIRCLE_RX_MIN_IMAGE_RATIO,
  FLOOR_CIRCLE_RX_PER_BL,
} from '../motion/config';
import {
  AdaptiveFloorCircle,
  floorCircleImage,
  floorCircleScreen,
  type CircleAnchorPose,
  type FloorCircle,
} from './floor-circles';

// Playtest fix (2026-11-26): Nick's kids could not find their circles. The
// geometry below is the single source of truth every screen draws from, and
// the MIRROR direction is the part that was wrong before: slot 0 owns the
// image-LEFT half, which is the screen-RIGHT half once mirrored.

describe('floorCircleImage', () => {
  it('puts slot 0 in the image-left half and slot 1 in the image-right half', () => {
    expect(floorCircleImage(0).cx).toBe(FLOOR_CIRCLE_CENTER_X_IMAGE_RATIO[0]);
    expect(floorCircleImage(0).cx).toBeLessThan(0.5);
    expect(floorCircleImage(1).cx).toBeGreaterThan(0.5);
  });

  it('sits near the floor with a flattened (perspective) ellipse', () => {
    const c = floorCircleImage(0);
    expect(c.cy).toBe(FLOOR_CIRCLE_CENTER_Y_IMAGE_RATIO);
    expect(c.cy).toBeGreaterThan(0.66);
    expect(c.rx).toBeGreaterThan(0);
    expect(c.ry).toBeGreaterThan(0);
    expect(c.ry).toBeLessThan(c.rx);
  });
});

describe('floorCircleScreen', () => {
  const vp = { x: 0, y: 0, width: 1280, height: 720, mirrored: true };

  it('mirrors like the buddies do: slot 0 lands on the screen-RIGHT half', () => {
    const c0 = floorCircleScreen(0, vp);
    const c1 = floorCircleScreen(1, vp);
    expect(c0.cx).toBeCloseTo((1 - 0.25) * 1280, 5);
    expect(c0.cx).toBeGreaterThan(1280 / 2);
    expect(c1.cx).toBeLessThan(1280 / 2);
  });

  it('keeps image-side placement when not mirrored', () => {
    const c0 = floorCircleScreen(0, { ...vp, mirrored: false });
    expect(c0.cx).toBeCloseTo(0.25 * 1280, 5);
  });

  it('applies the viewport offset and scales radii by viewport width', () => {
    const off = floorCircleScreen(1, { x: 100, y: 50, width: 640, height: 360, mirrored: true });
    expect(off.cx).toBeCloseTo(100 + (1 - 0.75) * 640, 5);
    expect(off.cy).toBeCloseTo(50 + FLOOR_CIRCLE_CENTER_Y_IMAGE_RATIO * 360, 5);
    const full = floorCircleScreen(1, vp);
    expect(off.rx).toBeCloseTo(full.rx / 2, 5);
    expect(off.ry).toBeLessThan(off.rx);
  });
});

describe('AdaptiveFloorCircle (phone play round 1)', () => {
  const kid = (x: number, footY: number, bl = 0.2): CircleAnchorPose => ({
    hipMid: { x, y: footY - bl * 2 },
    footL: { x: x - 0.03, y: footY - 0.01 },
    footR: { x: x + 0.03, y: footY },
    bodyLengthImage: bl,
  });

  /** Run long enough that the slow EWMA fully settles. */
  const settle = (c: AdaptiveFloorCircle, pose: CircleAnchorPose | null): FloorCircle => {
    let out = c.update(pose, 0);
    for (let t = 0.1; t < 20; t += 0.1) out = c.update(pose, t);
    return out;
  };

  it('settles under the kid: hips for x, just below the feet for y, torso-sized', () => {
    const c = new AdaptiveFloorCircle(0);
    const out = settle(c, kid(0.3, 0.7));
    expect(out.cx).toBeCloseTo(0.3, 2);
    expect(out.cy).toBeCloseTo(0.7 + FLOOR_CIRCLE_FOOT_DROP_IMAGE_RATIO, 2);
    expect(out.rx).toBeCloseTo(0.2 * FLOOR_CIRCLE_RX_PER_BL, 2);
    expect(out.ry).toBeLessThan(out.rx);
  });

  it('clamps the target inside the slot half, away from the binding mid-line', () => {
    const c0 = settle(new AdaptiveFloorCircle(0), kid(0.49, 0.8));
    expect(c0.cx).toBeLessThanOrEqual(0.5 - FLOOR_CIRCLE_HALF_INSET_RATIO + 0.001);
    const c1 = settle(new AdaptiveFloorCircle(1), kid(0.51, 0.8));
    expect(c1.cx).toBeGreaterThanOrEqual(0.5 + FLOOR_CIRCLE_HALF_INSET_RATIO - 0.001);
  });

  it('drifts back to the default spot when the kid is unseen', () => {
    const c = new AdaptiveFloorCircle(0);
    settle(c, kid(0.35, 0.65));
    const back = settle(c, null);
    const dflt = floorCircleImage(0);
    expect(back.cx).toBeCloseTo(dflt.cx, 2);
    expect(back.cy).toBeCloseTo(dflt.cy, 2);
    expect(back.rx).toBeCloseTo(dflt.rx, 2);
  });

  it('moves slowly: one new frame never teleports the circle', () => {
    const c = new AdaptiveFloorCircle(0);
    const start = c.update(null, 0);
    const after = c.update(kid(0.45, 0.9), 0.1); // one 100 ms step toward a far target
    expect(Math.abs(after.cx - start.cx)).toBeLessThan(0.05);
  });

  it('keeps the radius inside the sanity clamps for tiny and huge torsos', () => {
    const small = settle(new AdaptiveFloorCircle(0), kid(0.25, 0.8, 0.02));
    expect(small.rx).toBeCloseTo(FLOOR_CIRCLE_RX_MIN_IMAGE_RATIO, 3);
    const big = settle(new AdaptiveFloorCircle(0), kid(0.25, 0.8, 0.9));
    expect(big.rx).toBeCloseTo(FLOOR_CIRCLE_RX_MAX_IMAGE_RATIO, 3);
  });
});

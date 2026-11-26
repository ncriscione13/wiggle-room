import { describe, expect, it } from 'vitest';
import {
  FLOOR_CIRCLE_CENTER_X_IMAGE_RATIO,
  FLOOR_CIRCLE_CENTER_Y_IMAGE_RATIO,
} from '../motion/config';
import { floorCircleImage, floorCircleScreen } from './floor-circles';

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

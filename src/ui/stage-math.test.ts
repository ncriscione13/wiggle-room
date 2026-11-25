import { describe, expect, it } from 'vitest';
import { toStageX, toStageY } from './stage-math';

describe('stage math (M0.3): mirrored display mapping', () => {
  const lm = (x: number, y: number): [number, number, number, number] => [x, y, 0, 1];

  it('mirrors x: a kid on camera-left appears on screen-right side flipped', () => {
    expect(toStageX(lm(0, 0), 1920)).toBe(1920);
    expect(toStageX(lm(1, 0), 1920)).toBe(0);
    expect(toStageX(lm(0.25, 0), 1920)).toBe(1440);
  });

  it('keeps y top-down', () => {
    expect(toStageY(lm(0, 0), 1080)).toBe(0);
    expect(toStageY(lm(0, 1), 1080)).toBe(1080);
    expect(toStageY(lm(0, 0.5), 1080)).toBe(540);
  });

  it('a step to the kid-s own left moves the drawn point the same screen direction', () => {
    // Kid moves toward camera-x 0 (their left in the mirror); screen x grows.
    const before = toStageX(lm(0.5, 0), 1920);
    const after = toStageX(lm(0.4, 0), 1920);
    expect(after).toBeGreaterThan(before);
  });
});

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

  it('mirror behavior: moving toward camera-x 0 moves the drawn point toward screen-right', () => {
    // An (un-mirrored) camera sees the kid's RIGHT side at small x; flipping x
    // puts it on screen-right -- exactly how a mirror behaves, so a step reads
    // as "toward the same side" to the kid.
    const before = toStageX(lm(0.5, 0), 1920);
    const after = toStageX(lm(0.4, 0), 1920);
    expect(after).toBeGreaterThan(before);
  });
});

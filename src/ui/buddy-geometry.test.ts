import { describe, expect, it } from 'vitest';
import { buddyShapes, type BuddyShape } from './buddy-geometry';
import type { BuddyDrawPose } from '../motion/buddy-pose';

// M1.7: the buddy's shapes are a pure function of (pose, reaction, time) so
// the look is testable without Phaser. The painter just draws the list.

function pose(): BuddyDrawPose {
  const cx = 0.5;
  const cy = 0.5;
  return {
    head: { x: cx, y: cy - 0.3 },
    shoulderL: { x: cx - 0.05, y: cy - 0.2 },
    shoulderR: { x: cx + 0.05, y: cy - 0.2 },
    handL: { x: cx - 0.12, y: cy - 0.1 },
    handR: { x: cx + 0.12, y: cy - 0.1 },
    hipMid: { x: cx, y: cy },
    footL: { x: cx - 0.04, y: cy + 0.35 },
    footR: { x: cx + 0.04, y: cy + 0.35 },
    bodyLengthImage: 0.2,
    fresh: true,
  };
}

const circles = (shapes: BuddyShape[]): Extract<BuddyShape, { kind: 'circle' }>[] =>
  shapes.filter((s): s is Extract<BuddyShape, { kind: 'circle' }> => s.kind === 'circle');
const limbs = (shapes: BuddyShape[]): Extract<BuddyShape, { kind: 'limb' }>[] =>
  shapes.filter((s): s is Extract<BuddyShape, { kind: 'limb' }> => s.kind === 'limb');

describe('buddyShapes (M1.7)', () => {
  it('idle: head + body blobs in the player color, four limbs, a face', () => {
    const shapes = buddyShapes(pose(), { kind: 'idle', phase01: 0 }, 'playerBlue', 0);
    expect(limbs(shapes)).toHaveLength(4);
    const blobs = circles(shapes).filter((c) => c.token === 'playerBlue');
    expect(blobs.length).toBeGreaterThanOrEqual(2); // head + body at least
    const eyes = circles(shapes).filter((c) => c.token === 'surfaceNight');
    expect(eyes.length).toBeGreaterThanOrEqual(2);
  });

  it('statue is frozen: identical shapes at different times, plus sparkles', () => {
    const state = { kind: 'statue', phase01: 1 } as const;
    const a = buddyShapes(pose(), state, 'playerPink', 10);
    const b = buddyShapes(pose(), state, 'playerPink', 12.34);
    expect(a).toEqual(b);
    expect(a.some((s) => s.kind === 'sparkle')).toBe(true);
  });

  it('giggle wobbles the head but stays near the pose', () => {
    const xs: number[] = [];
    for (let p = 0; p <= 1; p += 0.1) {
      const shapes = buddyShapes(pose(), { kind: 'giggle', phase01: p }, 'playerBlue', p);
      const head = circles(shapes)[0];
      if (head) xs.push(head.x);
    }
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeGreaterThan(0.005); // it moves...
    expect(spread).toBeLessThan(0.2 * 0.5); // ...but stays on the body (< 0.5 BL)
  });

  it('cheer: both hands end up above the head', () => {
    const shapes = buddyShapes(pose(), { kind: 'cheer', phase01: 0.5 }, 'playerBlue', 1);
    const headY = pose().head.y;
    for (const limb of limbs(shapes).slice(0, 2)) {
      expect(limb.to.y).toBeLessThan(headY); // y-down: above = smaller
    }
  });

  it('wave: one hand raised, the other where the kid has it', () => {
    const shapes = buddyShapes(pose(), { kind: 'wave', phase01: 0.5 }, 'playerBlue', 1);
    const arms = limbs(shapes).slice(0, 2);
    const raised = arms.filter((a) => a.to.y < pose().shoulderR.y);
    expect(raised).toHaveLength(1);
  });

  it('stale pose fades: alpha drops when not fresh', () => {
    const live = buddyShapes(pose(), { kind: 'idle', phase01: 0 }, 'playerBlue', 0);
    const stale = buddyShapes(
      { ...pose(), fresh: false },
      { kind: 'idle', phase01: 0 },
      'playerBlue',
      0,
    );
    const liveAlpha = circles(live)[0]?.alpha ?? 0;
    const staleAlpha = circles(stale)[0]?.alpha ?? 1;
    expect(staleAlpha).toBeLessThan(liveAlpha);
  });
});

import { describe, expect, it } from 'vitest';
import { matchesCard } from './pose-cards';
import type { BuddyPose } from '../types';

// M1.9: "Freeze like a..." cards, classified from the buddy pose (the
// sanctioned drawing pose -- still no raw landmarks in game code).

function posed(opts: {
  handLY?: number;
  handRY?: number;
  handGapX?: number;
  footLY?: number;
  footRY?: number;
  feetGapX?: number;
}): BuddyPose {
  const cx = 0.5;
  const cy = 0.5;
  const bl = 0.2;
  const handGap = (opts.handGapX ?? 1.4) * bl;
  const feetGap = (opts.feetGapX ?? 0.3) * bl;
  return {
    head: { x: cx, y: cy - 0.3 },
    shoulderL: { x: cx - 0.05, y: cy - 0.2 },
    shoulderR: { x: cx + 0.05, y: cy - 0.2 },
    handL: { x: cx - handGap / 2, y: cy + (opts.handLY ?? -0.1) },
    handR: { x: cx + handGap / 2, y: cy + (opts.handRY ?? -0.1) },
    hipMid: { x: cx, y: cy },
    footL: { x: cx - feetGap / 2, y: cy + (opts.footLY ?? 0.35) },
    footR: { x: cx + feetGap / 2, y: cy + (opts.footRY ?? 0.35) },
    bodyLengthImage: bl,
    fresh: true,
  };
}

const HIGH = -0.28; // wrists 1.4 BL above the hips

describe('pose cards (M1.9)', () => {
  it('star: hands high and wide, feet apart', () => {
    const star = posed({ handLY: HIGH, handRY: HIGH, handGapX: 1.6, feetGapX: 0.8 });
    expect(matchesCard(star, 'star')).toBe(true);
    expect(matchesCard(star, 'rocket')).toBe(false);
  });

  it('rocket: hands high and together, feet together', () => {
    const rocket = posed({ handLY: HIGH, handRY: HIGH, handGapX: 0.3, feetGapX: 0.2 });
    expect(matchesCard(rocket, 'rocket')).toBe(true);
    expect(matchesCard(rocket, 'star')).toBe(false);
  });

  it('tree: hands high together with one foot lifted', () => {
    const tree = posed({
      handLY: HIGH,
      handRY: HIGH,
      handGapX: 0.3,
      footLY: 0.2, // lifted 0.75 BL above the other
      footRY: 0.35,
      feetGapX: 0.3,
    });
    expect(matchesCard(tree, 'tree')).toBe(true);
    expect(matchesCard(tree, 'rocket')).toBe(false); // the lift disqualifies rocket
  });

  it('flamingo: one foot lifted, hands relaxed', () => {
    const flamingo = posed({ footLY: 0.18, footRY: 0.35 });
    expect(matchesCard(flamingo, 'flamingo')).toBe(true);
    expect(matchesCard(flamingo, 'tree')).toBe(false); // hands are down
  });

  it('plain standing matches nothing', () => {
    const standing = posed({});
    for (const card of ['star', 'flamingo', 'tree', 'rocket'] as const) {
      expect(matchesCard(standing, card), card).toBe(false);
    }
  });
});

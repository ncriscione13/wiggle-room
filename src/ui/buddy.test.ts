import { describe, expect, it } from 'vitest';
import { paintBuddy, type BuddyCanvas, type BuddyViewport } from './buddy';
import { buddyShapes } from './buddy-geometry';
import { colors, phaserColor } from './theme';
import type { BuddyDrawPose } from '../motion/buddy-pose';

// M1.7: the painter turns shapes into fillStyle/fillCircle calls (the only
// surface it needs -- Phaser Graphics satisfies it structurally).

function pose(): BuddyDrawPose {
  return {
    head: { x: 0.5, y: 0.2 },
    shoulderL: { x: 0.45, y: 0.3 },
    shoulderR: { x: 0.55, y: 0.3 },
    handL: { x: 0.38, y: 0.4 },
    handR: { x: 0.62, y: 0.4 },
    hipMid: { x: 0.5, y: 0.5 },
    footL: { x: 0.46, y: 0.85 },
    footR: { x: 0.54, y: 0.85 },
    bodyLengthImage: 0.2,
    fresh: true,
  };
}

function recorder(): BuddyCanvas & { fills: number[]; circles: { x: number; r: number }[] } {
  const rec = {
    fills: [] as number[],
    circles: [] as { x: number; r: number }[],
    fillStyle(color: number): void {
      rec.fills.push(color);
    },
    fillCircle(x: number, _y: number, r: number): void {
      rec.circles.push({ x, r });
    },
  };
  return rec;
}

const vp: BuddyViewport = { x: 100, y: 50, width: 400, height: 300, mirrored: true };

describe('paintBuddy (M1.7)', () => {
  it('paints every shape, expanding limbs into noodle circles', () => {
    const g = recorder();
    const shapes = buddyShapes(pose(), { kind: 'idle', phase01: 0 }, 'playerBlue', 0);
    paintBuddy(g, shapes, vp);
    // 4 limbs expand to >= 5 circles each + 3 blobs + 2 eyes.
    expect(g.circles.length).toBeGreaterThan(4 * 5 + 5);
    expect(g.fills).toContain(phaserColor(colors.playerBlue));
    expect(g.fills).toContain(phaserColor(colors.surfaceNight));
  });

  it('mirrors x around the viewport (step left -> buddy moves left)', () => {
    const g = recorder();
    const shapes = buddyShapes(pose(), { kind: 'idle', phase01: 0 }, 'playerBlue', 0);
    paintBuddy(g, shapes, vp);
    // Head at image x 0.5 -> mirrored center: 100 + 0.5*400 = 300.
    expect(g.circles[0]?.x).toBeCloseTo(300, 5);
    const left = recorder();
    paintBuddy(
      left,
      buddyShapes(
        { ...pose(), head: { x: 0.3, y: 0.2 } },
        { kind: 'idle', phase01: 0 },
        'playerBlue',
        0,
      ),
      vp,
    );
    // Image x 0.3 (kid's left in the mirrored view) -> 100 + 0.7*400 = 380.
    expect(left.circles[0]?.x).toBeCloseTo(380, 5);
  });

  it('scales radii by viewport width', () => {
    const g = recorder();
    paintBuddy(g, buddyShapes(pose(), { kind: 'idle', phase01: 0 }, 'playerBlue', 0), vp);
    // Head r = 0.42 * BL(0.2) * width(400) = 33.6
    expect(g.circles[0]?.r).toBeCloseTo(0.42 * 0.2 * 400, 3);
  });
});

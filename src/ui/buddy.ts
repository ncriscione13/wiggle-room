// Buddy painter (M1.7): draws the shape list from buddy-geometry into any
// surface with fillStyle + fillCircle (Phaser Graphics fits structurally --
// no Phaser import, so this stays unit-testable). Limbs are painted as
// overlapping circles along their curve: soft blob noodles, one draw
// primitive, no stroke API dependency.

import type { BuddyPoint } from '../motion/buddy-pose';
import { colors, phaserColor, type ColorToken } from './theme';
import type { BuddyShape } from './buddy-geometry';

/** The painting surface (Phaser Graphics satisfies this structurally). */
export interface BuddyCanvas {
  fillStyle(color: number, alpha: number): unknown;
  fillCircle(x: number, y: number, radius: number): unknown;
}

/** Where on screen the normalized image space lands. The display is
 * mirrored (DESIGN: step left -> buddy moves left), so mirrored defaults on. */
export interface BuddyViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  mirrored: boolean;
}

const quadratic = (from: BuddyPoint, mid: BuddyPoint, to: BuddyPoint, t: number): BuddyPoint => {
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * mid.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * mid.y + t * t * to.y,
  };
};

export function paintBuddy(g: BuddyCanvas, shapes: BuddyShape[], vp: BuddyViewport): void {
  const px = (p: BuddyPoint): { x: number; y: number } => ({
    x: vp.x + (vp.mirrored ? 1 - p.x : p.x) * vp.width,
    y: vp.y + p.y * vp.height,
  });
  const scale = vp.width; // radii/widths are in image-width units

  const fill = (token: ColorToken, alpha: number): void => {
    g.fillStyle(phaserColor(colors[token]), alpha);
  };

  for (const shape of shapes) {
    if (shape.kind === 'circle' || shape.kind === 'sparkle') {
      const c = px(shape);
      fill(shape.token, shape.alpha);
      g.fillCircle(c.x, c.y, shape.r * scale);
    } else {
      // Noodle: circles along the curve, spaced about 40% of the width.
      const a = px(shape.from);
      const b = px(shape.to);
      const approxLen = Math.hypot(b.x - a.x, b.y - a.y);
      const r = (shape.width / 2) * scale;
      const steps = Math.min(14, Math.max(4, Math.ceil(approxLen / Math.max(r * 0.8, 1))));
      fill(shape.token, shape.alpha);
      for (let i = 0; i <= steps; i += 1) {
        const p = px(quadratic(shape.from, shape.mid, shape.to, i / steps));
        g.fillCircle(p.x, p.y, r);
      }
    }
  }
}

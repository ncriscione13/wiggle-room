// Check/warm-up stage painter (playtest fix, 2026-11-26): kids at the
// start-up check were told "Step into your circle!" with no circle in sight.
// This paints the mirrored camera-space view onto a plain 2D canvas -- the
// floor circle for each slot plus the kid's live buddy -- so a kid can see
// where their circle is and watch themselves walk into it (DESIGN start-up
// check: "each circle shows the kid's buddy and turns green"). Pure painting:
// (views, time) -> canvas calls; the DOM screens own the canvas element.

import type { BuddyDrawPose } from '../motion/buddy-pose';
import type { Slot } from '../games/types';
import { buddyShapes } from './buddy-geometry';
import { paintBuddy, type BuddyCanvas, type BuddyViewport } from './buddy';
import { circleToViewport, type FloorCircle } from './floor-circles';
import { colors, cssRgba, cssRgbaFromNumber, type ColorToken } from './theme';

/** The minimal 2D-context surface the painter needs (unit-testable). */
export interface RenderCtx2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
  stroke(): void;
}

const TWO_PI = Math.PI * 2;
/** Fill alphas: empty circle -> filling with progress -> solid when ready. */
const CIRCLE_BASE_ALPHA = 0.14;
const CIRCLE_PROGRESS_ALPHA_SPAN = 0.38;
const CIRCLE_READY_ALPHA = 0.6;
const CIRCLE_OUTLINE_ALPHA = 0.9;

/** Adapts a 2D canvas context to the BuddyCanvas surface paintBuddy draws on
 * (Phaser Graphics provides it natively; DOM canvases need this shim). */
export function buddyCanvasFor(ctx: RenderCtx2D): BuddyCanvas {
  let style = cssRgbaFromNumber(0, 1);
  return {
    fillStyle(color: number, alpha: number): void {
      style = cssRgbaFromNumber(color, alpha);
    },
    fillCircle(x: number, y: number, radius: number): void {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TWO_PI);
      ctx.fillStyle = style;
      ctx.fill();
    },
  };
}

export interface CheckSlotView {
  color: ColorToken;
  /** Live buddy pose (image space) or null while the kid is unseen. */
  pose: BuddyDrawPose | null;
  /** Where this slot's circle currently sits, in image space (adaptive on
   * phones: it glides under the detected kid). */
  circle: FloorCircle;
  /** 0..1 head-to-ankles confirmation progress; the circle fills with it. */
  progress01: number;
  /** Seen head to ankles long enough: the circle turns solid green. */
  ready: boolean;
}

/** Paints the full check view: floor circles first, buddies on top. */
export function paintCheckStage(
  ctx: RenderCtx2D,
  widthPx: number,
  heightPx: number,
  views: ReadonlyMap<Slot, CheckSlotView>,
  tS: number,
): void {
  ctx.clearRect(0, 0, widthPx, heightPx);
  const vp: BuddyViewport = { x: 0, y: 0, width: widthPx, height: heightPx, mirrored: true };

  for (const [, view] of views) {
    const c = circleToViewport(view.circle, vp);
    const token = view.ready ? 'meadow' : view.color;
    ctx.beginPath();
    ctx.ellipse(c.cx, c.cy, c.rx, c.ry, 0, 0, TWO_PI);
    ctx.fillStyle = cssRgba(
      colors[token],
      view.ready
        ? CIRCLE_READY_ALPHA
        : CIRCLE_BASE_ALPHA + CIRCLE_PROGRESS_ALPHA_SPAN * Math.min(1, view.progress01),
    );
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(c.cx, c.cy, c.rx, c.ry, 0, 0, TWO_PI);
    ctx.lineWidth = Math.max(3, c.rx * 0.06);
    ctx.strokeStyle = cssRgba(colors[token], CIRCLE_OUTLINE_ALPHA);
    ctx.stroke();
  }

  const buddyCanvas = buddyCanvasFor(ctx);
  for (const [, view] of views) {
    if (view.pose === null) continue;
    const reaction = view.ready
      ? ({ kind: 'wave', phase01: 0 } as const)
      : ({ kind: 'idle', phase01: 0 } as const);
    paintBuddy(buddyCanvas, buddyShapes(view.pose, reaction, view.color, tS), vp);
  }
}

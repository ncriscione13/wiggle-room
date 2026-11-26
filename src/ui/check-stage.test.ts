import { describe, expect, it } from 'vitest';
import type { BuddyDrawPose } from '../motion/buddy-pose';
import { floorCircleImage } from './floor-circles';
import { colors, cssRgba, phaserColor } from './theme';
import {
  buddyCanvasFor,
  paintCheckStage,
  type CheckSlotView,
  type RenderCtx2D,
} from './check-stage';

// Playtest fix (2026-11-26): the start-up check and warm-up now paint the
// mirrored camera-space view -- a floor circle per slot plus each kid's live
// buddy -- so a kid can SEE which circle is theirs and walk into it
// (DESIGN start-up check: "each circle shows the kid's buddy").

type Op =
  | { op: 'clear' }
  | { op: 'ellipse'; x: number; y: number; rx: number; ry: number }
  | { op: 'arc'; x: number; y: number; r: number }
  | { op: 'fill'; style: string }
  | { op: 'stroke'; style: string };

class RecordingCtx implements RenderCtx2D {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  readonly ops: Op[] = [];
  clearRect(): void {
    this.ops.push({ op: 'clear' });
  }
  beginPath(): void {
    /* path state is irrelevant to these tests */
  }
  ellipse(x: number, y: number, rx: number, ry: number): void {
    this.ops.push({ op: 'ellipse', x, y, rx, ry });
  }
  arc(x: number, y: number, r: number): void {
    this.ops.push({ op: 'arc', x, y, r });
  }
  fill(): void {
    this.ops.push({ op: 'fill', style: this.fillStyle });
  }
  stroke(): void {
    this.ops.push({ op: 'stroke', style: this.strokeStyle });
  }
}

/** Standing pose centered in the image-left half (slot 0's half). */
const pose = (cx = 0.25): BuddyDrawPose => ({
  head: { x: cx, y: 0.3 },
  shoulderL: { x: cx - 0.05, y: 0.42 },
  shoulderR: { x: cx + 0.05, y: 0.42 },
  handL: { x: cx - 0.1, y: 0.6 },
  handR: { x: cx + 0.1, y: 0.6 },
  hipMid: { x: cx, y: 0.62 },
  footL: { x: cx - 0.04, y: 0.9 },
  footR: { x: cx + 0.04, y: 0.9 },
  bodyLengthImage: 0.2,
  fresh: true,
});

const view = (over: Partial<CheckSlotView> = {}): CheckSlotView => ({
  color: 'playerBlue',
  pose: null,
  circle: floorCircleImage(0),
  progress01: 0,
  ready: false,
  ...over,
});

describe('buddyCanvasFor', () => {
  it('adapts fillStyle(number, alpha) and fillCircle to 2D canvas calls', () => {
    const ctx = new RecordingCtx();
    const canvas = buddyCanvasFor(ctx);
    // The same numeric color Phaser Graphics would receive for this token.
    canvas.fillStyle(phaserColor(colors.playerBlue), 0.5);
    canvas.fillCircle(10, 20, 5);
    expect(ctx.ops).toEqual([
      { op: 'arc', x: 10, y: 20, r: 5 },
      { op: 'fill', style: cssRgba(colors.playerBlue, 0.5) },
    ]);
  });
});

describe('paintCheckStage', () => {
  it('clears, then draws one mirrored floor ellipse pair per slot', () => {
    const ctx = new RecordingCtx();
    paintCheckStage(
      ctx,
      1280,
      720,
      new Map([
        [0, view()],
        [1, view({ color: 'playerPink', circle: floorCircleImage(1) })],
      ]),
      0,
    );
    expect(ctx.ops[0]).toEqual({ op: 'clear' });
    const ellipses = ctx.ops.filter((o): o is Extract<Op, { op: 'ellipse' }> => o.op === 'ellipse');
    // Fill + outline per slot.
    expect(ellipses).toHaveLength(4);
    const slot0 = ellipses[0];
    const slot1 = ellipses[2];
    // Mirrored: slot 0's circle is on the screen-RIGHT half.
    expect(slot0?.x).toBeGreaterThan(1280 / 2);
    expect(slot1?.x).toBeLessThan(1280 / 2);
    expect(slot0?.ry).toBeLessThan(slot0?.rx ?? 0);
  });

  it('draws a buddy (many circles) only for slots with a pose, mirrored into its half', () => {
    const ctx = new RecordingCtx();
    paintCheckStage(
      ctx,
      1280,
      720,
      new Map([
        [0, view({ pose: pose(0.25) })],
        [1, view()],
      ]),
      0,
    );
    const arcs = ctx.ops.filter((o): o is Extract<Op, { op: 'arc' }> => o.op === 'arc');
    expect(arcs.length).toBeGreaterThan(5); // head + body + limb noodles
    // The kid stands at image x 0.25 (their own half) -> buddy on screen-right.
    for (const a of arcs) expect(a.x).toBeGreaterThan(1280 / 2);
  });

  it('fills a ready circle with the meadow green', () => {
    const ctx = new RecordingCtx();
    paintCheckStage(ctx, 1280, 720, new Map([[0, view({ ready: true, progress01: 1 })]]), 0);
    const fills = ctx.ops.filter((o): o is Extract<Op, { op: 'fill' }> => o.op === 'fill');
    const meadow = cssRgba(colors.meadow, 0).slice(0, cssRgba(colors.meadow, 0).lastIndexOf(','));
    expect(fills.some((f) => f.style.startsWith(meadow))).toBe(true);
  });

  it('brightens the fill as progress grows (kids see the circle filling up)', () => {
    const alphaOfFirstFill = (progress01: number): number => {
      const ctx = new RecordingCtx();
      paintCheckStage(ctx, 1280, 720, new Map([[0, view({ progress01 })]]), 0);
      const fill = ctx.ops.find((o): o is Extract<Op, { op: 'fill' }> => o.op === 'fill');
      const match = /, ([\d.]+)\)$/.exec(fill?.style ?? '');
      return Number(match?.[1] ?? NaN);
    };
    expect(alphaOfFirstFill(0.8)).toBeGreaterThan(alphaOfFirstFill(0));
  });
});

describe('hidden slots (solo pick: one kid gets ONE circle)', () => {
  it('draws neither circle nor buddy for a hidden slot', () => {
    const ctx = new RecordingCtx();
    paintCheckStage(
      ctx,
      1280,
      720,
      new Map([
        [0, view({ pose: pose(0.25) })],
        [
          1,
          view({
            color: 'playerPink',
            circle: floorCircleImage(1),
            hidden: true,
            pose: pose(0.75),
          }),
        ],
      ]),
      0,
    );
    const ellipses = ctx.ops.filter((o) => o.op === 'ellipse');
    expect(ellipses).toHaveLength(2); // fill + outline for slot 0 only
    // Slot 1's kid stands image-right (screen-LEFT mirrored): no arcs there.
    const arcs = ctx.ops.filter((o): o is Extract<Op, { op: 'arc' }> => o.op === 'arc');
    for (const a of arcs) expect(a.x).toBeGreaterThan(1280 / 2);
  });
});

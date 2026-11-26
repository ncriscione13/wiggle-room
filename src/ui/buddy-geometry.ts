// Buddy look (M1.7; DESIGN: "soft round blob in their circle color" that
// copies arms and legs). Pure: (draw pose, reaction, color, time) -> shape
// list in normalized image coordinates; the Phaser painter scales and draws.
// Statue shapes ignore the clock entirely, so a frozen buddy really freezes.

import type { BuddyDrawPose, BuddyPoint } from '../motion/buddy-pose';
import type { BuddyReactionState } from './buddy-state';
import type { ColorToken } from './theme';

export interface BuddyCircle {
  kind: 'circle';
  x: number;
  y: number;
  r: number;
  token: ColorToken;
  alpha: number;
}

export interface BuddyLimb {
  kind: 'limb';
  from: BuddyPoint;
  mid: BuddyPoint;
  to: BuddyPoint;
  width: number;
  token: ColorToken;
  alpha: number;
}

export interface BuddySparkle {
  kind: 'sparkle';
  x: number;
  y: number;
  r: number;
  token: ColorToken;
  alpha: number;
}

export type BuddyShape = BuddyCircle | BuddyLimb | BuddySparkle;

const STALE_ALPHA = 0.45;
const TWO_PI = Math.PI * 2;

const lerp = (a: BuddyPoint, b: BuddyPoint, t: number): BuddyPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Elbow/knee guess: midpoint pushed outward so limbs curve, not fold. */
const bow = (from: BuddyPoint, to: BuddyPoint, out: number): BuddyPoint => {
  const mid = lerp(from, to, 0.5);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: mid.x + (-dy / len) * out, y: mid.y + (dx / len) * out };
};

export function buddyShapes(
  pose: BuddyDrawPose,
  reaction: BuddyReactionState,
  color: ColorToken,
  tS: number,
): BuddyShape[] {
  const bl = pose.bodyLengthImage;
  const alpha = pose.fresh ? 1 : STALE_ALPHA;
  const isStatue = reaction.kind === 'statue';

  // Reaction-driven adjustments.
  let wobbleX = 0;
  let squash = 0;
  let handL = pose.handL;
  let handR = pose.handR;
  if (reaction.kind === 'giggle') {
    // 3 shakes over the giggle; drive by phase so it is deterministic.
    wobbleX = Math.sin(reaction.phase01 * TWO_PI * 3) * 0.12 * bl;
    squash = Math.abs(Math.sin(reaction.phase01 * TWO_PI * 3)) * 0.1;
  } else if (reaction.kind === 'cheer') {
    const up = Math.sin(Math.min(reaction.phase01, 0.5) * Math.PI); // rise then hold
    handL = { x: pose.head.x - 0.35 * bl, y: pose.head.y - (0.4 + 0.2 * up) * bl };
    handR = { x: pose.head.x + 0.35 * bl, y: pose.head.y - (0.4 + 0.2 * up) * bl };
  } else if (reaction.kind === 'wave') {
    // One hand up by the head, waving side to side on the clock.
    handR = {
      x: pose.head.x + (0.45 + Math.sin(tS * TWO_PI * 2) * 0.15) * bl,
      y: pose.head.y - 0.15 * bl,
    };
  }

  const head = { x: pose.head.x + wobbleX, y: pose.head.y };
  const chest = lerp(pose.hipMid, head, 0.55);
  const belly = lerp(pose.hipMid, head, 0.15);
  const limbW = 0.2 * bl;

  const shapes: BuddyShape[] = [
    // Head first: tests and the painter treat shapes[0] as the head.
    {
      kind: 'circle',
      x: head.x,
      y: head.y,
      r: 0.42 * bl * (1 - squash * 0.5),
      token: color,
      alpha,
    },
    { kind: 'circle', x: chest.x + wobbleX * 0.6, y: chest.y, r: 0.55 * bl, token: color, alpha },
    {
      kind: 'circle',
      x: belly.x + wobbleX * 0.3,
      y: belly.y,
      r: 0.6 * bl * (1 + squash * 0.4),
      token: color,
      alpha,
    },
    // Arms (shapes[3], shapes[4] -- painter/tests rely on arms-then-legs).
    {
      kind: 'limb',
      from: pose.shoulderL,
      mid: bow(pose.shoulderL, handL, 0.08 * bl),
      to: handL,
      width: limbW,
      token: color,
      alpha,
    },
    {
      kind: 'limb',
      from: pose.shoulderR,
      mid: bow(pose.shoulderR, handR, -0.08 * bl),
      to: handR,
      width: limbW,
      token: color,
      alpha,
    },
    // Legs.
    {
      kind: 'limb',
      from: lerp(pose.hipMid, pose.footL, 0.05),
      mid: bow(pose.hipMid, pose.footL, 0.06 * bl),
      to: pose.footL,
      width: limbW,
      token: color,
      alpha,
    },
    {
      kind: 'limb',
      from: lerp(pose.hipMid, pose.footR, 0.05),
      mid: bow(pose.hipMid, pose.footR, -0.06 * bl),
      to: pose.footR,
      width: limbW,
      token: color,
      alpha,
    },
    // Face: two eyes (closed-happy during giggle/cheer is painter detail).
    {
      kind: 'circle',
      x: head.x - 0.13 * bl,
      y: head.y - 0.04 * bl,
      r: 0.05 * bl,
      token: 'surfaceNight',
      alpha,
    },
    {
      kind: 'circle',
      x: head.x + 0.13 * bl,
      y: head.y - 0.04 * bl,
      r: 0.05 * bl,
      token: 'surfaceNight',
      alpha,
    },
  ];

  if (isStatue) {
    // Icy shimmer: positions derive from the POSE (not the clock), so a
    // statue is perfectly still; phase01 only ramps the sparkle in.
    const sparkleAlpha = alpha * reaction.phase01;
    const anchors = [head, chest, { x: belly.x, y: belly.y }, handL, handR];
    for (const [i, a] of anchors.entries()) {
      shapes.push({
        kind: 'sparkle',
        x: a.x + (i % 2 === 0 ? 0.3 : -0.3) * bl * 0.8,
        y: a.y - 0.25 * bl,
        r: 0.06 * bl,
        token: 'ice',
        alpha: sparkleAlpha,
      });
    }
  }
  if (reaction.kind === 'cheer') {
    // Confetti burst above the head, driven by phase.
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * TWO_PI;
      const dist = (0.6 + reaction.phase01 * 0.5) * bl;
      shapes.push({
        kind: 'sparkle',
        x: head.x + Math.cos(angle) * dist,
        y:
          head.y -
          0.4 * bl -
          Math.sin(reaction.phase01 * Math.PI) * 0.4 * bl +
          Math.sin(angle) * dist * 0.3,
        r: 0.05 * bl,
        token: (['mint', 'lavender', 'peach', 'butter', 'ice'] as const)[i] ?? 'mint',
        alpha: alpha * (1 - reaction.phase01 * 0.5),
      });
    }
  }
  return shapes;
}

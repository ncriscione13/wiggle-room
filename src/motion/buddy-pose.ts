// Buddy draw pose (M1.7; DESIGN lag rule 3): the avatar is drawn from a
// smoothed pose extrapolated ~30 ms ahead using joint velocity, so the buddy
// feels glued to the kid. Game rules NEVER read this -- they use the real,
// unpredicted event stream. While a kid coasts, the effective look-ahead
// saturates (BUDDY_EXTRAPOLATION_CAP_S), so the buddy keeps its last motion
// briefly and settles instead of flying off screen.

import { POSE } from '../tracking/clip-format.ts';
import {
  BUDDY_EXTRAPOLATION_CAP_S,
  BUDDY_FRESH_MAX_AGE_S,
  BUDDY_POSITION_SMOOTH_S,
  BUDDY_PREDICTION_S,
  BUDDY_VELOCITY_SMOOTH_S,
} from './config.ts';
import type { PreparedPose } from './frame-prep.ts';

export interface BuddyPoint {
  x: number;
  y: number;
}

export interface BuddyDrawPose {
  head: BuddyPoint;
  shoulderL: BuddyPoint;
  shoulderR: BuddyPoint;
  handL: BuddyPoint;
  handR: BuddyPoint;
  hipMid: BuddyPoint;
  footL: BuddyPoint;
  footR: BuddyPoint;
  bodyLengthImage: number;
  /** False while the kid is coasting/paused -- the pose is held, not live. */
  fresh: boolean;
}

type PartName = keyof Omit<BuddyDrawPose, 'bodyLengthImage' | 'fresh'>;

const PART_LANDMARK: Record<Exclude<PartName, 'hipMid'>, number> = {
  head: POSE.nose,
  shoulderL: POSE.leftShoulder,
  shoulderR: POSE.rightShoulder,
  handL: POSE.leftWrist,
  handR: POSE.rightWrist,
  footL: POSE.leftAnkle,
  footR: POSE.rightAnkle,
};

interface PartState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastT: number;
  seen: boolean;
}

export class BuddyPoseSampler {
  private readonly parts = new Map<PartName, PartState>();
  private bodyLengthImage = 0;
  private lastPushT: number | null = null;

  push(pose: PreparedPose, tS: number): void {
    this.lastPushT = tS;
    this.bodyLengthImage = pose.bodyLengthImage;
    this.pushPart('hipMid', pose.hipMid.x, pose.hipMid.y, tS);
    for (const [part, landmark] of Object.entries(PART_LANDMARK) as [PartName, number][]) {
      const p = pose.points[landmark];
      if (p !== undefined && p.ok) this.pushPart(part, p.x, p.y, tS);
      // A part not seen this frame simply holds its last state.
    }
  }

  sample(tS: number): BuddyDrawPose | null {
    const hip = this.parts.get('hipMid');
    if (hip === undefined || this.lastPushT === null) return null;
    const fresh = tS - this.lastPushT <= BUDDY_FRESH_MAX_AGE_S;
    const at = (part: PartName): BuddyPoint => {
      const s = this.parts.get(part) ?? hip;
      // Horizon = age + 30 ms ahead + the smoother's own lag (exactly v*tau
      // at steady speed, so adding tau cancels it).
      const dtRaw = Math.max(0, tS - s.lastT) + BUDDY_PREDICTION_S + BUDDY_POSITION_SMOOTH_S;
      // Saturating look-ahead: ~dtRaw while fresh, -> cap while coasting.
      const dtEff = BUDDY_EXTRAPOLATION_CAP_S * (1 - Math.exp(-dtRaw / BUDDY_EXTRAPOLATION_CAP_S));
      return { x: s.x + s.vx * dtEff, y: s.y + s.vy * dtEff };
    };
    return {
      head: at('head'),
      shoulderL: at('shoulderL'),
      shoulderR: at('shoulderR'),
      handL: at('handL'),
      handR: at('handR'),
      hipMid: at('hipMid'),
      footL: at('footL'),
      footR: at('footR'),
      bodyLengthImage: this.bodyLengthImage,
      fresh,
    };
  }

  private pushPart(part: PartName, x: number, y: number, tS: number): void {
    let s = this.parts.get(part);
    if (s === undefined) {
      s = { x, y, vx: 0, vy: 0, lastT: tS, seen: false };
      this.parts.set(part, s);
    }
    if (s.seen) {
      const dtS = Math.max(tS - s.lastT, 1e-4);
      const posAlpha = dtS / (dtS + BUDDY_POSITION_SMOOTH_S);
      const prevX = s.x;
      const prevY = s.y;
      s.x += posAlpha * (x - s.x);
      s.y += posAlpha * (y - s.y);
      const vxInst = (s.x - prevX) / dtS;
      const vyInst = (s.y - prevY) / dtS;
      const velAlpha = dtS / (dtS + BUDDY_VELOCITY_SMOOTH_S);
      s.vx += velAlpha * (vxInst - s.vx);
      s.vy += velAlpha * (vyInst - s.vy);
    }
    s.lastT = tS;
    s.seen = true;
  }
}

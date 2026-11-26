// Start-up check (M1.3; DESIGN start-up check table): before each round, a
// kid's circle goes green once they're seen head to ankles for 1 s. Every
// problem maps to a spoken fix (line ids consumed by the M1.6 narrator CSV).

import { POSE } from '../tracking/clip-format.ts';
import type { LumaStats } from '../tracking/pose-source';
import {
  STARTUP_BACKLIGHT_BG_LUMA_MIN_RATIO,
  STARTUP_BACKLIGHT_DELTA_MIN_RATIO,
  STARTUP_BLIP_TOLERANCE_S,
  STARTUP_CHECK_FULL_BODY_S,
  STARTUP_DARK_LUMA_MAX_RATIO,
  STARTUP_FEET_EDGE_Y_RATIO,
  STARTUP_FLICKER_MAX_RATIO,
  STARTUP_TOO_CLOSE_SPAN_RATIO,
} from './config.ts';
import type { PlayerView } from './players.ts';

export type StartupProblem =
  'crowded' | 'dark' | 'too-close' | 'feet-out' | 'backlight' | 'not-seen';

/** Voice line ids per problem (wordings live in voice/lines.en.csv, M1.6). */
export const STARTUP_VOICE_LINES: Record<StartupProblem, string> = {
  'feet-out': 'startup.feet-out',
  'too-close': 'startup.too-close',
  dark: 'startup.dark',
  backlight: 'startup.backlight',
  crowded: 'startup.crowded',
  'not-seen': 'startup.not-seen',
};

export interface StartupStatus {
  ready: boolean;
  problem: StartupProblem | null;
  /** 0..1 fill of the circle while the full-body second accumulates. */
  progress01: number;
}

interface HeadAnkles {
  noseY: number;
  ankleMaxY: number;
  spanRatio: number;
  feetOk: boolean;
  headOk: boolean;
}

function headAnkles(player: PlayerView): HeadAnkles | null {
  const pose = player.pose;
  if (pose === null) return null;
  const nose = pose.points[POSE.nose];
  const la = pose.points[POSE.leftAnkle];
  const ra = pose.points[POSE.rightAnkle];
  if (nose === undefined || la === undefined || ra === undefined) return null;
  const feetOk =
    la.ok && ra.ok && la.y < STARTUP_FEET_EDGE_Y_RATIO && ra.y < STARTUP_FEET_EDGE_Y_RATIO;
  const headOk = nose.ok && nose.y > 1 - STARTUP_FEET_EDGE_Y_RATIO;
  const ankleMaxY = Math.max(la.y, ra.y);
  return { noseY: nose.y, ankleMaxY, spanRatio: ankleMaxY - nose.y, feetOk, headOk };
}

/** Mean luma of grid cells outside vs inside the body's horizontal band. */
function backlightDelta(luma: LumaStats, player: PlayerView): number | null {
  const pose = player.pose;
  if (pose === null) return null;
  let minX = 1;
  let maxX = 0;
  for (const p of pose.points) {
    if (!p.ok) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  if (maxX <= minX) return null;
  let bodySum = 0;
  let bodyN = 0;
  let bgSum = 0;
  let bgN = 0;
  for (let c = 0; c < luma.cols; c += 1) {
    const cellCenterX = (c + 0.5) / luma.cols;
    const inBody = cellCenterX >= minX && cellCenterX <= maxX;
    for (let r = 0; r < luma.rows; r += 1) {
      const v = luma.cells[r * luma.cols + c] ?? 0;
      if (inBody) {
        bodySum += v;
        bodyN += 1;
      } else {
        bgSum += v;
        bgN += 1;
      }
    }
  }
  if (bodyN === 0 || bgN === 0) return null;
  const bg = bgSum / bgN;
  const body = bodySum / bodyN;
  return bg >= STARTUP_BACKLIGHT_BG_LUMA_MIN_RATIO ? bg - body : null;
}

export class StartupChecker {
  private fullBodySinceS: number | null = null;
  private problemSinceS: number | null = null;
  private lastLuma: LumaStats | null = null;
  /** Recent problem fraction (EWMA with a ~1 s time constant). */
  private flickerEwma = 0;
  private prevTS: number | null = null;

  update(tS: number, player: PlayerView, luma?: LumaStats): StartupStatus {
    if (luma !== undefined) this.lastLuma = luma;
    const dtS = this.prevTS === null ? 1 / 30 : Math.max(tS - this.prevTS, 1e-4);
    this.prevTS = tS;
    const ewmaAlpha = Math.min(1, dtS); // ~1 s time constant

    const problem = this.detectProblem(player);
    this.flickerEwma = ewmaAlpha * (problem !== null ? 1 : 0) + (1 - ewmaAlpha) * this.flickerEwma;

    if (problem !== null) {
      this.problemSinceS ??= tS;
      // A micro-blip (single dropped frames) is reported but doesn't nuke the
      // accumulated progress; a PERSISTING problem resets it.
      if (tS - this.problemSinceS >= STARTUP_BLIP_TOLERANCE_S) this.fullBodySinceS = null;
    } else {
      this.problemSinceS = null;
      this.fullBodySinceS ??= tS;
    }

    const heldS = this.fullBodySinceS === null ? 0 : tS - this.fullBodySinceS;
    // Ready needs the held second AND a clean recent window: once green, a
    // single flicker doesn't un-green; a dim room's sustained flicker never
    // greens in the first place.
    const ready =
      heldS >= STARTUP_CHECK_FULL_BODY_S && this.flickerEwma <= STARTUP_FLICKER_MAX_RATIO;
    return {
      ready,
      problem,
      progress01: this.fullBodySinceS === null ? 0 : Math.min(1, heldS / STARTUP_CHECK_FULL_BODY_S),
    };
  }

  private detectProblem(player: PlayerView): StartupProblem | null {
    if (player.crowded) return 'crowded';
    if (this.lastLuma !== null && this.lastLuma.mean < STARTUP_DARK_LUMA_MAX_RATIO) return 'dark';
    if (!player.seenNow || player.pose === null) return 'not-seen';

    const ha = headAnkles(player);
    if (ha === null) return 'not-seen';
    if (ha.spanRatio > STARTUP_TOO_CLOSE_SPAN_RATIO || (!ha.headOk && !ha.feetOk)) {
      return 'too-close';
    }
    if (!ha.feetOk || !ha.headOk) return 'feet-out';

    if (this.lastLuma !== null) {
      const delta = backlightDelta(this.lastLuma, player);
      if (delta !== null && delta > STARTUP_BACKLIGHT_DELTA_MIN_RATIO) return 'backlight';
    }
    return null;
  }
}

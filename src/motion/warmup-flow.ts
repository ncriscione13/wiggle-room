// Guided warm-up (M1.10; DESIGN "Warm-up calibration"): both kids side by
// side, shared prompts, per-kid measurements. Per move: prompt -> measure
// window -> evaluate; two tries, then a slower demo, then the age-mode
// default for whoever still failed. Pure directive machine like FreezeCore.

import type { AgeMode, Calibration, Slot } from '../games/types';
import {
  WARMUP_DEFAULT_CALIBRATION_TABLE,
  WARMUP_FALLBACK_BODY_LENGTH_IMAGE_RATIO,
  WARMUP_MOVE_GAP_S,
  WARMUP_MOVE_S,
} from './config.ts';
import type { PreparedPose } from './frame-prep.ts';
import {
  measureArmSpan,
  measureHops,
  measureReach,
  measureSquatDepth,
  measureStanding,
  measureStatueWobble,
  measureStepRate,
  type MeasuredFrame,
} from './warmup.ts';

export type WarmupMoveId = 'stand' | 'statue' | 'reach' | 'arms' | 'squat' | 'hop' | 'run';

interface MoveSpec {
  id: WarmupMoveId;
  lineId: string;
  /** Measure the window; returns null on fail, else the fields to merge. */
  measure(frames: MeasuredFrame[]): Partial<Calibration> | null;
}

export const WARMUP_MOVES: readonly MoveSpec[] = [
  {
    id: 'stand',
    lineId: 'warmup.stand',
    measure: (f) => {
      const m = measureStanding(f);
      return m.ok
        ? { bodyLengthImage: m.bodyLengthImage, standingHipHeightBl: m.standingHipHeightBl }
        : null;
    },
  },
  {
    id: 'statue',
    lineId: 'warmup.statue',
    measure: (f) => {
      const m = measureStatueWobble(f);
      return m.ok ? { statueWobbleBlPerS: m.statueWobbleBlPerS } : null;
    },
  },
  {
    id: 'reach',
    lineId: 'warmup.reach',
    measure: (f) => {
      const m = measureReach(f);
      return m.ok ? { reachHeightBl: m.reachHeightBl } : null;
    },
  },
  {
    id: 'arms',
    lineId: 'warmup.arms',
    measure: (f) => {
      const m = measureArmSpan(f);
      return m.ok ? { armSpanBl: m.armSpanBl } : null;
    },
  },
  {
    id: 'squat',
    lineId: 'warmup.squat',
    measure: (f) => {
      const m = measureSquatDepth(f);
      return m.ok ? { squatDepthRatio: m.squatDepthRatio } : null;
    },
  },
  {
    id: 'hop',
    lineId: 'warmup.hop',
    measure: (f) => {
      const m = measureHops(f);
      return m.ok ? { hopHeightBl: m.hopHeightBl } : null;
    },
  },
  {
    id: 'run',
    lineId: 'warmup.run',
    measure: (f) => {
      const m = measureStepRate(f);
      return m.ok ? { stepRatePerS: m.stepRatePerS } : null;
    },
  },
];

export type WarmupDirective =
  | { type: 'say'; lineId: string }
  | { type: 'move'; move: WarmupMoveId; phase: 'prompt' | 'measure' }
  | { type: 'done'; calibrations: (Calibration | null)[] };

export interface WarmupFlowConfig {
  slots: Slot[];
  modes: [AgeMode, AgeMode];
}

type Phase = 'intro' | 'prompt' | 'measure' | 'done';

export class WarmupFlow {
  private readonly cfg: WarmupFlowConfig;
  private readonly frames: [MeasuredFrame[], MeasuredFrame[]] = [[], []];
  private readonly measured: [Partial<Calibration>, Partial<Calibration>] = [{}, {}];
  private readonly lastBodyLength: [number | null, number | null] = [null, null];
  private phase: Phase = 'intro';
  private phaseEndS = -Infinity;
  private moveIndex = 0;
  private tryNumber = 1;
  private started = false;
  private out: WarmupDirective[] = [];

  constructor(cfg: WarmupFlowConfig) {
    this.cfg = cfg;
  }

  /** Feed prepared poses (only measure windows are recorded). */
  push(slot: Slot, pose: PreparedPose, tS: number): void {
    this.lastBodyLength[slot] = pose.bodyLengthImage;
    if (this.phase === 'measure' && this.cfg.slots.includes(slot)) {
      this.frames[slot].push({ tS, pose });
    }
  }

  tick(tS: number): WarmupDirective[] {
    this.out = [];
    if (!this.started) {
      this.started = true;
      this.out.push({ type: 'say', lineId: 'warmup.intro' });
      this.phase = 'prompt';
      this.phaseEndS = tS; // prompt immediately on the next block
    }
    while (tS >= this.phaseEndS && this.phase !== 'done') {
      this.advance(this.phaseEndS === -Infinity ? tS : this.phaseEndS);
    }
    return this.out;
  }

  private advance(atS: number): void {
    const move = WARMUP_MOVES[this.moveIndex];
    if (move === undefined) {
      this.finish();
      return;
    }
    if (this.phase === 'prompt') {
      if (this.tryNumber === 3) this.out.push({ type: 'say', lineId: 'warmup.slow-demo' });
      this.out.push({ type: 'say', lineId: move.lineId });
      this.out.push({ type: 'move', move: move.id, phase: 'prompt' });
      this.phase = 'measure';
      this.phaseEndS = atS + WARMUP_MOVE_GAP_S + WARMUP_MOVE_S;
      for (const slot of this.cfg.slots) this.frames[slot] = [];
      this.out.push({ type: 'move', move: move.id, phase: 'measure' });
      return;
    }
    // Measure window over: evaluate every active kid on this move.
    let anyFailed = false;
    for (const slot of this.cfg.slots) {
      if (this.hasMeasured(slot, this.moveIndex)) continue;
      const result = move.measure(this.frames[slot]);
      if (result !== null) Object.assign(this.measured[slot], result);
      else anyFailed = true;
    }
    if (anyFailed && this.tryNumber < 3) {
      this.tryNumber += 1;
    } else {
      if (anyFailed) {
        // Slow demo also failed: age defaults for whoever is missing.
        for (const slot of this.cfg.slots) this.applyDefault(slot, this.moveIndex);
      }
      this.moveIndex += 1;
      this.tryNumber = 1;
    }
    if (this.moveIndex >= WARMUP_MOVES.length) {
      this.finish();
      return;
    }
    this.phase = 'prompt';
    this.phaseEndS = atS; // prompt right away
  }

  private hasMeasured(slot: Slot, moveIndex: number): boolean {
    const probe = WARMUP_MOVES[moveIndex]?.id;
    const m = this.measured[slot];
    switch (probe) {
      case 'stand':
        return m.standingHipHeightBl !== undefined;
      case 'statue':
        return m.statueWobbleBlPerS !== undefined;
      case 'reach':
        return m.reachHeightBl !== undefined;
      case 'arms':
        return m.armSpanBl !== undefined;
      case 'squat':
        return m.squatDepthRatio !== undefined;
      case 'hop':
        return m.hopHeightBl !== undefined;
      case 'run':
        return m.stepRatePerS !== undefined;
      default:
        return true;
    }
  }

  private applyDefault(slot: Slot, moveIndex: number): void {
    if (this.hasMeasured(slot, moveIndex)) return;
    const d = WARMUP_DEFAULT_CALIBRATION_TABLE[this.cfg.modes[slot]];
    const m = this.measured[slot];
    switch (WARMUP_MOVES[moveIndex]?.id) {
      case 'stand':
        m.standingHipHeightBl = d.standingHipHeightBl;
        break;
      case 'statue':
        m.statueWobbleBlPerS = d.statueWobbleBlPerS;
        break;
      case 'reach':
        m.reachHeightBl = d.reachHeightBl;
        break;
      case 'arms':
        m.armSpanBl = d.armSpanBl;
        break;
      case 'squat':
        m.squatDepthRatio = d.squatDepthRatio;
        break;
      case 'hop':
        m.hopHeightBl = d.hopHeightBl;
        break;
      case 'run':
        m.stepRatePerS = d.stepRatePerS;
        break;
      default:
        break;
    }
  }

  private finish(): void {
    this.phase = 'done';
    this.out.push({ type: 'say', lineId: 'warmup.done' });
    const calibrations: (Calibration | null)[] = [null, null];
    for (const slot of this.cfg.slots) {
      const m = this.measured[slot];
      const d = WARMUP_DEFAULT_CALIBRATION_TABLE[this.cfg.modes[slot]];
      calibrations[slot] = {
        bodyLengthImage:
          m.bodyLengthImage ?? this.lastBodyLength[slot] ?? WARMUP_FALLBACK_BODY_LENGTH_IMAGE_RATIO,
        standingHipHeightBl: m.standingHipHeightBl ?? d.standingHipHeightBl,
        statueWobbleBlPerS: m.statueWobbleBlPerS ?? d.statueWobbleBlPerS,
        reachHeightBl: m.reachHeightBl ?? d.reachHeightBl,
        armSpanBl: m.armSpanBl ?? d.armSpanBl,
        squatDepthRatio: m.squatDepthRatio ?? d.squatDepthRatio,
        hopHeightBl: m.hopHeightBl ?? d.hopHeightBl,
        stepRatePerS: m.stepRatePerS ?? d.stepRatePerS,
        measuredAtMs: Date.now(),
      };
    }
    this.out.push({ type: 'done', calibrations });
  }
}

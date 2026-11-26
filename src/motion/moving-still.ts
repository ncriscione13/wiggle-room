// Moving/still detector (M1.4; DESIGN "Motion kit" events table). Motion
// energy = mean speed of the smoothed core points, in body lengths per
// second. Asymmetric timing by design: becoming MOVING is fast (a kid caught
// moving during a freeze must register within 150 ms), becoming STILL needs
// the 0.5 s hold (a freeze must be confirmed). Hysteresis sits around the
// kid's own still line (warm-up; default until then).

import { POSE } from '../tracking/clip-format.ts';
import {
  MOVING_CONFIRM_S,
  MOVING_ENTER_HI_COEFF,
  STILL_ENTER_LO_COEFF,
  STILL_LINE_DEFAULT_BL_PER_S,
  STILL_MOVING_HOLD_S,
} from './config.ts';
import type { PreparedPose } from './frame-prep.ts';
import { OneEuroPoint } from './one-euro.ts';

/** Joints that carry intent; face detail would only add noise. */
const CORE_POINTS: readonly number[] = [
  POSE.nose,
  POSE.leftWrist,
  POSE.rightWrist,
  POSE.leftKnee,
  POSE.rightKnee,
  POSE.leftAnkle,
  POSE.rightAnkle,
];

export interface MovingStillResult {
  moving: boolean;
  /** True on the frame the state flipped. */
  changed: boolean;
  /** Current smoothed motion energy, BL/s. */
  energyBlPerS: number;
}

export class MovingStillDetector {
  private readonly hiBlPerS: number;
  private readonly loBlPerS: number;

  private readonly filters = new Map<number, OneEuroPoint>();
  private readonly prevSmoothed = new Map<number, { x: number; y: number }>();
  private prevT: number | null = null;
  private moving = false;
  private aboveSinceS: number | null = null;
  private belowSinceS: number | null = null;

  constructor(stillLineBlPerS: number = STILL_LINE_DEFAULT_BL_PER_S) {
    this.hiBlPerS = stillLineBlPerS * MOVING_ENTER_HI_COEFF;
    this.loBlPerS = stillLineBlPerS * STILL_ENTER_LO_COEFF;
  }

  update(pose: PreparedPose, tS: number): MovingStillResult {
    const dtS = this.prevT === null ? null : Math.max(tS - this.prevT, 1e-4);
    this.prevT = tS;

    let speedSum = 0;
    let speedCount = 0;
    for (const idx of CORE_POINTS) {
      const p = pose.points[idx];
      if (p === undefined || !p.ok) continue;
      let filter = this.filters.get(idx);
      if (filter === undefined) {
        filter = new OneEuroPoint();
        this.filters.set(idx, filter);
      }
      const smoothed = filter.filter(p.x, p.y, tS);
      const prev = this.prevSmoothed.get(idx);
      if (prev !== undefined && dtS !== null) {
        const dist = Math.hypot(smoothed.x - prev.x, smoothed.y - prev.y);
        speedSum += dist / pose.bodyLengthImage / dtS;
        speedCount += 1;
      }
      this.prevSmoothed.set(idx, smoothed);
    }
    const energyBlPerS = speedCount > 0 ? speedSum / speedCount : 0;

    let changed = false;
    if (!this.moving) {
      if (energyBlPerS > this.hiBlPerS) {
        this.aboveSinceS ??= tS;
        if (tS - this.aboveSinceS >= MOVING_CONFIRM_S) {
          this.moving = true;
          changed = true;
          this.belowSinceS = null;
        }
      } else {
        this.aboveSinceS = null;
      }
    } else {
      if (energyBlPerS < this.loBlPerS) {
        this.belowSinceS ??= tS;
        if (tS - this.belowSinceS >= STILL_MOVING_HOLD_S) {
          this.moving = false;
          changed = true;
          this.aboveSinceS = null;
        }
      } else {
        this.belowSinceS = null;
      }
    }

    return { moving: this.moving, changed, energyBlPerS };
  }
}

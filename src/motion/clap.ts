// Clap detector (M1.8): wrists rushing together and meeting. Fires at
// contact -- the start of the audible moment (CLAUDE.md rule 4). Hysteresis:
// hands must separate well past the contact gap before the next clap can
// fire, so praying hands and jittery near-touches never spam.

import { POSE } from '../tracking/clip-format.ts';
import {
  CLAP_CONTACT_GAP_BL,
  CLAP_MIN_CLOSE_SPEED_BL_PER_S,
  CLAP_REARM_GAP_BL,
  EVENT_DEBOUNCE_S,
} from './config.ts';
import { EventDebounce } from './debounce.ts';
import type { PreparedPose } from './frame-prep.ts';

export class ClapDetector {
  private armed = false;
  private prevGapBl: number | null = null;
  private prevT: number | null = null;
  private readonly debounce = new EventDebounce(EVENT_DEBOUNCE_S);

  /** Feed each prepared pose; true exactly when a clap fires. */
  update(pose: PreparedPose, tS: number): boolean {
    const lw = pose.points[POSE.leftWrist];
    const rw = pose.points[POSE.rightWrist];
    if (lw === undefined || rw === undefined || !lw.ok || !rw.ok) {
      // Lost hands: keep state, fire nothing (benefit of the doubt).
      this.prevGapBl = null;
      this.prevT = null;
      return false;
    }
    const gapBl = Math.hypot(lw.xBl - rw.xBl, lw.yBl - rw.yBl);

    let fired = false;
    if (this.armed && gapBl <= CLAP_CONTACT_GAP_BL && this.prevGapBl !== null) {
      const dtS = Math.max((this.prevT !== null ? tS - this.prevT : 0) || 1e-4, 1e-4);
      const closeSpeed = (this.prevGapBl - gapBl) / dtS;
      if (closeSpeed >= CLAP_MIN_CLOSE_SPEED_BL_PER_S && this.debounce.tryFire(tS)) {
        fired = true;
        this.armed = false;
      }
    }
    if (gapBl >= CLAP_REARM_GAP_BL) this.armed = true;

    this.prevGapBl = gapBl;
    this.prevT = tS;
    return fired;
  }
}

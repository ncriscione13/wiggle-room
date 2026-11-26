// Parent gate (M1.10; DESIGN: hold 3 s). Kids on the floor can't do it; a
// grown-up can. Two front doors share one timer: hold the P key (desktop),
// or press-and-hold the top-right corner (phones have no P key -- phone
// play round 1).

import { PARENT_GATE_HOLD_S } from '../motion/config';
import type { KeyTarget } from '../motion/keyboard';

/** The shared hold-to-open timer. */
class HoldTimer {
  private heldSinceS: number | null = null;
  private fired = false;
  private readonly now: () => number;
  private readonly onOpen: () => void;

  constructor(now: () => number, onOpen: () => void) {
    this.now = now;
    this.onOpen = onOpen;
  }

  down(): void {
    this.heldSinceS ??= this.now(); // repeats keep the original start
  }

  up(): void {
    this.heldSinceS = null;
    this.fired = false;
  }

  tick(): void {
    if (this.fired || this.heldSinceS === null) return;
    if (this.now() - this.heldSinceS >= PARENT_GATE_HOLD_S) {
      this.fired = true;
      this.onOpen();
    }
  }

  progress01(): number {
    if (this.heldSinceS === null) return 0;
    return Math.min(1, (this.now() - this.heldSinceS) / PARENT_GATE_HOLD_S);
  }
}

export class HoldKeyGate {
  private readonly timer: HoldTimer;
  private readonly off: () => void;

  constructor(target: KeyTarget, now: () => number, onOpen: () => void, key = 'p') {
    this.timer = new HoldTimer(now, onOpen);
    const down = (e: { key: string }): void => {
      if (e.key.toLowerCase() !== key) return;
      this.timer.down(); // auto-repeat keeps the original start
    };
    const up = (e: { key: string }): void => {
      if (e.key.toLowerCase() !== key) return;
      this.timer.up();
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    this.off = (): void => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
    };
  }

  /** Call regularly (e.g. every frame or on an interval). */
  tick(): void {
    this.timer.tick();
  }

  progress01(): number {
    return this.timer.progress01();
  }

  close(): void {
    this.off();
  }
}

/** The pointer events a corner hold-zone element emits. Anything that ends
 * or leaves the press resets the hold (a kid swiping across never opens). */
export type PointerHoldEvent = 'pointerdown' | 'pointerup' | 'pointercancel' | 'pointerleave';

export interface PointerHoldTarget {
  addEventListener(type: PointerHoldEvent, fn: () => void): void;
  removeEventListener(type: PointerHoldEvent, fn: () => void): void;
}

export class HoldPointerGate {
  private readonly timer: HoldTimer;
  private readonly off: () => void;

  constructor(target: PointerHoldTarget, now: () => number, onOpen: () => void) {
    this.timer = new HoldTimer(now, onOpen);
    const down = (): void => {
      this.timer.down();
    };
    const up = (): void => {
      this.timer.up();
    };
    target.addEventListener('pointerdown', down);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
    target.addEventListener('pointerleave', up);
    this.off = (): void => {
      target.removeEventListener('pointerdown', down);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      target.removeEventListener('pointerleave', up);
    };
  }

  /** Call regularly (e.g. every frame or on an interval). */
  tick(): void {
    this.timer.tick();
  }

  progress01(): number {
    return this.timer.progress01();
  }

  close(): void {
    this.off();
  }
}

// Parent gate (M1.10; DESIGN: keyboard only, hold a key 3 s). Kids on the
// floor can't do it; a grown-up at the keyboard can.

import { PARENT_GATE_HOLD_S } from '../motion/config';
import type { KeyTarget } from '../motion/keyboard';

export class HoldKeyGate {
  private heldSinceS: number | null = null;
  private fired = false;
  private readonly now: () => number;
  private readonly onOpen: () => void;
  private readonly off: () => void;

  constructor(target: KeyTarget, now: () => number, onOpen: () => void, key = 'p') {
    this.now = now;
    this.onOpen = onOpen;
    const down = (e: { key: string }): void => {
      if (e.key.toLowerCase() !== key) return;
      this.heldSinceS ??= this.now(); // auto-repeat keeps the original start
    };
    const up = (e: { key: string }): void => {
      if (e.key.toLowerCase() !== key) return;
      this.heldSinceS = null;
      this.fired = false;
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

  close(): void {
    this.off();
  }
}

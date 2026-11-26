// Event debounce (M1.1): the same event can't fire twice within the window
// (CLAUDE.md rule 6: 150 ms). Measured from the last FIRED event.

export class EventDebounce {
  private readonly minGapS: number;
  private lastFiredTS = -Infinity;

  constructor(minGapS: number) {
    this.minGapS = minGapS;
  }

  /** True (and consumes the slot) if an event at tS may fire. */
  tryFire(tS: number): boolean {
    if (tS - this.lastFiredTS < this.minGapS) return false;
    this.lastFiredTS = tS;
    return true;
  }

  reset(): void {
    this.lastFiredTS = -Infinity;
  }
}

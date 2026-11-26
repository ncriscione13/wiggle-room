// Hysteresis (M1.1): separate "becomes true" / "becomes false" lines so a
// value hovering near a single threshold can't chatter (CLAUDE.md rule 6).

export class Hysteresis {
  private readonly hi: number;
  private readonly lo: number;
  private state: boolean;

  constructor(hi: number, lo: number, initial = false) {
    if (hi <= lo) throw new Error(`hysteresis: hi (${String(hi)}) must be > lo (${String(lo)})`);
    this.hi = hi;
    this.lo = lo;
    this.state = initial;
  }

  get value(): boolean {
    return this.state;
  }

  update(v: number): boolean {
    if (!this.state && v > this.hi) this.state = true;
    else if (this.state && v < this.lo) this.state = false;
    return this.state;
  }
}

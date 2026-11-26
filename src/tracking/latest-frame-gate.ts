// The "never queue frames" rule as a pure gate (M0.9, CLAUDE.md rule 2):
// at most one item in flight; while busy only the newest offer survives, and
// every superseded item is disposed (VideoFrames must be close()d promptly or
// the capture pipeline stalls).

export class LatestFrameGate<T> {
  private readonly dispose: ((item: T) => void) | undefined;
  private busy = false;
  private pending: T | null = null;

  constructor(dispose?: (item: T) => void) {
    this.dispose = dispose;
  }

  /** Offer a new item: returns it for immediate processing when idle, or
   * null when busy (the item becomes the single queued-newest). */
  offer(item: T): T | null {
    if (!this.busy) {
      this.busy = true;
      return item;
    }
    if (this.pending !== null) this.dispose?.(this.pending);
    this.pending = item;
    return null;
  }

  /** Processing finished: returns the queued-newest to process next (gate
   * stays busy), or null when idle. */
  done(): T | null {
    if (this.pending !== null) {
      const next = this.pending;
      this.pending = null;
      return next;
    }
    this.busy = false;
    return null;
  }

  /** Drop any queued item (disposed) and reset to idle. */
  clear(): void {
    if (this.pending !== null) this.dispose?.(this.pending);
    this.pending = null;
    this.busy = false;
  }
}

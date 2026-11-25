// Deterministic PRNG for synthetic clips: same clip name -> same bytes,
// forever, so clip tests can pin exact counts.

export function hashSeed(text: string): number {
  // FNV-1a 32-bit.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class Rand {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** mulberry32: uniform [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Gaussian via Box-Muller. */
  gauss(sigma: number): number {
    const u = Math.max(this.next(), 1e-12);
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sigma;
  }

  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1;
  }
}

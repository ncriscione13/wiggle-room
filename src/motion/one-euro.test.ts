import { describe, expect, it } from 'vitest';
import { OneEuroFilter, OneEuroPoint } from './one-euro';

// M1.1: the One Euro filter -- heavy smoothing when nearly still, almost none
// when moving fast (DESIGN.md "Motion kit" step 3).

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const stddev = (xs: number[]): number => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
};

describe('OneEuroFilter (M1.1)', () => {
  it('passes the first sample through unchanged', () => {
    const f = new OneEuroFilter();
    expect(f.filter(0.42, 0)).toBe(0.42);
  });

  it('crushes jitter on a still signal (heavy smoothing when slow)', () => {
    const rand = seeded(7);
    const f = new OneEuroFilter();
    const noisyIn: number[] = [];
    const out: number[] = [];
    for (let i = 0; i < 300; i += 1) {
      const v = 0.5 + (rand() - 0.5) * 0.01; // +-0.005 jitter around 0.5
      noisyIn.push(v);
      out.push(f.filter(v, i / 30));
    }
    const settled = out.slice(60);
    expect(stddev(settled)).toBeLessThan(stddev(noisyIn.slice(60)) * 0.35);
    // And it stays centered, not biased away.
    const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
    expect(mean).toBeCloseTo(0.5, 2);
  });

  it('tracks fast motion with little lag (light smoothing when fast)', () => {
    const f = new OneEuroFilter();
    // Warm up still, then a fast ramp at 2 BL/s equivalent.
    let t = 0;
    for (let i = 0; i < 30; i += 1, t += 1 / 30) f.filter(0.2, t);
    let lastIn = 0.2;
    let lastOut = 0.2;
    for (let i = 0; i < 30; i += 1, t += 1 / 30) {
      lastIn += 2 / 30; // 2 units per second
      lastOut = f.filter(lastIn, t);
    }
    const lagS = (lastIn - lastOut) / 2; // distance behind / speed
    expect(lagS).toBeLessThan(0.05); // under ~50 ms of lag at speed
  });

  it('reset() forgets history', () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    f.filter(0, 1 / 30);
    f.reset();
    expect(f.filter(9, 1)).toBe(9);
  });

  it('survives duplicate timestamps without NaN', () => {
    const f = new OneEuroFilter();
    f.filter(1, 0.5);
    const out = f.filter(2, 0.5); // dt = 0
    expect(Number.isFinite(out)).toBe(true);
  });
});

describe('OneEuroPoint (M1.1)', () => {
  it('filters x and y independently', () => {
    const p = new OneEuroPoint();
    const first = p.filter(0.1, 0.9, 0);
    expect(first).toEqual({ x: 0.1, y: 0.9 });
    const rand = seeded(3);
    let last = first;
    for (let i = 1; i <= 120; i += 1) {
      last = p.filter(0.1 + (rand() - 0.5) * 0.004, 0.9 + (rand() - 0.5) * 0.004, i / 30);
    }
    expect(last.x).toBeCloseTo(0.1, 2);
    expect(last.y).toBeCloseTo(0.9, 2);
  });
});

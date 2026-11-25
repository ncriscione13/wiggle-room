import { describe, expect, it } from 'vitest';
import { RollingStats } from './stats';

// M0.4: per-stage timing numbers for the overlay (and later the device check
// and bench). Windowed, so the overlay shows "now", not session history.

describe('RollingStats (M0.4)', () => {
  it('reports mean over what was pushed', () => {
    const s = new RollingStats(10);
    for (const v of [1, 2, 3, 4]) s.push(v);
    expect(s.mean()).toBeCloseTo(2.5, 10);
    expect(s.count()).toBe(4);
  });

  it('drops old samples beyond the window', () => {
    const s = new RollingStats(3);
    for (const v of [100, 1, 2, 3]) s.push(v);
    expect(s.mean()).toBeCloseTo(2, 10);
    expect(s.count()).toBe(3);
  });

  it('p99 is standard nearest-rank: the 99th of 100 ascending samples', () => {
    const s = new RollingStats(200);
    for (let i = 1; i <= 100; i += 1) s.push(i);
    expect(s.p99()).toBe(99);
    expect(s.mean()).toBeCloseTo(50.5, 10);
    expect(s.max()).toBe(100);
  });

  it('max() and empty behavior are sane', () => {
    const s = new RollingStats(5);
    expect(s.mean()).toBe(0);
    expect(s.p99()).toBe(0);
    expect(s.max()).toBe(0);
    s.push(7);
    expect(s.max()).toBe(7);
  });
});

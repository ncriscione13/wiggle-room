import { describe, expect, it } from 'vitest';
import { Hysteresis } from './hysteresis';

// M1.1: separate "becomes true" and "becomes false" thresholds so a value
// hovering near one line can't chatter (CLAUDE.md rule 6).

describe('Hysteresis (M1.1)', () => {
  it('turns on above hi, off below lo, holds in between', () => {
    const h = new Hysteresis(0.6, 0.4);
    expect(h.update(0.5)).toBe(false); // starts false, between lines
    expect(h.update(0.7)).toBe(true); // above hi
    expect(h.update(0.5)).toBe(true); // between: holds true
    expect(h.update(0.39)).toBe(false); // below lo
    expect(h.update(0.5)).toBe(false); // between: holds false
  });

  it('never chatters while hovering exactly between the lines', () => {
    const h = new Hysteresis(0.6, 0.4, true);
    const states = [0.55, 0.45, 0.59, 0.41, 0.5].map((v) => h.update(v));
    expect(new Set(states).size).toBe(1);
  });

  it('respects the initial state', () => {
    expect(new Hysteresis(0.6, 0.4, true).value).toBe(true);
    expect(new Hysteresis(0.6, 0.4).value).toBe(false);
  });

  it('rejects hi <= lo (a silent always-chatter config)', () => {
    expect(() => new Hysteresis(0.4, 0.6)).toThrow(/hi/i);
  });
});

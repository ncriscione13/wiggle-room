import { describe, expect, it } from 'vitest';
import { SessionTimer } from './session';
import { SESSION_HEADSUP_S } from '../motion/config';

// M1.10: session timer -- 2-minute heads-up, then time-up (cool-down).

describe('SessionTimer (M1.10)', () => {
  it('fires heads-up once, then time-up once', () => {
    const t = new SessionTimer(300); // 5 min session starting at t=10
    expect(t.update(10)).toEqual([]);
    expect(t.update(10 + 300 - SESSION_HEADSUP_S)).toEqual(['heads-up']);
    expect(t.update(10 + 300 - SESSION_HEADSUP_S + 1)).toEqual([]);
    expect(t.update(10 + 300)).toEqual(['time-up']);
    expect(t.update(10 + 301)).toEqual([]);
    expect(t.timeUp).toBe(true);
  });

  it('a session shorter than the heads-up window says it right away', () => {
    const t = new SessionTimer(5);
    expect(t.update(0)).toEqual(['heads-up']); // under 2 min left from the start
    expect(t.update(6)).toEqual(['time-up']);
  });

  it('unlimited sessions never fire', () => {
    const t = new SessionTimer(null);
    expect(t.update(0)).toEqual([]);
    expect(t.update(100000)).toEqual([]);
    expect(t.timeUp).toBe(false);
  });
});

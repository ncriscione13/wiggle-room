import { describe, expect, it } from 'vitest';
import { EVENT_DEBOUNCE_S } from './config';
import { EventDebounce } from './debounce';

// M1.1: the same event can't fire twice within 150 ms (CLAUDE.md rule 6).

describe('EventDebounce (M1.1)', () => {
  it('fires the first attempt, blocks repeats inside the window', () => {
    const d = new EventDebounce(EVENT_DEBOUNCE_S);
    expect(d.tryFire(1.0)).toBe(true);
    expect(d.tryFire(1.1)).toBe(false);
    expect(d.tryFire(1.149)).toBe(false);
    expect(d.tryFire(1.151)).toBe(true);
  });

  it('windows are measured from the last FIRED event, not the last attempt', () => {
    const d = new EventDebounce(0.15);
    d.tryFire(1.0);
    d.tryFire(1.1); // blocked -- must not extend the window
    expect(d.tryFire(1.16)).toBe(true);
  });

  it('reset() reopens immediately', () => {
    const d = new EventDebounce(0.15);
    d.tryFire(1.0);
    d.reset();
    expect(d.tryFire(1.01)).toBe(true);
  });
});

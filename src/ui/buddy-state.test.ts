import { describe, expect, it } from 'vitest';
import { BuddyReactions } from './buddy-state';
import { BUDDY_GIGGLE_S, BUDDY_CHEER_S } from '../motion/config';

// M1.7: giggle / statue / cheer / wave reactions (DESIGN Freeze Dance:
// statue while still, giggle on wobble -- funny, never a failure).

describe('BuddyReactions (M1.7)', () => {
  it('idles by default and times out a giggle', () => {
    const r = new BuddyReactions();
    expect(r.update(0).kind).toBe('idle');
    r.trigger('giggle', 1);
    const mid = r.update(1 + BUDDY_GIGGLE_S / 2);
    expect(mid.kind).toBe('giggle');
    expect(mid.phase01).toBeGreaterThan(0.3);
    expect(mid.phase01).toBeLessThan(0.7);
    expect(r.update(1 + BUDDY_GIGGLE_S + 0.01).kind).toBe('idle');
  });

  it('statue latches until cleared', () => {
    const r = new BuddyReactions();
    r.trigger('statue', 0);
    expect(r.update(5).kind).toBe('statue');
    r.clearStatue();
    expect(r.update(5.01).kind).toBe('idle');
  });

  it('a giggle breaks a statue (wobble = shake off the snow)', () => {
    const r = new BuddyReactions();
    r.trigger('statue', 0);
    r.trigger('giggle', 1);
    expect(r.update(1.1).kind).toBe('giggle');
    expect(r.update(1 + BUDDY_GIGGLE_S + 0.01).kind).toBe('idle');
  });

  it('cheer wins over giggle while both are active', () => {
    const r = new BuddyReactions();
    r.trigger('giggle', 0);
    r.trigger('cheer', 0.1);
    expect(r.update(0.2).kind).toBe('cheer');
    expect(r.update(0.1 + BUDDY_CHEER_S + 0.01).kind).toBe('idle');
  });

  it('wave runs its course', () => {
    const r = new BuddyReactions();
    r.trigger('wave', 0);
    expect(r.update(0.5).kind).toBe('wave');
  });
});

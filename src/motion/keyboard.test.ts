import { describe, expect, it } from 'vitest';
import { KeyboardMotion, type KeyTarget } from './keyboard';
import type { MotionEvent } from '../games/types';

// CLAUDE.md rule 11: every motion event has a keyboard stand-in -- arrows =
// steps/dancing, space = jump, S = squat, F = hold still, A = arms up,
// Tab switches players. Every game stays playable at a desk and in CI.

type Handler = (e: { key: string; preventDefault(): void }) => void;

function fakeTarget(): KeyTarget & { press(key: string): void; release(key: string): void } {
  const handlers = new Map<string, Set<Handler>>();
  return {
    addEventListener(type: string, handler: Handler): void {
      const set = handlers.get(type) ?? new Set<Handler>();
      set.add(handler);
      handlers.set(type, set);
    },
    removeEventListener(type: string, handler: Handler): void {
      handlers.get(type)?.delete(handler);
    },
    press(key: string): void {
      for (const h of handlers.get('keydown') ?? []) h({ key, preventDefault: () => undefined });
    },
    release(key: string): void {
      for (const h of handlers.get('keyup') ?? []) h({ key, preventDefault: () => undefined });
    },
  };
}

function setup(): {
  target: ReturnType<typeof fakeTarget>;
  kb: KeyboardMotion;
  events: MotionEvent[];
  setNow: (t: number) => void;
} {
  const target = fakeTarget();
  let now = 0;
  const kb = new KeyboardMotion(target, () => now);
  const events: MotionEvent[] = [];
  for (const name of ['moving', 'still', 'jump', 'squat', 'step', 'armsUp'] as const) {
    kb.on(name, (e) => events.push(e));
  }
  return { target, kb, events, setNow: (t) => (now = t) };
}

describe('KeyboardMotion (M1.9)', () => {
  it('arrows = dancing: moving on press, still on release', () => {
    const { target, events, setNow } = setup();
    target.press('ArrowLeft');
    setNow(1);
    target.release('ArrowLeft');
    expect(events.map((e) => e.name)).toEqual(['moving', 'step', 'still']);
    expect(events.every((e) => e.slot === 0)).toBe(true);
  });

  it('Tab switches the controlled player; keyups still clear the old slot', () => {
    const { target, events, setNow } = setup();
    target.press('ArrowLeft'); // slot 0 dances
    setNow(0.5);
    target.press('Tab');
    target.press('ArrowRight'); // slot 1 dances
    setNow(1);
    target.release('ArrowLeft'); // belongs to slot 0 -> slot 0 goes still
    const still = events.filter((e) => e.name === 'still');
    expect(still).toHaveLength(1);
    expect(still[0]?.slot).toBe(0);
    expect(events.some((e) => e.name === 'moving' && e.slot === 1)).toBe(true);
  });

  it('space/S/A map to jump, squat and armsUp for the active slot', () => {
    const { target, events } = setup();
    target.press(' ');
    target.press('s');
    target.press('a');
    expect(events.map((e) => e.name)).toEqual(expect.arrayContaining(['jump', 'squat', 'armsUp']));
  });

  it('F forces still even mid-dance', () => {
    const { target, events, setNow } = setup();
    target.press('ArrowUp');
    setNow(0.4);
    target.press('f');
    const last = events[events.length - 1];
    expect(last?.name).toBe('still');
    expect(last?.tS).toBeCloseTo(0.4, 5);
  });

  it('a slot is paused until its first input, tracked after', () => {
    const { target, kb } = setup();
    expect(kb.tracking(0)).toBe('paused');
    expect(kb.tracking(1)).toBe('paused');
    target.press('ArrowLeft');
    expect(kb.tracking(0)).toBe('tracked');
    expect(kb.tracking(1)).toBe('paused');
  });

  it('serves a synthetic buddy pose centered in the slot half', () => {
    const { target, kb } = setup();
    target.press('ArrowLeft');
    const pose = kb.pose(0);
    expect(pose?.hipMid.x).toBeCloseTo(0.25, 1);
    expect(pose?.fresh).toBe(true);
    target.press('Tab');
    target.press('ArrowRight'); // ArrowLeft is still held by slot 0
    expect(kb.pose(1)?.hipMid.x ?? 0).toBeCloseTo(0.75, 1);
  });

  it('holding a key does not spam events (auto-repeat ignored)', () => {
    const { target, events } = setup();
    target.press('ArrowLeft');
    target.press('ArrowLeft'); // browser auto-repeat
    target.press('ArrowLeft');
    expect(events.filter((e) => e.name === 'moving')).toHaveLength(1);
    // Steps DO repeat (each arrow press is a step) but auto-repeat of a held
    // key must not: only the first press counts.
    expect(events.filter((e) => e.name === 'step')).toHaveLength(1);
  });
});

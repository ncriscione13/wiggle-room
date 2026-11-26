import { describe, expect, it } from 'vitest';
import { HoldKeyGate, HoldPointerGate } from './parent-gate';
import { PARENT_GATE_HOLD_S } from '../motion/config';

// M1.10: the grown-up gate -- hold P for 3 s (keyboard only, DESIGN).

type Handler = (e: { key: string; preventDefault(): void }) => void;

function fakeTarget(): {
  addEventListener(type: string, h: Handler): void;
  removeEventListener(type: string, h: Handler): void;
  press(key: string): void;
  release(key: string): void;
} {
  const handlers = new Map<string, Set<Handler>>();
  return {
    addEventListener(type, h): void {
      const set = handlers.get(type) ?? new Set<Handler>();
      set.add(h);
      handlers.set(type, set);
    },
    removeEventListener(type, h): void {
      handlers.get(type)?.delete(h);
    },
    press(key): void {
      for (const h of handlers.get('keydown') ?? []) h({ key, preventDefault: () => undefined });
    },
    release(key): void {
      for (const h of handlers.get('keyup') ?? []) h({ key, preventDefault: () => undefined });
    },
  };
}

describe('HoldKeyGate (M1.10)', () => {
  it('opens only after the full hold', () => {
    const target = fakeTarget();
    let now = 0;
    let opened = 0;
    const gate = new HoldKeyGate(
      target,
      () => now,
      () => (opened += 1),
    );
    target.press('p');
    now = PARENT_GATE_HOLD_S - 0.5;
    gate.tick();
    expect(opened).toBe(0);
    now = PARENT_GATE_HOLD_S + 0.1;
    gate.tick();
    expect(opened).toBe(1);
    gate.tick(); // still held: no re-fire
    expect(opened).toBe(1);
  });

  it('releasing early cancels; auto-repeat does not restart the clock', () => {
    const target = fakeTarget();
    let now = 0;
    let opened = 0;
    const gate = new HoldKeyGate(
      target,
      () => now,
      () => (opened += 1),
    );
    target.press('p');
    now = 1;
    target.press('p'); // auto-repeat must NOT reset the hold start
    now = 2;
    target.release('p');
    now = 4;
    gate.tick();
    expect(opened).toBe(0);
    // A fresh hold still works.
    target.press('p');
    now = 4 + PARENT_GATE_HOLD_S + 0.1;
    gate.tick();
    expect(opened).toBe(1);
  });

  it('progress reports 0..1 for the hold ring', () => {
    const target = fakeTarget();
    let now = 0;
    const gate = new HoldKeyGate(
      target,
      () => now,
      () => undefined,
    );
    expect(gate.progress01()).toBe(0);
    target.press('P'); // case-insensitive
    now = PARENT_GATE_HOLD_S / 2;
    expect(gate.progress01()).toBeCloseTo(0.5, 2);
  });
});

describe('HoldPointerGate (phone play round 1: no P key on a phone)', () => {
  function pointerTarget(): {
    addEventListener(type: string, h: () => void): void;
    removeEventListener(type: string, h: () => void): void;
    emit(type: string): void;
  } {
    const handlers = new Map<string, Set<() => void>>();
    return {
      addEventListener(type, h): void {
        const set = handlers.get(type) ?? new Set<() => void>();
        set.add(h);
        handlers.set(type, set);
      },
      removeEventListener(type, h): void {
        handlers.get(type)?.delete(h);
      },
      emit(type): void {
        for (const h of handlers.get(type) ?? []) h();
      },
    };
  }

  it('opens only after a full press-and-hold', () => {
    const target = pointerTarget();
    let now = 0;
    let opened = 0;
    const gate = new HoldPointerGate(
      target,
      () => now,
      () => (opened += 1),
    );
    target.emit('pointerdown');
    now = PARENT_GATE_HOLD_S - 0.5;
    gate.tick();
    expect(opened).toBe(0);
    now = PARENT_GATE_HOLD_S + 0.1;
    gate.tick();
    expect(opened).toBe(1);
    gate.tick(); // still held: no re-fire
    expect(opened).toBe(1);
  });

  it('lifting, cancelling or sliding off the corner all reset the hold', () => {
    for (const end of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      const target = pointerTarget();
      let now = 0;
      let opened = 0;
      const gate = new HoldPointerGate(
        target,
        () => now,
        () => (opened += 1),
      );
      target.emit('pointerdown');
      now = 2;
      target.emit(end);
      now = 2 + PARENT_GATE_HOLD_S;
      gate.tick();
      expect(opened, end).toBe(0);
      // A fresh deliberate hold still works afterwards.
      target.emit('pointerdown');
      now = 2 + PARENT_GATE_HOLD_S * 2 + 0.1;
      gate.tick();
      expect(opened, end).toBe(1);
    }
  });

  it('reports hold progress for the corner feedback fill', () => {
    const target = pointerTarget();
    let now = 0;
    const gate = new HoldPointerGate(
      target,
      () => now,
      () => undefined,
    );
    expect(gate.progress01()).toBe(0);
    target.emit('pointerdown');
    now = PARENT_GATE_HOLD_S / 2;
    expect(gate.progress01()).toBeCloseTo(0.5, 2);
  });
});

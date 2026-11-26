import { describe, expect, it, vi } from 'vitest';
import { LatestFrameGate } from './latest-frame-gate';

// M0.9: the "process each new camera frame exactly once, never queue" rule
// (CLAUDE.md rule 2), as a pure gate the worker loop runs on. At most one
// frame in flight; while busy only the NEWEST offered frame survives; every
// skipped frame is disposed (VideoFrames must be close()d or capture stalls).

describe('LatestFrameGate (M0.9)', () => {
  it('returns the item for immediate processing when idle', () => {
    const gate = new LatestFrameGate<string>();
    expect(gate.offer('a')).toBe('a');
  });

  it('queues while busy and returns null', () => {
    const gate = new LatestFrameGate<string>();
    gate.offer('a');
    expect(gate.offer('b')).toBeNull();
  });

  it('disposes a queued item when a newer one arrives (keeps only the newest)', () => {
    const dispose = vi.fn();
    const gate = new LatestFrameGate<string>(dispose);
    gate.offer('a');
    gate.offer('b');
    gate.offer('c');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith('b');
  });

  it('done() hands over the newest queued item and stays busy', () => {
    const gate = new LatestFrameGate<string>();
    gate.offer('a');
    gate.offer('b');
    expect(gate.done()).toBe('b');
    // Still busy: a new offer while processing 'b' must queue.
    expect(gate.offer('c')).toBeNull();
    expect(gate.done()).toBe('c');
    expect(gate.done()).toBeNull(); // now idle
    expect(gate.offer('d')).toBe('d'); // idle again -> immediate
  });

  it('never allows two items in flight across interleavings', () => {
    const gate = new LatestFrameGate<number>();
    let inFlight = 0;
    let maxInFlight = 0;
    const process = (item: number | null): void => {
      if (item === null) return;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      inFlight -= 1;
      process(gate.done());
    };
    for (let i = 0; i < 20; i += 1) process(gate.offer(i));
    expect(maxInFlight).toBe(1);
  });

  it('clear() disposes any queued item and resets to idle', () => {
    const dispose = vi.fn();
    const gate = new LatestFrameGate<string>(dispose);
    gate.offer('a');
    gate.offer('b');
    gate.clear();
    expect(dispose).toHaveBeenCalledWith('b');
    expect(gate.offer('c')).toBe('c'); // idle after clear
  });
});

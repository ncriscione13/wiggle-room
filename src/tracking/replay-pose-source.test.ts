import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClipFile } from './clip-format';
import type { PoseFrame } from './pose-source';
import { ReplayPoseSource } from './replay-pose-source';

// M0.2: ReplayPoseSource plays clips with their original timing (or scaled by
// `speed`). Tests drive a manual clock + fake timers, so timing is exact.

function tinyClip(): ClipFile {
  const pose = Array.from({ length: 33 }, (): [number, number, number, number] => [0.5, 0.5, 0, 1]);
  return {
    version: 1,
    name: 'tiny',
    kind: 'synthetic',
    nominalFps: 10,
    frames: [
      { tS: 0, poses: [pose] },
      { tS: 0.1, poses: [pose] },
      { tS: 0.2, poses: [null] },
      { tS: 0.3, poses: [pose] },
    ],
  };
}

let clock: { t: number };
const now = (): number => clock.t;

function advance(ms: number): void {
  clock.t += ms;
  vi.advanceTimersByTime(ms);
}

beforeEach(() => {
  clock = { t: 0 };
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ReplayPoseSource (M0.2)', () => {
  it('delivers every frame, in order, at the original pace', async () => {
    const source = new ReplayPoseSource(tinyClip(), { now });
    const frames: PoseFrame[] = [];
    source.onFrame((f) => frames.push(f));
    await source.start();

    advance(0); // frame at tS 0 is due immediately
    expect(frames).toHaveLength(1);
    advance(99);
    expect(frames).toHaveLength(1);
    advance(1);
    expect(frames).toHaveLength(2);
    advance(200);
    expect(frames).toHaveLength(4);

    expect(frames.map((f) => f.tS)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(frames[2]?.poses[0]).toBeNull();
    expect(frames[3]?.frameIntervalS).toBeCloseTo(0.1, 5);
    expect(frames.every((f) => f.inferenceS === 0)).toBe(true);
  });

  it('runs twice as fast at speed 2 (the M0.3 render stress mode)', async () => {
    const source = new ReplayPoseSource(tinyClip(), { now, speed: 2 });
    const frames: PoseFrame[] = [];
    source.onFrame((f) => frames.push(f));
    await source.start();

    advance(150); // covers the whole 300 ms clip at 2x
    expect(frames).toHaveLength(4);
    // Timestamps are the replayed timeline (wall-clock-paced), so 2x halves them.
    expect(frames.map((f) => f.tS)).toEqual([0, 0.05, 0.1, 0.15]);
  });

  it('stops delivering after stop()', async () => {
    const source = new ReplayPoseSource(tinyClip(), { now });
    const frames: PoseFrame[] = [];
    source.onFrame((f) => frames.push(f));
    await source.start();
    advance(100);
    expect(frames).toHaveLength(2);
    source.stop();
    advance(1000);
    expect(frames).toHaveLength(2);
  });

  it('fires onEnded once when the clip runs out (no loop)', async () => {
    const source = new ReplayPoseSource(tinyClip(), { now });
    const ended = vi.fn();
    source.onEnded(ended);
    await source.start();
    advance(1000);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it('loops with strictly increasing timestamps when asked to', async () => {
    const source = new ReplayPoseSource(tinyClip(), { now, loop: true });
    const frames: PoseFrame[] = [];
    source.onFrame((f) => frames.push(f));
    await source.start();
    advance(900); // > 2 full passes
    expect(frames.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < frames.length; i += 1) {
      const prev = frames[i - 1];
      const cur = frames[i];
      if (prev && cur) expect(cur.tS).toBeGreaterThan(prev.tS);
    }
    source.stop();
  });

  it('latest() tracks the newest frame; unsubscribe works', async () => {
    const source = new ReplayPoseSource(tinyClip(), { now });
    const seen: number[] = [];
    const off = source.onFrame((f) => seen.push(f.tS));
    expect(source.latest()).toBeNull();
    await source.start();
    advance(100);
    expect(source.latest()?.tS).toBe(0.1);
    off();
    advance(300);
    expect(seen).toEqual([0, 0.1]);
    expect(source.latest()?.tS).toBe(0.3);
  });

  it('start() is idempotent while running', async () => {
    const source = new ReplayPoseSource(tinyClip(), { now });
    const frames: PoseFrame[] = [];
    source.onFrame((f) => frames.push(f));
    await source.start();
    await source.start();
    advance(400);
    expect(frames).toHaveLength(4);
  });

  it('rejects an empty clip', () => {
    const empty: ClipFile = { ...tinyClip(), frames: [] };
    expect(() => new ReplayPoseSource(empty, { now })).toThrow(/frames/i);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { PoseResultLike } from './live-pose-source';
import {
  createWorkerCore,
  type FrameLike,
  type OutMessage,
  type ReaderLike,
  type TrackLike,
} from './pose-worker-core';

// M0.9: the worker core, tested in node with fakes. Covers: init with
// GPU->CPU fallback, the track read loop (newest-frame-only, stale frames
// closed, every processed frame closed), monotonic timestamps, detach
// stopping the transferred track, and detect errors surfacing once.

const lm = (x: number): { x: number; y: number; z: number; visibility: number } => ({
  x,
  y: 0.5,
  z: 0,
  visibility: 1,
});
const onePose = (x: number): PoseResultLike => ({
  landmarks: [Array.from({ length: 33 }, () => lm(x))],
});

function makeFrame(timestampUs: number): FrameLike & { closed: boolean } {
  const frame = {
    timestamp: timestampUs,
    closed: false,
    close(): void {
      frame.closed = true;
    },
  };
  return frame;
}

/** Scripted reader: hands out frames one `read()` at a time. */
function makeScriptedReader(frames: FrameLike[]): ReaderLike & { cancelled: boolean } {
  let i = 0;
  const reader = {
    cancelled: false,
    read(): Promise<{ done: boolean; value?: FrameLike }> {
      if (reader.cancelled || i >= frames.length) return Promise.resolve({ done: true });
      const value = frames[i];
      i += 1;
      return Promise.resolve({ done: false, value });
    },
    cancel(): void {
      reader.cancelled = true;
    },
  };
  return reader;
}

interface Harness {
  sent: OutMessage[];
  core: ReturnType<typeof createWorkerCore>;
  detect: ReturnType<typeof vi.fn>;
  gpuFails?: boolean;
  bothFail?: boolean;
  reader?: ReturnType<typeof makeScriptedReader>;
  track?: TrackLike & { stopped: boolean };
}

function harness(
  options: { gpuFails?: boolean; bothFail?: boolean; frames?: FrameLike[] } = {},
): Harness {
  const sent: OutMessage[] = [];
  const detect = vi.fn((_src: unknown, tMs: number) => onePose(tMs / 1000));
  const h: Harness = { sent, detect, core: null as never };
  if (options.frames) {
    h.reader = makeScriptedReader(options.frames);
    h.track = {
      stopped: false,
      stop(): void {
        if (h.track) h.track.stopped = true;
      },
    };
  }
  let now = 1000;
  h.core = createWorkerCore({
    port: { postMessage: (m) => sent.push(m) },
    now: () => (now += 1),
    createLandmarker: (_cfg, delegate) => {
      if (options.bothFail) return Promise.reject(new Error(`${delegate} boom`));
      if (options.gpuFails && delegate === 'GPU') return Promise.reject(new Error('no GPU'));
      return Promise.resolve({ detectForVideo: detect, close: vi.fn() });
    },
    makeReader: () => {
      if (!h.reader) throw new Error('no reader scripted');
      return h.reader;
    },
  });
  return h;
}

const INIT = {
  type: 'init',
  wasmRoot: '/mediapipe',
  modelUrl: '/models/x.task',
  numPoses: 2,
} as const;
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('pose worker core: init (M0.9)', () => {
  it('reports ready with the GPU delegate when it works', async () => {
    const h = harness();
    h.core.onMessage(INIT);
    await flush();
    expect(h.sent[0]).toMatchObject({ type: 'ready', delegate: 'GPU' });
  });

  it('falls back to CPU when GPU init throws', async () => {
    const h = harness({ gpuFails: true });
    h.core.onMessage(INIT);
    await flush();
    expect(h.sent[0]).toMatchObject({ type: 'ready', delegate: 'CPU' });
  });

  it('reports init-error when both delegates fail', async () => {
    const h = harness({ bothFail: true });
    h.core.onMessage(INIT);
    await flush();
    expect(h.sent[0]).toMatchObject({ type: 'init-error' });
  });

  it('honors an explicit delegateOrder (the ?delegate= pin and CPU-first default)', async () => {
    const h = harness();
    h.core.onMessage({ ...INIT, delegateOrder: ['CPU'] });
    await flush();
    expect(h.sent[0]).toMatchObject({ type: 'ready', delegate: 'CPU' });
  });
});

describe('pose worker core: track loop (M0.9)', () => {
  it('processes frames, posts results with monotonic ms timestamps, closes every frame', async () => {
    const frames = [makeFrame(100_000), makeFrame(133_000), makeFrame(133_000)];
    const h = harness({ frames });
    h.core.onMessage(INIT);
    await flush();
    h.core.onMessage({ type: 'track' }, h.track);
    await flush();
    await flush();

    const results = h.sent.filter(
      (m): m is Extract<OutMessage, { type: 'result' }> => m.type === 'result',
    );
    expect(results.length).toBe(3);
    const ts = results.map((r) => r.tMs);
    expect(ts[0]).toBeCloseTo(100, 5);
    for (let i = 1; i < ts.length; i += 1) expect(ts[i]).toBeGreaterThan(ts[i - 1] ?? 0);
    expect(results[0]).toMatchObject({ type: 'result' });
    for (const f of frames) expect((f as { closed: boolean }).closed).toBe(true);
    expect(h.detect).toHaveBeenCalledTimes(3);
  });

  it('includes converted poses and a measured inference time', async () => {
    const h = harness({ frames: [makeFrame(50_000)] });
    h.core.onMessage(INIT);
    await flush();
    h.core.onMessage({ type: 'track' }, h.track);
    await flush();
    const result = h.sent.find((m) => m.type === 'result');
    if (result?.type !== 'result') throw new Error('no result');
    expect(result.poses).toHaveLength(2);
    expect(result.poses[0]).toHaveLength(33);
    expect(result.poses[1]).toBeNull();
    expect(result.inferenceMs).toBeGreaterThan(0);
  });

  it('detach cancels the reader and stops the transferred track', async () => {
    const h = harness({ frames: [makeFrame(1_000)] });
    h.core.onMessage(INIT);
    await flush();
    h.core.onMessage({ type: 'track' }, h.track);
    await flush();
    h.core.onMessage({ type: 'detach' });
    expect(h.reader?.cancelled).toBe(true);
    expect(h.track?.stopped).toBe(true);
  });

  it('a detect error is reported once and the loop stops cleanly', async () => {
    const frames = [makeFrame(1_000), makeFrame(2_000), makeFrame(3_000)];
    const h = harness({ frames });
    h.detect.mockImplementation(() => {
      throw new Error('wasm exploded');
    });
    h.core.onMessage(INIT);
    await flush();
    h.core.onMessage({ type: 'track' }, h.track);
    await flush();
    await flush();
    const errors = h.sent.filter((m) => m.type === 'error');
    expect(errors.length).toBe(1);
    expect(h.detect).toHaveBeenCalledTimes(1);
    // Everything handed to the loop is still closed.
    expect(frames.every((f) => (f as { closed: boolean }).closed || h.reader?.cancelled)).toBe(
      true,
    );
  });
});

describe('ContinuousClock (M0.9 review: foreign time bases must not pin the timeline)', async () => {
  const { ContinuousClock } = await import('./pose-worker-core');

  it('re-anchors on rebase: a new stream with a LOWER base continues forward', () => {
    const clock = new ContinuousClock();
    expect(clock.next(1_000_000)).toBe(1_000_000);
    clock.next(1_000_033);
    clock.rebase();
    const next = clock.next(5); // brand-new capture clock starting near 0
    expect(next).toBeGreaterThan(1_000_033);
    expect(next - 1_000_033).toBeLessThan(100); // ~one nominal frame, not pinned
    // And the stream keeps native spacing afterwards.
    expect(clock.next(38) - next).toBeCloseTo(33, 5);
  });

  it('small jitter still nudges by 1 µs, never backwards', () => {
    const clock = new ContinuousClock();
    clock.next(100);
    expect(clock.next(100)).toBeCloseTo(100.001, 6);
    expect(clock.next(99.5)).toBeGreaterThan(100.001);
  });

  it('a mid-stream base collapse re-anchors instead of pinning forever', () => {
    const clock = new ContinuousClock();
    clock.next(50_000);
    clock.next(50_033);
    const afterJump = clock.next(10); // base fell off a cliff with no rebase()
    expect(afterJump).toBeGreaterThan(50_033);
    // Follow-up frames advance at native spacing again -- NOT +1 µs steps.
    expect(clock.next(43) - afterJump).toBeCloseTo(33, 5);
  });
});

describe('pose worker core: track replacement (M0.9 review)', () => {
  it('a second track message detaches the first: old track stopped, no forked loop', async () => {
    const framesA = [makeFrame(1_000), makeFrame(34_000)];
    const h = harness({ frames: framesA });
    h.core.onMessage(INIT);
    await flush();
    h.core.onMessage({ type: 'track' }, h.track);
    await flush();

    const trackB: TrackLike & { stopped: boolean } = {
      stopped: false,
      stop(): void {
        trackB.stopped = true;
      },
    };
    const framesB = [makeFrame(500)];
    if (h.reader) h.reader.cancelled = false; // give makeReader a fresh script
    const readerB = makeScriptedReader(framesB);
    h.reader = readerB;
    h.core.onMessage({ type: 'track' }, trackB);
    await flush();

    expect(h.track?.stopped).toBe(true); // first clone released
    expect(trackB.stopped).toBe(false);
    const results = h.sent.filter((m) => m.type === 'result');
    expect(results.length).toBeGreaterThanOrEqual(3); // both streams processed
  });
});

describe('pose worker core: single frame mode (fallback path, M0.9)', () => {
  it('processes a shipped frame and closes it', async () => {
    const h = harness();
    h.core.onMessage(INIT);
    await flush();
    const frame = makeFrame(10_000);
    h.core.onMessage({ type: 'frame', tMs: 42 }, undefined, frame);
    await flush();
    const result = h.sent.find((m) => m.type === 'result');
    expect(result).toMatchObject({ type: 'result', tMs: 42 });
    expect(frame.closed).toBe(true);
  });
});

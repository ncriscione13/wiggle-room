import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClipPose } from '../tracking/clip-format';
import type { FrameHandler, PoseFrame, PoseSource } from '../tracking/pose-source';
import {
  clearDeviceCheckRecord,
  collectBenchmarkSamples,
  loadDeviceCheckRecord,
  planDeviceCheck,
  saveDeviceCheckRecord,
  shouldUpgradeBenchmark,
  SLOW_DEVICE_COPY,
  summarizeSamples,
  type DeviceCheckRecord,
  type KeyValueStore,
} from './device-check';

// M0.6: first-run 5 s benchmark; above 20 ms the app reduces input size,
// then warns a parent. The decision flow is fully unit-tested; hardware glue
// is covered by the e2e happy path.

describe('summarizeSamples (M0.6)', () => {
  it('reports avg and p99 in seconds', () => {
    const samples = Array.from({ length: 100 }, (_, i) => (i + 1) / 1000);
    const s = summarizeSamples(samples);
    expect(s.avgS).toBeCloseTo(0.0505, 6);
    expect(s.p99S).toBeCloseTo(0.099, 6);
    expect(s.count).toBe(100);
  });
});

describe('planDeviceCheck (M0.6)', () => {
  const ladder = [
    { widthPx: 480, heightPx: 360 },
    { widthPx: 320, heightPx: 240 },
  ];

  it('fast machine: one step, no reduction, no warning', async () => {
    const sizes: (number | null)[] = [];
    const result = await planDeviceCheck(async (step) => {
      sizes.push(step.widthPx);
      return Promise.resolve(0.012);
    }, ladder);
    expect(sizes).toEqual([null]);
    expect(result.warned).toBe(false);
    expect(result.stepsTried).toBe(0);
    expect(result.avgS).toBe(0.012);
  });

  it('slow at full size: reduces input and accepts the faster result', async () => {
    const avgBySize: Record<string, number> = { full: 0.031, '480': 0.014 };
    const result = await planDeviceCheck(
      (step) =>
        Promise.resolve(avgBySize[step.widthPx === null ? 'full' : String(step.widthPx)] ?? 1),
      ladder,
    );
    expect(result.stepsTried).toBe(1);
    expect(result.finalStep.widthPx).toBe(480);
    expect(result.warned).toBe(false);
  });

  it('slow everywhere: walks the whole ladder, then warns', async () => {
    const seen: (number | null)[] = [];
    const result = await planDeviceCheck((step) => {
      seen.push(step.widthPx);
      return Promise.resolve(0.05);
    }, ladder);
    expect(seen).toEqual([null, 480, 320]);
    expect(result.warned).toBe(true);
    expect(result.finalStep.widthPx).toBe(320);
  });
});

class FakeSource implements PoseSource {
  readonly kind = 'replay' as const;
  private readonly handlers = new Set<FrameHandler>();
  start(): Promise<void> {
    return Promise.resolve();
  }
  stop(): void {
    /* nothing */
  }
  onFrame(handler: FrameHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  latest(): PoseFrame | null {
    return null;
  }
  emit(tS: number, inferenceS: number, posesCount = 0): void {
    const pose = (): ClipPose => Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1]);
    const poses = [posesCount >= 1 ? pose() : null, posesCount >= 2 ? pose() : null];
    for (const h of this.handlers) {
      h({ tS, poses, inferenceS, frameIntervalS: 1 / 30 });
    }
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('collectBenchmarkSamples (M0.6)', () => {
  it('collects until the requested duration of frames has passed, tracking max poses', async () => {
    const source = new FakeSource();
    const promise = collectBenchmarkSamples(source, 1);
    for (let i = 0; i <= 35; i += 1) source.emit(i / 30, 0.01 + i / 10000, i === 5 ? 2 : 1);
    const bench = await promise;
    expect(bench).not.toBeNull();
    expect(bench?.samplesS.length).toBeGreaterThanOrEqual(30);
    expect(bench?.samplesS[0]).toBeCloseTo(0.01, 6);
    expect(bench?.maxPoses).toBe(2);
  });

  it('unsubscribes when done (no further samples collected)', async () => {
    const source = new FakeSource();
    const promise = collectBenchmarkSamples(source, 0.1);
    for (let i = 0; i <= 10; i += 1) source.emit(i / 30, 0.01);
    const bench = await promise;
    const lengthWhenDone = bench?.samplesS.length;
    source.emit(99, 0.01);
    expect(bench?.samplesS.length).toBe(lengthWhenDone);
  });

  it('resolves null when the source stops feeding frames (review fix)', async () => {
    vi.useFakeTimers();
    const source = new FakeSource();
    const promise = collectBenchmarkSamples(source, 5, 2000);
    source.emit(0, 0.01, 1); // a frame or two, then silence
    vi.advanceTimersByTime(2001);
    await expect(promise).resolves.toBeNull();
  });
});

describe('shouldUpgradeBenchmark (M0.6 review fix)', () => {
  const record = (posesSeen: number): DeviceCheckRecord => ({
    avgMs: 10,
    p99Ms: 14,
    widthPx: 640,
    heightPx: 480,
    delegate: 'GPU',
    posesSeen,
    warned: false,
    atMs: 1,
  });

  it('asks for a re-bench when more kids are in frame than the bench ever saw', () => {
    expect(shouldUpgradeBenchmark(record(0), 1)).toBe(true);
    expect(shouldUpgradeBenchmark(record(1), 2)).toBe(true);
  });

  it('stays quiet at or below the benchmarked count, and with no record', () => {
    expect(shouldUpgradeBenchmark(record(2), 2)).toBe(false);
    expect(shouldUpgradeBenchmark(record(2), 1)).toBe(false);
    expect(shouldUpgradeBenchmark(null, 2)).toBe(false);
  });
});

describe('device check record storage (M0.6)', () => {
  const memory = (): KeyValueStore => {
    const map = new Map<string, string>();
    return {
      get: (k) => map.get(k) ?? null,
      set: (k, v) => void map.set(k, v),
    };
  };

  it('round-trips a record', () => {
    const store = memory();
    expect(loadDeviceCheckRecord(store)).toBeNull();
    saveDeviceCheckRecord(
      {
        avgMs: 12.5,
        p99Ms: 18,
        widthPx: 640,
        heightPx: 480,
        delegate: 'GPU',
        posesSeen: 2,
        warned: false,
        atMs: 123,
      },
      store,
    );
    expect(loadDeviceCheckRecord(store)).toMatchObject({
      avgMs: 12.5,
      delegate: 'GPU',
      posesSeen: 2,
    });
  });

  it('clearDeviceCheckRecord makes the record absent (the ?recheck=1 hook)', () => {
    const store = memory();
    saveDeviceCheckRecord(
      {
        avgMs: 9,
        p99Ms: 12,
        widthPx: 640,
        heightPx: 480,
        delegate: 'GPU',
        posesSeen: 1,
        warned: false,
        atMs: 5,
      },
      store,
    );
    expect(loadDeviceCheckRecord(store)).not.toBeNull();
    clearDeviceCheckRecord(store);
    expect(loadDeviceCheckRecord(store)).toBeNull();
  });

  it('treats corrupted storage as absent', () => {
    const store = memory();
    store.set('wiggle.device-check.v1', '{nope');
    expect(loadDeviceCheckRecord(store)).toBeNull();
  });
});

describe('slow-device warning copy (M0.6)', () => {
  it('is parent-facing, friendly, and actionable', () => {
    const text = `${SLOW_DEVICE_COPY.title} ${SLOW_DEVICE_COPY.tips.join(' ')} ${SLOW_DEVICE_COPY.dismiss}`;
    expect(SLOW_DEVICE_COPY.tips.length).toBeGreaterThanOrEqual(3);
    expect(text.toLowerCase()).not.toContain('error');
    expect(text.toLowerCase()).not.toContain('fail');
    expect(SLOW_DEVICE_COPY.dismiss.toLowerCase()).toContain('play');
  });
});

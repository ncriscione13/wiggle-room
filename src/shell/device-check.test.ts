import { describe, expect, it } from 'vitest';
import type { FrameHandler, PoseFrame, PoseSource } from '../tracking/pose-source';
import {
  collectInferenceSamples,
  loadDeviceCheckRecord,
  planDeviceCheck,
  saveDeviceCheckRecord,
  SLOW_DEVICE_COPY,
  summarizeSamples,
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
  emit(tS: number, inferenceS: number): void {
    for (const h of this.handlers) {
      h({ tS, poses: [null, null], inferenceS, frameIntervalS: 1 / 30 });
    }
  }
}

describe('collectInferenceSamples (M0.6)', () => {
  it('collects until the requested duration of frames has passed', async () => {
    const source = new FakeSource();
    const promise = collectInferenceSamples(source, 1);
    for (let i = 0; i <= 35; i += 1) source.emit(i / 30, 0.01 + i / 10000);
    const samples = await promise;
    expect(samples.length).toBeGreaterThanOrEqual(30);
    expect(samples[0]).toBeCloseTo(0.01, 6);
  });

  it('unsubscribes when done (no further samples collected)', async () => {
    const source = new FakeSource();
    const promise = collectInferenceSamples(source, 0.1);
    for (let i = 0; i <= 10; i += 1) source.emit(i / 30, 0.01);
    const samples = await promise;
    const lengthWhenDone = samples.length;
    source.emit(99, 0.01);
    expect(samples.length).toBe(lengthWhenDone);
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
        warned: false,
        atMs: 123,
      },
      store,
    );
    expect(loadDeviceCheckRecord(store)).toMatchObject({ avgMs: 12.5, delegate: 'GPU' });
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

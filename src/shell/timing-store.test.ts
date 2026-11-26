import { describe, expect, it } from 'vitest';
import { getTimingOffsetS, loadTimingRecord, saveTimingResult } from './timing-store';
import type { KeyValueStore } from './storage';

const memory = (): KeyValueStore => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
};

describe('timing store (M1.8)', () => {
  it('stores trusted results and serves the offset', () => {
    const store = memory();
    expect(getTimingOffsetS(store)).toBe(0);
    saveTimingResult({ offsetS: 0.18, spreadS: 0.04, validCount: 10, ok: true }, 123, store);
    expect(getTimingOffsetS(store)).toBeCloseTo(0.18, 5);
    expect(loadTimingRecord(store)?.measuredAtMs).toBe(123);
  });

  it('refuses to store an untrusted result', () => {
    const store = memory();
    saveTimingResult({ offsetS: 0.4, spreadS: 0.5, validCount: 3, ok: false }, 1, store);
    expect(loadTimingRecord(store)).toBeNull();
    expect(getTimingOffsetS(store)).toBe(0);
  });

  it('corrupted storage reads as no record', () => {
    const store = memory();
    store.set('wiggle.timing.v1', '{broken');
    expect(getTimingOffsetS(store)).toBe(0);
  });
});

// Stored timing offset (M1.8): the clap-check result lives on the device and
// every game shifts its timing windows and voice cues by it.

import type { TimingResult } from '../motion/timing-check';
import { browserStore, type KeyValueStore } from './storage';

const KEY = 'wiggle.timing.v1';

export interface TimingRecord {
  offsetS: number;
  spreadS: number;
  measuredAtMs: number;
}

export function saveTimingResult(
  result: TimingResult,
  measuredAtMs: number,
  store: KeyValueStore = browserStore,
): void {
  if (!result.ok) return; // never store a measurement we don't trust
  const record: TimingRecord = {
    offsetS: result.offsetS,
    spreadS: result.spreadS,
    measuredAtMs,
  };
  store.set(KEY, JSON.stringify(record));
}

export function loadTimingRecord(store: KeyValueStore = browserStore): TimingRecord | null {
  const raw = store.get(KEY);
  if (raw === null || raw === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as TimingRecord).offsetS === 'number' &&
      Number.isFinite((parsed as TimingRecord).offsetS)
    ) {
      return parsed as TimingRecord;
    }
    return null;
  } catch {
    return null;
  }
}

/** The offset games apply; 0 until a trusted check has run. */
export function getTimingOffsetS(store: KeyValueStore = browserStore): number {
  return loadTimingRecord(store)?.offsetS ?? 0;
}

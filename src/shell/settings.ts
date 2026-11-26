// Parent settings (M1.10, minimal): session length + volumes, on the device.

import { SESSION_DEFAULT_LENGTH_S } from '../motion/config';
import { browserStore, type KeyValueStore } from './storage';

const KEY = 'wiggle.settings.v1';

export interface ParentSettings {
  /** null = unlimited. */
  sessionLengthS: number | null;
  musicVol01: number;
  voiceVol01: number;
}

export const DEFAULT_SETTINGS: ParentSettings = {
  sessionLengthS: SESSION_DEFAULT_LENGTH_S,
  musicVol01: 0.8,
  voiceVol01: 1,
};

const vol = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

export function loadSettings(store: KeyValueStore = browserStore): ParentSettings {
  const raw = store.get(KEY);
  if (raw === null || raw === '') return { ...DEFAULT_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    // Validate field by field: corrupted storage must never feed NaN into an
    // AudioParam or silently disable the session timer.
    const p = parsed as Record<string, unknown>;
    return {
      sessionLengthS:
        p['sessionLengthS'] === null
          ? null
          : typeof p['sessionLengthS'] === 'number' &&
              Number.isFinite(p['sessionLengthS']) &&
              p['sessionLengthS'] > 0
            ? p['sessionLengthS']
            : DEFAULT_SETTINGS.sessionLengthS,
      musicVol01: vol(p['musicVol01'], DEFAULT_SETTINGS.musicVol01),
      voiceVol01: vol(p['voiceVol01'], DEFAULT_SETTINGS.voiceVol01),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ParentSettings, store: KeyValueStore = browserStore): void {
  store.set(KEY, JSON.stringify(settings));
}

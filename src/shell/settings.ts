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

export function loadSettings(store: KeyValueStore = browserStore): ParentSettings {
  const raw = store.get(KEY);
  if (raw === null || raw === '') return { ...DEFAULT_SETTINGS };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...(parsed as Partial<ParentSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ParentSettings, store: KeyValueStore = browserStore): void {
  store.set(KEY, JSON.stringify(settings));
}

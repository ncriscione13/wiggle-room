// Player profiles (M1.5; DESIGN "App shell"): nickname, color, age mode and
// warm-up calibration per kid -- saved on the device, never anywhere else.

import type { AgeMode, Calibration, GradeBand } from '../games/types';
import type { ColorToken } from '../ui/theme';
import { WARMUP_DEFAULT_CALIBRATION_TABLE } from '../motion/config';
import { browserStore, type KeyValueStore } from './storage';

export interface Profile {
  id: string;
  name?: string;
  color: ColorToken;
  mode: AgeMode;
  /** Learning band (DESIGN "Learning layer"); absent = off (pure play). */
  grade?: GradeBand;
  calibration: Calibration | null;
}

const KEY = 'wiggle.profiles.v1';

export function loadProfiles(store: KeyValueStore = browserStore): Profile[] {
  const raw = store.get(KEY);
  if (raw === null || raw === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Profile[]) : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: Profile[], store: KeyValueStore = browserStore): void {
  store.set(KEY, JSON.stringify(profiles));
}

/** A full Calibration from the age-mode defaults (used when warm-up moves
 * were skipped, or for a brand-new kid before their first warm-up). */
export function defaultCalibration(
  mode: AgeMode,
  bodyLengthImage: number,
  measuredAtMs: number,
): Calibration {
  const d = WARMUP_DEFAULT_CALIBRATION_TABLE[mode];
  return {
    bodyLengthImage,
    standingHipHeightBl: d.standingHipHeightBl,
    statueWobbleBlPerS: d.statueWobbleBlPerS,
    reachHeightBl: d.reachHeightBl,
    armSpanBl: d.armSpanBl,
    squatDepthRatio: d.squatDepthRatio,
    hopHeightBl: d.hopHeightBl,
    stepRatePerS: d.stepRatePerS,
    measuredAtMs,
  };
}

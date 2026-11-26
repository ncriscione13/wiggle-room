import { describe, expect, it } from 'vitest';
import type { KeyValueStore } from './storage';
import { defaultCalibration, loadProfiles, saveProfiles, type Profile } from './profiles';

// M1.5: per-kid profiles with calibration, on the device only.

const memory = (): KeyValueStore => {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v) };
};

describe('profiles (M1.5)', () => {
  it('round-trips profiles with calibration', () => {
    const store = memory();
    expect(loadProfiles(store)).toEqual([]);
    const profiles: Profile[] = [
      {
        id: 'p1',
        name: 'Mia',
        color: 'playerBlue',
        mode: 'little',
        calibration: defaultCalibration('little', 0.17, 123),
      },
      { id: 'p2', color: 'playerPink', mode: 'big', calibration: null },
    ];
    saveProfiles(profiles, store);
    const back = loadProfiles(store);
    expect(back).toHaveLength(2);
    expect(back[0]?.name).toBe('Mia');
    expect(back[0]?.calibration?.stepRatePerS).toBe(2);
    expect(back[1]?.calibration).toBeNull();
  });

  it('treats corrupted storage as empty', () => {
    const store = memory();
    store.set('wiggle.profiles.v1', '{nope');
    expect(loadProfiles(store)).toEqual([]);
  });

  it('defaultCalibration fills every field from the age table', () => {
    for (const mode of ['little', 'big'] as const) {
      const c = defaultCalibration(mode, 0.2, 999);
      expect(c.bodyLengthImage).toBe(0.2);
      expect(c.measuredAtMs).toBe(999);
      expect(c.standingHipHeightBl).toBeGreaterThan(0);
      expect(c.statueWobbleBlPerS).toBeGreaterThan(0);
      expect(c.reachHeightBl).toBeGreaterThan(0);
      expect(c.armSpanBl).toBeGreaterThan(0);
      expect(c.squatDepthRatio).toBeGreaterThan(0);
      expect(c.hopHeightBl).toBeGreaterThan(0);
      expect(c.stepRatePerS).toBeGreaterThan(0);
    }
  });
});

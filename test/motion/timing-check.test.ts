import { describe, expect, it } from 'vitest';
import { matchClapsToBeats } from '../../src/motion/timing-check';
import {
  TIMING_MIN_VALID_COUNT,
  TIMING_MATCH_WINDOW_S,
  TIMING_BEAT_PERIOD_S,
} from '../../src/motion/config';

// M1.8: 15 s "clap with the drum". Beats play at known audio-clock times;
// claps arrive as motion timestamps. The median beat->clap delay is the
// whole-loop offset games shift their timing windows by.

const beats = Array.from({ length: 12 }, (_, i) => 2 + i * TIMING_BEAT_PERIOD_S);

describe('matchClapsToBeats (M1.8)', () => {
  it('recovers a constant delay from clean clapping', () => {
    const claps = beats.map((b) => b + 0.18);
    const r = matchClapsToBeats(beats, claps);
    expect(r.ok).toBe(true);
    expect(r.offsetS).toBeCloseTo(0.18, 2);
    expect(r.validCount).toBe(12);
  });

  it('survives missed beats, double claps and one wild clap', () => {
    const claps = [
      ...beats.slice(0, 4).map((b) => b + 0.2),
      // beat 4 missed entirely
      ...beats.slice(5, 11).map((b) => b + 0.17),
      (beats[4] ?? 0) + 0.21 + 0.05, // late catch-up clap
      (beats[7] ?? 0) + 0.19 + 0.02, // double clap near beat 7
      99, // wild clap long after the music
    ].sort((a, b) => a - b);
    const r = matchClapsToBeats(beats, claps);
    expect(r.ok).toBe(true);
    expect(r.offsetS).toBeGreaterThan(0.15);
    expect(r.offsetS).toBeLessThan(0.25);
  });

  it('kid clapping off-rhythm: rejected (claps land in neighboring windows with wild spread)', () => {
    const claps = beats.map((b, i) => b + (i % 2 === 0 ? 0.9 : -0.8));
    const r = matchClapsToBeats(beats, claps);
    expect(r.ok).toBe(false);
    expect(r.offsetS).toBe(0);
  });

  it('too few claps at all -> not ok', () => {
    const claps = beats.slice(0, TIMING_MIN_VALID_COUNT - 2).map((b) => b + 0.2);
    const r = matchClapsToBeats(beats, claps);
    expect(r.ok).toBe(false);
    expect(r.validCount).toBeLessThan(TIMING_MIN_VALID_COUNT);
  });

  it('a kid anticipating the beat gives a small negative offset -- allowed', () => {
    const claps = beats.map((b) => b - 0.05);
    const r = matchClapsToBeats(beats, claps);
    expect(r.ok).toBe(true);
    expect(r.offsetS).toBeCloseTo(-0.05, 2);
  });

  it('wildly inconsistent claps inside the window -> not ok (spread too big)', () => {
    const claps = beats.map((b, i) => b + (i % 2 === 0 ? 0.05 : TIMING_MATCH_WINDOW_S * 0.9));
    const r = matchClapsToBeats(beats, claps);
    expect(r.ok).toBe(false);
  });
});

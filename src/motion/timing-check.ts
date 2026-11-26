// Timing check core (M1.8; DESIGN "clap with the drum"): beats play at known
// audio-clock times, claps arrive as motion timestamps on the same clock,
// and the median beat->clap delay is the whole-loop offset (speaker + ears +
// hands + camera + tracking) that games shift their timing windows by.
// Pure: the 15 s screen that feeds it arrives with the shell (M1.10).

import { TIMING_MATCH_WINDOW_S, TIMING_MAX_SPREAD_S, TIMING_MIN_VALID_COUNT } from './config.ts';

export interface TimingResult {
  /** Median beat->clap delay in seconds; 0 when not ok (use no offset). */
  offsetS: number;
  /** Interquartile range of the matched delays. */
  spreadS: number;
  validCount: number;
  ok: boolean;
}

const quantile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? 0;
  return a + (b - a) * (pos - lo);
};

export function matchClapsToBeats(beats: number[], claps: number[]): TimingResult {
  // Greedy best-first matching: smallest |clap - beat| pairs win, each beat
  // and each clap used at most once. Robust to double claps + missed beats.
  const pairs: { beatIdx: number; clapIdx: number; diff: number }[] = [];
  for (const [beatIdx, beat] of beats.entries()) {
    for (const [clapIdx, clap] of claps.entries()) {
      const diff = clap - beat;
      if (Math.abs(diff) <= TIMING_MATCH_WINDOW_S) pairs.push({ beatIdx, clapIdx, diff });
    }
  }
  pairs.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  const usedBeats = new Set<number>();
  const usedClaps = new Set<number>();
  const diffs: number[] = [];
  for (const p of pairs) {
    if (usedBeats.has(p.beatIdx) || usedClaps.has(p.clapIdx)) continue;
    usedBeats.add(p.beatIdx);
    usedClaps.add(p.clapIdx);
    diffs.push(p.diff);
  }

  diffs.sort((a, b) => a - b);
  const validCount = diffs.length;
  const spreadS = quantile(diffs, 0.75) - quantile(diffs, 0.25);
  const ok = validCount >= TIMING_MIN_VALID_COUNT && spreadS <= TIMING_MAX_SPREAD_S;
  return { offsetS: ok ? quantile(diffs, 0.5) : 0, spreadS, validCount, ok };
}

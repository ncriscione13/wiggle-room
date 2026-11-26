// npm run bench (M1.1): the full motion kit over the 10-minute two-kid clip.
// Gate: average < 1 ms and p99 < 2 ms per frame (CLAUDE.md rule 3; thresholds
// pinned in src/motion/config.ts). One warm-up pass for the JIT, then one
// measured pass.

import { loadClip } from '../../test/helpers/clip-runner.ts';
import { LANDMARK_COUNT } from '../../src/tracking/clip-format.ts';
import {
  BENCH_MOTION_KIT_AVG_MAX_S,
  BENCH_MOTION_KIT_P99_MAX_S,
  EVENT_DEBOUNCE_S,
  MAX_PLAYERS_COUNT,
} from '../../src/motion/config.ts';
import { preparePose, type PreparedPose } from '../../src/motion/frame-prep.ts';
import { OneEuroPoint } from '../../src/motion/one-euro.ts';
import { Hysteresis } from '../../src/motion/hysteresis.ts';
import { EventDebounce } from '../../src/motion/debounce.ts';

const CLIP = 'two-kids-10min';

interface SlotState {
  prev: PreparedPose | null;
  filters: OneEuroPoint[];
  moving: Hysteresis;
  debounce: EventDebounce;
}

function makeSlots(): SlotState[] {
  return Array.from({ length: MAX_PLAYERS_COUNT }, () => ({
    prev: null,
    filters: Array.from({ length: LANDMARK_COUNT }, () => new OneEuroPoint()),
    moving: new Hysteresis(0.6, 0.3),
    debounce: new EventDebounce(EVENT_DEBOUNCE_S),
  }));
}

function runPass(measure: boolean): number[] {
  const clip = loadClip(CLIP);
  const slots = makeSlots();
  const samplesMs: number[] = [];

  for (const frame of clip.frames) {
    const t0 = performance.now();
    frame.poses.forEach((pose, slotIdx) => {
      const slot = slots[slotIdx];
      if (slot === undefined) return;
      if (pose === null) return;
      const prepared = preparePose(pose, slot.prev);
      if (prepared === null) return;
      let energy = 0;
      for (let i = 0; i < LANDMARK_COUNT; i += 1) {
        const p = prepared.points[i];
        const f = slot.filters[i];
        if (p === undefined || f === undefined || !p.ok) continue;
        const smoothed = f.filter(p.x, p.y, frame.tS);
        energy += Math.abs(smoothed.x - p.x) + Math.abs(smoothed.y - p.y);
      }
      if (slot.moving.update(energy / prepared.bodyLengthImage)) {
        slot.debounce.tryFire(frame.tS);
      }
      slot.prev = prepared;
    });
    if (measure) samplesMs.push(performance.now() - t0);
  }
  return samplesMs;
}

runPass(false); // warm-up
const samples = runPass(true);

samples.sort((a, b) => a - b);
const avgMs = samples.reduce((a, b) => a + b, 0) / samples.length;
const p99Ms = samples[Math.max(0, Math.ceil(samples.length * 0.99) - 1)] ?? 0;
const maxMs = samples[samples.length - 1] ?? 0;

const avgLimitMs = BENCH_MOTION_KIT_AVG_MAX_S * 1000;
const p99LimitMs = BENCH_MOTION_KIT_P99_MAX_S * 1000;
const pass = avgMs < avgLimitMs && p99Ms < p99LimitMs;

console.log(`motion kit bench · ${CLIP} · ${String(samples.length)} frames`);
console.log(`  avg  ${avgMs.toFixed(4)} ms  (limit ${avgLimitMs.toFixed(1)} ms)`);
console.log(`  p99  ${p99Ms.toFixed(4)} ms  (limit ${p99LimitMs.toFixed(1)} ms)`);
console.log(`  max  ${maxMs.toFixed(4)} ms`);
console.log(pass ? 'BENCH PASS' : 'BENCH FAIL');
process.exit(pass ? 0 : 1);

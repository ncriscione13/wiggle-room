// npm run bench (M1.1, re-pointed in the M1 review): the SHIPPED motion kit
// (MotionKit.update -- tracker, per-slot moving/still, buddy samplers,
// armsUp) over the 10-minute two-kid clip, plus a buddy pose sample per
// frame (the render-side cost). Gate: average < 1 ms and p99 < 2 ms per
// frame (CLAUDE.md rule 3; thresholds pinned in src/motion/config.ts).
// One warm-up pass for the JIT, then one measured pass.

import { loadClip } from '../../test/helpers/clip-runner.ts';
import {
  BENCH_MOTION_KIT_AVG_MAX_S,
  BENCH_MOTION_KIT_P99_MAX_S,
  MAX_PLAYERS_COUNT,
} from '../../src/motion/config.ts';
import { MotionKit } from '../../src/motion/kit.ts';

const CLIP = 'two-kids-10min';

function runPass(measure: boolean): number[] {
  const clip = loadClip(CLIP);
  const kit = new MotionKit();
  // Realistic subscriber load: a game listening like the Freeze scene does.
  for (const name of ['moving', 'still', 'armsUp'] as const) {
    kit.on(name, () => {
      // listener dispatch cost only
    });
  }
  const samplesMs: number[] = [];
  const slots = Array.from({ length: MAX_PLAYERS_COUNT }, (_, i) => i as 0 | 1);

  for (const frame of clip.frames) {
    const t0 = performance.now();
    kit.update(frame.tS, frame.poses);
    // The render loop samples a buddy pose per kid every frame.
    for (const slot of slots) kit.pose(slot);
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

console.log(`motion kit bench · ${CLIP} · ${String(samples.length)} frames (real MotionKit)`);
console.log(`  avg  ${avgMs.toFixed(4)} ms  (limit ${avgLimitMs.toFixed(1)} ms)`);
console.log(`  p99  ${p99Ms.toFixed(4)} ms  (limit ${p99LimitMs.toFixed(1)} ms)`);
console.log(`  max  ${maxMs.toFixed(4)} ms`);
console.log(pass ? 'BENCH PASS' : 'BENCH FAIL');
process.exit(pass ? 0 : 1);

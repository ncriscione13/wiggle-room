import { describe, expect, it } from 'vitest';
import { ClapDetector } from '../../src/motion/clap';
import { preparePose } from '../../src/motion/frame-prep';
import { POSE, type ClipPose } from '../../src/tracking/clip-format';
import type { PreparedPose } from '../../src/motion/frame-prep';

// M1.8: clap = wrists rushing together and meeting. Fires at contact
// (start of the audible moment), debounced like every event.

function poseWithWrists(gap: number): ClipPose {
  const cx = 0.5;
  const cy = 0.5;
  const pts: [number, number, number, number][] = Array.from({ length: 33 }, () => [cx, cy, 0, 1]);
  pts[POSE.leftShoulder] = [cx - 0.05, cy - 0.2, 0, 1];
  pts[POSE.rightShoulder] = [cx + 0.05, cy - 0.2, 0, 1];
  pts[POSE.leftHip] = [cx - 0.04, cy, 0, 1];
  pts[POSE.rightHip] = [cx + 0.04, cy, 0, 1];
  pts[POSE.leftWrist] = [cx - gap / 2, cy - 0.15, 0, 1];
  pts[POSE.rightWrist] = [cx + gap / 2, cy - 0.15, 0, 1];
  return pts;
}

/** Runs gaps (in image units; BL = 0.2) through the detector at 30 fps. */
function run(gaps: number[], detector = new ClapDetector()): number[] {
  const claps: number[] = [];
  let prev: PreparedPose | null = null;
  for (const [i, gap] of gaps.entries()) {
    const tS = i / 30;
    const prepared = preparePose(poseWithWrists(gap), prev);
    prev = prepared;
    if (prepared && detector.update(prepared, tS)) claps.push(tS);
  }
  return claps;
}

// BL = 0.2 image units. A clap: hands 1.5 BL apart rushing to touching.
const clapMotion = [0.3, 0.24, 0.17, 0.1, 0.04, 0.03, 0.04, 0.1, 0.2, 0.3];
const hold = (gap: number, n: number): number[] => Array.from({ length: n }, () => gap);

describe('ClapDetector (M1.8)', () => {
  it('fires once per clap, at contact', () => {
    const claps = run([...hold(0.3, 10), ...clapMotion, ...hold(0.3, 10), ...clapMotion]);
    expect(claps).toHaveLength(2);
    // First clap: contact is ~4-5 frames into the motion that starts at
    // frame 10 -> between 10/30 and 16/30 s.
    expect(claps[0] ?? 0).toBeGreaterThan(10 / 30 - 0.001);
    expect(claps[0] ?? 0).toBeLessThan(16 / 30);
  });

  it('hands resting together (praying) never clap', () => {
    const claps = run(hold(0.03, 60));
    expect(claps).toHaveLength(0);
  });

  it('slow drift together is not a clap', () => {
    // 0.3 -> 0.03 over 2 s: closing speed ~0.7 BL/s, well under the line.
    const gaps = Array.from({ length: 60 }, (_, i) => 0.3 - (0.27 * i) / 59);
    expect(run(gaps)).toHaveLength(0);
  });

  it('a jittery near-touch does not double-fire (debounce)', () => {
    const claps = run([...hold(0.3, 10), 0.2, 0.1, 0.03, 0.06, 0.03, 0.06, 0.03, ...hold(0.3, 5)]);
    expect(claps).toHaveLength(1);
  });
});

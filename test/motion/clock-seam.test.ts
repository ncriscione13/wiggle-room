import { describe, expect, it } from 'vitest';
import { MotionKit } from '../../src/motion/kit';
import { FreezeCore } from '../../src/games/freeze/core';
import { POSE, type ClipPose } from '../../src/tracking/clip-format';

// M1 review blocker regression: game logic must tick on the MOTION clock
// (motion.nowS()), because live sources zero-base their time. This test
// wires a kit to a FreezeCore exactly like the scene does -- events from
// kit.on, ticks from kit.nowS() -- and proves reactions/grace are measured
// on one clock. It also pins the still-confirm backdating (the 0.5 s hold
// never counts against the kid).

function body(cx: number, cy = 0.5): ClipPose {
  const pts: [number, number, number, number][] = Array.from({ length: 33 }, () => [cx, cy, 0, 1]);
  pts[POSE.nose] = [cx, cy - 0.3, 0, 1];
  pts[POSE.leftShoulder] = [cx - 0.05, cy - 0.2, 0, 1];
  pts[POSE.rightShoulder] = [cx + 0.05, cy - 0.2, 0, 1];
  pts[POSE.leftHip] = [cx - 0.04, cy, 0, 1];
  pts[POSE.rightHip] = [cx + 0.04, cy, 0, 1];
  pts[POSE.leftWrist] = [cx - 0.1, cy - 0.1, 0, 1];
  pts[POSE.rightWrist] = [cx + 0.1, cy - 0.1, 0, 1];
  pts[POSE.leftAnkle] = [cx - 0.04, cy + 0.35, 0, 1];
  pts[POSE.rightAnkle] = [cx + 0.04, cy + 0.35, 0, 1];
  return pts;
}

describe('motion clock -> game clock seam (M1 review blocker)', () => {
  it('a real freeze reaction is measured correctly across the kit/core seam', () => {
    const kit = new MotionKit();
    const core = new FreezeCore({
      players: [
        { mode: 'big', active: true },
        { mode: 'big', active: false },
      ],
      freezes: 1,
      slowMo: false,
      audioDelayS: 0,
      introS: 0.5,
      rng: () => 0,
    });
    // Scene-identical wiring: events in, ticks on the motion clock.
    kit.on('moving', (e) => {
      core.onMoving(e.slot, e.tS);
    });
    kit.on('still', (e) => {
      core.onStill(e.slot, e.tS);
    });

    // Big timing, rng 0: intro ends ~0.53, dance 3 s -> stop at ~3.53.
    // The kid dances until 4.0 s, then freezes INSTANTLY and holds.
    const stopS = 3.53;
    const freezeAtS = 4.0;
    let statueAt: number | null = null;
    for (let i = 0; i <= 30 * 8; i += 1) {
      const tS = i / 30;
      const dancing = tS < freezeAtS;
      const wiggle = dancing ? Math.sin(i * 1.3) * 0.03 : 0;
      kit.update(tS, [body(0.25 + wiggle), null]);
      for (const d of core.tick(kit.nowS())) {
        if (d.type === 'statue' && statueAt === null) statueAt = tS;
      }
    }
    // The statue appears, and the measured reaction is the REAL one
    // (~freezeAt - stop = 0.47 s), not zero (clock mismatch) and not
    // inflated by the 0.5 s still-confirm hold (backdating).
    expect(statueAt).not.toBeNull();
    const reaction = core.lastReactionS(0);
    expect(reaction).not.toBeNull();
    expect(reaction ?? 9).toBeGreaterThan(0.2);
    expect(reaction ?? 9).toBeLessThan(0.75);
    // ~0.47 < 0.5 Big grace: the kid gets the within-grace credit they
    // earned only thanks to backdating.
    expect(freezeAtS - stopS).toBeLessThan(0.5);
  });

  it('kit.nowS() is the frame clock, not wall time', () => {
    const kit = new MotionKit();
    kit.update(123.4, [body(0.25), null]);
    expect(kit.nowS()).toBeCloseTo(123.4, 5);
  });
});

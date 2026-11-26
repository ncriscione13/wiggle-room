import { describe, expect, it } from 'vitest';
import { MotionKit } from '../../src/motion/kit';
import { POSE } from '../../src/tracking/clip-format';
import type { ClipPose } from '../../src/tracking/clip-format';
import type { MotionEvent } from '../../src/games/types';

// M1.9: the facade games get as ctx.motion -- PlayerTracker + per-slot
// moving/still + buddy sampler + armsUp, behind the MotionEvents contract.

function body(cx: number, cy = 0.5, wristYOff = -0.1): ClipPose {
  const pts: [number, number, number, number][] = Array.from({ length: 33 }, () => [cx, cy, 0, 1]);
  pts[POSE.nose] = [cx, cy - 0.3, 0, 1];
  pts[POSE.leftShoulder] = [cx - 0.05, cy - 0.2, 0, 1];
  pts[POSE.rightShoulder] = [cx + 0.05, cy - 0.2, 0, 1];
  pts[POSE.leftHip] = [cx - 0.04, cy, 0, 1];
  pts[POSE.rightHip] = [cx + 0.04, cy, 0, 1];
  pts[POSE.leftWrist] = [cx - 0.1, cy + wristYOff, 0, 1];
  pts[POSE.rightWrist] = [cx + 0.1, cy + wristYOff, 0, 1];
  pts[POSE.leftAnkle] = [cx - 0.04, cy + 0.35, 0, 1];
  pts[POSE.rightAnkle] = [cx + 0.04, cy + 0.35, 0, 1];
  return pts;
}

function collect(kit: MotionKit): MotionEvent[] {
  const events: MotionEvent[] = [];
  for (const name of ['moving', 'still', 'armsUp'] as const) {
    kit.on(name, (e) => events.push(e));
  }
  return events;
}

describe('MotionKit (M1.9)', () => {
  it('fires moving when a kid dances and still when they hold', () => {
    const kit = new MotionKit();
    const events = collect(kit);
    // Kid on the left half dancing (hip wiggles fast), then holding still.
    for (let i = 0; i < 150; i += 1) {
      const tS = i / 30;
      const wiggle = i < 45 ? Math.sin(i * 1.1) * 0.03 : 0;
      kit.update(tS, [body(0.25 + wiggle), null]);
    }
    const slot0 = events.filter((e) => e.slot === 0);
    expect(slot0.some((e) => e.name === 'moving')).toBe(true);
    expect(slot0.some((e) => e.name === 'still')).toBe(true);
    const movingAt = slot0.find((e) => e.name === 'moving')?.tS ?? 99;
    const stillAt = slot0.find((e) => e.name === 'still')?.tS ?? 0;
    expect(movingAt).toBeLessThan(stillAt);
    // Nothing fired for the empty right half.
    expect(events.some((e) => e.slot === 1)).toBe(false);
  });

  it('fires armsUp once when both hands shoot above the head', () => {
    const kit = new MotionKit();
    const events = collect(kit);
    for (let i = 0; i < 60; i += 1) {
      const tS = i / 30;
      const up = i >= 30 ? -0.35 : -0.1; // wrists jump well above the head
      kit.update(tS, [body(0.25, 0.5, up), null]);
    }
    const armsUp = events.filter((e) => e.name === 'armsUp' && e.slot === 0);
    expect(armsUp).toHaveLength(1);
    expect(armsUp[0]?.tS ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('serves a buddy pose and tracking state per slot', () => {
    const kit = new MotionKit(() => 1);
    for (let i = 0; i <= 30; i += 1) kit.update(i / 30, [body(0.25), null]);
    expect(kit.tracking(0)).toBe('tracked');
    const pose = kit.pose(0);
    expect(pose).not.toBeNull();
    expect(pose?.fresh).toBe(true);
    expect(pose?.hipMid.x ?? 0).toBeCloseTo(0.25, 1);
    expect(kit.pose(1)).toBeNull();
    expect(kit.tracking(1)).toBe('paused');
  });

  it('unsubscribe works', () => {
    const kit = new MotionKit();
    let count = 0;
    const off = kit.on('moving', () => {
      count += 1;
    });
    off();
    for (let i = 0; i < 30; i += 1) {
      kit.update(i / 30, [body(0.25 + Math.sin(i) * 0.03), null]);
    }
    expect(count).toBe(0);
  });

  it('per-kid still line from calibration is applied', () => {
    const kit = new MotionKit();
    kit.setStillLine(0, 5); // absurdly high line: nothing counts as moving
    const events = collect(kit);
    for (let i = 0; i < 90; i += 1) {
      kit.update(i / 30, [body(0.25 + Math.sin(i * 1.1) * 0.03), null]);
    }
    expect(events.filter((e) => e.name === 'moving')).toHaveLength(0);
  });
});

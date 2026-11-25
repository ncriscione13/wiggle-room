import { describe, expect, it } from 'vitest';
import { POSE } from '../../src/tracking/clip-format';
import { loadClip, runOverClip } from './clip-runner';

// Task 0.7: the clip-runner is how every detector test will work in M1+:
// feed a clip through a frame sink, collect and count events.

describe('clip-runner harness (task 0.7)', () => {
  it('loads a synthetic clip by name', () => {
    const clip = loadClip('jumps-x5');
    expect(clip.name).toBe('jumps-x5');
    expect(clip.frames.length).toBeGreaterThan(100);
  });

  it('feeds every frame in order and collects emitted events', () => {
    const clip = loadClip('still-30s');
    let lastT = -Infinity;
    let frameCount = 0;
    const result = runOverClip(clip, (frame) => {
      expect(frame.tS).toBeGreaterThan(lastT);
      lastT = frame.tS;
      frameCount += 1;
      // Emit one marker event every 100 frames to prove collection works.
      if (frameCount % 100 === 0) {
        return [{ name: 'marker', slot: 0, tS: frame.tS }];
      }
      return undefined;
    });
    expect(frameCount).toBe(clip.frames.length);
    expect(result.events.length).toBe(Math.floor(clip.frames.length / 100));
    expect(result.counts['marker']).toBe(result.events.length);
    expect(result.durationS).toBeGreaterThan(29);
  });

  it('counts by event name, usable as "exactly N events" assertions', () => {
    // A toy "wrist above nose" detector over the reach clip: not a real
    // detector, but proves the counting contract detectors will rely on.
    const clip = loadClip('reach-and-arms-out');
    let wasUp = false;
    const result = runOverClip(clip, (frame) => {
      const pose = frame.poses[0];
      if (pose == null) return undefined;
      const nose = pose[POSE.nose];
      const lw = pose[POSE.leftWrist];
      const rw = pose[POSE.rightWrist];
      if (nose === undefined || lw === undefined || rw === undefined) return undefined;
      const isUp = lw[1] < nose[1] && rw[1] < nose[1];
      const events = !wasUp && isUp ? [{ name: 'armsUp', slot: 0, tS: frame.tS }] : undefined;
      wasUp = isUp;
      return events;
    });
    // The clip has one sustained reach phase; jitter may bounce the naive
    // edge-trigger a little, but it must fire at least once and stay sane.
    expect(result.counts['armsUp']).toBeGreaterThanOrEqual(1);
    expect(result.counts['armsUp']).toBeLessThan(10);
  });
});

import { describe, expect, it } from 'vitest';
import {
  POSE,
  validateClipFile,
  type ClipFile,
  type ClipPose,
} from '../../src/tracking/clip-format';
import { buildClip, listClipNames } from './clips';

// Task 0.6: the synthetic clips stand in for real kid recordings until M0.8,
// so their physical properties must be exactly what detector tests will rely
// on: right counts of jumps/squats/steps, zero-crossing arm episodes, dropout
// behavior, and realistic jitter. Everything is seeded and deterministic.

const cache = new Map<string, ClipFile>();
function clip(name: string): ClipFile {
  let c = cache.get(name);
  if (c === undefined) {
    c = buildClip(name);
    cache.set(name, c);
  }
  return c;
}

function mid(pose: ClipPose, a: number, b: number): { x: number; y: number } {
  const pa = pose[a];
  const pb = pose[b];
  if (pa === undefined || pb === undefined) throw new Error('missing landmark');
  return { x: (pa[0] + pb[0]) / 2, y: (pa[1] + pb[1]) / 2 };
}

const hipMid = (p: ClipPose) => mid(p, POSE.leftHip, POSE.rightHip);
const shoulderMid = (p: ClipPose) => mid(p, POSE.leftShoulder, POSE.rightShoulder);

/** Body length (shoulder-mid to hip-mid) in image units -- the BL unit. */
function bodyLength(p: ClipPose): number {
  const s = shoulderMid(p);
  const h = hipMid(p);
  return Math.hypot(s.x - h.x, s.y - h.y);
}

function poses0(c: ClipFile): ClipPose[] {
  return c.frames.map((f) => f.poses[0]).filter((p): p is ClipPose => p != null);
}

function duration(c: ClipFile): number {
  const first = c.frames[0];
  const last = c.frames[c.frames.length - 1];
  if (first === undefined || last === undefined) throw new Error('empty clip');
  return last.tS - first.tS;
}

/** Median-of-3 filter: kills the single-frame outlier spikes the generator
 * deliberately injects (detectors must survive them; test counters too). */
function median3(signal: number[]): number[] {
  return signal.map((v, i) => {
    const a = signal[i - 1] ?? v;
    const b = signal[i + 1] ?? v;
    return [a, v, b].sort((x, y) => x - y)[1] ?? v;
  });
}

/** Counts rising excursions using hysteresis; needs 2 consecutive frames above
 * `hi` to activate, so a lone spike can't count (test-local helper). */
function countPulses(raw: number[], hi: number, lo: number): number {
  const signal = median3(raw);
  let count = 0;
  let active = false;
  let aboveStreak = 0;
  for (const v of signal) {
    aboveStreak = v > hi ? aboveStreak + 1 : 0;
    if (!active && aboveStreak >= 2) {
      active = true;
      count += 1;
    } else if (active && v < lo) {
      active = false;
    }
  }
  return count;
}

/** Robust spread: p02..p98, ignoring the deliberate outlier spikes. */
function robustSpread(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.02)];
  const hi = sorted[Math.floor(sorted.length * 0.98)];
  if (lo === undefined || hi === undefined) throw new Error('empty');
  return hi - lo;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const m = sorted[Math.floor(sorted.length / 2)];
  if (m === undefined) throw new Error('empty');
  return m;
}

describe('catalog and format', () => {
  it('provides all clips PLAN 0.6 lists', () => {
    expect(listClipNames().sort()).toEqual(
      [
        'still-30s',
        'jumps-x5',
        'run-2sps-10s',
        'run-3sps-10s',
        'squats-x3',
        'reach-and-arms-out',
        'two-kids-10min',
        'walk-out-and-back',
        'low-visibility-30s',
      ].sort(),
    );
  });

  it('every clip validates against the canonical format', () => {
    for (const name of listClipNames()) {
      // two-kids-10min is big; validate it too -- this is the format gate.
      expect(validateClipFile(clip(name)), name).toEqual([]);
    }
  });

  it('is deterministic: same name builds byte-identical frames', () => {
    const a = buildClip('jumps-x5');
    const b = buildClip('jumps-x5');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('carries realistic jitter: points move a little even when standing still', () => {
    const ps = poses0(clip('still-30s'));
    const noseXs = ps.map((p) => p[POSE.nose]?.[0] ?? 0);
    const deltas = noseXs.slice(1).map((x, i) => Math.abs(x - (noseXs[i] ?? 0)));
    const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    expect(meanDelta).toBeGreaterThan(0.0005); // jitter exists
    expect(meanDelta).toBeLessThan(0.01); // but stays subtle
  });

  it('occasionally drops points (visibility < 0.5) across ordinary clips', () => {
    const ps = poses0(clip('still-30s'));
    let low = 0;
    let total = 0;
    for (const p of ps) {
      for (const lm of p) {
        total += 1;
        if (lm[3] < 0.5) low += 1;
      }
    }
    const ratio = low / total;
    expect(ratio).toBeGreaterThan(0.001); // dropouts happen
    expect(ratio).toBeLessThan(0.05); // but are occasional
  });
});

describe('still-30s', () => {
  it('runs ~30 s with the kid steady in frame', () => {
    const c = clip('still-30s');
    expect(duration(c)).toBeGreaterThanOrEqual(29);
    const hips = poses0(c).map((p) => hipMid(p));
    expect(robustSpread(hips.map((h) => h.x))).toBeLessThan(0.05);
    expect(robustSpread(hips.map((h) => h.y))).toBeLessThan(0.05);
  });
});

describe('jumps-x5', () => {
  it('contains exactly 5 jumps (hips rise well above the jump-cancel line)', () => {
    const ps = poses0(clip('jumps-x5'));
    const hipYs = ps.map((p) => hipMid(p).y);
    const bl = median(ps.map(bodyLength));
    const baseline = median(hipYs);
    // Rise signal in BL (y is down, so rising = baseline - y).
    const rise = hipYs.map((y) => (baseline - y) / bl);
    expect(countPulses(rise, 0.18, 0.05)).toBe(5);
  });
});

describe('running in place', () => {
  function stepsIn(name: string): number {
    const ps = poses0(clip(name));
    const bl = median(ps.map(bodyLength));
    let steps = 0;
    for (const side of ['left', 'right'] as const) {
      const kneeIdx = side === 'left' ? POSE.leftKnee : POSE.rightKnee;
      const lift = ps.map((p) => {
        const knee = p[kneeIdx];
        if (knee === undefined) throw new Error('missing knee');
        return (hipMid(p).y + 0.8 * bl - knee[1]) / bl; // knee height above its standing spot
      });
      steps += countPulses(lift, 0.25, 0.1);
    }
    return steps;
  }

  it('run-2sps-10s lands within 10% of 20 steps', () => {
    const steps = stepsIn('run-2sps-10s');
    expect(steps).toBeGreaterThanOrEqual(18);
    expect(steps).toBeLessThanOrEqual(22);
  });

  it('run-3sps-10s lands within 10% of 30 steps', () => {
    const steps = stepsIn('run-3sps-10s');
    expect(steps).toBeGreaterThanOrEqual(27);
    expect(steps).toBeLessThanOrEqual(33);
  });
});

describe('squats-x3', () => {
  it('contains exactly 3 squats (hips below 75% of standing hip height)', () => {
    const ps = poses0(clip('squats-x3'));
    const ankleY = median(
      ps.map((p) => {
        const l = p[POSE.leftAnkle];
        const r = p[POSE.rightAnkle];
        if (l === undefined || r === undefined) throw new Error('missing ankle');
        return (l[1] + r[1]) / 2;
      }),
    );
    const hipHeights = ps.map((p) => ankleY - hipMid(p).y);
    const standing = median(hipHeights);
    const depth = hipHeights.map((h) => 1 - h / standing); // 0 standing, >0.25 = below squat line
    expect(countPulses(depth, 0.3, 0.1)).toBe(3);
  });
});

describe('reach-and-arms-out', () => {
  it('has a reach phase (both wrists well above the head)', () => {
    const ps = poses0(clip('reach-and-arms-out'));
    const bl = median(ps.map(bodyLength));
    let reachFrames = 0;
    for (const p of ps) {
      const lw = p[POSE.leftWrist];
      const rw = p[POSE.rightWrist];
      const nose = p[POSE.nose];
      if (lw === undefined || rw === undefined || nose === undefined) continue;
      if (nose[1] - lw[1] > 0.3 * bl && nose[1] - rw[1] > 0.3 * bl) reachFrames += 1;
    }
    expect(reachFrames).toBeGreaterThan(30); // a solid held phase at 30 fps
  });

  it('has an arms-out phase (wrists near shoulder height, spread wide)', () => {
    const ps = poses0(clip('reach-and-arms-out'));
    const bl = median(ps.map(bodyLength));
    let tFrames = 0;
    for (const p of ps) {
      const lw = p[POSE.leftWrist];
      const rw = p[POSE.rightWrist];
      if (lw === undefined || rw === undefined) continue;
      const s = shoulderMid(p);
      const nearShoulderHeight =
        Math.abs(lw[1] - s.y) < 0.35 * bl && Math.abs(rw[1] - s.y) < 0.35 * bl;
      const wide = Math.abs(lw[0] - rw[0]) > 1.4 * bl;
      if (nearShoulderHeight && wide) tFrames += 1;
    }
    expect(tFrames).toBeGreaterThan(30);
  });
});

describe('two-kids-10min', () => {
  it('runs at least 10 minutes with two kids present nearly always', () => {
    const c = clip('two-kids-10min');
    expect(duration(c)).toBeGreaterThanOrEqual(600);
    const bothSeen = c.frames.filter((f) => f.poses[0] != null && f.poses[1] != null).length;
    expect(bothSeen / c.frames.length).toBeGreaterThan(0.97);
  });

  it('keeps each kid anchored to their own half (hips never cross the middle)', () => {
    const c = clip('two-kids-10min');
    for (const f of c.frames) {
      const a = f.poses[0];
      const b = f.poses[1];
      if (a != null) expect(hipMid(a).x).toBeLessThan(0.5);
      if (b != null) expect(hipMid(b).x).toBeGreaterThan(0.5);
    }
  });

  it('contains arm-crossing episodes (a wrist reaches into the other half)', () => {
    const c = clip('two-kids-10min');
    let crossFrames = 0;
    for (const f of c.frames) {
      const a = f.poses[0];
      if (a == null) continue;
      const lw = a[POSE.leftWrist];
      const rw = a[POSE.rightWrist];
      if ((lw !== undefined && lw[0] > 0.52) || (rw !== undefined && rw[0] > 0.52)) {
        crossFrames += 1;
      }
    }
    expect(crossFrames).toBeGreaterThan(60); // several seconds' worth across 10 min
  });
});

describe('walk-out-and-back', () => {
  it('kid leaves (pose missing for >= 2 s) and comes back', () => {
    const c = clip('walk-out-and-back');
    const missing: Array<{ from: number; to: number }> = [];
    let start: number | null = null;
    for (const f of c.frames) {
      if (f.poses[0] == null) {
        start ??= f.tS;
      } else if (start !== null) {
        missing.push({ from: start, to: f.tS });
        start = null;
      }
    }
    expect(missing.length).toBeGreaterThanOrEqual(1);
    const longest = Math.max(...missing.map((m) => m.to - m.from));
    expect(longest).toBeGreaterThanOrEqual(2);
    // Present again at the end:
    const lastFrame = c.frames[c.frames.length - 1];
    expect(lastFrame?.poses[0]).not.toBeNull();
  });
});

describe('low-visibility-30s', () => {
  it('has a substantial share of low-visibility landmarks', () => {
    const ps = poses0(clip('low-visibility-30s'));
    let low = 0;
    let total = 0;
    for (const p of ps) {
      for (const lm of p) {
        total += 1;
        if (lm[3] < 0.5) low += 1;
      }
    }
    expect(low / total).toBeGreaterThan(0.1);
  });

  it('includes whole-body dim windows (frames where most points are unsure)', () => {
    const ps = poses0(clip('low-visibility-30s'));
    const dimFrames = ps.filter((p) => p.filter((lm) => lm[3] < 0.5).length > p.length / 2);
    expect(dimFrames.length).toBeGreaterThan(10);
  });
});

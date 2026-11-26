// Warm-up calibration measurements + plan (M1.5; DESIGN "Warm-up
// calibration" table). Each move's extractor consumes the prepared frames of
// its window and returns the metric plus an ok flag (did the move plausibly
// happen?). The plan reducer walks try -> try -> slow demo -> age default.
// The guided visuals mount with the shell flow (M1.10).

import { POSE } from '../tracking/clip-format.ts';
import { Hysteresis } from './hysteresis.ts';
import { OneEuroPoint } from './one-euro.ts';
import type { PreparedPose } from './frame-prep.ts';

export interface MeasuredFrame {
  tS: number;
  pose: PreparedPose;
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? NaN;
};

function ankleMidY(pose: PreparedPose): number | null {
  const la = pose.points[POSE.leftAnkle];
  const ra = pose.points[POSE.rightAnkle];
  if (la === undefined || ra === undefined || !la.ok || !ra.ok) return null;
  return (la.y + ra.y) / 2;
}

/** Stand tall: the BL unit itself + standing hip height above the ankles. */
export function measureStanding(frames: MeasuredFrame[]): {
  ok: boolean;
  bodyLengthImage: number;
  standingHipHeightBl: number;
} {
  const bls: number[] = [];
  const hips: number[] = [];
  for (const { pose } of frames) {
    const ankles = ankleMidY(pose);
    if (ankles === null) continue;
    bls.push(pose.bodyLengthImage);
    hips.push((ankles - pose.hipMid.y) / pose.bodyLengthImage);
  }
  return {
    ok: bls.length >= 10,
    bodyLengthImage: median(bls),
    standingHipHeightBl: median(hips),
  };
}

/** Statue: mean smoothed core-point speed while trying to hold still. */
export function measureStatueWobble(frames: MeasuredFrame[]): {
  ok: boolean;
  statueWobbleBlPerS: number;
} {
  const core = [POSE.nose, POSE.leftWrist, POSE.rightWrist, POSE.leftKnee, POSE.rightKnee];
  const filters = new Map<number, OneEuroPoint>();
  const prevPts = new Map<number, { x: number; y: number }>();
  let prevT: number | null = null;
  const speeds: number[] = [];
  for (const { tS, pose } of frames) {
    const dtS = prevT === null ? null : Math.max(tS - prevT, 1e-4);
    prevT = tS;
    for (const idx of core) {
      const p = pose.points[idx];
      if (p === undefined || !p.ok) continue;
      let f = filters.get(idx);
      if (f === undefined) {
        f = new OneEuroPoint();
        filters.set(idx, f);
      }
      const s = f.filter(p.x, p.y, tS);
      const prev = prevPts.get(idx);
      if (prev !== undefined && dtS !== null) {
        speeds.push(Math.hypot(s.x - prev.x, s.y - prev.y) / pose.bodyLengthImage / dtS);
      }
      prevPts.set(idx, s);
    }
  }
  return { ok: speeds.length >= 20, statueWobbleBlPerS: median(speeds) };
}

/** Reach up: highest wrist above the hips, in BL. */
export function measureReach(frames: MeasuredFrame[]): { ok: boolean; reachHeightBl: number } {
  let best = 0;
  for (const { pose } of frames) {
    for (const idx of [POSE.leftWrist, POSE.rightWrist]) {
      const w = pose.points[idx];
      if (w === undefined || !w.ok) continue;
      best = Math.max(best, -w.yBl); // yBl is negative above the hips
    }
  }
  return { ok: best > 1.2, reachHeightBl: best };
}

/** Airplane: widest wrist-to-wrist span, in BL. */
export function measureArmSpan(frames: MeasuredFrame[]): { ok: boolean; armSpanBl: number } {
  let best = 0;
  for (const { pose } of frames) {
    const lw = pose.points[POSE.leftWrist];
    const rw = pose.points[POSE.rightWrist];
    if (lw === undefined || rw === undefined || !lw.ok || !rw.ok) continue;
    best = Math.max(best, Math.abs(lw.xBl - rw.xBl));
  }
  return { ok: best > 1.2, armSpanBl: best };
}

/** Frog squats: the deepest hip height as a ratio of standing hip height. */
export function measureSquatDepth(frames: MeasuredFrame[]): {
  ok: boolean;
  squatDepthRatio: number;
} {
  const heights: number[] = [];
  for (const { pose } of frames) {
    const ankles = ankleMidY(pose);
    if (ankles === null) continue;
    heights.push((ankles - pose.hipMid.y) / pose.bodyLengthImage);
  }
  if (heights.length < 20) return { ok: false, squatDepthRatio: 1 };
  const standing = median(heights.slice(0, Math.max(5, Math.floor(heights.length * 0.2))));
  const deepest = Math.min(...heights);
  const ratio = deepest / standing;
  // Plausible squat: hips actually dropped meaningfully below standing.
  return { ok: ratio < 0.85, squatDepthRatio: ratio };
}

/** Bunny hops: the biggest hip rise above baseline, in BL. */
export function measureHops(frames: MeasuredFrame[]): { ok: boolean; hopHeightBl: number } {
  const hipYs = frames.map(({ pose }) => pose.hipMid.y / pose.bodyLengthImage);
  if (hipYs.length < 20) return { ok: false, hopHeightBl: 0 };
  const baseline = median(hipYs);
  const rises = hipYs.map((y) => baseline - y); // y down: rise = baseline - y
  // Count distinct hops with hysteresis so noise can't fake one.
  const gate = new Hysteresis(0.15, 0.05);
  let hops = 0;
  let wasUp = false;
  for (const r of rises) {
    const up = gate.update(r);
    if (up && !wasUp) hops += 1;
    wasUp = up;
  }
  const hopHeightBl = Math.max(...rises);
  return { ok: hops >= 2, hopHeightBl };
}

/** Run in place: knee-lift pulses per second, both legs combined. */
export function measureStepRate(frames: MeasuredFrame[]): { ok: boolean; stepRatePerS: number } {
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (first === undefined || last === undefined || last.tS - first.tS < 2) {
    return { ok: false, stepRatePerS: 0 };
  }
  let steps = 0;
  for (const kneeIdx of [POSE.leftKnee, POSE.rightKnee]) {
    const gate = new Hysteresis(0.25, 0.1);
    let wasUp = false;
    for (const { pose } of frames) {
      const knee = pose.points[kneeIdx];
      if (knee === undefined || !knee.ok) continue;
      // Lift = how far the knee rose above its standing spot (~0.8 BL below hips).
      const lift = 0.8 - knee.yBl;
      const up = gate.update(lift);
      if (up && !wasUp) steps += 1;
      wasUp = up;
    }
  }
  const stepRatePerS = steps / (last.tS - first.tS);
  return { ok: steps >= 4, stepRatePerS };
}

// --- The plan: try -> try -> slow demo -> age default -----------------------

export type WarmupPhase = 'try' | 'slow-demo' | 'use-default' | 'done';

export interface WarmupPlanState {
  phase: WarmupPhase;
  moveIndex: number;
  tryNumber: number;
}

export type WarmupPlanEvent = 'measured-ok' | 'measured-fail' | 'defaults-applied';

export const WARMUP_MOVE_COUNT = 7;

export function warmupPlanNext(state: WarmupPlanState, event: WarmupPlanEvent): WarmupPlanState {
  const advance = (): WarmupPlanState =>
    state.moveIndex + 1 >= WARMUP_MOVE_COUNT
      ? { phase: 'done', moveIndex: state.moveIndex, tryNumber: state.tryNumber }
      : { phase: 'try', moveIndex: state.moveIndex + 1, tryNumber: 1 };

  switch (state.phase) {
    case 'try':
      if (event === 'measured-ok') return advance();
      if (event === 'measured-fail') {
        return state.tryNumber >= 2
          ? { phase: 'slow-demo', moveIndex: state.moveIndex, tryNumber: state.tryNumber + 1 }
          : { phase: 'try', moveIndex: state.moveIndex, tryNumber: state.tryNumber + 1 };
      }
      return state;
    case 'slow-demo':
      if (event === 'measured-ok') return advance();
      if (event === 'measured-fail') {
        return { phase: 'use-default', moveIndex: state.moveIndex, tryNumber: state.tryNumber };
      }
      return state;
    case 'use-default':
      return event === 'defaults-applied' ? advance() : state;
    case 'done':
      return state;
  }
}

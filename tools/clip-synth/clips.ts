// Synthetic clip catalog (task 0.6): the eight scenarios PLAN lists, built as
// time -> BodyState functions and run through one noise pipeline (jitter,
// dropped points, rare single-frame spikes) so detectors face realistic input.

import {
  CLIP_VERSION,
  type ClipFile,
  type ClipFrame,
  type ClipPose,
} from '../../src/tracking/clip-format.ts';
import { hashSeed, Rand } from './prng.ts';
import { buildPose, STANDING, type BodyState } from './skeleton.ts';

const FPS = 30;
const TWO_PI = Math.PI * 2;

/** Cosine ease 0..1. */
function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return (1 - Math.cos(Math.PI * c)) / 2;
}

/** Raised-cosine pulse: 0 outside [0, width], peaking at width/2. */
function pulse(tau: number, width: number): number {
  if (tau < 0 || tau > width) return 0;
  return (1 - Math.cos((TWO_PI * tau) / width)) / 2;
}

interface KidTrack {
  stateAt(t: number): BodyState | null;
  /** Visibility shaping hook (low-vis clip, etc.). */
  shapeVisibility?(t: number, base: number, rand: Rand): number;
}

interface ClipSpec {
  name: string;
  durationS: number;
  kids: KidTrack[];
  /** Chance per kid per frame of a whole-pose miss (0 = scripted only). */
  poseDropChance: number;
}

// --- Motion builders ---------------------------------------------------------

function breathing(t: number, cx: number, bl: number, phase = 0): BodyState {
  return {
    ...STANDING,
    cx,
    bl,
    swayXBl: 0.06 * Math.sin(TWO_PI * 0.2 * t + phase),
    hipHeightRatio: 1 + 0.004 * Math.sin(TWO_PI * 0.3 * t + phase),
    armAngleL: 0.12 + 0.02 * Math.sin(TWO_PI * 0.25 * t + phase),
    armAngleR: 0.12 + 0.02 * Math.sin(TWO_PI * 0.25 * t + phase + 1),
  };
}

function stillKid(cx: number, bl: number): KidTrack {
  return { stateAt: (t) => breathing(t, cx, bl) };
}

const JUMP_STARTS = [2, 4.8, 7.6, 10.4, 13.2];

function jumpsKid(cx: number, bl: number): KidTrack {
  return {
    stateAt(t) {
      const base = breathing(t, cx, bl);
      for (const start of JUMP_STARTS) {
        const tau = t - start;
        if (tau < 0 || tau > 1.05) continue;
        if (tau < 0.25) {
          const u = ease(tau / 0.25);
          return {
            ...base,
            hipHeightRatio: 1 - 0.15 * u,
            armAngleL: -0.2 * u,
            armAngleR: -0.2 * u,
          };
        }
        if (tau < 0.3) {
          const u = ease((tau - 0.25) / 0.05);
          return {
            ...base,
            hipHeightRatio: 0.85 + 0.17 * u,
            armAngleL: -0.2 + 1.5 * u,
            armAngleR: -0.2 + 1.5 * u,
          };
        }
        if (tau < 0.75) {
          const u = (tau - 0.3) / 0.45;
          return {
            ...base,
            hipHeightRatio: 1.02,
            bodyLiftBl: 0.32 * 4 * u * (1 - u),
            kneeLiftL: 0.25,
            kneeLiftR: 0.25,
            armAngleL: 1.3 - 0.4 * u,
            armAngleR: 1.3 - 0.4 * u,
          };
        }
        const u = ease((tau - 0.75) / 0.3);
        return {
          ...base,
          hipHeightRatio: 0.92 + 0.08 * u,
          armAngleL: 0.9 - 0.78 * u,
          armAngleR: 0.9 - 0.78 * u,
        };
      }
      return base;
    },
  };
}

function runKid(cx: number, bl: number, stepsPerS: number): KidTrack {
  const firstStepT = 0.3;
  const lastStepT = 9.8;
  const width = Math.min(0.4, 0.75 / stepsPerS);
  return {
    stateAt(t) {
      const base = breathing(t, cx, bl);
      if (t < firstStepT - 0.2) return base;
      let kneeLiftL = 0;
      let kneeLiftR = 0;
      // Steps alternate legs: step i belongs to leg i % 2 (left first).
      const iNear = Math.floor((t - firstStepT) * stepsPerS);
      for (let i = Math.max(0, iNear - 1); i <= iNear + 1; i += 1) {
        const ti = firstStepT + i / stepsPerS;
        if (ti > lastStepT) break;
        const k = 0.85 * pulse(t - ti, width);
        if (i % 2 === 0) kneeLiftL = Math.max(kneeLiftL, k);
        else kneeLiftR = Math.max(kneeLiftR, k);
      }
      const running = t >= firstStepT && t <= lastStepT + width;
      return {
        ...base,
        kneeLiftL,
        kneeLiftR,
        bodyLiftBl: running ? 0.02 * Math.abs(Math.sin(Math.PI * stepsPerS * t)) : 0,
        armAngleL: running ? 0.35 + 0.25 * Math.sin(TWO_PI * (stepsPerS / 2) * t) : base.armAngleL,
        armAngleR: running
          ? 0.35 + 0.25 * Math.sin(TWO_PI * (stepsPerS / 2) * t + Math.PI)
          : base.armAngleR,
      };
    },
  };
}

const SQUAT_STARTS = [2, 6, 10];

function squatsKid(cx: number, bl: number): KidTrack {
  return {
    stateAt(t) {
      const base = breathing(t, cx, bl);
      for (const start of SQUAT_STARTS) {
        const tau = t - start;
        if (tau < 0 || tau > 3) continue;
        let ratio: number;
        if (tau < 1) ratio = 1 - 0.45 * ease(tau);
        else if (tau < 2) ratio = 0.55 + 0.01 * Math.sin(TWO_PI * 1.5 * tau);
        else ratio = 0.55 + 0.45 * ease(tau - 2);
        const armU = ease(Math.min(tau, 1)) * (tau < 2 ? 1 : 1 - ease(tau - 2));
        return {
          ...base,
          hipHeightRatio: ratio,
          armAngleL: 0.12 + 1.0 * armU,
          armAngleR: 0.12 + 1.0 * armU,
        };
      }
      return base;
    },
  };
}

function reachArmsKid(cx: number, bl: number): KidTrack {
  const UP = 2.99;
  const OUT = Math.PI / 2;
  const DOWN = 0.12;
  return {
    stateAt(t) {
      const base = breathing(t, cx, bl);
      let theta = DOWN;
      if (t < 2) theta = DOWN;
      else if (t < 3) theta = DOWN + (UP - DOWN) * ease(t - 2);
      else if (t < 6.5) theta = UP + 0.03 * Math.sin(TWO_PI * 0.5 * t);
      else if (t < 7.5) theta = UP + (OUT - UP) * ease(t - 6.5);
      else if (t < 11) theta = OUT + 0.02 * Math.sin(TWO_PI * 0.5 * t);
      else if (t < 12) theta = OUT + (DOWN - OUT) * ease(t - 11);
      return {
        ...base,
        // A touch of reach: body stretches tall while arms are up.
        hipHeightRatio: base.hipHeightRatio + (theta > 2 ? 0.02 : 0),
        armAngleL: theta,
        armAngleR: theta,
      };
    },
  };
}

/** Shared dance/steps/still medley for the long two-kid clip. */
function medleyState(t: number, cx: number, bl: number, phase: number): BodyState {
  const base = breathing(t, cx, bl, phase);
  const block = Math.floor(t / 20) % 3;
  if (block === 0) {
    // Dancing: sway + waving arms + small alternating knee bounces.
    return {
      ...base,
      swayXBl: 0.28 * Math.sin(TWO_PI * 0.55 * t + phase),
      armAngleL: 0.5 + 0.5 * Math.sin(TWO_PI * 0.75 * t + phase),
      armAngleR: 0.5 + 0.5 * Math.sin(TWO_PI * 0.75 * t + phase + Math.PI / 2),
      kneeLiftL: 0.25 * Math.max(0, Math.sin(TWO_PI * 1.1 * t + phase)),
      kneeLiftR: 0.25 * Math.max(0, Math.sin(TWO_PI * 1.1 * t + phase + Math.PI)),
    };
  }
  if (block === 1) {
    // Marching in place.
    const sps = 1.6;
    return {
      ...base,
      kneeLiftL: 0.5 * Math.max(0, Math.sin(Math.PI * sps * t + phase)),
      kneeLiftR: 0.5 * Math.max(0, Math.sin(Math.PI * sps * t + phase + Math.PI)),
      armAngleL: 0.3 + 0.2 * Math.sin(Math.PI * sps * t + phase + Math.PI),
      armAngleR: 0.3 + 0.2 * Math.sin(Math.PI * sps * t + phase),
    };
  }
  return base; // catch-your-breath block
}

/**
 * Two kids, 10+ minutes, with scripted arm-crossing episodes: the inner arm
 * reaches across the midline while hips stay firmly in their own half.
 */
function twoKidsKid(slot: 0 | 1): KidTrack {
  const cx = slot === 0 ? 0.3 : 0.7;
  const bl = slot === 0 ? 0.17 : 0.19;
  const phase = slot === 0 ? 0 : 2.1;
  const inward = slot === 0 ? 1 : -1; // toward x = 0.5
  const crossStart = slot === 0 ? 40 : 62.5;
  return {
    stateAt(t) {
      const state = medleyState(t, cx, bl, phase);
      const sinceCycle = (t - crossStart) % 45;
      if (t >= crossStart && sinceCycle >= 0 && sinceCycle < 4) {
        // Ease the lean in and out over the 4 s episode.
        const u = Math.min(ease(sinceCycle / 0.5), ease((4 - sinceCycle) / 0.5));
        const reach = Math.PI / 2 + 0.08 * Math.sin(TWO_PI * 0.8 * t);
        return {
          ...state,
          swayXBl: state.swayXBl * (1 - u) + inward * 0.32 * u,
          // The arm on the inward side: for the left kid that's the larger-x
          // ("right") arm; for the right kid the smaller-x ("left") arm.
          armAngleL: slot === 1 ? reach * u + state.armAngleL * (1 - u) : state.armAngleL,
          armAngleR: slot === 0 ? reach * u + state.armAngleR * (1 - u) : state.armAngleR,
          kneeLiftL: 0,
          kneeLiftR: 0,
        };
      }
      return state;
    },
  };
}

function walkOutKid(): KidTrack {
  const HOME = 0.32;
  const AWAY = -0.18;
  return {
    stateAt(t) {
      let cx = HOME;
      let moving = false;
      if (t < 4) cx = HOME;
      else if (t < 7) {
        cx = HOME + (AWAY - HOME) * ((t - 4) / 3);
        moving = true;
      } else if (t < 10.5) cx = AWAY;
      else if (t < 13.5) {
        cx = AWAY + (HOME - AWAY) * ((t - 10.5) / 3);
        moving = true;
      }
      if (cx < 0.02) return null; // effectively out of frame: not detected
      const base = breathing(t, cx, 0.17);
      if (!moving) return base;
      const sps = 1.8;
      return {
        ...base,
        kneeLiftL: 0.45 * Math.max(0, Math.sin(Math.PI * sps * t)),
        kneeLiftR: 0.45 * Math.max(0, Math.sin(Math.PI * sps * t + Math.PI)),
        armAngleL: 0.3,
        armAngleR: 0.3,
      };
    },
  };
}

function lowVisibilityKid(cx: number, bl: number): KidTrack {
  return {
    stateAt: (t) => breathing(t, cx, bl),
    shapeVisibility(t, base, rand) {
      // Periodic whole-body dim windows (a cloud over the lamp)...
      if ((t + 2.5) % 5 < 0.7) return rand.range(0.2, 0.42);
      // ...plus constant flicker on a fifth of the points.
      if (rand.chance(0.2)) return rand.range(0.15, 0.45);
      return base * 0.85;
    },
  };
}

// --- Synthesis pipeline ------------------------------------------------------

const JITTER_SIGMA = 0.0025;
const VIS_BASE = 0.92;
const VIS_SIGMA = 0.04;
const DROPPED_POINT_CHANCE = 0.008;
const SPIKE_CHANCE = 0.0008;

function synthesize(spec: ClipSpec): ClipFile {
  const rand = new Rand(hashSeed(spec.name));
  const frames: ClipFrame[] = [];
  const frameCount = Math.round(spec.durationS * FPS);
  let prevT = -1;

  for (let i = 0; i < frameCount; i += 1) {
    let tS = i / FPS + rand.gauss(0.0012);
    if (tS <= prevT) tS = prevT + 0.0005;
    prevT = tS;

    const poses: (ClipPose | null)[] = spec.kids.map((kid) => {
      if (spec.poseDropChance > 0 && rand.chance(spec.poseDropChance)) return null;
      const state = kid.stateAt(tS);
      if (state === null) return null;
      const pose = buildPose(state);
      return pose.map(([x, y, z, v]): [number, number, number, number] => {
        let nx = x + rand.gauss(JITTER_SIGMA);
        let ny = y + rand.gauss(JITTER_SIGMA);
        const nz = z + rand.gauss(0.02);
        let vis = Math.min(1, Math.max(0.05, v * (VIS_BASE + rand.gauss(VIS_SIGMA))));
        if (rand.chance(DROPPED_POINT_CHANCE)) vis = rand.range(0.05, 0.45);
        if (kid.shapeVisibility) vis = kid.shapeVisibility(tS, vis, rand);
        // Near the frame edge the tracker gets unsure.
        if (nx < 0.03 || nx > 0.97 || ny < 0.03) vis = Math.min(vis, rand.range(0.2, 0.45));
        // Rare single-frame outlier spike (detectors must reject these).
        if (rand.chance(SPIKE_CHANCE)) {
          nx += rand.sign() * rand.range(0.08, 0.2);
          ny += rand.sign() * rand.range(0.04, 0.1);
        }
        return [nx, ny, nz, vis];
      });
    });

    frames.push({ tS, poses });
  }

  return {
    version: CLIP_VERSION,
    name: spec.name,
    kind: 'synthetic',
    nominalFps: FPS,
    frames,
  };
}

// --- Catalog -----------------------------------------------------------------

const SPECS: ClipSpec[] = [
  { name: 'still-30s', durationS: 30, kids: [stillKid(0.5, 0.17)], poseDropChance: 0.0008 },
  { name: 'jumps-x5', durationS: 16, kids: [jumpsKid(0.5, 0.17)], poseDropChance: 0.0008 },
  { name: 'run-2sps-10s', durationS: 10.5, kids: [runKid(0.5, 0.17, 2)], poseDropChance: 0.0008 },
  { name: 'run-3sps-10s', durationS: 10.5, kids: [runKid(0.5, 0.17, 3)], poseDropChance: 0.0008 },
  { name: 'squats-x3', durationS: 14, kids: [squatsKid(0.5, 0.17)], poseDropChance: 0.0008 },
  {
    name: 'reach-and-arms-out',
    durationS: 13,
    kids: [reachArmsKid(0.5, 0.17)],
    poseDropChance: 0.0008,
  },
  {
    name: 'two-kids-10min',
    durationS: 605,
    kids: [twoKidsKid(0), twoKidsKid(1)],
    poseDropChance: 0.0015,
  },
  { name: 'walk-out-and-back', durationS: 20, kids: [walkOutKid()], poseDropChance: 0 },
  {
    name: 'low-visibility-30s',
    durationS: 30,
    kids: [lowVisibilityKid(0.5, 0.17)],
    poseDropChance: 0.002,
  },
];

export function listClipNames(): string[] {
  return SPECS.map((s) => s.name);
}

export function buildClip(name: string): ClipFile {
  const spec = SPECS.find((s) => s.name === name);
  if (spec === undefined) {
    throw new Error(`unknown clip "${name}" (have: ${listClipNames().join(', ')})`);
  }
  return synthesize(spec);
}

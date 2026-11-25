import { describe, expect, it } from 'vitest';
import * as config from './config';

// Task 0.4: src/motion/config.ts is the single home for every threshold, in
// body lengths or seconds (CLAUDE.md rule 5). Two layers of tests:
//
// 1. Hard design invariants (tracking safety, comfort, lag budget) are pinned
//    to DESIGN.md's exact numbers. Changing one of these means changing the
//    design -- the test failing is the point (ask Nick, log in DECISIONS.md).
// 2. Structural rules for everything else: unit-suffixed names, sane ranges.
//    Tunable gameplay numbers are NOT pinned, because playtest tuning is the
//    expected workflow and must not require test edits.

type Range = config.Range;

const UNIT_SUFFIXES = ['_S', '_BL', '_RATIO', '_PER_S', '_PX', '_HZ', '_DAYS', '_COUNT'] as const;

function isRange(v: unknown): v is Range {
  return typeof v === 'object' && v !== null && 'min' in v && 'max' in v;
}

function isPerAgeMode(v: unknown): v is Record<'little' | 'big', unknown> {
  return typeof v === 'object' && v !== null && 'little' in v && 'big' in v;
}

function leafNumbers(name: string, v: unknown): number[] {
  if (typeof v === 'number') return [v];
  if (isRange(v)) {
    expect(v.min, `${name}.min > max`).toBeLessThanOrEqual(v.max);
    return [v.min, v.max];
  }
  if (isPerAgeMode(v)) {
    return [...leafNumbers(`${name}.little`, v.little), ...leafNumbers(`${name}.big`, v.big)];
  }
  throw new Error(`${name}: unexpected config value shape`);
}

describe('config structure (CLAUDE.md rule 5)', () => {
  const exported = Object.entries(config).filter(([, v]) => typeof v !== 'function');

  it('exports at least the core threshold set', () => {
    expect(exported.length).toBeGreaterThanOrEqual(30);
  });

  it('every constant name carries a unit suffix', () => {
    for (const [name] of exported) {
      const ok = UNIT_SUFFIXES.some((s) => name.endsWith(s));
      expect(ok, `${name} has no unit suffix (${UNIT_SUFFIXES.join(', ')})`).toBe(true);
    }
  });

  it('every value is a finite, non-negative number (incl. ranges and per-age values)', () => {
    for (const [name, value] of exported) {
      for (const n of leafNumbers(name, value)) {
        expect(Number.isFinite(n), `${name} not finite`).toBe(true);
        expect(n, `${name} negative`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('tracking safety invariants (DESIGN.md "Two players and tracking you can trust")', () => {
  it('ignores points with visibility < 0.5', () => {
    expect(config.VISIBILITY_MIN_RATIO).toBe(0.5);
  });
  it('rejects points that move more than one body length per frame', () => {
    expect(config.OUTLIER_MAX_BL_PER_FRAME_BL).toBe(1);
  });
  it('debounces events at 150 ms', () => {
    expect(config.EVENT_DEBOUNCE_S).toBe(0.15);
  });
  it('coasts at most 1 s before pausing that kid only', () => {
    expect(config.COASTING_MAX_S).toBe(1);
  });
  it('returns to Tracked after 0.3 s of clear tracking', () => {
    expect(config.REACQUIRE_CLEAR_S).toBe(0.3);
  });
  it('holds still/moving for 0.5 s', () => {
    expect(config.STILL_MOVING_HOLD_S).toBe(0.5);
  });
  it('startup check wants head-to-ankles for 1 s', () => {
    expect(config.STARTUP_CHECK_FULL_BODY_S).toBe(1);
  });
});

describe('event definitions (DESIGN.md "Motion kit" table)', () => {
  it('squat fires when hips drop below 75% of standing hip height', () => {
    expect(config.SQUAT_HIP_DROP_RATIO).toBe(0.75);
  });
  it('jump cancels unless hips rise ~15% of body length', () => {
    expect(config.JUMP_CANCEL_RISE_BL).toBe(0.15);
  });
  it('default step pace is 2 steps/s little, 3 big', () => {
    expect(config.STEP_RATE_DEFAULT_PER_S).toEqual({ little: 2, big: 3 });
  });
});

describe('lag budget (DESIGN.md "Lag budget" table, in seconds)', () => {
  it('stage budgets and totals match the design', () => {
    expect(config.LAG_BUDGET_CAMERA_S).toBe(0.045);
    expect(config.LAG_BUDGET_TRACKING_S).toBe(0.02);
    expect(config.LAG_BUDGET_MOTION_KIT_S).toBe(0.002);
    expect(config.LAG_BUDGET_GAME_DRAW_S).toBe(0.017);
    expect(config.LAG_BUDGET_TV_S).toBe(0.015);
    expect(config.LAG_BUDGET_TOTAL_S).toBe(0.1);
    expect(config.LAG_HARD_LIMIT_S).toBe(0.12);
  });
  it('stage budgets sum to no more than the total budget', () => {
    const sum =
      config.LAG_BUDGET_CAMERA_S +
      config.LAG_BUDGET_TRACKING_S +
      config.LAG_BUDGET_MOTION_KIT_S +
      config.LAG_BUDGET_GAME_DRAW_S +
      config.LAG_BUDGET_TV_S;
    expect(sum).toBeLessThanOrEqual(config.LAG_BUDGET_TOTAL_S + 1e-9);
  });
  it('device check and bench thresholds match', () => {
    expect(config.DEVICE_CHECK_TRACKING_MAX_S).toBe(0.02);
    expect(config.BENCH_MOTION_KIT_AVG_MAX_S).toBe(0.001);
    expect(config.BENCH_MOTION_KIT_P99_MAX_S).toBe(0.002);
  });
});

describe('comfort and fairness invariants', () => {
  it('flash ceiling is 3 per second (content must stay well under)', () => {
    expect(config.FLASH_CEILING_PER_S).toBe(3);
  });
  it('freeze grace windows: 1.0 s little, 0.5 s big', () => {
    expect(config.FREEZE_GRACE_S).toEqual({ little: 1, big: 0.5 });
  });
  it('praise later than 1 s is dropped; help lines at most every 8 s', () => {
    expect(config.PRAISE_LATE_DROP_S).toBe(1);
    expect(config.HELP_LINE_COOLDOWN_S).toBe(8);
  });
  it('buddy prediction is ~30 ms', () => {
    expect(config.BUDDY_PREDICTION_S).toBe(0.03);
  });
  it('difficulty: 3 wins up, 2 misses down', () => {
    expect(config.DIFFICULTY_UP_AFTER_WINS_COUNT).toBe(3);
    expect(config.DIFFICULTY_DOWN_AFTER_MISSES_COUNT).toBe(2);
  });
  it('session anchors: 10 s game intro, 1-minute cool-down, 5-pop rainbow burst', () => {
    expect(config.GAME_INTRO_S).toBe(10);
    expect(config.COOLDOWN_STRETCH_S).toBe(60);
    expect(config.RAINBOW_BURST_POPS_COUNT).toBe(5);
  });
});

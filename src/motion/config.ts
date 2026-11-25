// Every threshold in the app lives here as a named constant with a unit
// suffix, in body lengths or seconds (CLAUDE.md rule 5). Detectors and games
// never hardcode numbers. Per-kid warm-up calibration (M1.5) overrides the
// defaults below at runtime; these are the fallbacks and the design anchors.
//
// Unit suffixes (enforced by config.test.ts):
//   _S seconds · _BL body lengths (shoulder-mid to hip-mid) · _RATIO 0..1 or
//   multiplier · _PER_S rate · _PX pixels · _HZ frequency · _DAYS days ·
//   _COUNT whole counts
//
// DESIGN.md is the source for every number. Hard safety/comfort invariants are
// pinned by tests; gameplay numbers are structurally checked and free to tune
// from playtests.

import type { AgeMode } from '../games/types';

export interface Range {
  readonly min: number;
  readonly max: number;
}

export type PerAgeMode<T = number> = Readonly<Record<AgeMode, T>>;

// --- Camera (DESIGN.md "Lag budget": 60 fps at 640x480) --------------------

export const CAMERA_WIDTH_PX = 640;
export const CAMERA_HEIGHT_PX = 480;
export const CAMERA_TARGET_FPS_HZ = 60;

// --- Tracking safety (CLAUDE.md rule 6; DESIGN.md "Taming jitter") ----------

/** Ignore landmarks with visibility below this; never guess them. */
export const VISIBILITY_MIN_RATIO = 0.5;
/** Reject a point that moves more than one body length in a single frame. */
export const OUTLIER_MAX_BL_PER_FRAME_BL = 1;
/** The same event can't fire twice within 150 ms. */
export const EVENT_DEBOUNCE_S = 0.15;
/** Coasting lasts at most 1 s before that kid (only) pauses. */
export const COASTING_MAX_S = 1;
/** Paused -> Tracked after this much clear tracking (prevents flicker). */
export const REACQUIRE_CLEAR_S = 0.3;
/** "Left the frame": key points missing longer than this pauses that kid. */
export const LEFT_FRAME_AFTER_S = 1;
/** Start-up check: kid seen head to ankles for this long turns the circle green. */
export const STARTUP_CHECK_FULL_BODY_S = 1;
/** Passing bar: a kid stepping back in is playing again within this time. */
export const REJOIN_WITHIN_S = 0.5;
/** Passing bar: tracking lost under 2% of play time per kid in a lit room. */
export const TRACKING_LOST_MAX_RATIO = 0.02;

// --- Event detection (DESIGN.md "Motion kit" events table) ------------------

/** moving/still: total body motion above/below threshold for 0.5 s. */
export const STILL_MOVING_HOLD_S = 0.5;
/** squat: hips drop below 75% of standing hip height. */
export const SQUAT_HIP_DROP_RATIO = 0.75;
/** jump: cancelled if hips don't rise ~15% of body length after takeoff. */
export const JUMP_CANCEL_RISE_BL = 0.15;
/** Default top step pace until warm-up measures the kid's own. */
export const STEP_RATE_DEFAULT_PER_S: PerAgeMode = { little: 2, big: 3 };
/** Warm-up jump line sits at half the kid's own measured hop height. */
export const JUMP_LINE_OF_OWN_HOP_RATIO = 0.5;

// --- Buddy avatar (DESIGN.md "Code rules that keep lag out" #3) -------------

/** Buddy is drawn ~30 ms ahead of the latest pose using joint velocity. */
export const BUDDY_PREDICTION_S = 0.03;

// --- Lag budget (DESIGN.md "Lag budget" table) -------------------------------

export const LAG_BUDGET_CAMERA_S = 0.045;
export const LAG_BUDGET_TRACKING_S = 0.02;
export const LAG_BUDGET_MOTION_KIT_S = 0.002;
export const LAG_BUDGET_GAME_DRAW_S = 0.017;
export const LAG_BUDGET_TV_S = 0.015;
export const LAG_BUDGET_TOTAL_S = 0.1;
export const LAG_HARD_LIMIT_S = 0.12;
/** Device check: two-kid tracking must stay under this per frame. */
export const DEVICE_CHECK_TRACKING_MAX_S = 0.02;
/** npm run bench: motion kit over the 10-min two-kid clip, average per frame. */
export const BENCH_MOTION_KIT_AVG_MAX_S = 0.001;
/** npm run bench: p99 per frame. */
export const BENCH_MOTION_KIT_P99_MAX_S = 0.002;

// --- Comfort (DESIGN.md "Design principles") ---------------------------------

/** Hard ceiling; content must stay well under (automated check in M4.2). */
export const FLASH_CEILING_PER_S = 3;

// --- Voice (DESIGN.md "Voice guide") -----------------------------------------

/** Praise arriving later than this after the moment is dropped, not played. */
export const PRAISE_LATE_DROP_S = 1;
/** A help line repeats at most every 8 s. */
export const HELP_LINE_COOLDOWN_S = 8;
/** Rough line length targets. */
export const VOICE_LINE_WORDS_COUNT: PerAgeMode = { little: 6, big: 10 };

// --- Warm-up calibration (DESIGN.md "Warm-up calibration" table) -------------

export const WARMUP_TOTAL_S = 30;
export const WARMUP_STAND_TALL_S = 2;
export const WARMUP_STATUE_S = 3;
export const WARMUP_REACH_UP_S = 2;
export const WARMUP_ARMS_OUT_S = 2;
export const WARMUP_SQUAT_REPS_COUNT = 2;
export const WARMUP_HOP_REPS_COUNT = 3;
export const WARMUP_RUN_IN_PLACE_S = 5;
/** A move not picked up after 2 tries gets a slower demo, then the default. */
export const WARMUP_MAX_TRIES_COUNT = 2;
/** The app suggests re-running the warm-up every ~3 months. */
export const CALIBRATION_REDO_SUGGEST_DAYS = 90;

// --- Difficulty (DESIGN.md "What makes it fun") ------------------------------

export const DIFFICULTY_UP_AFTER_WINS_COUNT = 3;
export const DIFFICULTY_DOWN_AFTER_MISSES_COUNT = 2;

// --- Freeze Dance (DESIGN.md "Game 1") ---------------------------------------

/** Music play time between freezes. */
export const FREEZE_MUSIC_GAP_S: PerAgeMode<Range> = {
  little: { min: 4, max: 8 },
  big: { min: 3, max: 10 },
};
/** Grace window to freeze after the music stops reaching the room. */
export const FREEZE_GRACE_S: PerAgeMode = { little: 1, big: 0.5 };
/** How long each freeze lasts before the music returns. */
export const FREEZE_STOP_S: Range = { min: 3, max: 5 };
/** Freezes per ~2 minute round. */
export const FREEZES_PER_ROUND_COUNT: Range = { min: 6, max: 8 };
/** Every third round plays the slow-motion dance song. */
export const FREEZE_SLOWMO_ROUND_INTERVAL_COUNT = 3;

// --- Critter Dash (DESIGN.md "Game 2") ---------------------------------------

export const RACE_LENGTH_S: PerAgeMode<Range> = {
  little: { min: 30, max: 30 },
  big: { min: 45, max: 60 },
};
/** Critter keeps its speed this long while steps aren't seen (coasting). */
export const CRITTER_COAST_KEEP_SPEED_S = 1;
/** Steady rhythm for this long earns the sparkle trail and boost. */
export const RHYTHM_SPARKLE_AFTER_S = 3;

// --- Bubble Pop (DESIGN.md "Game 3") -----------------------------------------

export const BUBBLE_ROUND_S = 90;
/** Touch margin around a bubble, in multiples of the kid's hand width. */
export const TOUCH_MARGIN_HAND_WIDTHS_RATIO: PerAgeMode = { little: 1, big: 0.5 };

// --- Shell (DESIGN.md "App shell and parent settings") -----------------------

/** Hold a hand over a card this long (ring fills) to pick it. */
export const HOLD_TO_PICK_S = 2;
/** Parent gate: hold the key this long. */
export const PARENT_GATE_HOLD_S = 3;
/** If one circle stays empty this long, the game starts solo. */
export const SOLO_START_AFTER_EMPTY_S = 10;
/** "Arms up" restarts the round within this. */
export const REPLAY_RESTART_MAX_S = 3;
/** Session timer heads-up before the cool-down. */
export const SESSION_HEADSUP_S = 120;
/** Round length targets (DESIGN.md age table). */
export const ROUND_LENGTH_S: PerAgeMode<Range> = {
  little: { min: 60, max: 120 },
  big: { min: 120, max: 180 },
};
/** Something new happens at least this often during a round. */
export const NOVELTY_INTERVAL_S: Range = { min: 20, max: 30 };
/** Every kid scores within this after "go" (first-win rule). */
export const FIRST_WIN_WITHIN_S = 10;
/** All games preload; opening any game takes less than this. */
export const GAME_OPEN_MAX_S = 1;

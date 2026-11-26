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
/** Two kids play at once; MediaPipe numPoses and the slot count. */
export const MAX_PLAYERS_COUNT = 2;

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
/** A hip straddling mid-screen keeps its previous slot inside this band
 * (fraction of image width around 0.5) -- no boundary flicker. */
export const PLAYER_SIDE_DEADBAND_RATIO = 0.04;

// --- Start-up check (M1.3; DESIGN start-up check table) ----------------------

/** Worker samples brightness stats this often (stats only, never pixels). */
export const LUMA_SAMPLE_EVERY_S = 0.5;
/** Mean luma below this = "It's a bit dark." */
export const STARTUP_DARK_LUMA_MAX_RATIO = 0.18;
/** Background brighter than this AND... */
export const STARTUP_BACKLIGHT_BG_LUMA_MIN_RATIO = 0.75;
/** ...this much brighter than the body area = "Something bright behind you." */
export const STARTUP_BACKLIGHT_DELTA_MIN_RATIO = 0.35;
/** Head-to-ankle span above this fraction of the frame = "too close". */
export const STARTUP_TOO_CLOSE_SPAN_RATIO = 0.92;
/** Ankles at/below this image y count as "feet out of frame". */
export const STARTUP_FEET_EDGE_Y_RATIO = 0.97;
/** A problem shorter than this is a tracking flicker: it is reported but
 * does NOT reset the accumulated full-body second (real tracking always
 * drops single frames; a frame-perfect second would be unreachable). */
export const STARTUP_BLIP_TOLERANCE_S = 0.2;
/** Ready also requires the recent problem fraction (~1 s EWMA) below this:
 * sustained rapid flicker (a dim room, ~0.5 here) must fail even when no
 * single problem persists past the blip tolerance. Healthy tracking sits
 * near 0.02-0.05 with occasional clusters to ~0.13 -- 0.2 separates cleanly. */
export const STARTUP_FLICKER_MAX_RATIO = 0.2;
/** Passing bar: a kid stepping back in is playing again within this time. */
export const REJOIN_WITHIN_S = 0.5;
/** Passing bar: tracking lost under 2% of play time per kid in a lit room. */
export const TRACKING_LOST_MAX_RATIO = 0.02;

// --- Motion kit filters (M1.1; DESIGN.md "Smooth: One Euro filter") ---------

/** One Euro: baseline cutoff while nearly still (heavy smoothing). */
export const ONE_EURO_MIN_CUTOFF_HZ = 1.2;
/** One Euro: cutoff for the internal speed estimate. */
export const ONE_EURO_D_CUTOFF_HZ = 1.5;
/** One Euro: extra cutoff per unit of speed (almost no smoothing when fast).
 * Units: Hz per (unit/s). 2.0 keeps filter-induced lag under ~50 ms at
 * 2 units/s (test-pinned) while leaving stillness heavily smoothed. */
export const ONE_EURO_BETA_COEFF = 2.0;

// --- Event detection (DESIGN.md "Motion kit" events table) ------------------

/** moving/still: becoming STILL requires energy below the line this long
 * (freezes must be confirmed); see MOVING_CONFIRM_S for the fast direction. */
export const STILL_MOVING_HOLD_S = 0.5;
/** Becoming MOVING is fast (PLAN M1.4: "within 150 ms of motion starting"):
 * energy above the line for this long flips the state. */
export const MOVING_CONFIRM_S = 0.1;
/** Default still line until the warm-up measures the kid's own wobble
 * (DESIGN: "set just above their wobble"). Mean smoothed core-point speed. */
export const STILL_LINE_DEFAULT_BL_PER_S = 0.25;
/** Hysteresis around the still line: moving enters above line × HI, still
 * re-enters below line × LO. */
export const MOVING_ENTER_HI_COEFF = 1.5;
export const STILL_ENTER_LO_COEFF = 0.7;
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
/** Extrapolation horizon: as a pose goes stale (coasting) the effective
 * look-ahead saturates at this, so the buddy keeps its last motion briefly
 * and settles instead of flying off. */
export const BUDDY_EXTRAPOLATION_CAP_S = 0.25;
/** Velocity EWMA time constant for the prediction. */
export const BUDDY_VELOCITY_SMOOTH_S = 0.1;
/** Position EWMA time constant. An exponential smoother trails a moving
 * target by exactly v*tau, so the sampler adds tau to its look-ahead and the
 * lag cancels -- cheaper and more predictable than One Euro for a purely
 * cosmetic pose. */
export const BUDDY_POSITION_SMOOTH_S = 0.05;
/** A buddy pose older than this is drawn but flagged stale. */
export const BUDDY_FRESH_MAX_AGE_S = 0.25;
/** Reaction animation lengths. */
export const BUDDY_GIGGLE_S = 0.8;
export const BUDDY_CHEER_S = 1.2;
export const BUDDY_WAVE_S = 1.0;
/** Statue sparkle ramps in over this long after the freeze latches. */
export const BUDDY_STATUE_RAMP_S = 0.5;

// --- Lag budget (DESIGN.md "Lag budget" table) -------------------------------

export const LAG_BUDGET_CAMERA_S = 0.045;
export const LAG_BUDGET_TRACKING_S = 0.02;
export const LAG_BUDGET_MOTION_KIT_S = 0.002;
export const LAG_BUDGET_GAME_DRAW_S = 0.017;
export const LAG_BUDGET_TV_S = 0.015;
export const LAG_BUDGET_TOTAL_S = 0.1;
export const LAG_HARD_LIMIT_S = 0.12;
/** Device check LADDER trigger: above this, try a smaller camera input first.
 * 0.02 is DESIGN's original main-thread tracking budget; in the worker era
 * (M0.9) it is the aspirational target, not the alarm line. */
export const DEVICE_CHECK_TRACKING_MAX_S = 0.02;
/** Device check WARNING line (worker era): inference latency that pushes the
 * END-TO-END lag past the 120 ms hard limit. Derivation from DESIGN's lag
 * table: 0.120 − camera 0.045 − game+draw 0.017 − TV 0.015 = 0.043. Rendering
 * is no longer at risk (inference is off-thread); only total lag is. */
export const DEVICE_CHECK_WARN_S = 0.043;
/** First-run benchmark length. */
export const DEVICE_CHECK_DURATION_S = 5;
/** Input-size reduction ladder when tracking is too slow (paired by index). */
export const CAMERA_FALLBACK_WIDTHS_PX: readonly number[] = [480, 320];
export const CAMERA_FALLBACK_HEIGHTS_PX: readonly number[] = [360, 240];
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
/** Each game opens with a ~10 s spoken intro while the buddies demonstrate. */
export const GAME_INTRO_S = 10;

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
/** The still line sits "just above their wobble": wobble × this. */
export const STILL_LINE_FROM_WOBBLE_COEFF = 1.5;
/** Age-mode fallbacks per calibration field when a move is skipped.
 * Units per field: hip height/reach/span/hop in BL; squat as ratio of
 * standing hip height; wobble in BL/s; steps in per-second. */
export const WARMUP_DEFAULT_CALIBRATION_TABLE: PerAgeMode<{
  standingHipHeightBl: number;
  statueWobbleBlPerS: number;
  reachHeightBl: number;
  armSpanBl: number;
  squatDepthRatio: number;
  hopHeightBl: number;
  stepRatePerS: number;
}> = {
  little: {
    standingHipHeightBl: 1.6,
    statueWobbleBlPerS: 0.17,
    reachHeightBl: 2.1,
    armSpanBl: 2.2,
    squatDepthRatio: 0.6,
    hopHeightBl: 0.22,
    stepRatePerS: 2,
  },
  big: {
    standingHipHeightBl: 1.6,
    statueWobbleBlPerS: 0.12,
    reachHeightBl: 2.3,
    armSpanBl: 2.35,
    squatDepthRatio: 0.55,
    hopHeightBl: 0.3,
    stepRatePerS: 3,
  },
};
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
/** Five quick pops trigger the rainbow burst. */
export const RAINBOW_BURST_POPS_COUNT = 5;

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
/** Each session ends with a 1-minute cool-down stretch (DESIGN "Safety"). */
export const COOLDOWN_STRETCH_S = 60;
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

// --- Dev tools ---------------------------------------------------------------

/** Pose recorder auto-stops here (covers the 10-min clip with margin). */
export const RECORDER_MAX_S = 660;
/** Clip-recording mode: get-ready countdown before each take. */
export const RECORD_COUNTDOWN_S = 3;

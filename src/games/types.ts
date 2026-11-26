// The game contract (CLAUDE.md "Game contract"). Games receive everything
// through GameContext and never touch src/tracking or raw landmarks (rule 1,
// lint-enforced). This is the CLAUDE.md starting point fleshed out with the
// referenced types; refinements are logged in docs/DECISIONS.md.

import type { ColorToken, Theme } from '../ui/theme';

export type AgeMode = 'little' | 'big';

/** Learning-content band (DESIGN "Learning layer"): a per-kid CONTENT axis,
 * separate from Little/Big motion difficulty. 'off' = pure play (default). */
export type GradeBand = 'off' | 'prek' | 'k' | 'g1' | 'g2';
export type Slot = 0 | 1;

export type MovementKind = 'stop-go' | 'run' | 'jump' | 'reach' | 'squat';

export interface GameManifest {
  id: string;
  name: string;
  ages: [number, number];
  players: { min: 1; max: 2 };
  movement: MovementKind[];
  intensity: 1 | 2 | 3;
}

/**
 * Per-kid measurements from the 30 s warm-up (DESIGN.md "Warm-up calibration"
 * table). BL = body lengths (shoulder midpoint to hip midpoint). Filled by
 * M1.5; until then age-mode defaults from src/motion/config.ts apply.
 */
export interface Calibration {
  /** The BL unit itself: standing body length in normalized image units. */
  bodyLengthImage: number;
  /** Standing hip height above the ankle line, in BL (squat/jump baselines). */
  standingHipHeightBl: number;
  /** Wobble while holding still, in BL/s (the kid's personal still line). */
  statueWobbleBlPerS: number;
  /** Highest hand reach, in BL (how high bubbles float). */
  reachHeightBl: number;
  /** Arm span, in BL (touch margins, bubble spread, scoot-apart warning). */
  armSpanBl: number;
  /** Squat hip drop as a ratio of standing hip height. */
  squatDepthRatio: number;
  /** Own hop height, in BL (jump line = half of this). */
  hopHeightBl: number;
  /** Natural fast step rate, steps per second (Critter Dash top speed). */
  stepRatePerS: number;
  /** When measured (epoch ms), for the ~3-month redo suggestion. */
  measuredAtMs: number;
}

/** Per-kid tracking state machine (DESIGN.md "When the camera loses a kid"). */
export type TrackingState = 'tracked' | 'coasting' | 'paused';

export type MotionEventName = 'jump' | 'step' | 'squat' | 'still' | 'moving' | 'armsUp';

export interface MotionEvent {
  name: MotionEventName;
  slot: Slot;
  /** Event time on the shared monotonic clock, in seconds. */
  tS: number;
}

export type MotionEventHandler = (event: MotionEvent) => void;

export interface BuddyPoint {
  /** Normalized 0..1 across the full camera image (the renderer maps halves
   * and mirroring). */
  x: number;
  y: number;
}

/**
 * Smoothed, lightly predicted joints for drawing the buddy avatar -- NOT raw
 * landmarks. Produced by the motion kit (M1.7) with ~30 ms prediction.
 * Eight anchor joints; elbows/knees are synthesized by the blob geometry
 * (refined from the 14-joint sketch -- see DECISIONS.md, M1.9).
 */
export interface BuddyPose {
  head: BuddyPoint;
  shoulderL: BuddyPoint;
  shoulderR: BuddyPoint;
  handL: BuddyPoint;
  handR: BuddyPoint;
  hipMid: BuddyPoint;
  footL: BuddyPoint;
  footR: BuddyPoint;
  /** The BL unit in image units (sizes the blob). */
  bodyLengthImage: number;
  /** False while coasting/paused: the pose is held, not live. */
  fresh: boolean;
}

export interface MotionEvents {
  /** Subscribe to a motion event; returns an unsubscribe function. */
  on(name: MotionEventName, handler: MotionEventHandler): () => void;
  /** Latest drawable pose for a slot, or null while that kid is unseen. */
  pose(slot: Slot): BuddyPose | null;
  tracking(slot: Slot): TrackingState;
  /** The motion clock every event tS lives on. Games tick their rules with
   * this, never with performance.now() (live sources zero-base time). */
  nowS(): number;
}

export interface SayOptions {
  /** Start the line with the kid's color/name and pan to their side. */
  player?: Slot;
}

/** All narration goes through here (CLAUDE.md rule 10). Implemented in M1.6. */
export interface Narrator {
  say(lineId: string, options?: SayOptions): void;
}

/** Music and sfx with ducking and measured output delay. Implemented in M1.6/M1.8. */
export interface AudioBus {
  playMusic(id: string): void;
  stopMusic(fadeS?: number): void;
  playSfx(id: string): void;
  /** Measured full audio output delay in seconds (M1.8 "clap with the drum"). */
  outputDelayS: number;
}

export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export interface PlayerInfo {
  slot: Slot;
  /** Theme token name, e.g. 'playerBlue' (colors only via src/ui/theme.ts). */
  color: ColorToken;
  name?: string;
  mode: AgeMode;
  /** Learning band; absent = 'off' (pure play). */
  grade?: GradeBand;
  calibration: Calibration;
}

export interface PlayerRoundResult {
  slot: Slot;
  /** Stars earned this round (every round earns at least one in Little mode). */
  stars: number;
  /** Big-mode score; omitted in Little mode (losing doesn't exist there). */
  score?: number;
}

export interface RoundResult {
  gameId: string;
  perPlayer: PlayerRoundResult[];
  /** Co-op moment achieved (team snowstorm, shared bubble jar...). */
  coopBonus?: boolean;
}

export interface GameContext {
  players: PlayerInfo[];
  motion: MotionEvents;
  voice: Narrator;
  audio: AudioBus;
  theme: Theme;
  /** Per-kid dynamic difficulty: 3 wins in a row -> up, 2 misses -> down. */
  difficulty(slot: Slot): DifficultyLevel;
  /** Learning content for this round (DESIGN "Learning layer"); absent when
   * every active kid's grade is off. Words come pre-filtered: action tags
   * only for moves the current motion source can actually detect. */
  learning?: {
    words: { word: string; action?: 'go' | 'up' }[];
  };
  /** A game calls this exactly once, when its round ends. */
  finish(result: RoundResult): void;
}

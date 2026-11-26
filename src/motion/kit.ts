// MotionKit (M1.9): the facade games receive as ctx.motion. Owns the player
// tracker, a moving/still detector + buddy sampler per slot, and the armsUp
// edge. Games never see below this line (CLAUDE.md rule 1). jump/step/squat
// land in M2 with their detectors.

import type {
  BuddyPose,
  MotionEvent,
  MotionEventHandler,
  MotionEventName,
  Slot,
  TrackingState,
} from '../games/types';
import type { ClipPose } from '../tracking/clip-format.ts';
import { POSE } from '../tracking/clip-format.ts';
import { ARMS_UP_WRIST_ABOVE_HIP_BL, EVENT_DEBOUNCE_S, MAX_PLAYERS_COUNT } from './config.ts';
import { BuddyPoseSampler } from './buddy-pose.ts';
import { EventDebounce } from './debounce.ts';
import { MovingStillDetector } from './moving-still.ts';
import { PlayerTracker, type PlayersFrame } from './players.ts';

export interface MotionSource {
  on(name: MotionEventName, handler: MotionEventHandler): () => void;
  pose(slot: Slot): BuddyPose | null;
  tracking(slot: Slot): TrackingState;
}

const SLOTS: readonly Slot[] = [0, 1];

export class MotionKit implements MotionSource {
  private readonly tracker = new PlayerTracker();
  private readonly detectors = SLOTS.map(() => new MovingStillDetector());
  private readonly samplers = SLOTS.map(() => new BuddyPoseSampler());
  private readonly armsUpDebounce = SLOTS.map(() => new EventDebounce(EVENT_DEBOUNCE_S));
  private readonly armsWereUp: boolean[] = SLOTS.map(() => false);
  private readonly handlers = new Map<MotionEventName, Set<MotionEventHandler>>();
  private lastFrame: PlayersFrame | null = null;
  private readonly now: () => number;

  constructor(now: () => number = () => this.lastFrame?.tS ?? 0) {
    this.now = now;
  }

  /** Feed one camera frame's poses (at most MAX_PLAYERS_COUNT). */
  update(tS: number, rawPoses: readonly (ClipPose | null)[]): PlayersFrame {
    const frame = this.tracker.update(tS, rawPoses.slice(0, MAX_PLAYERS_COUNT));
    this.lastFrame = frame;
    for (const view of frame.players) {
      const slot = view.slot;
      if (!view.seenNow || view.pose === null) continue;
      this.samplers[slot]?.push(view.pose, tS);

      const result = this.detectors[slot]?.update(view.pose, tS);
      if (result?.changed === true) {
        this.emit({ name: result.moving ? 'moving' : 'still', slot, tS });
      }

      // armsUp: both wrists clearly above the head line, rising edge only.
      const lw = view.pose.points[POSE.leftWrist];
      const rw = view.pose.points[POSE.rightWrist];
      if (lw?.ok === true && rw?.ok === true) {
        const up = -lw.yBl >= ARMS_UP_WRIST_ABOVE_HIP_BL && -rw.yBl >= ARMS_UP_WRIST_ABOVE_HIP_BL;
        if (up && this.armsWereUp[slot] === false && this.armsUpDebounce[slot]?.tryFire(tS)) {
          this.emit({ name: 'armsUp', slot, tS });
        }
        this.armsWereUp[slot] = up;
      }
    }
    return frame;
  }

  /** Per-kid still line from the warm-up calibration (BL/s). */
  setStillLine(slot: Slot, stillLineBlPerS: number): void {
    this.detectors[slot] = new MovingStillDetector(stillLineBlPerS);
  }

  on(name: MotionEventName, handler: MotionEventHandler): () => void {
    let set = this.handlers.get(name);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler);
    return () => void set.delete(handler);
  }

  pose(slot: Slot): BuddyPose | null {
    return this.samplers[slot]?.sample(this.now()) ?? null;
  }

  tracking(slot: Slot): TrackingState {
    return this.lastFrame === null ? 'paused' : this.lastFrame.players[slot].state;
  }

  private emit(event: MotionEvent): void {
    const set = this.handlers.get(event.name);
    if (set === undefined) return;
    for (const handler of set) handler(event);
  }
}

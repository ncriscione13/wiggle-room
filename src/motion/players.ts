// Player binding + per-kid tracking states (M1.2; DESIGN "Two players and
// tracking you can trust"). Each kid is bound to a HALF of the camera image
// by hip center -- never a face -- so crossing arms can't swap players. Two
// bodies in one half crowd that half only ("One buddy per circle!"); the
// other kid keeps playing. Per kid: Tracked -> Coasting (<= 1 s, buddy keeps
// the last pose, nothing counts against the kid) -> Paused -> Tracked again
// after 0.3 s of continuous clear tracking.

import type { ClipPose } from '../tracking/clip-format.ts';
import { POSE } from '../tracking/clip-format.ts';
import type { Slot, TrackingState } from '../games/types';
import {
  COASTING_MAX_S,
  PLAYER_SIDE_DEADBAND_RATIO,
  REACQUIRE_CLEAR_S,
  VISIBILITY_MIN_RATIO,
} from './config.ts';
import { preparePose, type PreparedPose } from './frame-prep.ts';

export interface PlayerView {
  slot: Slot;
  state: TrackingState;
  /** Last known prepared pose (kept through coasting/paused for the buddy). */
  pose: PreparedPose | null;
  /** A usable pose was assigned to this slot THIS frame. */
  seenNow: boolean;
  /** More than one body in this half this frame. */
  crowded: boolean;
}

export interface PlayersFrame {
  tS: number;
  players: [PlayerView, PlayerView];
  transitions: { slot: Slot; from: TrackingState; to: TrackingState }[];
}

interface SlotState {
  state: TrackingState;
  pose: PreparedPose | null;
  lastSeenTS: number;
  clearSinceTS: number | null;
  lastHipX: number | null;
}

/** Hip-center x from a raw pose, visibility-gated; null = unusable. */
function rawHipX(pose: ClipPose): number | null {
  const lh = pose[POSE.leftHip];
  const rh = pose[POSE.rightHip];
  if (lh === undefined || rh === undefined) return null;
  if (lh[3] < VISIBILITY_MIN_RATIO || rh[3] < VISIBILITY_MIN_RATIO) return null;
  return (lh[0] + rh[0]) / 2;
}

export class PlayerTracker {
  private readonly slots: [SlotState, SlotState] = [
    { state: 'paused', pose: null, lastSeenTS: -Infinity, clearSinceTS: null, lastHipX: null },
    { state: 'paused', pose: null, lastSeenTS: -Infinity, clearSinceTS: null, lastHipX: null },
  ];

  update(tS: number, rawPoses: readonly (ClipPose | null)[]): PlayersFrame {
    // 1. Collect usable candidates with their hip x.
    const candidates: { pose: ClipPose; x: number }[] = [];
    for (const raw of rawPoses) {
      if (raw === null) continue;
      const x = rawHipX(raw);
      if (x !== null) candidates.push({ pose: raw, x });
    }

    // 2. Assign candidates to halves (deadband keeps a straddler with its
    //    previous slot). Within a half, the candidate nearest the slot's last
    //    hip (or the half center) is the player; extras crowd the half.
    const byHalf: [typeof candidates, typeof candidates] = [[], []];
    for (const c of candidates) {
      let half: Slot;
      if (c.x < 0.5 - PLAYER_SIDE_DEADBAND_RATIO) half = 0;
      else if (c.x > 0.5 + PLAYER_SIDE_DEADBAND_RATIO) half = 1;
      else {
        const d0 =
          this.slots[0].lastHipX === null ? Infinity : Math.abs(c.x - this.slots[0].lastHipX);
        const d1 =
          this.slots[1].lastHipX === null ? Infinity : Math.abs(c.x - this.slots[1].lastHipX);
        half = d0 <= d1 ? 0 : 1;
      }
      byHalf[half].push(c);
    }

    const transitions: PlayersFrame['transitions'] = [];
    const views: PlayerView[] = [];

    for (const slot of [0, 1] as const) {
      const s = this.slots[slot];
      const before = s.state;
      const inHalf = byHalf[slot];
      const anchor = s.lastHipX ?? (slot === 0 ? 0.25 : 0.75);
      inHalf.sort((a, b) => Math.abs(a.x - anchor) - Math.abs(b.x - anchor));
      const chosen = inHalf[0];
      const crowded = inHalf.length > 1;

      let seenNow = false;
      if (chosen !== undefined) {
        const prepared = preparePose(chosen.pose, s.pose);
        if (prepared !== null) {
          seenNow = true;
          s.pose = prepared;
          s.lastHipX = prepared.hipMid.x;
          s.lastSeenTS = tS;
          if (s.state === 'paused') {
            s.clearSinceTS ??= tS;
            if (tS - s.clearSinceTS >= REACQUIRE_CLEAR_S) s.state = 'tracked';
          } else {
            s.state = 'tracked';
          }
        }
      }
      if (!seenNow) {
        s.clearSinceTS = null; // any blip restarts the reacquire window
        if (s.state === 'tracked') s.state = 'coasting';
        if (s.state === 'coasting' && tS - s.lastSeenTS > COASTING_MAX_S) s.state = 'paused';
      }

      if (s.state !== before) transitions.push({ slot, from: before, to: s.state });
      views.push({ slot, state: s.state, pose: s.pose, seenNow, crowded });
    }

    return { tS, players: [views[0] as PlayerView, views[1] as PlayerView], transitions };
  }
}

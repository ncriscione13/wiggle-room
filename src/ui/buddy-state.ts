// Buddy reaction state (M1.7; DESIGN Freeze Dance): giggle, statue, cheer,
// wave. Statue latches (holding still) until cleared; any timed reaction
// plays over it, and a giggle breaks it -- a wobble "shakes off the snow",
// funny, never a failure. Pure and clock-injected for tests; the painter
// turns {kind, phase01} into shapes.

import { BUDDY_CHEER_S, BUDDY_GIGGLE_S, BUDDY_STATUE_RAMP_S, BUDDY_WAVE_S } from '../motion/config';

export type BuddyReactionKind = 'idle' | 'giggle' | 'statue' | 'cheer' | 'wave';

export interface BuddyReactionState {
  kind: BuddyReactionKind;
  /** 0..1 progress through a timed reaction (or statue sparkle ramp). */
  phase01: number;
}

const DURATION_S: Record<'giggle' | 'cheer' | 'wave', number> = {
  giggle: BUDDY_GIGGLE_S,
  cheer: BUDDY_CHEER_S,
  wave: BUDDY_WAVE_S,
};

export class BuddyReactions {
  private timed: { kind: 'giggle' | 'cheer' | 'wave'; startS: number } | null = null;
  private statueSinceS: number | null = null;

  trigger(kind: Exclude<BuddyReactionKind, 'idle'>, tS: number): void {
    if (kind === 'statue') {
      this.statueSinceS ??= tS;
      return;
    }
    this.timed = { kind, startS: tS };
    // A wobble/cheer/wave breaks the statue.
    this.statueSinceS = null;
  }

  clearStatue(): void {
    this.statueSinceS = null;
  }

  update(tS: number): BuddyReactionState {
    if (this.timed !== null) {
      const duration = DURATION_S[this.timed.kind];
      const phase01 = (tS - this.timed.startS) / duration;
      if (phase01 < 1) return { kind: this.timed.kind, phase01: Math.max(0, phase01) };
      this.timed = null;
    }
    if (this.statueSinceS !== null) {
      const phase01 = Math.min(1, (tS - this.statueSinceS) / BUDDY_STATUE_RAMP_S);
      return { kind: 'statue', phase01 };
    }
    return { kind: 'idle', phase01: 0 };
  }
}

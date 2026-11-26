// Freeze Dance core (M1.9; DESIGN "Game 1"), pure and clock-driven. The
// scene feeds motion events + tracking and drains directives each tick;
// nothing here touches Phaser, audio or the DOM. Event timestamps may lag or
// lead the tick clock (worker frames), so inputs queue and apply in time
// order. Benefit of the doubt: uncertain tracking during a stop counts as
// frozen and never blocks the other kid's snowstorm.

import {
  FREEZE_DANCE_CHEER_EVERY_S,
  FREEZE_GRACE_S,
  FREEZE_METER_FILL_S,
  FREEZE_MUSIC_GAP_S,
  FREEZE_POSE_CARD_BONUS_PTS,
  FREEZE_POSE_CARD_EVERY_COUNT,
  FREEZE_SCORE_BASE_PTS,
  FREEZE_SCORE_MIN_PTS,
  FREEZE_SCORE_REACTION_PENALTY_PTS_PER_S,
  FREEZE_SCORE_WOBBLE_PENALTY_PTS,
  FREEZE_STOP_S,
  FREEZE_WOBBLE_FORGIVE_S,
  FREEZE_WORD_ACTION_WINDOW_S,
  FREEZE_WORD_LOOK_AT_S,
  FREEZE_WORD_REVEAL_AT_S,
  FREEZE_WORD_STOP_EVERY_COUNT,
  FREEZE_WORD_STOP_EXTRA_S,
  type Range,
} from '../../motion/config';
import type { AgeMode, RoundResult, Slot, TrackingState } from '../types';

export type PoseCardId = 'star' | 'flamingo' | 'tree' | 'rocket';
export const POSE_CARDS: readonly PoseCardId[] = ['star', 'flamingo', 'tree', 'rocket'];

export type FreezeMusicId = 'freeze-mid' | 'freeze-slow' | 'freeze-fast';

export type FreezeDirective =
  | { type: 'music'; id: FreezeMusicId }
  | { type: 'music-stop' }
  | { type: 'sfx'; id: 'chime' | 'swirl' | 'fanfare' }
  | { type: 'say'; lineId: string; player?: Slot }
  | { type: 'statue'; slot: Slot }
  | { type: 'wobble'; slot: Slot }
  | { type: 'unfreeze' }
  | { type: 'star'; slot: Slot }
  | { type: 'snowstorm' }
  | { type: 'pose-card'; card: PoseCardId }
  | { type: 'word-card'; word: string; action?: 'go' | 'up' }
  | { type: 'finish'; result: RoundResult };

/** A learning word for the round (DESIGN "Learning layer", L1). */
export interface FreezeWord {
  word: string;
  /** The move the word cues in the next dance; only detectable actions. */
  action?: 'go' | 'up';
}

export interface FreezePlayerConfig {
  mode: AgeMode;
  active: boolean;
}

export interface FreezeCoreConfig {
  players: [FreezePlayerConfig, FreezePlayerConfig];
  freezes: number;
  slowMo: boolean;
  /** Whole-loop delay: the stop reaches the room this long after we cut the
   * music (M1.8 measured offset). Grace starts from arrival. */
  audioDelayS: number;
  introS: number;
  rng: () => number;
  /** Learning words (L1 Word Freeze); absent/empty = pure play. Cycled in
   * order, one per FREEZE_WORD_STOP_EVERY_COUNT stops. */
  words?: FreezeWord[];
}

type Phase = 'intro' | 'dance' | 'stop' | 'done';

interface QueuedInput {
  kind: 'moving' | 'still' | 'armsUp';
  tS: number;
}

interface KidStop {
  statue: boolean;
  everFroze: boolean;
  frozeWithinGrace: boolean;
  reactionS: number | null;
  wobbles: number;
  wobbleOpenSince: number | null;
  uncertain: boolean;
  poseMatched: boolean;
}

const freshStop = (): KidStop => ({
  statue: false,
  everFroze: false,
  frozeWithinGrace: false,
  reactionS: null,
  wobbles: 0,
  wobbleOpenSince: null,
  uncertain: false,
  poseMatched: false,
});

const pick = (range: Range, rng: () => number): number =>
  range.min + rng() * (range.max - range.min);

const SLOTS: readonly Slot[] = [0, 1];

export class FreezeCore {
  private readonly cfg: FreezeCoreConfig;
  private readonly queues: [QueuedInput[], QueuedInput[]] = [[], []];
  private readonly moving: [boolean, boolean] = [false, false];
  private readonly tracked: [boolean, boolean] = [true, true];
  private readonly meters: [number, number] = [0, 0];
  private readonly stars: [number, number] = [0, 0];
  private readonly scores: [number, number] = [0, 0];
  private readonly lastReaction: [number | null, number | null] = [null, null];
  private kidStops: [KidStop, KidStop] = [freshStop(), freshStop()];
  private phaseName: Phase = 'intro';
  private phaseEndS = Infinity;
  private stopIndex = -1;
  private signalS = 0;
  private nextCheerS = Infinity;
  // Word Freeze (L1): the current word stop and its follow-through.
  private wordIdx = 0;
  private wordStop: FreezeWord | null = null;
  private wordLookAtS = Infinity;
  private wordRevealAtS = Infinity;
  private wordLookDone = false;
  private wordRevealDone = false;
  private pendingAction: 'go' | 'up' | null = null;
  private pendingActionUntilS = Infinity;
  private stopHasCard = false;
  private anySnowstorm = false;
  private started = false;
  private lastTickS = 0;
  private out: FreezeDirective[] = [];

  constructor(cfg: FreezeCoreConfig) {
    this.cfg = cfg;
  }

  onMoving(slot: Slot, tS: number): void {
    this.queues[slot].push({ kind: 'moving', tS });
  }

  onStill(slot: Slot, tS: number): void {
    this.queues[slot].push({ kind: 'still', tS });
  }

  /** Arms-up events feed the UP word's follow-through (L1 Word Freeze). */
  onArmsUp(slot: Slot, tS: number): void {
    this.queues[slot].push({ kind: 'armsUp', tS });
  }

  setTracking(slot: Slot, state: TrackingState): void {
    this.tracked[slot] = state === 'tracked';
    if (state !== 'tracked' && this.phaseName === 'stop') {
      this.kidStops[slot].uncertain = true;
    }
  }

  /** Scene reports whether the kid matched the current pose card. */
  setPoseMatched(slot: Slot, matched: boolean): void {
    if (this.stopHasCard) this.kidStops[slot].poseMatched = matched;
  }

  meter(slot: Slot): number {
    return this.meters[slot];
  }

  phase(): Phase {
    return this.phaseName;
  }

  /** Last stop's freeze reaction for a slot (measured from signal arrival). */
  lastReactionS(slot: Slot): number | null {
    return this.lastReaction[slot];
  }

  tick(tS: number): FreezeDirective[] {
    this.out = [];
    if (!this.started) {
      this.started = true;
      this.lastTickS = tS;
      this.phaseEndS = tS + this.cfg.introS;
      this.say('freeze.intro');
      if (this.cfg.slowMo) this.say('freeze.slowmo');
    }
    const dtS = Math.max(0, tS - this.lastTickS);

    this.applyInputs(tS);

    // Meters fill while dancing.
    if (this.phaseName === 'dance') {
      for (const slot of this.activeSlots()) {
        if (this.moving[slot]) {
          this.meters[slot] = Math.min(1, this.meters[slot] + dtS / FREEZE_METER_FILL_S);
        }
      }
      // Long dances need company: cheer the dancing on every so often
      // (research: young players want frequent feedback; the narrator's
      // rotation keeps the wording fresh and the priority rules keep it
      // out of the way of "Freeze!").
      if (tS >= this.nextCheerS) {
        this.say('freeze.dance');
        this.nextCheerS = tS + this.cheerGap();
      }
    }
    if (this.phaseName === 'stop') this.checkWobbles(tS);

    // Word stop beats (L1): card first (kids are frozen, eyes on screen),
    // then the reveal after a beat to read it.
    if (this.phaseName === 'stop' && this.wordStop !== null) {
      if (!this.wordLookDone && tS >= this.wordLookAtS) {
        this.wordLookDone = true;
        this.out.push({
          type: 'word-card',
          word: this.wordStop.word,
          ...(this.wordStop.action !== undefined ? { action: this.wordStop.action } : {}),
        });
        this.say('learn.word-look');
      }
      if (!this.wordRevealDone && tS >= this.wordRevealAtS) {
        this.wordRevealDone = true;
        this.say('learn.word-say');
        this.say(`word.${this.wordStop.word}`);
      }
    }
    // An unanswered action word quietly expires -- no shame, ever.
    if (this.pendingAction !== null && tS > this.pendingActionUntilS) {
      this.pendingAction = null;
    }

    while (tS >= this.phaseEndS && this.phaseName !== 'done') {
      this.advancePhase(this.phaseEndS);
    }
    this.lastTickS = tS;
    return this.out;
  }

  // --- internals --------------------------------------------------------------

  private activeSlots(): Slot[] {
    return SLOTS.filter((s) => this.cfg.players[s].active);
  }

  private timingMode(): AgeMode {
    // Mixed ages: use the steadier Little timing so the youngest can keep up.
    return this.activeSlots().some((s) => this.cfg.players[s].mode === 'little') ? 'little' : 'big';
  }

  private say(lineId: string, player?: Slot): void {
    this.out.push({ type: 'say', lineId, ...(player !== undefined ? { player } : {}) });
  }

  /** Jittered mid-dance cheer spacing (0.8x..1.2x the base). */
  private cheerGap(): number {
    return FREEZE_DANCE_CHEER_EVERY_S * (0.8 + 0.4 * this.cfg.rng());
  }

  private applyInputs(tS: number): void {
    for (const slot of SLOTS) {
      const queue = this.queues[slot];
      queue.sort((a, b) => a.tS - b.tS);
      while (queue.length > 0 && (queue[0]?.tS ?? Infinity) <= tS) {
        const input = queue.shift();
        if (input === undefined) break;
        this.applyInput(slot, input);
      }
    }
  }

  private applyInput(slot: Slot, input: QueuedInput): void {
    // Action-word follow-through (L1): the word cued a move; ANY active kid
    // doing it earns the shared praise (co-op, like the snowstorm).
    if (
      this.pendingAction !== null &&
      this.phaseName === 'dance' &&
      this.cfg.players[slot].active &&
      input.tS <= this.pendingActionUntilS &&
      ((this.pendingAction === 'go' && input.kind === 'moving') ||
        (this.pendingAction === 'up' && input.kind === 'armsUp'))
    ) {
      this.pendingAction = null;
      this.say('learn.word-praise');
      this.out.push({ type: 'sfx', id: 'chime' });
    }
    if (input.kind === 'armsUp') return; // never part of still/moving state

    const wasMoving = this.moving[slot];
    this.moving[slot] = input.kind === 'moving';
    if (this.phaseName !== 'stop' || !this.cfg.players[slot].active) return;
    const stop = this.kidStops[slot];

    if (input.kind === 'still') {
      if (stop.statue) return;
      if (stop.wobbleOpenSince !== null) {
        // Blip ended in time: giggle, statue kept.
        stop.wobbleOpenSince = null;
        stop.wobbles += 1;
        stop.statue = true;
        this.out.push({ type: 'wobble', slot });
        return;
      }
      stop.statue = true;
      stop.everFroze = true;
      if (stop.reactionS === null) {
        stop.reactionS = Math.max(0, input.tS - this.signalS);
        this.lastReaction[slot] = stop.reactionS;
        stop.frozeWithinGrace =
          input.tS <= this.signalS + FREEZE_GRACE_S[this.cfg.players[slot].mode];
      }
      this.out.push({ type: 'statue', slot });
    } else if (!wasMoving && stop.statue) {
      // Statue wobbling: open a forgiveness window.
      stop.statue = false;
      stop.wobbleOpenSince = input.tS;
    }
  }

  private checkWobbles(tS: number): void {
    for (const slot of this.activeSlots()) {
      const stop = this.kidStops[slot];
      if (
        stop.wobbleOpenSince !== null &&
        tS - stop.wobbleOpenSince > FREEZE_WOBBLE_FORGIVE_S[this.cfg.players[slot].mode]
      ) {
        // Too long: statue lost (still no buzzer -- the giggle already played
        // via the wobble directive when/if they re-freeze).
        stop.wobbleOpenSince = null;
        stop.wobbles += 1;
        this.out.push({ type: 'wobble', slot });
      }
    }
  }

  private advancePhase(atS: number): void {
    if (this.phaseName === 'intro' || this.phaseName === 'stop') {
      if (this.phaseName === 'stop') this.evaluateStop();
      if (this.phaseName === 'stop' && this.stopIndex + 1 >= this.cfg.freezes) {
        this.finishRound();
        return;
      }
      // Start a dance segment.
      if (this.phaseName === 'stop') {
        this.out.push({ type: 'unfreeze' });
        if (this.wordStop?.action !== undefined) {
          // The word IS the next move: cue it instead of the plain line.
          this.pendingAction = this.wordStop.action;
          this.pendingActionUntilS = atS + FREEZE_WORD_ACTION_WINDOW_S;
          this.say('learn.word-move');
        } else {
          // Alternate the wording family so it never drones.
          this.say(this.stopIndex % 2 === 0 ? 'freeze.unfreeze' : 'freeze.dance');
        }
        this.wordStop = null;
      }
      this.phaseName = 'dance';
      for (const slot of SLOTS) this.meters[slot] = 0;
      // Tempo variety (DESIGN: three loops): slow-mo rounds slow, all-Big
      // rounds fast, Little/mixed rounds mid.
      const musicId = this.cfg.slowMo
        ? 'freeze-slow'
        : this.timingMode() === 'big'
          ? 'freeze-fast'
          : 'freeze-mid';
      this.out.push({ type: 'music', id: musicId });
      this.phaseEndS = atS + pick(FREEZE_MUSIC_GAP_S[this.timingMode()], this.cfg.rng);
      this.nextCheerS = atS + this.cheerGap();
      return;
    }
    if (this.phaseName === 'dance') {
      this.stopIndex += 1;
      this.phaseName = 'stop';
      this.signalS = atS + this.cfg.audioDelayS;
      this.kidStops = [freshStop(), freshStop()];
      // A kid already coasting/paused when the music cuts gets the benefit
      // of the doubt for this whole stop.
      for (const slot of this.activeSlots()) {
        if (!this.tracked[slot]) this.kidStops[slot].uncertain = true;
      }
      // A kid already standing still when the music cuts is instantly frozen.
      for (const slot of this.activeSlots()) {
        if (this.tracked[slot] && !this.moving[slot]) {
          const stop = this.kidStops[slot];
          stop.statue = true;
          stop.everFroze = true;
          stop.frozeWithinGrace = true;
          stop.reactionS = 0;
          this.lastReaction[slot] = 0;
          this.out.push({ type: 'statue', slot });
        }
      }
      this.out.push({ type: 'music-stop' }, { type: 'sfx', id: 'swirl' });
      // DESIGN Voice guide: Little mode gets a voiced "Freeze!"; Big mode
      // plays the harder game -- the music stop IS the cue.
      if (this.timingMode() === 'little') this.say('freeze.freeze');
      // Word Freeze (L1): with words loaded, every Nth stop is a word stop
      // (it takes the card slot; pose cards keep their other beats).
      const words = this.cfg.words;
      const wantWord =
        words !== undefined &&
        words.length > 0 &&
        this.stopIndex % FREEZE_WORD_STOP_EVERY_COUNT === FREEZE_WORD_STOP_EVERY_COUNT - 1;
      if (wantWord) {
        this.wordStop = words[this.wordIdx % words.length] ?? null;
        this.wordIdx += 1;
        this.wordLookAtS = atS + FREEZE_WORD_LOOK_AT_S;
        this.wordRevealAtS = atS + FREEZE_WORD_REVEAL_AT_S;
        this.wordLookDone = false;
        this.wordRevealDone = false;
      }
      const bigPresent = this.activeSlots().some((s) => this.cfg.players[s].mode === 'big');
      this.stopHasCard =
        !wantWord && bigPresent && this.stopIndex % FREEZE_POSE_CARD_EVERY_COUNT === 1;
      if (this.stopHasCard) {
        const card = POSE_CARDS[(this.stopIndex / FREEZE_POSE_CARD_EVERY_COUNT) | 0];
        this.out.push({ type: 'pose-card', card: card ?? 'star' });
        this.say('freeze.pose-card');
      }
      this.phaseEndS =
        atS + pick(FREEZE_STOP_S, this.cfg.rng) + (wantWord ? FREEZE_WORD_STOP_EXTRA_S : 0);
      return;
    }
  }

  private evaluateStop(): void {
    const active = this.activeSlots();
    let allWithinGrace = active.length > 0;
    let anyClean = false;
    for (const slot of active) {
      const stop = this.kidStops[slot];
      const credited = stop.uncertain && !stop.everFroze;
      const froze = stop.everFroze || credited;
      if (froze) {
        this.stars[slot] += 1;
        this.out.push({ type: 'star', slot }, { type: 'sfx', id: 'chime' });
        if (this.cfg.players[slot].mode === 'big') {
          const reaction = credited ? FREEZE_GRACE_S.big : (stop.reactionS ?? FREEZE_GRACE_S.big);
          let pts =
            FREEZE_SCORE_BASE_PTS -
            Math.round(reaction * FREEZE_SCORE_REACTION_PENALTY_PTS_PER_S) -
            stop.wobbles * FREEZE_SCORE_WOBBLE_PENALTY_PTS;
          pts = Math.max(FREEZE_SCORE_MIN_PTS, pts);
          if (stop.poseMatched) pts += FREEZE_POSE_CARD_BONUS_PTS;
          this.scores[slot] += pts;
        }
        if ((stop.frozeWithinGrace || credited) && stop.wobbles === 0) anyClean = true;
        if (!stop.frozeWithinGrace && !credited) allWithinGrace = false;
      } else {
        allWithinGrace = false;
        // Danced straight through: that's a giggle, never a buzzer.
        this.say('freeze.wobble', slot);
      }
    }
    if (allWithinGrace && active.length >= 2) {
      this.anySnowstorm = true;
      for (const slot of active) this.stars[slot] += 1;
      this.out.push({ type: 'snowstorm' }, { type: 'sfx', id: 'fanfare' });
      this.say('freeze.snowstorm');
    } else if (anyClean) {
      this.say('freeze.statue-great');
    }
  }

  private finishRound(): void {
    // Music is already stopped: a round always ends on a freeze.
    this.phaseName = 'done';
    this.phaseEndS = Infinity;
    const result: RoundResult = {
      gameId: 'freeze',
      perPlayer: this.activeSlots().map((slot) => ({
        slot,
        stars: this.stars[slot],
        ...(this.cfg.players[slot].mode === 'big' ? { score: this.scores[slot] } : {}),
      })),
      ...(this.anySnowstorm ? { coopBonus: true } : {}),
    };
    this.out.push({ type: 'finish', result });
  }
}

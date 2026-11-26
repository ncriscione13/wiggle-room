import { describe, expect, it } from 'vitest';
import { FreezeCore, type FreezeCoreConfig, type FreezeDirective } from './core';
import {
  FREEZE_WORD_ACTION_WINDOW_S,
  FREEZE_WORD_LOOK_AT_S,
  FREEZE_WORD_REVEAL_AT_S,
  FREEZE_WORD_STOP_EXTRA_S,
  FREEZE_DANCE_CHEER_EVERY_S,
  FREEZE_METER_FILL_S,
  FREEZE_MUSIC_GAP_S,
  FREEZE_POSE_CARD_BONUS_PTS,
  FREEZE_SCORE_BASE_PTS,
  FREEZE_STOP_S,
} from '../../motion/config';
import type { RoundResult, Slot } from '../../games/types';

// M1.9 Freeze Dance core: random stops, grace windows, Little/Big rules,
// wobbles, snowstorm, slow-mo, benefit of the doubt -- all pure and scripted.
// Timelines are DERIVED from config (rng=0 pins every range to its minimum),
// so tuning the design numbers never silently invalidates these tests.

const INTRO = 0.5;
const L_DANCE = FREEZE_MUSIC_GAP_S.little.min;
const B_DANCE = FREEZE_MUSIC_GAP_S.big.min;
const STOP_LEN = FREEZE_STOP_S.min;
// Little timeline: dance1 INTRO..STOP1, stop1 STOP1..+STOP_LEN, dance2, stop2.
const STOP1 = INTRO + L_DANCE;
const STOP2 = STOP1 + STOP_LEN + L_DANCE;
const ROUND2_END = STOP2 + STOP_LEN + 1;
// Big timeline (intro anchors at the first 30 Hz tick, so targets get slack).
const B_STOP1 = INTRO + B_DANCE;
const B_STOP2 = B_STOP1 + STOP_LEN + B_DANCE;

interface Driver {
  core: FreezeCore;
  all: FreezeDirective[];
  /** Advance to tS at 30 Hz, draining directives. */
  runTo(tS: number): void;
  byType<T extends FreezeDirective['type']>(type: T): Extract<FreezeDirective, { type: T }>[];
  finish(): RoundResult | undefined;
  tS: number;
}

function drive(cfg?: Partial<FreezeCoreConfig>): Driver {
  // rng 0.0 -> every random duration is its range minimum: deterministic.
  const core = new FreezeCore({
    players: [
      { mode: 'little', active: true },
      { mode: 'little', active: false },
    ],
    freezes: 2,
    slowMo: false,
    audioDelayS: 0,
    introS: 0.5,
    rng: () => 0,
    ...cfg,
  });
  const d: Driver = {
    core,
    all: [],
    tS: 0,
    runTo(target: number): void {
      while (d.tS < target - 1e-9) {
        d.tS = Math.round((d.tS + 1 / 30) * 1e6) / 1e6;
        d.all.push(...core.tick(d.tS));
      }
    },
    byType: (type) => d.all.filter((x): x is never => x.type === type),
    finish: () => d.byType('finish')[0]?.result,
  };
  return d;
}

function danceThenFreeze(d: Driver, slot: Slot, stopS: number, stillAtS: number): void {
  d.core.onMoving(slot, Math.max(0.6, stopS - 3));
  d.runTo(stopS);
  d.core.onStill(slot, stillAtS);
  d.runTo(stopS + STOP_LEN);
}

describe('FreezeCore (M1.9)', () => {
  it('a little kid who freezes on cue: statue + star per stop, then finish', () => {
    const d = drive();
    danceThenFreeze(d, 0, STOP1, STOP1 + 0.4);
    danceThenFreeze(d, 0, STOP2, STOP2 + 0.5);
    d.runTo(ROUND2_END);
    expect(d.byType('music-stop')).toHaveLength(2);
    expect(d.byType('statue').filter((s) => s.slot === 0)).toHaveLength(2);
    expect(d.byType('star').filter((s) => s.slot === 0)).toHaveLength(2);
    const result = d.finish();
    expect(result?.perPlayer[0]?.stars).toBe(2);
    expect(result?.perPlayer[0]?.score).toBeUndefined(); // no scores in Little
    expect(result?.perPlayer).toHaveLength(1); // inactive slot not reported
  });

  it('music comes back after each stop and the meter fills while dancing', () => {
    const d = drive();
    d.core.onMoving(0, 0.6);
    d.runTo(STOP1 - 0.1);
    // Danced nearly the whole window: enough to fill the meter (or get close).
    const dancedS = STOP1 - 0.1 - 0.6;
    expect(d.core.meter(0)).toBeGreaterThan(Math.min(1, dancedS / FREEZE_METER_FILL_S) - 0.1);
    danceThenFreeze(d, 0, STOP1, STOP1 + 0.2);
    d.runTo(STOP1 + STOP_LEN + 1);
    expect(d.byType('music')).toHaveLength(2); // intro start + after stop 1
  });

  it('cheers the dancing on mid-dance, and never during a stop', () => {
    const d = drive({ freezes: 1 });
    d.core.onMoving(0, 0.6);
    d.runTo(STOP1 + STOP_LEN + 0.5);
    // rng=0 -> first cheer lands 0.8 x base into the dance; the little dance
    // window is long enough to hold at least one cheer.
    const cheers = d.byType('say').filter((s) => s.lineId === 'freeze.dance');
    expect(cheers.length).toBeGreaterThanOrEqual(1);
    expect(L_DANCE).toBeGreaterThan(FREEZE_DANCE_CHEER_EVERY_S * 0.8); // sanity
    // None after the music stops: find the first music-stop position.
    const stopAt = d.all.findIndex((x) => x.type === 'music-stop');
    const lateCheer = d.all
      .slice(stopAt)
      .some((x) => x.type === 'say' && x.lineId === 'freeze.dance');
    expect(lateCheer).toBe(false);
  });

  it('grace window: a late kid gets the statue but not the within-grace credit', () => {
    const d = drive({
      players: [
        { mode: 'big', active: true },
        { mode: 'big', active: true },
      ],
    });
    // Big grace = 0.5 s. Kid 0 freezes at +0.3 (inside), kid 1 at +1.4 (late).
    d.core.onMoving(0, 0.6);
    d.core.onMoving(1, 0.6);
    d.runTo(B_STOP1 + 1);
    d.core.onStill(0, B_STOP1 + 0.3);
    d.core.onStill(1, B_STOP1 + 1.4);
    d.runTo(B_STOP1 + STOP_LEN);
    expect(
      d
        .byType('statue')
        .map((s) => s.slot)
        .sort(),
    ).toEqual([0, 1]);
    expect(d.byType('snowstorm')).toHaveLength(0); // kid 1 missed the grace
    d.runTo(B_STOP2 + STOP_LEN + 1);
    const result = d.finish();
    const p0 = result?.perPlayer.find((p) => p.slot === 0);
    const p1 = result?.perPlayer.find((p) => p.slot === 1);
    expect(p0?.score ?? 0).toBeGreaterThan(p1?.score ?? 0); // faster = more points
  });

  it('audio delay shifts the grace window', () => {
    const d = drive({
      players: [
        { mode: 'big', active: true },
        { mode: 'big', active: false },
      ],
      audioDelayS: 0.4,
      freezes: 1,
    });
    d.core.onMoving(0, 0.6);
    // Still at +0.7 after the music cut: outside raw grace (0.5) but inside
    // the delay-shifted one (0.4 + 0.5 = 0.9).
    d.core.onStill(0, B_STOP1 + 0.7);
    d.runTo(B_STOP1 + STOP_LEN + 0.4);
    d.runTo(B_STOP1 + STOP_LEN + 2);
    expect(d.byType('snowstorm').length + d.byType('star').length).toBeGreaterThan(0);
    const reaction = d.core.lastReactionS(0);
    expect(reaction).not.toBeNull();
    expect(reaction ?? 9).toBeLessThanOrEqual(0.5); // measured from signal arrival
  });

  it('wobble: short blip = giggle, statue kept; both stops still earn stars', () => {
    const d = drive({ freezes: 1 });
    d.core.onMoving(0, 0.6);
    d.runTo(STOP1);
    d.core.onStill(0, STOP1 + 0.3);
    d.runTo(STOP1 + 1);
    d.core.onMoving(0, STOP1 + 1.01);
    d.core.onStill(0, STOP1 + 1.3); // 0.29 s blip < little forgive 0.6
    d.runTo(STOP1 + STOP_LEN);
    d.runTo(STOP1 + STOP_LEN + 2);
    expect(d.byType('wobble').filter((w) => w.slot === 0)).toHaveLength(1);
    expect(d.finish()?.perPlayer[0]?.stars).toBe(1); // wobble never costs the star
  });

  it('benefit of the doubt: coasting through the stop still earns the freeze', () => {
    const d = drive({ freezes: 1 });
    d.core.onMoving(0, 0.6);
    d.runTo(STOP1 - 0.1);
    d.core.setTracking(0, 'coasting');
    d.runTo(STOP1 + STOP_LEN);
    d.core.setTracking(0, 'tracked');
    d.runTo(STOP1 + STOP_LEN + 2);
    expect(d.finish()?.perPlayer[0]?.stars).toBe(1);
  });

  it('snowstorm when every active kid freezes within grace; not for one kid alone', () => {
    const two = drive({
      players: [
        { mode: 'little', active: true },
        { mode: 'little', active: true },
      ],
      freezes: 1,
    });
    two.core.onMoving(0, 0.6);
    two.core.onMoving(1, 0.6);
    two.runTo(STOP1);
    two.core.onStill(0, STOP1 + 0.3);
    two.core.onStill(1, STOP1 + 0.6); // little grace = 1.0
    two.runTo(STOP1 + STOP_LEN);
    two.runTo(STOP1 + STOP_LEN + 2);
    expect(two.byType('snowstorm')).toHaveLength(1);
    expect(two.finish()?.coopBonus).toBe(true);

    const solo = drive({ freezes: 1 });
    danceThenFreeze(solo, 0, STOP1, STOP1 + 0.2);
    solo.runTo(STOP1 + STOP_LEN + 2);
    expect(solo.byType('snowstorm')).toHaveLength(0);
  });

  it('slow-mo round plays the slow song and says so', () => {
    const d = drive({ slowMo: true, freezes: 1 });
    d.runTo(1);
    expect(d.byType('music')[0]?.id).toBe('freeze-slow');
    expect(d.byType('say').some((s) => s.lineId === 'freeze.slowmo')).toBe(true);
  });

  it('big mode: pose card on the second stop, matching adds bonus points', () => {
    const d = drive({
      players: [
        { mode: 'big', active: true },
        { mode: 'big', active: false },
      ],
      freezes: 2,
    });
    // Big timing, intro anchored at the first tick, so events sit well inside
    // their windows and runTo targets carry slack.
    d.core.onMoving(0, 0.6);
    d.core.onStill(0, B_STOP1 + 0.25);
    d.core.onMoving(0, B_STOP1 + STOP_LEN + 0.3);
    d.core.onStill(0, B_STOP2 + 0.25);
    d.runTo(B_STOP2 + 0.7); // inside stop 2
    expect(d.byType('pose-card')).toHaveLength(1);
    d.core.setPoseMatched(0, true);
    d.runTo(B_STOP2 + STOP_LEN + 1);
    const score = d.finish()?.perPlayer[0]?.score ?? 0;
    // Two fast freezes (reaction ~0.28 s) + card bonus.
    expect(score).toBeGreaterThan(2 * (FREEZE_SCORE_BASE_PTS - 35) + FREEZE_POSE_CARD_BONUS_PTS);
  });

  it('a kid who never freezes gets no star for that stop but no punishment either', () => {
    const d = drive({ freezes: 1 });
    d.core.onMoving(0, 0.6);
    d.runTo(STOP1 + STOP_LEN); // dances straight through the stop
    d.runTo(STOP1 + STOP_LEN + 2);
    expect(d.finish()?.perPlayer[0]?.stars).toBe(0);
    // The buddy giggles about it rather than buzzing.
    expect(d.byType('say').some((s) => s.lineId === 'freeze.wobble')).toBe(true);
  });
});

describe('Word Freeze (L1 learning layer)', () => {
  const WORD_STOP = INTRO + 3 * L_DANCE + 2 * STOP_LEN; // 3rd stop (index 2)
  const words = [
    { word: 'go', action: 'go' as const },
    { word: 'the' },
    { word: 'up', action: 'up' as const },
  ];

  it('turns every Nth stop into a word stop: card, look line, then the reveal', () => {
    const d = drive({ freezes: 3, words });
    d.core.onMoving(0, 0.6);
    d.runTo(WORD_STOP + FREEZE_WORD_LOOK_AT_S + 0.2);
    const cards = d.byType('word-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ word: 'go', action: 'go' });
    expect(d.byType('say').some((s) => s.lineId === 'learn.word-look')).toBe(true);
    // The reveal comes after the reading beat, not with the card.
    expect(d.byType('say').some((s) => s.lineId === 'word.go')).toBe(false);
    d.runTo(WORD_STOP + FREEZE_WORD_REVEAL_AT_S + 0.2);
    const says = d.byType('say').map((s) => s.lineId);
    expect(says).toContain('learn.word-say');
    expect(says).toContain('word.go');
  });

  it('word stops run longer than plain stops', () => {
    const d = drive({ freezes: 3, words });
    d.core.onMoving(0, 0.6);
    // End of the extended word stop: music must come back EXTRA later.
    d.runTo(WORD_STOP + STOP_LEN + FREEZE_WORD_STOP_EXTRA_S - 0.2);
    expect(d.byType('finish')).toHaveLength(0);
    d.runTo(WORD_STOP + STOP_LEN + FREEZE_WORD_STOP_EXTRA_S + 0.5);
    expect(d.byType('finish')).toHaveLength(1); // freezes: 3 ends on this stop
  });

  it('an action word cues the move and ANY kid doing it earns the praise', () => {
    const d = drive({ freezes: 4, words });
    d.core.onMoving(0, 0.6);
    const danceStart = WORD_STOP + STOP_LEN + FREEZE_WORD_STOP_EXTRA_S;
    d.runTo(danceStart + 0.2);
    expect(d.byType('say').some((s) => s.lineId === 'learn.word-move')).toBe(true);
    d.core.onMoving(0, danceStart + 1); // the word said GO; the kid goes
    d.runTo(danceStart + 2);
    expect(d.byType('say').filter((s) => s.lineId === 'learn.word-praise')).toHaveLength(1);
  });

  it('UP words are satisfied by an arms-up event', () => {
    const upFirst = [{ word: 'up', action: 'up' as const }];
    const d = drive({ freezes: 4, words: upFirst });
    d.core.onMoving(0, 0.6);
    const danceStart = WORD_STOP + STOP_LEN + FREEZE_WORD_STOP_EXTRA_S;
    d.runTo(danceStart + 0.2);
    d.core.onArmsUp(0, danceStart + 1.5);
    d.runTo(danceStart + 2.5);
    expect(d.byType('say').some((s) => s.lineId === 'learn.word-praise')).toBe(true);
  });

  it('an unanswered action word expires silently (no shame)', () => {
    const d = drive({ freezes: 4, words });
    d.core.onMoving(0, 0.6);
    const danceStart = WORD_STOP + STOP_LEN + FREEZE_WORD_STOP_EXTRA_S;
    d.runTo(danceStart + FREEZE_WORD_ACTION_WINDOW_S + 1);
    d.core.onMoving(0, danceStart + FREEZE_WORD_ACTION_WINDOW_S + 0.5); // too late
    d.runTo(danceStart + FREEZE_WORD_ACTION_WINDOW_S + 2);
    expect(d.byType('say').some((s) => s.lineId === 'learn.word-praise')).toBe(false);
  });

  it('without words every stop stays a plain stop (pure play untouched)', () => {
    const d = drive({ freezes: 3 });
    d.core.onMoving(0, 0.6);
    d.runTo(INTRO + 3 * (L_DANCE + STOP_LEN) + 1);
    expect(d.byType('word-card')).toHaveLength(0);
    expect(d.byType('say').some((s) => s.lineId.startsWith('learn.'))).toBe(false);
  });

  it('a word stop takes the card slot: no pose card on the same stop', () => {
    // Big mode: pose cards land on stops 1 and 3 (index % 2 === 1); words on
    // index 2. With both on, stop index 1 keeps its pose card, index 2 is a
    // word, and they never collide.
    const d = drive({
      players: [
        { mode: 'big', active: true },
        { mode: 'big', active: false },
      ],
      freezes: 4,
      words,
    });
    d.core.onMoving(0, 0.6);
    const bWordStop = INTRO + 3 * B_DANCE + 2 * STOP_LEN;
    d.runTo(bWordStop + FREEZE_WORD_REVEAL_AT_S + 0.5);
    expect(d.byType('pose-card')).toHaveLength(1); // stop index 1 only
    expect(d.byType('word-card')).toHaveLength(1); // stop index 2
  });
});

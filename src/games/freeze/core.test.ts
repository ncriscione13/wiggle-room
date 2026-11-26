import { describe, expect, it } from 'vitest';
import { FreezeCore, type FreezeCoreConfig, type FreezeDirective } from './core';
import { FREEZE_SCORE_BASE_PTS, FREEZE_POSE_CARD_BONUS_PTS } from '../../motion/config';
import type { RoundResult, Slot } from '../../games/types';

// M1.9 Freeze Dance core: random stops, grace windows, Little/Big rules,
// wobbles, snowstorm, slow-mo, benefit of the doubt -- all pure and scripted.

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

// With rng=0 and little mode: intro 0.5 s, dance = 4 s (gap min), stop = 3 s.
// Timeline: dance1 0.5-4.5, stop1 4.5-7.5, dance2 7.5-11.5, stop2 11.5-14.5.
const STOP1 = 4.5;
const STOP2 = 11.5;

function danceThenFreeze(d: Driver, slot: Slot, stopS: number, stillAtS: number): void {
  d.core.onMoving(slot, Math.max(0.6, stopS - 3));
  d.runTo(stopS);
  d.core.onStill(slot, stillAtS);
  d.runTo(stopS + 3);
}

describe('FreezeCore (M1.9)', () => {
  it('a little kid who freezes on cue: statue + star per stop, then finish', () => {
    const d = drive();
    danceThenFreeze(d, 0, STOP1, STOP1 + 0.4);
    danceThenFreeze(d, 0, STOP2, STOP2 + 0.5);
    d.runTo(16);
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
    d.runTo(4.4);
    expect(d.core.meter(0)).toBeGreaterThan(0.8); // ~3.9 s of dancing
    danceThenFreeze(d, 0, STOP1, STOP1 + 0.2);
    d.runTo(8.5);
    expect(d.byType('music')).toHaveLength(2); // intro start + after stop 1
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
    d.runTo(4.5); // big gap min is 3 -> stop at 3.5... recompute below.
    // Big mode: dance = 3 s -> stop1 at 3.5.
    const stop1 = 3.5;
    d.core.onStill(0, stop1 + 0.3);
    d.core.onStill(1, stop1 + 1.4);
    d.runTo(stop1 + 3);
    expect(
      d
        .byType('statue')
        .map((s) => s.slot)
        .sort(),
    ).toEqual([0, 1]);
    expect(d.byType('snowstorm')).toHaveLength(0); // kid 1 missed the grace
    d.runTo(20);
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
    const stop1 = 3.5;
    // Still at +0.7 after the signal: outside raw grace (0.5) but inside
    // the delay-shifted one (0.4 + 0.5 = 0.9).
    d.core.onStill(0, stop1 + 0.7);
    d.runTo(stop1 + 3.4);
    d.runTo(10);
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
    d.runTo(STOP1 + 3);
    d.runTo(10);
    expect(d.byType('wobble').filter((w) => w.slot === 0)).toHaveLength(1);
    expect(d.finish()?.perPlayer[0]?.stars).toBe(1); // wobble never costs the star
  });

  it('benefit of the doubt: coasting through the stop still earns the freeze', () => {
    const d = drive({ freezes: 1 });
    d.core.onMoving(0, 0.6);
    d.runTo(STOP1 - 0.1);
    d.core.setTracking(0, 'coasting');
    d.runTo(STOP1 + 3);
    d.core.setTracking(0, 'tracked');
    d.runTo(10);
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
    two.runTo(STOP1 + 3);
    two.runTo(10);
    expect(two.byType('snowstorm')).toHaveLength(1);
    expect(two.finish()?.coopBonus).toBe(true);

    const solo = drive({ freezes: 1 });
    danceThenFreeze(solo, 0, STOP1, STOP1 + 0.2);
    solo.runTo(10);
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
    // Big timing, intro anchored at the first tick: stop1 ~3.53, dance2
    // ~6.53-9.53, stop2 ~9.53-12.53. Events carry their own clock, so only
    // the runTo targets need slack.
    d.core.onMoving(0, 0.6);
    d.core.onStill(0, 3.75);
    d.core.onMoving(0, 6.8);
    d.core.onStill(0, 9.75);
    d.runTo(10.2); // inside stop 2
    expect(d.byType('pose-card')).toHaveLength(1);
    d.core.setPoseMatched(0, true);
    d.runTo(14);
    const score = d.finish()?.perPlayer[0]?.score ?? 0;
    // Two fast freezes (reaction ~0.22 s) + card bonus.
    expect(score).toBeGreaterThan(2 * (FREEZE_SCORE_BASE_PTS - 30) + FREEZE_POSE_CARD_BONUS_PTS);
  });

  it('a kid who never freezes gets no star for that stop but no punishment either', () => {
    const d = drive({ freezes: 1 });
    d.core.onMoving(0, 0.6);
    d.runTo(STOP1 + 3); // dances straight through the stop
    d.runTo(10);
    expect(d.finish()?.perPlayer[0]?.stars).toBe(0);
    // The buddy giggles about it rather than buzzing.
    expect(d.byType('say').some((s) => s.lineId === 'freeze.wobble')).toBe(true);
  });
});

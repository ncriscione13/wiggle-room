import { describe, expect, it } from 'vitest';
import { NarratorCore, type VoiceLine } from '../../src/voice/narrator-core';

// M1.6: the speech rules as a pure queue (DESIGN "Voice guide"):
// priority safety > timing > instruction > praise; late praise dropped;
// never the same wording twice; help lines at most every 8 s; per-player
// pan; color-name prefix; safety preempts.

function lines(): Map<string, VoiceLine> {
  const mk = (id: string, priority: 1 | 2 | 3 | 4, cooldownS: number, n = 3): VoiceLine => ({
    priority,
    cooldownS,
    wordings: Array.from({ length: n }, (_, i) => ({
      file: `${id}.${String(i)}.ogg`,
      text: `${id} wording ${String(i)}`,
    })),
  });
  return new Map(
    (
      [
        ['help.line', 1, 8],
        ['timing.go', 2, 0],
        ['instr.line', 3, 0],
        ['praise.line', 4, 0],
        ['color.blue', 3, 0],
        ['color.pink', 3, 0],
      ] as const
    ).map(([id, p, cd]) => [id, mk(id, p, cd)]),
  );
}

function makeCore(startNow = 0): { core: NarratorCore; setNow: (t: number) => void } {
  let now = startNow;
  const core = new NarratorCore(lines(), {
    now: () => now,
    clipUrl: (file) => `/voice/clips/${file}`,
    colorLineIds: ['color.blue', 'color.pink'],
  });
  return { core, setNow: (t) => (now = t) };
}

describe('NarratorCore (M1.6)', () => {
  it('safety beats praise regardless of arrival order', () => {
    const { core } = makeCore();
    core.say('praise.line');
    core.say('help.line');
    expect(core.next()?.lineId).toBe('help.line');
  });

  it('FIFO within a priority', () => {
    const { core } = makeCore();
    core.say('instr.line');
    core.say('timing.go');
    core.say('timing.go');
    expect(core.next()?.lineId).toBe('timing.go');
    core.onPlaybackEnd();
    expect(core.next()?.lineId).toBe('timing.go');
    core.onPlaybackEnd();
    expect(core.next()?.lineId).toBe('instr.line');
  });

  it('never plays the same wording twice in a row', () => {
    const { core } = makeCore();
    const seen: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      core.say('instr.line');
      const d = core.next();
      if (d) seen.push(d.caption);
      core.onPlaybackEnd();
    }
    for (let i = 1; i < seen.length; i += 1) expect(seen[i]).not.toBe(seen[i - 1]);
  });

  it('praise more than 1 s late is dropped at play time', () => {
    const { core, setNow } = makeCore();
    core.say('praise.line', { eventTS: 0 });
    setNow(1.2);
    expect(core.next()).toBeNull();
    core.say('praise.line', { eventTS: 1.1 });
    expect(core.next()?.lineId).toBe('praise.line');
  });

  it('a help line repeats at most every 8 s', () => {
    const { core, setNow } = makeCore();
    core.say('help.line');
    expect(core.next()?.lineId).toBe('help.line');
    core.onPlaybackEnd();
    setNow(4);
    core.say('help.line');
    expect(core.next()).toBeNull(); // suppressed inside the window
    setNow(8.5);
    core.say('help.line');
    expect(core.next()?.lineId).toBe('help.line');
  });

  it('pans to the player side and prefixes their color name', () => {
    const { core } = makeCore();
    core.say('instr.line', { player: 0 });
    const left = core.next();
    expect(left?.pan).toBeLessThan(0);
    expect(left?.urls[0]).toContain('color.blue');
    expect(left?.urls[1]).toContain('instr.line');
    expect(left?.caption.length ?? 0).toBeGreaterThan(5);
    core.onPlaybackEnd();
    core.say('instr.line', { player: 1 });
    const right = core.next();
    expect(right?.pan).toBeGreaterThan(0);
    expect(right?.urls[0]).toContain('color.pink');
  });

  it('while speaking, next() is quiet -- unless a SAFETY line arrives (preempt)', () => {
    const { core } = makeCore();
    core.say('instr.line');
    expect(core.next()?.interrupt).toBe(false); // now playing
    core.say('praise.line');
    expect(core.next()).toBeNull(); // praise waits
    core.say('help.line');
    const preempt = core.next();
    expect(preempt?.lineId).toBe('help.line');
    expect(preempt?.interrupt).toBe(true);
  });

  it('unknown line ids are ignored, not fatal', () => {
    const { core } = makeCore();
    core.say('nope.missing');
    expect(core.next()).toBeNull();
  });

  it('a timing line preempts an instruction clip (but never praise over timing)', () => {
    const { core } = makeCore();
    core.say('instr.line');
    expect(core.next()?.lineId).toBe('instr.line');
    core.say('timing.go');
    const preempt = core.next();
    expect(preempt?.lineId).toBe('timing.go');
    expect(preempt?.interrupt).toBe(true);
    // While timing plays, another timing line waits (no self-level preempt).
    core.say('timing.go');
    expect(core.next()).toBeNull();
  });

  it('praise with no explicit event time still drops once it is stale', () => {
    const { core, setNow } = makeCore();
    core.say('praise.line'); // no eventTS: the moment is "now" (t=0)
    setNow(1.5); // stuck behind other audio for 1.5 s
    expect(core.next()).toBeNull();
  });

  it('help cooldowns are per player: one kid never mutes the other', () => {
    const { core } = makeCore();
    core.say('help.line', { player: 0 });
    expect(core.next()?.pan).toBeLessThan(0);
    core.onPlaybackEnd();
    core.say('help.line', { player: 1 }); // same id, other kid, inside 8 s
    expect(core.next()?.pan).toBeGreaterThan(0);
  });
});

describe('clearPending (playtest round 2: voice must match the screen)', () => {
  it('drops queued instructions and praise, keeping queued safety lines', () => {
    const { core } = makeCore();
    core.say('instr.line');
    expect(core.next()?.lineId).toBe('instr.line'); // now playing
    core.say('instr.line'); // stale prompt piling up behind it
    core.say('praise.line');
    core.say('help.line');
    core.clearPending(3);
    core.onPlaybackEnd();
    expect(core.next()?.lineId).toBe('help.line'); // safety survived
    core.onPlaybackEnd();
    expect(core.next()).toBeNull(); // instruction + praise are gone
  });

  it('clearPending(1) empties the whole queue (phase boundary)', () => {
    const { core } = makeCore();
    core.say('help.line');
    core.say('instr.line');
    core.clearPending(1);
    expect(core.next()).toBeNull();
  });

  it('never cuts off the clip that is already playing', () => {
    const { core } = makeCore();
    core.say('instr.line');
    expect(core.next()?.lineId).toBe('instr.line');
    core.clearPending(1); // mid-playback
    expect(core.next()).toBeNull(); // nothing to start, nothing interrupted
    core.onPlaybackEnd();
    core.say('instr.line');
    expect(core.next()?.lineId).toBe('instr.line'); // core still works after
  });

  it('a fresh prompt said right after a clear is next in line', () => {
    const { core } = makeCore();
    core.say('instr.line');
    expect(core.next()?.lineId).toBe('instr.line');
    core.say('instr.line'); // stale: screen has moved on
    core.clearPending(3);
    core.say('instr.line'); // the CURRENT move's prompt
    core.onPlaybackEnd();
    expect(core.next()?.lineId).toBe('instr.line');
    core.onPlaybackEnd();
    expect(core.next()).toBeNull(); // exactly one prompt played, not two
  });
});

import { describe, expect, it } from 'vitest';
import { CLIP_PROMPTS, recordFlowNext, type RecordState } from './clip-recording';

// M0.8: guided recording of the real-kid clips. Prompt names deliberately
// differ from the synthetic clip names so a recording can never silently
// shadow a synthetic clip in loadClip()'s real-first lookup.

describe('CLIP_PROMPTS (M0.8)', () => {
  it('covers exactly the 8 recordings PLAN M0.8 lists', () => {
    expect(CLIP_PROMPTS.map((p) => p.name)).toEqual([
      'standing-still-30s',
      'bunny-hops-x5',
      'running-in-place-10s',
      'kid-squats-x3',
      'reach-up-and-arms-out',
      'both-kids-2min',
      'kid-walks-out-and-back',
      'dim-room-30s',
    ]);
  });

  it('pins the durations PLAN names', () => {
    const byName = Object.fromEntries(CLIP_PROMPTS.map((p) => [p.name, p.durationS]));
    expect(byName['standing-still-30s']).toBe(30);
    expect(byName['running-in-place-10s']).toBe(10);
    expect(byName['both-kids-2min']).toBe(120);
    expect(byName['dim-room-30s']).toBe(30);
  });

  it('never reuses a synthetic clip name (no silent shadowing)', () => {
    const synthetic = [
      'still-30s',
      'jumps-x5',
      'run-2sps-10s',
      'run-3sps-10s',
      'squats-x3',
      'reach-and-arms-out',
      'two-kids-10min',
      'walk-out-and-back',
      'low-visibility-30s',
    ];
    for (const prompt of CLIP_PROMPTS) {
      expect(synthetic, prompt.name).not.toContain(prompt.name);
    }
  });

  it('every prompt has kid-facing words and a sane duration', () => {
    for (const p of CLIP_PROMPTS) {
      expect(p.title.length).toBeGreaterThan(4);
      expect(p.instruction.length).toBeGreaterThan(10);
      expect(p.durationS).toBeGreaterThanOrEqual(10);
      expect(p.durationS).toBeLessThanOrEqual(120);
    }
  });
});

describe('recordFlowNext (M0.8 state machine)', () => {
  const count = CLIP_PROMPTS.length;
  const at = (phase: RecordState['phase'], promptIndex = 0): RecordState => ({
    phase,
    promptIndex,
  });

  it('walks idle -> countdown -> recording -> review', () => {
    let s = at('idle');
    s = recordFlowNext(s, 'primary', count);
    expect(s).toEqual(at('countdown'));
    s = recordFlowNext(s, 'countdownDone', count);
    expect(s).toEqual(at('recording'));
    s = recordFlowNext(s, 'recordingDone', count);
    expect(s).toEqual(at('review'));
  });

  it('next moves to the following prompt, back at idle', () => {
    expect(recordFlowNext(at('review', 2), 'next', count)).toEqual(at('idle', 3));
  });

  it('redo repeats the same prompt from the countdown', () => {
    expect(recordFlowNext(at('review', 5), 'redo', count)).toEqual(at('countdown', 5));
  });

  it('finishing the last prompt reaches done, which is terminal', () => {
    const done = recordFlowNext(at('review', count - 1), 'next', count);
    expect(done).toEqual(at('done', count - 1));
    expect(recordFlowNext(done, 'primary', count)).toEqual(done);
  });

  it('ignores events that make no sense in the current phase', () => {
    expect(recordFlowNext(at('idle'), 'recordingDone', count)).toEqual(at('idle'));
    expect(recordFlowNext(at('recording'), 'primary', count)).toEqual(at('recording'));
  });
});

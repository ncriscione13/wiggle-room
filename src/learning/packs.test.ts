import { describe, expect, it } from 'vitest';
import {
  DETECTABLE_WORD_ACTIONS,
  sharedBand,
  validateSightWordPacks,
  wordsForRound,
  type SightWordPacks,
} from './packs';

// L1.2: learning packs are offline data -- validated field by field so a
// corrupt pack degrades to pure play, never a crash.

const good = (): unknown => ({
  prek: [{ word: 'go', action: 'go' }, { word: 'the' }],
  k: [{ word: 'jump', action: 'jump' }, { word: 'you' }],
  g1: [{ word: 'like' }],
  g2: [{ word: 'because' }],
});

describe('validateSightWordPacks', () => {
  it('accepts a well-formed pack and keeps action tags', () => {
    const packs = validateSightWordPacks(good());
    expect(packs).not.toBeNull();
    expect(packs?.prek[0]).toEqual({ word: 'go', action: 'go' });
    expect(packs?.prek[1]).toEqual({ word: 'the' });
  });

  it('drops malformed words but rejects a pack with an empty/missing band', () => {
    const withJunk = good() as Record<string, unknown>;
    withJunk['k'] = [{ word: 'you' }, { word: 42 }, { word: 'up', action: 'teleport' }, null];
    const packs = validateSightWordPacks(withJunk);
    expect(packs?.k).toEqual([{ word: 'you' }]);
    expect(validateSightWordPacks({ ...(good() as object), g2: [] })).toBeNull();
    expect(validateSightWordPacks({ prek: [{ word: 'a' }] })).toBeNull();
    expect(validateSightWordPacks('nope')).toBeNull();
    expect(validateSightWordPacks(null)).toBeNull();
  });
});

describe('sharedBand', () => {
  it('picks the LOWEST band among active grades (the youngest reader reads)', () => {
    expect(sharedBand(['g1', 'prek'])).toBe('prek');
    expect(sharedBand(['g2', 'k'])).toBe('k');
    expect(sharedBand(['off', 'g1'])).toBe('g1');
  });

  it('returns null when every grade is off or absent', () => {
    expect(sharedBand(['off', undefined])).toBeNull();
    expect(sharedBand([])).toBeNull();
  });
});

describe('wordsForRound', () => {
  const packs = validateSightWordPacks(good()) as SightWordPacks;

  it('keeps only DETECTABLE action tags (jump waits for M2 detectors)', () => {
    const words = wordsForRound(packs, ['k'], DETECTABLE_WORD_ACTIONS);
    expect(words).toEqual([{ word: 'jump' }, { word: 'you' }]); // tag stripped
    const prek = wordsForRound(packs, ['prek'], DETECTABLE_WORD_ACTIONS);
    expect(prek?.[0]).toEqual({ word: 'go', action: 'go' }); // tag kept
  });

  it('returns null for an all-off group', () => {
    expect(wordsForRound(packs, ['off'], DETECTABLE_WORD_ACTIONS)).toBeNull();
  });
});

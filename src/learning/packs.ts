// Learning content packs (DESIGN "Learning layer"). Offline JSON in
// public/learning/, loaded through the single asset loader and validated
// field by field -- a corrupt pack degrades to "no learning content", never
// to a crash mid-game. Sight words follow the Dolch bands.

import { loadJson } from '../assets/loader';
import type { GradeBand } from '../games/types';

/** Moves a word can cue. Only 'go' and 'up' are detectable today; the rest
 * activate with the M2 detectors (the packs may tag them already). */
export type WordAction = 'go' | 'up' | 'jump' | 'run' | 'down';
const WORD_ACTIONS: readonly WordAction[] = ['go', 'up', 'jump', 'run', 'down'];

export interface SightWord {
  word: string;
  action?: WordAction;
}

export type ContentBand = Exclude<GradeBand, 'off'>;
const BAND_ORDER: readonly ContentBand[] = ['prek', 'k', 'g1', 'g2'];

export type SightWordPacks = Record<ContentBand, SightWord[]>;

function parseWord(raw: unknown): SightWord | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const word = rec['word'];
  if (typeof word !== 'string' || word.trim() === '') return null;
  const action = rec['action'];
  if (action !== undefined && !WORD_ACTIONS.includes(action as WordAction)) return null;
  return {
    word: word.trim(),
    ...(action !== undefined ? { action: action as WordAction } : {}),
  };
}

/** Null when the shape is unusable; individual bad words are dropped. */
export function validateSightWordPacks(raw: unknown): SightWordPacks | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const out = {} as SightWordPacks;
  for (const band of BAND_ORDER) {
    const list = rec[band];
    if (!Array.isArray(list)) return null;
    out[band] = list.map(parseWord).filter((w): w is SightWord => w !== null);
    if (out[band].length === 0) return null; // an empty band is a broken pack
  }
  return out;
}

export async function loadSightWordPacks(): Promise<SightWordPacks | null> {
  try {
    return validateSightWordPacks(await loadJson<unknown>('learning/sight-words.json'));
  } catch {
    return null; // offline-first: a missing pack just means pure play
  }
}

/** The band a mixed group plays: the LOWEST grade among the kids whose grade
 * is on (the youngest reader must be able to read the shared card). Null
 * when every grade is off/absent. */
export function sharedBand(grades: readonly (GradeBand | undefined)[]): ContentBand | null {
  let lowest: ContentBand | null = null;
  for (const grade of grades) {
    if (grade === undefined || grade === 'off') continue;
    if (lowest === null || BAND_ORDER.indexOf(grade) < BAND_ORDER.indexOf(lowest)) {
      lowest = grade;
    }
  }
  return lowest;
}

/** Words for a round: the shared band's list, with action tags kept only for
 * moves in `detectable` (others become plain read-the-word cards). */
export function wordsForRound(
  packs: SightWordPacks,
  grades: readonly (GradeBand | undefined)[],
  detectable: readonly WordAction[],
): { word: string; action?: 'go' | 'up' }[] | null {
  const band = sharedBand(grades);
  if (band === null) return null;
  return packs[band].map((w) =>
    w.action !== undefined &&
    detectable.includes(w.action) &&
    (w.action === 'go' || w.action === 'up')
      ? { word: w.word, action: w.action }
      : { word: w.word },
  );
}

/** What today's motion sources can detect (M2 adds jump/run/down). */
export const DETECTABLE_WORD_ACTIONS: readonly WordAction[] = ['go', 'up'];

/** Parse the ?grade= test knob (anything else = no override). */
export function gradeFromKnob(raw: string | null): GradeBand | undefined {
  return raw === 'off' || raw === 'prek' || raw === 'k' || raw === 'g1' || raw === 'g2'
    ? raw
    : undefined;
}

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLinesCsv } from '../../src/voice/lines-csv';
import { STARTUP_VOICE_LINES } from '../../src/motion/startup-check';

// M1.6: voice/lines.en.csv is the single source of narration. This pins its
// integrity and that every id the code emits actually has lines.

const csv = readFileSync(new URL('../../voice/lines.en.csv', import.meta.url), 'utf8');

describe('voice/lines.en.csv (M1.6)', () => {
  const lines = parseLinesCsv(csv);

  it('parses with unique ids and 3-5 wordings each', () => {
    expect(lines.size).toBeGreaterThanOrEqual(30);
    for (const [id, def] of lines) {
      expect(def.wordings.length, id).toBeGreaterThanOrEqual(3);
      expect(def.wordings.length, id).toBeLessThanOrEqual(5);
      for (const w of def.wordings) expect(w.trim().length, id).toBeGreaterThan(2);
    }
  });

  it('priorities are 1..4 (safety > timing > instruction > praise)', () => {
    for (const [id, def] of lines) {
      expect(def.priority, id).toBeGreaterThanOrEqual(1);
      expect(def.priority, id).toBeLessThanOrEqual(4);
    }
    expect(lines.get('freeze.freeze')?.priority).toBe(2); // timing
    expect(lines.get('freeze.wobble')?.priority).toBe(4); // praise-ish reaction
  });

  it('help lines (priority 1) carry the 8 s cooldown', () => {
    for (const [id, def] of lines) {
      if (def.priority === 1) expect(def.cooldownS, id).toBe(8);
    }
  });

  it('covers every startup problem the checker can emit', () => {
    for (const lineId of Object.values(STARTUP_VOICE_LINES)) {
      expect(lines.has(lineId), lineId).toBe(true);
    }
  });

  it('covers the warm-up moves, Freeze Dance moments and wrap-up', () => {
    for (const id of [
      'warmup.stand',
      'warmup.statue',
      'warmup.reach',
      'warmup.arms',
      'warmup.squat',
      'warmup.hop',
      'warmup.run',
      'warmup.slow-demo',
      'freeze.intro',
      'freeze.freeze',
      'freeze.wobble',
      'freeze.snowstorm',
      'wrap.two-minutes',
      'wrap.cooldown',
      'wrap.goodbye',
      'color.blue',
      'color.pink',
    ]) {
      expect(lines.has(id), id).toBe(true);
    }
  });
});

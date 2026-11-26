import { describe, expect, it } from 'vitest';
import { renderMusic, renderSfx, toWav, SAMPLE_RATE_HZ } from '../../tools/audio-gen/synth';

// M1.9: generated CC0 music. Comfort rules: no harsh peaks, loops land on
// exact beat grids (seamless), deterministic output.

describe('audio synth (M1.9)', () => {
  it('renders three non-silent loops with headroom', () => {
    for (const id of ['freeze-mid', 'freeze-slow', 'freeze-fast'] as const) {
      const { samples } = renderMusic(id);
      let peak = 0;
      let energy = 0;
      for (const s of samples) {
        peak = Math.max(peak, Math.abs(s));
        energy += s * s;
      }
      expect(peak, id).toBeLessThanOrEqual(0.85); // headroom, never harsh
      expect(peak, id).toBeGreaterThan(0.3); // actually audible
      expect(energy / samples.length, id).toBeGreaterThan(0.0005); // not near-silence
    }
  });

  it('loops are exact beat multiples (seamless)', () => {
    const mid = renderMusic('freeze-mid');
    expect(mid.samples.length).toBe(Math.round(16 * (60 / 108) * SAMPLE_RATE_HZ));
    const slow = renderMusic('freeze-slow');
    expect(slow.samples.length).toBe(Math.round(16 * (60 / 72) * SAMPLE_RATE_HZ));
  });

  it('is deterministic', () => {
    const a = renderMusic('freeze-mid').samples;
    const b = renderMusic('freeze-mid').samples;
    expect(a[1234]).toBe(b[1234]);
    expect(a[50000]).toBe(b[50000]);
  });

  it('renders the four sfx', () => {
    for (const id of ['drum', 'chime', 'swirl', 'fanfare'] as const) {
      const { samples } = renderSfx(id);
      let peak = 0;
      for (const s of samples) peak = Math.max(peak, Math.abs(s));
      expect(peak, id).toBeGreaterThan(0.2);
      expect(peak, id).toBeLessThanOrEqual(0.85);
    }
  });

  it('writes valid wav bytes', () => {
    const wav = toWav(renderSfx('drum'));
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE');
    expect(wav.length).toBeGreaterThan(1000);
  });
});

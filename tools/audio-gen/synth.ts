// Audio synthesis (M1.9): original loops and sfx rendered as PCM, so the
// repo owns every byte (dedicated CC0 in ASSETS.md). Soft timbres only --
// sine/triangle voices, no raw square/saw, peaks well under full scale
// (comfort: no harsh sound). Deterministic: same input, same samples.

export const SAMPLE_RATE_HZ = 24000;

export interface RenderedAudio {
  samples: Float32Array;
  sampleRateHz: number;
}

/** Seeded PRNG (mulberry32) so noise-based sounds are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TWO_PI = Math.PI * 2;

/** Soft triangle via shaped sine -- no hard edges. */
const tri = (phase: number): number => (2 / Math.PI) * Math.asin(Math.sin(phase));

export interface Voice {
  /** 'sine' fundament, 'tri' adds gentle brightness, 'thump' pitch-drops. */
  kind: 'sine' | 'tri' | 'thump';
  freqHz: number;
  durS: number;
  gain: number;
  attackS?: number;
}

/** Adds one note into `out` starting at `atS` (additive, clamped later). */
export function addNote(out: Float32Array, atS: number, voice: Voice): void {
  const start = Math.floor(atS * SAMPLE_RATE_HZ);
  const length = Math.floor(voice.durS * SAMPLE_RATE_HZ);
  const attack = Math.max(1, Math.floor((voice.attackS ?? 0.008) * SAMPLE_RATE_HZ));
  for (let i = 0; i < length; i += 1) {
    const idx = start + i;
    if (idx < 0 || idx >= out.length) continue;
    const tS = i / SAMPLE_RATE_HZ;
    const env =
      i < attack ? i / attack : Math.pow(1 - (i - attack) / Math.max(1, length - attack), 1.8);
    let freq = voice.freqHz;
    if (voice.kind === 'thump') freq = voice.freqHz * (1 + 1.6 * Math.exp(-tS * 28));
    const phase = TWO_PI * freq * tS;
    const wave = voice.kind === 'tri' ? tri(phase) : Math.sin(phase);
    const sample = wave * env * voice.gain;
    const existing = out[idx] ?? 0;
    out[idx] = existing + sample;
  }
}

/** Soft noise puff (hats / snow) -- averaged noise = gentle, not hissy. */
export function addPuff(
  out: Float32Array,
  atS: number,
  durS: number,
  gain: number,
  rng: () => number,
): void {
  const start = Math.floor(atS * SAMPLE_RATE_HZ);
  const length = Math.floor(durS * SAMPLE_RATE_HZ);
  let smooth = 0;
  for (let i = 0; i < length; i += 1) {
    const idx = start + i;
    if (idx < 0 || idx >= out.length) continue;
    const env = Math.pow(1 - i / length, 2.5);
    smooth = smooth * 0.5 + (rng() * 2 - 1) * 0.5; // one-pole lowpass
    const existing = out[idx] ?? 0;
    out[idx] = existing + smooth * env * gain;
  }
}

/** Soft-clip + headroom so additive stacking never crunches. */
export function finalize(samples: Float32Array, peak = 0.72): Float32Array {
  let max = 0;
  for (const s of samples) max = Math.max(max, Math.abs(s));
  const scale = max > 0 ? peak / max : 1;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = Math.tanh((samples[i] ?? 0) * scale * 1.1);
  return out;
}

// --- Note helpers -------------------------------------------------------------

/** C major pentatonic, kid-safe: index -> Hz (0 = C3). */
export function penta(index: number): number {
  const steps = [0, 2, 4, 7, 9]; // C D E G A
  const octave = Math.floor(index / 5);
  const step = steps[((index % 5) + 5) % 5] ?? 0;
  return 130.81 * Math.pow(2, octave + step / 12);
}

export interface LoopSpec {
  bpm: number;
  beats: number;
  /** melody[beat] = pentatonic index or null (rest); eighth pairs allowed. */
  melody: (number | null)[];
  bass: (number | null)[];
  /** Hat pattern per half-beat (0..1 gain). */
  hats: number[];
  kickEvery: number;
  seed: number;
}

export function renderLoop(spec: LoopSpec): RenderedAudio {
  const beatS = 60 / spec.bpm;
  const durS = spec.beats * beatS;
  const out = new Float32Array(Math.round(durS * SAMPLE_RATE_HZ));
  const rng = mulberry32(spec.seed);

  for (let beat = 0; beat < spec.beats; beat += 1) {
    const atS = beat * beatS;
    if (beat % spec.kickEvery === 0) {
      addNote(out, atS, { kind: 'thump', freqHz: 55, durS: 0.22, gain: 0.5 });
    }
    const bass = spec.bass[beat % spec.bass.length];
    if (bass !== null && bass !== undefined) {
      addNote(out, atS, { kind: 'sine', freqHz: penta(bass) / 2, durS: beatS * 0.9, gain: 0.3 });
    }
    const note = spec.melody[beat % spec.melody.length];
    if (note !== null && note !== undefined) {
      addNote(out, atS, { kind: 'tri', freqHz: penta(note), durS: beatS * 0.8, gain: 0.22 });
      // Gentle octave shimmer.
      addNote(out, atS, { kind: 'sine', freqHz: penta(note) * 2, durS: beatS * 0.5, gain: 0.06 });
    }
    for (const [half, gain] of spec.hats.entries()) {
      if (gain > 0) addPuff(out, atS + (half * beatS) / spec.hats.length, 0.05, gain * 0.12, rng);
    }
  }
  return { samples: finalize(out), sampleRateHz: SAMPLE_RATE_HZ };
}

// --- The actual assets --------------------------------------------------------

export function renderMusic(id: 'freeze-mid' | 'freeze-slow' | 'freeze-fast'): RenderedAudio {
  if (id === 'freeze-slow') {
    return renderLoop({
      bpm: 72,
      beats: 16,
      melody: [5, null, 7, null, 9, null, 7, null, 5, null, 4, null, 2, null, null, null],
      bass: [0, null, null, null, 3, null, null, null, 4, null, null, null, 3, null, null, null],
      hats: [0, 0.5],
      kickEvery: 4,
      seed: 72,
    });
  }
  if (id === 'freeze-fast') {
    return renderLoop({
      bpm: 132,
      beats: 16,
      melody: [10, 9, 7, 9, 10, null, 12, null, 10, 9, 7, 5, 7, null, 9, null],
      bass: [0, 0, 4, 4, 5, 5, 3, 3],
      hats: [0.8, 0.4, 0.9, 0.4],
      kickEvery: 2,
      seed: 132,
    });
  }
  return renderLoop({
    bpm: 108,
    beats: 16,
    melody: [5, 7, 9, 7, 10, null, 9, 7, 5, 7, 9, 10, 9, 7, 5, null],
    bass: [0, null, 4, null, 5, null, 3, null],
    hats: [0.7, 0, 0.8, 0.3],
    kickEvery: 2,
    seed: 108,
  });
}

export function renderSfx(id: 'drum' | 'chime' | 'swirl' | 'fanfare'): RenderedAudio {
  const rng = mulberry32(7);
  if (id === 'drum') {
    const out = new Float32Array(Math.round(0.35 * SAMPLE_RATE_HZ));
    addNote(out, 0, { kind: 'thump', freqHz: 150, durS: 0.3, gain: 0.9 });
    return { samples: finalize(out, 0.8), sampleRateHz: SAMPLE_RATE_HZ };
  }
  if (id === 'chime') {
    const out = new Float32Array(Math.round(0.9 * SAMPLE_RATE_HZ));
    addNote(out, 0, { kind: 'sine', freqHz: penta(10), durS: 0.5, gain: 0.5 });
    addNote(out, 0.12, { kind: 'sine', freqHz: penta(12), durS: 0.7, gain: 0.45 });
    addNote(out, 0.12, { kind: 'sine', freqHz: penta(12) * 2, durS: 0.4, gain: 0.12 });
    return { samples: finalize(out, 0.6), sampleRateHz: SAMPLE_RATE_HZ };
  }
  if (id === 'swirl') {
    const out = new Float32Array(Math.round(1.2 * SAMPLE_RATE_HZ));
    for (let i = 0; i < 24; i += 1) {
      addPuff(out, i * 0.05, 0.3, 0.25 * (1 - i / 30), rng);
    }
    return { samples: finalize(out, 0.4), sampleRateHz: SAMPLE_RATE_HZ };
  }
  const out = new Float32Array(Math.round(1.1 * SAMPLE_RATE_HZ));
  for (const [i, n] of [5, 7, 10].entries()) {
    addNote(out, i * 0.16, { kind: 'tri', freqHz: penta(n), durS: 0.5, gain: 0.4 });
    addNote(out, i * 0.16, { kind: 'sine', freqHz: penta(n) * 2, durS: 0.3, gain: 0.1 });
  }
  return { samples: finalize(out, 0.7), sampleRateHz: SAMPLE_RATE_HZ };
}

/** 16-bit mono WAV bytes. */
export function toWav(audio: RenderedAudio): Uint8Array {
  const n = audio.samples.length;
  const bytes = new Uint8Array(44 + n * 2);
  const view = new DataView(bytes.buffer);
  const writeStr = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i += 1) view.setUint8(at + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, audio.sampleRateHz, true);
  view.setUint32(28, audio.sampleRateHz * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i += 1) {
    const s = Math.max(-1, Math.min(1, audio.samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return bytes;
}

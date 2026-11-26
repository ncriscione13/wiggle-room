// AudioBus (M1.9): music loops + sfx with soft fades, narrator ducking and
// the measured output delay games shift timing windows by. Browser-only thin
// shell; everything decision-like lives in the games and configs.

import { loadArrayBuffer, loadJson } from '../assets/loader';
import type { AudioBus } from '../games/types';
import { MUSIC_DUCK_RAMP_S, MUSIC_DUCK_RATIO, MUSIC_FADE_S } from '../motion/config';
import { getTimingOffsetS } from '../shell/timing-store';

interface AudioManifest {
  music: Record<string, { file: string; loop: boolean; bpm: number }>;
  sfx: Record<string, { file: string }>;
}

export interface AudioBusHandle extends AudioBus {
  /** Wire to narrator.onSpeaking for ducking. */
  setDucked(ducked: boolean): void;
  setMusicVolume(volume01: number): void;
  setSfxVolume(volume01: number): void;
  /** Call from a user gesture; resumes a suspended context. */
  resume(): Promise<void>;
  /** The audio-clock now, for scheduling against motion timestamps. */
  nowS(): number;
}

export async function createAudioBus(): Promise<AudioBusHandle> {
  const manifest = await loadJson<AudioManifest>('audio/manifest.json');
  const ctx = new AudioContext();
  const musicGain = ctx.createGain();
  const duckGain = ctx.createGain();
  const sfxGain = ctx.createGain();
  duckGain.connect(ctx.destination);
  musicGain.connect(duckGain);
  sfxGain.connect(ctx.destination);

  const buffers = new Map<string, AudioBuffer>();
  const all = [
    ...Object.values(manifest.music).map((m) => m.file),
    ...Object.values(manifest.sfx).map((s) => s.file),
  ];
  await Promise.all(
    all.map(async (file) => {
      const data = await loadArrayBuffer(`audio/${file}`);
      buffers.set(file, await ctx.decodeAudioData(data));
    }),
  );

  let current: { source: AudioBufferSourceNode; gain: GainNode } | null = null;

  const stopMusic = (fadeS: number = MUSIC_FADE_S): void => {
    const playing = current;
    current = null;
    if (playing === null) return;
    const at = ctx.currentTime;
    playing.gain.gain.setValueAtTime(playing.gain.gain.value, at);
    playing.gain.gain.linearRampToValueAtTime(0, at + Math.max(0.01, fadeS));
    playing.source.stop(at + Math.max(0.01, fadeS) + 0.05);
  };

  // The whole-loop delay from the clap check (M1.8); tiny hardware latency
  // as the floor when no check has run yet.
  const measuredOffset = getTimingOffsetS();
  const outputDelayS = measuredOffset > 0 ? measuredOffset : ctx.baseLatency;

  return {
    outputDelayS,
    playMusic(id: string): void {
      const def = manifest.music[id];
      const buffer = def !== undefined ? buffers.get(def.file) : undefined;
      if (def === undefined || buffer === undefined) return;
      stopMusic();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = def.loop;
      const gain = ctx.createGain();
      const at = ctx.currentTime;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(1, at + MUSIC_FADE_S);
      source.connect(gain);
      gain.connect(musicGain);
      source.start(at);
      current = { source, gain };
    },
    stopMusic,
    playSfx(id: string): void {
      const def = manifest.sfx[id];
      const buffer = def !== undefined ? buffers.get(def.file) : undefined;
      if (buffer === undefined) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(sfxGain);
      source.start();
    },
    setDucked(ducked: boolean): void {
      const at = ctx.currentTime;
      duckGain.gain.setValueAtTime(duckGain.gain.value, at);
      duckGain.gain.linearRampToValueAtTime(ducked ? MUSIC_DUCK_RATIO : 1, at + MUSIC_DUCK_RAMP_S);
    },
    setMusicVolume(volume01: number): void {
      musicGain.gain.value = Math.min(1, Math.max(0, volume01));
    },
    setSfxVolume(volume01: number): void {
      sfxGain.gain.value = Math.min(1, Math.max(0, volume01));
    },
    resume: () => ctx.resume(),
    nowS: () => ctx.currentTime,
  };
}

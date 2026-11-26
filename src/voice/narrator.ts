// Narrator Web Audio adapter (M1.6): a thin shell around NarratorCore. All
// clips are decoded at startup so lines play instantly (DESIGN). Exposes
// caption and speaking hooks (the AudioBus ducks music on speaking, M1.9).
// Browser-only; the rules live (tested) in narrator-core.

import { loadArrayBuffer, loadJson } from '../assets/loader';
import type { Narrator, SayOptions } from '../games/types';
import { NarratorCore, type VoiceLine } from './narrator-core';

interface VoiceManifest {
  voice: string;
  lines: Record<
    string,
    {
      priority: number;
      cooldownS: number;
      wordings: { file: string; text: string; durationS: number }[];
    }
  >;
}

export interface NarratorHandle extends Narrator {
  /** Caption text while speaking, null when quiet. */
  onCaption(cb: (text: string | null) => void): () => void;
  /** Ducking hook: true while any clip is playing. */
  onSpeaking(cb: (speaking: boolean) => void): () => void;
  setVolume(volume01: number): void;
  /** Drop queued lines at/below this urgency (numeric priority >= min);
   * never cuts the clip mid-word. Phase changes clear all (1); a fresh
   * prompt clears stale instructions/praise (3) before being said. */
  clearPending(minPriority?: 1 | 2 | 3 | 4): void;
  /** Call from a user gesture once; resumes a suspended AudioContext. */
  resume(): Promise<void>;
}

export async function createNarrator(): Promise<NarratorHandle> {
  const manifest = await loadJson<VoiceManifest>('voice/manifest.json');
  const lines = new Map<string, VoiceLine>();
  for (const [id, def] of Object.entries(manifest.lines)) {
    lines.set(id, {
      priority: def.priority as VoiceLine['priority'],
      cooldownS: def.cooldownS,
      wordings: def.wordings.map((w) => ({ file: w.file, text: w.text })),
    });
  }

  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.connect(ctx.destination);

  // Decode everything up front: instant playback forever after.
  const buffers = new Map<string, AudioBuffer>();
  await Promise.all(
    Object.values(manifest.lines)
      .flatMap((l) => l.wordings.map((w) => w.file))
      .map(async (file) => {
        const data = await loadArrayBuffer(`voice/clips/${file}`);
        buffers.set(file, await ctx.decodeAudioData(data));
      }),
  );

  const core = new NarratorCore(lines, {
    now: () => ctx.currentTime,
    clipUrl: (file) => file, // adapter keys buffers by file name
    colorLineIds: ['color.blue', 'color.pink'],
  });

  const captionCbs = new Set<(text: string | null) => void>();
  const speakingCbs = new Set<(speaking: boolean) => void>();
  let currentSources: AudioBufferSourceNode[] = [];

  const stopCurrent = (): void => {
    for (const s of currentSources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        // already stopped
      }
    }
    currentSources = [];
  };

  const pump = (): void => {
    const decision = core.next();
    if (decision === null) return;
    if (decision.interrupt) stopCurrent();

    const panner = ctx.createStereoPanner();
    panner.pan.value = decision.pan;
    panner.connect(master);

    let when = ctx.currentTime;
    currentSources = [];
    const clips = decision.urls
      .map((file) => buffers.get(file))
      .filter((b): b is AudioBuffer => b !== undefined);
    for (const [i, buffer] of clips.entries()) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(panner);
      source.start(when);
      when += buffer.duration;
      if (i === clips.length - 1) {
        source.onended = (): void => {
          for (const cb of captionCbs) cb(null);
          for (const cb of speakingCbs) cb(false);
          core.onPlaybackEnd();
          pump();
        };
      }
      currentSources.push(source);
    }
    if (clips.length === 0) {
      core.onPlaybackEnd();
      return;
    }
    for (const cb of captionCbs) cb(decision.caption);
    for (const cb of speakingCbs) cb(true);
  };

  return {
    say(lineId: string, options?: SayOptions): void {
      core.say(lineId, options ?? {});
      pump();
    },
    clearPending(minPriority?: 1 | 2 | 3 | 4): void {
      core.clearPending(minPriority);
    },
    onCaption(cb) {
      captionCbs.add(cb);
      return () => captionCbs.delete(cb);
    },
    onSpeaking(cb) {
      speakingCbs.add(cb);
      return () => speakingCbs.delete(cb);
    },
    setVolume(volume01: number): void {
      master.gain.value = Math.min(1, Math.max(0, volume01));
    },
    resume: () => ctx.resume(),
  };
}

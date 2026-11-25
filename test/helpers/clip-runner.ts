// Vitest clip harness (task 0.7): run anything frame-shaped over a clip and
// count what it emits. Every detector test from M1 on uses this.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildClip } from '../../tools/clip-synth/clips.ts';
import { validateClipFile, type ClipFile, type ClipFrame } from '../../src/tracking/clip-format';

export interface DetectorEvent {
  name: string;
  slot: number;
  tS: number;
}

/** A frame consumer: gets each frame once, in order; may emit events. */
export type FrameSink = (frame: ClipFrame) => DetectorEvent[] | undefined;

export interface ClipRunResult {
  events: DetectorEvent[];
  counts: Record<string, number>;
  frames: number;
  durationS: number;
}

const SYNTHETIC_DIR = join('test', 'clips', 'synthetic');
const REAL_DIR = join('test', 'clips', 'real');

export type ClipSource = 'real-file' | 'synthetic-file' | 'synthetic-memory';

/**
 * Loads a clip by name: a real recording if one exists, else the generated
 * synthetic file, else builds the synthetic clip in memory (no disk writes,
 * so parallel test workers can't race). Disk files are rounded to 4 decimals;
 * in-memory builds are full precision -- irrelevant at detector scales, but
 * the returned `source` says which one a failing test actually consumed
 * (pinned-count tests should mention it in their assertion messages).
 */
export function loadClipWithSource(name: string): { clip: ClipFile; source: ClipSource } {
  const dirs: [string, ClipSource][] = [
    [REAL_DIR, 'real-file'],
    [SYNTHETIC_DIR, 'synthetic-file'],
  ];
  for (const [dir, source] of dirs) {
    const file = join(dir, `${name}.json`);
    if (existsSync(file)) {
      const clip = JSON.parse(readFileSync(file, 'utf8')) as ClipFile;
      const problems = validateClipFile(clip);
      if (problems.length > 0) throw new Error(`${file}: ${problems[0] ?? 'invalid'}`);
      return { clip, source };
    }
  }
  return { clip: buildClip(name), source: 'synthetic-memory' };
}

export function loadClip(name: string): ClipFile {
  return loadClipWithSource(name).clip;
}

export function runOverClip(clip: ClipFile, sink: FrameSink): ClipRunResult {
  const events: DetectorEvent[] = [];
  for (const frame of clip.frames) {
    const emitted = sink(frame);
    if (emitted !== undefined) events.push(...emitted);
  }
  const counts: Record<string, number> = {};
  for (const e of events) counts[e.name] = (counts[e.name] ?? 0) + 1;
  const first = clip.frames[0];
  const last = clip.frames[clip.frames.length - 1];
  return {
    events,
    counts,
    frames: clip.frames.length,
    durationS: first !== undefined && last !== undefined ? last.tS - first.tS : 0,
  };
}

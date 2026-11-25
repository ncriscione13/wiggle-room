// Pose recorder (M0.5, dev only -- R to start/stop): collects PoseFrames and
// saves them as a clip JSON. Landmarks and timestamps only; video is never
// touched (privacy). Enabled in dev builds or with ?debug=1 (TV testing on a
// built app).

import {
  CLIP_VERSION,
  validateClipFile,
  type ClipFile,
  type ClipFrame,
} from '../tracking/clip-format';
import type { PoseFrame, PoseSource } from '../tracking/pose-source';
import { RECORDER_MAX_S } from '../motion/config';

export function isRecorderEnabled(search: string, isDevBuild: boolean): boolean {
  return isDevBuild || new URLSearchParams(search).has('debug');
}

export function buildClipFromFrames(name: string, frames: readonly PoseFrame[]): ClipFile {
  const first = frames[0];
  if (first === undefined) throw new Error('recording is empty -- nothing to save');

  const intervals = frames
    .map((f) => f.frameIntervalS)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)] ?? 1 / 30;
  const nominalFps = Math.min(120, Math.max(1, Math.round(1 / median)));

  const clipFrames: ClipFrame[] = frames.map((f) => ({
    tS: f.tS - first.tS,
    poses: f.poses,
  }));
  return { version: CLIP_VERSION, name, kind: 'recorded', nominalFps, frames: clipFrames };
}

export async function parseDroppedClip(file: File): Promise<ClipFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(`"${file.name}" is not JSON`);
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !Array.isArray((parsed as { frames?: unknown }).frames)
  ) {
    throw new Error(`"${file.name}" is not a clip file`);
  }
  const clip = parsed as ClipFile;
  const problems = validateClipFile(clip);
  if (problems.length > 0) {
    throw new Error(`"${file.name}" is not a valid clip: ${problems[0] ?? ''}`);
  }
  return clip;
}

function timestampName(date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `recording-${String(date.getFullYear())}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

export function downloadClip(clip: ClipFile): void {
  const blob = new Blob([JSON.stringify(clip)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${clip.name}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export class PoseRecorder {
  private frames: PoseFrame[] = [];
  private off: (() => void) | null = null;

  get recording(): boolean {
    return this.off !== null;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  get durationS(): number {
    const first = this.frames[0];
    const last = this.frames[this.frames.length - 1];
    return first !== undefined && last !== undefined ? last.tS - first.tS : 0;
  }

  start(source: PoseSource, onAutoStop?: () => void): void {
    if (this.recording) return;
    this.frames = [];
    this.off = source.onFrame((frame) => {
      this.frames.push(frame);
      if (this.durationS >= RECORDER_MAX_S) {
        this.stopCollecting();
        onAutoStop?.();
      }
    });
  }

  /** Stops collecting and returns the clip (null if nothing was captured). */
  stop(name: string = timestampName()): ClipFile | null {
    this.stopCollecting();
    if (this.frames.length === 0) return null;
    return buildClipFromFrames(name, this.frames);
  }

  private stopCollecting(): void {
    if (this.off !== null) {
      this.off();
      this.off = null;
    }
  }
}

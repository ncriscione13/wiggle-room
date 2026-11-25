// LivePoseSource (M0.2): camera frames through MediaPipe, exactly once each.
// requestVideoFrameCallback drives the loop; the next callback is registered
// only AFTER a frame is fully processed, so frames are never queued -- if
// inference runs long, intermediate camera frames are simply skipped
// (CLAUDE.md rule 2). Rendering pulls `latest()` and never waits on this.

import { MAX_PLAYERS_COUNT } from '../motion/config';
import type { ClipPose } from './clip-format';
import type { FrameHandler, PoseFrame, PoseSource } from './pose-source';

export interface LandmarkLike {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/** Structural view of PoseLandmarkerResult, so tests need no MediaPipe. */
export interface PoseResultLike {
  landmarks: LandmarkLike[][];
}

/** Structural view of PoseLandmarker (detect + lifecycle stay injectable). */
export interface VideoLandmarker {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): PoseResultLike;
}

/**
 * Detection order maps to slots for M0; circle-based player binding replaces
 * this in M1.2. A missing visibility field means "not reported", not
 * "invisible", so it defaults to fully visible.
 */
export function convertPoseResult(
  result: PoseResultLike,
  slots: number = MAX_PLAYERS_COUNT,
): (ClipPose | null)[] {
  const out: (ClipPose | null)[] = new Array<ClipPose | null>(slots).fill(null);
  result.landmarks.slice(0, slots).forEach((landmarks, i) => {
    out[i] = landmarks.map((l): [number, number, number, number] => [
      l.x,
      l.y,
      l.z,
      l.visibility ?? 1,
    ]);
  });
  return out;
}

/** MediaPipe VIDEO mode requires strictly increasing timestamps. */
export class MonotonicClock {
  private last = -Infinity;

  next(tMs: number): number {
    // +1 microsecond keeps bumped stamps distinct after MediaPipe's internal
    // ms -> us conversion.
    const t = tMs <= this.last ? this.last + 0.001 : tMs;
    this.last = t;
    return t;
  }
}

export interface LivePoseSourceOptions {
  video: HTMLVideoElement;
  landmarker: VideoLandmarker;
  now?: () => number;
}

export class LivePoseSource implements PoseSource {
  readonly kind = 'live' as const;

  private readonly video: HTMLVideoElement;
  private readonly landmarker: VideoLandmarker;
  private readonly now: () => number;
  private readonly clock = new MonotonicClock();
  private readonly handlers = new Set<FrameHandler>();
  private readonly errorHandlers = new Set<(error: unknown) => void>();

  private latestFrame: PoseFrame | null = null;
  private frameCount = 0;
  private rvfcHandle: number | null = null;
  private baseMs: number | null = null;
  private running = false;
  /** Bumped on start/stop so a stale rVFC callback can't fork the loop into
   * two chains (which would mean two detectForVideo per frame -- rule 2). */
  private generation = 0;

  constructor(options: LivePoseSourceOptions) {
    this.video = options.video;
    this.landmarker = options.landmarker;
    this.now = options.now ?? ((): number => performance.now());
  }

  start(): Promise<void> {
    if (!this.running) {
      this.running = true;
      this.generation += 1;
      this.scheduleNext();
    }
    return Promise.resolve();
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    if (this.rvfcHandle !== null) {
      this.video.cancelVideoFrameCallback(this.rvfcHandle);
      this.rvfcHandle = null;
    }
  }

  onFrame(handler: FrameHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Live-only: inference blew up (bad wasm state, lost GPU context...). */
  onError(handler: (error: unknown) => void): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  latest(): PoseFrame | null {
    return this.latestFrame;
  }

  /** Frames processed since start (overlay + e2e). */
  frames(): number {
    return this.frameCount;
  }

  private scheduleNext(): void {
    if (!this.running) return;
    const gen = this.generation;
    this.rvfcHandle = this.video.requestVideoFrameCallback((nowMs) => {
      this.onVideoFrame(nowMs, gen);
    });
  }

  private onVideoFrame(nowMs: number, gen: number): void {
    if (!this.running || gen !== this.generation) return;
    const tsMs = this.clock.next(nowMs);
    this.baseMs ??= tsMs;

    const t0 = this.now();
    let result: PoseResultLike;
    try {
      result = this.landmarker.detectForVideo(this.video, tsMs);
    } catch (error) {
      this.stop();
      for (const handler of this.errorHandlers) handler(error);
      return;
    }
    const inferenceS = (this.now() - t0) / 1000;

    const tS = (tsMs - this.baseMs) / 1000;
    const frame: PoseFrame = {
      tS,
      poses: convertPoseResult(result),
      inferenceS,
      frameIntervalS: this.latestFrame === null ? 0 : tS - this.latestFrame.tS,
    };
    this.latestFrame = frame;
    this.frameCount += 1;
    for (const handler of this.handlers) handler(frame);

    // A handler may have stopped/restarted us; never continue a stale chain.
    if (gen !== this.generation) return;
    // Register for the NEXT video frame only now: one detect per frame, no queue.
    this.scheduleNext();
  }
}

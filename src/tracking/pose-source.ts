// PoseSource (M0.2): the one interface the rest of the app sees for pose
// input. LivePoseSource wraps camera + MediaPipe; ReplayPoseSource plays
// clips. Consumers either subscribe (motion kit) or pull `latest()` every
// render frame (the stage -- rendering never waits on tracking).

import type { ClipPose } from './clip-format';

/** Coarse brightness stats (M1.3): numbers only, never pixels. */
export interface LumaStats {
  /** Overall mean luma, 0..1. */
  mean: number;
  cols: number;
  rows: number;
  /** Row-major cell means, 0..1, length cols×rows. */
  cells: number[];
}

export interface PoseFrame {
  /** Seconds on this source's own monotonic clock, starting near 0. */
  tS: number;
  /** Fixed pose slots; null = nothing detected in that slot this frame. */
  poses: (ClipPose | null)[];
  /** Time spent in pose inference for this frame, seconds (0 for replay). */
  inferenceS: number;
  /** Interval since the previous frame, seconds (0 for the first). */
  frameIntervalS: number;
  /** Periodic brightness stats (live worker source only; ~every 0.5 s). */
  luma?: LumaStats;
}

export type FrameHandler = (frame: PoseFrame) => void;

export interface PoseSource {
  readonly kind: 'live' | 'replay';
  /** Idempotent; resolves once frames are flowing (or about to). */
  start(): Promise<void>;
  stop(): void;
  /** Subscribe to new frames; returns an unsubscribe function. */
  onFrame(handler: FrameHandler): () => void;
  /** Newest frame for pull-style consumers; null before the first frame. */
  latest(): PoseFrame | null;
}

/** What the app shell needs from a LIVE source beyond PoseSource (both the
 * main-thread and the worker implementation provide it). */
export interface InstrumentedPoseSource extends PoseSource {
  frames(): number;
  onError(handler: (error: unknown) => void): () => void;
}

// Pose worker core (M0.9): everything the tracking worker does, written
// against structural deps so it unit-tests in node. The real worker entry
// (pose-worker.ts) wires it to MediaPipe + MediaStreamTrackProcessor.
//
// Frame policy (CLAUDE.md rule 2, now enforced here): one detect in flight,
// newest frame wins, superseded frames are closed immediately.

import { LatestFrameGate } from './latest-frame-gate';
import { convertPoseResult, type PoseResultLike } from './live-pose-source';
import type { ClipPose } from './clip-format';
import { LUMA_SAMPLE_EVERY_S } from '../motion/config.ts';

/**
 * Timestamp continuity across foreign time bases (M0.9 review finding). The
 * worker outlives camera attaches, but VideoFrame capture clocks, main-thread
 * performance.now and worker performance.now have unrelated bases. A naive
 * monotonic clamp would pin the whole timeline to +1 µs steps forever after
 * one backwards base jump (freezing benches and MediaPipe's temporal
 * filtering). This clock re-anchors instead: on every attach (and on any
 * backwards jump bigger than jitter) the next stamp continues the output
 * timeline one nominal frame later.
 */
export class ContinuousClock {
  private lastOut = -Infinity;
  private offsetMs = 0;
  private rebaseNext = true;
  private static readonly NOMINAL_GAP_MS = 33.3;
  private static readonly JITTER_TOLERANCE_MS = 1000;

  /** Forget the current base: the next stamp re-anchors (new track/source). */
  rebase(): void {
    this.rebaseNext = true;
  }

  next(rawMs: number): number {
    if (this.rebaseNext) {
      const target =
        this.lastOut === -Infinity ? rawMs : this.lastOut + ContinuousClock.NOMINAL_GAP_MS;
      this.offsetMs = target - rawMs;
      this.rebaseNext = false;
    }
    let out = rawMs + this.offsetMs;
    if (out <= this.lastOut) {
      if (out < this.lastOut - ContinuousClock.JITTER_TOLERANCE_MS) {
        // The base itself jumped backwards mid-stream: re-anchor, don't pin.
        this.offsetMs += this.lastOut + ContinuousClock.NOMINAL_GAP_MS - out;
        out = this.lastOut + ContinuousClock.NOMINAL_GAP_MS;
      } else {
        out = this.lastOut + 0.001; // ordinary jitter: nudge forward
      }
    }
    this.lastOut = out;
    return out;
  }
}

export interface LandmarkerConfig {
  wasmRoot: string;
  modelUrl: string;
  numPoses: number;
  /** Delegates to try, in order. Default ['GPU', 'CPU']; the app sends
   * ['CPU', 'GPU'] for worker tracking -- GPU-in-worker contends with
   * rendering for the one GPU and tanks fps (measured 24 vs 60). */
  delegateOrder?: readonly ('GPU' | 'CPU')[];
}

export type InMessage =
  | ({ type: 'init' } & LandmarkerConfig)
  | { type: 'track' }
  | { type: 'frame'; tMs: number }
  | { type: 'detach' }
  | { type: 'close' };

export interface LumaSample {
  mean: number;
  cols: number;
  rows: number;
  cells: number[];
}

export type OutMessage =
  | { type: 'ready'; delegate: 'GPU' | 'CPU'; hasMSTP: boolean }
  | { type: 'init-error'; message: string }
  | {
      type: 'result';
      tMs: number;
      inferenceMs: number;
      poses: (ClipPose | null)[];
      /** Attached roughly every LUMA_SAMPLE_EVERY_S (stats, never pixels). */
      luma?: LumaSample;
    }
  | { type: 'error'; message: string };

export interface WorkerLandmarker {
  detectForVideo(source: unknown, timestampMs: number): PoseResultLike;
  close?(): void;
}

export interface PortLike {
  postMessage(message: OutMessage): void;
}

export interface TrackLike {
  stop(): void;
}

export interface FrameLike {
  /** Capture timestamp in MICROseconds (WebCodecs convention), if known. */
  timestamp?: number | null;
  close(): void;
}

export interface ReaderLike {
  read(): Promise<{ done: boolean; value?: FrameLike }>;
  cancel(): void | Promise<void>;
}

export interface WorkerCoreDeps {
  port: PortLike;
  now(): number;
  createLandmarker(cfg: LandmarkerConfig, delegate: 'GPU' | 'CPU'): Promise<WorkerLandmarker>;
  makeReader(track: TrackLike): ReaderLike;
  /** Whether MediaStreamTrackProcessor exists in this worker (transport pick). */
  hasTrackProcessor?: boolean;
  /** Brightness sampler (M1.3): called at most every LUMA_SAMPLE_EVERY_S of
   * frame time, BEFORE the frame is closed. Stats only; may return null. */
  sampleLuma?(frame: FrameLike): LumaSample | null;
}

export function createWorkerCore(deps: WorkerCoreDeps): {
  onMessage(message: InMessage, track?: TrackLike, frame?: FrameLike): void;
} {
  const clock = new ContinuousClock();
  let lastLumaTMs = -Infinity;
  const gate = new LatestFrameGate<{ frame: FrameLike; tMs: number | null }>((item) => {
    item.frame.close();
  });

  let landmarker: WorkerLandmarker | null = null;
  let reader: ReaderLike | null = null;
  let track: TrackLike | null = null;
  let failed = false;
  let detached = false;

  const detachInternals = (): void => {
    detached = true;
    void reader?.cancel();
    reader = null;
    track?.stop();
    track = null;
    gate.clear();
  };

  /** Returns false when processing must stop (error reported). */
  const processOne = (item: { frame: FrameLike; tMs: number | null }): boolean => {
    if (landmarker === null || failed) {
      item.frame.close();
      return false;
    }
    const tMs = clock.next(item.tMs ?? deps.now());
    const t0 = deps.now();
    let result: PoseResultLike;
    try {
      result = landmarker.detectForVideo(item.frame, tMs);
    } catch (error) {
      failed = true;
      item.frame.close();
      detachInternals();
      deps.port.postMessage({ type: 'error', message: String(error) });
      return false;
    }
    const inferenceMs = deps.now() - t0;
    // Periodic brightness stats, sampled BEFORE the frame is closed (M1.3).
    let luma: LumaSample | undefined;
    if (deps.sampleLuma !== undefined && tMs - lastLumaTMs >= LUMA_SAMPLE_EVERY_S * 1000) {
      const sample = deps.sampleLuma(item.frame);
      if (sample !== null) {
        luma = sample;
        lastLumaTMs = tMs;
      }
    }
    item.frame.close();
    deps.port.postMessage({
      type: 'result',
      tMs,
      inferenceMs,
      poses: convertPoseResult(result),
      ...(luma !== undefined ? { luma } : {}),
    });
    return true;
  };

  const processChain = (first: { frame: FrameLike; tMs: number | null }): void => {
    let item: { frame: FrameLike; tMs: number | null } | null = first;
    while (item !== null) {
      if (!processOne(item)) {
        gate.clear();
        return;
      }
      item = gate.done();
    }
  };

  const runTrackLoop = async (r: ReaderLike): Promise<void> => {
    for (;;) {
      let step: { done: boolean; value?: FrameLike };
      try {
        step = await r.read();
      } catch {
        return;
      }
      if (step.done || detached || failed) return;
      const value = step.value;
      if (value === undefined) continue;
      const tMs = typeof value.timestamp === 'number' ? value.timestamp / 1000 : null;
      const toProcess = gate.offer({ frame: value, tMs });
      if (toProcess !== null) processChain(toProcess);
    }
  };

  const init = async (cfg: LandmarkerConfig): Promise<void> => {
    let lastError: unknown;
    const order: readonly ('GPU' | 'CPU')[] = cfg.delegateOrder ?? ['GPU', 'CPU'];
    for (const delegate of order) {
      try {
        landmarker = await deps.createLandmarker(cfg, delegate);
        deps.port.postMessage({
          type: 'ready',
          delegate,
          hasMSTP: deps.hasTrackProcessor ?? false,
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    deps.port.postMessage({ type: 'init-error', message: String(lastError) });
  };

  return {
    onMessage(message: InMessage, incomingTrack?: TrackLike, incomingFrame?: FrameLike): void {
      switch (message.type) {
        case 'init':
          void init(message);
          break;
        case 'track':
          if (incomingTrack === undefined) break;
          // A second track without a detach must not fork read loops or leak
          // the old clone (M0.9 review): tear the old one down first.
          detachInternals();
          clock.rebase(); // new stream = possibly foreign timestamp base
          detached = false;
          failed = false;
          track = incomingTrack;
          reader = deps.makeReader(incomingTrack);
          void runTrackLoop(reader);
          break;
        case 'frame': {
          if (incomingFrame === undefined) break;
          const toProcess = gate.offer({ frame: incomingFrame, tMs: message.tMs });
          if (toProcess !== null) processChain(toProcess);
          break;
        }
        case 'detach':
          detachInternals();
          break;
        case 'close':
          detachInternals();
          landmarker?.close?.();
          landmarker = null;
          break;
      }
    },
  };
}

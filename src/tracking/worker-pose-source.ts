// Worker tracking, main-thread side (M0.9): the worker owns MediaPipe; this
// file owns the handshake, the PoseSource facade, and the two frame
// transports. Primary transport: transfer a cloned camera track and let the
// worker read it via MediaStreamTrackProcessor (zero main-thread work per
// frame, no dependency on video compositing). Fallback: main-thread rVFC
// shipping ImageBitmaps, one in flight.

import { MAX_PLAYERS_COUNT } from '../motion/config';
import { mediapipeWasmRoot, poseModelUrl } from '../assets/paths';
import type { OutMessage } from './pose-worker-core';
import type { FrameHandler, InstrumentedPoseSource, PoseFrame } from './pose-source';

export interface WorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message' | 'error', fn: (e: { data?: unknown }) => void): void;
  removeEventListener(type: 'message' | 'error', fn: (e: { data?: unknown }) => void): void;
  terminate(): void;
}

export interface PoseWorkerHandle {
  worker: WorkerLike;
  delegate: 'GPU' | 'CPU';
  hasMSTP: boolean;
  close(): void;
}

const INIT_TIMEOUT_MS = 30_000;

function defaultMakeWorker(): WorkerLike {
  return new Worker(new URL('./pose-worker.ts', import.meta.url), { type: 'module' });
}

/** Spawns the tracking worker and waits for the model to be ready. One worker
 * per app boot: it keeps the model loaded across camera reopenings. */
export function createPoseWorker(
  makeWorker: () => WorkerLike = defaultMakeWorker,
  options: { delegateOrder?: readonly ('GPU' | 'CPU')[] } = {},
): Promise<PoseWorkerHandle> {
  const worker = makeWorker();
  worker.postMessage({
    type: 'init',
    wasmRoot: mediapipeWasmRoot(),
    modelUrl: poseModelUrl(),
    numPoses: MAX_PLAYERS_COUNT,
    // CPU-first in the worker: inference cost matches GPU there, rendering
    // keeps the whole GPU, and behavior is identical on CI (measured:
    // GPU-in-worker 24 fps render vs CPU-in-worker 60 fps, same machine).
    delegateOrder: options.delegateOrder ?? ['CPU', 'GPU'],
  });
  return new Promise<PoseWorkerHandle>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onErrorEvent);
    };
    const timer = setTimeout(() => {
      cleanup();
      worker.terminate();
      reject(new Error('pose worker init timed out'));
    }, INIT_TIMEOUT_MS);
    // A worker-script LOAD failure (missing chunk, top-level throw) emits an
    // `error` event, never a message -- without this listener the app would
    // sit out the full timeout before falling back (M0.9 review).
    const onErrorEvent = (): void => {
      cleanup();
      worker.terminate();
      reject(new Error('pose worker script failed to load'));
    };
    const onMessage = (e: { data?: unknown }): void => {
      const data = e.data as OutMessage;
      if (data.type === 'ready') {
        cleanup();
        resolve({
          worker,
          delegate: data.delegate,
          hasMSTP: data.hasMSTP,
          // terminate() reclaims the whole realm, incl. the transferred clone
          // track and the landmarker; a pre-terminate message never runs.
          close: () => {
            worker.terminate();
          },
        });
      } else if (data.type === 'init-error') {
        cleanup();
        worker.terminate();
        reject(new Error(`pose worker init failed: ${data.message}`));
      }
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onErrorEvent);
  });
}

// --- Transports --------------------------------------------------------------

export interface Transport {
  start(): void;
  stop(): void;
}

export interface TransportInfo {
  transport: Transport;
  /** 'track' (MSTP in worker) or 'bitmap' (rVFC + ImageBitmap shipping). */
  mode(): 'track' | 'bitmap' | 'idle';
}

/**
 * Picks the best transport at start time: track transfer when the worker has
 * MediaStreamTrackProcessor and the browser can transfer tracks; otherwise
 * the bitmap fallback. Browser-only glue; covered by e2e.
 */
export function createLiveTransport(
  worker: WorkerLike,
  camera: { stream: MediaStream; video: HTMLVideoElement },
  hasMSTP: boolean,
  options: { forceBitmap?: boolean } = {},
): TransportInfo {
  let mode: 'track' | 'bitmap' | 'idle' = 'idle';
  let running = false;
  let busy = false;
  let generation = 0;
  let rvfcHandle: number | null = null;

  // `busy` is a best-effort throttle (a foreign late result could clear it a
  // beat early); the worker's LatestFrameGate is the actual serializer.
  const onWorkerMessage = (e: { data?: unknown }): void => {
    const t = (e.data as { type?: string }).type;
    if (t === 'result' || t === 'error') busy = false;
  };

  const scheduleBitmap = (): void => {
    if (!running) return;
    rvfcHandle = camera.video.requestVideoFrameCallback((nowMs) => {
      if (!running) return;
      if (!busy) {
        busy = true;
        const gen = generation;
        createImageBitmap(camera.video)
          .then((bitmap) => {
            // A stop() (or stop+start) landed while the bitmap was baking:
            // never ship a stale pre-stop frame (M0.9 review).
            if (!running || gen !== generation) {
              bitmap.close();
              busy = false;
              return;
            }
            try {
              worker.postMessage({ type: 'frame', tMs: nowMs, bitmap }, [bitmap]);
            } catch (error) {
              bitmap.close(); // a failed transfer must not leak the bitmap
              busy = false;
              throw error;
            }
          })
          .catch(() => {
            busy = false;
          });
      }
      scheduleBitmap();
    });
  };

  return {
    mode: () => mode,
    transport: {
      start(): void {
        running = true;
        generation += 1;
        if (hasMSTP && options.forceBitmap !== true) {
          const original = camera.stream.getVideoTracks()[0];
          if (original !== undefined) {
            const clone = original.clone();
            try {
              worker.postMessage({ type: 'track', track: clone }, [clone]);
              mode = 'track';
              return;
            } catch {
              // Track transfer unsupported here; fall through to bitmaps.
              clone.stop();
            }
          }
        }
        mode = 'bitmap';
        busy = false;
        worker.addEventListener('message', onWorkerMessage);
        scheduleBitmap();
      },
      stop(): void {
        running = false;
        mode = 'idle';
        if (rvfcHandle !== null) {
          camera.video.cancelVideoFrameCallback(rvfcHandle);
          rvfcHandle = null;
        }
        worker.removeEventListener('message', onWorkerMessage);
      },
    },
  };
}

// --- The PoseSource facade ---------------------------------------------------

export interface WorkerPoseSourceOptions {
  handle: PoseWorkerHandle;
  transport: Transport;
}

export class WorkerPoseSource implements InstrumentedPoseSource {
  readonly kind = 'live' as const;

  private readonly handle: PoseWorkerHandle;
  private readonly transport: Transport;
  private readonly handlers = new Set<FrameHandler>();
  private readonly errorHandlers = new Set<(error: unknown) => void>();

  private latestFrame: PoseFrame | null = null;
  private frameCount = 0;
  private baseMs: number | null = null;
  private running = false;
  private generation = 0;
  private listener: ((e: { data?: unknown }) => void) | null = null;

  constructor(options: WorkerPoseSourceOptions) {
    this.handle = options.handle;
    this.transport = options.transport;
  }

  start(): Promise<void> {
    if (!this.running) {
      this.running = true;
      this.generation += 1;
      this.baseMs = null;
      this.latestFrame = null;
      const gen = this.generation;
      this.listener = (e): void => {
        if (gen !== this.generation) return;
        this.onWorkerMessage(e.data as OutMessage);
      };
      this.handle.worker.addEventListener('message', this.listener);
      this.transport.start();
    }
    return Promise.resolve();
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    if (this.listener !== null) {
      this.handle.worker.removeEventListener('message', this.listener);
      this.listener = null;
    }
    this.transport.stop();
    this.handle.worker.postMessage({ type: 'detach' });
  }

  onFrame(handler: FrameHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  onError(handler: (error: unknown) => void): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  latest(): PoseFrame | null {
    return this.latestFrame;
  }

  frames(): number {
    return this.frameCount;
  }

  private onWorkerMessage(data: OutMessage): void {
    if (data.type === 'result') {
      this.baseMs ??= data.tMs;
      const tS = (data.tMs - this.baseMs) / 1000;
      const frame: PoseFrame = {
        tS,
        poses: data.poses,
        inferenceS: data.inferenceMs / 1000,
        frameIntervalS: this.latestFrame === null ? 0 : tS - this.latestFrame.tS,
      };
      this.latestFrame = frame;
      this.frameCount += 1;
      for (const handler of this.handlers) handler(frame);
    } else if (data.type === 'error') {
      this.stop();
      for (const handler of this.errorHandlers) handler(new Error(data.message));
    }
  }
}

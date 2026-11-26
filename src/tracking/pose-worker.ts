// Tracking worker entry (M0.9): MediaPipe runs HERE, off the main thread.
// All behavior lives in pose-worker-core (unit-tested); this file is the
// browser glue: MediaPipe construction and MediaStreamTrackProcessor reading.
// Loads wasm + model only from this origin (CLAUDE.md rule 8).

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  createWorkerCore,
  type FrameLike,
  type InMessage,
  type ReaderLike,
  type TrackLike,
} from './pose-worker-core';

// Typed without the webworker lib (mixing it with the app's DOM lib causes
// global conflicts); structurally this is all we use of the worker scope.
const workerScope = globalThis as unknown as {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', fn: (e: { data: unknown }) => void): void;
};

// MediaStreamTrackProcessor is Chrome/Edge-only and absent from the TS DOM
// lib; declared structurally. Its readable stream yields VideoFrames, which
// satisfy FrameLike (timestamp in microseconds + close()).
declare const MediaStreamTrackProcessor:
  | (new (init: { track: TrackLike }) => {
      readable: { getReader(): ReaderLike };
    })
  | undefined;

let fileset: unknown = null;

const core = createWorkerCore({
  port: {
    postMessage: (m) => {
      workerScope.postMessage(m);
    },
  },
  now: () => performance.now(),
  hasTrackProcessor: typeof MediaStreamTrackProcessor !== 'undefined',
  createLandmarker: async (cfg, delegate) => {
    // useModule: true -- this is a module worker (Vite builds workers as ESM),
    // where importScripts throws; MediaPipe must load its
    // vision_wasm_module_internal.* variant ("ModuleFactory not set" otherwise).
    fileset ??= await FilesetResolver.forVisionTasks(cfg.wasmRoot, true);
    const landmarker = await PoseLandmarker.createFromOptions(
      fileset as Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
      {
        baseOptions: { modelAssetPath: cfg.modelUrl, delegate },
        runningMode: 'VIDEO',
        numPoses: cfg.numPoses,
      },
    );
    return {
      detectForVideo: (source, timestampMs) =>
        landmarker.detectForVideo(
          source as Parameters<typeof landmarker.detectForVideo>[0],
          timestampMs,
        ),
      close: () => {
        landmarker.close();
      },
    };
  },
  makeReader: (track) => {
    if (MediaStreamTrackProcessor === undefined) {
      throw new Error('MediaStreamTrackProcessor unavailable in this worker');
    }
    return new MediaStreamTrackProcessor({ track }).readable.getReader();
  },
});

workerScope.addEventListener('message', (e) => {
  const data = e.data as InMessage & { track?: TrackLike; bitmap?: FrameLike };
  core.onMessage(data, data.track, data.bitmap);
});

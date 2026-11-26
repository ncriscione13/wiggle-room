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

// Brightness sampler (M1.3): a 32x24 downsample -> mean + 8x6 cell grid.
// Numbers leave the worker; pixels never do (privacy).
const LUMA_W = 32;
const LUMA_H = 24;
const LUMA_COLS = 8;
const LUMA_ROWS = 6;
let lumaCanvas: OffscreenCanvas | null = null;
let lumaCtx: OffscreenCanvasRenderingContext2D | null = null;

function sampleLuma(
  frame: unknown,
): { mean: number; cols: number; rows: number; cells: number[] } | null {
  try {
    if (lumaCtx === null) {
      lumaCanvas = new OffscreenCanvas(LUMA_W, LUMA_H);
      lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true });
      if (lumaCtx === null) return null;
    }
    lumaCtx.drawImage(frame as CanvasImageSource, 0, 0, LUMA_W, LUMA_H);
    const data = lumaCtx.getImageData(0, 0, LUMA_W, LUMA_H).data;
    const cellW = LUMA_W / LUMA_COLS;
    const cellH = LUMA_H / LUMA_ROWS;
    const cells = new Array<number>(LUMA_COLS * LUMA_ROWS).fill(0);
    const counts = new Array<number>(LUMA_COLS * LUMA_ROWS).fill(0);
    let total = 0;
    for (let y = 0; y < LUMA_H; y += 1) {
      for (let x = 0; x < LUMA_W; x += 1) {
        const i = (y * LUMA_W + x) * 4;
        const luma =
          (0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0)) /
          255;
        total += luma;
        const cell = Math.floor(y / cellH) * LUMA_COLS + Math.floor(x / cellW);
        cells[cell] = (cells[cell] ?? 0) + luma;
        counts[cell] = (counts[cell] ?? 0) + 1;
      }
    }
    for (let c = 0; c < cells.length; c += 1) {
      const n = counts[c] ?? 1;
      cells[c] = (cells[c] ?? 0) / n;
    }
    return { mean: total / (LUMA_W * LUMA_H), cols: LUMA_COLS, rows: LUMA_ROWS, cells };
  } catch {
    return null; // sampling must never break tracking
  }
}

const core = createWorkerCore({
  port: {
    postMessage: (m) => {
      workerScope.postMessage(m);
    },
  },
  now: () => performance.now(),
  hasTrackProcessor: typeof MediaStreamTrackProcessor !== 'undefined',
  sampleLuma,
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

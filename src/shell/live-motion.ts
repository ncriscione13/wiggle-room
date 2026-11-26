// Live camera -> MotionKit (M1.10): the first real path from the webcam into
// games. Opens the camera at the device-check size, starts the worker (or
// main-thread fallback) exactly like the debug stage, and pumps every frame
// through the kit once (CLAUDE.md rule 2 stays in the worker/transport).

import type { Slot } from '../games/types';
import { MotionKit } from '../motion/kit';
import type { PlayersFrame } from '../motion/players';
import type { LumaStats } from '../tracking/pose-source';
import { openCamera, CameraOpenError, type CameraHandle } from '../tracking/camera';
import { createPoseLandmarker } from '../tracking/landmarker';
import { LivePoseSource } from '../tracking/live-pose-source';
import {
  createLiveTransport,
  createPoseWorker,
  WorkerPoseSource,
} from '../tracking/worker-pose-source';
import { delegateOrderFromRecord, loadDeviceCheckRecord } from './device-check';

export { CameraOpenError };

export type FrameTap = (tS: number, frame: PlayersFrame, luma?: LumaStats) => void;

export interface LiveMotion {
  kit: MotionKit;
  camera: CameraHandle;
  /** Observe each processed frame (startup check, warm-up). */
  onFrame(tap: FrameTap): () => void;
  setStillLine(slot: Slot, stillLineBlPerS: number): void;
  stop(): void;
  onError(handler: (error: unknown) => void): () => void;
}

export async function createLiveMotion(): Promise<LiveMotion> {
  const stored = loadDeviceCheckRecord();
  const camera = await openCamera(
    stored !== null ? { widthPx: stored.widthPx, heightPx: stored.heightPx } : {},
  );

  const params = new URLSearchParams(window.location.search);
  const rawDelegate = params.get('delegate');
  // ?delegate= pin wins; otherwise the device check's measured winner.
  const pinned: readonly ('GPU' | 'CPU')[] | undefined =
    rawDelegate === 'cpu'
      ? ['CPU']
      : rawDelegate === 'gpu'
        ? ['GPU']
        : delegateOrderFromRecord(stored);

  let source;
  let closeExtra: () => void;
  try {
    const handle = await createPoseWorker(
      undefined,
      pinned !== undefined ? { delegateOrder: pinned } : {},
    );
    const transport = createLiveTransport(handle.worker, camera, handle.hasMSTP, {
      forceBitmap: params.get('transport') === 'bitmap',
    });
    source = new WorkerPoseSource({ handle, transport: transport.transport });
    closeExtra = (): void => {
      handle.close();
    };
  } catch (error) {
    console.warn('pose worker unavailable; main-thread tracking', error);
    const handle = await createPoseLandmarker();
    source = new LivePoseSource({ video: camera.video, landmarker: handle.landmarker });
    closeExtra = (): void => {
      handle.close();
    };
  }

  const kit = new MotionKit(() => source.latest()?.tS ?? 0);
  const taps = new Set<FrameTap>();
  const offFrame = source.onFrame((frame) => {
    const playersFrame = kit.update(frame.tS, frame.poses);
    for (const tap of taps) tap(frame.tS, playersFrame, frame.luma);
  });
  await source.start();

  return {
    kit,
    camera,
    onFrame(tap: FrameTap): () => void {
      taps.add(tap);
      return () => taps.delete(tap);
    },
    setStillLine: (slot, line) => {
      kit.setStillLine(slot, line);
    },
    stop(): void {
      offFrame();
      source.stop();
      closeExtra();
      camera.stop();
    },
    onError: (handler) => source.onError(handler),
  };
}

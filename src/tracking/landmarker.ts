// PoseLandmarker factory (M0.2): loads wasm and model ONLY from this origin
// (the copies fetch-models/postinstall put in public/). GPU delegate first,
// CPU as fallback -- the M0.6 device check decides whether the result is fast
// enough.

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { mediapipeWasmRoot, poseModelUrl } from '../assets/paths';
import { MAX_PLAYERS_COUNT } from '../motion/config';

export type Delegate = 'GPU' | 'CPU';

export interface LandmarkerHandle {
  landmarker: PoseLandmarker;
  delegate: Delegate;
  close(): void;
}

export async function createPoseLandmarker(): Promise<LandmarkerHandle> {
  const fileset = await FilesetResolver.forVisionTasks(mediapipeWasmRoot());
  let lastError: unknown;
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: poseModelUrl(), delegate },
        runningMode: 'VIDEO',
        numPoses: MAX_PLAYERS_COUNT,
      });
      if (delegate === 'CPU') {
        console.warn('pose landmarker: GPU delegate unavailable, running on CPU');
      }
      return {
        landmarker,
        delegate,
        close(): void {
          landmarker.close();
        },
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error('pose landmarker could not start on GPU or CPU', { cause: lastError });
}

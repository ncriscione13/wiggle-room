// Pure stage math (M0.3), separate from pose-stage.ts so it unit-tests
// without importing Phaser. The display is MIRRORED (DESIGN: step left ->
// buddy moves left), so camera x flips; landmarks themselves stay raw.

import type { ClipLandmark } from '../tracking/clip-format';

export function toStageX(landmark: ClipLandmark, stageWidth: number): number {
  return (1 - landmark[0]) * stageWidth;
}

export function toStageY(landmark: ClipLandmark, stageHeight: number): number {
  return landmark[1] * stageHeight;
}

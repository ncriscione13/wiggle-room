// App boot (M0.1/M0.2): pick the pose source from the URL, open it, and
// surface problems with friendly screens. Grows into the full shell over M0/M1.

import { openCamera, CameraOpenError } from '../tracking/camera';
import { createPoseLandmarker } from '../tracking/landmarker';
import { LivePoseSource } from '../tracking/live-pose-source';
import { ReplayPoseSource } from '../tracking/replay-pose-source';
import { sourceConfigFromUrl } from '../tracking/source-config';
import type { PoseSource } from '../tracking/pose-source';
import { mountPoseStage, type PoseStage } from '../ui/pose-stage';
import { mountDebugOverlay } from '../debug/overlay';
import { mountReplayBadge } from './replay-badge';
import { renderCameraErrorScreen } from './camera-error-screen';
import { mountStatusChip } from './status-chip';
import { renderStartScreen } from './start-screen';

function showStage(root: HTMLElement, source: PoseSource): PoseStage {
  // The stage replaces the start screen as the visual surface.
  root.querySelector('.wr-start')?.remove();
  return mountPoseStage(root, source);
}

export async function bootApp(root: HTMLElement): Promise<void> {
  renderStartScreen(root);
  const config = sourceConfigFromUrl(window.location.search);

  if (config.source === 'replay') {
    const clip = await mountReplayBadge(root, config.clip);
    if (clip !== null) {
      const replay = new ReplayPoseSource(clip, { speed: config.speed, loop: true });
      const stage = showStage(root, replay);
      const overlay = mountDebugOverlay(root, {
        source: replay,
        stage,
        sourceLabel: `${clip.name} ×${String(config.speed)}`,
      });
      overlay.events.push('replay started', 0);
      await replay.start();
    }
    return;
  }

  let cameraLabel: string;
  let chip: HTMLElement;
  let video: HTMLVideoElement;
  try {
    const camera = await openCamera();
    cameraLabel = `${String(camera.widthPx)}×${String(camera.heightPx)} @ ${String(camera.fps)} fps`;
    chip = mountStatusChip(root, 'camera-chip', `Camera ${cameraLabel} · starting tracking…`);
    video = camera.video;
  } catch (error) {
    const kind = error instanceof CameraOpenError ? error.kind : 'unknown';
    renderCameraErrorScreen(root, kind);
    return;
  }

  try {
    const handle = await createPoseLandmarker();
    const live = new LivePoseSource({ video, landmarker: handle.landmarker });
    live.onError(() => {
      renderCameraErrorScreen(root, 'unknown');
    });
    const stage = showStage(root, live);
    const overlay = mountDebugOverlay(root, { source: live, stage, sourceLabel: cameraLabel });
    overlay.events.push(`tracking started · ${handle.delegate}`, 0);
    await live.start();
    const update = (): void => {
      const poseCount = live.latest()?.poses.filter((p) => p !== null).length ?? 0;
      chip.textContent =
        `Tracking · ${String(live.frames())} frames · ${String(poseCount)} poses · ` +
        `${cameraLabel} · ${handle.delegate}`;
    };
    window.setInterval(update, 500);
  } catch {
    renderCameraErrorScreen(root, 'unknown');
  }
}

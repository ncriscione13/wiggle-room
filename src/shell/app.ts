// App boot (M0.1+): pick the pose source from the URL, open it, and surface
// problems with friendly screens. Grows into the full shell over M0/M1.

import { openCamera, CameraOpenError } from '../tracking/camera';
import { sourceConfigFromUrl } from '../tracking/source-config';
import { mountReplayBadge } from './replay-badge';
import { renderCameraErrorScreen } from './camera-error-screen';
import { mountStatusChip } from './status-chip';
import { renderStartScreen } from './start-screen';

export async function bootApp(root: HTMLElement): Promise<void> {
  renderStartScreen(root);
  const config = sourceConfigFromUrl(window.location.search);

  if (config.source === 'replay') {
    await mountReplayBadge(root, config.clip);
    return;
  }

  try {
    const camera = await openCamera();
    mountStatusChip(
      root,
      'camera-chip',
      `Camera ${String(camera.widthPx)}×${String(camera.heightPx)} @ ${String(camera.fps)} fps`,
    );
  } catch (error) {
    const kind = error instanceof CameraOpenError ? error.kind : 'unknown';
    renderCameraErrorScreen(root, kind);
  }
}

// App boot (M0.1–M0.5): pick the pose source from the URL, run it on the
// stage with the debug overlay, surface problems with friendly screens, and
// (dev only) mount the recorder + clip drag-and-drop.

import { openCamera, CameraOpenError, type CameraHandle } from '../tracking/camera';
import { DEVICE_CHECK_DURATION_S } from '../motion/config';
import {
  collectInferenceSamples,
  loadDeviceCheckRecord,
  planDeviceCheck,
  renderSlowDeviceWarning,
  saveDeviceCheckRecord,
  summarizeSamples,
  type SampleSummary,
} from './device-check';
import { createPoseLandmarker } from '../tracking/landmarker';
import { LivePoseSource } from '../tracking/live-pose-source';
import { ReplayPoseSource } from '../tracking/replay-pose-source';
import { sourceConfigFromUrl } from '../tracking/source-config';
import type { ClipFile } from '../tracking/clip-format';
import type { PoseSource } from '../tracking/pose-source';
import { mountPoseStage, type PoseStage } from '../ui/pose-stage';
import { mountDebugOverlay, type DebugOverlay } from '../debug/overlay';
import { mountDevTools } from '../debug/dev-tools';
import { isRecorderEnabled } from '../debug/recorder';
import { mountReplayBadge } from './replay-badge';
import { renderCameraErrorScreen } from './camera-error-screen';
import { mountStatusChip } from './status-chip';
import { renderStartScreen } from './start-screen';
import { colors, px, typography } from '../ui/theme';

interface StageSession {
  source: PoseSource;
  stage: PoseStage;
  overlay: DebugOverlay;
  destroy(): void;
}

let session: StageSession | null = null;

function startStageSession(
  root: HTMLElement,
  source: PoseSource,
  label: string,
  extraCleanup?: () => void,
): StageSession {
  root.querySelector('.wr-start')?.remove();
  const stage = mountPoseStage(root, source);
  const overlay = mountDebugOverlay(root, { source, stage, sourceLabel: label });
  const s: StageSession = {
    source,
    stage,
    overlay,
    destroy(): void {
      overlay.destroy();
      stage.destroy();
      source.stop();
      extraCleanup?.();
    },
  };
  session = s;
  return s;
}

/** Replaces any replay badge with one for an in-memory (dropped) clip. */
function renderDroppedBadge(root: HTMLElement, clip: ClipFile): void {
  root.querySelector('[data-testid="replay-badge"]')?.remove();
  const badge = document.createElement('div');
  badge.setAttribute('data-testid', 'replay-badge');
  badge.dataset['state'] = 'ready';
  badge.textContent = `Replay: ${clip.name} — ${String(clip.frames.length)} frames (dropped)`;
  Object.assign(badge.style, {
    position: 'fixed',
    bottom: px(16),
    left: px(16),
    zIndex: '10',
    padding: `${px(8)} ${px(14)}`,
    borderRadius: px(12),
    background: colors.surfaceRaised,
    color: colors.textSoft,
    fontFamily: typography.family,
    fontSize: px(18),
  });
  root.appendChild(badge);
}

function playDroppedClip(root: HTMLElement, clip: ClipFile): void {
  session?.destroy();
  const replay = new ReplayPoseSource(clip, { loop: true });
  const s = startStageSession(root, replay, `${clip.name} (dropped)`);
  s.overlay.events.push('replay started (dropped clip)', 0);
  renderDroppedBadge(root, clip);
  void replay.start();
}

export async function bootApp(root: HTMLElement): Promise<void> {
  renderStartScreen(root);
  const config = sourceConfigFromUrl(window.location.search);

  if (isRecorderEnabled(window.location.search, import.meta.env.DEV)) {
    mountDevTools(root, {
      getSource: () => session?.source ?? null,
      onDroppedClip: (clip) => {
        playDroppedClip(root, clip);
      },
    });
  }

  if (config.source === 'replay') {
    const clip = await mountReplayBadge(root, config.clip);
    if (clip !== null) {
      const replay = new ReplayPoseSource(clip, { speed: config.speed, loop: true });
      const s = startStageSession(root, replay, `${clip.name} ×${String(config.speed)}`);
      s.overlay.events.push('replay started', 0);
      await replay.start();
    }
    return;
  }

  const labelOf = (c: CameraHandle): string =>
    `${String(c.widthPx)}×${String(c.heightPx)} @ ${String(c.fps)} fps`;

  let camera: CameraHandle;
  let chip: HTMLElement;
  try {
    camera = await openCamera();
    chip = mountStatusChip(root, 'camera-chip', `Camera ${labelOf(camera)} · starting tracking…`);
  } catch (error) {
    const kind = error instanceof CameraOpenError ? error.kind : 'unknown';
    renderCameraErrorScreen(root, kind);
    return;
  }

  try {
    const handle = await createPoseLandmarker();

    const attach = async (cam: CameraHandle): Promise<LivePoseSource> => {
      const live = new LivePoseSource({ video: cam.video, landmarker: handle.landmarker });
      live.onError(() => {
        renderCameraErrorScreen(root, 'unknown');
      });
      const s = startStageSession(root, live, labelOf(cam), () => {
        cam.stop();
      });
      s.overlay.events.push(`tracking started · ${handle.delegate}`, 0);
      await live.start();
      return live;
    };

    let live = await attach(camera);

    // M0.6: first-run device check (skipped once a record exists).
    if (loadDeviceCheckRecord() === null) {
      let finalSummary: SampleSummary = { avgS: 0, p99S: 0, count: 0 };
      const outcome = await planDeviceCheck(async (step) => {
        if (step.widthPx !== null && step.heightPx !== null) {
          session?.destroy(); // stops live + stage + overlay + that camera
          camera = await openCamera({ widthPx: step.widthPx, heightPx: step.heightPx });
          live = await attach(camera);
        }
        chip.textContent = `Device check… · ${labelOf(camera)}`;
        finalSummary = summarizeSamples(
          await collectInferenceSamples(live, DEVICE_CHECK_DURATION_S),
        );
        return finalSummary.avgS;
      });

      const round1 = (n: number): number => Math.round(n * 10) / 10;
      saveDeviceCheckRecord({
        avgMs: round1(outcome.avgS * 1000),
        p99Ms: round1(finalSummary.p99S * 1000),
        widthPx: camera.widthPx,
        heightPx: camera.heightPx,
        delegate: handle.delegate,
        warned: outcome.warned,
        atMs: Date.now(),
      });
      session?.overlay.events.push(
        `device check · avg ${round1(outcome.avgS * 1000).toFixed(1)} ms @ ${labelOf(camera)}`,
        0,
      );
      if (outcome.warned) renderSlowDeviceWarning(root);
    }

    const update = (): void => {
      const poseCount = live.latest()?.poses.filter((p) => p !== null).length ?? 0;
      chip.textContent =
        `Tracking · ${String(live.frames())} frames · ${String(poseCount)} poses · ` +
        `${labelOf(camera)} · ${handle.delegate}`;
    };
    window.setInterval(update, 500);
  } catch {
    renderCameraErrorScreen(root, 'unknown');
  }
}

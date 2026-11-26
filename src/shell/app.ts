// App boot (M0.1–M0.5): pick the pose source from the URL, run it on the
// stage with the debug overlay, surface problems with friendly screens, and
// (dev only) mount the recorder + clip drag-and-drop.

import { openCamera, CameraOpenError, type CameraHandle } from '../tracking/camera';
import { DEVICE_CHECK_DURATION_S, DEVICE_CHECK_WARN_S } from '../motion/config';
import {
  createLiveTransport,
  createPoseWorker,
  WorkerPoseSource,
} from '../tracking/worker-pose-source';
import {
  clearDeviceCheckRecord,
  collectBenchmarkSamples,
  loadDeviceCheckRecord,
  planDeviceCheck,
  renderSlowDeviceWarning,
  saveDeviceCheckRecord,
  shouldUpgradeBenchmark,
  summarizeSamples,
  type BenchmarkSamples,
} from './device-check';
import { createPoseLandmarker } from '../tracking/landmarker';
import { LivePoseSource } from '../tracking/live-pose-source';
import { ReplayPoseSource } from '../tracking/replay-pose-source';
import { screenFromUrl, sourceConfigFromUrl, type SourceConfig } from '../tracking/source-config';
import { mountLagTestScreen } from '../debug/lag-test';
import { mountClipRecordingDirector } from '../debug/clip-recording';
import type { ClipFile } from '../tracking/clip-format';
import type { InstrumentedPoseSource, PoseSource } from '../tracking/pose-source';
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

/** Tears down the live-path extras (chip interval, chip, upgrade watcher,
 * landmarker) that outlive a single StageSession (review fix). */
let liveTeardown: (() => void) | null = null;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Thrown when a benchmark can't complete (source stopped mid-bench); the
 * check is skipped without saving a record and without an error screen. */
class BenchAborted extends Error {}

/** M0.9: how live sources get made. Worker tracking is primary (model loaded
 * once, kept across camera reopenings); the main-thread pipeline remains as
 * the fallback when the worker can't start at all. */
interface LiveFactory {
  delegate: 'GPU' | 'CPU';
  locus: 'worker' | 'main';
  make(camera: CameraHandle): {
    source: InstrumentedPoseSource;
    /** Resolved AFTER source.start(): 'track' | 'bitmap' | 'main'. */
    mode(): string;
  };
  close(): void;
}

async function createLiveFactory(): Promise<LiveFactory> {
  // Tuning knobs: ?delegate=cpu|gpu pins the worker's inference delegate;
  // ?transport=bitmap forces the rVFC/ImageBitmap fallback transport.
  const params = new URLSearchParams(window.location.search);
  const rawDelegate = params.get('delegate');
  const pinned: readonly ('GPU' | 'CPU')[] | undefined =
    rawDelegate === 'cpu' ? ['CPU'] : rawDelegate === 'gpu' ? ['GPU'] : undefined;
  const forceBitmap = params.get('transport') === 'bitmap';
  try {
    const handle = await createPoseWorker(
      undefined,
      pinned !== undefined ? { delegateOrder: pinned } : {},
    );
    return {
      delegate: handle.delegate,
      locus: 'worker',
      make(camera: CameraHandle) {
        const info = createLiveTransport(handle.worker, camera, handle.hasMSTP, { forceBitmap });
        return {
          source: new WorkerPoseSource({ handle, transport: info.transport }),
          mode: () => info.mode(),
        };
      },
      close: () => {
        handle.close();
      },
    };
  } catch (error) {
    console.warn('pose worker unavailable; falling back to main-thread tracking', error);
    const handle = await createPoseLandmarker();
    return {
      delegate: handle.delegate,
      locus: 'main',
      make: (camera: CameraHandle) => ({
        source: new LivePoseSource({ video: camera.video, landmarker: handle.landmarker }),
        mode: () => 'main',
      }),
      close: () => {
        handle.close();
      },
    };
  }
}

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
  liveTeardown?.();
  const replay = new ReplayPoseSource(clip, { loop: true });
  const s = startStageSession(root, replay, `${clip.name} (dropped)`);
  s.overlay.events.push('replay started (dropped clip)', 0);
  renderDroppedBadge(root, clip);
  void replay.start();
}

/** M0.7: the lag test replaces the stage; no device check, no overlay. */
async function bootLagTest(root: HTMLElement, config: SourceConfig): Promise<void> {
  if (config.source === 'replay') {
    const clip = await mountReplayBadge(root, config.clip);
    if (clip === null) return;
    const replay = new ReplayPoseSource(clip, { speed: config.speed, loop: true });
    await replay.start();
    mountLagTestScreen(root, replay);
    return;
  }
  let camera: CameraHandle | null = null;
  let factory: LiveFactory | null = null;
  try {
    camera = await openCamera();
    factory = await createLiveFactory();
    const live = factory.make(camera).source;
    const cam = camera;
    const fac = factory;
    live.onError(() => {
      // Mid-session tracking failure: release everything before the screen
      // (M0.9 review -- no webcam LED behind an error screen, ever).
      cam.stop();
      fac.close();
      renderCameraErrorScreen(root, 'model');
    });
    await live.start();
    mountLagTestScreen(root, live);
  } catch (error) {
    // Never leave the webcam running behind an error screen (review fix),
    // and name the real problem: a thrown CameraOpenError keeps its kind;
    // anything else here is the tracking engine failing to load.
    camera?.stop();
    factory?.close();
    const kind = error instanceof CameraOpenError ? error.kind : 'model';
    renderCameraErrorScreen(root, kind);
  }
}

/** M0.8: guided recording of the real-kid clips, with the stage behind for
 * framing feedback. Live camera only; no device check in the way. */
async function bootRecord(root: HTMLElement): Promise<void> {
  let camera: CameraHandle | null = null;
  let factory: LiveFactory | null = null;
  try {
    camera = await openCamera();
    factory = await createLiveFactory();
    const live = factory.make(camera).source;
    const fac = factory;
    live.onError(() => {
      // Mid-session tracking failure: full teardown before the screen.
      session?.destroy(); // stops stage/overlay/source + camera
      session = null;
      fac.close();
      renderCameraErrorScreen(root, 'model');
    });
    const cam = camera;
    startStageSession(root, live, 'recording mode', () => {
      cam.stop();
    });
    await live.start();
    const raw = new URLSearchParams(window.location.search).get('promptSeconds');
    const override = raw === null ? NaN : Number(raw);
    mountClipRecordingDirector(
      root,
      live,
      Number.isFinite(override) ? { promptSecondsOverride: override } : {},
    );
  } catch (error) {
    camera?.stop();
    factory?.close();
    const kind = error instanceof CameraOpenError ? error.kind : 'model';
    renderCameraErrorScreen(root, kind);
  }
}

export async function bootApp(root: HTMLElement): Promise<void> {
  renderStartScreen(root);
  const config = sourceConfigFromUrl(window.location.search);
  const screen = screenFromUrl(window.location.search);

  if (screen === 'lagtest') {
    await bootLagTest(root, config);
    return;
  }
  if (screen === 'record') {
    await bootRecord(root);
    return;
  }

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

  // ?recheck=1 forgets the stored benchmark BEFORE it can influence anything.
  if (new URLSearchParams(window.location.search).has('recheck')) {
    clearDeviceCheckRecord();
  }
  // The ladder's chosen input size persists across launches (M0.9 review:
  // it used to apply for the first session only, which made the stored
  // record describe a configuration that wasn't running).
  const storedRecord = loadDeviceCheckRecord();

  let camera: CameraHandle;
  let chip: HTMLElement;
  try {
    camera = await openCamera(
      storedRecord !== null
        ? { widthPx: storedRecord.widthPx, heightPx: storedRecord.heightPx }
        : {},
    );
    chip = mountStatusChip(root, 'camera-chip', `Camera ${labelOf(camera)} · starting tracking…`);
  } catch (error) {
    const kind = error instanceof CameraOpenError ? error.kind : 'unknown';
    renderCameraErrorScreen(root, kind);
    return;
  }

  let factory: LiveFactory | null = null;
  try {
    factory = await createLiveFactory();
    const f = factory;

    /** Mid-session tracking failure: release everything, then the screen
     * (M0.9 review -- no webcam LED or ticking chip behind an error). */
    const failLive = (): void => {
      session?.destroy();
      session = null;
      if (liveTeardown !== null) {
        liveTeardown();
      } else {
        chip.remove();
        f.close();
      }
      renderCameraErrorScreen(root, 'model');
    };

    let trackingLabel = `${f.delegate}·${f.locus}`;
    const attach = async (cam: CameraHandle): Promise<InstrumentedPoseSource> => {
      const made = f.make(cam);
      const live = made.source;
      live.onError(failLive);
      const s = startStageSession(root, live, labelOf(cam), () => {
        cam.stop();
      });
      await live.start();
      trackingLabel =
        f.locus === 'worker' ? `${f.delegate}·worker(${made.mode()})` : `${f.delegate}·main`;
      s.overlay.events.push(`tracking started · ${trackingLabel}`, 0);
      return live;
    };

    let live = await attach(camera);

    // Stall watchdog: frame starvation (hidden window, compositor quirks)
    // must never be silent -- the Tracking chip would otherwise sit at
    // "0 frames" with no explanation.
    window.setTimeout(() => {
      if (live.frames() === 0) {
        chip.textContent += ' · no camera frames — is this window visible?';
        session?.overlay.events.push('no video frames after 3 s (compositor stall?)', 0);
      }
    }, 3000);

    // M0.6: first-run device check (skipped once a record exists). A bench
    // that can't finish (source stopped) aborts without saving a record.
    if (loadDeviceCheckRecord() === null) {
      try {
        let finalBench: BenchmarkSamples = { samplesS: [], maxPoses: 0 };
        const outcome = await planDeviceCheck(async (step) => {
          if (step.widthPx !== null && step.heightPx !== null) {
            session?.destroy(); // stops live + stage + overlay + that camera
            camera = await openCamera({ widthPx: step.widthPx, heightPx: step.heightPx });
            live = await attach(camera);
          }
          chip.textContent = `Device check… · ${labelOf(camera)}`;
          const bench = await collectBenchmarkSamples(live, DEVICE_CHECK_DURATION_S);
          if (bench === null) throw new BenchAborted('benchmark source stopped');
          finalBench = bench;
          return summarizeSamples(bench.samplesS).avgS;
        });

        const summary = summarizeSamples(finalBench.samplesS);
        saveDeviceCheckRecord({
          avgMs: round1(outcome.avgS * 1000),
          p99Ms: round1(summary.p99S * 1000),
          widthPx: camera.widthPx,
          heightPx: camera.heightPx,
          delegate: f.delegate,
          posesSeen: finalBench.maxPoses,
          warned: outcome.warned,
          atMs: Date.now(),
        });
        session?.overlay.events.push(
          `device check · avg ${round1(outcome.avgS * 1000).toFixed(1)} ms · ` +
            `${String(finalBench.maxPoses)} poses @ ${labelOf(camera)}`,
          0,
        );
        if (outcome.warned) renderSlowDeviceWarning(root);
      } catch (error) {
        if (!(error instanceof BenchAborted)) throw error;
        session?.overlay.events.push('device check aborted (source stopped)', 0);
        if (session?.source !== live) {
          // Something else (a dropped clip) took over mid-check; stand down.
          chip.remove();
          f.close();
          return;
        }
      }
    }

    // The stored bench is only as valid as the number of kids it saw. The
    // first time MORE kids are in frame than benchmarked, re-measure
    // passively and upgrade the record (review fix: a one-person first run
    // must never stand as the two-kid number forever).
    let upgrading = false;
    // Cached so the per-frame watcher never touches localStorage on the hot
    // path (M0.9 review); refreshed on every save.
    let cachedRecord = loadDeviceCheckRecord();
    const offUpgrade = live.onFrame((frame) => {
      if (upgrading) return;
      const posesNow = frame.poses.filter((p) => p !== null).length;
      if (!shouldUpgradeBenchmark(cachedRecord, posesNow)) return;
      upgrading = true;
      const liveNow = live;
      void (async (): Promise<void> => {
        const bench = await collectBenchmarkSamples(liveNow, DEVICE_CHECK_DURATION_S);
        const current = loadDeviceCheckRecord();
        if (bench !== null && current !== null) {
          const summary = summarizeSamples(bench.samplesS);
          // Worker era: warn only when latency blows the lag hard limit.
          const overBudget = summary.avgS > DEVICE_CHECK_WARN_S;
          const updated = {
            ...current,
            avgMs: round1(summary.avgS * 1000),
            p99Ms: round1(summary.p99S * 1000),
            posesSeen: Math.max(current.posesSeen, bench.maxPoses),
            warned: current.warned || overBudget,
            atMs: Date.now(),
          };
          saveDeviceCheckRecord(updated);
          cachedRecord = updated;
          session?.overlay.events.push(
            `device check upgraded · ${String(bench.maxPoses)} poses · ` +
              `avg ${round1(summary.avgS * 1000).toFixed(1)} ms`,
            frame.tS,
          );
          if (overBudget && !current.warned) renderSlowDeviceWarning(root);
        }
        upgrading = false;
      })();
    });

    const update = (): void => {
      const poseCount = live.latest()?.poses.filter((p) => p !== null).length ?? 0;
      chip.textContent =
        `Tracking · ${String(live.frames())} frames · ${String(poseCount)} poses · ` +
        `${labelOf(camera)} · ${trackingLabel}`;
    };
    const chipInterval = window.setInterval(update, 500);

    liveTeardown = (): void => {
      window.clearInterval(chipInterval);
      offUpgrade();
      chip.remove();
      f.close();
      liveTeardown = null;
    };
  } catch (error) {
    // Clean teardown on any failure: no webcam LED behind an error screen,
    // no stuck "Device check…" chip, and the honest problem named.
    session?.destroy();
    session = null;
    camera.stop();
    chip.remove();
    factory?.close();
    const kind = error instanceof CameraOpenError ? error.kind : 'model';
    renderCameraErrorScreen(root, kind);
  }
}

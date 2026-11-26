// App boot (M0.1–M0.5): pick the pose source from the URL, run it on the
// stage with the debug overlay, surface problems with friendly screens, and
// (dev only) mount the recorder + clip drag-and-drop.

import { openCamera, CameraOpenError, type CameraHandle } from '../tracking/camera';
import { DEVICE_CHECK_DURATION_S, DEVICE_CHECK_WARN_S } from '../motion/config';
import { MotionKit } from '../motion/kit';
import {
  createLiveTransport,
  createPoseWorker,
  WorkerPoseSource,
} from '../tracking/worker-pose-source';
import {
  clearDeviceCheckRecord,
  collectBenchmarkSamples,
  delegateOrderFromRecord,
  loadDeviceCheckRecord,
  planDeviceCheck,
  renderSlowDeviceWarning,
  saveDeviceCheckRecord,
  shouldUpgradeBenchmark,
  summarizeSamples,
  type BenchmarkSamples,
  type BenchReading,
  type DeviceCheckStep,
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
import { RollingStats } from '../debug/stats';
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

async function createLiveFactory(pin: 'GPU' | 'CPU' | null = null): Promise<LiveFactory> {
  // Delegate order: the ?delegate=cpu|gpu URL knob always wins; then an
  // explicit pin (the device check trying the other delegate); then the
  // stored check's winner; then the CPU-first default.
  // ?transport=bitmap forces the rVFC/ImageBitmap fallback transport.
  const params = new URLSearchParams(window.location.search);
  const rawDelegate = params.get('delegate');
  const pinned: readonly ('GPU' | 'CPU')[] | undefined =
    rawDelegate === 'cpu'
      ? ['CPU']
      : rawDelegate === 'gpu'
        ? ['GPU']
        : pin === 'GPU'
          ? ['GPU', 'CPU']
          : pin === 'CPU'
            ? ['CPU', 'GPU']
            : delegateOrderFromRecord(loadDeviceCheckRecord());
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
  // The SHIPPED motion kit runs on the stage too, so the overlay's "motion
  // kit" row and event log measure the real pipeline, not a placeholder.
  const kit = new MotionKit(() => source.latest()?.tS ?? 0);
  const kitMs = new RollingStats(120);
  const overlay = mountDebugOverlay(root, {
    source,
    stage,
    sourceLabel: label,
    motionMs: () => (kitMs.count() === 0 ? null : { avgMs: kitMs.mean(), p99Ms: kitMs.p99() }),
  });
  const offKitEvents = (['jump', 'step', 'squat', 'still', 'moving', 'armsUp'] as const).map(
    (name) =>
      kit.on(name, (event) => {
        overlay.events.push(`${event.name} · slot ${String(event.slot)}`, event.tS);
      }),
  );
  const offKitFrames = source.onFrame((frame) => {
    const t0 = performance.now();
    const playersFrame = kit.update(frame.tS, frame.poses);
    kitMs.push(performance.now() - t0);
    for (const t of playersFrame.transitions) {
      overlay.events.push(`slot ${String(t.slot)}: ${t.from} → ${t.to}`, frame.tS);
    }
  });
  const s: StageSession = {
    source,
    stage,
    overlay,
    destroy(): void {
      offKitFrames();
      for (const off of offKitEvents) off();
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

  // The kid flow (M1.10): start-up check -> warm-up -> game -> session timer.
  // `/` keeps the debug stage underneath until the M3 launcher replaces it.
  if (new URLSearchParams(window.location.search).has('play')) {
    try {
      const { bootPlay } = await import('./flow');
      await bootPlay(root);
    } catch {
      renderCameraErrorScreen(root, 'model');
    }
    return;
  }

  // Direct game mount (M1.9): desk play + e2e. The guided flow is M1.10.
  const gameId = new URLSearchParams(window.location.search).get('game');
  if (gameId !== null) {
    try {
      const { bootGame } = await import('./game-route');
      await bootGame(root, gameId);
    } catch {
      renderCameraErrorScreen(root, 'model'); // friendly "couldn't load" screen
    }
    return;
  }

  // Keep the start screen fresh (playtest round 4: "I don't see the
  // changes"): the PWA updates in the background, so an already-open page
  // keeps running old code until a reload. On the START SCREEN PATH ONLY
  // (never mid-game), reload once when a new service worker takes control,
  // and nudge the browser to check for one now. First-ever installs have no
  // previous controller and are skipped (nothing stale to replace).
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller !== null) {
    let reloadedForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });
    void navigator.serviceWorker.getRegistration().then((reg) => reg?.update());
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
    // The CURRENT factory: the device check may swap it to try the other
    // delegate, so closures read this binding, never a snapshot.
    let fac = factory;

    /** Mid-session tracking failure: release everything, then the screen
     * (M0.9 review -- no webcam LED or ticking chip behind an error). */
    const failLive = (): void => {
      session?.destroy();
      session = null;
      if (liveTeardown !== null) {
        liveTeardown();
      } else {
        chip.remove();
        fac.close();
      }
      renderCameraErrorScreen(root, 'model');
    };

    let trackingLabel = `${fac.delegate}·${fac.locus}`;
    const attach = async (cam: CameraHandle): Promise<InstrumentedPoseSource> => {
      const made = fac.make(cam);
      const live = made.source;
      live.onError(failLive);
      const s = startStageSession(root, live, labelOf(cam), () => {
        cam.stop();
      });
      await live.start();
      trackingLabel =
        fac.locus === 'worker' ? `${fac.delegate}·worker(${made.mode()})` : `${fac.delegate}·main`;
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
    // When the default delegate blows the lag WARN line, the OTHER delegate
    // gets one bench and wins only if faster with rendering intact (playtest
    // fix 2026-11-26: a 98 ms CPU machine must at least TRY its GPU).
    if (loadDeviceCheckRecord() === null) {
      try {
        let finalBench: BenchmarkSamples = { samplesS: [], maxPoses: 0 };
        let currentDelegate: 'GPU' | 'CPU' | null = null;

        const cameraSizeOf = (step: DeviceCheckStep): { widthPx?: number; heightPx?: number } =>
          step.widthPx !== null && step.heightPx !== null
            ? { widthPx: step.widthPx, heightPx: step.heightPx }
            : {};

        const runStep = async (step: DeviceCheckStep): Promise<BenchReading> => {
          if (step.delegate !== currentDelegate) {
            session?.destroy(); // stops live + stage + overlay + that camera
            fac.close();
            currentDelegate = step.delegate;
            let swapped: LiveFactory;
            try {
              swapped = await createLiveFactory(step.delegate);
            } catch {
              // This delegate cannot start at all: restore the default and
              // report an infinitely slow reading (the planner keeps CPU).
              currentDelegate = null;
              swapped = await createLiveFactory(null);
              fac = swapped;
              factory = swapped;
              camera = await openCamera(cameraSizeOf(step));
              live = await attach(camera);
              return { avgS: Infinity, renderFps: 0 };
            }
            fac = swapped;
            factory = swapped;
            camera = await openCamera(cameraSizeOf(step));
            live = await attach(camera);
          } else if (step.widthPx !== null && step.heightPx !== null) {
            session?.destroy();
            camera = await openCamera({ widthPx: step.widthPx, heightPx: step.heightPx });
            live = await attach(camera);
          }
          chip.textContent = `Device check… · ${labelOf(camera)} · ${fac.delegate}`;
          const bench = await collectBenchmarkSamples(live, DEVICE_CHECK_DURATION_S);
          if (bench === null) throw new BenchAborted('benchmark source stopped');
          finalBench = bench;
          return {
            avgS: summarizeSamples(bench.samplesS).avgS,
            renderFps: session?.stage.actualFps() ?? 0,
          };
        };

        const urlPinned = new URLSearchParams(window.location.search).get('delegate') !== null;
        const outcome = await planDeviceCheck(runStep, undefined, undefined, undefined, {
          altDelegate: urlPinned ? null : fac.delegate === 'CPU' ? 'GPU' : 'CPU',
        });

        const summary = summarizeSamples(finalBench.samplesS);
        saveDeviceCheckRecord({
          avgMs: round1(outcome.avgS * 1000),
          p99Ms: round1(summary.p99S * 1000),
          widthPx: camera.widthPx,
          heightPx: camera.heightPx,
          delegate: fac.delegate,
          posesSeen: finalBench.maxPoses,
          warned: outcome.warned,
          atMs: Date.now(),
        });
        session?.overlay.events.push(
          `device check · avg ${round1(outcome.avgS * 1000).toFixed(1)} ms · ` +
            `${String(finalBench.maxPoses)} poses @ ${labelOf(camera)} · ${fac.delegate}`,
          0,
        );
        if (outcome.warned) renderSlowDeviceWarning(root);
      } catch (error) {
        if (!(error instanceof BenchAborted)) throw error;
        session?.overlay.events.push('device check aborted (source stopped)', 0);
        if (session?.source !== live) {
          // Something else (a dropped clip) took over mid-check; stand down.
          chip.remove();
          fac.close();
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
      fac.close();
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

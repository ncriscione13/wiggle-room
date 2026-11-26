// Device check (M0.6): on first run, benchmark two-kid tracking for 5 s.
// Above the 20 ms budget the app reduces camera input size down a ladder
// before ever bothering a parent; only when the smallest size is still slow
// does a parent-facing warning appear. The result is stored so later launches
// skip straight to playing.

import {
  CAMERA_FALLBACK_HEIGHTS_PX,
  CAMERA_FALLBACK_WIDTHS_PX,
  DEVICE_CHECK_MIN_RENDER_HZ,
  DEVICE_CHECK_TRACKING_MAX_S,
  DEVICE_CHECK_WARN_S,
} from '../motion/config';
import type { PoseSource } from '../tracking/pose-source';
import { colors, px, typography } from '../ui/theme';

// --- Benchmark pieces --------------------------------------------------------

export interface SampleSummary {
  avgS: number;
  p99S: number;
  count: number;
}

export function summarizeSamples(samplesS: readonly number[]): SampleSummary {
  if (samplesS.length === 0) return { avgS: 0, p99S: 0, count: 0 };
  let sum = 0;
  for (const s of samplesS) sum += s;
  const sorted = [...samplesS].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1);
  return {
    avgS: sum / samplesS.length,
    p99S: sorted[Math.max(0, idx)] ?? 0,
    count: samplesS.length,
  };
}

/** Collects inference times until `durationS` of frame time has passed. */
export interface BenchmarkSamples {
  samplesS: number[];
  /** Most simultaneous poses seen during the bench -- the record stores it so
   * a one-person first run is never mistaken for a two-kid measurement. */
  maxPoses: number;
}

/**
 * Collects inference times until `durationS` of frame time has passed.
 * Resolves null if the source stops feeding frames (error, session swap)
 * before then -- callers must treat null as "no valid benchmark", never save.
 */
export function collectBenchmarkSamples(
  source: PoseSource,
  durationS: number,
  maxWallMs: number = durationS * 4000,
): Promise<BenchmarkSamples | null> {
  return new Promise((resolve) => {
    const samplesS: number[] = [];
    let maxPoses = 0;
    let startT: number | null = null;
    const fuse = setTimeout(() => {
      off();
      resolve(null);
    }, maxWallMs);
    const off = source.onFrame((frame) => {
      startT ??= frame.tS;
      samplesS.push(frame.inferenceS);
      maxPoses = Math.max(maxPoses, frame.poses.filter((p) => p !== null).length);
      if (frame.tS - startT >= durationS) {
        clearTimeout(fuse);
        off();
        resolve({ samplesS, maxPoses });
      }
    });
  });
}

/** A later frame shows more kids than the stored bench ever saw -> the stored
 * numbers under-measure and must be re-taken (passively, mid-session). */
export function shouldUpgradeBenchmark(
  record: DeviceCheckRecord | null,
  posesInFrame: number,
): boolean {
  return record !== null && posesInFrame > record.posesSeen;
}

// --- Decision flow -----------------------------------------------------------

export interface FallbackSize {
  widthPx: number;
  heightPx: number;
}

export const CAMERA_FALLBACK_LADDER: readonly FallbackSize[] = CAMERA_FALLBACK_WIDTHS_PX.map(
  (widthPx, i) => ({ widthPx, heightPx: CAMERA_FALLBACK_HEIGHTS_PX[i] ?? widthPx * 0.75 }),
);

export interface DeviceCheckStep {
  index: number;
  /** null = the default (full) camera size. */
  widthPx: number | null;
  heightPx: number | null;
  /** Explicit delegate for this step; null = the factory's default order. */
  delegate: 'GPU' | 'CPU' | null;
}

/** What one benchmark run reports back. A delegate that could not start at
 * all reads as { avgS: Infinity, renderFps: 0 } (never throw for that -- a
 * thrown error means the whole check must abort). */
export interface BenchReading {
  avgS: number;
  /** Render fps observed while this bench ran -- how much drawing suffered. */
  renderFps: number;
}

export interface DeviceCheckOutcome {
  avgS: number;
  stepsTried: number;
  finalStep: DeviceCheckStep;
  warned: boolean;
  /** Delegate the app should keep using; null = the factory default order. */
  delegate: 'GPU' | 'CPU' | null;
}

export interface DelegateOptions {
  /** The other delegate to try when the default blows the WARN line; null
   * disables the phase (e.g. a ?delegate= URL pin is in force). */
  altDelegate?: 'GPU' | 'CPU' | null;
  minRenderFps?: number;
}

/**
 * Walks the benchmark. Full size on the default delegate first; when that
 * blows the lag WARN line (`warnS` -- total lag past the 120 ms hard limit),
 * the OTHER delegate gets one bench and wins only if it is faster AND kept
 * rendering above `minRenderFps` (M0.9 measured GPU-in-worker starving the
 * renderer; that finding is now a per-machine measurement, not a ban). Then
 * the camera-size ladder runs while above the TARGET (`maxS`, the
 * aspirational 20 ms), on whichever delegate won.
 */
export async function planDeviceCheck(
  run: (step: DeviceCheckStep) => Promise<BenchReading>,
  ladder: readonly FallbackSize[] = CAMERA_FALLBACK_LADDER,
  maxS: number = DEVICE_CHECK_TRACKING_MAX_S,
  warnS: number = DEVICE_CHECK_WARN_S,
  options: DelegateOptions = {},
): Promise<DeviceCheckOutcome> {
  const alt = options.altDelegate ?? null;
  const minRenderFps = options.minRenderFps ?? DEVICE_CHECK_MIN_RENDER_HZ;

  let delegate: 'GPU' | 'CPU' | null = null;
  let step: DeviceCheckStep = { index: 0, widthPx: null, heightPx: null, delegate: null };
  let avgS = (await run(step)).avgS;

  if (avgS > warnS && alt !== null) {
    const altStep: DeviceCheckStep = { index: 0, widthPx: null, heightPx: null, delegate: alt };
    const altReading = await run(altStep);
    if (altReading.avgS < avgS && altReading.renderFps >= minRenderFps) {
      delegate = alt;
      step = altStep;
      avgS = altReading.avgS;
    } else {
      // Put the default back (the alt bench reconfigured the app) and use
      // the fresh reading -- never a stale number from before the swap.
      step = { index: 0, widthPx: null, heightPx: null, delegate: null };
      avgS = (await run(step)).avgS;
    }
  }

  let tried = 0;
  while (avgS > maxS && tried < ladder.length) {
    const size = ladder[tried];
    tried += 1;
    if (size === undefined) break;
    step = { index: tried, widthPx: size.widthPx, heightPx: size.heightPx, delegate };
    avgS = (await run(step)).avgS;
  }
  return { avgS, stepsTried: tried, finalStep: step, warned: avgS > warnS, delegate };
}

// --- Stored record -----------------------------------------------------------

// Storage lives in ./storage (shared with profiles); re-exported here so
// existing imports keep working.
export { browserStore, type KeyValueStore } from './storage';
import { browserStore, type KeyValueStore } from './storage';

const RECORD_KEY = 'wiggle.device-check.v1';

export interface DeviceCheckRecord {
  avgMs: number;
  p99Ms: number;
  widthPx: number;
  heightPx: number;
  delegate: string;
  /** Most simultaneous poses the benchmark actually saw (validity marker). */
  posesSeen: number;
  warned: boolean;
  atMs: number;
}

export function loadDeviceCheckRecord(
  store: KeyValueStore = browserStore,
): DeviceCheckRecord | null {
  const raw = store.get(RECORD_KEY);
  if (raw === null || raw === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'avgMs' in parsed) {
      return parsed as DeviceCheckRecord;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDeviceCheckRecord(
  record: DeviceCheckRecord,
  store: KeyValueStore = browserStore,
): void {
  store.set(RECORD_KEY, JSON.stringify(record));
}

/** `?recheck=1` (tuning): forget the stored benchmark so the next boot runs
 * the full check + input-size ladder again under current conditions. */
export function clearDeviceCheckRecord(store: KeyValueStore = browserStore): void {
  store.set(RECORD_KEY, '');
}

/** Boot-time delegate order: the stored check's winner first, the other as
 * fallback. Undefined (no record / unknown value) keeps the factory default. */
export function delegateOrderFromRecord(
  record: DeviceCheckRecord | null,
): readonly ('GPU' | 'CPU')[] | undefined {
  if (record?.delegate === 'GPU') return ['GPU', 'CPU'];
  if (record?.delegate === 'CPU') return ['CPU', 'GPU'];
  return undefined;
}

// --- Parent-facing warning ---------------------------------------------------

export const SLOW_DEVICE_COPY = {
  title: 'This computer might struggle with two players',
  body: 'Tracking is a little slow here, so the games may feel less snappy. Things that help:',
  tips: [
    'Plug the laptop into power (battery mode slows it down).',
    'Close other apps and browser tabs, especially video calls.',
    'Use Chrome with hardware acceleration turned on.',
    'A smaller camera picture is already in use — a faster computer fixes the rest.',
  ],
  dismiss: 'Got it — play anyway',
} as const;

export function renderSlowDeviceWarning(root: HTMLElement): void {
  const screen = document.createElement('div');
  screen.setAttribute('data-testid', 'device-warning');
  Object.assign(screen.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '30',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: px(14),
    background: colors.surfaceNight,
    color: colors.textSoft,
    fontFamily: typography.family,
    textAlign: 'center',
    padding: px(32),
  });

  const title = document.createElement('h2');
  title.textContent = SLOW_DEVICE_COPY.title;
  Object.assign(title.style, { margin: '0', fontSize: px(typography.subtitlePx + 4) });

  const body = document.createElement('p');
  body.textContent = SLOW_DEVICE_COPY.body;
  Object.assign(body.style, {
    margin: '0',
    color: colors.textDim,
    fontSize: px(typography.bodyPx),
  });

  const list = document.createElement('ul');
  Object.assign(list.style, {
    margin: '0',
    textAlign: 'left',
    color: colors.textDim,
    fontSize: px(typography.bodyPx),
    maxWidth: px(760),
  });
  for (const tip of SLOW_DEVICE_COPY.tips) {
    const li = document.createElement('li');
    li.textContent = tip;
    list.appendChild(li);
  }

  const dismiss = document.createElement('button');
  dismiss.textContent = SLOW_DEVICE_COPY.dismiss;
  Object.assign(dismiss.style, {
    marginTop: px(10),
    padding: `${px(14)} ${px(36)}`,
    fontSize: px(typography.bodyPx),
    fontFamily: typography.family,
    color: colors.surfaceNight,
    background: colors.mint,
    border: 'none',
    borderRadius: px(16),
    cursor: 'pointer',
  });
  dismiss.addEventListener('click', () => {
    screen.remove();
  });

  screen.append(title, body, list, dismiss);
  root.appendChild(screen);
}

// Device check (M0.6): on first run, benchmark two-kid tracking for 5 s.
// Above the 20 ms budget the app reduces camera input size down a ladder
// before ever bothering a parent; only when the smallest size is still slow
// does a parent-facing warning appear. The result is stored so later launches
// skip straight to playing.

import {
  CAMERA_FALLBACK_HEIGHTS_PX,
  CAMERA_FALLBACK_WIDTHS_PX,
  DEVICE_CHECK_TRACKING_MAX_S,
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
}

export interface DeviceCheckOutcome {
  avgS: number;
  stepsTried: number;
  finalStep: DeviceCheckStep;
  warned: boolean;
}

/**
 * Walks the benchmark: full size first, then down the ladder while too slow.
 * `run` performs one benchmark at the given size and resolves its average
 * tracking seconds per frame.
 */
export async function planDeviceCheck(
  run: (step: DeviceCheckStep) => Promise<number>,
  ladder: readonly FallbackSize[] = CAMERA_FALLBACK_LADDER,
  maxS: number = DEVICE_CHECK_TRACKING_MAX_S,
): Promise<DeviceCheckOutcome> {
  let step: DeviceCheckStep = { index: 0, widthPx: null, heightPx: null };
  let avgS = await run(step);
  let tried = 0;
  while (avgS > maxS && tried < ladder.length) {
    const size = ladder[tried];
    tried += 1;
    if (size === undefined) break;
    step = { index: tried, widthPx: size.widthPx, heightPx: size.heightPx };
    avgS = await run(step);
  }
  return { avgS, stepsTried: tried, finalStep: step, warned: avgS > maxS };
}

// --- Stored record -----------------------------------------------------------

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage with every access guarded (private mode, blocked storage...). */
export const browserStore: KeyValueStore = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable: the check will simply run again next launch.
    }
  },
};

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
  if (raw === null) return null;
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

// npm run fetch-models (task 0.5): one-time download of the pose model into
// public/models/, so the app serves it from its own origin. Dev-time only;
// the app itself never fetches from the network (CLAUDE.md rule 8).

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// PLAN 0.5's documented URL. If MediaPipe moves it, check the Pose Landmarker
// docs and update here + docs/DECISIONS.md.
export const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task';

export const MODEL_DEST = join('public', 'models', 'pose_landmarker_lite.task');

/** The lite model is ~5.5 MB; anything under this is a failed/garbage download. */
export const MODEL_MIN_BYTES = 1_000_000;

/** Returns an error message, or null when the buffer looks like a real model. */
export function validateModelBuffer(bytes: Uint8Array): string | null {
  if (bytes.byteLength < MODEL_MIN_BYTES) {
    return `too small (${String(bytes.byteLength)} bytes) -- likely a failed download`;
  }
  // A .task file is a zip container. The real pose_landmarker_lite.task carries
  // a short prefix before the "PK" magic (observed: 2 zero bytes), so scan the
  // first few bytes rather than requiring PK at offset 0.
  let hasZipMagic = false;
  for (let i = 0; i < 8 && i + 1 < bytes.byteLength; i += 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b) {
      hasZipMagic = true;
      break;
    }
  }
  if (!hasZipMagic) {
    return 'not a .task (zip) container -- likely an error page instead of the model';
  }
  return null;
}

export async function fetchModel(
  options: { force?: boolean } = {},
): Promise<'kept' | 'downloaded'> {
  if (options.force !== true) {
    try {
      const existing = await stat(MODEL_DEST);
      if (existing.size >= MODEL_MIN_BYTES) {
        const bytes = new Uint8Array(await readFile(MODEL_DEST));
        if (validateModelBuffer(bytes) === null) return 'kept';
      }
    } catch {
      // Not there yet -- download below.
    }
  }

  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`download failed: HTTP ${String(response.status)} from ${MODEL_URL}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const problem = validateModelBuffer(bytes);
  if (problem !== null) {
    throw new Error(`downloaded model rejected: ${problem}`);
  }

  await mkdir(dirname(MODEL_DEST), { recursive: true });
  await writeFile(MODEL_DEST, bytes);
  return 'downloaded';
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const force = process.argv.includes('--force');
  fetchModel({ force })
    .then((outcome) => {
      console.log(
        outcome === 'kept'
          ? `fetch-models: ${MODEL_DEST} already present and valid (use --force to re-download)`
          : `fetch-models: downloaded -> ${MODEL_DEST}`,
      );
    })
    .catch((error: unknown) => {
      console.error('fetch-models failed:', error);
      process.exit(1);
    });
}

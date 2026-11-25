// CLI (task 0.6): writes every synthetic clip to test/clips/synthetic/.
// Clips are generated artifacts (gitignored): deterministic from the clip
// name, so regenerating always produces the same bytes.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ClipFile } from '../../src/tracking/clip-format.ts';
import { buildClip, listClipNames } from './clips.ts';

export const SYNTHETIC_DIR = join('test', 'clips', 'synthetic');

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Rounds coordinates to 4 decimals to keep the long clips reasonably small. */
export function compactClip(clip: ClipFile): ClipFile {
  return {
    ...clip,
    frames: clip.frames.map((f) => ({
      tS: round4(f.tS),
      poses: f.poses.map((pose) =>
        pose === null
          ? null
          : pose.map(([x, y, z, v]): [number, number, number, number] => [
              round4(x),
              round4(y),
              round4(z),
              round4(v),
            ]),
      ),
    })),
  };
}

export async function writeAllClips(outDir: string = SYNTHETIC_DIR): Promise<string[]> {
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const name of listClipNames()) {
    const file = join(outDir, `${name}.json`);
    const clip = compactClip(buildClip(name));
    await writeFile(file, JSON.stringify(clip));
    written.push(file);
  }
  return written;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  writeAllClips()
    .then((files) => {
      console.log(`clip-synth: wrote ${String(files.length)} clips -> ${SYNTHETIC_DIR}`);
    })
    .catch((error: unknown) => {
      console.error('clip-synth failed:', error);
      process.exit(1);
    });
}

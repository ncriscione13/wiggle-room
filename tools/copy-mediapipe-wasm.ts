// Postinstall step (task 0.5): copy the MediaPipe wasm runtime out of
// node_modules into public/mediapipe/, so the served app loads it from its own
// origin -- never a CDN (offline + privacy, CLAUDE.md rule 8).

import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const WASM_SOURCE = join('node_modules', '@mediapipe', 'tasks-vision', 'wasm');
export const WASM_DEST = join('public', 'mediapipe');

/** Copies every wasm runtime file; returns the copied file names. */
export async function copyMediapipeWasm(
  destDir: string = WASM_DEST,
  sourceDir: string = WASM_SOURCE,
): Promise<string[]> {
  await mkdir(destDir, { recursive: true });
  const files = await readdir(sourceDir);
  const copied: string[] = [];
  for (const file of files) {
    await copyFile(join(sourceDir, file), join(destDir, file));
    copied.push(file);
  }
  return copied;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  copyMediapipeWasm()
    .then((copied) => {
      console.log(`copy-mediapipe-wasm: ${String(copied.length)} files -> ${WASM_DEST}`);
    })
    .catch((error: unknown) => {
      console.error('copy-mediapipe-wasm failed:', error);
      process.exit(1);
    });
}

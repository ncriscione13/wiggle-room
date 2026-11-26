// npm run audio (M1.9): renders the generated CC0 loops + sfx into
// public/audio/ with a manifest the AudioBus loads. Committed artifacts;
// CI never runs this.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderMusic, renderSfx, toWav } from './synth.ts';

const OUT_DIR = join('public', 'audio');

const MUSIC = [
  { id: 'freeze-mid', bpm: 108 },
  { id: 'freeze-slow', bpm: 72 },
  { id: 'freeze-fast', bpm: 132 },
] as const;
const SFX = ['drum', 'chime', 'swirl', 'fanfare'] as const;

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = {
    music: {} as Record<string, { file: string; loop: boolean; bpm: number }>,
    sfx: {} as Record<string, { file: string }>,
  };
  for (const { id, bpm } of MUSIC) {
    const file = `${id}.wav`;
    writeFileSync(join(OUT_DIR, file), toWav(renderMusic(id)));
    manifest.music[id] = { file, loop: true, bpm };
    console.log(`  ${file}`);
  }
  for (const id of SFX) {
    const file = `${id}.wav`;
    writeFileSync(join(OUT_DIR, file), toWav(renderSfx(id)));
    manifest.sfx[id] = { file };
    console.log(`  ${file}`);
  }
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('audio-gen: done');
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();

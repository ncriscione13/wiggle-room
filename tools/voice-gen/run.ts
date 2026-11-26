// npm run voice (M1.6): renders every wording in voice/lines.en.csv to a clip
// with kokoro-js (Kokoro-82M, Apache-2.0 weights), into public/voice/clips/,
// plus a manifest the runtime narrator loads. Idempotent: existing clips are
// kept unless --force. Compresses to .ogg when ffmpeg is on PATH, else ships
// .wav. Dev-time only; CI never runs this (clips are committed).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { KokoroTTS } from 'kokoro-js';
import { parseLinesCsv } from '../../src/voice/lines-csv.ts';

const CSV_PATH = join('voice', 'lines.en.csv');
const OUT_DIR = join('public', 'voice', 'clips');
const MANIFEST_PATH = join('public', 'voice', 'manifest.json');
const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const VOICE = 'af_heart';
/** The slow demo line literally speaks slower. */
const SLOW_IDS = new Set(['warmup.slow-demo']);
const SLOW_SPEED = 0.85;

interface ManifestWording {
  file: string;
  text: string;
  durationS: number;
}
interface Manifest {
  voice: string;
  lines: Record<string, { priority: number; cooldownS: number; wordings: ManifestWording[] }>;
}

function hasFfmpeg(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function loadOldManifest(): Manifest | null {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const lines = parseLinesCsv(readFileSync(CSV_PATH, 'utf8'));
  mkdirSync(OUT_DIR, { recursive: true });
  const old = force ? null : loadOldManifest();
  const useOgg = hasFfmpeg();
  console.log(`voice-gen: ${String(lines.size)} lines · ${useOgg ? 'ogg (ffmpeg)' : 'wav'}`);

  let tts: KokoroTTS | null = null;
  const manifest: Manifest = { voice: VOICE, lines: {} };
  let rendered = 0;
  let kept = 0;

  for (const def of lines.values()) {
    const wordings: ManifestWording[] = [];
    for (const [idx, text] of def.wordings.entries()) {
      const base = `${def.id}.${String(idx)}`;
      const file = `${base}.${useOgg ? 'ogg' : 'wav'}`;
      const outPath = join(OUT_DIR, file);
      const previous = old?.lines[def.id]?.wordings[idx];
      if (!force && existsSync(outPath) && previous !== undefined && previous.text === text) {
        wordings.push({ file, text, durationS: previous.durationS });
        kept += 1;
        continue;
      }
      tts ??= await KokoroTTS.from_pretrained(MODEL_ID, { dtype: 'q8' });
      const speed = SLOW_IDS.has(def.id) ? SLOW_SPEED : 1;
      const audio = await tts.generate(text, { voice: VOICE, speed });
      const durationS = audio.audio.length / audio.sampling_rate;
      const wavPath = join(OUT_DIR, `${base}.wav`);
      await audio.save(wavPath);
      if (useOgg) {
        const res = spawnSync(
          'ffmpeg',
          ['-y', '-i', wavPath, '-c:a', 'libvorbis', '-q:a', '3', outPath],
          {
            stdio: 'ignore',
          },
        );
        if (res.status === 0) rmSync(wavPath);
        else throw new Error(`ffmpeg failed for ${base}`);
      }
      wordings.push({ file, text, durationS: Math.round(durationS * 1000) / 1000 });
      rendered += 1;
      console.log(`  ${file}  ${durationS.toFixed(2)}s`);
    }
    manifest.lines[def.id] = { priority: def.priority, cooldownS: def.cooldownS, wordings };
  }

  // 2-space indent + trailing newline so `prettier --check` passes on the
  // committed artifact.
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(
    `voice-gen: done · ${String(rendered)} rendered · ${String(kept)} kept · manifest -> ${MANIFEST_PATH}`,
  );
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error: unknown) => {
    console.error('voice-gen failed:', error);
    process.exit(1);
  });
}

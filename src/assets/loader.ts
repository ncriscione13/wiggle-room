// The local asset loader (task 0.7): the ONLY file in src/ allowed to call
// fetch (guardrail-enforced), and it only ever fetches same-origin relative
// URLs built by src/assets/paths.ts. No runtime network, ever.

import { validateClipFile, type ClipFile } from '../tracking/clip-format';
import { assetUrl } from './paths';

const CLIP_NAME = /^[a-z0-9][a-z0-9-]*$/;

function looksLikeClipFile(value: unknown): value is ClipFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { frames?: unknown }).frames)
  );
}

const SAFE_RELATIVE = /^[a-z0-9][a-z0-9\-./]*$/i;

function assertSafeRelative(path: string): void {
  if (!SAFE_RELATIVE.test(path) || path.includes('..') || path.includes('://')) {
    throw new Error(`refusing suspicious asset path "${path}"`);
  }
}

/** Same-origin JSON (e.g. the voice manifest). */
export async function loadJson<T>(path: string): Promise<T> {
  assertSafeRelative(path);
  const response = await fetch(assetUrl(path));
  if (!response.ok) {
    throw new Error(`asset "${path}" fetch failed: HTTP ${String(response.status)}`);
  }
  return (await response.json()) as T;
}

/** Same-origin binary (e.g. a voice clip for Web Audio decoding). */
export async function loadArrayBuffer(path: string): Promise<ArrayBuffer> {
  assertSafeRelative(path);
  const response = await fetch(assetUrl(path));
  if (!response.ok) {
    throw new Error(`asset "${path}" fetch failed: HTTP ${String(response.status)}`);
  }
  return response.arrayBuffer();
}

export async function loadClipJson(name: string): Promise<ClipFile> {
  if (!CLIP_NAME.test(name)) {
    throw new Error(`refusing suspicious clip name "${name}"`);
  }
  const url = assetUrl(`clips/${name}.json`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`clip "${name}" fetch failed: HTTP ${String(response.status)}`);
  }
  const parsed: unknown = await response.json();
  if (!looksLikeClipFile(parsed)) {
    throw new Error(`clip "${name}" is not a clip file`);
  }
  const problems = validateClipFile(parsed);
  if (problems.length > 0) {
    throw new Error(`clip "${name}" invalid: ${problems[0] ?? 'unknown problem'}`);
  }
  return parsed;
}

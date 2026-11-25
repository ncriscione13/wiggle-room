import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClipFile } from '../tracking/clip-format';
import { loadClipJson } from './loader';

// Task 0.7: the local asset loader is the ONLY src/ file allowed to fetch
// (guardrail-enforced), and it only ever fetches same-origin relative URLs.

const validClip: ClipFile = {
  version: 1,
  name: 'test-clip',
  kind: 'synthetic',
  nominalFps: 30,
  frames: [
    { tS: 0, poses: [null] },
    { tS: 0.033, poses: [null] },
  ],
};

function stubFetch(handler: (url: string) => Response | Promise<Response>): () => string[] {
  const calls: string[] = [];
  vi.stubGlobal('fetch', (input: unknown) => {
    const url = typeof input === 'string' ? input : String(input);
    calls.push(url);
    return Promise.resolve(handler(url));
  });
  return () => calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadClipJson (task 0.7)', () => {
  it('fetches the clip from a same-origin relative URL and validates it', async () => {
    const calls = stubFetch(() => new Response(JSON.stringify(validClip)));
    const clip = await loadClipJson('still-30s');
    expect(clip.name).toBe('test-clip');
    expect(calls()).toEqual(['/clips/still-30s.json']);
  });

  it('refuses suspicious clip names without fetching', async () => {
    const calls = stubFetch(() => new Response('{}'));
    await expect(loadClipJson('../etc')).rejects.toThrow(/clip name/i);
    expect(calls()).toEqual([]);
  });

  it('throws a clear error on HTTP failure', async () => {
    stubFetch(() => new Response('nope', { status: 404 }));
    await expect(loadClipJson('missing')).rejects.toThrow(/404/);
  });

  it('throws a clear error when the JSON is not a valid clip', async () => {
    stubFetch(() => new Response(JSON.stringify({ hello: 'world' })));
    await expect(loadClipJson('bogus')).rejects.toThrow(/clip/i);
  });
});

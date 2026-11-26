import { expect, test } from '@playwright/test';

// M1.6: the rendered voice assets ship with the app -- the manifest parses
// and the first clip of every priority class is actually served.

test('voice manifest and clips are served', async ({ request }) => {
  const res = await request.get('/voice/manifest.json');
  expect(res.ok()).toBeTruthy();
  const manifest = (await res.json()) as {
    lines: Record<string, { wordings: { file: string; durationS: number }[] }>;
  };
  const ids = Object.keys(manifest.lines);
  expect(ids.length).toBeGreaterThanOrEqual(30);

  for (const id of ['startup.feet-out', 'freeze.freeze', 'warmup.stand', 'wrap.goodbye']) {
    const line = manifest.lines[id];
    expect(line, id).toBeDefined();
    const first = line?.wordings[0];
    expect(first?.durationS ?? 0).toBeGreaterThan(0.3);
    const clip = await request.get(`/voice/clips/${first?.file ?? ''}`);
    expect(clip.ok(), id).toBeTruthy();
    expect((await clip.body()).byteLength).toBeGreaterThan(5000);
  }
});

import { expect, test, type Page } from '@playwright/test';

// M1.9 acceptance: a full Freeze Dance round, two players, keyboard
// stand-ins (CLAUDE.md rule 11). Slot 0 = ArrowLeft before Tab, slot 1 =
// ArrowRight after Tab; releasing = freezing.

const hooks = (page: Page): Promise<WiggleHooks | undefined> =>
  page.evaluate(() => window.__wiggle);

test('two kids play a full round with keyboard stand-ins', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?game=freeze&input=keyboard&players=2&freezes=2&intro=1');
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await page.waitForFunction(() => window.__wiggle !== undefined, undefined, {
    timeout: 60_000,
  });

  // Both kids start dancing.
  await page.keyboard.down('ArrowLeft'); // slot 0
  await page.keyboard.press('Tab');
  await page.keyboard.down('ArrowRight'); // slot 1

  // Dance meters fill while moving.
  await page.waitForFunction(
    () => (window.__wiggle?.meters[0] ?? 0) > 0.2 && (window.__wiggle?.meters[1] ?? 0) > 0.2,
    undefined,
    { timeout: 30_000 },
  );

  for (let stop = 0; stop < 2; stop += 1) {
    await page.waitForFunction(() => window.__wiggle?.phase === 'stop', undefined, {
      timeout: 60_000,
    });
    // Freeze! Both kids hold still within the grace window.
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(
      () => window.__wiggle?.phase === 'dance' || window.__wiggle?.done === true,
      undefined,
      { timeout: 30_000 },
    );
    const h = await hooks(page);
    if (h?.done !== true) {
      // Music is back: dance again.
      await page.keyboard.down('ArrowLeft');
      await page.keyboard.press('Tab'); // back to slot 1
      await page.keyboard.down('ArrowRight');
    }
  }

  await page.waitForFunction(() => window.__wiggle?.done === true, undefined, {
    timeout: 60_000,
  });

  // Every freeze earned both kids a star (plus the snowstorm bonus).
  const final = await hooks(page);
  expect(final?.stars[0] ?? 0).toBeGreaterThanOrEqual(2);
  expect(final?.stars[1] ?? 0).toBeGreaterThanOrEqual(2);

  // Results screen with per-kid stars and the replay hint.
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('stars-0')).toContainText('★');
  await expect(page.getByTestId('stars-1')).toContainText('★');
  await expect(page.getByTestId('results')).toContainText('Arms up');
});

test('one kid alone: the round still works, no co-op bonus required', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?game=freeze&input=keyboard&players=1&freezes=1&intro=1');
  await page.waitForFunction(() => window.__wiggle !== undefined, undefined, {
    timeout: 60_000,
  });
  await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__wiggle?.phase === 'stop', undefined, {
    timeout: 60_000,
  });
  await page.keyboard.up('ArrowLeft');
  await page.waitForFunction(() => window.__wiggle?.done === true, undefined, {
    timeout: 60_000,
  });
  const final = await hooks(page);
  expect(final?.stars[0] ?? 0).toBe(1);
  await expect(page.getByTestId('results')).toBeVisible();
});

// L1 Word Freeze: with a grade on, every third stop shows a big word card,
// the narrator reveals it, and the caption mirrors the reveal.
test('word freeze: a grade turns the third stop into a word card', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?game=freeze&input=keyboard&players=1&grade=prek&freezes=3&intro=1&rng=0');
  await page.waitForSelector('canvas', { timeout: 60_000 });
  // Third stop (~35 s in with rng=0): the card appears without any input.
  await page.waitForFunction(
    () => typeof window.__wiggle?.word === 'string' && window.__wiggle.word.length > 0,
    undefined,
    { timeout: 90_000 },
  );
  const word = await page.evaluate(() => window.__wiggle?.word);
  expect(word).toBe('a'); // prek pack order is deterministic
  // The reveal line reaches the caption strip ("It says… A!").
  await expect(page.getByTestId('caption')).toContainText('says', { timeout: 15_000 });
});

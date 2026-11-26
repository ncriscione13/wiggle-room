import { expect, test } from '@playwright/test';

// M1.10: the kid flow -- pick players -> (keyboard skips the camera
// screens) -> Freeze Dance -> results -> arms-up replay -> session timer
// cool-down -> goodbye; parent gate opens settings with a 3 s P hold.

test('keyboard flow: round, replay, time-up, cool-down, goodbye, parent gate', async ({ page }) => {
  test.setTimeout(180_000);
  // Deterministic timeline (rng=0): round = 1 s intro + 4 s dance + 3 s stop
  // = ~8 s. Session 14 s -> round 1 + the replay press fit even under
  // parallel-worker contention; round 2 (~11.5-19.5 s) crosses time-up.
  await page.goto('/?play=1&input=keyboard&freezes=1&intro=1&sessionS=14&cooldownS=2&rng=0');

  await page.getByTestId('pick-2').click();
  await page.waitForSelector('canvas', { timeout: 30_000 });

  const playOneRound = async (): Promise<void> => {
    await page.waitForFunction(() => window.__wiggle !== undefined, undefined, {
      timeout: 30_000,
    });
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.press('Tab');
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => window.__wiggle?.phase === 'stop', undefined, {
      timeout: 30_000,
    });
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(() => window.__wiggle?.done === true, undefined, {
      timeout: 30_000,
    });
  };

  await playOneRound();
  // Results + captions exist; arms up (A) replays within the session.
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(page.getByTestId('stars-0')).toContainText('★');
  await page.keyboard.press('a');
  // The fresh scene publishes fresh hooks (done flips back to false).
  await page.waitForFunction(() => window.__wiggle?.done === false, undefined, {
    timeout: 30_000,
  });

  // Second round runs past the 10 s session end -> cool-down, then goodbye.
  await playOneRound();
  await expect(page.getByTestId('cooldown')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('goodbye')).toBeVisible({ timeout: 30_000 });

  // Parent gate: hold P for 3 s.
  await page.keyboard.down('p');
  await page.waitForTimeout(3300);
  await page.keyboard.up('p');
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('settings-close').click();
  await expect(page.getByTestId('settings')).toBeHidden();
});

test('live flow: empty room stops at the start-up check with a friendly ask', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?play=1'); // fake camera: frames, but no humans
  await page.getByTestId('pick-1').click();
  await expect(page.getByTestId('check-screen')).toBeVisible({ timeout: 60_000 });
  // The checker reports the empty room as not-seen with the circle ask.
  await expect(page.getByTestId('check-problem-0')).toContainText('Step into your circle', {
    timeout: 30_000,
  });
});

test('start screen offers the play button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('play-button')).toBeVisible();
  await expect(page.getByTestId('play-button')).toHaveAttribute('href', '?play=1');
});

import { describe, expect, it } from 'vitest';
import { keepAwake, type WakeLockSentinelLike } from './wake-lock';

// Phone play round 1: the screen must stay awake through a round where
// nobody touches it, and come back after the OS drops the lock on hide.

function fakeDoc(): {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
  show(): void;
} {
  const handlers = new Set<() => void>();
  return {
    visibilityState: 'visible',
    addEventListener(_type, fn): void {
      handlers.add(fn);
    },
    removeEventListener(_type, fn): void {
      handlers.delete(fn);
    },
    show(): void {
      this.visibilityState = 'visible';
      for (const h of handlers) h();
    },
  };
}

function fakeNav(): {
  wakeLock: { request(type: 'screen'): Promise<WakeLockSentinelLike> };
  requests: number;
  releases: number;
} {
  const nav = {
    requests: 0,
    releases: 0,
    wakeLock: {
      request: (): Promise<WakeLockSentinelLike> => {
        nav.requests += 1;
        return Promise.resolve({
          release: (): Promise<void> => {
            nav.releases += 1;
            return Promise.resolve();
          },
        });
      },
    },
  };
  return nav;
}

const tickAsync = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('keepAwake (phone play round 1)', () => {
  it('requests a screen lock on start and releases it on stop', async () => {
    const nav = fakeNav();
    const doc = fakeDoc();
    const keeper = keepAwake(nav, doc);
    await tickAsync();
    expect(nav.requests).toBe(1);
    expect(keeper.active()).toBe(true);
    keeper.stop();
    expect(nav.releases).toBe(1);
    expect(keeper.active()).toBe(false);
  });

  it('re-acquires when the page becomes visible again (OS dropped it on hide)', async () => {
    const nav = fakeNav();
    const doc = fakeDoc();
    keepAwake(nav, doc);
    await tickAsync();
    doc.show();
    await tickAsync();
    expect(nav.requests).toBe(2);
  });

  it('no wakeLock API: a silent no-op, never a crash', () => {
    const doc = fakeDoc();
    const keeper = keepAwake({}, doc);
    expect(keeper.active()).toBe(false);
    keeper.stop();
  });

  it('a denied request is swallowed (battery saver)', async () => {
    const doc = fakeDoc();
    const keeper = keepAwake(
      { wakeLock: { request: () => Promise.reject(new Error('denied')) } },
      doc,
    );
    await tickAsync();
    expect(keeper.active()).toBe(false);
    keeper.stop();
  });

  it('stop() racing a pending request releases the late sentinel', async () => {
    const nav = fakeNav();
    let resolveRequest!: (s: WakeLockSentinelLike) => void;
    nav.wakeLock.request = (): Promise<WakeLockSentinelLike> => {
      nav.requests += 1;
      return new Promise((r) => (resolveRequest = r));
    };
    const doc = fakeDoc();
    const keeper = keepAwake(nav, doc);
    keeper.stop(); // before the request resolves
    resolveRequest({
      release: (): Promise<void> => {
        nav.releases += 1;
        return Promise.resolve();
      },
    });
    await tickAsync();
    expect(nav.releases).toBe(1);
    expect(keeper.active()).toBe(false);
  });

  it('stop() detaches the visibility listener (no zombie re-acquires)', async () => {
    const nav = fakeNav();
    const doc = fakeDoc();
    const keeper = keepAwake(nav, doc);
    await tickAsync();
    keeper.stop();
    doc.show();
    await tickAsync();
    expect(nav.requests).toBe(1);
  });
});

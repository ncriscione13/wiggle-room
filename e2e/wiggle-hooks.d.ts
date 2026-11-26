// Shared test-hook shape the Freeze scene exposes (window.__wiggle).

interface WiggleHooks {
  phase: string;
  meters: [number, number];
  stars: [number, number];
  done: boolean;
  /** The word on the current word card (L1 Word Freeze), null between. */
  word?: string | null;
}

interface Window {
  __wiggle?: WiggleHooks;
}

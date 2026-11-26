// Shared test-hook shape the Freeze scene exposes (window.__wiggle).

interface WiggleHooks {
  phase: string;
  meters: [number, number];
  stars: [number, number];
  done: boolean;
}

interface Window {
  __wiggle?: WiggleHooks;
}

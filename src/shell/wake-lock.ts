// Screen wake lock (phone play round 1): nobody touches the screen during a
// round, so a phone dims and locks mid-game -- which stops the camera (and
// any AirPlay mirror). Best effort: browsers without the API, or a denied
// request (low battery), just no-op and play continues with the OS defaults.
// The OS releases the lock whenever the page hides, so it is re-taken every
// time the page becomes visible again.

export interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export interface WakeLockNavigatorLike {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

export interface WakeLockDocumentLike {
  visibilityState: string;
  addEventListener(type: 'visibilitychange', fn: () => void): void;
  removeEventListener(type: 'visibilitychange', fn: () => void): void;
}

export interface WakeLockKeeper {
  /** True while a sentinel from the last successful request is held. */
  active(): boolean;
  stop(): void;
}

export function keepAwake(nav: WakeLockNavigatorLike, doc: WakeLockDocumentLike): WakeLockKeeper {
  let sentinel: WakeLockSentinelLike | null = null;
  let stopped = false;
  // Read through a call: stop() can flip the flag while acquire() is
  // suspended at the await, which static narrowing cannot see.
  const isStopped = (): boolean => stopped;

  const acquire = async (): Promise<void> => {
    if (isStopped() || nav.wakeLock === undefined) return;
    try {
      const next = await nav.wakeLock.request('screen');
      if (isStopped()) {
        void next.release(); // stop() raced the request: let it go again
        return;
      }
      sentinel = next;
    } catch {
      // Denied (battery saver, unsupported): the game still works; the
      // screen may just dim. Never surface this to a kid.
    }
  };

  const onVisibility = (): void => {
    // Hiding auto-releases the lock; take it back when the page returns.
    if (doc.visibilityState === 'visible') void acquire();
  };

  doc.addEventListener('visibilitychange', onVisibility);
  void acquire();

  return {
    active: () => sentinel !== null,
    stop(): void {
      stopped = true;
      doc.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
      sentinel = null;
    },
  };
}

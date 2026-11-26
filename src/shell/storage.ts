// Guarded key-value storage (shared by device-check and profiles). Every
// localStorage access is wrapped: private mode or blocked storage degrades to
// "nothing stored", never a crash.

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export const browserStore: KeyValueStore = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable: callers treat state as unsaved.
    }
  },
};

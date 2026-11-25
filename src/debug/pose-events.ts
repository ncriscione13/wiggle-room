// Debug event stream (M0.4): lifecycle + pose presence transitions, last N
// kept for the overlay. M1's motion kit pushes its real events into the same
// ring.

import type { ClipPose } from '../tracking/clip-format';

export interface DebugEvent {
  label: string;
  tS: number;
}

export class EventRing {
  private readonly size: number;
  private readonly items: DebugEvent[] = [];

  constructor(size: number) {
    this.size = Math.max(1, size);
  }

  push(label: string, tS: number): void {
    this.items.push({ label, tS });
    if (this.items.length > this.size) this.items.shift();
  }

  entries(): readonly DebugEvent[] {
    return this.items;
  }
}

/** Presence transitions between consecutive frames' pose slots. */
export function poseTransitions(
  prev: readonly (ClipPose | null)[] | null,
  current: readonly (ClipPose | null)[],
): string[] {
  const events: string[] = [];
  current.forEach((pose, slot) => {
    const was = prev?.[slot] ?? null;
    if (was === null && pose !== null) events.push(`pose found · slot ${String(slot)}`);
    if (was !== null && pose === null) events.push(`pose lost · slot ${String(slot)}`);
  });
  return events;
}

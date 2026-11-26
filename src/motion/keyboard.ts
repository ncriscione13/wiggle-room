// Keyboard/mouse stand-ins (CLAUDE.md rule 11): arrows = steps/dancing,
// space = jump, S = squat, F = hold still, A = arms up, Tab switches the
// controlled player. Implements the same MotionSource contract as the live
// kit, so every game is playable at a desk and in Playwright with no camera.

import type {
  BuddyPose,
  MotionEvent,
  MotionEventHandler,
  MotionEventName,
  Slot,
  TrackingState,
} from '../games/types';
import type { MotionSource } from './kit.ts';

/** Structural subset of EventTarget, so tests can drive it headlessly. */
export interface KeyTarget {
  addEventListener(type: 'keydown' | 'keyup', handler: (e: KeyLikeEvent) => void): void;
  removeEventListener(type: 'keydown' | 'keyup', handler: (e: KeyLikeEvent) => void): void;
}

export interface KeyLikeEvent {
  key: string;
  preventDefault(): void;
}

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
const DESK_BL = 0.2; // synthetic buddy body length in image units

export class KeyboardMotion implements MotionSource {
  private readonly handlers = new Map<MotionEventName, Set<MotionEventHandler>>();
  private readonly now: () => number;
  private activeSlot: Slot = 0;
  /** Which slot each currently held key belongs to. */
  private readonly heldKeySlot = new Map<string, Slot>();
  private readonly slotMoving: [boolean, boolean] = [false, false];
  private readonly slotSeen: [boolean, boolean] = [false, false];
  private readonly offs: (() => void)[] = [];

  constructor(target: KeyTarget, now: () => number) {
    this.now = now;
    const down = (e: KeyLikeEvent): void => {
      this.onKeyDown(e);
    };
    const up = (e: KeyLikeEvent): void => {
      this.onKeyUp(e);
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    this.offs.push(() => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
    });
  }

  close(): void {
    for (const off of this.offs) off();
  }

  on(name: MotionEventName, handler: MotionEventHandler): () => void {
    let set = this.handlers.get(name);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler);
    return () => void set.delete(handler);
  }

  pose(slot: Slot): BuddyPose | null {
    if (!this.slotSeen[slot]) return null;
    const cx = slot === 0 ? 0.25 : 0.75;
    const cy = 0.55;
    const bob = this.slotMoving[slot] ? Math.sin(this.now() * Math.PI * 4) * 0.02 : 0;
    const sway = this.slotMoving[slot] ? Math.sin(this.now() * Math.PI * 2) * 0.04 : 0;
    return {
      head: { x: cx + sway, y: cy - 0.3 + bob },
      shoulderL: { x: cx - 0.05 + sway, y: cy - 0.2 + bob },
      shoulderR: { x: cx + 0.05 + sway, y: cy - 0.2 + bob },
      handL: { x: cx - 0.12 + sway * 1.5, y: cy - 0.1 + bob * 2 },
      handR: { x: cx + 0.12 + sway * 1.5, y: cy - 0.1 - bob * 2 },
      hipMid: { x: cx, y: cy + bob * 0.5 },
      footL: { x: cx - 0.04, y: cy + 0.35 },
      footR: { x: cx + 0.04, y: cy + 0.35 },
      bodyLengthImage: DESK_BL,
      fresh: true,
    };
  }

  tracking(slot: Slot): TrackingState {
    return this.slotSeen[slot] ? 'tracked' : 'paused';
  }

  private onKeyDown(e: KeyLikeEvent): void {
    const tS = this.now();
    if (e.key === 'Tab') {
      e.preventDefault();
      this.activeSlot = this.activeSlot === 0 ? 1 : 0;
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (this.heldKeySlot.has(key)) return; // browser auto-repeat

    const slot = this.activeSlot;
    if (ARROWS.has(key)) {
      this.heldKeySlot.set(key, slot);
      this.markSeen(slot);
      this.setMoving(slot, true, tS);
      this.emit({ name: 'step', slot, tS });
      e.preventDefault();
      return;
    }
    switch (key) {
      case ' ':
        this.heldKeySlot.set(key, slot);
        this.markSeen(slot);
        this.emit({ name: 'jump', slot, tS });
        e.preventDefault();
        break;
      case 's':
        this.heldKeySlot.set(key, slot);
        this.markSeen(slot);
        this.emit({ name: 'squat', slot, tS });
        break;
      case 'a':
        this.heldKeySlot.set(key, slot);
        this.markSeen(slot);
        this.emit({ name: 'armsUp', slot, tS });
        break;
      case 'f': {
        this.heldKeySlot.set(key, slot);
        this.markSeen(slot);
        // Force-still: drop any held arrows for this slot.
        for (const [heldKey, heldSlot] of [...this.heldKeySlot]) {
          if (heldSlot === slot && ARROWS.has(heldKey)) this.heldKeySlot.delete(heldKey);
        }
        this.setMoving(slot, false, tS);
        break;
      }
      default:
        break;
    }
  }

  private onKeyUp(e: KeyLikeEvent): void {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const slot = this.heldKeySlot.get(key);
    this.heldKeySlot.delete(key);
    if (slot === undefined) return;
    if (ARROWS.has(key)) {
      const anyArrowHeld = [...this.heldKeySlot].some(
        ([heldKey, heldSlot]) => heldSlot === slot && ARROWS.has(heldKey),
      );
      if (!anyArrowHeld) this.setMoving(slot, false, this.now());
    }
  }

  private markSeen(slot: Slot): void {
    this.slotSeen[slot] = true;
  }

  private setMoving(slot: Slot, moving: boolean, tS: number): void {
    if (this.slotMoving[slot] === moving) return;
    this.slotMoving[slot] = moving;
    this.emit({ name: moving ? 'moving' : 'still', slot, tS });
  }

  private emit(event: MotionEvent): void {
    const set = this.handlers.get(event.name);
    if (set === undefined) return;
    for (const handler of set) handler(event);
  }
}

// Narrator queue core (M1.6; DESIGN "Voice guide"), pure and fully tested:
//   - priority: safety/tracking (1) > timing (2) > instruction (3) > praise (4)
//   - praise arriving at the speaker more than 1 s after its moment is dropped
//   - never the same wording twice in a row (rotation per line)
//   - a help line (cooldownS > 0) repeats at most every cooldown
//   - per-player pan and color-name prefix
//   - a safety line preempts whatever is currently playing
// The Web Audio adapter (narrator.ts) is a thin shell around this.

import { PRAISE_LATE_DROP_S } from '../motion/config.ts';
import type { Slot } from '../games/types';

export interface VoiceWording {
  file: string;
  text: string;
}

export interface VoiceLine {
  priority: 1 | 2 | 3 | 4;
  cooldownS: number;
  wordings: VoiceWording[];
}

export interface NarratorDecision {
  lineId: string;
  /** Clip urls to play back to back (color prefix first when present). */
  urls: string[];
  /** Caption text (prefix + wording). */
  caption: string;
  /** -0.5 player 0, +0.5 player 1, 0 otherwise. */
  pan: number;
  /** Stop the currently playing clip before starting this one. */
  interrupt: boolean;
}

interface QueuedRequest {
  lineId: string;
  player?: Slot;
  eventTS?: number;
  enqueuedAtS: number;
  seq: number;
}

export interface NarratorCoreOptions {
  now(): number;
  clipUrl(file: string): string;
  /** Color-name prefix line ids for slot 0 / slot 1. */
  colorLineIds?: [string, string];
}

const PLAYER_PAN = [-0.5, 0.5] as const;

export class NarratorCore {
  private readonly lines: Map<string, VoiceLine>;
  private readonly opts: NarratorCoreOptions;
  private readonly queue: QueuedRequest[] = [];
  private readonly lastWordingIdx = new Map<string, number>();
  private readonly lastPlayedAtS = new Map<string, number>();
  private playingPriority: number | null = null;
  private seq = 0;

  constructor(lines: Map<string, VoiceLine>, opts: NarratorCoreOptions) {
    this.lines = lines;
    this.opts = opts;
  }

  say(lineId: string, options: { player?: Slot; eventTS?: number } = {}): void {
    const line = this.lines.get(lineId);
    if (line === undefined) return; // unknown ids never crash a game
    this.seq += 1;
    // Praise is about a MOMENT: without an explicit event time, the moment
    // is "now" -- so praise stuck behind other clips for >1 s still drops.
    const eventTS = options.eventTS ?? (line.priority === 4 ? this.opts.now() : undefined);
    this.queue.push({
      lineId,
      ...(options.player !== undefined ? { player: options.player } : {}),
      ...(eventTS !== undefined ? { eventTS } : {}),
      enqueuedAtS: this.opts.now(),
      seq: this.seq,
    });
  }

  onPlaybackEnd(): void {
    this.playingPriority = null;
  }

  /** The next clip to start, or null (idle with empty queue, or mid-playback
   * with nothing allowed to preempt). Starting is implied: callers play what
   * they are given. */
  next(): NarratorDecision | null {
    const now = this.opts.now();

    for (;;) {
      const head = this.pickHead();
      if (head === null) return null;
      const line = this.lines.get(head.lineId);
      if (line === undefined) {
        this.remove(head);
        continue;
      }

      // Late praise is silently dropped at play time.
      if (
        line.priority === 4 &&
        head.eventTS !== undefined &&
        now - head.eventTS > PRAISE_LATE_DROP_S
      ) {
        this.remove(head);
        continue;
      }
      // Cooldown (help lines): suppressed repeats are dropped, not delayed.
      // Keyed per (line, player) so one kid's help never mutes the other's.
      const cooldownKey = `${head.lineId}|${String(head.player ?? '')}`;
      const lastAt = this.lastPlayedAtS.get(cooldownKey);
      if (line.cooldownS > 0 && lastAt !== undefined && now - lastAt < line.cooldownS) {
        this.remove(head);
        continue;
      }

      // Mid-playback: safety AND timing lines preempt strictly lower
      // priorities ("Freeze!" never waits out an instruction clip); nothing
      // ever interrupts its own level or higher.
      let interrupt = false;
      if (this.playingPriority !== null) {
        if (line.priority <= 2 && this.playingPriority > line.priority) interrupt = true;
        else return null;
      }

      this.remove(head);
      this.lastPlayedAtS.set(cooldownKey, now);
      const wordingIdx = this.rotate(head.lineId, line.wordings.length);
      const wording = line.wordings[wordingIdx];
      if (wording === undefined) continue;

      const urls: string[] = [];
      let caption = wording.text;
      let pan = 0;
      if (head.player !== undefined) {
        pan = PLAYER_PAN[head.player];
        const colorId = this.opts.colorLineIds?.[head.player];
        const colorLine = colorId !== undefined ? this.lines.get(colorId) : undefined;
        if (colorId !== undefined && colorLine !== undefined) {
          const colorIdx = this.rotate(colorId, colorLine.wordings.length);
          const colorWording = colorLine.wordings[colorIdx];
          if (colorWording !== undefined) {
            urls.push(this.opts.clipUrl(colorWording.file));
            caption = `${colorWording.text} ${caption}`;
          }
        }
      }
      urls.push(this.opts.clipUrl(wording.file));

      this.playingPriority = line.priority;
      return { lineId: head.lineId, urls, caption, pan, interrupt };
    }
  }

  private pickHead(): QueuedRequest | null {
    let best: QueuedRequest | null = null;
    let bestPriority = Infinity;
    for (const req of this.queue) {
      const line = this.lines.get(req.lineId);
      const priority = line?.priority ?? 9;
      if (
        priority < bestPriority ||
        (priority === bestPriority && req.seq < (best?.seq ?? Infinity))
      ) {
        best = req;
        bestPriority = priority;
      }
    }
    return best;
  }

  private remove(req: QueuedRequest): void {
    const i = this.queue.indexOf(req);
    if (i >= 0) this.queue.splice(i, 1);
  }

  private rotate(lineId: string, count: number): number {
    const last = this.lastWordingIdx.get(lineId);
    const next = count <= 1 ? 0 : last === undefined ? 0 : (last + 1) % count;
    this.lastWordingIdx.set(lineId, next);
    return next;
  }
}

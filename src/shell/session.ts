// Session timer (M1.10; DESIGN "App shell"): a 2-minute heads-up, then
// time-up -> cool-down stretch. Pure; the flow narrates and shows screens.

import { SESSION_HEADSUP_S } from '../motion/config';

export type SessionEvent = 'heads-up' | 'time-up';

export class SessionTimer {
  private readonly lengthS: number | null;
  private startS: number | null = null;
  private saidHeadsUp = false;
  timeUp = false;

  constructor(lengthS: number | null) {
    this.lengthS = lengthS;
  }

  /** Call every tick; the first call starts the clock. */
  update(tS: number): SessionEvent[] {
    this.startS ??= tS;
    if (this.lengthS === null) return [];
    const events: SessionEvent[] = [];
    const endS = this.startS + this.lengthS;
    if (!this.saidHeadsUp && tS >= endS - SESSION_HEADSUP_S) {
      this.saidHeadsUp = true;
      events.push('heads-up');
    }
    if (!this.timeUp && tS >= endS) {
      this.timeUp = true;
      events.push('time-up');
    }
    return events;
  }
}

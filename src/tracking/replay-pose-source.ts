// ReplayPoseSource (M0.2): plays a clip through the PoseSource interface with
// its original timing, optionally scaled (`speed: 2` is the render stress
// mode) or looped (dev display). Frame timestamps are the replayed timeline
// -- wall-clock paced, starting at 0 -- so overlay timings stay meaningful;
// detector clip tests feed frames directly and never go through here.

import type { ClipFile } from './clip-format';
import type { FrameHandler, PoseFrame, PoseSource } from './pose-source';

export interface ReplayOptions {
  /** Playback rate; 1 = original timing. Clamped to 0.25..4. */
  speed?: number;
  /** Restart at the end, with timestamps continuing monotonically. */
  loop?: boolean;
  /** Clock in ms (injectable for tests); defaults to performance.now. */
  now?: () => number;
}

export class ReplayPoseSource implements PoseSource {
  readonly kind = 'replay' as const;

  private readonly clip: ClipFile;
  private readonly speed: number;
  private readonly loop: boolean;
  private readonly now: () => number;
  private readonly firstTS: number;

  private readonly handlers = new Set<FrameHandler>();
  private readonly endedHandlers = new Set<() => void>();
  private latestFrame: PoseFrame | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private index = 0;
  private loopOffsetS = 0;
  private startedAtMs = 0;
  private running = false;
  /** Bumped on every start/stop so a stale callback can never fork the loop
   * (e.g. a frame handler calling stop() + start() synchronously). */
  private generation = 0;

  constructor(clip: ClipFile, options: ReplayOptions = {}) {
    const first = clip.frames[0];
    if (first === undefined) throw new Error('replay: clip has no frames');
    this.clip = clip;
    this.firstTS = first.tS;
    this.speed = Math.min(4, Math.max(0.25, options.speed ?? 1));
    this.loop = options.loop ?? false;
    this.now = options.now ?? ((): number => performance.now());
  }

  start(): Promise<void> {
    if (!this.running) {
      this.running = true;
      this.generation += 1;
      this.index = 0;
      this.loopOffsetS = 0;
      this.latestFrame = null;
      this.startedAtMs = this.now();
      this.scheduleNext();
    }
    return Promise.resolve();
  }

  stop(): void {
    this.running = false;
    this.generation += 1;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  onFrame(handler: FrameHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onEnded(handler: () => void): () => void {
    this.endedHandlers.add(handler);
    return () => this.endedHandlers.delete(handler);
  }

  latest(): PoseFrame | null {
    return this.latestFrame;
  }

  /** The replayed-timeline timestamp of frame `i`, in seconds. */
  private frameTimeS(i: number): number {
    const frame = this.clip.frames[i];
    if (frame === undefined) throw new Error('replay: frame index out of range');
    return (frame.tS - this.firstTS) / this.speed + this.loopOffsetS;
  }

  private scheduleNext(): void {
    if (!this.running) return;

    if (this.index >= this.clip.frames.length) {
      if (!this.loop) {
        this.running = false;
        for (const handler of this.endedHandlers) handler();
        return;
      }
      const last = this.clip.frames[this.clip.frames.length - 1];
      if (last === undefined) return;
      // Continue the timeline past the end, plus one nominal frame gap so
      // timestamps stay strictly increasing across the seam.
      this.loopOffsetS +=
        (last.tS - this.firstTS) / this.speed + 1 / (this.clip.nominalFps * this.speed);
      this.index = 0;
    }

    const targetMs = this.frameTimeS(this.index) * 1000;
    const delayMs = Math.max(0, targetMs - (this.now() - this.startedAtMs));
    const gen = this.generation;
    this.timer = setTimeout(() => {
      if (gen !== this.generation) return; // stale chain: a restart happened
      this.emit(this.index);
      if (gen !== this.generation) return; // a handler stopped/restarted us
      this.index += 1;
      this.scheduleNext();
    }, delayMs);
  }

  private emit(i: number): void {
    const clipFrame = this.clip.frames[i];
    if (clipFrame === undefined) return;
    const tS = this.frameTimeS(i);
    const frame: PoseFrame = {
      tS,
      poses: clipFrame.poses,
      inferenceS: 0,
      frameIntervalS: this.latestFrame === null ? 0 : tS - this.latestFrame.tS,
    };
    this.latestFrame = frame;
    for (const handler of this.handlers) handler(frame);
  }
}

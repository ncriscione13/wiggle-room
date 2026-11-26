// Debug overlay (M0.4), toggled with D: per-stage timings (camera frame
// interval, inference, motion kit, render), fps, source info and the last 10
// events. Also turns on the stage's floor circles while visible.

import type { PoseFrame, PoseSource } from '../tracking/pose-source';
import type { PoseStage } from '../ui/pose-stage';
import { colors, px, typography } from '../ui/theme';
import { EventRing, poseTransitions } from './pose-events';
import { RollingStats } from './stats';

const STATS_WINDOW = 120;
const UPDATE_EVERY_MS = 250;
const EVENTS_KEPT = 10;

export interface DebugOverlayDeps {
  source: PoseSource;
  stage: PoseStage;
  /** Extra line about the input, e.g. camera settings or clip name. */
  sourceLabel: string;
  /** Per-frame motion-kit cost, when a kit is running (null before frames). */
  motionMs?: () => { avgMs: number; p99Ms: number } | null;
}

export interface DebugOverlay {
  events: EventRing;
  destroy(): void;
}

function row(label: string, testid: string): [HTMLElement, HTMLElement] {
  const line = document.createElement('div');
  const name = document.createElement('span');
  name.textContent = label;
  Object.assign(name.style, { color: colors.textDim, marginRight: px(10) });
  const value = document.createElement('span');
  value.setAttribute('data-testid', testid);
  line.append(name, value);
  return [line, value];
}

export function mountDebugOverlay(root: HTMLElement, deps: DebugOverlayDeps): DebugOverlay {
  const events = new EventRing(EVENTS_KEPT);
  const cameraMs = new RollingStats(STATS_WINDOW);
  const inferenceMs = new RollingStats(STATS_WINDOW);

  let prevPoses: PoseFrame['poses'] | null = null;
  const offFrame = deps.source.onFrame((frame) => {
    if (frame.frameIntervalS > 0) cameraMs.push(frame.frameIntervalS * 1000);
    if (deps.source.kind === 'live') inferenceMs.push(frame.inferenceS * 1000);
    for (const label of poseTransitions(prevPoses, frame.poses)) events.push(label, frame.tS);
    prevPoses = frame.poses;
  });

  const panel = document.createElement('div');
  panel.setAttribute('data-testid', 'debug-overlay');
  panel.hidden = true;
  Object.assign(panel.style, {
    position: 'fixed',
    top: px(16),
    left: px(16),
    zIndex: '20',
    minWidth: px(360),
    padding: px(14),
    borderRadius: px(12),
    background: colors.surfaceRaised,
    color: colors.textSoft,
    fontFamily: typography.family,
    fontSize: px(16),
    lineHeight: '1.6',
    opacity: '0.95',
  });

  const title = document.createElement('div');
  title.textContent = `Debug · ${deps.source.kind} · ${deps.sourceLabel}`;
  Object.assign(title.style, { fontWeight: '700', marginBottom: px(6) });

  const [cameraRow, cameraValue] = row('camera frame interval', 'overlay-camera-ms');
  const [inferenceRow, inferenceValue] = row('inference', 'overlay-inference-ms');
  const [motionRow, motionValue] = row('motion kit', 'overlay-motion-ms');
  const [renderRow, renderValue] = row('render', 'overlay-render-fps');

  const eventsTitle = document.createElement('div');
  eventsTitle.textContent = 'last events';
  Object.assign(eventsTitle.style, { color: colors.textDim, marginTop: px(8) });
  const eventsList = document.createElement('div');
  eventsList.setAttribute('data-testid', 'overlay-events');

  panel.append(title, cameraRow, inferenceRow, motionRow, renderRow, eventsTitle, eventsList);
  root.appendChild(panel);

  const ms = (v: number): string => `${v.toFixed(1)} ms`;
  const render = (): void => {
    if (panel.hidden) return;
    cameraValue.textContent = `${ms(cameraMs.mean())} (p99 ${ms(cameraMs.p99())})`;
    inferenceValue.textContent =
      deps.source.kind === 'live'
        ? `${ms(inferenceMs.mean())} (p99 ${ms(inferenceMs.p99())})`
        : '0.0 ms (replay)';
    const motion = deps.motionMs?.() ?? null;
    motionValue.textContent =
      motion === null ? 'waiting for frames…' : `${ms(motion.avgMs)} (p99 ${ms(motion.p99Ms)})`;
    // Whole-frame time (1000/fps). Draw-stage-only ms needs instrumentation
    // Phaser doesn't expose; logged in DECISIONS (M0 review).
    const fps = deps.stage.actualFps();
    const frameMs = fps > 0 ? 1000 / fps : 0;
    renderValue.textContent = `${frameMs.toFixed(1)} ms/frame · ${fps.toFixed(1)} fps`;
    eventsList.textContent = '';
    for (const e of events.entries()) {
      const line = document.createElement('div');
      line.textContent = `${e.tS.toFixed(2)} s · ${e.label}`;
      eventsList.appendChild(line);
    }
  };
  const interval = window.setInterval(render, UPDATE_EVERY_MS);

  const onKey = (event: KeyboardEvent): void => {
    if (event.key.toLowerCase() !== 'd') return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    panel.hidden = !panel.hidden;
    deps.stage.setCirclesVisible(!panel.hidden);
    render();
  };
  window.addEventListener('keydown', onKey);

  return {
    events,
    destroy(): void {
      offFrame();
      window.clearInterval(interval);
      window.removeEventListener('keydown', onKey);
      panel.remove();
    },
  };
}

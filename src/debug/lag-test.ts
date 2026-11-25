// Lag test screen (M0.7): a large high-contrast marker follows the right
// wrist while a running millisecond counter gives phone slow-motion footage a
// timestamp to read. Procedure: docs/LAG-TEST.md.

import { POSE } from '../tracking/clip-format';
import type { PoseFrame, PoseSource } from '../tracking/pose-source';
import { VISIBILITY_MIN_RATIO } from '../motion/config';
import { toStageX, toStageY } from '../ui/stage-math';
import { colors, px, typography } from '../ui/theme';

export interface WristPoint {
  x: number;
  y: number;
}

/** Right wrist of the first pose that shows one clearly, else null. */
export function pickRightWrist(frame: PoseFrame | null): WristPoint | null {
  if (frame === null) return null;
  for (const pose of frame.poses) {
    if (pose === null) continue;
    const wrist = pose[POSE.rightWrist];
    if (wrist !== undefined && wrist[3] >= VISIBILITY_MIN_RATIO) {
      return { x: wrist[0], y: wrist[1] };
    }
  }
  return null;
}

/** Fixed-width so every 240 fps video frame shows a readable, steady number. */
export function formatCounterMs(elapsedMs: number): string {
  return `${String(Math.round(elapsedMs)).padStart(6, '0')} ms`;
}

const MARKER_SIZE_PX = 140;

export function mountLagTestScreen(root: HTMLElement, source: PoseSource): () => void {
  root.querySelector('.wr-start')?.remove();

  const screen = document.createElement('div');
  screen.setAttribute('data-testid', 'lag-test');
  Object.assign(screen.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '5',
    background: colors.surfaceNight,
    fontFamily: typography.family,
    overflow: 'hidden',
  });

  const counter = document.createElement('div');
  counter.setAttribute('data-testid', 'lag-counter');
  Object.assign(counter.style, {
    position: 'absolute',
    top: px(24),
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: px(84),
    fontWeight: '700',
    letterSpacing: px(4),
    color: colors.textSoft,
    fontVariantNumeric: 'tabular-nums',
  });

  const hint = document.createElement('div');
  hint.textContent = 'Flick your RIGHT hand — the dot should move with it. See docs/LAG-TEST.md';
  Object.assign(hint.style, {
    position: 'absolute',
    bottom: px(24),
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: px(24),
    color: colors.textDim,
    whiteSpace: 'nowrap',
  });

  const marker = document.createElement('div');
  marker.setAttribute('data-testid', 'lag-marker');
  Object.assign(marker.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: px(MARKER_SIZE_PX),
    height: px(MARKER_SIZE_PX),
    borderRadius: '50%',
    background: colors.butter,
    willChange: 'transform',
  });

  const lost = document.createElement('div');
  lost.textContent = 'I can’t see a hand yet — step into view';
  Object.assign(lost.style, {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: px(32),
    color: colors.textDim,
  });

  screen.append(counter, marker, lost, hint);
  root.appendChild(screen);

  const startMs = performance.now();
  let raf = 0;
  const tick = (): void => {
    counter.textContent = formatCounterMs(performance.now() - startMs);
    const wrist = pickRightWrist(source.latest());
    if (wrist === null) {
      marker.style.opacity = '0.15';
      lost.hidden = false;
    } else {
      marker.style.opacity = '1';
      lost.hidden = true;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const x = toStageX([wrist.x, wrist.y, 0, 1], w) - MARKER_SIZE_PX / 2;
      const y = toStageY([wrist.x, wrist.y, 0, 1], h) - MARKER_SIZE_PX / 2;
      marker.style.transform = `translate(${px(Math.round(x))}, ${px(Math.round(y))})`;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return (): void => {
    cancelAnimationFrame(raf);
    screen.remove();
  };
}

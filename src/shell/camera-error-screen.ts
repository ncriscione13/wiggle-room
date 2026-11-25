// Friendly camera-problem screens (M0.1). Parent-facing, kid-safe tone:
// what happened in plain words, one concrete fix, always a way to try again.
// Copy is tested in camera-error-screen.test.ts; rendering in e2e/camera.spec.ts.

import type { CameraErrorKind } from '../tracking/camera';
import { colors, px, typography } from '../ui/theme';

export const CAMERA_ERROR_COPY: Record<CameraErrorKind, { title: string; hint: string }> = {
  denied: {
    title: 'The camera is turned off for this page',
    hint: 'Click the camera icon in the address bar, allow the camera, then try again.',
  },
  'not-found': {
    title: 'No camera found',
    hint: 'Plug in a webcam — straight into the computer, not a hub — then try again.',
  },
  busy: {
    title: 'Another app is using the camera',
    hint: 'Close video-call apps like Zoom or Teams, then try again.',
  },
  insecure: {
    title: 'The camera needs a secure address',
    hint: 'Open the https:// address (or localhost on this computer), then try again.',
  },
  unknown: {
    title: 'The camera could not start',
    hint: 'Unplug and replug the webcam, or restart Chrome, then try again.',
  },
};

export function renderCameraErrorScreen(root: HTMLElement, kind: CameraErrorKind): void {
  const copy = CAMERA_ERROR_COPY[kind];

  const screen = document.createElement('div');
  screen.setAttribute('data-testid', 'camera-error');
  screen.setAttribute('data-kind', kind);
  Object.assign(screen.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: px(18),
    background: colors.surfaceNight,
    color: colors.textSoft,
    fontFamily: typography.family,
    textAlign: 'center',
    padding: px(32),
  });

  const title = document.createElement('h2');
  title.textContent = copy.title;
  Object.assign(title.style, { margin: '0', fontSize: px(typography.subtitlePx + 8) });

  const hint = document.createElement('p');
  hint.textContent = copy.hint;
  Object.assign(hint.style, {
    margin: '0',
    fontSize: px(typography.bodyPx),
    color: colors.textDim,
    maxWidth: px(720),
  });

  const retry = document.createElement('button');
  retry.textContent = 'Try again';
  Object.assign(retry.style, {
    marginTop: px(12),
    padding: `${px(14)} ${px(36)}`,
    fontSize: px(typography.bodyPx),
    fontFamily: typography.family,
    color: colors.surfaceNight,
    background: colors.mint,
    border: 'none',
    borderRadius: px(16),
    cursor: 'pointer',
  });
  retry.addEventListener('click', () => {
    window.location.reload();
  });

  screen.append(title, hint, retry);
  root.appendChild(screen);
}

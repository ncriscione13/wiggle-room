// Replay badge (0.7/M0.3): loads the clip, reports ready/error, and hands the
// clip back to the caller so the stage can play it.

import { loadClipJson } from '../assets/loader';
import type { ClipFile } from '../tracking/clip-format';
import { colors, px, typography } from '../ui/theme';

export async function mountReplayBadge(
  root: HTMLElement,
  clipName: string,
): Promise<ClipFile | null> {
  const badge = document.createElement('div');
  badge.setAttribute('data-testid', 'replay-badge');
  badge.dataset['state'] = 'loading';
  Object.assign(badge.style, {
    position: 'fixed',
    bottom: px(16),
    left: px(16),
    zIndex: '10',
    padding: `${px(8)} ${px(14)}`,
    borderRadius: px(12),
    background: colors.surfaceRaised,
    color: colors.textSoft,
    fontFamily: typography.family,
    fontSize: px(18),
  });
  badge.textContent = `Replay: ${clipName} — loading…`;
  root.appendChild(badge);

  try {
    const clip = await loadClipJson(clipName);
    const first = clip.frames[0];
    const last = clip.frames[clip.frames.length - 1];
    const durationS = first !== undefined && last !== undefined ? last.tS - first.tS : 0;
    badge.textContent = `Replay: ${clip.name} — ${String(clip.frames.length)} frames, ${durationS.toFixed(1)} s`;
    badge.dataset['state'] = 'ready';
    return clip;
  } catch {
    badge.textContent = `Replay clip "${clipName}" could not be loaded.`;
    badge.dataset['state'] = 'error';
    return null;
  }
}

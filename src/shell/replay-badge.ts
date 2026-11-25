// Replay badge (task 0.7): visible proof that replay mode is active and the
// clip loaded. M0.2 wires the loaded clip into the ReplayPoseSource; until
// then the badge is the user-facing surface of `?source=replay`.

import { loadClipJson } from '../assets/loader';
import { colors, px, typography } from '../ui/theme';

export async function mountReplayBadge(root: HTMLElement, clipName: string): Promise<void> {
  const badge = document.createElement('div');
  badge.setAttribute('data-testid', 'replay-badge');
  badge.dataset['state'] = 'loading';
  Object.assign(badge.style, {
    position: 'fixed',
    bottom: px(16),
    left: px(16),
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
  } catch {
    badge.textContent = `Replay clip "${clipName}" could not be loaded.`;
    badge.dataset['state'] = 'error';
  }
}

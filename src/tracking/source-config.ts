// Pose source selection (task 0.7): the app runs from the live camera by
// default; `?source=replay&clip=<name>` (or the `?clip=<name>` shorthand)
// feeds a recorded/synthetic clip instead. M0.2 consumes this to construct
// the right PoseSource.

export type SourceConfig = { source: 'camera' } | { source: 'replay'; clip: string; speed: number };

/** Clip names are simple slugs; anything else falls back to the camera. */
const CLIP_NAME = /^[a-z0-9][a-z0-9-]*$/;

export type ScreenName = 'stage' | 'lagtest' | 'record';

/** Which screen to show (M0.7+): the normal stage, or a dev/measurement one. */
export function screenFromUrl(search: string): ScreenName {
  const screen = new URLSearchParams(search).get('screen');
  if (screen === 'lagtest' || screen === 'record') return screen;
  return 'stage';
}

export function sourceConfigFromUrl(search: string): SourceConfig {
  const params = new URLSearchParams(search);
  const clip = params.get('clip');
  const source = params.get('source');
  const wantsReplay = source === 'replay' || (source === null && clip !== null);
  if (wantsReplay && clip !== null && CLIP_NAME.test(clip)) {
    const rawSpeed = Number(params.get('speed') ?? '1');
    const speed = Number.isFinite(rawSpeed) ? Math.min(4, Math.max(0.25, rawSpeed)) : 1;
    return { source: 'replay', clip, speed };
  }
  return { source: 'camera' };
}

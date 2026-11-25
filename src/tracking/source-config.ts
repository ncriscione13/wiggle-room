// Pose source selection (task 0.7): the app runs from the live camera by
// default; `?source=replay&clip=<name>` (or the `?clip=<name>` shorthand)
// feeds a recorded/synthetic clip instead. M0.2 consumes this to construct
// the right PoseSource.

export type SourceConfig = { source: 'camera' } | { source: 'replay'; clip: string };

/** Clip names are simple slugs; anything else falls back to the camera. */
const CLIP_NAME = /^[a-z0-9][a-z0-9-]*$/;

export function sourceConfigFromUrl(search: string): SourceConfig {
  const params = new URLSearchParams(search);
  const clip = params.get('clip');
  const source = params.get('source');
  const wantsReplay = source === 'replay' || (source === null && clip !== null);
  if (wantsReplay && clip !== null && CLIP_NAME.test(clip)) {
    return { source: 'replay', clip };
  }
  return { source: 'camera' };
}

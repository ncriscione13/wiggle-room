// Dev tools mount (M0.5): R records the active source to a clip download;
// dropping a clip JSON anywhere replays it. Only mounted when the recorder is
// enabled (dev build or ?debug=1).

import type { ClipFile } from '../tracking/clip-format';
import type { PoseSource } from '../tracking/pose-source';
import { colors, px, typography } from '../ui/theme';
import { downloadClip, parseDroppedClip, PoseRecorder } from './recorder';

export interface DevToolsDeps {
  getSource(): PoseSource | null;
  onDroppedClip(clip: ClipFile): void;
}

export function mountDevTools(root: HTMLElement, deps: DevToolsDeps): void {
  const recorder = new PoseRecorder();
  let chip: HTMLElement | null = null;
  let chipTimer: number | null = null;
  let chipFuse: number | null = null;

  const removeChip = (): void => {
    if (chipTimer !== null) window.clearInterval(chipTimer);
    if (chipFuse !== null) window.clearTimeout(chipFuse);
    chipTimer = null;
    chipFuse = null;
    chip?.remove();
    chip = null;
  };

  const showChip = (text: string, transientMs?: number): HTMLElement => {
    removeChip();
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'recorder-chip');
    el.textContent = text;
    Object.assign(el.style, {
      position: 'fixed',
      top: px(16),
      right: px(16),
      zIndex: '20',
      padding: `${px(8)} ${px(14)}`,
      borderRadius: px(12),
      background: colors.surfaceRaised,
      color: colors.butter,
      fontFamily: typography.family,
      fontSize: px(18),
    });
    root.appendChild(el);
    chip = el;
    // The fuse is tracked so a NEW chip (e.g. the next recording's REC
    // indicator) cancels it -- a stale fuse must never remove a fresh chip.
    if (transientMs !== undefined) chipFuse = window.setTimeout(removeChip, transientMs);
    return el;
  };

  const finishRecording = (): void => {
    const clip = recorder.stop();
    removeChip();
    if (clip === null) {
      showChip('Recording was empty — nothing saved', 2500);
      return;
    }
    downloadClip(clip);
    showChip(`Saved ${clip.name}.json (${String(clip.frames.length)} frames)`, 3500);
  };

  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'r') return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    if (recorder.recording) {
      finishRecording();
      return;
    }
    const source = deps.getSource();
    if (source === null) return;
    recorder.start(source, finishRecording);
    const el = showChip('● REC 0.0 s · 0 frames');
    chipTimer = window.setInterval(() => {
      el.textContent = `● REC ${recorder.durationS.toFixed(1)} s · ${String(recorder.frameCount)} frames`;
    }, 250);
  });

  window.addEventListener('dragover', (event) => {
    event.preventDefault();
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file === undefined) return;
    void (async (): Promise<void> => {
      try {
        const clip = await parseDroppedClip(file);
        deps.onDroppedClip(clip);
      } catch (error) {
        showChip(error instanceof Error ? error.message : 'That file could not be loaded', 3500);
      }
    })();
  });
}

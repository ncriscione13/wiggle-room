// Clip-recording mode (M0.8, ?screen=record): walks Nick and the kids
// through the 8 real recordings with big on-screen prompts. Each take
// downloads as <name>.json for test/clips/real/. Keys: Space start, R redo,
// N next.

import type { PoseSource } from '../tracking/pose-source';
import { RECORD_COUNTDOWN_S } from '../motion/config';
import { colors, px, typography } from '../ui/theme';
import { downloadClip, PoseRecorder } from './recorder';

export interface ClipPrompt {
  /** File name (never a synthetic clip name -- no silent shadowing). */
  name: string;
  title: string;
  instruction: string;
  durationS: number;
}

export const CLIP_PROMPTS: readonly ClipPrompt[] = [
  {
    name: 'standing-still-30s',
    title: 'Stand still like a statue',
    instruction: 'Feet in your circle, arms relaxed. Hold as still as you can.',
    durationS: 30,
  },
  {
    name: 'bunny-hops-x5',
    title: 'Five bunny hops',
    instruction: 'Hop straight up five times, with a little rest between hops.',
    durationS: 20,
  },
  {
    name: 'running-in-place-10s',
    title: 'Run in place',
    instruction: 'Run on your spot as fast as feels fun. Knees up!',
    durationS: 10,
  },
  {
    name: 'kid-squats-x3',
    title: 'Three frog squats',
    instruction: 'Squat down low like a frog, stand tall again. Three times, slowly.',
    durationS: 16,
  },
  {
    name: 'reach-up-and-arms-out',
    title: 'Reach up, then airplane',
    instruction: 'Reach both hands to the sky... then arms out wide like an airplane.',
    durationS: 15,
  },
  {
    name: 'both-kids-2min',
    title: 'Both kids together',
    instruction: 'One kid per circle. Dance, wave, be silly — stay in your circles.',
    durationS: 120,
  },
  {
    name: 'kid-walks-out-and-back',
    title: 'Walk away and come back',
    instruction: 'Walk out of the picture, count to three, walk back to your circle.',
    durationS: 20,
  },
  {
    name: 'dim-room-30s',
    title: 'Lights low',
    instruction: 'A grown-up dims the lights. Stand in your circle and sway gently.',
    durationS: 30,
  },
];

// --- State machine (pure) ----------------------------------------------------

export type RecordPhase = 'idle' | 'countdown' | 'recording' | 'review' | 'done';

export interface RecordState {
  phase: RecordPhase;
  promptIndex: number;
}

export type RecordEvent = 'primary' | 'countdownDone' | 'recordingDone' | 'next' | 'redo';

export function recordFlowNext(
  state: RecordState,
  event: RecordEvent,
  promptCount: number,
): RecordState {
  switch (state.phase) {
    case 'idle':
      return event === 'primary' ? { ...state, phase: 'countdown' } : state;
    case 'countdown':
      return event === 'countdownDone' ? { ...state, phase: 'recording' } : state;
    case 'recording':
      return event === 'recordingDone' ? { ...state, phase: 'review' } : state;
    case 'review':
      if (event === 'redo') return { ...state, phase: 'countdown' };
      if (event === 'next') {
        return state.promptIndex + 1 < promptCount
          ? { phase: 'idle', promptIndex: state.promptIndex + 1 }
          : { ...state, phase: 'done' };
      }
      return state;
    case 'done':
      return state;
  }
}

// --- Director (DOM + keys + recorder) ---------------------------------------

export interface DirectorOptions {
  /** Dev override: scale every prompt to this many seconds (dry runs, e2e). */
  promptSecondsOverride?: number;
}

export function mountClipRecordingDirector(
  root: HTMLElement,
  source: PoseSource,
  options: DirectorOptions = {},
): () => void {
  const recorder = new PoseRecorder();
  let state: RecordState = { phase: 'idle', promptIndex: 0 };
  let countdownLeft = RECORD_COUNTDOWN_S;
  let countdownTimer: number | null = null;
  let recordingTimer: number | null = null;
  // The finished take waits here; the DOWNLOAD happens inside the S keydown
  // handler so it carries user activation -- Chrome silently blocks repeated
  // automatic downloads fired from timers (review fix).
  let pendingClip: ReturnType<PoseRecorder['stop']> = null;
  let reviewLabel = '';

  const durationOf = (prompt: ClipPrompt): number =>
    options.promptSecondsOverride !== undefined
      ? Math.min(600, Math.max(2, options.promptSecondsOverride))
      : prompt.durationS;

  const panel = document.createElement('div');
  panel.setAttribute('data-testid', 'record-director');
  Object.assign(panel.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '15',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: px(48),
    pointerEvents: 'none',
    fontFamily: typography.family,
    color: colors.textSoft,
    textAlign: 'center',
    textShadow: `0 ${px(2)} ${px(12)} ${colors.surfaceNight}`,
  });

  const progress = document.createElement('div');
  progress.setAttribute('data-testid', 'record-progress');
  Object.assign(progress.style, { fontSize: px(24), color: colors.textDim });

  const title = document.createElement('h2');
  title.setAttribute('data-testid', 'record-title');
  Object.assign(title.style, { margin: px(8), fontSize: px(56) });

  const instruction = document.createElement('p');
  Object.assign(instruction.style, {
    margin: '0',
    fontSize: px(28),
    color: colors.textDim,
    maxWidth: px(900),
  });

  const big = document.createElement('div');
  big.setAttribute('data-testid', 'record-big');
  Object.assign(big.style, { marginTop: px(24), fontSize: px(96), fontWeight: '700' });

  const hint = document.createElement('div');
  Object.assign(hint.style, { marginTop: px(16), fontSize: px(22), color: colors.textDim });

  panel.append(progress, title, instruction, big, hint);
  root.appendChild(panel);

  const clearTimers = (): void => {
    if (countdownTimer !== null) window.clearInterval(countdownTimer);
    if (recordingTimer !== null) window.clearInterval(recordingTimer);
    countdownTimer = null;
    recordingTimer = null;
  };

  const render = (): void => {
    const prompt = CLIP_PROMPTS[state.promptIndex];
    if (prompt === undefined) return;
    panel.dataset['phase'] = state.phase;
    panel.dataset['prompt'] = prompt.name;
    progress.textContent = `Recording ${String(state.promptIndex + 1)} of ${String(CLIP_PROMPTS.length)} · ${prompt.name}.json`;
    title.textContent = prompt.title;
    instruction.textContent = prompt.instruction;
    switch (state.phase) {
      case 'idle':
        big.textContent = '';
        hint.textContent = 'Press SPACE to start';
        break;
      case 'countdown':
        big.textContent = String(countdownLeft);
        hint.textContent = 'Get ready…';
        break;
      case 'recording':
        big.textContent = `● ${String(Math.max(0, Math.ceil(durationOf(prompt) - recorder.durationS)))}`;
        hint.textContent = 'Recording — keep going!';
        break;
      case 'review':
        big.textContent = '✓';
        hint.textContent = `${reviewLabel} · S save & next · R redo`;
        break;
      case 'done':
        title.textContent = 'All clips recorded!';
        instruction.textContent =
          'Copy the downloaded .json files from your Downloads folder into test/clips/real/.';
        big.textContent = '🎉';
        hint.textContent = '';
        break;
    }
  };

  const dispatch = (event: RecordEvent): void => {
    const before = state;
    state = recordFlowNext(state, event, CLIP_PROMPTS.length);
    if (state === before) return;

    if (state.phase === 'countdown') {
      clearTimers();
      countdownLeft = RECORD_COUNTDOWN_S;
      countdownTimer = window.setInterval(() => {
        countdownLeft -= 1;
        if (countdownLeft <= 0) dispatch('countdownDone');
        else render();
      }, 1000);
    }

    if (state.phase === 'recording') {
      clearTimers();
      pendingClip = null;
      recorder.start(source);
      const prompt = CLIP_PROMPTS[state.promptIndex];
      recordingTimer = window.setInterval(() => {
        if (prompt !== undefined && recorder.durationS >= durationOf(prompt)) {
          pendingClip = recorder.stop(prompt.name);
          reviewLabel =
            pendingClip !== null
              ? `${pendingClip.name}.json ready (${String(pendingClip.frames.length)} frames)`
              : 'Nothing captured — R to retry';
          dispatch('recordingDone');
        } else {
          render();
        }
      }, 250);
    }

    if (state.phase === 'review' || state.phase === 'done' || state.phase === 'idle') {
      clearTimers();
    }
    render();
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key === ' ') {
      dispatch('primary');
    } else if (event.key.toLowerCase() === 's') {
      if (state.phase !== 'review') return;
      // Download inside the keydown: user activation makes Chrome allow
      // every take's download, not just the first.
      if (pendingClip !== null) {
        downloadClip(pendingClip);
        pendingClip = null;
      }
      dispatch('next');
    } else if (event.key.toLowerCase() === 'r') {
      pendingClip = null;
      dispatch('redo');
    }
  };
  window.addEventListener('keydown', onKey);
  render();

  return (): void => {
    clearTimers();
    window.removeEventListener('keydown', onKey);
    panel.remove();
  };
}

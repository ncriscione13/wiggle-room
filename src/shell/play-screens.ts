// Play-flow screens (M1.10): big friendly DOM over the stage. Colors come
// from the theme only; everything spoken is also written (captions handle
// narration; these screens carry their own labels).

import type { BuddyDrawPose } from '../motion/buddy-pose';
import type { PlayerInfo, RoundResult, Slot } from '../games/types';
import type { StartupProblem } from '../motion/startup-check';
import type { WarmupMoveId } from '../motion/warmup-flow';
import { paintCheckStage, type CheckSlotView, type RenderCtx2D } from '../ui/check-stage';
import { colors, cssRgb, px, typography } from '../ui/theme';

const BASE_STYLE = `
  position: absolute; inset: 0; display: grid; place-content: center;
  gap: 20px; text-align: center; z-index: 25;
  background: ${cssRgb(colors.surfaceNight)};
  color: ${cssRgb(colors.textSoft)};
  font-family: ${typography.family};
`;

const BUTTON_STYLE = `
  font-family: ${typography.family}; font-size: ${px(typography.subtitlePx)};
  color: ${cssRgb(colors.surfaceNight)}; background: ${cssRgb(colors.mint)};
  border: none; border-radius: 24px; padding: 18px 42px; cursor: pointer;
`;

function screen(testid: string): HTMLDivElement {
  const el = document.createElement('div');
  el.dataset['testid'] = testid;
  el.style.cssText = BASE_STYLE;
  return el;
}

function heading(text: string): HTMLHeadingElement {
  const h = document.createElement('h2');
  h.textContent = text;
  h.style.cssText = `font-size: ${px(typography.subtitlePx)}; margin: 0;`;
  return h;
}

function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  p.style.cssText = `font-size: ${px(typography.bodyPx)}; margin: 0; color: ${cssRgb(colors.textDim)};`;
  return p;
}

/** "Who's playing?" -- the first click doubles as the audio-unlock gesture. */
export function pickPlayers(root: HTMLElement): Promise<1 | 2> {
  return new Promise((resolve) => {
    const el = screen('pick-players');
    el.append(heading("Who's playing?"));
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 24px; justify-content: center;';
    for (const count of [1, 2] as const) {
      const button = document.createElement('button');
      button.dataset['testid'] = `pick-${String(count)}`;
      button.textContent = count === 1 ? 'One kid' : 'Two kids';
      button.style.cssText = BUTTON_STYLE;
      button.addEventListener('click', () => {
        el.remove();
        resolve(count);
      });
      row.append(button);
    }
    el.append(row, note('Grown-ups: hold P any time for settings.'));
    root.append(el);
  });
}

const PROBLEM_LABELS: Record<StartupProblem, string> = {
  'feet-out': 'Step back so your feet fit!',
  'too-close': 'Take two big steps back!',
  dark: 'A little more light, please!',
  backlight: 'Too bright behind you!',
  crowded: 'One buddy per circle!',
  'not-seen': 'Step into your circle!',
};

export interface CheckScreen {
  setStatus(slot: Slot, problem: StartupProblem | null, progress01: number): void;
  /** Live buddy pose for the slot (null while unseen); tS is the motion clock. */
  setPose(slot: Slot, pose: BuddyDrawPose | null, tS: number): void;
  /** Solo pick: blank the empty circle's instruction once the kid clearly
   * chose the other one (the label was reading as the app talking past them). */
  setSpare(slot: Slot, spare: boolean): void;
  destroy(): void;
}

/** Full-bleed base for the camera screens (playtest round 2: the stage must
 * fill the screen like the game does, not sit in a window). */
function fullScreen(testid: string): HTMLDivElement {
  const el = document.createElement('div');
  el.dataset['testid'] = testid;
  el.style.cssText = `
    position: absolute; inset: 0; display: flex; flex-direction: column;
    text-align: center; z-index: 25;
    background: ${cssRgb(colors.surfaceNight)};
    color: ${cssRgb(colors.textSoft)};
    font-family: ${typography.family};
  `;
  return el;
}

/** A readable pill for text floating over the stage picture. */
function overlayPill(p: HTMLParagraphElement): HTMLParagraphElement {
  p.style.background = `${cssRgb(colors.surfaceNight)}b3`;
  p.style.borderRadius = '14px';
  p.style.padding = '8px 22px';
  p.style.margin = '0';
  return p;
}

/** The live mirrored view both camera screens share: floor circles + buddies
 * painted per frame (playtest fix -- kids must SEE where the circles are).
 * `frame` fills the remaining screen; `overlay` floats labels on the picture. */
interface LiveStageView {
  frame: HTMLDivElement;
  overlay: HTMLDivElement;
  views: Map<Slot, CheckSlotView>;
  /** Function property (not a method) so screens can hand it out detached. */
  setPose: (slot: Slot, pose: BuddyDrawPose | null, tS: number) => void;
  repaint(): void;
  destroy(): void;
}

const STAGE_CANVAS_W = 1280;
const STAGE_CANVAS_H = 720;

function liveStageView(players: PlayerInfo[], testid: string): LiveStageView {
  const frame = document.createElement('div');
  frame.style.cssText =
    'position: relative; flex: 1 1 auto; min-height: 0; width: 100%; display: grid; place-items: center;';
  const canvas = document.createElement('canvas');
  canvas.width = STAGE_CANVAS_W;
  canvas.height = STAGE_CANVAS_H;
  canvas.dataset['testid'] = testid;
  // Replaced element: max-width + max-height scale it to fit the frame while
  // keeping the 16:9 bitmap ratio (no distortion, bars match the night bg).
  canvas.style.cssText = 'display: block; max-width: 100%; max-height: 100%;';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position: absolute; inset: 0; pointer-events: none;';
  frame.append(canvas, overlay);
  const ctx = canvas.getContext('2d');
  const views = new Map<Slot, CheckSlotView>();
  for (const player of players) {
    views.set(player.slot, { color: player.color, pose: null, progress01: 0, ready: false });
  }
  let lastTS = 0;
  let raf: number | null = null;
  const paint = (): void => {
    raf = null;
    if (ctx !== null) {
      const surface: RenderCtx2D = ctx;
      paintCheckStage(surface, STAGE_CANVAS_W, STAGE_CANVAS_H, views, lastTS);
    }
  };
  const schedule = (): void => {
    raf ??= requestAnimationFrame(paint);
  };
  const setPose = (slot: Slot, pose: BuddyDrawPose | null, tS: number): void => {
    const view = views.get(slot);
    if (view === undefined) return;
    view.pose = pose;
    lastTS = tS;
    schedule();
  };
  return {
    frame,
    overlay,
    views,
    setPose,
    repaint: schedule,
    destroy(): void {
      if (raf !== null) cancelAnimationFrame(raf);
    },
  };
}

/** Start-up check: the mirrored stage shows each kid's circle with their
 * buddy in it; the circle fills green as the full-body second accumulates
 * (DESIGN start-up check: "each circle shows the kid's buddy"). */
export function checkScreen(root: HTMLElement, players: PlayerInfo[]): CheckScreen {
  const el = fullScreen('check-screen');
  const title = heading('Can I see you head to toe?');
  title.style.padding = '12px 0 8px';
  el.append(title);
  const stage = liveStageView(players, 'check-stage');
  el.append(stage.frame);
  // Labels float over the bottom of the picture, one per half.
  const row = document.createElement('div');
  // bottom 64px: clear of the caption strip that appears while lines play.
  row.style.cssText = 'position: absolute; left: 0; right: 0; bottom: 64px; display: flex;';
  stage.overlay.append(row);
  const labels = new Map<Slot, HTMLParagraphElement>();
  const spares = new Set<Slot>();
  // Mirrored stage: slot 0 (image-left) stands on the screen-right, so its
  // label sits over the right half.
  for (const player of [...players].sort((a, b) => b.slot - a.slot)) {
    const cell = document.createElement('div');
    cell.style.cssText = 'flex: 1 1 0; display: grid; place-items: center;';
    const label = overlayPill(note('…'));
    label.dataset['testid'] = `check-problem-${String(player.slot)}`;
    label.style.color = cssRgb(colors[player.color]);
    cell.append(label);
    row.append(cell);
    labels.set(player.slot, label);
  }
  root.append(el);
  return {
    setStatus(slot, problem, progress01): void {
      const label = labels.get(slot);
      const view = stage.views.get(slot);
      if (label === undefined || view === undefined) return;
      view.progress01 = progress01;
      view.ready = problem === null && progress01 >= 1;
      const spare = spares.has(slot);
      label.textContent = spare
        ? ''
        : problem !== null
          ? PROBLEM_LABELS[problem]
          : progress01 >= 1
            ? 'Ready! ✓'
            : 'Hold still…';
      label.style.visibility = spare ? 'hidden' : 'visible';
      stage.repaint();
    },
    setPose: stage.setPose,
    setSpare(slot, spare): void {
      if (spare) spares.add(slot);
      else spares.delete(slot);
    },
    destroy: () => {
      stage.destroy();
      el.remove();
    },
  };
}

export interface WarmupScreen {
  setMove(move: WarmupMoveId, phase: 'prompt' | 'measure'): void;
  /** Live buddy pose for the slot (null while unseen); tS is the motion clock. */
  setPose(slot: Slot, pose: BuddyDrawPose | null, tS: number): void;
  destroy(): void;
}

const MOVE_LABELS: Record<WarmupMoveId, string> = {
  stand: 'Stand tall!',
  statue: 'Freeze like a statue!',
  reach: 'Reach for the sky!',
  arms: 'Airplane arms!',
  squat: 'Froggy squats!',
  hop: 'Bunny hops!',
  run: 'Run run run!',
};

export function warmupScreen(root: HTMLElement, players: PlayerInfo[]): WarmupScreen {
  const el = fullScreen('warmup-screen');
  const title = heading('Wiggle warm-up!');
  title.style.padding = '12px 0 8px';
  el.append(title);
  // The kid watches their own buddy do the moves with them, inside their
  // circle (playtest fix: the moves were text-only before). The move prompt
  // floats big over the top of the picture; the reminder sits at the bottom.
  const stage = liveStageView(players, 'warmup-stage');
  el.append(stage.frame);
  const move = overlayPill(document.createElement('p'));
  move.dataset['testid'] = 'warmup-move';
  move.style.cssText += `
    position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
    font-size: ${px(typography.titlePx)}; color: ${cssRgb(colors.butter)};
  `;
  // Sits above the caption strip (captions land bottom-center while lines
  // are spoken, which during the warm-up is most of the time).
  const hint = overlayPill(note('Stay in your circle and copy the moves!'));
  hint.style.cssText +=
    'position: absolute; bottom: 64px; left: 50%; transform: translateX(-50%); width: max-content;';
  stage.overlay.append(move, hint);
  root.append(el);
  return {
    setMove(id, phase): void {
      move.textContent = MOVE_LABELS[id];
      move.style.opacity = phase === 'measure' ? '1' : '0.75';
    },
    setPose: stage.setPose,
    destroy: () => {
      stage.destroy();
      el.remove();
    },
  };
}

export function resultsScreen(
  root: HTMLElement,
  result: RoundResult,
  players: PlayerInfo[],
): () => void {
  const el = screen('results');
  el.style.background = `${cssRgb(colors.surfaceNight)}e6`;
  el.append(heading(result.coopBonus === true ? 'Team snowstorm!' : 'Great moving!'));
  for (const per of result.perPlayer) {
    const player = players.find((p) => p.slot === per.slot);
    const line = document.createElement('p');
    line.dataset['testid'] = `stars-${String(per.slot)}`;
    const stars = '★'.repeat(Math.min(10, per.stars)) || '·';
    line.textContent = stars + (per.score !== undefined ? ` ${String(per.score)}` : '');
    line.style.cssText = `font-size: ${px(typography.titlePx)}; margin: 0; color: ${cssRgb(
      colors[player?.color ?? 'playerBlue'],
    )};`;
    el.append(line);
  }
  el.append(note('Arms up to play again! (A)'));
  root.append(el);
  return () => {
    el.remove();
  };
}

export function cooldownScreen(root: HTMLElement, lengthS: number): { done: Promise<void> } {
  const el = screen('cooldown');
  el.append(heading('Cool-down stretch time'));
  const bar = document.createElement('div');
  bar.style.cssText = `width: 420px; height: 18px; border-radius: 9px; background: ${cssRgb(colors.surfaceRaised)}; margin: 0 auto; overflow: hidden;`;
  const fill = document.createElement('div');
  fill.style.cssText = `height: 100%; width: 0%; background: ${cssRgb(colors.lavender)}; transition: width 0.5s linear;`;
  bar.append(fill);
  el.append(bar, note('Reach up high… and slowly touch your toes.'));
  root.append(el);
  const startMs = performance.now();
  return {
    done: new Promise((resolve) => {
      const timer = window.setInterval(() => {
        const t01 = Math.min(1, (performance.now() - startMs) / (lengthS * 1000));
        fill.style.width = `${String(Math.round(t01 * 100))}%`;
        if (t01 >= 1) {
          window.clearInterval(timer);
          el.remove();
          resolve();
        }
      }, 500);
    }),
  };
}

export function goodbyeScreen(root: HTMLElement): void {
  const el = screen('goodbye');
  el.append(
    heading('Great moving today!'),
    note('Time for a break. A grown-up can hold P to unlock.'),
  );
  root.append(el);
}

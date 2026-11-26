// Play-flow screens (M1.10): big friendly DOM over the stage. Colors come
// from the theme only; everything spoken is also written (captions handle
// narration; these screens carry their own labels).

import type { PlayerInfo, RoundResult, Slot } from '../games/types';
import type { StartupProblem } from '../motion/startup-check';
import type { WarmupMoveId } from '../motion/warmup-flow';
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
  destroy(): void;
}

/** Start-up check: a circle per kid that fills green as the full-body second
 * accumulates (DESIGN start-up check). */
export function checkScreen(root: HTMLElement, players: PlayerInfo[]): CheckScreen {
  const el = screen('check-screen');
  el.append(heading('Can I see you head to toe?'));
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; gap: 60px; justify-content: center;';
  const rings = new Map<Slot, { ring: HTMLDivElement; label: HTMLParagraphElement }>();
  // Mirrored stage: slot 0 (image-left) stands on the screen-right.
  for (const player of [...players].sort((a, b) => b.slot - a.slot)) {
    const cell = document.createElement('div');
    const ring = document.createElement('div');
    ring.dataset['testid'] = `check-ring-${String(player.slot)}`;
    ring.style.cssText = `
      width: 160px; height: 160px; border-radius: 50%;
      border: 10px solid ${cssRgb(colors[player.color])};
      display: grid; place-content: center; margin: 0 auto;
      font-size: ${px(typography.subtitlePx)};
    `;
    const label = note('…');
    label.dataset['testid'] = `check-problem-${String(player.slot)}`;
    cell.append(ring, label);
    row.append(cell);
    rings.set(player.slot, { ring, label });
  }
  el.append(row);
  root.append(el);
  return {
    setStatus(slot, problem, progress01): void {
      const cell = rings.get(slot);
      if (cell === undefined) return;
      if (problem !== null) {
        cell.label.textContent = PROBLEM_LABELS[problem];
        cell.ring.style.background = 'transparent';
        cell.ring.textContent = '';
      } else {
        cell.label.textContent = progress01 >= 1 ? 'Ready!' : 'Hold still…';
        cell.ring.style.background = `${cssRgb(colors.meadow)}${progress01 >= 1 ? 'ff' : '44'}`;
        cell.ring.textContent = progress01 >= 1 ? '✓' : '';
      }
    },
    destroy: () => {
      el.remove();
    },
  };
}

export interface WarmupScreen {
  setMove(move: WarmupMoveId, phase: 'prompt' | 'measure'): void;
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

export function warmupScreen(root: HTMLElement): WarmupScreen {
  const el = screen('warmup-screen');
  el.append(heading('Wiggle warm-up!'));
  const move = document.createElement('p');
  move.dataset['testid'] = 'warmup-move';
  move.style.cssText = `font-size: ${px(typography.titlePx)}; margin: 0; color: ${cssRgb(colors.butter)};`;
  el.append(move, note('Copy your buddy!'));
  root.append(el);
  return {
    setMove(id, phase): void {
      move.textContent = MOVE_LABELS[id];
      move.style.opacity = phase === 'measure' ? '1' : '0.75';
    },
    destroy: () => {
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

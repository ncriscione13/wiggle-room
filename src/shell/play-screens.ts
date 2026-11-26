// Play-flow screens (M1.10): big friendly DOM over the stage. Colors come
// from the theme only; everything spoken is also written (captions handle
// narration; these screens carry their own labels).

import type { BuddyDrawPose } from '../motion/buddy-pose';
import type { PlayerInfo, RoundResult, Slot } from '../games/types';
import type { StartupProblem } from '../motion/startup-check';
import type { WarmupMoveId } from '../motion/warmup-flow';
import { paintCheckStage, type CheckSlotView, type RenderCtx2D } from '../ui/check-stage';
import { AdaptiveFloorCircle } from '../ui/floor-circles';
import {
  colors,
  cssRgb,
  cssRgba,
  playerColors,
  px,
  typography,
  type ColorToken,
} from '../ui/theme';

/** The camera frame shape, so the stage canvas can match its aspect (phone
 * play round 1: a fixed 16:9 canvas distorted portrait/4:3 pictures). */
export interface CameraShape {
  widthPx: number;
  heightPx: number;
}

/** The shared night-sky backdrop every shell screen sits on. */
const SCREEN_BG = `radial-gradient(120% 90% at 50% 12%, ${cssRgb(colors.surfaceRaised)} 0%, ${cssRgb(
  colors.surfaceNight,
)} 55%, ${cssRgb(colors.surfaceDeep)} 100%)`;

const BASE_STYLE = `
  position: absolute; inset: 0; display: grid; place-content: center;
  gap: 20px; text-align: center; z-index: 25;
  background: ${SCREEN_BG};
  color: ${cssRgb(colors.textSoft)};
  font-family: ${typography.family};
  overflow: hidden;
`;

/** One stylesheet for the whole shell (playtest round 5 polish): screen
 * fade-ins, floating backdrop blobs, springy buttons, star pops. Everything
 * honors prefers-reduced-motion and nothing flashes. */
let shellStylesMounted = false;
function ensureShellStyles(): void {
  if (shellStylesMounted) return;
  shellStylesMounted = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes wrFadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @keyframes wrFloatSoft { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }
    @keyframes wrPop { 0% { transform: scale(0.3); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
    .wr-screen { animation: wrFadeIn 420ms ease-out both; }
    .wr-blob {
      position: absolute; border-radius: 50%; pointer-events: none;
      filter: blur(3px); animation: wrFloatSoft 8s ease-in-out infinite;
    }
    .wr-btn {
      font-family: ${typography.family}; font-size: ${px(typography.subtitlePx)};
      font-weight: 700; color: ${cssRgb(colors.surfaceDeep)};
      background: linear-gradient(180deg, ${cssRgb(colors.ice)} 0%, ${cssRgb(colors.mint)} 100%);
      border: none; border-radius: 999px; padding: 18px 44px; cursor: pointer;
      box-shadow: 0 10px 28px ${cssRgba(colors.surfaceDeep, 0.55)}, inset 0 2px 0 ${cssRgba(colors.surfaceSnow, 0.55)};
      transition: transform 140ms ease, box-shadow 140ms ease;
    }
    .wr-btn:hover { transform: translateY(-2px) scale(1.03); }
    .wr-btn:active { transform: scale(0.96); }
    .wr-face { position: relative; border-radius: 50%; margin: 0 auto; }
    .wr-face::before, .wr-face::after {
      content: ''; position: absolute; top: 34%; width: 12%; height: 12%;
      border-radius: 50%; background: ${cssRgb(colors.surfaceDeep)};
    }
    .wr-face::before { left: 26%; }
    .wr-face::after { right: 26%; }
    .wr-smile {
      position: absolute; left: 32%; right: 32%; top: 48%; height: 22%;
      border: 3px solid ${cssRgb(colors.surfaceDeep)}; border-top: none;
      border-left-color: transparent; border-right-color: transparent;
      border-radius: 0 0 100px 100px;
    }
    .wr-star-pop { display: inline-block; animation: wrPop 480ms ease-out both; }
    @media (prefers-reduced-motion: reduce) {
      .wr-screen, .wr-blob, .wr-star-pop { animation: none; }
      .wr-btn, .wr-btn:hover, .wr-btn:active { transition: none; transform: none; }
    }
  `;
  document.head.appendChild(style);
}

/** Slow drifting color blobs behind content (never on camera screens). */
function addBlobs(el: HTMLElement): void {
  const specs: [ColorToken, string, string, string, string][] = [
    ['lavender', '26vmin', '8%', '12%', '0s'],
    ['ice', '20vmin', '74%', '18%', '-2.6s'],
    ['peach', '16vmin', '16%', '72%', '-5.2s'],
    ['mint', '22vmin', '70%', '70%', '-3.9s'],
  ];
  for (const [token, size, left, top, delay] of specs) {
    const blob = document.createElement('div');
    blob.className = 'wr-blob';
    blob.style.cssText = `
      width: ${size}; height: ${size}; left: ${left}; top: ${top};
      background: ${cssRgba(colors[token], 0.14)}; animation-delay: ${delay};
    `;
    el.append(blob);
  }
}

function screen(testid: string): HTMLDivElement {
  ensureShellStyles();
  const el = document.createElement('div');
  el.dataset['testid'] = testid;
  el.className = 'wr-screen';
  el.style.cssText = BASE_STYLE;
  return el;
}

function heading(text: string): HTMLHeadingElement {
  const h = document.createElement('h2');
  h.textContent = text;
  h.style.cssText = `
    font-size: ${px(typography.subtitlePx + 6)}; margin: 0; font-weight: 800;
    letter-spacing: 0.5px; text-shadow: 0 2px 18px ${cssRgba(colors.lavender, 0.35)};
  `;
  return h;
}

function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = text;
  p.style.cssText = `font-size: ${px(typography.bodyPx)}; margin: 0; color: ${cssRgb(colors.textDim)};`;
  return p;
}

/** A little buddy face icon (pure CSS: eyes + smile), for the pick cards. */
function buddyFace(token: ColorToken, sizePx: number): HTMLDivElement {
  const face = document.createElement('div');
  face.className = 'wr-face';
  face.style.cssText = `width: ${px(sizePx)}; height: ${px(sizePx)}; background: ${cssRgb(colors[token])};`;
  const smile = document.createElement('div');
  smile.className = 'wr-smile';
  face.append(smile);
  return face;
}

/** "Who's playing?" -- the first click doubles as the audio-unlock gesture. */
export function pickPlayers(root: HTMLElement): Promise<1 | 2> {
  return new Promise((resolve) => {
    const el = screen('pick-players');
    addBlobs(el);
    el.append(heading("Who's playing?"));
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; gap: 28px; justify-content: center;';
    for (const count of [1, 2] as const) {
      const button = document.createElement('button');
      button.dataset['testid'] = `pick-${String(count)}`;
      button.className = 'wr-btn';
      button.style.cssText = 'display: grid; gap: 12px; place-items: center; min-width: 220px;';
      const faces = document.createElement('div');
      faces.style.cssText = 'display: flex; gap: 10px;';
      faces.append(buddyFace(playerColors[0], 64));
      if (count === 2) faces.append(buddyFace(playerColors[1], 64));
      const label = document.createElement('span');
      label.textContent = count === 1 ? 'One kid' : 'Two kids';
      button.append(faces, label);
      button.addEventListener('click', () => {
        el.remove();
        resolve(count);
      });
      row.append(button);
    }
    el.append(
      row,
      note('Grown-ups: hold P (or press and hold the top-right corner) for settings.'),
    );
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
  ensureShellStyles();
  const el = document.createElement('div');
  el.dataset['testid'] = testid;
  el.className = 'wr-screen';
  el.style.cssText = `
    position: absolute; inset: 0; display: flex; flex-direction: column;
    text-align: center; z-index: 25;
    background: ${SCREEN_BG};
    color: ${cssRgb(colors.textSoft)};
    font-family: ${typography.family};
  `;
  return el;
}

/** A readable pill for text floating over the stage picture. */
function overlayPill(p: HTMLParagraphElement): HTMLParagraphElement {
  p.style.background = cssRgba(colors.surfaceDeep, 0.72);
  p.style.border = `1px solid ${cssRgba(colors.ice, 0.22)}`;
  p.style.borderRadius = '999px';
  p.style.padding = '8px 22px';
  p.style.margin = '0';
  p.style.backdropFilter = 'blur(4px)';
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

const STAGE_CANVAS_H = 720;
const STAGE_CANVAS_MIN_W = 320;
const STAGE_CANVAS_MAX_W = 1600;

function liveStageView(players: PlayerInfo[], testid: string, camera?: CameraShape): LiveStageView {
  const frame = document.createElement('div');
  frame.style.cssText =
    'position: relative; flex: 1 1 auto; min-height: 0; width: 100%; display: grid; place-items: center;';
  const canvas = document.createElement('canvas');
  // Match the CAMERA's aspect so buddies keep their true proportions on any
  // framing (desktop 4:3, phone landscape, even portrait).
  const aspect = camera !== undefined ? camera.widthPx / camera.heightPx : 16 / 9;
  canvas.height = STAGE_CANVAS_H;
  canvas.width = Math.round(
    Math.min(STAGE_CANVAS_MAX_W, Math.max(STAGE_CANVAS_MIN_W, STAGE_CANVAS_H * aspect)),
  );
  canvas.dataset['testid'] = testid;
  // Replaced element: max-width + max-height scale it to fit the frame while
  // keeping the bitmap ratio (no distortion, bars match the night bg).
  canvas.style.cssText = 'display: block; max-width: 100%; max-height: 100%;';
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position: absolute; inset: 0; pointer-events: none;';
  frame.append(canvas, overlay);
  const ctx = canvas.getContext('2d');
  const views = new Map<Slot, CheckSlotView>();
  const circles = new Map<Slot, AdaptiveFloorCircle>();
  for (const player of players) {
    const adaptive = new AdaptiveFloorCircle(player.slot);
    circles.set(player.slot, adaptive);
    views.set(player.slot, {
      color: player.color,
      pose: null,
      circle: adaptive.update(null, 0),
      progress01: 0,
      ready: false,
    });
  }
  let lastTS = 0;
  let raf: number | null = null;
  const paint = (): void => {
    raf = null;
    if (ctx !== null) {
      const surface: RenderCtx2D = ctx;
      paintCheckStage(surface, canvas.width, canvas.height, views, lastTS);
    }
  };
  const schedule = (): void => {
    raf ??= requestAnimationFrame(paint);
  };
  const setPose = (slot: Slot, pose: BuddyDrawPose | null, tS: number): void => {
    const view = views.get(slot);
    if (view === undefined) return;
    view.pose = pose;
    // The circle glides under the detected kid (phone framings vary too much
    // for a fixed spot); unseen slots drift back to the default.
    const adaptive = circles.get(slot);
    if (adaptive !== undefined) view.circle = adaptive.update(pose, tS);
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
export function checkScreen(
  root: HTMLElement,
  players: PlayerInfo[],
  camera?: CameraShape,
): CheckScreen {
  const el = fullScreen('check-screen');
  const title = heading('Can I see you head to toe?');
  title.style.padding = '12px 0 8px';
  el.append(title);
  const stage = liveStageView(players, 'check-stage', camera);
  el.append(stage.frame);
  if (camera !== undefined && camera.heightPx > camera.widthPx) {
    // Portrait camera: side-by-side circles barely fit. Ask once, kindly.
    const rotate = overlayPill(note('Turn the phone sideways!'));
    rotate.dataset['testid'] = 'rotate-hint';
    rotate.style.cssText +=
      'position: absolute; top: 14px; left: 50%; transform: translateX(-50%); width: max-content;';
    rotate.style.color = cssRgb(colors.butter);
    stage.overlay.append(rotate);
  }
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
      // Solo pick: the spare slot disappears entirely -- circle, buddy and
      // label -- so one kid sees exactly one target (round 3 fix).
      const view = stage.views.get(slot);
      if (view !== undefined && view.hidden !== spare) {
        view.hidden = spare;
        stage.repaint();
      }
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

export function warmupScreen(
  root: HTMLElement,
  players: PlayerInfo[],
  camera?: CameraShape,
): WarmupScreen {
  const el = fullScreen('warmup-screen');
  const title = heading('Wiggle warm-up!');
  title.style.padding = '12px 0 8px';
  el.append(title);
  // The kid watches their own buddy do the moves with them, inside their
  // circle (playtest fix: the moves were text-only before). The move prompt
  // floats big over the top of the picture; the reminder sits at the bottom.
  const stage = liveStageView(players, 'warmup-stage', camera);
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
  addBlobs(el);
  el.append(heading(result.coopBonus === true ? 'Team snowstorm! ❄' : 'Great moving!'));
  for (const per of result.perPlayer) {
    const player = players.find((p) => p.slot === per.slot);
    const line = document.createElement('p');
    line.dataset['testid'] = `stars-${String(per.slot)}`;
    line.style.cssText = `font-size: ${px(typography.titlePx)}; margin: 0; color: ${cssRgb(
      colors[player?.color ?? 'playerBlue'],
    )};`;
    // Stars pop in one by one (the little ceremony IS the reward).
    const starCount = Math.min(10, per.stars);
    if (starCount === 0) line.textContent = '·';
    for (let i = 0; i < starCount; i += 1) {
      const star = document.createElement('span');
      star.className = 'wr-star-pop';
      star.textContent = '★';
      star.style.animationDelay = `${String(i * 120)}ms`;
      line.append(star);
    }
    if (per.score !== undefined) {
      const score = document.createElement('span');
      score.textContent = ` ${String(per.score)}`;
      line.append(score);
    }
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
  addBlobs(el);
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
  addBlobs(el);
  const faces = document.createElement('div');
  faces.style.cssText = 'display: flex; gap: 16px; justify-content: center;';
  faces.append(buddyFace(playerColors[0], 72), buddyFace(playerColors[1], 72));
  el.append(
    faces,
    heading('Great moving today!'),
    note('Time for a break. A grown-up can hold P — or press and hold the top-right corner.'),
  );
  root.append(el);
}

/** The invisible press-and-hold corner that twins the P key on phones. It
 * sits above every screen; the flow fills it in as the hold progresses so a
 * deliberate grown-up gets feedback while a flailing kid sees nothing. */
export function cornerGateZone(root: HTMLElement): HTMLDivElement {
  const zone = document.createElement('div');
  zone.dataset['testid'] = 'corner-gate';
  zone.style.cssText = `
    position: absolute; top: 0; right: 0; width: 84px; height: 84px;
    z-index: 70; touch-action: none; border-bottom-left-radius: 100%;
  `;
  root.append(zone);
  return zone;
}

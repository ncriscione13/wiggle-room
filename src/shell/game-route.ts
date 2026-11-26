// Direct game mount (M1.9): ?game=<id>&input=keyboard assembles a real
// GameContext (keyboard motion, real narrator + audio bus) and runs one
// round. The full flow -- start screen, start-up check, warm-up, live
// camera into games -- is M1.10; this route is how e2e and desk play reach
// a game today, and it stays as the desk-mode entry.

import Phaser from 'phaser';
import { createAudioBus } from '../audio/bus';
import {
  DETECTABLE_WORD_ACTIONS,
  gradeFromKnob,
  loadSightWordPacks,
  wordsForRound,
} from '../learning/packs';
import { KeyboardMotion } from '../motion/keyboard';
import { createNarrator } from '../voice/narrator';
import { cssRgb, colors, playerColors, theme, typography, px } from '../ui/theme';
import type { AgeMode, GameContext, PlayerInfo, RoundResult, Slot } from '../games/types';
import { defaultCalibration } from './profiles';
import { loadGameScene } from './launcher';

export const STAGE_W = 1280;
export const STAGE_H = 720;
const DESK_BODY_LENGTH_IMAGE = 0.2;

function parsePlayers(search: URLSearchParams): PlayerInfo[] {
  const slots: Slot[] = search.get('players') === '2' ? [0, 1] : [0];
  const modes = (search.get('mode') ?? 'little').split(',');
  const grade = gradeFromKnob(search.get('grade'));
  return slots.map((slot) => {
    const mode: AgeMode = modes[slot] === 'big' ? 'big' : 'little';
    return {
      slot,
      color: playerColors[slot],
      mode,
      ...(grade !== undefined ? { grade } : {}),
      calibration: defaultCalibration(mode, DESK_BODY_LENGTH_IMAGE, Date.now()),
    };
  });
}

function renderResults(root: HTMLElement, result: RoundResult, players: PlayerInfo[]): void {
  const panel = document.createElement('div');
  panel.className = 'wr-results';
  panel.dataset['testid'] = 'results';
  const style = document.createElement('style');
  style.textContent = `
    .wr-results {
      position: absolute; inset: 0; display: grid; place-content: center;
      gap: 18px; text-align: center; z-index: 30;
      background: ${cssRgb(colors.surfaceNight)}e6;
      color: ${cssRgb(colors.textSoft)};
      font-family: ${typography.family};
    }
    .wr-results h2 { font-size: ${px(typography.subtitlePx)}; margin: 0; }
    .wr-results .wr-stars { font-size: ${px(typography.titlePx)}; margin: 0; }
    .wr-results p { font-size: ${px(typography.bodyPx)}; margin: 0; }
  `;
  panel.append(style);
  const heading = document.createElement('h2');
  heading.textContent = result.coopBonus === true ? 'Team snowstorm!' : 'Great moving!';
  panel.append(heading);
  for (const per of result.perPlayer) {
    const player = players.find((p) => p.slot === per.slot);
    const line = document.createElement('p');
    line.className = 'wr-stars';
    line.dataset['testid'] = `stars-${String(per.slot)}`;
    const stars = '★'.repeat(Math.min(10, per.stars)) || '·';
    line.textContent = stars + (per.score !== undefined ? ` ${String(per.score)}` : '');
    line.style.color = cssRgb(colors[player?.color ?? 'playerBlue']);
    panel.append(line);
  }
  const hint = document.createElement('p');
  hint.textContent = 'Arms up to play again! (A)';
  panel.append(hint);
  root.append(panel);
}

export async function bootGame(root: HTMLElement, gameId: string): Promise<void> {
  const search = new URLSearchParams(window.location.search);
  root.querySelector('.wr-start')?.remove();

  const players = parsePlayers(search);
  const nowS = (): number => performance.now() / 1000;
  // Keyboard input is binary still/moving, so the calibrated still line
  // applies only to the live kit (wired in the M1.10 flow).
  const motion = new KeyboardMotion(window, nowS);

  const [voice, audio] = await Promise.all([createNarrator(), createAudioBus()]);

  // Audio contexts start suspended until a user gesture; resume on the first.
  const resumeOnce = (): void => {
    void voice.resume();
    void audio.resume();
    window.removeEventListener('pointerdown', resumeOnce);
    window.removeEventListener('keydown', resumeOnce);
  };
  window.addEventListener('pointerdown', resumeOnce);
  window.addEventListener('keydown', resumeOnce);
  voice.onSpeaking((speaking) => {
    audio.setDucked(speaking);
  });

  // Caption strip (comfort: narration always captioned).
  const caption = document.createElement('div');
  caption.dataset['testid'] = 'caption';
  caption.style.cssText = `
    position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
    max-width: 80%; padding: 6px 18px; border-radius: 12px; z-index: 20;
    background: ${cssRgb(colors.surfaceRaised)}cc; color: ${cssRgb(colors.textSoft)};
    font-family: ${typography.family}; font-size: ${px(typography.captionPx)};
    display: none;
  `;
  root.append(caption);
  voice.onCaption((text) => {
    caption.textContent = text ?? '';
    caption.style.display = text === null ? 'none' : 'block';
  });

  // Learning layer (L1): only loaded when a grade is on for someone.
  const packs = players.some((p) => p.grade !== undefined && p.grade !== 'off')
    ? await loadSightWordPacks()
    : null;
  const words =
    packs !== null
      ? wordsForRound(
          packs,
          players.map((p) => p.grade),
          DETECTABLE_WORD_ACTIONS,
        )
      : null;

  const ctx: GameContext = {
    players,
    motion,
    voice,
    audio,
    theme,
    ...(words !== null ? { learning: { words } } : {}),
    // Dynamic difficulty wires up when games report wins/misses (M2).
    difficulty: () => 1,
    finish: (result) => {
      renderResults(root, result, players);
      voice.say('replay.arms-up'); // Little kids can't read the hint
      const off = motion.on('armsUp', () => {
        off();
        window.location.reload();
      });
    },
  };

  const scene = await loadGameScene(gameId, ctx, search);
  if (scene === null) {
    const missing = document.createElement('p');
    missing.textContent = `No game called "${gameId}".`;
    missing.style.cssText = `color:${cssRgb(colors.textSoft)};font-family:${typography.family};text-align:center;margin-top:30vh`;
    root.append(missing);
    return;
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: root,
    width: STAGE_W,
    height: STAGE_H,
    backgroundColor: cssRgb(colors.surfaceNight),
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
  });
}

// The kid flow (M1.10): start -> who's playing -> start-up check -> warm-up
// (new kids only) -> Freeze Dance -> results -> arms-up replay, under the
// session timer (heads-up, cool-down, goodbye) and the parent gate. Keyboard
// input (?input=keyboard) skips the camera screens; the rules live in the
// pure modules this file wires together.

import Phaser from 'phaser';
import { createAudioBus } from '../audio/bus';
import type { Calibration, GameContext, PlayerInfo, RoundResult, Slot } from '../games/types';
import { COOLDOWN_STRETCH_S, STILL_LINE_FROM_WOBBLE_COEFF } from '../motion/config';
import { KeyboardMotion } from '../motion/keyboard';
import type { MotionSource } from '../motion/kit';
import { StartupChecker, STARTUP_VOICE_LINES } from '../motion/startup-check';
import { WarmupFlow } from '../motion/warmup-flow';
import { playerColors, cssRgb, colors, px, theme, typography } from '../ui/theme';
import { createNarrator, type NarratorHandle } from '../voice/narrator';
import { CameraOpenError, createLiveMotion, type LiveMotion } from './live-motion';
import { renderCameraErrorScreen } from './camera-error-screen';
import { loadGameScene } from './launcher';
import { HoldKeyGate } from './parent-gate';
import {
  checkScreen,
  cooldownScreen,
  goodbyeScreen,
  pickPlayers,
  resultsScreen,
  warmupScreen,
} from './play-screens';
import { defaultCalibration, loadProfiles, saveProfiles, type Profile } from './profiles';
import { SessionTimer } from './session';
import { loadSettings, saveSettings, type ParentSettings } from './settings';

export const STAGE_W = 1280;
export const STAGE_H = 720;
const DESK_BODY_LENGTH_IMAGE = 0.2;

const nowS = (): number => performance.now() / 1000;

function mountCaption(root: HTMLElement, voice: NarratorHandle): void {
  const caption = document.createElement('div');
  caption.dataset['testid'] = 'caption';
  caption.style.cssText = `
    position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
    max-width: 80%; padding: 6px 18px; border-radius: 12px; z-index: 40;
    background: ${cssRgb(colors.surfaceRaised)}cc; color: ${cssRgb(colors.textSoft)};
    font-family: ${typography.family}; font-size: ${px(typography.captionPx)};
    display: none;
  `;
  root.append(caption);
  voice.onCaption((text) => {
    caption.textContent = text ?? '';
    caption.style.display = text === null ? 'none' : 'block';
  });
}

function settingsOverlay(
  root: HTMLElement,
  settings: ParentSettings,
  apply: (s: ParentSettings) => void,
): void {
  if (root.querySelector('[data-testid="settings"]') !== null) return;
  const el = document.createElement('div');
  el.dataset['testid'] = 'settings';
  el.style.cssText = `
    position: absolute; inset: 0; display: grid; place-content: center; gap: 16px;
    background: ${cssRgb(colors.surfaceNight)}f0; color: ${cssRgb(colors.textSoft)};
    font-family: ${typography.family}; font-size: ${px(typography.bodyPx)};
    text-align: center; z-index: 60;
  `;
  const title = document.createElement('h2');
  title.textContent = 'Grown-up settings';
  title.style.margin = '0';
  el.append(title);

  const lengthRow = document.createElement('label');
  lengthRow.textContent = 'Session length: ';
  const select = document.createElement('select');
  select.dataset['testid'] = 'settings-length';
  select.style.cssText = `font-size: ${px(typography.bodyPx)};`;
  for (const [label, value] of [
    ['10 minutes', '600'],
    ['20 minutes', '1200'],
    ['30 minutes', '1800'],
    ['No limit', 'none'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.append(option);
  }
  select.value = settings.sessionLengthS === null ? 'none' : String(settings.sessionLengthS);
  lengthRow.append(select);
  el.append(lengthRow);

  const slider = (label: string, value01: number, testid: string): HTMLInputElement => {
    const row = document.createElement('label');
    row.textContent = `${label}: `;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.value = String(Math.round(value01 * 100));
    input.dataset['testid'] = testid;
    row.append(input);
    el.append(row);
    return input;
  };
  const music = slider('Music', settings.musicVol01, 'settings-music');
  const voiceVol = slider('Voice', settings.voiceVol01, 'settings-voice');

  const close = document.createElement('button');
  close.textContent = 'Done';
  close.dataset['testid'] = 'settings-close';
  close.style.cssText = `
    font-family: ${typography.family}; font-size: ${px(typography.bodyPx)};
    color: ${cssRgb(colors.surfaceNight)}; background: ${cssRgb(colors.mint)};
    border: none; border-radius: 16px; padding: 10px 28px; cursor: pointer; margin: 0 auto;
  `;
  close.addEventListener('click', () => {
    const next: ParentSettings = {
      sessionLengthS: select.value === 'none' ? null : Number(select.value),
      musicVol01: Number(music.value) / 100,
      voiceVol01: Number(voiceVol.value) / 100,
    };
    apply(next);
    el.remove();
  });
  el.append(close);
  root.append(el);
}

/** Keyboard flows use desk profiles; live flows use saved ones (creating
 * fresh "Blue"/"Pink" profiles on first play). */
function ensureProfiles(count: 1 | 2, live: boolean): Profile[] {
  const saved = live ? loadProfiles() : [];
  const profiles: Profile[] = [];
  for (const slot of (count === 2 ? [0, 1] : [0]) as Slot[]) {
    const existing = saved.find((p) => p.id === `slot-${String(slot)}`);
    profiles.push(
      existing ?? {
        id: `slot-${String(slot)}`,
        color: playerColors[slot],
        mode: 'little',
        calibration: live ? null : defaultCalibration('little', DESK_BODY_LENGTH_IMAGE, Date.now()),
      },
    );
  }
  return profiles;
}

export async function bootPlay(root: HTMLElement): Promise<void> {
  const search = new URLSearchParams(window.location.search);
  root.querySelector('.wr-start')?.remove();
  const live = search.get('input') !== 'keyboard';

  const count = await pickPlayers(root); // the click is the audio gesture
  const [voice, audio] = await Promise.all([createNarrator(), createAudioBus()]);
  await Promise.all([voice.resume(), audio.resume()]);
  voice.onSpeaking((speaking) => {
    audio.setDucked(speaking);
  });
  mountCaption(root, voice);

  let settings = loadSettings();
  const applySettings = (s: ParentSettings): void => {
    settings = s;
    saveSettings(s);
    audio.setMusicVolume(s.musicVol01);
    voice.setVolume(s.voiceVol01);
  };
  applySettings(settings);
  const gate = new HoldKeyGate(window, nowS, () => {
    settingsOverlay(root, settings, applySettings);
  });
  const gateTimer = window.setInterval(() => {
    gate.tick();
  }, 100);

  const profiles = ensureProfiles(count, live);

  // --- Input: live camera or keyboard stand-ins -------------------------------
  let motion: MotionSource;
  let liveMotion: LiveMotion | null = null;
  if (live) {
    try {
      liveMotion = await createLiveMotion();
    } catch (error) {
      const kind = error instanceof CameraOpenError ? error.kind : 'model';
      renderCameraErrorScreen(root, kind);
      window.clearInterval(gateTimer);
      return;
    }
    motion = liveMotion.kit;
  } else {
    motion = new KeyboardMotion(window, nowS);
  }

  // --- Start-up check (live only; DESIGN: 1 s head-to-ankles) -----------------
  if (liveMotion !== null) {
    const lm = liveMotion;
    const players = profiles.map((p, i) => toPlayerInfo(p, i as Slot));
    const screen = checkScreen(root, players);
    const checkers = new Map<Slot, StartupChecker>(
      players.map((p) => [p.slot, new StartupChecker()]),
    );
    await new Promise<void>((resolve) => {
      const offTap = lm.onFrame((tS, frame, luma) => {
        let allReady = true;
        for (const [slot, checker] of checkers) {
          const view = frame.players[slot];
          const status = checker.update(tS, view, luma);
          screen.setStatus(slot, status.problem, status.progress01);
          if (status.problem !== null) {
            voice.say(STARTUP_VOICE_LINES[status.problem], { player: slot });
          }
          if (!status.ready) allReady = false;
        }
        if (allReady) {
          offTap();
          resolve();
        }
      });
    });
    voice.say('startup.ready');
    screen.destroy();
  }

  // --- Warm-up for kids without calibration (live only) -----------------------
  if (liveMotion !== null && profiles.some((p) => p.calibration === null)) {
    const lm = liveMotion;
    const slots = profiles.map((_, i) => i as Slot);
    const flow = new WarmupFlow({
      slots,
      modes: [profiles[0]?.mode ?? 'little', profiles[1]?.mode ?? 'little'],
    });
    const screen = warmupScreen(root);
    const calibrations = await new Promise<(Calibration | null)[]>((resolve) => {
      const offTap = lm.onFrame((tS, frame) => {
        for (const slot of slots) {
          const view = frame.players[slot];
          if (view.pose !== null && view.seenNow) flow.push(slot, view.pose, tS);
        }
        for (const d of flow.tick(tS)) {
          if (d.type === 'say') voice.say(d.lineId);
          else if (d.type === 'move') screen.setMove(d.move, d.phase);
          else {
            offTap();
            resolve(d.calibrations);
          }
        }
      });
    });
    screen.destroy();
    for (const [i, calibration] of calibrations.entries()) {
      const profile = profiles[i];
      if (profile !== undefined && calibration !== null && profile.calibration === null) {
        profile.calibration = calibration;
      }
    }
    saveProfiles(profiles);
  }

  // Per-kid still lines from calibration (live input only).
  if (liveMotion !== null) {
    for (const [i, p] of profiles.entries()) {
      if (p.calibration !== null) {
        liveMotion.setStillLine(
          i as Slot,
          p.calibration.statueWobbleBlPerS * STILL_LINE_FROM_WOBBLE_COEFF,
        );
      }
    }
  }

  // --- Game loop under the session timer ---------------------------------------
  const sessionKnob = Number(search.get('sessionS') ?? '');
  const sessionTimer = new SessionTimer(
    Number.isFinite(sessionKnob) && sessionKnob > 0 ? sessionKnob : settings.sessionLengthS,
  );
  const sessionTicker = window.setInterval(() => {
    for (const event of sessionTimer.update(nowS())) {
      if (event === 'heads-up') voice.say('wrap.two-minutes');
    }
  }, 500);

  const players = profiles.map((p, i) => toPlayerInfo(p, i as Slot));
  let round = 1;
  for (;;) {
    const result = await playRound(root, players, motion, voice, audio, round);
    if (result === null) break; // scene failed to load
    if (sessionTimer.timeUp) break;
    const removeResults = resultsScreen(root, result, players);
    await waitForArmsUp(motion);
    removeResults();
    round += 1;
  }

  window.clearInterval(sessionTicker);
  voice.say('wrap.cooldown');
  const cooldownKnob = Number(search.get('cooldownS') ?? '');
  await cooldownScreen(
    root,
    Number.isFinite(cooldownKnob) && cooldownKnob > 0 ? cooldownKnob : COOLDOWN_STRETCH_S,
  ).done;
  voice.say('wrap.goodbye');
  goodbyeScreen(root);
  // Parent gate (already running) unlocks via settings; a fresh session is a
  // reload away -- the goodbye screen stays until then (DESIGN: no new game
  // until a parent unlocks).
  liveMotion?.stop();
}

function toPlayerInfo(profile: Profile, slot: Slot): PlayerInfo {
  return {
    slot,
    color: profile.color,
    mode: profile.mode,
    calibration:
      profile.calibration ?? defaultCalibration(profile.mode, DESK_BODY_LENGTH_IMAGE, Date.now()),
    ...(profile.name !== undefined ? { name: profile.name } : {}),
  };
}

function waitForArmsUp(motion: MotionSource): Promise<void> {
  return new Promise((resolve) => {
    const off = motion.on('armsUp', () => {
      off();
      resolve();
    });
  });
}

async function playRound(
  root: HTMLElement,
  players: PlayerInfo[],
  motion: MotionSource,
  voice: NarratorHandle,
  audio: Awaited<ReturnType<typeof createAudioBus>>,
  round: number,
): Promise<RoundResult | null> {
  const search = new URLSearchParams(window.location.search);
  // The scene derives slow-mo from the round number (every 3rd round).
  search.set('round', String(round));
  let resolveResult!: (r: RoundResult) => void;
  const resultPromise = new Promise<RoundResult>((resolve) => (resolveResult = resolve));
  const ctx: GameContext = {
    players,
    motion,
    voice,
    audio,
    theme,
    difficulty: () => 1,
    finish: (result) => {
      resolveResult(result);
    },
  };
  const scene = await loadGameScene('freeze', ctx, search);
  if (scene === null) return null;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: root,
    width: STAGE_W,
    height: STAGE_H,
    backgroundColor: cssRgb(colors.surfaceNight),
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene,
  });
  const result = await resultPromise;
  game.destroy(true);
  return result;
}

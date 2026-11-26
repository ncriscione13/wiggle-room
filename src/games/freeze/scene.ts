// Freeze Dance scene (M1.9): wires the pure FreezeCore to Phaser, the motion
// facade, the narrator and the audio bus. All rules live in core.ts; this
// file only draws and routes. Mirrored stage: slot 0 is the image-left half,
// which lands on the RIGHT of the mirrored screen.

import Phaser from 'phaser';
import {
  FREEZE_SLOWMO_ROUND_INTERVAL_COUNT,
  FREEZE_SNOWSTORM_BURST_S,
  FREEZES_PER_ROUND_COUNT,
  GAME_INTRO_S,
  MUSIC_FADE_S,
} from '../../motion/config';
import { paintBuddy, type BuddyViewport } from '../../ui/buddy';
import { buddyShapes } from '../../ui/buddy-geometry';
import { BuddyReactions } from '../../ui/buddy-state';
import { floorCircleScreen } from '../../ui/floor-circles';
import { colors, phaserColor, typography } from '../../ui/theme';
import type { GameContext, Slot } from '../types';
import { FreezeCore, type FreezeDirective, type PoseCardId } from './core';
import { matchesCard } from './pose-cards';

export const STAGE_W = 1280;
export const STAGE_H = 720;

const SLOTS: readonly Slot[] = [0, 1];

/** Mirrored: image x -> screen x = (1 - x) * width. */
const FULL_VIEWPORT: BuddyViewport = {
  x: 0,
  y: 0,
  width: STAGE_W,
  height: STAGE_H,
  mirrored: true,
};

/** Slot 0 = image-left = screen-right half (mirror!). */
const slotScreenX = (slot: Slot): number => (slot === 0 ? STAGE_W * 0.5 : 0);

interface TestHooks {
  phase: string;
  meters: [number, number];
  stars: [number, number];
  done: boolean;
  /** The word on the current word card (L1 Word Freeze), null between. */
  word?: string | null;
}

declare global {
  interface Window {
    __wiggle?: TestHooks;
  }
}

interface Snowflake {
  dot: Phaser.GameObjects.Arc;
  speed: number;
  drift: number;
}

class FreezeScene extends Phaser.Scene {
  private readonly ctx: GameContext;
  private readonly core: FreezeCore;
  /** THE game clock is the motion clock (ctx.motion.nowS). Live sources
   * zero-base their time, so performance.now() here would put core ticks and
   * motion events whole minutes apart (M1 review blocker). */
  private readonly nowS = (): number => this.ctx.motion.nowS();
  private readonly reactions = [new BuddyReactions(), new BuddyReactions()];
  private snowstormUntilS = -Infinity;
  private firstWinSaid = false;
  private buddyGfx: Phaser.GameObjects.Graphics[] = [];
  private meterGfx!: Phaser.GameObjects.Graphics;
  private cardGfx!: Phaser.GameObjects.Graphics;
  private cardText!: Phaser.GameObjects.Text;
  private snow: Snowflake[] = [];
  private snowing = false;
  private currentCard: PoseCardId | null = null;
  private readonly offs: (() => void)[] = [];
  private wordText!: Phaser.GameObjects.Text;
  private readonly hooks: TestHooks = {
    phase: 'intro',
    meters: [0, 0],
    stars: [0, 0],
    done: false,
    word: null,
  };

  constructor(ctx: GameContext, search: URLSearchParams) {
    super('freeze');
    this.ctx = ctx;
    // Dev/test knobs: shorter rounds; sensible clamps so a typo can't hang.
    const defaultFreezes =
      FREEZES_PER_ROUND_COUNT.min +
      Math.floor(Math.random() * (FREEZES_PER_ROUND_COUNT.max - FREEZES_PER_ROUND_COUNT.min + 1));
    const freezes = Math.min(
      12,
      Math.max(1, Number(search.get('freezes') ?? '') || defaultFreezes),
    );
    const introS = Math.min(
      GAME_INTRO_S,
      Math.max(0.5, Number(search.get('intro') ?? '') || GAME_INTRO_S),
    );
    const round = Math.max(1, Number(search.get('round') ?? '') || 1);
    // Test knob: ?rng=0 pins every random duration to its range minimum so
    // e2e timelines are deterministic.
    const rngPin = search.get('rng');
    this.core = new FreezeCore({
      players: [
        { mode: ctx.players[0]?.mode ?? 'little', active: ctx.players.some((p) => p.slot === 0) },
        { mode: ctx.players[1]?.mode ?? 'little', active: ctx.players.some((p) => p.slot === 1) },
      ],
      freezes,
      slowMo: round % FREEZE_SLOWMO_ROUND_INTERVAL_COUNT === 0,
      // The stop reaches the room after the output delay AND the soft fade
      // (DESIGN "Fair timing": grace starts when the stop is audible).
      audioDelayS: ctx.audio.outputDelayS + MUSIC_FADE_S,
      introS,
      rng: rngPin !== null ? () => Math.min(1, Math.max(0, Number(rngPin))) : Math.random,
      // Learning layer (L1): pre-filtered words from the shell, or pure play.
      ...(ctx.learning !== undefined ? { words: ctx.learning.words } : {}),
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(phaserColor(colors.surfaceDeep));
    // Night-sky backdrop: raised glow up top fading into the deep floor
    // (playtest round 5: the flat navy read as unfinished).
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      phaserColor(colors.surfaceNight),
      phaserColor(colors.surfaceNight),
      phaserColor(colors.surfaceDeep),
      phaserColor(colors.surfaceDeep),
      1,
    );
    bg.fillRect(0, 0, STAGE_W, STAGE_H);

    // Floor circles: one per ACTIVE player only (solo = one circle), at the
    // same shared spot every screen uses (playtest round 4 fix -- the scene
    // used to draw both halves' circles with its own geometry). A soft fill
    // under the stroke makes them read as glowing home spots, not wireframes.
    const floor = this.add.graphics();
    for (const player of this.ctx.players) {
      const c = floorCircleScreen(player.slot, FULL_VIEWPORT);
      floor.fillStyle(phaserColor(colors[player.color]), 0.1);
      floor.fillEllipse(c.cx, c.cy, c.rx * 2, c.ry * 2);
      floor.lineStyle(10, phaserColor(colors[player.color]), 0.16);
      floor.strokeEllipse(c.cx, c.cy, c.rx * 2.12, c.ry * 2.12);
      floor.lineStyle(5, phaserColor(colors[player.color]), 0.55);
      floor.strokeEllipse(c.cx, c.cy, c.rx * 2, c.ry * 2);
    }

    this.buddyGfx = SLOTS.map(() => this.add.graphics());
    this.meterGfx = this.add.graphics();
    this.cardGfx = this.add.graphics();
    this.cardText = this.add
      .text(STAGE_W / 2, 92, '', {
        fontFamily: typography.family,
        fontSize: '28px',
        color: colors.textSoft,
      })
      .setOrigin(0.5, 0);
    // Word Freeze card text: big enough to read from the couch.
    this.wordText = this.add
      .text(STAGE_W / 2, STAGE_H * 0.3, '', {
        fontFamily: typography.family,
        fontSize: '112px',
        fontStyle: 'bold',
        color: colors.butter,
      })
      .setOrigin(0.5);

    // Snow pool (spawned gently during stops; no flashing, slow drift).
    for (let i = 0; i < 40; i += 1) {
      const dot = this.add.circle(-20, -20, 3 + (i % 3), phaserColor(colors.surfaceSnow), 0.8);
      dot.setVisible(false);
      this.snow.push({ dot, speed: 30 + (i % 5) * 10, drift: ((i % 7) - 3) * 6 });
    }

    // Motion -> core.
    this.offs.push(
      this.ctx.motion.on('moving', (e) => {
        this.core.onMoving(e.slot, e.tS);
      }),
      this.ctx.motion.on('still', (e) => {
        this.core.onStill(e.slot, e.tS);
      }),
      // Word Freeze: the UP word's follow-through (L1).
      this.ctx.motion.on('armsUp', (e) => {
        this.core.onArmsUp(e.slot, e.tS);
      }),
    );
    // Phaser never calls a custom destroy(); hook the scene lifecycle so
    // replay rounds don't leak listeners into the shared MotionSource.
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      for (const off of this.offs) off();
    });

    // Buddies wave hello while the intro line plays.
    for (const r of this.reactions) r.trigger('wave', this.nowS());

    window.__wiggle = this.hooks;
  }

  override update(): void {
    const tS = this.nowS();
    for (const slot of SLOTS) this.core.setTracking(slot, this.ctx.motion.tracking(slot));
    for (const directive of this.core.tick(tS)) this.apply(directive, tS);

    this.hooks.phase = this.core.phase();
    this.drawBuddies(tS);
    this.drawMeters();
    this.updateSnow();
    this.checkPoseCard();
  }

  private apply(d: FreezeDirective, tS: number): void {
    switch (d.type) {
      case 'music':
        this.ctx.audio.playMusic(d.id);
        break;
      case 'music-stop':
        this.ctx.audio.stopMusic();
        this.snowing = true;
        break;
      case 'sfx':
        this.ctx.audio.playSfx(d.id);
        break;
      case 'say':
        this.ctx.voice.say(d.lineId, d.player !== undefined ? { player: d.player } : undefined);
        break;
      case 'statue':
        this.reactions[d.slot]?.trigger('statue', tS);
        break;
      case 'wobble':
        this.reactions[d.slot]?.trigger('giggle', tS);
        break;
      case 'unfreeze':
        this.snowing = false;
        this.currentCard = null;
        this.cardText.setText('');
        this.cardGfx.clear();
        this.wordText.setText('');
        this.hooks.word = null;
        for (const r of this.reactions) r.clearStatue();
        break;
      case 'star': {
        this.hooks.stars[d.slot] += 1;
        if (!this.firstWinSaid) {
          // DESIGN "first win within 10 s": the very first star gets praise.
          this.firstWinSaid = true;
          this.ctx.voice.say('game.first-win', { player: d.slot });
        }
        this.reactions[d.slot]?.trigger('cheer', tS);
        const x = slotScreenX(d.slot) + STAGE_W * 0.25;
        const star = this.add
          .text(x, STAGE_H * 0.3, '★', {
            fontFamily: typography.family,
            fontSize: '64px',
            color: colors.butter,
          })
          .setOrigin(0.5);
        this.tweens.add({
          targets: star,
          y: STAGE_H * 0.18,
          alpha: 0,
          duration: 900,
          ease: 'Sine.easeOut',
          onComplete: () => {
            star.destroy();
          },
        });
        break;
      }
      case 'snowstorm':
        // The co-op moment gets its own dense burst that outlives the stop.
        this.snowstormUntilS = tS + FREEZE_SNOWSTORM_BURST_S;
        break;
      case 'pose-card':
        this.currentCard = d.card;
        this.drawPoseCard(d.card);
        break;
      case 'word-card':
        this.drawWordCard(d.word);
        this.hooks.word = d.word;
        break;
      case 'finish':
        this.hooks.done = true;
        this.ctx.finish(d.result);
        break;
    }
  }

  private drawBuddies(tS: number): void {
    for (const slot of SLOTS) {
      const gfx = this.buddyGfx[slot];
      const player = this.ctx.players.find((p) => p.slot === slot);
      if (gfx === undefined) continue;
      gfx.clear();
      if (player === undefined) continue;
      const pose = this.ctx.motion.pose(slot);
      if (pose === null) continue;
      const reaction = this.reactions[slot]?.update(tS) ?? { kind: 'idle' as const, phase01: 0 };
      paintBuddy(gfx, buddyShapes(pose, reaction, player.color, tS), FULL_VIEWPORT);
    }
  }

  private drawMeters(): void {
    this.meterGfx.clear();
    for (const slot of SLOTS) {
      const player = this.ctx.players.find((p) => p.slot === slot);
      if (player === undefined) continue;
      const meter = this.core.meter(slot);
      this.hooks.meters[slot] = meter;
      const x = slotScreenX(slot) + STAGE_W * 0.25 - 150;
      const y = STAGE_H - 46;
      this.meterGfx.fillStyle(phaserColor(colors.surfaceRaised), 1);
      this.meterGfx.fillRoundedRect(x, y, 300, 22, 11);
      if (meter > 0.02) {
        this.meterGfx.fillStyle(phaserColor(colors[player.color]), 1);
        this.meterGfx.fillRoundedRect(x + 3, y + 3, (300 - 6) * meter, 16, 8);
      }
    }
  }

  private updateSnow(): void {
    const dtS = this.game.loop.delta / 1000;
    const bursting = this.nowS() < this.snowstormUntilS;
    for (const [i, flake] of this.snow.entries()) {
      if (!flake.dot.visible) {
        // Gentle drift during stops; a dense (still slow) flurry for the
        // team snowstorm. Never flashing -- just more flakes.
        const spawnPerS = bursting ? 6 : this.snowing ? 0.6 : 0;
        if (spawnPerS > 0 && Math.random() < dtS * spawnPerS) {
          flake.dot.setVisible(true);
          flake.dot.setPosition(Math.random() * STAGE_W, -10 - (i % 5) * 8);
        }
        continue;
      }
      flake.dot.y += flake.speed * dtS * (bursting ? 1.5 : 1);
      flake.dot.x += flake.drift * dtS;
      if (flake.dot.y > STAGE_H + 10) flake.dot.setVisible(false);
    }
  }

  private checkPoseCard(): void {
    if (this.currentCard === null) return;
    for (const slot of SLOTS) {
      const pose = this.ctx.motion.pose(slot);
      // Only a LIVE pose can match (a held coasting pose is not the kid
      // posing; the bonus never comes from a guess).
      if (pose !== null && pose.fresh && matchesCard(pose, this.currentCard)) {
        this.core.setPoseMatched(slot, true);
      }
    }
  }

  /** L1 Word Freeze: a big friendly card with the word, center-high so a
   * frozen kid reads it without moving (that's the point). */
  private drawWordCard(word: string): void {
    const g = this.cardGfx;
    g.clear();
    const w = Math.max(380, 150 + word.length * 62);
    const h = 200;
    const x = (STAGE_W - w) / 2;
    const y = STAGE_H * 0.3 - h / 2;
    g.fillStyle(phaserColor(colors.surfaceRaised), 0.96);
    g.fillRoundedRect(x, y, w, h, 28);
    g.lineStyle(8, phaserColor(colors.butter), 1);
    g.strokeRoundedRect(x, y, w, h, 28);
    this.wordText.setText(word);
  }

  private drawPoseCard(card: PoseCardId): void {
    const g = this.cardGfx;
    g.clear();
    const cx = STAGE_W / 2;
    const cy = 56;
    g.fillStyle(phaserColor(colors.surfaceRaised), 0.95);
    g.fillRoundedRect(cx - 120, cy - 36, 240, 64, 14);
    g.fillStyle(phaserColor(colors.butter), 1);
    // A tiny glyph: enough to read at TV distance with the spoken line.
    if (card === 'star') {
      for (let i = 0; i < 5; i += 1) {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        g.fillCircle(cx - 80 + Math.cos(a) * 16, cy - 4 + Math.sin(a) * 16, 5);
      }
    } else if (card === 'flamingo') {
      g.fillCircle(cx - 80, cy - 12, 10);
      g.fillRect(cx - 82, cy - 4, 4, 22);
    } else if (card === 'tree') {
      g.fillTriangle(cx - 80, cy - 20, cx - 96, cy + 10, cx - 64, cy + 10);
    } else {
      g.fillTriangle(cx - 80, cy - 22, cx - 92, cy + 2, cx - 68, cy + 2);
      g.fillRect(cx - 88, cy + 2, 16, 14);
    }
    this.cardText.setText(`Freeze like a ${card}!`);
  }
}

export function createScene(ctx: GameContext, search: URLSearchParams): Phaser.Scene {
  return new FreezeScene(ctx, search);
}

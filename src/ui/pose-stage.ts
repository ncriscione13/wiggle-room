// Pose stage (M0.3): Phaser draws the NEWEST pose every display refresh and
// never waits on tracking -- update() pulls source.latest(), no awaits, no
// frame coupling (CLAUDE.md rule 2). Display is mirrored via stage-math.

import Phaser from 'phaser';
import { POSE, POSE_CONNECTIONS, type ClipPose } from '../tracking/clip-format';
import type { PoseSource } from '../tracking/pose-source';
import { VISIBILITY_MIN_RATIO } from '../motion/config';
import { colors, phaserColor, playerColors } from './theme';
import { toStageX, toStageY } from './stage-math';

const STAGE_W = 1920;
const STAGE_H = 1080;

class StageScene extends Phaser.Scene {
  private readonly source: PoseSource;
  private gfx: Phaser.GameObjects.Graphics | null = null;
  circlesVisible = false;

  constructor(source: PoseSource) {
    super('pose-stage');
    this.source = source;
  }

  create(): void {
    this.gfx = this.add.graphics();
  }

  override update(): void {
    const gfx = this.gfx;
    if (gfx === null) return;
    gfx.clear();

    if (this.circlesVisible) this.drawFloorCircles(gfx);

    const frame = this.source.latest();
    if (frame === null) return;
    frame.poses.forEach((pose, slot) => {
      if (pose !== null) this.drawSkeleton(gfx, pose, slot);
    });
  }

  /** Debug aid until M1.2 maps the real taped circles: slot 0 left half,
   * slot 1 right half, near the floor line. */
  private drawFloorCircles(gfx: Phaser.GameObjects.Graphics): void {
    const y = STAGE_H * 0.88;
    for (const slot of [0, 1] as const) {
      const token = playerColors[slot];
      gfx.lineStyle(5, phaserColor(colors[token]), 0.6);
      gfx.strokeEllipse(STAGE_W * (slot === 0 ? 0.25 : 0.75), y, 340, 110);
    }
  }

  private drawSkeleton(gfx: Phaser.GameObjects.Graphics, pose: ClipPose, slot: number): void {
    const token = playerColors[slot === 1 ? 1 : 0];
    const color = phaserColor(colors[token]);

    gfx.lineStyle(5, color, 0.9);
    for (const [a, b] of POSE_CONNECTIONS) {
      const pa = pose[a];
      const pb = pose[b];
      if (pa === undefined || pb === undefined) continue;
      if (pa[3] < VISIBILITY_MIN_RATIO || pb[3] < VISIBILITY_MIN_RATIO) continue;
      gfx.lineBetween(
        toStageX(pa, STAGE_W),
        toStageY(pa, STAGE_H),
        toStageX(pb, STAGE_W),
        toStageY(pb, STAGE_H),
      );
    }

    const head = pose[POSE.nose];
    if (head !== undefined && head[3] >= VISIBILITY_MIN_RATIO) {
      gfx.fillStyle(color, 0.95);
      gfx.fillCircle(toStageX(head, STAGE_W), toStageY(head, STAGE_H), 26);
    }
    gfx.fillStyle(color, 0.9);
    for (const idx of [POSE.leftWrist, POSE.rightWrist, POSE.leftAnkle, POSE.rightAnkle]) {
      const p = pose[idx];
      if (p !== undefined && p[3] >= VISIBILITY_MIN_RATIO) {
        gfx.fillCircle(toStageX(p, STAGE_W), toStageY(p, STAGE_H), 12);
      }
    }
  }
}

export interface PoseStage {
  game: Phaser.Game;
  setCirclesVisible(visible: boolean): void;
  /** Render loop's own measured fps (debug overlay M0.4). */
  actualFps(): number;
  destroy(): void;
}

export function mountPoseStage(root: HTMLElement, source: PoseSource): PoseStage {
  const container = document.createElement('div');
  container.setAttribute('data-testid', 'pose-stage');
  Object.assign(container.style, { position: 'fixed', inset: '0', zIndex: '0' });
  root.appendChild(container);

  const scene = new StageScene(source);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    backgroundColor: colors.surfaceNight,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: STAGE_W,
      height: STAGE_H,
    },
    scene: [scene],
  });

  return {
    game,
    setCirclesVisible(visible: boolean): void {
      scene.circlesVisible = visible;
    },
    actualFps(): number {
      return game.loop.actualFps;
    },
    destroy(): void {
      game.destroy(true);
      container.remove();
    },
  };
}

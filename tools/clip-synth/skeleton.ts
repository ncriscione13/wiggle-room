// Procedural kid skeleton (task 0.6): turns a compact BodyState into the full
// 33-point MediaPipe pose. Proportions are rough but consistent; detectors
// normalize by body length (shoulder-mid to hip-mid = exactly 1 BL here).
//
// Conventions: normalized image coords, y DOWN. "left*" landmarks sit at
// SMALLER x, "right*" at larger x (anatomical mirroring doesn't matter to the
// detectors, which treat sides symmetrically).

import { LANDMARK_COUNT, POSE, type ClipPose } from '../../src/tracking/clip-format.ts';

export interface BodyState {
  /** Hip center x. */
  cx: number;
  /** Body length (shoulder-mid to hip-mid) in image units. */
  bl: number;
  /** y of planted feet. */
  groundY: number;
  /** Whole-body rise off the ground (jump), in BL. */
  bodyLiftBl: number;
  /** Hip height multiplier: 1 standing, ~0.55 deep squat. */
  hipHeightRatio: number;
  /** Knee lift per leg, 0..1 (running). Lifts that foot off the ground. */
  kneeLiftL: number;
  kneeLiftR: number;
  /** Arm angle from straight-down, radians: 0 down, PI/2 out, PI up. */
  armAngleL: number;
  armAngleR: number;
  /** Upper-body lateral sway in BL (feet stay planted). */
  swayXBl: number;
}

export const STANDING: BodyState = {
  cx: 0.5,
  bl: 0.17,
  groundY: 0.95,
  bodyLiftBl: 0,
  hipHeightRatio: 1,
  kneeLiftL: 0,
  kneeLiftR: 0,
  armAngleL: 0.12,
  armAngleR: 0.12,
  swayXBl: 0,
};

const LEG_LEN_BL = 1.6; // hip to ankle, standing
const THIGH_BL = 0.8;
const SHIN_BL = 0.8;
const UPPER_ARM_BL = 0.45;
const FOREARM_BL = 0.45;
const SHOULDER_HALF_BL = 0.275;
const HIP_HALF_BL = 0.175;
const NECK_BL = 0.55; // shoulder-mid to nose

export function buildPose(s: BodyState): ClipPose {
  const bl = s.bl;
  const sway = s.swayXBl * bl;
  const lift = s.bodyLiftBl * bl;

  const ankleRestY = s.groundY - lift;
  const hipY = ankleRestY - LEG_LEN_BL * bl * s.hipHeightRatio;
  const hipCx = s.cx + sway * 0.4;
  const shoulderY = hipY - 1.0 * bl; // BL definition
  const shoulderCx = s.cx + sway;

  const points: [number, number, number][] = new Array(LANDMARK_COUNT) as [
    number,
    number,
    number,
  ][];
  const put = (idx: number, x: number, y: number, z = 0): void => {
    points[idx] = [x, y, z];
  };

  // Head cluster.
  const noseX = shoulderCx;
  const noseY = shoulderY - NECK_BL * bl;
  put(POSE.nose, noseX, noseY);
  put(POSE.leftEyeInner, noseX - 0.04 * bl, noseY - 0.06 * bl);
  put(POSE.leftEye, noseX - 0.07 * bl, noseY - 0.06 * bl);
  put(POSE.leftEyeOuter, noseX - 0.1 * bl, noseY - 0.06 * bl);
  put(POSE.rightEyeInner, noseX + 0.04 * bl, noseY - 0.06 * bl);
  put(POSE.rightEye, noseX + 0.07 * bl, noseY - 0.06 * bl);
  put(POSE.rightEyeOuter, noseX + 0.1 * bl, noseY - 0.06 * bl);
  put(POSE.leftEar, noseX - 0.14 * bl, noseY - 0.02 * bl);
  put(POSE.rightEar, noseX + 0.14 * bl, noseY - 0.02 * bl);
  put(POSE.mouthLeft, noseX - 0.05 * bl, noseY + 0.1 * bl);
  put(POSE.mouthRight, noseX + 0.05 * bl, noseY + 0.1 * bl);

  // Torso.
  put(POSE.leftShoulder, shoulderCx - SHOULDER_HALF_BL * bl, shoulderY);
  put(POSE.rightShoulder, shoulderCx + SHOULDER_HALF_BL * bl, shoulderY);
  put(POSE.leftHip, hipCx - HIP_HALF_BL * bl, hipY);
  put(POSE.rightHip, hipCx + HIP_HALF_BL * bl, hipY);

  // Arms. out = direction away from the body center on that side.
  const arm = (
    side: 'L' | 'R',
    shoulderIdx: number,
    elbowIdx: number,
    wristIdx: number,
    handIdx: [number, number, number],
  ): void => {
    const out = side === 'L' ? -1 : 1;
    const theta = side === 'L' ? s.armAngleL : s.armAngleR;
    const sp = points[shoulderIdx];
    if (sp === undefined) throw new Error('shoulder not placed');
    const ex = sp[0] + out * UPPER_ARM_BL * bl * Math.sin(theta);
    const ey = sp[1] + UPPER_ARM_BL * bl * Math.cos(theta);
    put(elbowIdx, ex, ey);
    const wx = ex + out * FOREARM_BL * bl * Math.sin(theta);
    const wy = ey + FOREARM_BL * bl * Math.cos(theta);
    put(wristIdx, wx, wy);
    const hx = wx + out * 0.09 * bl * Math.sin(theta);
    const hy = wy + 0.09 * bl * Math.cos(theta);
    for (const idx of handIdx) put(idx, hx, hy);
  };
  arm('L', POSE.leftShoulder, POSE.leftElbow, POSE.leftWrist, [
    POSE.leftPinky,
    POSE.leftIndex,
    POSE.leftThumb,
  ]);
  arm('R', POSE.rightShoulder, POSE.rightElbow, POSE.rightWrist, [
    POSE.rightPinky,
    POSE.rightIndex,
    POSE.rightThumb,
  ]);

  // Legs.
  const leg = (
    side: 'L' | 'R',
    hipIdx: number,
    kneeIdx: number,
    ankleIdx: number,
    heelIdx: number,
    footIdx: number,
  ): void => {
    const out = side === 'L' ? -1 : 1;
    const lift01 = side === 'L' ? s.kneeLiftL : s.kneeLiftR;
    const hp = points[hipIdx];
    if (hp === undefined) throw new Error('hip not placed');

    let kneeX: number;
    let kneeY: number;
    let ankleX: number;
    let ankleY: number;
    if (lift01 > 0.01) {
      // Running: knee drives up and forward; foot leaves the ground.
      kneeY = hp[1] + THIGH_BL * bl * (1 - 0.56 * lift01);
      kneeX = hp[0] + out * 0.02 * bl + 0.08 * bl * lift01;
      ankleY = kneeY + SHIN_BL * bl * (1 - 0.25 * lift01);
      ankleX = kneeX - 0.04 * bl * lift01;
    } else {
      // Planted foot: ankle on the ground; knee bows out as the kid crouches.
      ankleX = hp[0] + out * 0.02 * bl;
      ankleY = ankleRestY;
      const bow = 0.08 * bl + 0.55 * bl * (1 - s.hipHeightRatio);
      kneeX = hp[0] + out * bow;
      kneeY = (hp[1] + ankleY) / 2 + 0.03 * bl;
    }
    put(kneeIdx, kneeX, kneeY);
    put(ankleIdx, ankleX, ankleY);
    put(heelIdx, ankleX - out * 0.04 * bl, ankleY + 0.03 * bl);
    put(footIdx, ankleX + out * 0.1 * bl, ankleY + 0.04 * bl);
  };
  leg('L', POSE.leftHip, POSE.leftKnee, POSE.leftAnkle, POSE.leftHeel, POSE.leftFootIndex);
  leg('R', POSE.rightHip, POSE.rightKnee, POSE.rightAnkle, POSE.rightHeel, POSE.rightFootIndex);

  return points.map(([x, y, z]) => [x, y, z, 1]);
}

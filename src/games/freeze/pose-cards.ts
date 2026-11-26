// Pose card matching (M1.9; DESIGN Big-kid twist: "Freeze like a...").
// Classifies the buddy pose -- the sanctioned, smoothed drawing pose -- so
// game code still never touches raw landmarks. All tolerances in BL.

import {
  POSE_CARD_CLOSE_HANDS_BL,
  POSE_CARD_FEET_APART_BL,
  POSE_CARD_FOOT_LIFT_BL,
  POSE_CARD_HANDS_HIGH_BL,
  POSE_CARD_WIDE_HANDS_BL,
} from '../../motion/config';
import type { BuddyPose } from '../types';
import type { PoseCardId } from './core';

interface PoseFeatures {
  handsHigh: boolean;
  handsWide: boolean;
  handsClose: boolean;
  feetApart: boolean;
  footLifted: boolean;
}

function features(pose: BuddyPose): PoseFeatures {
  const bl = pose.bodyLengthImage;
  const handHeightL = (pose.hipMid.y - pose.handL.y) / bl;
  const handHeightR = (pose.hipMid.y - pose.handR.y) / bl;
  const handGap = Math.hypot(pose.handL.x - pose.handR.x, pose.handL.y - pose.handR.y) / bl;
  const feetGap = Math.abs(pose.footL.x - pose.footR.x) / bl;
  const footDiff = Math.abs(pose.footL.y - pose.footR.y) / bl;
  return {
    handsHigh: handHeightL >= POSE_CARD_HANDS_HIGH_BL && handHeightR >= POSE_CARD_HANDS_HIGH_BL,
    handsWide: handGap >= POSE_CARD_WIDE_HANDS_BL,
    handsClose: handGap <= POSE_CARD_CLOSE_HANDS_BL,
    feetApart: feetGap >= POSE_CARD_FEET_APART_BL,
    footLifted: footDiff >= POSE_CARD_FOOT_LIFT_BL,
  };
}

export function matchesCard(pose: BuddyPose, card: PoseCardId): boolean {
  const f = features(pose);
  switch (card) {
    case 'star':
      return f.handsHigh && f.handsWide && f.feetApart && !f.footLifted;
    case 'rocket':
      return f.handsHigh && f.handsClose && !f.feetApart && !f.footLifted;
    case 'tree':
      return f.handsHigh && f.handsClose && f.footLifted;
    case 'flamingo':
      return f.footLifted && !f.handsHigh;
  }
}

// Canonical pose-clip format (task 0.6). One format for everything:
// tools/clip-synth writes it, the pose recorder (M0.5) records it, the replay
// source (0.7/M0.2) plays it, and clip tests consume it. Landmarks only --
// never video (privacy).
//
// Coordinates follow MediaPipe's normalized image convention: x right, y DOWN,
// origin top-left, roughly 0..1 inside the frame. visibility is 0..1.

/** [x, y, z, visibility] -- compact to keep long clips small on disk. */
export type ClipLandmark = [number, number, number, number];

/** One detected person: exactly 33 MediaPipe pose landmarks. */
export type ClipPose = ClipLandmark[];

export interface ClipFrame {
  /** Seconds from clip start; strictly increasing. */
  tS: number;
  /** Fixed-length array of pose slots; null = not detected this frame. */
  poses: (ClipPose | null)[];
}

export interface ClipFile {
  version: 1;
  name: string;
  kind: 'synthetic' | 'recorded';
  /** Informational capture rate; timestamps are the truth. */
  nominalFps: number;
  frames: ClipFrame[];
}

export const CLIP_VERSION = 1 as const;
export const LANDMARK_COUNT = 33;

/** MediaPipe BlazePose landmark indices (the full 33-point topology). */
export const POSE = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export type PoseLandmarkName = keyof typeof POSE;

/**
 * Body-only skeleton topology for drawing (head is rendered as a dot at the
 * nose, not with face edges). Used by the stage, the debug overlay and the
 * recorder preview.
 */
export const POSE_CONNECTIONS: readonly [number, number][] = [
  [POSE.leftShoulder, POSE.rightShoulder],
  [POSE.leftShoulder, POSE.leftHip],
  [POSE.rightShoulder, POSE.rightHip],
  [POSE.leftHip, POSE.rightHip],
  [POSE.leftShoulder, POSE.leftElbow],
  [POSE.leftElbow, POSE.leftWrist],
  [POSE.rightShoulder, POSE.rightElbow],
  [POSE.rightElbow, POSE.rightWrist],
  [POSE.leftHip, POSE.leftKnee],
  [POSE.leftKnee, POSE.leftAnkle],
  [POSE.rightHip, POSE.rightKnee],
  [POSE.rightKnee, POSE.rightAnkle],
  [POSE.leftAnkle, POSE.leftHeel],
  [POSE.leftHeel, POSE.leftFootIndex],
  [POSE.leftAnkle, POSE.leftFootIndex],
  [POSE.rightAnkle, POSE.rightHeel],
  [POSE.rightHeel, POSE.rightFootIndex],
  [POSE.rightAnkle, POSE.rightFootIndex],
];

/** Returns a list of problems; empty = valid. Checks structure, not physics.
 * The input is typically parsed JSON, so runtime values may violate the type
 * -- every field is treated as untrusted (review fix). */
export function validateClipFile(clip: ClipFile): string[] {
  const problems: string[] = [];
  const version: number = clip.version;
  if (version !== CLIP_VERSION) problems.push(`unknown version ${String(version)}`);
  const name: unknown = clip.name;
  if (typeof name !== 'string' || name === '') problems.push('missing name');
  const kind: unknown = clip.kind;
  if (kind !== 'synthetic' && kind !== 'recorded') problems.push('kind must be synthetic|recorded');
  if (!(clip.nominalFps > 0)) problems.push('nominalFps must be > 0');
  if (!Array.isArray(clip.frames)) return [...problems, 'frames missing'];
  if (clip.frames.length === 0) problems.push('no frames');

  let lastT = -Infinity;
  for (const [i, frame] of clip.frames.entries()) {
    if (typeof frame !== 'object' || !Array.isArray((frame as { poses?: unknown }).poses)) {
      problems.push(`frame ${String(i)}: not a {tS, poses} object`);
      break;
    }
    if (!(frame.tS > lastT)) {
      problems.push(`frame ${String(i)}: tS ${String(frame.tS)} not strictly increasing`);
      break; // one report is enough; a broken clock would spam
    }
    lastT = frame.tS;
    for (const [slot, pose] of frame.poses.entries()) {
      if (pose === null) continue;
      if (pose.length !== LANDMARK_COUNT) {
        problems.push(
          `frame ${String(i)} slot ${String(slot)}: ${String(pose.length)} landmarks, expected ${String(LANDMARK_COUNT)}`,
        );
        break;
      }
      for (const [x, y, , v] of pose) {
        // Generous bounds: joints may leave the frame, but not absurdly.
        if (x < -1 || x > 2 || y < -1 || y > 2 || v < 0 || v > 1) {
          problems.push(`frame ${String(i)} slot ${String(slot)}: landmark out of bounds`);
          break;
        }
      }
    }
  }
  return problems;
}

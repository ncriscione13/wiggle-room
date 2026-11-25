// Camera (M0.1): getUserMedia at 640x480, ideal 60 fps, front-facing. The
// video element is kept off-screen but playing -- the display shows buddies
// and skeletons, never the feed (DESIGN: frames are processed in memory and
// discarded). Mirroring is a render-time concern (x -> 1 - x on screen);
// landmarks stay in raw camera coordinates.

import { CAMERA_HEIGHT_PX, CAMERA_TARGET_FPS_HZ, CAMERA_WIDTH_PX } from '../motion/config';

export type CameraErrorKind = 'denied' | 'not-found' | 'busy' | 'insecure' | 'unknown';

export class CameraOpenError extends Error {
  readonly kind: CameraErrorKind;

  constructor(kind: CameraErrorKind, cause: unknown) {
    super(`camera could not start (${kind})`, { cause });
    this.name = 'CameraOpenError';
    this.kind = kind;
  }
}

export function mapCameraError(error: unknown): CameraErrorKind {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'denied';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'not-found';
      case 'NotReadableError':
      case 'TrackStartError':
      case 'AbortError':
        return 'busy';
      case 'SecurityError':
        return 'insecure';
      default:
        return 'unknown';
    }
  }
  return 'unknown';
}

export interface CameraHandle {
  video: HTMLVideoElement;
  stream: MediaStream;
  /** What the camera actually delivered (may differ from the request). */
  widthPx: number;
  heightPx: number;
  fps: number;
  stop(): void;
}

export interface CameraRequest {
  /** Requested size; defaults to the config values. M0.6 retries smaller. */
  widthPx?: number;
  heightPx?: number;
}

export async function openCamera(request: CameraRequest = {}): Promise<CameraHandle> {
  if (!('mediaDevices' in navigator)) {
    throw new CameraOpenError('insecure', new Error('navigator.mediaDevices missing'));
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: request.widthPx ?? CAMERA_WIDTH_PX },
        height: { ideal: request.heightPx ?? CAMERA_HEIGHT_PX },
        frameRate: { ideal: CAMERA_TARGET_FPS_HZ },
        facingMode: 'user',
      },
    });
  } catch (error) {
    throw new CameraOpenError(mapCameraError(error), error);
  }

  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.autoplay = true;
  // Off-screen but rendered: display:none can throttle video frame delivery.
  Object.assign(video.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    pointerEvents: 'none',
  });
  video.srcObject = stream;
  document.body.appendChild(video);
  try {
    await video.play();
  } catch (error) {
    stream.getTracks().forEach((t) => {
      t.stop();
    });
    video.remove();
    throw new CameraOpenError('unknown', error);
  }

  const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
  return {
    video,
    stream,
    widthPx: settings.width ?? video.videoWidth,
    heightPx: settings.height ?? video.videoHeight,
    fps: Math.round(settings.frameRate ?? 0),
    stop(): void {
      stream.getTracks().forEach((t) => {
        t.stop();
      });
      video.srcObject = null;
      video.remove();
    },
  };
}

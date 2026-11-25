// Single source of asset URLs (task 0.5). The app loads the pose model and
// the MediaPipe wasm ONLY from its own origin -- the local copies created by
// `npm run fetch-models` and the postinstall step. Never a CDN.
//
// BASE_URL is '/' in dev and '/wiggle-room/' on GitHub Pages; Vite guarantees
// a trailing slash.

export function assetUrl(path: string, base: string = import.meta.env.BASE_URL): string {
  return base + path.replace(/^\//, '');
}

export function poseModelUrl(): string {
  return assetUrl('models/pose_landmarker_lite.task');
}

export function mediapipeWasmRoot(): string {
  return assetUrl('mediapipe');
}

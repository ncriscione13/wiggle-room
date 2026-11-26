# Assets

Every third-party file that ships with Wiggle Room, with its source and
license. Only CC0, Apache-2.0 or self-made assets are allowed (see DESIGN.md
"Open-source setup"). Add a row for every new asset.

| Asset                       | Where                                                                 | Source                                                                                             | License              |
| --------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| `pose_landmarker_lite.task` | `public/models/` (via `npm run fetch-models`)                         | [MediaPipe Pose Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker) | Apache-2.0           |
| MediaPipe wasm runtime      | `public/mediapipe/` (via postinstall, from `@mediapipe/tasks-vision`) | [MediaPipe Tasks](https://github.com/google-ai-edge/mediapipe)                                     | Apache-2.0           |
| `icon.svg`                  | `public/`                                                             | self-made placeholder (replaced in M4.1)                                                           | Apache-2.0 (project) |
| Voice clips (99 wav)        | `public/voice/clips/` (via `npm run voice`)                           | Rendered in-repo with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0 weights) | CC0 (project)        |
| Music loops + sfx (7 wav)   | `public/audio/` (via `npm run audio`)                                 | Synthesized in-repo by `tools/audio-gen` (placeholder until M4.1 replaces them with nicer tracks)  | CC0 (project)        |

Planned (added with their tasks): game art (M4.1), nicer music (M4.1).

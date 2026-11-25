# Decisions and deviations log

Newest entries at the top. Each entry: date, task, what was decided, why.

## 2026-11-25 — 0.8/0.9 — Repo, CI, docs

- **GitHub repo**: public `ncriscione13/wiggle-room`, Pages enabled with build_type
  "workflow" via the API. CI caches the pose model (key `pose-model-v1` — bump to force a
  re-download) and the Playwright browser (keyed on package-lock).
- **Action versions** pinned to the majors current at setup (checkout@v4, setup-node@v4,
  cache@v4, configure-pages@v5, upload-pages-artifact@v3, deploy-pages@v4); bump when
  GitHub deprecates.
- **LICENSE** is the unmodified canonical Apache-2.0 text; per-file headers are not used
  (repo-level license + ASSETS.md tracking instead).

## 2026-11-25 — 0.7 — Test harness

- **Clip serving is dev/preview middleware, not shipped assets**: a tiny Vite plugin maps
  `/clips/<name>.json` to `test/clips/{real,synthetic}` for the dev server and `vite
preview` (which e2e runs against). Production builds contain no clips; replay mode is a
  dev/test tool. Real-kid recordings (M0.5+) load via drag-and-drop or the same URL mode
  locally.
- **`test/helpers/clip-runner.ts` is the detector-test harness**: `loadClip(name)` prefers
  a real recording, falls back to the generated file, else builds the synthetic clip
  in memory (no disk writes → no test-worker races). `runOverClip(clip, sink)` returns
  events + per-name counts for "exactly N events" assertions.
- **`?clip=<name>` shorthand accepted** in addition to `?source=replay&clip=` (PLAN M0.5
  mentions `?clip=`). Clip names must be `[a-z0-9-]` slugs; anything else falls back to
  the camera, and the loader refuses suspicious names before fetching.
- **Playwright global setup** generates synthetic clips if missing (single process, no
  races) and every browser launches with the fake-camera flags.
- **`src/assets/loader.ts`** (the one allowed fetch) validates clip JSON before returning;
  the replay badge shows ready/error states so failures are visible, not silent.

## 2026-11-25 — 0.6 — Synthetic clips and the canonical clip format

- **Clip format lives in `src/tracking/clip-format.ts`** and is shared by the generator,
  the replay source (0.7), the pose recorder (M0.5) and all clip tests. Frames are
  `{ tS, poses }` with compact `[x, y, z, visibility]` landmark tuples (33 per pose,
  MediaPipe normalized image coords, y down), `tS` in strictly-increasing seconds.
- **Clips are generated artifacts**: gitignored, rebuilt deterministically by
  `npm run clips:synth` (seeded per clip name; the 10-min two-kid clip is ~36 MB on disk,
  too big for git). Tests build clips in memory from the same code.
- **PLAN's "running at 2 and 3 steps/s" became two clips** (`run-2sps-10s`,
  `run-3sps-10s`), so the catalog has 9 files for the 8 scenarios.
- **Noise model** (applied to every clip): Gaussian jitter sigma 0.0025, visibility
  0.92±0.04, 0.8% dropped points (vis < 0.5), rare (0.08%) single-frame outlier spikes up
  to 0.2 units — detectors must reject these per CLAUDE.md rule 6, so the test-side pulse
  counters median-filter and require 2-frame persistence.
- **Skeleton proportions**: shoulder-mid→hip-mid is exactly 1 BL; legs 1.6 BL; arms
  0.45+0.45 BL. "left*" landmarks sit at smaller x (anatomical mirroring is irrelevant
  to detectors, which treat sides symmetrically).
- **Node ESM lesson**: tools that run under plain `node` need explicit `.ts` extensions
  on relative imports (Vite/Vitest resolve extensionless; Node does not). `src/` stays
  extensionless (bundler convention); `tools/` uses `.ts` extensions.

## 2026-11-25 — 0.5 — Offline assets

- **The live `pose_landmarker_lite.task` (5,777,746 bytes) starts with 2 zero bytes before
  the zip "PK" magic.** The validator scans the first 8 bytes for the magic instead of
  requiring offset 0; a test pins the observed layout.
- **Model and wasm are gitignored, restored by tooling**: `npm run fetch-models`
  (idempotent, validates, `--force` to re-download) and the postinstall wasm copy. CI runs
  both (0.8), so clones and CI never depend on committed binaries.
- **Both MediaPipe 1.2.3 wasm variants are copied** (`vision_wasm_internal` and
  `vision_wasm_module_internal`, ~14.7 MB each): FilesetResolver picks at runtime.
  Offline precache is ~35 MB total (model + wasm) — deliberate, it's the whole point of
  the PWA; `maximumFileSizeToCacheInBytes` raised to 20 MB.
- **`src/assets/paths.ts`** is the single source of asset URLs, BASE_URL-aware so one
  build works at `/` and `/wiggle-room/`.

## 2026-11-25 — 0.4 — Skeleton, stubs, start screen

- **Config test strategy**: hard safety/comfort/tracking invariants (visibility 0.5,
  outlier 1 BL/frame, debounce 0.15 s, coasting 1 s, reacquire 0.3 s, squat 0.75, jump
  cancel 0.15 BL, grace windows, full lag budget, flash ceiling, difficulty 3-up/2-down)
  are pinned to DESIGN.md's exact numbers — changing one deliberately means editing
  config + test + this log. Tunable gameplay numbers (music gaps, race lengths, round
  lengths) get structural checks only, because playtest tuning is the expected workflow.
- **Unit convention**: every config constant name ends in `_S`, `_BL`, `_RATIO`,
  `_PER_S`, `_PX`, `_HZ`, `_DAYS` or `_COUNT` (test-enforced). All times in seconds.
- **Game contract refinements** (per CLAUDE.md "refine in Phase 0"): added
  `TrackingState`, `MotionEvent`/`MotionEventHandler` (with `tS` monotonic seconds),
  `BuddyPose` (named joints, normalized to the player's half — games draw the buddy
  without ever seeing raw landmarks), `Calibration` fields matching the warm-up table
  (BL units), `AudioBus.outputDelayS` (M1.8), `RoundResult`/`PlayerRoundResult`.
  `MotionEvents.on()` returns an unsubscribe function.
- **`AgeMode` lives in `src/games/types.ts`** (the contract requires it there);
  `src/motion/config.ts` imports it **type-only**. Runtime layering stays
  tracking → motion → games; this one upward edge is erased at compile time.
- **Third tsconfig (`tsconfig.e2e.json`)**: Playwright specs run in Node but their
  `page.evaluate` callbacks are browser code, so e2e gets ES2023+DOM libs. App and
  node projects stay DOM-pure and Node-pure respectively.
- **`src/ui/theme.test.ts` joins the color-rule exemption list**: it verifies
  `cssRgb()` output format, which requires writing `rgb(` in an expected string.
- **Start screen layout px values** (circle size, gaps) are presentation CSS, not
  thresholds; they stay inline. Type sizes come from `typography` tokens.

## 2026-11-25 — 0.3 — Guardrail lint rules

- **Guardrails live in `eslint.guardrails.js`**, imported by both `eslint.config.js` and
  `test/lint-guardrails.test.ts`, so the shipped rules and the tested rules can't drift.
- **Added beyond PLAN's list**: `@mediapipe/**` imports are restricted to `src/tracking/`
  (that's the teeth of CLAUDE.md rule 1, which says to enforce the layering with
  no-restricted-imports); `EventSource` and `navigator.sendBeacon` join the network ban
  (same category as fetch/XHR/WebSocket).
- **Color rule mechanics**: string literals and template strings containing `#hex` /
  `rgb()` / `hsl()`, plus exactly-6-digit `0x` numeric literals (Phaser tints). Short hex
  masks like `0xff` stay legal. Known accepted false-positive class: a DOM id selector that
  happens to be 3-8 hex chars (e.g. '#beef') would be flagged — rename or justify with a
  disable comment.
- **Two scoping exemptions**: `src/ui/theme.ts` (colors live there) and
  `test/lint-guardrails.test.ts` (holds forbidden color fixtures as strings; the rule
  still applies to all other test files). `tools/` is exempt from the speech and network
  bans (dev-time code; `fetch-models` downloads the model by design); `src/assets/loader.ts`
  is the single fetch exception per PLAN 0.3.
- **One documented cast** in the guardrail test: typescript-eslint's parser/plugin types
  aren't assignable to eslint core's `Linter.Config` (runtime-compatible; known ecosystem
  gap) — bridged with `as unknown as`, no `any`.

## 2026-11-25 — 0.2 — Scripts, placeholders, @eslint/js

- **`bench` and `voice` are honest placeholders**: they print which task delivers them
  (M1.1 / M1.6) and exit 1, so nobody mistakes "ran" for "passed". They are not part of
  `check`.
- **`@eslint/js` added as a dev dependency** (exact-pinned 10.0.1): ESLint 10 moved its
  recommended ruleset into this separate first-party package and no longer ships it. It is
  ESLint-team-owned plumbing for the "eslint" dependency PLAN 0.1 names, not a new library;
  flagged in the Phase 0 report.
- **Lint strictness**: typescript-eslint `strictTypeChecked` on all TS files with
  `--max-warnings 0`, plus `prettier --check` inside `npm run lint`. Guardrail rules land
  in 0.3.
- **`npm run e2e` requires a prior build** (Playwright serves `vite preview`); `check` runs
  build before e2e, so the gate always tests the production bundle.
- **Prettier formats markdown too**: PLAN.md/DESIGN.md got reformatted once by
  `npm run format`; content unchanged.

## 2026-11-25 — 0.1 — Version pins and scaffold choices

- **Exact version pins** (no ranges; the lockfile is committed): vite 8.3.8, typescript 6.0.3,
  phaser 4.2.1, @mediapipe/tasks-vision 1.2.3, vitest 5.1.2, @playwright/test 1.65.1,
  eslint 10.15.0, typescript-eslint 8.74.0, prettier 3.10.1, vite-plugin-pwa 2.0.0,
  @vitejs/plugin-basic-ssl 2.3.0, @types/node 26.6.10.
- **TypeScript 6.0.3, not 7.x**: typescript-eslint 8.74.0 declares peer support
  `typescript >=4.8.4 <6.1.0`, so the new native TS 7 compiler is out until the lint
  toolchain supports it.
- **Phaser 4** (latest stable, per CLAUDE.md "latest stable"). If its API fights the M0/M1
  work in practice, dropping to Phaser 3.90 is the fallback — would be logged here.
- **MediaPipe tasks-vision 1.2.3**: latest stable (1.3.x is still RC-only).
- **npm audit: 4 moderates accepted**: all in workbox-build's internal glob/minimatch
  (build-time service-worker generation only, processes our own files, never shipped to the
  browser). The offered "fix" downgrades vite-plugin-pwa below Vite 8 support. Revisit when
  workbox-build updates its glob.
- **One color literal outside theme.ts**: `index.html` paints a bootstrap background
  (`#2b3045`) before any JS loads, so the first frame is never pure white (design comfort
  rule). It mirrors `surfaceNight` in `src/ui/theme.ts` (created in 0.4) and is commented in
  both places. The lint color rule (0.3) covers TS sources; this HTML literal is the single
  documented exception.
- **`.gitattributes` forces LF** for all text files: Windows dev + Linux CI + Prettier
  would otherwise fight over CRLF.
- **Placeholder app icon** (`public/icon.svg`): replaced in the M4.1 art pass.
- **Tests-first note for 0.1/0.2**: the scaffold and scripts tasks have no app logic to
  unit-test; their acceptance is the toolchain itself running. The first real tests land in
  0.3 (lint guardrail tests) and every task after that is tests-first.

## 2026-11-25 — Prep — Repo root is `motion-room`, GitHub repo will be `wiggle-room`

The starter files arrived in `wiggle-room-starter/` inside `C:\Dev\motion-room`. Claude Code and the
user's workflow treat `C:\Dev\motion-room` as the project root, so the starter files were moved up
and the repo was initialized there. The local folder name doesn't affect anything; the GitHub repo
(created in task 0.8) is named `wiggle-room`, which is what sets the GitHub Pages URL and the Vite
`base` path. Approved by Nick in the Phase 0 plan OK.

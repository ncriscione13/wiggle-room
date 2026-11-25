# Decisions and deviations log

Newest entries at the top. Each entry: date, task, what was decided, why.

## 2026-11-25 — M0.2b — LivePoseSource

- **The next `requestVideoFrameCallback` is registered only after a frame is fully
  processed**: exactly one `detectForVideo` per delivered frame, and if inference runs
  long the skipped camera frames are simply never seen — no queue (CLAUDE.md rule 2).
- **GPU delegate with CPU fallback**: DESIGN wants lite-on-GPU; if GPU init throws
  (headless CI, odd drivers) the landmarker retries on CPU and the overlay/chip shows
  which delegate is live. The M0.6 device check judges whether the result is fast enough.
- **Slot = detection order for M0** — circle-based player binding replaces it in M1.2
  (noted in code).
- **Missing `visibility` defaults to 1**: an absent field means "not reported", not
  "invisible"; gating on a false 0 would wrongly discard whole poses.
- **MonotonicClock bumps repeats by 1 µs** (MediaPipe VIDEO mode rejects non-increasing
  timestamps, and the bump survives its internal ms→µs conversion).
- **The landmarker is injected into LivePoseSource** (structural `VideoLandmarker`
  type): the loop stays testable and the app owns the landmarker's lifecycle.
- The live e2e proves the pipeline runs against the fake camera (frames counted on CPU
  fallback in headless CI); real tracking-speed acceptance is Nick's M0.6 device check.

## 2026-11-25 — M0.1 — Camera

- **The camera video element is off-screen but rendered** (fixed, left:-10000px), never
  `display:none`: hidden videos can have frame delivery throttled, which would starve
  `requestVideoFrameCallback`. The display never shows the feed (DESIGN privacy); only
  skeletons/buddies are drawn, mirrored at render time (x → 1−x) while landmarks stay in
  raw camera coordinates.
- **Two extra error kinds beyond PLAN's three**: `insecure` (no mediaDevices /
  SecurityError — points at the https/dev:lan requirement) and `unknown` (catch-all).
  Copy is tested for tone (no "error"/"fail", always "try again").
- **Actual resolution/fps shows in a corner chip** until the M0.4 overlay exists, then
  moves there (PLAN wording says "in the overlay", which arrives three tasks later).
- **`openCamera` takes a size override** so the M0.6 device check can retry at smaller
  input sizes without new plumbing.

## 2026-11-25 — M0.2a — PoseSource interface + ReplayPoseSource

- **`PoseFrame.tS` is the source's own monotonic clock**, starting near 0: live =
  performance.now-based; replay = the replayed timeline (clip time ÷ speed), so at
  `speed: 2` timestamps arrive wall-clock-paced at half the clip values and overlay
  timings stay truthful. Detector clip tests bypass the replay source entirely (they feed
  frames directly via the clip-runner), so clip-time fidelity for detectors is unaffected.
- **Replay loop mode** continues timestamps across the seam (+ one nominal frame gap),
  keeping `tS` strictly increasing for downstream consumers.
- **Injectable `now()` clock** in ReplayPoseSource so the timing tests are exact under
  fake timers instead of sleeping.
- **`?speed=` URL param** (clamped 0.25–4) added to replay source-config for the M0.3
  render stress test.

## 2026-11-25 — Phase 0 fresh-eyes review — 10 fixes + 1 logged decision

An independent review agent audited the whole phase. Fixed:

- **Node floor raised to `^22.18.0 || >=24`** (was >=22.12): bare `node tools/*.ts` needs
  Node's type stripping (22.18+/24); on 22.12–22.17 `npm install` itself died in
  postinstall. README now names the requirement. (IMPORTANT)
- **PWA manifest colors**: vite-plugin-pwa's defaults leaked a pure-white
  `background_color` (the installed app's splash — comfort-rule violation) and a foreign
  green `theme_color`. Both now come from `theme.colors.surfaceNight`, pinned by
  `e2e/manifest.spec.ts` against the built output. (IMPORTANT)
- **Guardrail wiring test**: the lint tests proved the rules work but not that
  `eslint.config.js` ships them; a new test asserts every `guardrail/*` entry is present
  in the shipped config (via `eslint.config.d.ts`).
- **CI guard test** now matches `- run: npm run check` as a real step, not a comment.
- **`fileURLToPath`** replaces `URL.pathname` in the guardrail test so clone paths with
  spaces don't break all guardrail tests.
- **Three missing DESIGN numbers added to config** (+pins): `GAME_INTRO_S = 10`,
  `COOLDOWN_STRETCH_S = 60`, `RAINBOW_BURST_POPS_COUNT = 5`.
- **Color guardrail covers `.tsx/.js/.mjs/.cjs`** too, closing a future-file loophole.
- **CI also runs on `pull_request`** so fork PRs get the gate (beyond PLAN 0.8's letter;
  a same-repo PR may run twice — accepted).
- **New layering guardrail**: `src/motion/**` may not runtime-import from `src/games/**`
  (type-only imports allowed — the documented AgeMode edge), with tests both ways.
- **`loadClipWithSource`** exposes which clip source a test consumed (real file /
  synthetic file / in-memory), so pinned-count detector tests can name it on failure.

Logged, not changed: **service-worker update strategy stays `autoUpdate`**
(skipWaiting + clientsClaim + cleanupOutdatedCaches). Today the app is one eager bundle,
so version skew can't strand a running page. When M3 introduces lazy game chunks
(`import.meta.glob`), an update landing mid-session could delete chunks an open page
still wants — revisit then: likely keep autoUpdate but reload on `controllerchange` at a
safe moment (between rounds), since an update prompt is wrong for a kids' TV app.

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

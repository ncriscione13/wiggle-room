# Wiggle Room — build plan

Claude Code works through this file top to bottom, one task at a time, following the build and review loop in `CLAUDE.md`. Every task is done only when `npm run check` passes, the self-review checklist is clean, the box is ticked and the work is committed. Every phase ends with a fresh-eyes review and a phase report, then waits for my TV test results.

## How to start (for me)

1. Install, if missing: Node.js LTS, Git, Google Chrome, VS Code, Claude Code, and a GitHub account.
2. Create an empty folder named `wiggle-room` and put these files in it: `CLAUDE.md`, `PLAN.md`, `docs/DESIGN.md`.
3. Open the folder in VS Code, open the terminal and start Claude Code.
4. Paste this prompt:

```
Read CLAUDE.md, PLAN.md and docs/DESIGN.md fully. Then work through PLAN.md starting at Phase 0, one task at a time, following the build and review loop in CLAUDE.md exactly. Before starting each phase, show me a short plan for that phase and wait for my OK. After each task: write tests first, run npm run check until green, self-review against the checklist, tick the box in PLAN.md, log decisions in docs/DECISIONS.md, and commit. At the end of each phase: run a fresh-eyes review with a separate review agent, fix what it finds, write the phase report, and stop with the exact list of things I need to test on the TV.
```

## My tasks (things only a person can do)

- [ ] Tape two circles on the floor, about 4 ft apart, 7–9 ft from the laptop (4–8 ft with a wide-angle webcam)
- [ ] Put the TV in Game Mode and turn off motion smoothing; set the laptop to show on the TV only at 1080p, 60 Hz
- [ ] After M0: record movement clips with the kids (list in M0.8) and run the slow-motion lag test
- [ ] After M1–M3: run kid playtests and send notes (what confused them, any "it didn't see me", whether they asked to play again)

---

## Phase 0: Setup and guardrails

Goal: an empty but fully guarded project. Every later task gets checked automatically.

- [x] 0.1 Scaffold Vite + TypeScript (strict) in the repo root, keeping CLAUDE.md, PLAN.md and docs/. Install: phaser, @mediapipe/tasks-vision, vitest, @playwright/test, eslint, prettier, vite-plugin-pwa, @vitejs/plugin-basic-ssl. Create `docs/DECISIONS.md`.
- [x] 0.2 npm scripts: `dev`, `dev:lan` (HTTPS, `--host`), `build`, `preview`, `test`, `lint`, `typecheck`, `e2e`, `bench`, `voice`, and `check` (typecheck + lint + test + build + e2e, in that order, failing fast).
- [x] 0.3 Guardrail lint rules:
  - No imports from `src/tracking/` inside `src/games/`
  - No color literals outside `src/ui/theme.ts`
  - No `speechSynthesis` outside dev tools
  - No `fetch`/`XMLHttpRequest`/`WebSocket` in `src/` except the local asset loader
  - No `any`
- [x] 0.4 Folder skeleton from DESIGN.md with typed stubs: `src/games/types.ts` (game contract from CLAUDE.md), `src/motion/config.ts` (all default thresholds from DESIGN.md as named constants with units), `src/ui/theme.ts` (pastel palette, two player colors, typography).
- [x] 0.5 Offline assets: `npm run fetch-models` downloads `pose_landmarker_lite.task` into `public/models/`, and a postinstall step copies the MediaPipe wasm files into `public/mediapipe/`. The app loads only these local copies. (Model URL as of writing: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`. Check the MediaPipe Pose Landmarker docs if it has moved.)
- [x] 0.6 Synthetic clip generator (`tools/clip-synth`): produces landmark sequences in the same JSON format the pose recorder will use, with realistic jitter and occasional dropped points:
  - Kid standing still for 30 s
  - 5 jumps
  - Running in place at 2 and 3 steps/s
  - 3 squats
  - Reach up and arms out
  - Two kids side by side for 10 min with crossing arms
  - One kid walks out and back
  - Low-visibility frames

  Saved to `test/clips/synthetic/`. Tests use these until real clips exist.

- [x] 0.7 Test harness:
  - Vitest helper to run any detector over a clip and count events
  - Playwright config launching Chrome with a fake camera (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`)
  - An app URL mode `?source=replay&clip=<name>` that feeds a clip instead of the camera
- [x] 0.8 GitHub Actions: on every push, run `npm ci` and `npm run check`; on `main`, also deploy to GitHub Pages (Vite `base` set to the repo name).
- [x] 0.9 README stub (with privacy note), LICENSE (Apache-2.0), ASSETS.md, .gitignore.

Acceptance: `npm run check` is green locally and in CI; `npm run dev` shows a pastel "Wiggle Room" start screen; the Pages URL loads; a test proves the lint guardrails catch a forbidden import.

---

## Phase M0: Camera, tracking, lag

Goal: two kids tracked live, fast enough, with tools to measure it.

- [x] M0.1 Camera: getUserMedia at 640×480, ideal 60 fps, front-facing. Mirrored display. Show the actual resolution and fps in the overlay. Friendly screens for camera denied, no camera found and camera busy.
- [x] M0.2 `PoseSource` interface with:
  - `LivePoseSource`: MediaPipe lite, GPU delegate, VIDEO mode, `numPoses: 2`, exactly one `detectForVideo` per new frame via `requestVideoFrameCallback`, monotonic timestamps
  - `ReplayPoseSource`: plays clips with their original timing
- [x] M0.3 Phaser app at 60 fps drawing the latest pose. Rendering never waits for tracking. Test: replay at 2× speed, and drawing still holds 60 fps in Playwright traces.
- [x] M0.4 Debug overlay (toggle with D): skeletons in player colors, both floor circles, per-stage ms (camera frame interval, inference, motion kit, render), fps, last 10 events.
- [x] M0.5 Pose recorder (dev only, R to start/stop): saves landmarks + timestamps as JSON (never video). Clips can be loaded into the replay source by drag-and-drop or `?clip=`.
- [x] M0.6 Device check on first run: a 5-second benchmark stores two-kid tracking ms. Above 20 ms, the app reduces input size first, then shows a parent-facing warning.
- [x] M0.7 Lag test screen plus `docs/LAG-TEST.md`: a large high-contrast marker follows the right wrist, with an on-screen millisecond counter. Includes step-by-step phone slow-motion instructions (240 fps; count frames; ~4 ms per frame).
- [x] M0.8 Clip-recording mode with on-screen prompts for the clips I'll record with the kids. Each is saved to `test/clips/real/` with a clear name:
  - Standing still 30 s
  - Bunny hops ×5
  - Running in place 10 s
  - Squats ×3
  - Reach up and arms out
  - Both kids side by side for 2 min
  - One kid walks out and back
  - Dim room 30 s

- [x] M0.9 (added 2026-11-26 after desktop tuning, Nick-approved): move tracking into a Web Worker (DESIGN "Lag budget" escalation). Primary: transferred camera track + MediaStreamTrackProcessor in the worker; fallback: main-thread rVFC shipping ImageBitmaps; last resort: existing main-thread pipeline. Rendering holds 60 fps during live tracking; pose delivery near every camera frame; "process each new frame exactly once, never queue" enforced in the worker.

Acceptance: two kids tracked live; device check shows tracking ≤ 20 ms on the test laptop _(M0.9 amendment, see DECISIONS: 20 ms is the ladder target; the pass/fail line is ≤ 43 ms inference — the point where total lag would blow the 120 ms hard limit — with rendering at 60 fps, which the worker guarantees)_; `npm run check` green. Phase report lists the lag test and clip recording for me.

---

## Phase M1: Motion kit, warm-up, voice, Freeze Dance

Goal: the first complete, fun, two-player game.

- [x] M1.1 Motion kit core, all pure functions with tests:
  - One Euro filter
  - Visibility gating (< 0.5 ignored)
  - Outlier rejection (> 1 body length per frame)
  - Body normalization (body length = shoulder midpoint to hip midpoint)
  - Hysteresis helper
  - 150 ms debounce

  Add `npm run bench`: the full motion kit over the 10-minute two-kid clip must average under 1 ms and stay under 2 ms at p99 per frame.

- [x] M1.2 Players and tracking states:
  - Two circles mapped to screen halves; assignment by hip-center position
  - "One buddy per circle" detection
  - Per-kid Tracked → Coasting (≤ 1 s) → Paused → Tracked (after 0.3 s clear)

  Tests:
  - Side-by-side clip with crossing arms: zero player swaps
  - Walk-out clip: back to Tracked within 0.5 s of being fully in view

- [x] M1.3 Start-up check: a circle turns green after the kid is seen head to ankles for 1 s. Detects feet out of frame, too close, dark frame (mean brightness), backlight (bright background vs body box) and two kids in one circle, each mapped to its voice line. Tests with the low-visibility clip.
- [x] M1.4 Moving/still detector: motion energy in body lengths per second, per-kid still line from calibration, hysteresis, 0.5 s hold. Tests:
  - 30 s still clip: zero false "moved" events
  - Dancing clip: "moving" within 150 ms of motion starting
- [x] M1.5 Warm-up calibration: the 7 moves in DESIGN.md, for both kids at once. Two tries, then a slower demo, then skip to the age-mode default. Results saved to the profile in localStorage. Tests check each measurement against the synthetic clips within a tolerance.
- [x] M1.6 Narrator v1:
  - `voice/lines.en.csv` (id, priority, 3–5 wordings) covering the start-up check, warm-up, Freeze Dance and wrap-up moments in DESIGN.md
  - `npm run voice` renders clips with kokoro-js and compresses them
  - Web Audio playback with priority queue, late-praise drop, never the same wording twice, help lines at most every 8 s, music ducking, left/right pan per player, captions
  - Tests for the queue rules
- [ ] M1.7 Buddy avatar: soft blob character per kid in their color. Mirrors the pose with light smoothing and ~30 ms prediction. Reaction animations: giggle, statue, cheer, wave.
- [ ] M1.8 Timing check ("clap with the drum", 15 s): measures the full audio/visual delay, stores the offset, and applies it to game timing windows and voice cues.
- [ ] M1.9 Freeze Dance, exactly per DESIGN.md:
  - Dance meters, random stops, grace windows, Little/Big settings
  - Statue and wobble reactions
  - Snowstorm co-op bonus, pose cards in Big mode, slow-motion song every third round
  - Benefit of the doubt during coasting/paused
  - CC0 placeholder music listed in ASSETS.md

  Playwright test plays a full round with keyboard stand-ins for two players.

- [ ] M1.10 Minimal shell:
  - Start screen → start-up check → warm-up (new kids only) → Freeze Dance → results → "arms up" to replay
  - Parent gate (hold P for 3 s) with session length and volumes
  - Session timer with a 2-minute heads-up and cool-down screen

Acceptance: `npm run check` and `npm run bench` green; zero swaps and zero false moves on clips. Phase report asks me for a two-kid playtest. Gate: kids ask to play again in at least 2 of 3 sessions, with at most one "it didn't see me" per round.

---

## Phase M2: Critter Dash

- [ ] M2.1 Step detector (fires as the knee starts rising; arm pumps count in Little mode) and jump detector (fires at takeoff; cancelled if hips don't rise ~15% of body length). Clip tests: 5-jump clip → exactly 5 jumps; run clips → step rate within 10% of the real cadence.
- [ ] M2.2 Speed model: moves on the first step, eases up to each kid's calibrated top pace, gentle catch-up, keeps speed for 1 s while coasting.
- [ ] M2.3 Two-lane race scene: critter picker (hold a hand over it), "3, 2, 1, go!", finish confetti, places only in Big mode, Snowy Meadow track.
- [ ] M2.4 Big-mode obstacles (logs, puddles; a miss only slows briefly), solo pacer (snail Little, rabbit or ghost Big), "stay on your spot" footprints.
- [ ] M2.5 Fun hooks (rhythm sparkle trail and boost, victory dance, photo-finish replay), voice lines, stars that unlock two more tracks.
- [ ] M2.6 Playwright: full two-player race with keyboard stand-ins.

Gate: steps register reliably for a 3-year-old in a playtest, and the M1 gates still hold.

---

## Phase M3: Bubble Pop and full shell

- [ ] M3.1 Hand/foot touch with swept collision and margins (full hand-width Little, half Big) and a squat detector. Clip and unit tests, including a fast swipe that must not skip a bubble.
- [ ] M3.2 Bubble spawner per player half with rainbow bubbles in the middle. Specials: high (under measured reach), low (squat), golden (both hands). Notes play "Twinkle, Twinkle" in order.
- [ ] M3.3 Learning rounds (Little: pop the color called; Big: numbers in order, count by 2s, spell your name), co-op bubble jar, round end with a big friendly count.
- [ ] M3.4 Launcher with three cards (hold a hand 2 s, ring fills), all games preloaded (< 1 s to open), profiles screen, full parent settings, stars and stickers.
- [ ] M3.5 Grown-up profile handicap and per-kid dynamic difficulty (3 wins up, 2 misses down) in all three games.
- [ ] M3.6 Playwright: launcher → each game → results → replay, for one and two players.

Gate: all three games playable from one launcher; playtest passes the fun checks in DESIGN.md.

---

## Phase M4: v1.0 release

- [ ] M4.1 Art and music pass (CC0 or self-made only, every file listed in ASSETS.md)
- [ ] M4.2 Comfort review: automated check that no scene flashes more than 3 times per second; contrast check on text; palette audit
- [ ] M4.3 Offline test: install as an app, disconnect the internet, play all three games
- [ ] M4.4 README with 3-step setup, GIF and privacy note; CONTRIBUTING with the game format; CLAUDE.md updated for new-game scaffolding
- [ ] M4.5 Final fresh-eyes review of the whole repo against DESIGN.md; fix findings; tag v1.0 and publish to Pages

---

## Phase reports

(Claude Code adds one report per phase here: what was built, test counts, bench numbers, known gaps, and what I need to test on the TV.)

### Phase M0 report — 2026-11-25

**What was built.** The full camera-to-screen pipeline plus every measurement tool.
`PoseSource` with two implementations: `ReplayPoseSource` (original or scaled timing,
loop mode, `?speed=`) and `LivePoseSource` (MediaPipe VIDEO mode, exactly one
`detectForVideo` per `requestVideoFrameCallback`, frames never queued, GPU delegate with
CPU fallback, monotonic timestamps). Camera open with five friendly failure screens plus
a 'model' screen for tracking-engine failures. Phaser 4 stage drawing the newest pose
every refresh (mirrored; rendering never waits on tracking — proven by an isolated perf
test holding >55 fps during 2× two-kid replay). Debug overlay (D): camera interval,
inference mean/p99, render ms/fps, last-10 events. Pose recorder (R) saving
landmarks-only JSON (key-set pinned by test), drag-and-drop replay. First-run device
check: 5 s benchmark, 480p→320p input ladder before a parent-facing warning, record
stores the pose count it actually saw and silently re-benches the first time more kids
appear than it measured. Lag test screen (`?screen=lagtest`) + `docs/LAG-TEST.md`.
Guided clip-recording mode (`?screen=record`): 8 prompts, countdown, auto-stop,
S-to-save (every download user-activated so Chrome can't silently block takes).
A fresh-eyes review found 12 issues (3 important — all would have hit your first-run or
recording-day sessions); all fixed or logged, see DECISIONS.md "M0 fresh-eyes review".

**Test counts.** 203 unit tests in 25 files + 21 Playwright specs (live MediaPipe
pipeline, all five error screens, device-check first-run + skip, full guided-recording
take, drop-replay with playback pinned, isolated 60 fps perf test). `npm run check`
green locally and in CI.

**Bench numbers.** The motion-kit bench still arrives in M1.1. Measured this phase:
render holds 60 fps during 2× two-kid replay (55+ enforced in CI); live tracking on CI's
CPU-only runner processes frames end-to-end (speed numbers from CI are meaningless —
yours below are the real acceptance).

**Known gaps (scheduled, none hidden).** Slot = detection order until M1.2 circle
binding; floor circles are fixed debug positions until M1.2; overlay's motion-kit row
says "arrives in M1"; draw-stage-only ms (vs whole-frame ms) needs instrumentation if
the 17 ms budget ever gets tight; `bench`/`voice` still placeholders (M1.1/M1.6).

**M0.9 addendum (2026-11-26).** Tracking now runs in a Web Worker with CPU-first
inference (measured on the desktop: GPU-in-worker tanked render to 24 fps because the
one GPU is shared; CPU-in-worker: 60.3 fps render, 25.4 ms inference, every camera frame
processed). The chip's tail now reads like `CPU·worker(track)`. Because rendering can no
longer be hurt by inference, the device check's semantics changed: 20 ms stays as the
input-ladder target, but the parent warning only fires above **43 ms** (the point where
total motion-to-TV lag would exceed the 120 ms hard limit — derivation in config.ts).
The ladder's chosen camera size now persists across launches. New tuning URL knobs:
`?recheck=1` (redo the benchmark), `?delegate=cpu|gpu`, `?transport=bitmap`.

**Updated expectations for the TV readings (replaces the numbers below where they
conflict):** delegate tail `CPU·worker(track)`; inference ~25–40 ms is NORMAL and good
(warn line 43 ms); camera interval ≈ one camera frame period (33 ms at 30 fps — ~50 ms
means every frame at 20 fps, 67 ms would mean skipping); render 60 fps always.

**What Nick needs to test on the TV (this is the real M0 acceptance):**

1. **Device check:** on the TV computer, open
   https://ncriscione13.github.io/wiggle-room/ in Chrome full screen, let the camera
   start, and stand in view — with **both kids in frame** at some point. Then press D
   and read the **inference** number. Target: **≤ 20 ms** with two kids in frame. Tell
   me avg + p99 and whether the delegate says GPU or CPU.
2. **Lag test:** follow `docs/LAG-TEST.md` — open
   https://ncriscione13.github.io/wiggle-room/?screen=lagtest, film hand + TV at 240 fps,
   4–5 sharp flicks, count frames × 4.17 ms, take the median. Target **≤ 100 ms**,
   hard limit 120. Send the median + TV model (+ overlay numbers from the normal stage
   URL if it's over).
3. **Record the 8 kid clips:** open
   https://ncriscione13.github.io/wiggle-room/?screen=record — Space starts each take,
   S saves it, R redoes it. If Chrome asks to "download multiple files", click Allow
   (first save only). Then copy the 8 .json files from Downloads into
   `test/clips/real/` in the repo and tell me — M1's detectors get tested against them.
   (Dry-run alone first with `&promptSeconds=5` if you want to learn the flow.)
4. **Sanity while you're there:** skeletons should track both kids smoothly with the
   display mirrored (step left → skeleton steps the same way, like a mirror), and the
   overlay (D) should show camera interval ≈ 16–33 ms.

**Stopped and waiting** for your numbers before planning M1.

### Phase 0 report — 2026-11-25

**What was built.** The fully guarded empty project: Vite 8 + strict TypeScript 6 toolchain
with exact version pins; the fail-fast `npm run check` gate (typecheck → lint → test →
build → e2e); eight guardrail lint rules proven by tests that run the shipped config
against virtual files (layering, colors-only-in-theme, no speechSynthesis, no network, no
`any`, MediaPipe only in tracking, motion never runtime-imports games); the pastel theme
with executable comfort rules; `src/motion/config.ts` with every DESIGN threshold as a
unit-suffixed constant (safety invariants pinned by tests, tunables structurally checked);
the game contract types; offline assets (model fetcher with validation, wasm postinstall,
~35 MB PWA precache); the canonical clip format + a deterministic synthetic clip generator
(9 clips, physics pinned: exactly 5 jumps, 3 squats, 20/29 steps, crossing arms with hips
never crossing the midline); the test harness (clip runner, fake camera, `?source=replay`
mode); CI on every push + Pages deploy from main; README/LICENSE/ASSETS docs. A fresh-eyes
review agent audited the phase; all 11 findings were fixed or logged (two IMPORTANT: Node
engines floor, PWA manifest shipping a pure-white splash — both fixed, see DECISIONS.md).

**Test counts.** 118 unit tests in 13 files (incl. 24 lint-guardrail cases and 18 clip
physics checks) + 8 Playwright browser tests. `npm run check` green locally and in CI.

**Bench numbers.** None yet — `npm run bench` is an honest placeholder until M1.1 builds
the motion kit (the budget constants it will be held to are already pinned:
avg < 1 ms, p99 < 2 ms per frame).

**Known gaps (all scheduled, none hidden).** `bench`/`voice` are exit-1 placeholders
(M1.1/M1.6); replay mode loads clips but only feeds a badge until the PoseSource pipeline
lands (M0.2); clips are served by dev/preview middleware only, never shipped; the
service-worker `autoUpdate` strategy must be revisited when M3 introduces lazy game chunks
(logged with a plan); the model URL uses MediaPipe's `latest` path (CI caches it under a
pinned key).

**What Nick needs to test (no TV lag work yet — that's M0):**

1. On the TV computer, open https://ncriscione13.github.io/wiggle-room/ in Chrome,
   full screen. You should see the pastel night-blue "Wiggle Room" start screen with two
   floating player circles — and never a white flash, including while loading.
2. Install it as an app (the install icon in Chrome's address bar), close Chrome, turn
   off Wi-Fi/unplug ethernet, and launch the installed app. It should open fully, offline,
   with a night-blue (not white) splash.
3. Optional dev check on your machine: `git pull`, `npm install`, `npm run fetch-models`,
   `npm run check` — should end green; then `npm run dev` and visit
   `http://localhost:5173/?source=replay&clip=jumps-x5` — a badge bottom-left should say
   the clip loaded (480 frames, 16.0 s).
4. Prep for M0 (from your PLAN task list, not software): tape the two floor circles
   ~4 ft apart, 7–9 ft from the laptop; TV in Game Mode, motion smoothing off, laptop
   display set to TV only at 1080p/60.

**Stopped and waiting** for your results before starting Phase M0.

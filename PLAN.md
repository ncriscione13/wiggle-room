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
- [ ] 0.5 Offline assets: `npm run fetch-models` downloads `pose_landmarker_lite.task` into `public/models/`, and a postinstall step copies the MediaPipe wasm files into `public/mediapipe/`. The app loads only these local copies. (Model URL as of writing: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task`. Check the MediaPipe Pose Landmarker docs if it has moved.)
- [ ] 0.6 Synthetic clip generator (`tools/clip-synth`): produces landmark sequences in the same JSON format the pose recorder will use, with realistic jitter and occasional dropped points:
  - Kid standing still for 30 s
  - 5 jumps
  - Running in place at 2 and 3 steps/s
  - 3 squats
  - Reach up and arms out
  - Two kids side by side for 10 min with crossing arms
  - One kid walks out and back
  - Low-visibility frames

  Saved to `test/clips/synthetic/`. Tests use these until real clips exist.

- [ ] 0.7 Test harness:
  - Vitest helper to run any detector over a clip and count events
  - Playwright config launching Chrome with a fake camera (`--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`)
  - An app URL mode `?source=replay&clip=<name>` that feeds a clip instead of the camera
- [ ] 0.8 GitHub Actions: on every push, run `npm ci` and `npm run check`; on `main`, also deploy to GitHub Pages (Vite `base` set to the repo name).
- [ ] 0.9 README stub (with privacy note), LICENSE (Apache-2.0), ASSETS.md, .gitignore.

Acceptance: `npm run check` is green locally and in CI; `npm run dev` shows a pastel "Wiggle Room" start screen; the Pages URL loads; a test proves the lint guardrails catch a forbidden import.

---

## Phase M0: Camera, tracking, lag

Goal: two kids tracked live, fast enough, with tools to measure it.

- [ ] M0.1 Camera: getUserMedia at 640×480, ideal 60 fps, front-facing. Mirrored display. Show the actual resolution and fps in the overlay. Friendly screens for camera denied, no camera found and camera busy.
- [ ] M0.2 `PoseSource` interface with:
  - `LivePoseSource`: MediaPipe lite, GPU delegate, VIDEO mode, `numPoses: 2`, exactly one `detectForVideo` per new frame via `requestVideoFrameCallback`, monotonic timestamps
  - `ReplayPoseSource`: plays clips with their original timing
- [ ] M0.3 Phaser app at 60 fps drawing the latest pose. Rendering never waits for tracking. Test: replay at 2× speed, and drawing still holds 60 fps in Playwright traces.
- [ ] M0.4 Debug overlay (toggle with D): skeletons in player colors, both floor circles, per-stage ms (camera frame interval, inference, motion kit, render), fps, last 10 events.
- [ ] M0.5 Pose recorder (dev only, R to start/stop): saves landmarks + timestamps as JSON (never video). Clips can be loaded into the replay source by drag-and-drop or `?clip=`.
- [ ] M0.6 Device check on first run: a 5-second benchmark stores two-kid tracking ms. Above 20 ms, the app reduces input size first, then shows a parent-facing warning.
- [ ] M0.7 Lag test screen plus `docs/LAG-TEST.md`: a large high-contrast marker follows the right wrist, with an on-screen millisecond counter. Includes step-by-step phone slow-motion instructions (240 fps; count frames; ~4 ms per frame).
- [ ] M0.8 Clip-recording mode with on-screen prompts for the clips I'll record with the kids. Each is saved to `test/clips/real/` with a clear name:
  - Standing still 30 s
  - Bunny hops ×5
  - Running in place 10 s
  - Squats ×3
  - Reach up and arms out
  - Both kids side by side for 2 min
  - One kid walks out and back
  - Dim room 30 s

Acceptance: two kids tracked live; device check shows tracking ≤ 20 ms on the test laptop; `npm run check` green. Phase report lists the lag test and clip recording for me.

---

## Phase M1: Motion kit, warm-up, voice, Freeze Dance

Goal: the first complete, fun, two-player game.

- [ ] M1.1 Motion kit core, all pure functions with tests:
  - One Euro filter
  - Visibility gating (< 0.5 ignored)
  - Outlier rejection (> 1 body length per frame)
  - Body normalization (body length = shoulder midpoint to hip midpoint)
  - Hysteresis helper
  - 150 ms debounce

  Add `npm run bench`: the full motion kit over the 10-minute two-kid clip must average under 1 ms and stay under 2 ms at p99 per frame.

- [ ] M1.2 Players and tracking states:
  - Two circles mapped to screen halves; assignment by hip-center position
  - "One buddy per circle" detection
  - Per-kid Tracked → Coasting (≤ 1 s) → Paused → Tracked (after 0.3 s clear)

  Tests:
  - Side-by-side clip with crossing arms: zero player swaps
  - Walk-out clip: back to Tracked within 0.5 s of being fully in view

- [ ] M1.3 Start-up check: a circle turns green after the kid is seen head to ankles for 1 s. Detects feet out of frame, too close, dark frame (mean brightness), backlight (bright background vs body box) and two kids in one circle, each mapped to its voice line. Tests with the low-visibility clip.
- [ ] M1.4 Moving/still detector: motion energy in body lengths per second, per-kid still line from calibration, hysteresis, 0.5 s hold. Tests:
  - 30 s still clip: zero false "moved" events
  - Dancing clip: "moving" within 150 ms of motion starting
- [ ] M1.5 Warm-up calibration: the 7 moves in DESIGN.md, for both kids at once. Two tries, then a slower demo, then skip to the age-mode default. Results saved to the profile in localStorage. Tests check each measurement against the synthetic clips within a tolerance.
- [ ] M1.6 Narrator v1:
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

# Wiggle Room — guide for Claude Code

Open-source, offline webcam motion games for kids 3–10, played on a TV. Two kids play at once. No controllers, no accounts, no network at runtime.

- Full design (source of truth): `docs/DESIGN.md`
- Build plan and progress: `PLAN.md`
- Decisions and deviations log: `docs/DECISIONS.md` (create it in Phase 0)

If anything here conflicts with `docs/DESIGN.md`, stop and ask. Don't guess.

## Stack

- TypeScript (strict) + Vite, npm
- Phaser (latest stable) for games, WebGL renderer
- `@mediapipe/tasks-vision` Pose Landmarker: lite model, GPU delegate, VIDEO mode, `numPoses: 2`. Model file and wasm are served from `public/` so nothing loads from a CDN at runtime.
- Vitest (unit + clip tests), Playwright (browser smoke tests with a fake camera)
- ESLint + Prettier
- `vite-plugin-pwa` for offline; GitHub Pages via GitHub Actions
- Voice: clips pre-rendered with `kokoro-js` in `tools/voice-gen`; played through Web Audio

Ask before adding any other dependency.

## Commands

- `npm run dev`: local dev server (camera works on localhost)
- `npm run dev:lan`: HTTPS dev server reachable from the TV computer (the camera needs HTTPS when not on localhost)
- `npm run check`: typecheck + lint + unit/clip tests + build + Playwright smoke test. This is the gate for every task.
- `npm run bench`: motion kit performance test on a long clip
- `npm run voice`: render voice lines to clips
- `npm run fetch-models`: download the pose model into `public/models/` (one time)

## Architecture rules (do not break; ask before changing)

1. Layering: `tracking → motion → game API → games`. Games never import from `src/tracking/` and never read raw landmarks. They get typed events and per-player state from `GameContext`. Enforce this with ESLint `no-restricted-imports`.
2. Frame loop: process each new camera frame exactly once (`requestVideoFrameCallback`) and never queue frames. Rendering runs every display refresh with the newest pose and never awaits tracking.
3. Lag budget: camera ≤ 45 ms, tracking ≤ 20 ms for two kids, motion kit ≤ 2 ms, game + draw ≤ 17 ms; total ≤ 100 ms including the TV. Measure with the debug overlay and `npm run bench`. Don't add hot-path work without measuring it.
4. Events fire at the start of a move: jump at takeoff, step as the knee starts rising. Touch checks use the swept path between frames.
5. Every threshold is a named constant in `src/motion/config.ts`, in body lengths or seconds. Per-kid values come from the warm-up calibration saved in each profile. Never hardcode numbers in detectors or games.
6. Tracking safety:
   - Ignore points with visibility < 0.5.
   - Reject any point that moves more than one body length in a single frame.
   - Use hysteresis for still/moving and a 150 ms debounce on events.
   - Per-kid state machine: Tracked → Coasting (≤ 1 s) → Paused (that kid only) → Tracked again after 0.3 s of clear tracking.
   - Benefit of the doubt: uncertain tracking never costs a kid points, a round or a place.
7. Two players: each player is bound to a floor circle and its half of the screen, never to a face. The display is mirrored.
8. Privacy: no network requests at runtime, no analytics, never store or send camera frames. The pose recorder saves landmark coordinates only and is dev-only.
9. Comfort: colors only from `src/ui/theme.ts` (lint rule: no hex or rgb color literals outside that file). No flashing faster than 3 times per second, no pure white backgrounds, no saturated red, eased motion.
10. Voice: all narration goes through `narrator.say(lineId, { player })`. Never use `speechSynthesis` in production. Priority order: safety/tracking > timing > instruction > praise. Drop praise that's more than 1 s late.
11. Every motion event has a keyboard/mouse stand-in (arrows = steps, space = jump, S = squat, F = hold still, mouse = hand; players 1/2 switch with Tab), so every game is playable at a desk and in Playwright.

## Game contract

Each game lives in `src/games/<id>/` with a `manifest.json`, a Phaser scene and a test file. Its voice lines go in `voice/lines.en.csv` with ids prefixed by the game id. The launcher finds games via `import.meta.glob('./games/*/manifest.json')`.

```ts
// src/games/types.ts (starting point; refine in Phase 0 and log changes in DECISIONS.md)
export type AgeMode = 'little' | 'big';
export type Slot = 0 | 1;

export interface GameManifest {
  id: string;
  name: string;
  ages: [number, number];
  players: { min: 1; max: 2 };
  movement: Array<'stop-go' | 'run' | 'jump' | 'reach' | 'squat'>;
  intensity: 1 | 2 | 3;
}

export interface PlayerInfo {
  slot: Slot;
  color: string; // theme token name
  name?: string;
  mode: AgeMode;
  calibration: Calibration;
}

export interface GameContext {
  players: PlayerInfo[];
  motion: MotionEvents; // on('jump'|'step'|'squat'|'still'|'moving'|'armsUp', handler), pose(slot) for drawing, tracking(slot)
  voice: Narrator; // say(lineId, { player? })
  audio: AudioBus; // music, sfx, ducking, measured output delay
  theme: Theme;
  difficulty(slot: Slot): DifficultyLevel; // 3 wins in a row → up, 2 misses → down
  finish(result: RoundResult): void;
}
```

## Build and review loop (required for every task)

The goal is a one-shot build: each task is finished, checked and correct before the next one starts.

Before coding a task:

1. Re-read the task in `PLAN.md` and the matching section of `docs/DESIGN.md`.
2. Write the acceptance checks as tests first: unit tests for logic, clip tests for detectors, Playwright for screens.
3. If anything is ambiguous, ask one question rather than guessing.

After coding a task:

1. Run `npm run check` and fix everything until it passes. Never skip, delete or weaken a test or a design number to get green. If a design number looks wrong, ask.
2. Self-review the diff against the checklist below and fix what you find.
3. Tick the task in `PLAN.md`, note any deviation in `docs/DECISIONS.md`, and commit with a clear message.

Self-review checklist:

- [ ] Does it do everything the DESIGN.md section says, including Little/Big mode differences?
- [ ] Does it work for two players at once and for one player alone?
- [ ] Does it handle tracking loss (coasting/paused) with benefit of the doubt?
- [ ] Is anything slower than the lag budget? Did `npm run bench` stay green?
- [ ] Any hardcoded thresholds, colors or strings that belong in config, theme or voice lines?
- [ ] Does every new motion interaction have a keyboard stand-in?
- [ ] Do new spoken moments have voice lines (3+ wordings) and captions?
- [ ] Any flashing, pure white or harsh sound?
- [ ] Any network call, camera-frame storage or `any` type?
- [ ] Are errors handled with a friendly screen (camera denied, model failed to load)?

At the end of every phase:

1. Fresh-eyes review: start a separate review agent (subagent) that hasn't seen the work. Give it `docs/DESIGN.md`, this file and the phase diff, and have it review against the phase's acceptance checks and the checklist above. If you can't start one, re-read the whole phase diff as a strict outside reviewer would. Fix everything it finds, then run `npm run check` again.
2. Write a phase report at the bottom of `PLAN.md`: what was built, test counts, bench numbers, known gaps, and an exact numbered list of what I need to test on the TV (lag test, playtests, recordings).
3. Stop and wait for my results before starting the next phase. Use my playtest notes to tune `config.ts` values. Don't rewrite systems to fix a tuning problem.

## Working style

- One task at a time, in `PLAN.md` order.
- Keep modules small. Detectors are pure functions (timestamped normalized frames in, events out), so they can be tested with clips.
- Prefer boring, readable code over clever code. Comment the why, not the what.

# Decisions and deviations log

Newest entries at the top. Each entry: date, task, what was decided, why.

## 2026-11-26 — M1.10 — Minimal shell (flow, warm-up runner, session, gate)

- **`/` keeps the debug stage; the kid flow lives at `?play=1`** behind the start
  screen's big "Let's play!" button. Eight e2e specs pin the debug surface and it stays
  the dev workhorse; the M3 launcher takes over `/` later.
- **First live camera→game path**: `live-motion.ts` (camera at device-check size →
  worker source → MotionKit) feeds the start-up check (per-kid circles + narrator
  problem lines with their built-in 8 s cooldown), the guided warm-up, and the game.
  Keyboard input (`?input=keyboard`) skips the camera screens — desk mode and e2e.
- **Warm-up runner** (`WarmupFlow`): shared prompts, per-kid measurements; a move
  retries when ANY active kid failed (max 2 tries → slow demo → age defaults for
  whoever is still missing). bodyLengthImage falls back to the last seen pose, then a
  sensible constant. Calibrations save to profiles; still lines apply to the kit.
- **Session timer** is wall-clock from flow start (not play-time-only; pause semantics
  would need a pause feature). A session shorter than the 2-min heads-up window says
  the heads-up immediately — honest, affects only test knobs. Goodbye screen locks
  until a parent holds P (settings) or reloads; parent gate runs the whole session.
- **Round loop replays without reloading** (audio stays decoded; `?rng=0` pins random
  durations for deterministic e2e). The M1.9 `?game=` route stays for single-game runs.

## 2026-11-26 — M1.9 — Freeze Dance (core, scene, route, keyboard e2e)

- **The game is a pure directive machine** (`FreezeCore`): the scene drains typed
  directives (music/say/statue/wobble/star/snowstorm/pose-card/finish) per tick and only
  draws and routes. Event timestamps may lag or lead the tick clock (worker frames), so
  inputs queue and apply in time order.
- **Interpretations of underspecified DESIGN lines** (all tunable in config):
  mixed-age pairs use the steadier Little music timing; a Little kid who never stills
  during a stop gets a giggle line and no star (never a buzzer); a wobble blip under
  0.6 s Little / 0.3 s Big keeps the statue; snowstorm needs ≥ 2 active players, and a
  coasting kid counts as frozen for it (benefit of the doubt extends to the team);
  pose cards appear every 2nd stop when a Big kid plays; Big score =
  100 − reaction·100 − wobbles·15 (min 10) + 25 card bonus; "out" rule skipped (optional
  in DESIGN, parent-settings material).
- **Mirror layout fact:** slot 0 binds to the image-left half, which lands on the RIGHT
  of the mirrored screen. The scene paints buddies through one full-stage mirrored
  viewport, so each kid lands in their half with no per-slot math.
- **`?game=freeze&input=keyboard` route** assembles a real GameContext (keyboard motion,
  real narrator with captions + ducking, real audio bus) — it is desk mode and the e2e
  entry; the camera flow into games arrives with M1.10. `difficulty()` is a stub (1)
  until games report wins (M2). Replay-on-arms-up reloads the page (flow replaces it).
- **First Phaser use** (4.2.1): Phaser-3-style API held; `window.__wiggle` test hooks
  expose phase/meters/stars to Playwright. Stale-`dist` trap: `vite preview` serves the
  last build — always `npm run build` before a direct `playwright test` run.

## 2026-11-26 — M1.8 — Timing check core (clap matcher + clap detector + store)

- **Greedy best-first beat↔clap matching** (smallest |delay| pairs win, each side used
  once) with a trust gate: ≥6 matches AND IQR ≤ 0.12 s, else offset 0. Off-rhythm claps
  are rejected by the SPREAD, not the count — a clap 0.9 s late sits 0.3 s before the
  next beat and matches it (test originally assumed otherwise; fixed to the mechanism).
  A kid anticipating the beat (small negative offset) is valid and kept.
- **Clap detector:** armed by hands > 0.6 BL apart; fires at contact (gap ≤ 0.3 BL)
  only when closing ≥ 1.5 BL/s — praying hands and slow drifts never clap; standard
  event debounce. Detector tests use inline synthetic frames (same pure-function shape
  as clip tests; no new clip file needed for a check-only detector).
- **Untrusted results are never stored.** `getTimingOffsetS()` serves 0 until a trusted
  check ran; games shift windows by it (M1.9) and the 15 s screen mounts in M1.10.

## 2026-11-26 — M1.7 — Buddy avatar (sampler + reactions + geometry + painter)

- **EWMA instead of One Euro for the buddy's draw pose.** One Euro's group delay at
  constant speed (~v/(2π·cutoff) ≈ 27 ms at 1.8 Hz) swallowed the 30 ms look-ahead — the
  predicted buddy actually trailed the pose. An exponential smoother trails by exactly
  v·tau, so the sampler adds tau (BUDDY_POSITION_SMOOTH_S) to the horizon and the lag
  cancels analytically. The saturating horizon `cap·(1−e^(−dt/cap))` doubles as coasting:
  the buddy keeps its last motion briefly and settles (max drift = v·0.25 s), never
  flying off. Game rules never read this pose (DESIGN lag rule 3).
- **Look is a pure function** `buddyShapes(pose, reaction, color, t) → shapes` in image
  space; statue shapes ignore the clock entirely (a frozen buddy really freezes — pinned
  by test). Painter needs only `fillStyle`+`fillCircle` (limbs = circle-noodles along a
  quadratic), so Phaser Graphics fits structurally and nothing visual escapes unit tests.
  Giggle breaks the statue latch ("shake off the snow"), cheer overrides hands up,
  wave is one hand on the live clock. Scene wiring arrives with M1.9/M1.10.

## 2026-11-26 — M1.6 — Narrator v1 (33 lines / 99 clips, queue rules as a pure core)

- **Clips shipped as 24 kHz mono WAV (21 MB)** — no ffmpeg on this machine, and adding an
  encoder dependency needs sign-off per CLAUDE.md. The render tool auto-compresses to ogg
  (~3 MB) whenever ffmpeg is on PATH (`npm run voice -- --force` re-renders). Precache
  grows to ~56 MB total; still a one-time offline install. **Ask Nick: install ffmpeg or
  add `ffmpeg-static` devDependency?**
- **Queue rules live in `NarratorCore`** (pure, 8 unit-tested rules): priority
  safety>timing>instruction>praise, late-praise drop at play time (`PRAISE_LATE_DROP_S`),
  wording rotation (never twice in a row), per-id cooldown drops (not delays) repeats,
  pan −0.5/+0.5 per slot, color-name prefix clip + combined caption, safety preempts
  mid-playback, unknown ids ignored. The Web Audio adapter (`narrator.ts`) is a thin
  shell: decode-all-at-start, chained buffer sources, caption/speaking hooks (music
  ducking wires to the AudioBus in M1.9; caption DOM lands with the shell in M1.10).
- **`warmup.slow-demo` renders at speed 0.85** — the narrator literally slows down.
- Generated manifest is prettier-formatted so `npm run check` stays clean on committed
  artifacts; e2e pins that the manifest + clips are actually served.

## 2026-11-26 — M1.5 — Warm-up measurements, plan, profiles

- **Each move is a batch extractor over its window's prepared frames** with an `ok`
  plausibility flag (hops need ≥2 hysteresis-gated rises, run needs ≥4 steps, squat needs
  a real dip…), clip-tested against the synthetic clips' authored geometry: body size
  0.17, hip height 1.6 BL, reach ~1.9 BL (my first test bound assumed 2.0+ — the authored
  skeleton says 1.9; test corrected to the geometry), span ~2.35 BL, squat 0.55, hop
  ~0.32 BL, step rates within 10% on both cadences.
- **The plan is a pure reducer**: try → try → slow demo → age default, per move; the
  age-default table (`WARMUP_DEFAULT_CALIBRATION_TABLE`, mixed-unit `_TABLE` suffix)
  fills every Calibration field on skip. Both-kids pacing and the guided visuals mount
  with the M1.10 flow.
- **Storage extracted to `src/shell/storage.ts`** (shared by device-check and the new
  profiles module; device-check re-exports for compatibility). Profiles persist id,
  name, color token, age mode and calibration under `wiggle.profiles.v1`.

## 2026-11-26 — M1.3 — Start-up check (+ worker luma stats)

- **Brightness comes from the worker as stats, never pixels**: a 32×24 downsample →
  mean + 8×6 cell grid, sampled at most every 0.5 s, attached to result messages and
  surfaced as `PoseFrame.luma`. Dark = mean < 0.18; backlight = background cells (outside
  the body's horizontal band) ≥ 0.75 and ≥ 0.35 brighter than the body band. Sampling
  failures never break tracking; replay and the main-thread fallback carry no luma, and
  those two checks simply don't fire there.
- **Blip tolerance + flicker EWMA**: a frame-perfect continuous second is unreachable on
  real tracking (the synthetic still clip's 0.8% dropouts pushed ready to ~5 s). A
  problem shorter than 0.2 s is reported but doesn't reset progress or un-green the
  circle; ready additionally requires the ~1 s problem-fraction EWMA ≤ 0.2 — so the
  dim-room clip (≈0.5) can never go ready while healthy clips (≈0.02–0.13 with clusters)
  green within ~1.2 s and stay green. All three regimes clip-tested.
- **Problem priority**: crowded → dark → too-close → feet-out → backlight; not-seen as
  the fallback. Voice line ids exported per problem (`startup.*`) for the M1.6 CSV.
- **The circle VISUAL mounts with the shell flow (M1.10)** — M1.3 delivers the detection
  engine + line mapping; there is no screen to host the circles until the flow exists.

## 2026-11-26 — M1.4 — Moving/still detector (built before M1.3; it needs no luma)

- **Asymmetric timing reconciles PLAN's two requirements**: becoming MOVING confirms in
  0.1 s (test: onset within 150 ms of the dance block starting — a kid caught moving
  during a freeze registers immediately), becoming STILL requires the full 0.5 s hold
  (a freeze must be confirmed). Both directions test-pinned with synthetic drive.
- **Energy = mean smoothed-core-point speed in BL/s** (nose, wrists, knees, ankles —
  face detail would only add noise), on One-Euro-smoothed positions so sensor jitter
  can't fake movement. Hysteresis sits at line×1.5 / line×0.7 around the kid's still
  line (default 0.25 BL/s until the warm-up measures their wobble).
- **Clip gates**: still-30s → zero false "moving"; jumps-x5 → exactly 5 movement
  onsets (still again between hops, hold respected); two-kids quiet block → stays still
  until the dancing starts, then flips within 150 ms.

## 2026-11-26 — M1.2 — Player binding + tracking states

- **Binding is hip-center-to-half** with a 4%-of-width deadband at mid-screen (a
  straddler keeps its previous slot — no boundary flicker; config constant). Within a
  half, the candidate nearest the slot's last hip is the player; extras crowd the half
  ("One buddy per circle!") while the other kid plays on. Detection order is irrelevant
  (test-pinned).
- **State machine per kid**: Tracked → Coasting immediately when unseen (buddy keeps the
  last pose) → Paused after 1 s → Tracked after 0.3 s of CONTINUOUS clear tracking (any
  blip restarts the window; test-pinned).
- **Clip gates aligned to DESIGN's own words** after two near-miss test encodings of
  mine: "tracking lost < 2% of play time" means PAUSED (brief coasting over dropouts is
  designed, not lost), and "within 0.5 s of being FULLY in view" clocks from
  hips-confidently-visible, not from the first half-visible edge pixel. Results on the
  two-kid clip: zero swaps across 10 minutes of crossing arms, <2% paused per kid.
- **Test placement policy**: clip-consuming tests (they need the node-side clip harness)
  live under `test/`; colocated `src/**` tests stay import-pure for the DOM app project.

## 2026-11-26 — M1.1 — Motion kit core

- **Pieces**: OneEuroFilter/OneEuroPoint (Casiez form), `preparePose` (visibility gate →
  never guess; teleport gate >1 BL/frame against the last TRUSTED position so a point can
  recover after a bad frame; null when torso anchors are unusable — the player layer
  treats that as unseen), `Hysteresis` (hi>lo enforced), `EventDebounce` (window from the
  last FIRED event). All positions downstream are in BL relative to the hip midpoint.
- **One Euro beta tuned to 2.0 Hz per unit/s**: the first default (0.05) left ~100 ms of
  filter lag at 2 units/s — the "almost none when fast" design intent is test-pinned at
  <50 ms lag; stillness smoothing (jitter std crushed >3×) is also test-pinned. `_COEFF`
  joined the unit-suffix set for dimensioned tuning coefficients.
- **`npm run bench` is real now**: full kit (prep + 66 point filters + hysteresis +
  debounce) over the 10-min two-kid clip, warm-up pass then measured pass. First result:
  avg 0.007 ms, p99 0.013 ms, max 0.44 ms — ~140× under the 1 ms budget.
- **Node-ESM policy extended**: any src file importable by node tooling (motion kit,
  clip-format, clip-runner) uses explicit `.ts` relative imports — the extensionless
  chain broke `node tools/bench` one level below the entry file.

## 2026-11-26 — M0.9 fresh-eyes review — 12 findings, all addressed

- **Mid-session tracking errors now tear everything down** (camera, chip interval,
  watcher, worker) before showing the purpose-built 'model' screen — in all three boot
  paths. Previously only BOOT failures cleaned up; a mid-game worker error left the
  webcam lit behind "unplug your webcam" advice.
- **Device-check semantics rebased for the worker era** (FLAGGED FOR NICK — this changes
  a design number): 20 ms (DESIGN's main-thread tracking budget) remains the input-ladder
  target, but the parent warning now fires only above **DEVICE_CHECK_WARN_S = 43 ms** —
  derived as hard-lag-limit 120 − camera 45 − draw 17 − TV 15. Rationale: the worker
  guarantees 60 fps rendering regardless of inference cost, so the only thing inference
  can still hurt is total latency. Without this, every known machine (25–30 ms
  CPU-in-worker) would ladder to 320×240 AND scare parents while performing best-ever.
  The 25-ms-at-bottom case is test-pinned as ladder-yes/warn-no.
- **The ladder's chosen camera size now persists**: boots read the stored record's
  width/height into `openCamera` (previously first-session-only — the record described a
  configuration that wasn't running). `?recheck=1` clears before the read, restoring
  full size for the re-benchmark.
- **ContinuousClock replaces the bare monotonic clamp in the worker**: VideoFrame
  capture clocks, main `performance.now` and worker `performance.now` have unrelated
  bases; one backwards base jump would have pinned the timeline to +1 µs steps forever
  (freezing benches un-savably). The clock re-anchors on every track attach and on any
  > 1 s backwards jump, continuing the output timeline one nominal frame later. A second
  > 'track' message also detaches the first (no forked read loops, old clone stopped).
- **Both transports are now exercised**: `?transport=bitmap` pins the fallback and a new
  e2e runs it end to end; the chip shows the mode (`CPU·worker(track)`) and specs assert
  `worker(` so an unlabeled or fallen-back path fails CI. Bitmap hygiene: generation
  guard (no stale pre-stop frames), bitmap closed when transfer throws.
- Also: a worker `error` event listener fails the handshake fast (a missing chunk no
  longer costs the 30 s timeout — noted interaction with SW autoUpdate: the worker is
  now a runtime-fetched chunk, strengthening the M3 revisit); `close()` just terminates
  (the pre-terminate message never ran); the live-fps perf test asserts frames flowed
  across the measurement (no vacuous 60 fps over a stalled pipeline); the upgrade
  watcher reads a cached record instead of localStorage per frame; PLAN's M0 report and
  acceptance line updated for worker-era numbers so Nick's TV script matches the build.

## 2026-11-26 — M0.9 — Worker tracking (and the GPU-in-worker trap)

- **Architecture**: one tracking worker per app boot holds the MediaPipe model across
  camera reopenings (the ladder swaps tracks, not workers). Primary frame path: a cloned
  camera track transferred to the worker, read via MediaStreamTrackProcessor — zero
  main-thread work per frame and no dependency on video compositing. Fallback: main-side
  rVFC shipping ImageBitmaps (one in flight). Last resort: the old main-thread pipeline
  (`GPU·main` on the chip). The "exactly once, never queue" rule lives in
  `LatestFrameGate` (skipped VideoFrames are close()d or capture stalls).
- **THE decision — CPU-first delegate in the worker.** Measured on real hardware, fake
  camera, same machine: GPU main-thread (old) 50–57 fps render; **GPU-in-worker 24 fps**
  (the GPU is one shared resource — moving threads doesn't parallelize it, and
  cross-context ReadPixels syncs serialize brutally); **CPU-in-worker 60.3 fps render,
  inference 25.4 ms avg / 31.1 p99 @640 — same cost as GPU here, full camera-rate
  delivery (49.9 ms interval at a 20 fps camera)**. CPU-first is also CI-identical
  (no SwiftShader contention), which made the live-fps perf test honest everywhere.
  `?delegate=cpu|gpu` pins it for tuning; the order is test-pinned.
- **Module-worker wasm**: `FilesetResolver.forVisionTasks(root, /*useModule*/ true)` —
  Vite workers are ESM, importScripts throws, and the classic loader dies with
  "ModuleFactory not set". This is why both wasm variants ship in public/mediapipe.
- **Perf measurement lessons (rounds 2–3)**: two fps tests in separate files still ran in
  parallel inside the perf project — merged into one file with `fullyParallel: false`.
  And orphaned experiment browsers (headed Chrome holding a webcam + GPU from a crashed
  script) silently poisoned local perf numbers for a stretch — kill experiment processes
  before trusting measurements.
- The live-tracking e2e now asserts `worker` on the chip, so a silent fallback to
  main-thread tracking fails CI instead of hiding.

## 2026-11-26 — M0 tuning round 3 — attended measurements on Nick's desktop

Three valid measurements on the same machine (GPU delegate, Chrome, real webcam):
empty scene @320×240 ≈ 26 ms; **one person @320×240 = 29.6 ms avg / 37.8 p99** (ladder
bottom, stable 1-pose detection, no flapping); one person @640×480 ≈ 36 ms. Conclusions:

- **Base pipeline cost dominates (~26 ms); per-pose marginal cost is small (~4–6 ms);
  input-size leverage is weak** (640→320 with a person: 36→30 ms). Two kids projected
  ~34–38 ms on this class of machine. The 20 ms main-thread tracking budget is not
  reachable in-browser here by knob-turning.
- The earlier "2 poses" bench was phantom detections in an empty room (Nick wasn't in
  frame); with a real person, detection held rock-solid at 320×240 even at desk framing.
  Open item for M1 (tune on real clips): confidence/stability gating so phantom poses
  can't pollute `posesSeen`.
- The slow-device warning screen fired and rendered correctly end-to-end (verified by
  screenshot).
- **Decision pending Nick's OK: move tracking into a Web Worker** (DESIGN's own
  escalation). Expected effect here: render back to 60 fps, pose interval from ~67 ms to
  ~33–40 ms; end-to-end lag lands near the 100 ms target, inside the 120 ms hard limit.
- TV machine still unmeasured; same `?recheck=1` + D procedure applies there.

## 2026-11-25 — M0 TV tuning round 2 — rVFC compositor starvation found by live drive

Driving the deployed site in real desktop Chrome (headed, fake camera) on the dev
machine caught a cross-device bug our headless e2e can't see: **a video element that
STARTS off-viewport is lazily skipped by Chrome's compositor on some GPU paths, and
`requestVideoFrameCallback` starves to ~3 Hz** (measured: 8 callbacks/2.5 s for a video
styled off-screen before `play()`, vs 40/2 s for the same stream in a visible element —
and an element that starts visible KEEPS full rate even after moving off-screen). The
app showed "Tracking · 0 frames" with a healthy GPU delegate and 60 fps render.
Machine-dependent: Nick's TV machine composited the off-screen video fine.

- **Fix**: the camera video now starts in-viewport — 2×2 px, 1% opacity, bottom-left
  (imperceptible, always composited). Never off-viewport, never display:none.
- **Stall watchdog**: if zero frames 3 s after start, the chip says so and the overlay
  logs it — frame starvation must never be silent.
- Automation quirks noted (not product bugs): real-Chrome's fake camera device
  disappears for later getUserMedia calls after its tracks stop, and `width.ideal` +
  `frameRate.ideal` constraints can NotFound against the fake device.

## 2026-11-25 — M0 TV tuning round 1 — Nick's first real numbers

Nick's overlay (correction: from his desktop PC, not the TV — the TV machine is still
unmeasured): 640×480 @ 30 fps camera, **inference 36.0 ms avg / 48.1 p99**, camera
interval 67.9 ms (p99 133), render 19.3 ms (51.9 fps). Diagnosis:
36 ms inference > 33 ms frame period → the rVFC loop (correctly, by design — no queuing)
processes every other frame → 67 ms interval; main-thread inference also drags render to
52 fps. Everything cascades from the inference number.

- **Added `?recheck=1`**: forgets the stored benchmark so the device check + input-size
  ladder re-run under current real conditions (the stored record likely came from an
  empty-room first run). Parent-settings UI for this still lands in M1.10.
- Open diagnostics with Nick: GPU vs CPU delegate on that machine, kid count during the
  reading, hardware acceleration, power state, webcam model (reports 30 fps max?).
- **Escalation path if the ladder isn't enough** (pre-authorized by DESIGN "Lag budget"
  code rules: "If drawing still misses frames, move tracking into a Web Worker"):
  move inference off the main thread. That restores 60 fps render immediately and
  decouples skeleton drawing from inference stalls, but doesn't speed inference itself.
  Decide after Nick's delegate/ladder results.

## 2026-11-25 — M0 fresh-eyes review — 12 findings, all addressed

- **Device check is now pose-aware** (IMPORTANT): the benchmark records `posesSeen` (max
  simultaneous poses it actually saw), and the first time MORE kids are in frame than the
  stored bench ever saw, a passive 5 s re-bench upgrades the record mid-session (warning
  shown once if the real two-kid number is over budget). A one-person first run can no
  longer stand as the two-kid measurement forever. The reduction ladder still runs only
  on the explicit first-run check; M1.10's parent settings add a manual re-run.
- **Guided-recording downloads moved into the S keydown** (IMPORTANT): Chrome silently
  blocks repeated automatic downloads fired from timers (no user activation), which
  would have eaten takes 2–8 on recording day while the UI said "Saved". Review phase is
  now "S save & next · R redo"; every download carries user activation.
- **Error paths clean up and tell the truth** (IMPORTANT): every boot path stops the
  camera on failure (no webcam LED behind an error screen), preserves a thrown
  CameraOpenError's kind, and a landmarker failure gets its own 'model' screen ("the
  tracking engine could not load") instead of camera advice. Stuck "Device check…" chips
  are removed; error screens sit above all chips (z-index 40).
- **Live-path extras are torn down on session swap**: chip interval, upgrade watcher,
  chip and landmarker (`liveTeardown`); previously the "Tracking" chip kept narrating a
  stopped source over a dropped-clip replay and `LandmarkerHandle.close` had no callers.
- **Benchmarks can abort**: `collectBenchmarkSamples` resolves null on a wall-clock fuse
  if the source stops mid-bench (error, dropped clip); the check is skipped without
  saving a record instead of hanging the boot forever.
- **Restart-from-handler can't fork the loops**: both sources carry a generation token;
  a stale rVFC/timer callback from before a stop/restart dies instead of double-running
  `detectForVideo` per frame (rule 2) or interleaving replay frames. Replay has a test.
- Also: dev-tools transient-chip fuse tracked (a stale fuse could remove the next REC
  indicator); overlay render row shows ms/frame + fps (draw-stage-only ms needs
  instrumentation Phaser doesn't expose — revisit if the 17 ms budget gets tight);
  LAG-TEST.md now sends Nick to the normal stage URL for overlay numbers (D does nothing
  on the lag screen); `validateClipFile` treats every field as untrusted JSON; the drop
  e2e pins actual playback via the overlay event; a stage-math test comment had its
  anatomy backwards (math was right).

## 2026-11-25 — M0.8 — Clip-recording mode

- **Real-clip names deliberately differ from synthetic names** (`bunny-hops-x5` vs
  `jumps-x5`, `kid-squats-x3` vs `squats-x3`, `kid-walks-out-and-back` vs
  `walk-out-and-back`, `dim-room-30s` vs `low-visibility-30s`): `loadClip()` prefers real
  files by name, so same names would silently swap the inputs under tests that pin exact
  synthetic counts. A test enforces the no-collision rule. M1 wires real clips into
  detector tests explicitly, with their own expected counts.
- **Recordings download to the browser's Downloads folder**; Nick copies them into
  `test/clips/real/` (the page can't write into the repo). The done screen says so.
- **`?promptSeconds=N` scales take lengths** (2–600 s) for dry runs and e2e; the
  countdown stays real. The flow state machine is a pure reducer, fully unit-tested;
  the e2e asserts stable outcomes (download fired, review reached, next prompt) rather
  than racing the transient countdown/recording phases under suite CPU load.
- **Playwright's global per-test timeout raised to 120 s**: the suite legitimately runs
  several MediaPipe-wasm browsers in parallel now, and the 30 s default was timing out
  healthy tests, not catching bugs.
- The stage runs behind the director panel so kids see their skeletons while framing.

## 2026-11-25 — M0.7 — Lag test screen

- **DOM, not Phaser**: a single translated div + rAF is the lowest-overhead way to draw
  one marker, and keeps the lag screen independent of the render stack it helps diagnose.
- **The marker is `butter`, not white**: high contrast on the night surface without
  breaking the no-pure-white comfort rule; the counter is tabular-numeral, fixed-width
  (6 digits) so every 240 fps phone frame shows a steady, readable number.
- **`?screen=lagtest` skips the device check and overlay** — the measurement should not
  share the frame budget with anything else. Works over replay too (e2e uses the jumps
  clip to prove the marker follows a moving wrist).
- **~4.17 ms per 240 fps frame** in docs/LAG-TEST.md (PLAN said "~4 ms"); median of 4–5
  flicks, not best/worst.

## 2026-11-25 — M0.6 — Device check

- **Reduction ladder before warning**: full size → 480×360 → 320×240 (config constants),
  each re-benchmarked for 5 s; only when the smallest size still exceeds 20 ms does the
  parent-facing warning show (dismissible, tips tested for tone). The landmarker is
  shared across camera reopenings — only camera + stage session rebuild.
- **The decision flow (`planDeviceCheck`) is a pure async planner** taking a run-step
  callback, so the ladder walk and warn conditions are fully unit-tested with stub
  benchmarks; the e2e covers the real happy path and the stored-record skip.
- **Record in localStorage** (`wiggle.device-check.v1`: avg/p99 ms, final size, delegate,
  warned, timestamp), storage access fully guarded; corrupted = absent = re-run. Parents
  can clear it by clearing site data (a proper re-run button joins parent settings in
  M1.10).
- **CI reality**: on a slow runner the ladder may legitimately run (CPU inference on the
  fake pattern), so live-path e2e timeouts are generous and the warning screen appearing
  is tolerated by the specs. One e2e race fixed on the way: the recorder's "Saved" chip
  self-dismisses, so the spec asserts it before slow file reads, and records by polling
  the frame counter instead of sleeping.

## 2026-11-25 — M0.5 — Pose recorder + drag-and-drop

- **"Dev only" = dev build OR `?debug=1`**: Nick runs the built app (preview/Pages) on
  the TV, so a URL flag is the practical dev gate there. Without either, neither R nor
  drop exists.
- **A recording is only `{version,name,kind,nominalFps,frames:[{tS,poses}]}`** — a test
  pins the exact key set so nothing video-like can ever sneak into saved files.
- **nominalFps is estimated from the median frame interval** (timestamps remain the
  truth); recordings auto-stop at `RECORDER_MAX_S` (11 min).
- **Dropping a clip swaps the running session in-place** (destroy stage/overlay/source,
  start a replay session): clips are far too big for sessionStorage hand-offs, and a
  dropped file can't be a URL. The app got a small StageSession structure for this.
- **The e2e downloads the real file** via Playwright's download event and runs
  `validateClipFile` on it — the save path is proven end to end.
- Test-fixture lesson #2 today: the "60 fps" fixture carried hardcoded 30 fps intervals;
  the fixture was wrong, not the estimator.

## 2026-11-25 — M0.4 — Debug overlay

- **Skeletons and floor circles stay on the Phaser stage** (always-on skeletons are the
  M0 display; circles appear while the overlay is open); the overlay panel itself is DOM
  on top — cheaper than drawing text in WebGL and invisible to the render-fps budget when
  hidden.
- **The event ring carries lifecycle + pose presence transitions** until M1's motion kit
  pushes real events into the same `EventRing`. "Motion kit" row honestly reads
  "arrives in M1" instead of a fake 0.
- **`RollingStats.p99` is standard nearest-rank** (`sorted[ceil(0.99·n)−1]`). My first
  test expected the lone worst sample of 100 at p99 — that's p100; the test was wrong,
  not the implementation, and now uses an unambiguous 1..100 fixture. The M1 bench
  (18 000 frames) gets fine-grained tails from the same definition.
- **Replay frames don't feed the inference stat** (always 0); the overlay says
  "(replay)" so a dev never mistakes replay numbers for tracking speed.

## 2026-11-25 — M0.3 — Phaser stage + the fps measurement lesson

- **The fps acceptance test first failed at 46 fps — and the app was innocent.** Solo
  measurements: 60.4 fps headless default, 60.4 with GPU, 60.0 headed, two-kid clip at
  2×. The dip came from running the measurement in parallel with three other browser
  instances, one of them doing MediaPipe wasm CPU inference. Fix: a `perf` Playwright
  project that depends on the functional suite and runs after it, alone. The >55 fps
  threshold stands unweakened. Lesson for M1's bench: perf numbers need an idle machine.
- **Stage renders pull-style**: `update()` reads `source.latest()`; no awaits, no frame
  coupling (rule 2). Phaser 4.2.1's Scene/Graphics/Scale APIs verified against its own
  types before use — no Phaser 3 fallback needed.
- **Mirroring lives in `stage-math.ts`** (x → 1−x at draw time, unit-tested); landmarks
  stay raw everywhere else. Low-visibility points (< VISIBILITY_MIN_RATIO) aren't drawn.
- **Design resolution 1920×1080** (FIT-scaled); head drawn as a dot at the nose (no face
  edges). Floor circles are a debug aid at fixed quarter positions until M1.2 binds the
  real taped circles.
- **replay-badge now returns the loaded ClipFile** so the app feeds it to the stage; the
  badge's e2e-visible behavior (testid, states) is unchanged.

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

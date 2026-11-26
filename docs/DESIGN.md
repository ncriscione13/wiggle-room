# Wiggle Room — Design (source of truth)

Exported from the planning doc on Nov 25, 2026. Diagrams are described in text.

## Overview

Wiggle Room (working name) is a free, open-source set of webcam motion games for kids 3–10, played on the family TV with no controllers. It brings the Nex Playground idea of active screen time to any laptop, so kids keep moving through the cold months.

v1 ships three games, each built around a different kind of movement:

| Game         | Movement                        | Why it's in v1                                                 |
| ------------ | ------------------------------- | -------------------------------------------------------------- |
| Freeze Dance | Whole body, stop and go         | Listening and body control; zero reading needed                |
| Critter Dash | Running in place, jumping       | The cardio game: a race against siblings or a pacer            |
| Bubble Pop   | Reaching, stretching, squatting | Upper body and coordination; a 3-year-old can play it untaught |

v1 goals:

- Two kids play at once in every game, side by side, each at their own level
- Runs on any laptop or mini PC with Chrome and a webcam, from one link
- Calm, soft visuals made for young eyes
- Nothing leaves the device: no accounts, uploads, ads or tracking
- New games are easy to add: one folder per game

Out of scope for v1: smart TV apps, online play, accounts.

## Hardware and setup

The minimum setup is one laptop and one HDMI cable; the app is the same on every option, only speed changes.

| Setup         | What you need                                                        | Trade-off                                                                       |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Minimum       | Laptop with built-in webcam + HDMI cable                             | Laptop sits on a stool facing the room; narrow view, so kids stand farther back |
| Recommended   | Minimum + wide-angle USB webcam on top of the TV                     | Fits kids side by side and lets them play closer                                |
| Console-style | Mini PC (Intel N100 class) + wide-angle webcam, tucked behind the TV | Starts straight into the game full screen; no laptop to set up                  |

Room setup:

- Play area: about 8 ft wide and 6 ft deep for two kids, cleared of furniture, with only the players inside it; two taped circles about 4 ft apart
- Camera: centered under the TV at the front edge of the stand, about 2–3 ft off the floor
- Distance: kids stand about 7–9 ft from a laptop webcam, or 4–8 ft from a wide-angle webcam (estimated from typical fields of view; confirm in M0)
- Light: a well-lit room, no bright window behind the kids, no bright lamp above the camera; plain clothes that don't match the wall color track best
- Webcam to buy: 60 fps at 720p with a 90°+ field of view

Requirements: Chrome or Edge, a webcam, a TV with HDMI. Smart TV browsers and Android TV boxes can't give apps camera access, so they're out.

## Architecture and tech stack

Layers, top to bottom (data flows down):

1. Webcam (built-in or wide-angle USB)
2. Pose tracking (MediaPipe Pose Landmarker): 33 body points per kid, model size picked for the computer
3. Motion kit (the core): calibrate, smooth, assign players to circles, emit events
4. Game API: events, narrator voice, sound, theme, age mode, results
5. Games: Freeze Dance, Critter Dash, Bubble Pop

Side parts: Dev tools (pose replay, keyboard stand-ins) feed the motion kit. The app shell (launcher, profiles, parent settings, session timer, local saves) launches games.

The motion kit is the only part that reads tracking data. Games receive simple events.

| Layer              | Choice                                  | Why                                                          |
| ------------------ | --------------------------------------- | ------------------------------------------------------------ |
| Language and build | TypeScript + Vite                       | Fast dev server; builds to plain static files                |
| Body tracking      | MediaPipe Pose Landmarker for the web   | Free, Apache-2.0, runs in the browser, tracks several people |
| Games              | Phaser                                  | Scenes, sprites, sound and animation built in                |
| Hosting            | GitHub Pages, installable web app (PWA) | Free; one link; works offline after first visit              |
| Storage            | Browser local storage                   | Settings and stars never leave the device                    |

No backend, no accounts.

```
wiggle-room/
  src/
    tracking/   camera + MediaPipe, model size check
    motion/     calibration, smoothing, zones, events
    voice/      narrator: queue, clips, captions
    shell/      launcher, profiles, parent settings, timer
    ui/         theme colors, buddy avatar, shared pieces, sounds
    games/
      freeze-dance/   manifest.json + game scene
      critter-dash/
      bubble-pop/
    debug/      overlay, lag test screen
  voice/        lines.en.csv + rendered clips
  tools/pose-recorder/
  tools/voice-gen/   renders voice lines with Kokoro
  test/clips/   recorded movement clips (landmarks only, no video)
  CLAUDE.md
```

Each game folder holds a short manifest (name, age range, players, movement, intensity) and its scene. The launcher picks up new folders automatically.

## Lag budget

Target: under 100 ms from a kid's real movement to the picture on the TV; 120 ms is a hard limit. (A full-body mirror study found movement accuracy worsened between 75 and 125 ms of delay, and the sense of control faded past 125 ms.)

| Stage             | Budget               | How we hit it                                                                                   |
| ----------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| Camera to browser | ≤ 45 ms              | Request 60 fps at 640×480; bright room keeps exposure short                                     |
| Pose tracking     | ≤ 20 ms for two kids | Lite model on the GPU, one pass per new camera frame; each extra kid adds roughly one more pass |
| Motion kit        | ≤ 2 ms               | Light smoothing; events fire at the start of a move                                             |
| Game + drawing    | ≤ 17 ms              | Hold 60 fps; drawing never waits for tracking                                                   |
| TV                | ≤ 15 ms              | Game Mode on                                                                                    |
| Total             | ≤ 100 ms             | Measured on the real TV in M0, not assumed                                                      |

Low-lag settings, checked once per TV:

- TV: Game Mode on (ALLM, or HDMI input labeled "PC"/"Game"); motion smoothing off
- Laptop: plugged in; display set to TV only (Windows: Win+P → "Second screen only") at 1920×1080, 60 Hz
- Chrome: full screen, hardware acceleration on
- Sound: TV speakers over HDMI or wired speakers; no Bluetooth speakers
- Webcam: plugged straight into the computer, not a hub

Code rules that keep lag out:

1. Track every new camera frame exactly once; never queue frames.
2. Draw every screen refresh with the newest pose; drawing never waits on tracking.
3. Draw each kid's buddy ~30 ms ahead of the latest pose using joint velocity. Game rules use real, unpredicted events.
4. Fire events at the start of a move: jump at takeoff, step when the knee starts rising.
5. Check touches along the hand's path between frames (swept collision).
6. If tracking two kids takes over 20 ms, drop camera size first, then visual effects. If drawing still misses frames, move tracking into a Web Worker.

Measuring it:

- Debug overlay shows each stage's time live.
- Slow-motion check: film the kid and the TV together at 240 fps; count frames between the real hand moving and the on-screen hand moving (each frame ≈ 4 ms).
- In-app timing check: a 15-second "clap with the drum" test measures the full delay and shifts each game's timing windows.

## Motion kit

Turns 33 tracked body points per kid into a few simple events. No game reads raw tracking data.

1. Calibrate: 30-second warm-up the first time a kid plays (see Warm-up calibration), saved to their profile. Later sessions start with a 1-second head-to-ankles check.
2. Normalize: every distance is in body lengths (shoulder-midpoint to hip-midpoint).
3. Smooth: One Euro filter — heavy smoothing when a joint is nearly still, almost none when it moves fast.
4. Assign players: two colored floor circles, ~4 ft apart, match the two halves of the screen. Whoever stands in a circle is that player. No face recognition.
5. Detect: emit the events below.

| Event                | Fires when (defaults; each kid's warm-up replaces them)                                                    | Used by                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| moving / still       | Total body motion above / below a threshold for 0.5 s                                                      | Freeze Dance                    |
| step                 | A knee starts rising, alternating left/right (fires at start of lift); arm pumps also count for small kids | Critter Dash                    |
| jump                 | Hips shoot upward at takeoff (fires immediately); cancelled if they don't rise ~15% of body length         | Critter Dash, Bubble Pop        |
| squat                | Hips drop below 75% of standing hip height                                                                 | Bubble Pop                      |
| hand / foot position | Wrist and ankle points, smoothed, every frame                                                              | Bubble Pop, menus               |
| arms up              | Both wrists above the head                                                                                 | Menus ("arms up to play again") |
| left the frame       | Key points missing > 1 s                                                                                   | Pauses only that kid            |

Every event has a keyboard or mouse stand-in so each game is playable at a desk.

## Two players and tracking you can trust

Every game is built for two kids at once. A jittery or missed frame never costs a kid anything.

Two players at once:

- Each kid gets a taped floor circle and the matching half of the screen. Display is mirrored (step left → buddy moves left).
- MediaPipe tracks up to two bodies per frame (numPoses: 2). A player follows their circle, not their face, so players can't swap when arms cross.
- Two kids in one circle pauses that half: "One buddy per circle!"
- Each kid keeps their own age mode and difficulty.
- Solo works: if one circle is empty for 10 s, the game starts with one player. A second kid joins at the next round (Bubble Pop: immediately).

Taming jitter:

- Points with visibility < 0.5 are ignored, not guessed.
- A point that moves more than one body length in a single frame is thrown out.
- Hysteresis: separate "becomes still" and "becomes moving" thresholds.
- The same event can't fire twice within 150 ms.
- Buddy drawing uses light smoothing; game rules use the steadier event stream.

When the camera loses a kid (state machine, per kid):

- Tracked: buddy and game follow the kid in real time.
- Tracked → Coasting when key points become unsure.
- Coasting (up to 1 s): buddy keeps its last motion; nothing counts against the kid. Back to Tracked as soon as seen again.
- Coasting → Paused when still unseen after 1 s. Paused affects this kid only: buddy says "Step back into your circle!" while the other kid keeps playing.
- Paused → Tracked after the kid is seen clearly for 0.3 s (prevents flicker).

Benefit of the doubt — when tracking is unsure, the kid wins:

- Freeze Dance: a kid who can't be seen during a freeze counts as frozen.
- Critter Dash: the critter keeps its speed up to 1 s when steps aren't seen.
- Bubble Pop: bubbles escaping while a kid is coasting/paused don't count.
- No round ends and no kid is knocked out because of tracking.

Start-up check: before each round, each circle shows the kid's buddy and turns green once the kid is seen head to ankles for 1 s. Problems get a spoken fix:

| What the app detects       | What the buddy says                                        |
| -------------------------- | ---------------------------------------------------------- |
| Head or feet out of frame  | "Step back a little so I can see your feet!"               |
| Body taller than the frame | "Whoa, too close! Take two big steps back."                |
| Dark picture               | "It's a bit dark. Can a grown-up turn on a light?"         |
| Bright area behind the kid | "Something bright is behind you. Let's close the curtain." |
| Two bodies in one circle   | "One buddy per circle!"                                    |

Passing bar (recorded clips + playtests):

- 30 s of a kid standing still: zero false "moved" events
- 10 min of two kids playing: zero player swaps
- Tracking lost < 2% of play time per kid in a normally lit room
- A kid who steps out and back is playing again within 0.5 s of being fully in view

## Warm-up calibration

Each kid's first session starts with a 30-second warm-up that doubles as calibration. Both kids do it side by side to music, copying their buddies.

| Move                                    | The buddy says            | What it measures                              | What it tunes                                            |
| --------------------------------------- | ------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| Stand tall, 2 s                         | "Stand tall like a tree!" | Height, body size, standing hip height        | All distances; squat and jump baselines                  |
| Statue, 3 s                             | "Freeze like a statue!"   | Wobble while trying to hold still             | Freeze Dance "still" line, set just above their wobble   |
| Reach up, 2 s                           | "Reach for the sky!"      | Highest hand reach                            | How high bubbles float in Bubble Pop                     |
| Arms out, 2 s                           | "Be an airplane!"         | Arm span; whether arms reach the other circle | Touch margins, bubble spread, "scoot apart" warning      |
| Frog squats, 2                          | "Squat like a frog!"      | Squat depth                                   | Squat line                                               |
| Bunny hops, 3 (Big mode: jumping jacks) | "Hop, hop, hop!"          | Jump height and takeoff speed                 | Jump line, set at half their own hop                     |
| Run in place, 5 s                       | "Run, run, run!"          | Natural step rate and knee lift               | Step line; Critter Dash top speed at their own fast pace |

- Saved to the kid's profile. Parents can re-run it; the app suggests a redo every 3 months.
- A move not picked up after 2 tries is demonstrated again more slowly; then skipped, using the age-mode default.
- Later sessions only run the 1-second head-to-ankles check.

## Design principles for ages 3–10

Visual comfort:

- Muted pastel palette on soft mid-tone backgrounds; no pure white screens or saturated reds
- No flashing or strobing (well under 3 flashes per second)
- Slow, eased motion, big rounded shapes, one focal point at a time
- Voice prompts and picture demos instead of text

| Setting      | Little (3–5)                             | Big (6–10)                      |
| ------------ | ---------------------------------------- | ------------------------------- |
| Losing       | Never; every round ends in a celebration | Scores, stars, gentle challenge |
| Speed        | Slow, long reaction windows              | Speeds up as they improve       |
| Instructions | Voice + picture demo                     | Voice + short text              |
| Round length | 1–2 min                                  | 2–3 min                         |

Safety: kids run in place on their own spot. Each session starts with a clear-space check and ends with a 1-minute cool-down stretch.

Privacy: camera frames are processed in memory and discarded. Nothing is recorded or sent.

## What makes it fun

| Rule                         | What it means                                                         | Playtest check                            |
| ---------------------------- | --------------------------------------------------------------------- | ----------------------------------------- |
| First win within 10 s        | Each round opens with an easy success                                 | Every kid scores within 10 s of "go"      |
| Instant, big feedback        | Every hit gets sound + color burst + buddy reaction in the same frame | No move goes without a visible response   |
| Something new every 20–30 s  | Special bubble, pose card, obstacle or music change                   | Kids still moving at the end of the round |
| Short rounds, instant replay | Rounds 1–2 min; "arms up" restarts in < 3 s                           | Kids ask to go again in ≥ 2 of 3 sessions |
| Each kid at their own level  | 3 wins in a row steps difficulty up; 2 misses in a row steps it down  | No kid wins, or loses, every round        |
| Mistakes are funny           | Wobbles and misses trigger silly buddy reactions, never a buzzer      | No tears, no "I quit"                     |
| Play together                | Co-op moments in every game (team freeze bonus, shared bubble jar)    | Siblings cheer each other once a round    |
| Something to earn            | Stars unlock buddy hats, critter colors, new tracks                   | Kids name something they want to unlock   |
| Grown-ups can play           | Grown-up profile handicap (more steps per stride, smaller bubbles)    | A parent loses at least some of the time  |

Underneath all of it: the camera must feel like it sees you — at most one "it didn't see me!" per round.

## Voice guide

A friendly narrator tells kids what to do at every step. Offline, instant.

How it's made:

- All lines in `voice/lines.en.csv` (id, priority, 3–5 wordings).
- `tools/voice-gen` renders each wording to a short clip ahead of time with Kokoro (82M-parameter open-weight TTS, Apache-2.0 weights) via kokoro-js. Clips ship with the app.
- Clips are decoded into Web Audio buffers at startup so lines play instantly.
- Kids' names: on profile creation, kokoro-js runs once in the browser to make a few name clips ("Nice jump, Mia!"), cached on the device. Fallback: the kid's color.
- Don't use the browser's built-in speechSynthesis in production (Chrome's desktop voices need internet and vary by computer).

How it talks:

- About 6 words per line in Little mode, 10 in Big.
- One instruction at a time, while the buddy demonstrates.
- With two kids, lines start with the kid's color or name and are panned to that kid's side of the speakers.
- Music ducks under the voice.
- Never talk over a countdown or freeze; apply the measured audio delay so "Go!" lands on time. Little mode: the voice says "Freeze!" as music stops; Big mode: music stop only.
- Priority: safety/tracking help > timing cues > instructions > praise. Praise > 1 s late is dropped.
- Never the same wording twice in a row; a help line repeats at most every 8 s.
- Praise the move ("What a high jump!"); never "wrong" or "you lose."
- Captions at the bottom; separate voice volume in parent settings.

| Moment         | Example lines                                                           |
| -------------- | ----------------------------------------------------------------------- |
| Arriving       | "Hi! Step into your circle!" · "I see you, Blue!"                       |
| Warm-up        | "Stand tall like a tree!" · "Freeze like a statue!" · "Run, run, run!"  |
| Picking a game | "Hold your hand on a game!" · "Arms up to play again!"                  |
| Freeze Dance   | "Dance, dance, dance!" · "Freeze!" · "Wobbly! Shake off the snow!"      |
| Critter Dash   | "Three, two, one, go!" · "Jump the log!" · "Photo finish!"              |
| Bubble Pop     | "Pop the bubbles!" · "Reach up high!" · "Golden bubble, both hands!"    |
| Together       | "Blue and Pink, freeze together!" · "Team snowstorm!"                   |
| Tracking help  | Start-up check lines                                                    |
| Wrapping up    | "Two more minutes!" · "Cool-down stretch time." · "Great moving today!" |

Each game opens with a 10-second spoken intro while buddies demonstrate, then an easy first win. Spanish is the planned second language. Later idea: a grown-up voice pack recorded by a parent, stored on the device.

## Game 1: Freeze Dance

Kids dance while music plays and freeze when it stops. First game to build: needs only moving/still.

1. Music starts. Each kid has an on-screen buddy (soft round blob in their circle color) that copies their arms and legs.
2. A dance meter under each buddy fills while the kid keeps moving.
3. Music fades at a random moment; snowflakes drift in. Kids have a grace window to freeze.
4. Holding still turns the buddy into a sparkly ice statue. A wobble makes the buddy giggle and shake off snow (funny, not a failure).
5. After 3–5 s the music returns. A round = 6–8 freezes, ~2 min.

| Setting               | Little (3–5)              | Big (6–10)                                          |
| --------------------- | ------------------------- | --------------------------------------------------- |
| Music between freezes | 4–8 s, steady             | 3–10 s, less predictable                            |
| Grace window          | 1.0 s                     | 0.5 s                                               |
| Wobble allowed        | Generous                  | Tight                                               |
| Result                | Every freeze earns a star | Points for fast, still freezes; optional "out" rule |

- Big-kid twist: "Freeze like a…" picture cards (star, flamingo, tree, rocket) give bonus points for matching the pose.
- Fun hooks: silly frozen poses; snowstorm bonus when every player freezes at once; every third round plays a slow-motion dance song.
- Fair timing: grace window starts when the music stop reaches the room (measured audio delay).
- Two players: separate dance meters and grace windows; the snowstorm bonus needs both frozen.
- Look and sound: pastel night stage, slow snowfall, three CC0 loops at different tempos, soft fades.
- Detection: moving/still in body lengths; the still line sits just above each kid's statue wobble from the warm-up.

## Game 2: Critter Dash (running race)

Kids run in place to race an animal across a gentle side-scrolling track.

1. Each kid picks a critter (bunny, fox, turtle, penguin) by holding a hand over it.
2. Voice counts down: "3, 2, 1, go!"
3. The critter moves on the very first step and speeds up with each one, topping out at the kid's own fast pace from the warm-up (defaults: 2 steps/s Little, 3 Big). Arm pumps count too.
4. Big mode: logs and puddles roll in; jump to hop them. A miss only slows the critter briefly; it never stops.
5. Everyone finishes to confetti. Places shown only in Big mode.

| Setting       | Little (3–5)                     | Big (6–10)                              |
| ------------- | -------------------------------- | --------------------------------------- |
| Race length   | ~30 s                            | 45–60 s                                 |
| Obstacles     | None                             | Logs and puddles                        |
| Solo opponent | Friendly snail that waits        | Rabbit pacer, or ghost of your best run |
| Places        | Hidden; all finishers celebrated | 1st, 2nd shown                          |

- Mixed ages: speed is relative to each kid's own calibration, plus gentle catch-up.
- Tracks: Snowy Meadow first; Autumn Forest and Beach Boardwalk unlock with stars.
- Fun hooks: steady rhythm for 3 s → sparkle trail + speed boost; silly victory dance; slow-motion "photo finish" replay for close races.
- Two players: two lanes, one per circle.
- Stay on your spot: if a kid drifts out of their circle, the critter waits and footprints show where to step back.
- Detection: step and jump events, plus each player's circle.

## Game 3: Bubble Pop

Adds reaching, stretching and squatting; a 3-year-old can play with no instructions.

1. Big soft bubbles drift up from the bottom.
2. Touch one with any hand or foot to pop it. Each pop plays a note.
3. Specials: high ones (placed just under each kid's measured reach) need a stretch or jump; low ones need a squat; the giant golden bubble needs both hands.
4. Two players: each kid's half gets bubbles in their color; rainbow bubbles drift up the middle for either kid.
5. After 90 s the last bubbles float away and the pop count rises in a big friendly number.

| Setting         | Little (3–5)                             | Big (6–10)                                     |
| --------------- | ---------------------------------------- | ---------------------------------------------- |
| Bubbles         | Huge and slow; extra-generous touch area | Smaller, faster, more specials                 |
| Misses          | Never counted                            | Escaped bubbles cost a point                   |
| Learning rounds | Pop the color the voice calls            | Numbers in order, count by 2s, spell your name |

- Fun hooks: pops play "Twinkle, Twinkle, Little Star" (public domain) note by note; five quick pops → rainbow burst; golden bubble showers mini-bubbles.
- Detection: hand and foot positions, jump and squat. A touch counts inside the bubble plus a margin (full hand-width Little, half Big), checked along the hand's path between frames.

## Learning layer (added 2026-11-26, Nick's direction)

Movement-first learning, the GoNoodle model: the research on physically
active academic lessons shows moderate retention gains and better on-task
behavior, so the content rides the moves — never a quiz that stops the fun.

- **Grade selector per profile** in parent settings: Off (default) / Pre-K /
  K / Grade 1 / Grade 2+. Separate axis from Little/Big: age mode tunes the
  MOTION difficulty, grade tunes the CONTENT. Two kids can play the same
  round on different grades.
- **Content packs** are offline JSON (`public/learning/`) plus pre-rendered
  word clips — same no-network rule as everything else. Sight words use the
  Dolch lists (what school sight-word lists are built from).
- **Surface 1 — Word Freeze (Freeze Dance, ships first):** when a kid's grade
  is on, every few stops becomes a word stop: a big word card appears during
  the freeze, the narrator gives a beat to read it, then confirms it ("It
  says… GO!"). ACTION words are the magic: the word tells you the next move
  ("GO" = dance when the music returns, "UP" = arms up; JUMP/RUN/DOWN join
  when M2's detectors land). Reading is the controller.
- **Surface 2 — Jump Math (Critter Dash, M2):** "Jump 2 + 1 times!" —
  answer by jumping, Pre-K counting through Grade 2 sums.
- **Surface 3 — Catch (new game, after M3's touch tech):** letters, numbers
  and words drift down; catch the right ones ("Catch the word THE!").
  Items spawn inside each kid's measured reach. Two kids spell words
  together ("Catch C… A… T!"). This absorbs the roadmap's "Snow Catcher"
  and is the learning flagship. Wrong catches boing and giggle — never
  punish; explanatory feedback names what was caught.
- Bubble Pop keeps its existing learning rounds row and otherwise stays
  pure play; each game keeps one clear promise.

## App shell and parent settings

- Launcher: three big game cards; hold a hand over a card for 2 s (a ring fills) to start; "arms up" plays again. All games preload at startup (< 1 s to open).
- Player profiles: nickname, color, age mode and warm-up calibration per kid, saved on the device.
- Parent settings behind a grown-up gate (keyboard only, hold a key 3 s): session length, age mode per profile, music/voice volume, which games are shown, camera check, re-run warm-up.
- Session timer: 2-minute heads-up, cool-down stretch, "great moving today" screen; no new game until a parent unlocks.
- Stars and stickers per profile, on the device.

## Dev tools and testing

- Pose recorder: saves tracked points (never video) to small JSON clips. Replay feeds the motion kit exactly like live input.
- Keyboard/mouse stand-ins: arrows = steps, space = jump, mouse = hand.
- Debug overlay: skeletons, circles, live event log, per-stage timings, fps.
- Automated tests: detectors run against recorded clips (e.g., a three-jump clip must produce exactly three jump events).
- Device check on first launch: targets two-kid tracking < 20 ms/frame and 60 fps drawing (no frame > 17 ms); warns if not met.
- Kid playtests: each game tried by a Little and a Big player before release.

## Open-source setup

- License: Apache-2.0 (same as MediaPipe).
- Assets: self-made or CC0 only (e.g., Kenney's free packs), listed in ASSETS.md.
- Docs: README (3-step setup + GIF), CONTRIBUTING (game format), CLAUDE.md.
- CI: GitHub Actions runs tests and deploys to GitHub Pages on merge to main.
- Offline: installable PWA; works without internet after first visit.
- README privacy note: no accounts, no analytics, video never leaves the device.

## Roadmap

A phase is done when its gate passes, not on a date. Each game's voice lines ship with the game.

| Phase           | Scope                                                             | Gate                            |
| --------------- | ----------------------------------------------------------------- | ------------------------------- |
| M0 Foundation   | Repo, CI, Pages; 2-kid tracking; lag meter overlay; pose recorder | Motion-to-TV lag under 100 ms   |
| M1 Freeze Dance | Motion kit v1; warm-up check; 2 players at once; kid playtest     | Kids ask to play it again       |
| M2 Critter Dash | Steps and jumps; two-lane race; pacer critter; kid playtest       | Steps register for a 3-year-old |
| M3 Bubble Pop   | Hand + foot pops; launcher; parent settings; session timer        | All 3 games from one launcher   |
| M4 v1.0 release | Art + music pass; comfort review; README + GIF; public launch     | —                               |

The learning layer ships in slices alongside the phases: L1 Word Freeze
(after M1), L2 Jump Math (with M2), L3 the Catch game (after M3).

After v1.0: Animal Moves (copy the animal's pose), Simon Says. (Snow Catcher
grew up into the Catch learning game, L3.)

## Risks

| Risk                                   | Mitigation                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Lag from camera, laptop or TV          | Lag budget, low-lag checklist, slow-motion test at every gate                                             |
| Tracking less precise on 3–5-year-olds | Warm-up calibration, generous touch areas, benefit-of-the-doubt rules, real-kid clips                     |
| Kids overlapping                       | Taped circles ~4 ft apart; players follow circles; "One buddy per circle!" pause; 3 players only after v1 |
| Laptop webcam too narrow               | "Step back" guide; recommend wide-angle webcam                                                            |
| Slow computers                         | Lite model; smaller camera input; low-detail mode                                                         |
| Running near furniture                 | Clear-space check; critters pause when a kid leaves their spot                                            |
| Asset licensing                        | CC0 or self-made only, tracked in ASSETS.md                                                               |

## Sources

- MediaPipe Pose latency tables: https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose.md
- BlazePose browser benchmarks: https://blog.tensorflow.org/2021/05/high-fidelity-pose-tracking-with-mediapipe-blazepose-and-tfjs.html
- Full-body latency study (TU Dortmund, 2016): https://cg.cs.tu-dortmund.de/publications/2016-latency.pdf
- Consumer Reports, TV input lag: https://www.consumerreports.org/electronics-computers/tvs/best-tvs-for-gaming-a5428017066
- Nex Playground setup guide: https://nexplayground.com/blog/the-complete-guide-to-setting-up-nex-playground
- Kokoro-82M: https://huggingface.co/hexgrad/Kokoro-82M
- Browser speech voices by OS: https://readium.org/speech/docs/WebSpeech.html

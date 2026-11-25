# Measuring motion-to-TV lag (M0.7)

Target: **under 100 ms** from a real movement to the picture changing on the TV.
**120 ms is the hard limit** (DESIGN.md "Lag budget").

## One-time low-lag setup (do this first)

- TV: **Game Mode on**, motion smoothing **off** (or label the HDMI input "PC"/"Game").
- Laptop: **plugged in**; display set to **TV only** (Win+P → "Second screen only") at
  1920×1080, 60 Hz.
- Chrome: **full screen** (F11), hardware acceleration on.
- Webcam plugged straight into the computer, not a hub. Bright room.

## The slow-motion measurement

1. On the TV computer, open the app with `?screen=lagtest`:
   - live camera: `https://ncriscione13.github.io/wiggle-room/?screen=lagtest`
   - (dev server works too: `http://localhost:5173/?screen=lagtest`)
2. Stand in view. A big pale dot follows your **right hand**, and a millisecond
   counter runs at the top of the TV.
3. Set a phone to **slow motion, 240 fps**. Frame the shot so it sees **both your
   hand and the TV** at once.
4. Record a few seconds while you **flick your hand sharply left or right**
   (sharp starts are easy to spot frame-by-frame). Do 4–5 flicks.
5. Scrub the video frame by frame:
   - find the first frame where your **real hand** starts moving;
   - count frames until the **dot on the TV** starts moving;
   - each 240 fps frame ≈ **4.17 ms** → `lag ≈ frames × 4.17 ms`.
     The on-screen counter helps you keep your place while scrubbing.
6. Take the **median of your flicks**, not the single best or worst.

## Reading the result

| Median     | Meaning                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| ≤ 100 ms   | On budget — nothing to do                                                              |
| 100–120 ms | Check the setup list above again (Game Mode is the usual culprit)                      |
| > 120 ms   | Over the hard limit — send me the numbers + what the debug overlay (D) shows per stage |

Record for the playtest notes: median ms, TV model, and the per-stage numbers
from the debug overlay (press **D**: camera interval, inference, render fps).

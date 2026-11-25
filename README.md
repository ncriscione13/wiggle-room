# Wiggle Room

Open-source webcam motion games for kids 3–10, played on the family TV. Kids
jump, run, reach and freeze — the webcam is the controller. Two kids play at
once, side by side, each at their own level.

**Status: in development.** Phase 0 (project guardrails) is done; the games are
on their way. See `PLAN.md` for the build plan and progress.

## What you need

- A laptop (or mini PC) with Chrome or Edge and a webcam
- An HDMI cable to the TV
- About 8 × 6 ft of clear floor space and two taped circles ~4 ft apart

## Quick start (dev)

Needs Node 24 LTS (or ≥ 22.18 — the tools run TypeScript directly via Node's
type stripping).

```bash
npm install          # also copies the MediaPipe wasm into public/
npm run fetch-models # one-time pose model download (~6 MB)
npm run dev          # open the printed localhost URL in Chrome
```

`npm run check` runs the full gate: typecheck, lint, unit/clip tests, build and
browser smoke tests. `npm run dev:lan` serves over HTTPS for the TV computer.

## Privacy

Wiggle Room is built so nothing ever leaves the device: no accounts, no
analytics, no uploads, no ads. Camera frames are processed in memory and
discarded — video **never leaves** your computer and is never recorded. After
the first visit the app works fully offline. The optional pose recorder (a dev
tool) saves stick-figure landmark coordinates only, never video.

## License

[Apache-2.0](LICENSE). Art, music and models are self-made or CC0/Apache
licensed — every file is listed in [ASSETS.md](ASSETS.md).

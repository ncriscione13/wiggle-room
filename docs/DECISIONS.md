# Decisions and deviations log

Newest entries at the top. Each entry: date, task, what was decided, why.

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

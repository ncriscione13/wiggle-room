# Decisions and deviations log

Newest entries at the top. Each entry: date, task, what was decided, why.

## 2026-11-25 — Prep — Repo root is `motion-room`, GitHub repo will be `wiggle-room`

The starter files arrived in `wiggle-room-starter/` inside `C:\Dev\motion-room`. Claude Code and the
user's workflow treat `C:\Dev\motion-room` as the project root, so the starter files were moved up
and the repo was initialized there. The local folder name doesn't affect anything; the GitHub repo
(created in task 0.8) is named `wiggle-room`, which is what sets the GitHub Pages URL and the Vite
`base` path. Approved by Nick in the Phase 0 plan OK.

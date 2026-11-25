# Real recorded clips

Drop the `.json` files recorded with `?screen=record` (M0.8) here, keeping
their downloaded names:

```
standing-still-30s.json    bunny-hops-x5.json      running-in-place-10s.json
kid-squats-x3.json         reach-up-and-arms-out.json
both-kids-2min.json        kid-walks-out-and-back.json   dim-room-30s.json
```

These files ARE committed (unlike `test/clips/synthetic/`, which is generated):
they're the ground-truth fixtures the M1+ detector tests run against. They
contain landmark coordinates and timestamps only — never video.

`loadClip()` in the test harness prefers a real clip over a synthetic one with
the same name; the recorded names are deliberately distinct from the synthetic
set so nothing swaps silently.

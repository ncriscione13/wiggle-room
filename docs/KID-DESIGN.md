# Kid-friendly design notes (research, 2026-11-26)

Requested by Nick after the first family playtests ("they need to be dancing
for longer, and it needs to be more kid-friendly"). Sources are listed at the
bottom; each principle below names what Wiggle Room does about it.

## What the research says, and what we do about it

**1. Young kids want to MOVE; the skill moment is the punctuation, not the meal.**
Classroom freeze-dance guidance starts with LONG music and SHORT stops, and
only makes stops more frequent as kids master the game. GoNoodle's movement
videos run 2–5 minutes of continuous dancing. Our dances were 4–8 s.
→ _Applied:_ dance windows raised to 10–18 s (Little) / 8–16 s (Big);
freezes per round trimmed 6–8 → 5–7 so a round still lands near 2 minutes;
the dance meter now takes 8 s to fill so it stays a live goal.
→ _Backlog (M2+):_ "stops get more frequent with mastery" is exactly our
`difficulty()` hook — shorten the gap range one notch after 3 clean rounds.

**2. No-fail design: celebrate, never eliminate.**
Just Dance's Kids Mode keeps no score for kids — only "Yay/Wow/Haha"-style
reactions — and reviewers note it's nearly impossible to fail. Preschool
freeze-dance guides say never put a kid out; celebrate the silliest poses.
→ _Already aligned:_ benefit-of-the-doubt rules, wobble = giggle, no
elimination, Little mode has stars but no score. Keep points Big-mode only.
→ _Backlog:_ a "silly statue" celebration — occasionally praise the FUNNIEST
freeze, not the fastest (research: celebrating silly poses keeps 3-year-olds
in the game).

**3. Younger players want MORE FREQUENT feedback.**
Game-design literature on young children is explicit about feedback cadence,
and GoNoodle's hosts never go quiet while kids move.
→ _Applied:_ mid-dance encouragement — the narrator cheers the dancing on
about every 7 s during a dance (jittered, rotating wordings, priority rules
keep it clear of "Freeze!").

**4. Assume non-readers: audio carries everything, text is decoration.**
Sesame Workshop's preschool guidance: minimal on-screen text, explicit audio
instructions, and don't interrupt kids mid-activity.
→ _Already aligned:_ every instruction is spoken (captions mirror it); the
playtest-round-2 queue clearing is the "don't talk over the moment" rule.

**5. Simple, forgiving motor demands; intuitive "do what you see".**
NN/g: under-5 designs must avoid complex motor demands; Double Fine's Kinect
lesson: the best activities need almost no instruction, and more physical =
more fun.
→ _Already aligned:_ freeze/dance/jump/squat are body-obvious; warm-up
calibrates thresholds to each kid's own body.
→ _Backlog:_ the buddy should DEMONSTRATE warm-up moves (animated buddy doing
the move), not just mirror the kid — "copy your buddy" currently relies on
the spoken prompt.

**6. Recurring characters and repetition build trust.**
GoNoodle leans on recurring hosts and daily repetition; Just Dance Kids uses
relatable characters (pirate, robot).
→ _Backlog (M2+):_ buddies persist per profile (color + name already do);
consider naming the buddies out loud ("Blue Buddy") and keeping their
reactions consistent across games.

**7. Short sessions, clean endings.**
Freeze-dance guides suggest ~10-minute sessions; classroom use ends on a calm
freeze ("breathe and sit down").
→ _Already aligned:_ session timer with heads-up + cool-down stretch +
goodbye is exactly this shape. Parents can pick 10 min in settings.

**8. Tempo variety holds attention.**
Guides alternate slow and fast songs to keep freeze dance interesting.
→ _Already aligned:_ three music tempos; slow-mo every third round. Research
validates the design — no change.

## Applied today (config + one core change)

- `FREEZE_MUSIC_GAP_S`: little 4–8 → **10–18 s**, big 3–10 → **8–16 s**
- `FREEZES_PER_ROUND_COUNT`: 6–8 → **5–7** (round stays ≈ 2 min)
- `FREEZE_METER_FILL_S`: 4 → **8 s**
- `FREEZE_DANCE_CHEER_EVERY_S` (new): **7 s** mid-dance encouragement cadence
- Solo pick shows exactly **one** circle (round-3 bug: "one kid still shows 2")

## Sources

- Freeze-dance classroom guidance (longer music/shorter freezes, never
  eliminate, celebrate silly poses, ~10-min sessions):
  [CLI Engage Family](https://cliengagefamily.org/freeze-dance/),
  [Elementary Arts Integration](https://www.elementaryartsintegration.com/freeze-dance.html),
  [Organized Chaos](https://caldwellorganizedchaos.blogspot.com/2018/12/the-right-way-to-play-freeze-dance-in.html),
  [Sing Play Create](https://www.singplaycreate.com/2026/09/how-to-turn-a-freeze-dance-into-a-calm-classroom-transition.html),
  [Ready Child](https://readychild.org/activity/freeze-dance/),
  [Musical statues](https://en.wikipedia.org/wiki/Musical_statues)
- Just Dance Kids Mode (no-fail, encouragement-only feedback, easy moves,
  low-text menus):
  [Ubisoft news](https://news.ubisoft.com/en-us/article/2DKs9FAeTIECI2OuLJR9DH/just-dance-2018-kids-mode-tailors-experience-for-children),
  [AppTrigger review](https://apptrigger.com/2017/11/03/just-dance-2018-nintendo-switch-review-kids-now-welcome/),
  [MKAU review (2022)](https://www.mkaugaming.com/all-review-list/just-dance-2022-nintendo-switch-review/)
- GoNoodle (2–5 min movement videos, recurring hosts, repetition,
  storytelling): [GoNoodle blog](https://blog.gonoodle.com/storytelling-that-moves-the-missing-link-in-kids-media),
  [Common Sense Media review](https://www.commonsensemedia.org/app-reviews/gonoodle-kids-videos)
- Preschool interaction design (non-readers, audio-first, simple motor
  demands, frequent feedback):
  [Sesame Workshop tablet best practices (PDF)](https://joanganzcooneycenter.org/wp-content/uploads/2020/02/SesameWorkshop-2012.pdf),
  [NN/g physical development](https://www.nngroup.com/articles/children-ux-physical-development/),
  [NN/g kids' cognition](https://www.nngroup.com/articles/kids-cognition/)
- Kinect-era motion-game lessons (intuitive, minimal instruction, more
  physical = more fun):
  [Game Developer on Once Upon a Monster](https://www.gamedeveloper.com/business/capturing-the-spirit-of-sesame-street)
- Attention spans ages 3–5 (engaged-activity minutes; large variance):
  [Speech Therapy Centres](https://speechtherapycentres.com/children-and-age-appropriate-attention-spans/),
  [Empowered Parents](https://empoweredparents.co/10-ways-to-develop-your-preschoolers-concentration-span/)

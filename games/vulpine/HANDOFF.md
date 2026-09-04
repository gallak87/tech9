# Vulpine — handoff

Operational reference for a fresh agent: the rules, the harness, and the traps
that have already cost sessions.

**This file is not a plan and not a defect list.** It is the harness, the rules
and the traps. The plans live elsewhere:

| doc | what it owns |
|---|---|
| `PLAN-LEVELS.md` | level identity — phases 1-5 and 7-9 landed, phase 6 parked |
| `ROADMAP.md` | everything else open, and `## Settled` for why things are as they are |
| `PLAN-PERF.md` | the open perf lane |
| `CONTRACT.md` | lane ownership and the hard rules |
| `REVIEW.md` | the review rubric |

## Where we left off — 2026-09-03

Stopped clean, not mid-fix. All four gates green on a clean tree at once.

**The level-identity lane is closed.** `PLAN-LEVELS.md` phase 9 is done and
every row of its four-levels table reads `meets` under `tools/shape.mjs
--strict`. What is left in that file is phase 6 alone, the Venom orbit arena,
and it is parked on a conflict with `CONTRACT.md` hard rule 9 — resolve the
rule before starting it.

### The next action is the boss arena — `ROADMAP.md`, first item

**Every boss in the game is fought past the end of its own level's geometry**,
and it is the largest thing standing between this build and ship criterion 2.
Found and measured this session, with captures: the Foundry's carrier is fought
on a bare starfield with no deck, no walls and nothing else in frame; Corneria's
is fought over open ocean with the canyon gone. **Fixed for `works`** — the
Foundry builds 8320 m of dock past `zEnd` (`works.run`) for 27 ms of build and
no frame cost — and open for the four `terrain` levels and the belt, which is
where the triangles are. Measurements and captures in `ROADMAP.md`.

### What landed this session

**The `works` backend became authorable along z.** It was one box for all 9 km —
`half`, `deckY` and `roofY` fixed on the DNA and `Works.deckY()` a static with
no z — so three of the Foundry's four brief rows had nothing to author into.
`works.zones` is now the same idea `zones.js` gives `terrain`: held stretches
with a blend between them, carrying `half`, `deckY`, `roofY` and a per-flank
`rise`, sampled as a pure function of z so `groundAt`, `ceilingAt` and the
offline gates all read one profile. Bay kinds became a run list a zone names
rather than one pattern cycled over the whole corridor.

Deck, curtain, lamp runs and roof are corner-exact plates rather than centred
boxes: a slab centred on a segment has one width and one height, which turns a
taper into a sawtooth and a descent into a stair — measured at the mesher's own
86.7 m segment, the deck edge would step 85 m where the assembly floor widens
and the deck 207 m through the shaft.

**The Foundry is authored, in five acts** — gantry run to -2280, breach to
-3840, shaft to -5400, assembly floor to -7800, dock to the end. The deck is a
ledge on the flank of the works with the massing climbing to port and stepping
down and outward to starboard; a bulkhead at -2540 takes it inside; the rail
dives 430 m at 68° with the deck under it; the corridor opens to 860 m across
under a 165 m roof; the last act is an open dock. Its wave and comms tables were
re-placed against those boundaries and against two constraints the shape sets —
a battery's `bank` must fit inside that act's `half`, and nothing arms between
-4430 and -3360 because the shaft dives there.

**Two gates learned to read a built corridor.** `lid.mjs` was blind to the only
backend in the game with real geometry overhead — it printed "foundry: no lid"
— and now audits deck, walls and roof against the offset box. `shape.mjs`
printed one line about `works` and measured nothing; its BUILT pass now reports
half, deck movement, roofed fraction, sky changes per km and flank asymmetry,
and the Foundry's brief row is checked against them.

**The Foundry's review cameras are one per act**, replacing a set framed on bay
indices from a bay pattern that no longer exists: `w4-gantry`, `w4-edge`,
`w4-breach`, `w4-shaft`, `w4-assembly`, `w4-dock`, `w4-deck`, `w4-wide`.

### Traps this pass paid for

- **A level with no land has no ground for a battery to stand on.** `groundAt`
  answers the waterline. Everything a `banks` wave needs — the band `bank`
  places across, the line `first + i * step` lays down, both sides — has to be
  authored as an island, and no other prop may stand in that band.
- **Props scattered in a narrow lateral band overlap into two walls.** A trunk
  is 200 m across and the ranks are 180 m apart; in one band that is a canyon
  with texture on it. Scattered from 320 to 1150 m, the same count reads as gaps.
- **A rail dive is only felt where something comes with it.** Venom's crest
  descends with its dive, Aquas' plunge crosses the sea surface. Over a flat
  floor a descent is invisible and still costs the player their aim budget.
- **Read a brief row against live play before believing it.** Venom's said
  "inverted / rhythm / alternates" and was authored as a ridge at the start and
  a canyon after. Two agents shipped the narrow reading before it was caught in
  play. Fortuna's said "the canopy is both layers"; what it wanted was heights,
  which is what its own DNA comment had said for two sessions.

### Gates, all runnable from `games/vulpine`

- `tools/digest.mjs --against` — green on all seven. **Cut a digest before you
  edit, not after.**
- `tools/lid.mjs --audit` — green. Two audits behind one flag: a canopy level is
  checked against the terrain under it, and a `works` level against its own deck,
  walls and roof. It was blind to the second until 2026-09-03 and printed
  "foundry: no lid" for the one backend that has one.
- `tools/shape.mjs --strict` — green. Checks the four-levels table row by row
  (`done` rows gate, `open` rows print as the work) as well as the shape clash,
  and prints per-corridor coverage: what fraction is each shape, authored
  metres, how far the rail moves in how many monotone runs, and the flank pass
  (`walled` / `columns` / `open`). A `works` level has no cross-section and is
  measured by the **built corridor** table instead — half-width range, deck
  movement, roofed fraction, sky changes per km, flank asymmetry and the rail's
  steepest gradient. `--draw <level>` renders a cross-section as ASCII with the
  rail height beside it.
- `tools/pilot.mjs fly --headed` prints **two console 404s that headless does
  not**. Verified on the same commit, both ways: it is the harness, not the
  build. Do not chase it.
- `tools/hop.mjs [--level L] [--headed]` — records every rendered frame of the
  victory lap and the transition and reports the camera-to-ship offset. Kills
  the boss with `combat.killBoss()` to get there. Not a gate: read `worst` per
  axis, which is what catches a one-frame jump. Its sign-flip count is too
  sensitive to be diagnostic — see ROADMAP.

  `--burst N --out DIR` captures N evenly-spaced frames across the sequence
  instead of sampling it, which is the only way to read the *shape* of a hop.

  **The hop was four separate defects, all found with it.** The interpolation
  snapshot survived a world swap (7003 m of hull travel in one frame on Aquas,
  984 on Corneria — now 2.0 and 0.97); the hull never pitched into `climb`, so
  a 68° ascent was flown level and read as a diagonal slide rather than an arc;
  the chase rig kept running its damper, lead and shake through a sequence with
  no player input (`flight.cinematic` pins it now — shake alone was 3.8 m of
  camera translation at 47 rad/s, the "shaking side to side"); and `climbRate`
  was differenced on the fixed step while `climb` advances on frame dt, which
  aliased the nose between the climb angle and level on 38% of frames. It is
  analytic in `campaign.js` now — the derivative of smoothstep is 6p(1 - p).

  Measured over the pinned hop, before → after: pitch sign flips 637/1657 →
  2/1899, lateral camera-to-ship p95 1.86 m → 0.000, vertical p95 5.31 → 0.18
  on Fortuna, `climbRate` peak 859 → 663 m/s (the true analytic peak, so the
  aliasing is gone rather than hidden). Verified on all five levels that have a
  hop, orbital and overland.

  **The lap is deliberately NOT pinned.** It is the level still being flown and
  keeps the ordinary rig — damper, lead, and the shake off a capital ship coming
  apart. `hop.mjs` reports the two halves separately for that reason: the lap
  reads like live play and should, the hop should read as very nearly zero.

  `campaign.js` also re-read `surfaceClimb` every frame while `railZ` was still
  advancing, so the lap's ramp chased a moving target. The lap is now three
  beats: `LAP_HOLD` 4 s of ordinary flight while the capital ship comes apart,
  `LAP_RISE` 3 s to surface on a level flown under one, then level flight until
  `LAP_MIN` at 11 s. The hop starts from up there.
- `tools/quiet.mjs --audit` — green. Rail moves: fast, in the gaps, and wave
  tables in order. Static, so it is cheap; `pacing.mjs` is the live instrument.
- `tools/fins.mjs --audit` — green, and covers all three backends since
  2026-09-03: it skipped `works` and `field` entirely before that, so the one
  backend that decides each face's winding from an outward hint had never been
  checked. A heightfield level gets the full audit — hems, columns, and a gate
  on the worst single mesh's back-facing fraction, because a winding regression
  is a whole mesh and the scattered facets it prints as a note are sub-grid
  props aliasing against the grid. A built or belt level gets winding only, and
  anything above zero fails: there is no grid there, so there is no aliasing to
  tell a real flip apart from.

**`shots/` is gitignored**, so every capture named in these docs is local to
whoever made it. A fresh clone regenerates its own baseline — the command is in
`PLAN-LEVELS.md ## Verification`. It was pruned 2026-08-22 from 1.7 GB to
112 MB; what a gate actually needs is the seven `ref-geometry-*.json`.

Still open and untouched, all in `ROADMAP.md`: no hop has ever been *flown* into
a new level (`tools/pilot.mjs hop`), no `pacing.mjs` pass on Aquas or Venom,
`lancer` / `scarab` / `pylon` never measured, and boss durability does not scale
across the campaign.

## Rules

- **Every commit that closes a roadmap item ticks its box in the same commit.**
  If a commit closes nothing, name the phase it belongs to in the message.
- **At the end of a phase**, re-cut `ROADMAP.md`'s `Status:` line and move the
  finished block into `## Settled` with the files it landed in.
- **Anything discovered mid-session that is not this session's work** goes into
  `ROADMAP.md` under its phase — not a code comment, not a commit message, not
  only here.
- **No prose in code comments.** State the constraint, not the story: no "the
  owner reported", no before/after numbers, no narrating the change.
- **Never assert a magnitude you have not measured.** "Negligible" is a claim,
  and its confident tone makes the next reader build on it instead of checking.
  Put the number in or leave the sentence out. This cost a whole crosshair
  rebuild — a comment called a rotation difference negligible; it was 0.75 rad,
  which at 520 m of lever arm threw the reticle 1.03 ndcY clean off frame.
- **When you change what code does, re-read the comment above it.** A stale
  comment is a wrong answer in the one place a reader trusts.
- **Do not add a module the roadmap does not ask for.** Ship criterion 7 is no
  dead code; this project has shipped ~5,400 lines of finished, unimported
  modules across two sessions.
- **No binary assets, no network fetches, no `Math.random()`** — use
  `rng('stream')`.
- **Register review cameras with `registerShot()` from your own file.**
  `src/game/shots.js` is shared and read-only.

## Sub-agents

**One at a time, plus yourself inline on a disjoint lane.** Five parallel lanes
hit the usage ceiling in ~15 minutes and three landed dead code. Hand a sub-agent
the API contract *in its prompt* — making it re-derive interfaces from source is
what burned the budget the time before.

Two concurrent lanes is one too many, and **not** because of merge conflicts —
disjoint files never conflicted once. Every lane drives the *same running app*,
so a before/after capture renders whatever the other lane's files are at that
instant and any A/B measures both changes at once. To measure a look while
another lane is live, capture from a clean worktree:

```bash
git worktree add /tmp/iso HEAD --detach
ln -s "$PWD/node_modules" /tmp/iso/games/vulpine/node_modules
cp src/<your file> /tmp/iso/games/vulpine/src/<your file>
# capture in /tmp/iso; remove with: git worktree remove /tmp/iso
```

## Harness

Never claim a look without a PNG you have read. Run from `games/vulpine`, not
the repo root. **Non-zero exit = console errors, and any console error is an
automatic fail.**

```bash
node tools/shot.mjs --shots combat-wave,combat-wide --t 20 --w 1600 --h 900 \
     --quality ultra --hud --params "fight=1" --out shots/rN --port <unique>
node tools/sheet.mjs shots/rN --cols 3 --width 560          # → shots/rN/sheet.png
node tools/sheet.mjs shots/rN-1 shots/rN --pair --labels "before,after"
node tools/shot.mjs --list --port <unique>                  # all angles (don't `tail`)
```

| tool | the question it answers |
|---|---|
| `shot` / `sheet` | what a named camera sees; before/after pairs |
| `freecam` | `--pos --look --fov --nofog --nowater --wire` — the only way to see the level from outside itself |
| `inputtest` | does each control do what the legend says (captures never touch the keyboard); `--menu` also shoots title + pause |
| `pacing` | steps the sim, samples the fight 10×/s — wave gaps, entry range, time-on-target per class |
| `bossprobe` | leash envelope, % of fight in range and in cone, rounds landed, when each weak point dies |
| `framing` | where the ship sits in frame over time — ndcX/ndcY, nose-vs-camera angle, camera yaw |
| `hist` | composited histogram medians; settles 8 frames, `--js` sets the "before" arm |
| `pilot` | `fly` (full playthrough), `drops` (every drop reaches the player), `aim`, `roll`, `hop` |
| `bootprof` | where boot time and the transition freeze go — CPU self time by module and function. `boot` or `hop` arm |
| `digest` | did a refactor change any generated bytes — hashes baked textures, static geometry and a `groundAt` lattice. `--out` then `--against`, exit 1 on any difference |
| `lid` | is there room to fly under the ceiling — corridor headroom, NaN lids, and the Infinity contract. Notes terrain breaking a lid outside the corridor without failing on it |
| `shape` | do the levels have different cross-sections, and does each meet its brief — RIDGE/FLAT/VALLEY at twelve points, per-corridor coverage every 40 m, authored metres, rail runs, and the four-levels table checked row by row. `--strict` fails on a shape clash or a regressed `done` row |

In-page: `__VULPINE__.probe()` (healthy daylight: median 0.10–0.20, p90 < 1.5,
clippedPct < 4, blackPct < 12), `.stats()`, `.post({exposure})`, `.setShot()`,
`.seek()`, `.step()`, `.hudVisible()`, `.engine.setPixelRatio()`,
`.combat.dropTest(kind, ahead, up, side)` (eject a drop at an offset in the rail
frame, without flying to a wave that has one).

URL params: `?level=corneria|highlands|omega|aquas|fortuna|foundry|venom`
(boots a level's world AND
its wave tables), `?exposure= ?nopost=1 ?bloom=0 ?hud=1 ?fight=1 ?env= ?wpn=N
?grants=0 ?railyaw= ?dev=1`. `shot.mjs` always appends its own `env`, so a
level's preset must be passed explicitly: `--params "level=omega" --env space`. **`?fight=1` drives trigger and lock from the sim
clock** — without it every review frame has cold guns.

Dev panel: backquote toggles, `?dev=1` opens, buttons in `TOOLS`, sliders in
`KNOBS`. Key `5` copies every look value as JSON to paste into the preset.
**Append to `TOOLS`, never insert** — `tag`/`code` are the list index, so a tool
added in the middle silently renumbers every shortcut after it.

## Traps that have already cost sessions

- **`__VULPINE__.step(n)` refreshes the rendered scene once, at the end.** The
  guns converge on the camera ray, so a probe batching 30 ticks fires 30 volleys
  down a pose up to 44 m stale and nothing hits anything. Step one tick at a
  time. Real play batches at most 2.
- **`setShot()` only sets a flag** — the camera moves inside the frame path, so
  probing straight after it measures the *previous* pose and every shot reports
  identical numbers. Settle first; `hist.mjs` gets this right.
- **Tune `environment.js`, not `postfx.js`.** `env.apply()` overwrites every pass
  param from the preset, so the constructor defaults are never what is on screen.
- **`env.apply()` silently skips a key whose uniform name it guesses wrong.**
  `ca` → `uCa` against the real `uCA` meant chromatic aberration never applied in
  any preset. Fixed with a caps fallback; future acronym keys are at the same risk.
- **`theme.js:mix()` returns `'rgb(r,g,b)'`, not hex.** So `alpha(mix(a,b,t))`
  yields `rgba(NaN,…)`, canvas rejects the fillStyle and silently *keeps the
  previous one*. Use an explicit hex ramp or `g.globalAlpha`.
- **No backticks in comments inside GLSL template literals** — it terminates the
  template and reports `Unexpected identifier` on a line that looks fine. This
  has now cost two sessions; the reader who knows the rule still writes
  `` `gTri.r` `` in a shader comment out of habit. `node --check` on a copy of
  the file catches it in a second, and the page error does not name the file.
- **A GLSL identifier that is a reserved word kills the whole material, and the
  only place it is reported is the console.** `float patch` cost Fortuna its
  entire terrain across two sessions of captures, because `shot.mjs` prints
  `N console error(s)` and exits non-zero and nobody read either. Reserved in
  GLSL ES beyond the obvious — the spec's reserved-for-future-use list, of
  which only `patch` has bitten so far: `patch`, `sample`, `filter`, `input`,
  `output`, `active`, `common`, `partition`, `resource`, `superp`.
- **Every outcome counter in a diag block reading exactly zero means the counter
  is not wired, not that the system is broken.** `homingHit: 0` over 72 rounds
  read as "homing never hits a boss"; the increment simply sat in the `foes`
  branch and the boss is a different one.
- **`?level=` takes the campaign id, not the DNA id, and an unknown one does not
  error — it silently serves Corneria.** A `bossprobe` run against
  `level=fichina` returns a complete, plausible fight against the wrong boss.
  The Highlands' DNA key is `fichina`; its level id is `highlands`.
- **A probe that measures the wrong thing is worse than no probe.** Twice a probe
  has confidently called an inverted control correct: `pilot aim` compared
  absolute positions when the hull rests ~0.3 ndc below centre by design, and
  `pilot roll` took its sign from peak `|upX|`, which flips twice in a 360° sweep.
- **`framing.mjs` hands-off shows ~3.5° of camera yaw — that is shake, not
  drift.** The probe takes hits and shake displaces `camera.position` before
  `lookAt`. `off.x`/`off.y`/`_sOffX` measure zero variance. Do not chase it.
- **`freecam` boots Corneria unless you pass `--level`.** Every capture taken
  without it is of Corneria's shape whatever `--env` says.
- **The landmass is fine.** Two separate investigations concluded "the terrain is
  missing" from in-canyon cameras that simply had the highland outside the
  frustum. Use `freecam --nofog --nowater` before claiming geometry is absent.
- **`digest.mjs --against` must be read by exit code.** Its failure line is
  `*** OUTPUT IS NOT IDENTICAL ***`, so a grep for "identical" matches the
  failure too and reports every level green. This produced one false all-clear.
- **`shots/` is gitignored**, so no capture or digest baseline travels with the
  repo. Any doc that names one means "regenerate it locally first".
- **Captures are not deterministic frame to frame.** Same code, two runs of
  `shot.mjs` on Venom: 3-11% of pixels differ, max channel delta 205 — transient
  bolts, sparks and enemy positions. Pixel-diffing two captures proves nothing;
  read the sheet, or measure with `hist.mjs` / `digest.mjs`.
- **`digest.mjs` is a sanity check, not a bit-identity contract.** Float-order
  changes that are provably no-ops still move hashes: replacing the terrain band
  stack with an equivalent polyline shifted 0.0034% of samples by one Float32
  ULP (~30 µm) because `beachH + (shelfH - beachH)` is not bitwise `shelfH`.
  Read the diff and judge whether it is the change you meant.
- **Perf numbers are noise while lanes render concurrently** — validate serially.
  Frame-time measurement rules are in `PLAN-PERF.md`.
- **Motion-blur mask, three paid-for constraints:** draw it from a private
  2-child scene (a nested `renderer.render(scene, …)` re-runs the shadow-map
  update for everything in that scene); draw it in `post.render()` *before*
  `composer.render()`, never mid-chain; take **one** sample — half-res plus a
  linear filter already feathers across ~2 full-res pixels, and a 5-tap version
  cost 7.8 ms at 1080p. Feather via `maskScale`, never by adding taps.
- **Edge-triggered actions must guard on a predicate the action itself
  invalidates.** A resource counter is not one: `bombs > 0` stays true after
  spending one, and inputs are sampled per rendered frame but read per fixed
  step (1–8× per frame).

## The goal, verbatim

Re-issue with `/goal`:

```
I want you to build a 3D flying game Star Fox Vulpine at the level of the Star Fox 64 game. It should be utterly perfect, visually beautiful, with every single thing done at AAA quality—from textures to physics to anything you could think of.
on each item and have a separate sub-agent check it visually to ensure it looks triple A. That separate sub-agent should be a really harsh critic, and if it doesn't look triple A, it should keep going.
```

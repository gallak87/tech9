# Vulpine — handoff

Operational reference for a fresh agent: the rules, the harness, and the traps
that have already cost sessions.

**This file is not a plan and not a defect list.** It is the harness, the rules
and the traps. The plans live elsewhere:

| doc | what it owns |
|---|---|
| `PLAN-LEVELS.md` | **the active lane** — level identity, nine phases, five landed |
| `ROADMAP.md` | everything else open, and `## Settled` for why things are as they are |
| `PLAN-PERF.md` | the open perf lane |
| `CONTRACT.md` | lane ownership and the hard rules |
| `REVIEW.md` | the review rubric |

## Where we left off — 2026-08-22

Stopped clean, not mid-fix. All four gates green on a clean tree at once, which
had not been true before.

**The active lane is level identity — `PLAN-LEVELS.md`.** Five of seven levels
read as the same level because the terrain cross-section folded about
`Math.abs(u)`, so every one was the same valley at a different scale.

**Every mechanism is landed** — phases 1-5, 7 and 8. What is left is the
authoring they exist for, plus phase 6.

### The next action is Fortuna

It is 14% authored and the most static level in the game, and its headline beat
is already built: over a sea of glowing crowns, down through a gap, along the
dark understory, back out. That is exactly what phase 8 gave Aquas — Fortuna
simply has no `canopy` declared. Expect a full session; the last two authoring
passes each took one.

Two things it will hit immediately, both paid for on Venom:

- **A surface plane at y = 0 pins the rail.** `groundAt` clamps there and the
  offset box is 46 m deep, so the rail can never come below ~60. Fortuna has
  water at y = 0 and a base of 52, so it *cannot descend at all* until the base
  goes up — which is why it has no dive today. Venom's had to go 48 → 400.
- **`bands.crag.face`** opens the crag band on local slope rather than on
  distance, which is the only way any noise reaches an inverted section. Fortuna
  is near-flat so it may not need it, but the gate that decides is the same one.

After Fortuna: **phase 6** (the orbit arena, which carries the last piece of
phase 4 — `railPoint` still composes z, so the corridor cannot double back), and
**the Foundry**, which is not an authoring job at all — `works` is one box for
all 9 km and `Works.deckY()` is a static with no z, so three of its four brief
rows have nothing to author into.

### What landed this session

Aquas authored to 72% and read against its row; **Venom wiped and rebuilt as a
spine for all nine kilometres** (RIDGE 85% of the corridor, rail 400/150/520/180,
`crag.face` added for it); phase 4, so speed is measured along the rail and
`ai.js` station offsets rotate through its heading; and both gates that were not
gating — `shape.mjs` now checks the four-levels table, `fins.mjs` now tests
winding rather than sub-grid aliasing.

**Read a brief row against live play before believing it.** Venom's said
"inverted / rhythm / alternates" and was authored as a ridge at the start and a
canyon after. The owner wanted the whole nine kilometres on the spine. Two
agents shipped the narrow reading before it was caught in play.

### Gates, all runnable from `games/vulpine`

- `tools/digest.mjs --against` — green on all seven. **Cut a digest before you
  edit, not after.**
- `tools/lid.mjs --audit` — green, and prints no standing notes since the Aquas
  pass took its walls back under its own sea surface.
- `tools/shape.mjs --strict` — green. Checks the four-levels table row by row
  (`done` rows gate, `open` rows print as the work) as well as the shape clash,
  and prints per-corridor coverage: what fraction is each shape, authored
  metres, and how far the rail moves in how many monotone runs. `--draw <level>`
  renders a cross-section as ASCII with the rail height beside it.
- `tools/fins.mjs --audit` — green. Gates on the worst single mesh's back-facing
  fraction, because a winding regression is a whole mesh; the scattered facets
  it prints as a note are sub-grid props aliasing against the grid.

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

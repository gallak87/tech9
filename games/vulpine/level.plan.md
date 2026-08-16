# Vulpine — levels as zone sequences

**Written 2026-08-15. Branch `g/fox64`. Owner-approved.**

Read with `ROADMAP.md` (the plan of record), `PLAN-VARIETY.md` (the diagnosis
this plan is built on), `PLAN-PERF.md` (frame-time measurement rules),
`CONTRACT.md` (lane rules) and `HANDOFF.md` (harness + traps). **This file owns
every task list for the level lane.**

## Context

Owner, 2026-08-15: built Fichina, "it looks basically the same as the first
level." Wants more levels, wants them to look different, and wants the tooling
**reusable** so levels 3 and 4 are cheaper than level 2 was.

Two competing proposals were on the table. A **furniture layer** (a generic prop
placer with five placement rules), and a **seed script** that generates candidate
levels for the owner to review and sign off. This plan rejects running either one
first, on evidence, and proposes the layer both were groping toward.

### The evidence

Read the two DNAs side by side (`src/world/dna.js:111` and `:177`). Corridor
half-width `inner` and wall height `wallH` along each level:

| | keys | `inner` range | `wallH` range | key spacing |
|---|---|---|---|---|
| Corneria | 15 | 126 → 580 (**4.6×**) | 55 → 395 (**7.2×**) | irregular; tightens to 600 m at the narrows and the dam gorge |
| Fichina | 9 | 198 → 262 (**1.3×**) | 260 → 545 (2.1×) | uniform, every 1200 m |

Two separate findings, and the second one has not been written down before.

**1. The grammar is fixed.** `heightAtU` (`profile.js:203`) is one shape function:
riverbed dip → beach → shelf → cliff → plateau relief. Whoever built Fichina
*aimed* at a different landform — the header comment at `dna.js:179` says "a
glacial trough, not a river valley" and they squeezed `beachW` to 9–17 against
Corneria's 24–145 to try to kill the terraces. Correct use of the parameters,
genuinely different intent, still reads as Corneria.

**2. Fichina has no longitudinal pacing at all.** It is the same cross-section
for nine kilometres, and the comment states it as a feature. Corneria varies its
corridor 4.6× along its length — wide bay, tightening, the narrows at −3250,
opening out, city reach, dam gorge, delta. Even the *keyframe spacing* gives it
away: Corneria's keys bunch around its dramatic moments; Fichina's sit on a
uniform 1200 m grid. One was designed; one was interpolated.

So Fichina is not only trapped in the grammar — **it does not use the range the
grammar already allows.** There is real headroom before touching the shape
function, and that is what Phase Z1 exists to measure.

### Why not the seed script first

Search cannot exceed vocabulary. Sampling `keys` with an RNG produces a corridor
that *wobbles*, and wobble is not pacing — the narrows at −3250 reads as a moment
because it arrives after 4 km of steady tightening and then releases. A random
seed cannot author that. The seed loop becomes worth building once the unit being
sampled is a **zone sequence**, because sampling zone sequences produces pacing.

Note the persistence half of the owner's idea already exists: a DNA *is* a saved,
signed-off level (frozen seed + parameters, registry at `dna.js:276`), and
`tools/sheet.mjs` already builds contact sheets for review.

### Why not the furniture layer first

Right diagnosis, over-specified solution. It is right that nothing man-made
exists in either level, that ~500 lines of finished materials and ~20 mesh
primitives in `render/geobuild.js` sit unimported, and that props are the *only*
way to get geometry above the ship (the heightfield is single-valued and can
never overhang). But designing five placement rules before any has a consumer is
the exact pattern that produced the ~5,400 lines of dead code this project has
already shipped, and `HANDOFF.md` names interruption as the failure mode to
design against. Placement is also the cheap half — the expensive half is
designing what an ice rig looks like versus a skyscraper, and that does not
generalise across levels at all.

Props stay in the plan (Phase Z5), reduced to one rule with one real consumer.

---

## The architecture

**A level is a sequence of held zones separated by blends. Zones compile to
today's DNA.**

```
dna.zones                                    ┌─▶ keys ──▶ heightAtU() ──▶ terrain
┌──────────────────┐                         │
│ bay      900 m   │                         ├─▶ centreline.x/y bends
│ narrows  600 m   │──▶ expandZones() ───────┤
│ open    1200 m   │    (pure function)      ├─▶ props
│ gorge    800 m   │                         │
│ delta   1400 m   │                         └─▶ per-zone offset box
└──────────────────┘
         │
         └─▶ lint: rail clear of ground? |centrelineDX| < 0.8?
                   corridor wider than the offset box? differs from other levels?
```

### The load-bearing fact

`dna.keys` has **exactly one consumer** — `KEYS = dna.keys` at `profile.js:356`
(verified by grep; every other `.keys` hit in `src/` is `Object.keys` or an
unrelated station table in `geobuild.js`). `setActiveDNA` is synchronous and
complete, and only four files import `dna.js` at all: `profile.js`,
`corneria.js`, `world-materials.js`, `campaign.js`.

So `expandZones()` is a **pure pre-pass that emits the DNA shape that already
exists**. Nothing below it changes: no edits to `heightAtU`, `terrain.js`,
`water.js`, the LOD stitch, the band limiting, the skirts or the baked fields.
That is what makes this cheap, and it is the main reason to prefer it.

### Backwards compatibility

`expandZones` runs only when `dna.zones` is present. A DNA with hand-authored
`keys` and no `zones` is untouched. **Corneria stays hand-authored** — it is the
level that works, it is the reference the owner compares against, and converting
it buys nothing. Fichina is the test case.

### Zone model

**Zones are the held states; blends are the transitions.** This is the piece that
makes the notation compress. Corneria's 4 km of "tightening" is not a zone — it
is a long blend between the bay and the narrows. `profileAt` (`profile.js:149`)
already smoothsteps between adjacent keys, so blend length is simply the gap
between one zone's exit key and the next zone's entry key.

A zone emits keys at `z0 + blend/2` and `z1 − blend/2`; consecutive zones
therefore leave a `blend`-metre interpolation region between them.

```js
zones: [
  { kind: 'bay',     len: 1100 },
  { kind: 'narrows', len: 600,  blend: 1600 },   // 1600 m of tightening into it
  { kind: 'reach',   len: 1600, blend: 700 },
  { kind: 'gorge',   len: 900,  blend: 500, bend: { dx: 180, width: 600 } },
  { kind: 'delta',   len: 1400, blend: 900 },
]
```

A **kind** is a named preset over the nine `FIELDS` in `profile.js:145`
(`inner, bed, beachW, beachH, shelfW, shelfH, cliffW, wallH, relief`), living in
a new `src/world/zones.js`. A zone instance may override any field inline, and
carries optional extras:

| field | emits | phase |
|---|---|---|
| `kind`, `len`, `blend` | `keys` rows | Z1 |
| field overrides (`inner: 180`) | merged into the emitted rows | Z1 |
| `bend: { dx, width }` | a `centreline.x.bends` entry at this zone | Z1 |
| `climb: 400` | a `centreline.y.bends` entry (**needs the Z1 y-bend change**) | Z1 |
| `box: { x, yUp, yDown }` | per-zone offset box | Z3 |
| `profileKind: 'trench'` | per-zone shape function | Z4 |
| `props: [...]` | furniture for this stretch | Z5 |

`climb` and `box` are what make this per-zone rather than per-level: a level can
climb 400 m over a pass in one zone and feel tight in the next. Two notes on
them, both previously unrecorded:

- **The rail is currently flat in both worlds.** Corneria's `centrelineY` is
  `base 44` plus waves of ±16 and ±7 (`dna.js:129`) — ~46 m of altitude across
  9 km; Fichina is `base 52 ± 11`. The vertical axis is free variety that no
  level uses, and `centrelineY` is already sampled by the flight model, the
  cameras and the shots, so nothing new has to consume it.
- **Dropping the rail below the surrounding terrain** is the cheapest way to get
  "the world closes over you" with no prop work at all — the walls simply rise
  past the top of the frame. Combine with `climb`.

The X shear limit (`|centrelineDX| < 0.8`, `profile.js:98`) has a vertical
equivalent that nobody has found yet. Find it before authoring hard against it.

---

## Scope

**Owner decisions, 2026-08-15 — settled, do not re-ask:**

1. **This round is Z1 only.** Build the expander, rebuild Fichina as zones, then
   **stop and look at it**. Z2–Z6 below are the roadmap beyond, not this round.
2. **Corneria stays hand-authored.** Its 15 keys are untouched, so the reference
   point cannot drift and any change in Fichina is real. `expandZones` runs only
   when `dna.zones` is present, so both formats coexist permanently — there is no
   migration and no dual-maintenance burden.

Z1 ends in a branch, and which way it goes is a measurement, not a preference:

```
Fichina-as-zones reads as a different place?
  yes → the grammar was never the binding constraint
        Z4 (profile kinds) deferred or dropped; go to Z5 (props / the ceiling)
  no  → the grammar is the constraint, Z4 is proven necessary and goes next
```

---

## Phases

### Z1 — the expander, and the experiment that settles the argument  ← THIS ROUND

**This phase exists to answer one question with evidence: how much of "Fichina
looks the same" is the grammar, and how much was flat authoring?** Rebuild
Fichina as a zone sequence with real longitudinal pacing and **no new shape
functions**. If it reads as a different place, the grammar was never the binding
constraint and Z4 can be deferred or dropped. If it still reads as Corneria, Z4
is proven necessary. Either answer is worth the phase.

- `src/world/zones.js` — `ZONE_KINDS` presets + `expandZones(dna)` returning a
  DNA with `keys`/`bends` filled in. Pure, no imports from `profile.js`
  (it must be callable before `setActiveDNA`).
- Call it in `setActiveDNA` (`profile.js:320`) before `KEYS = dna.keys` (`:356`).
  Prefer that over `dna.js` module scope so a hot-swapped DNA gets it too.
  `setActiveDNA` is synchronous and total — `terrainHeight`, `centrelineX` and
  `profileAt` answer for the new world the instant it returns, which is what lets
  the flight model keep asking for ground clearance through a mid-flight swap.
- **Add `y.bends`** mirroring `x.bends`. `centrelineY` (`profile.js:119`) is
  `base + Σ sines` with no dog-leg term; `centrelineX` has one at `:116` and the
  `bendS`/`bendDS` helpers at `:102`–`:110` are directly reusable. Respect
  `MAXB = 6` and the `throw` at `:343`.
- Re-author `DNA_FICHINA` as zones. Target Corneria-like range: `inner` varying
  ≥3×, key spacing tightening at the dramatic moments.
- **Do not touch Corneria.**
- **Re-sync Fichina's encounters to the new pacing.** `FICHINA_WAVES` and
  `FICHINA_COMMS` (`campaign.js:62-84`) are flat z-descending tables consumed by
  three monotone cursors against `flight.railZ` (`combat.js:1404-1417`). Re-pacing
  the geometry underneath them without moving them means a wave authored for a
  tight trough now fires in an open basin. Two things to get right: nothing sorts
  or validates those tables, so they must stay z-descending by hand; and a wave's
  `z` only *arms* it — the craft spawns `spawn` metres further ahead, up to
  **2400 m** for `commander:ice` (`combat.js:170-172`), so the real screen-entry
  point is `z - spawn`. Place encounters against zone boundaries using that.
- **Register Fichina review cameras.** All 20 `w-*` shots hardcode Corneria z
  literals (`world/shots.js:31-71`) and several park at absolute world Y;
  `registerWorldShots()` is called once from the `Corneria` constructor
  (`corneria.js:83`) and **not** from `rebuild()`, so Fichina is currently being
  reviewed through Corneria's camera set. Z1 needs its own shots or the
  before/after sheet compares the wrong framings.

**Three traps specific to the expander**, all read off `profileAt`
(`profile.js:149`), which is the only thing that will ever consume its output:

```js
while (i < KEYS.length - 2 && z < KEYS[i + 1].z) i++;
const a = KEYS[i], b = KEYS[i + 1];
const t = smooth(a.z, b.z, z);
```

1. **Keys must be strictly descending in `z`** (Corneria runs 720 → −9840).
   `smooth(a.z, b.z, z)` relies on it; emit out of order and the blend inverts.
2. **No two keys may share a `z`.** `smooth` divides by `b - a`, so a zone with
   `len: 0`, `blend: 0`, or a blend equal to the zone length produces a
   divide-by-zero → `NaN` height → the whole level disappears. The expander must
   assert `len > 0`, `blend > 0`, and `blend < len(prev) + len(next)`. This is
   the single most likely way to break the build, and it fails globally rather
   than locally, so it will not look like a zone bug.
3. **Keep the emitted key count in the same order as today (~15–25).** The walk
   above is a linear scan from `i = 0` on *every* sample, and `profileAt` is
   called per vertex per mesh build and per tick by the flight model. Fifteen
   keys is free; two hundred generated keys would put an O(n) scan on the hot
   path. This matters most for Z6 — a generator must cap zone count, not just
   zone validity.

#### Hard limits a zone preset must stay inside

These are not in any existing doc and each one fails *quietly* — a level that
violates them still builds, and looks subtly wrong rather than broken.

| limit | value | why | ref |
|---|---|---|---|
| corridor floor height | **−70 m … +70 m** | the baked shore field encodes terrain height as `(y+70)/140`; outside it the value clips and water shading, foam and depth tint go wrong | `world-materials.js:147-161` |
| total cross-section half-width | **≤ 1250 m** | `SHORE.halfU`; beyond it the shader substitutes "open ocean" `vec2(-70, 0)`. **Corneria's delta already reaches 1155 m** (`inner 580 + 145 + 165 + 265`), so there is only ~8% headroom — a wider zone is the easiest limit to blow | `world-materials.js:268`, `:404-410` |
| horizon field half-width | 2000 m | same idea, for the baked sky-view/shadow term | `world-materials.js:269` |
| vertex tint altitudes | absolute metres (150/430, 14/40, 9/30, 3.5/15, −9/−2.5, 12/40, 150/260) | `tintAt` keys the rock/scree/grass/snow bands to **absolute** altitude, and the DNA palette only recolours them. A zone with a much taller or shorter wall gets the *wrong band*, not a rescaled one — e.g. snow appearing halfway down a low wall | `terrain.js:80-113` |
| depth reference | `y = 0`, **not** `WORLD.waterLevel` | a nonzero `waterLevel` desynchronises water shading from the water mesh | `world-materials.js:147-161` |

So `wallH` and `bed` are the two fields a zone preset should vary most cautiously.
`inner`/`beachW`/`shelfW`/`cliffW` are freer, subject to the 1250 m sum.

Ship criterion: `node tools/shot.mjs` over Fichina's cameras before/after, as a
`sheet.mjs --pair`, and a written call on whether it reads as a different place.

### Z2 — the level linter *(not this round)*

The most valuable and least speculative part of the owner's seed proposal, and it
is worth having before any generation exists. New `tools/lint-level.mjs`, run
headless per DNA:

- rail never inside terrain: `centrelineY(z)` vs `terrainHeight` under the rail
- `|centrelineDX(z)| < 0.8` — the shear limit documented at `profile.js:98`
- corridor half-width ≥ `TUNE.boxX` everywhere, or the player can fly into rock
- the two mesh tiers agree at the shared boundary column at `nearHalf`
- `probe()` histogram health on each registered camera (median 0.10–0.20)
- **a divergence metric against every other level's cross-section**, which turns
  "does this look different" into a number — this is the check that would have
  caught Fichina

Exit non-zero on failure so it can gate a commit.

### Z3 — dev panel instrumentation *(not this round)*

Mostly readouts, not knobs. At 175 m/s the whole level is ~51 s, so a 600 m
narrows is 3.4 s — **zones are authored in metres but judged in seconds**, and
the panel should show seconds.

Add to `src/dev/panel.js` (new `zone` section; follow the existing `quality`
section's `display: contents` wrapper pattern added 2026-08-15):

- **Readout:** current zone index/kind, metres in, **seconds left**, live
  corridor clearance vs the offset box, live `|centrelineDX|` vs 0.8. The last
  two are Z2's linter running live.
- **Knobs:** `pacing scale` (multiplies every zone `len` at once — one drag
  answers "is the level too slow") and `edge blend` (global blend multiplier).
- **Buttons:** `next zone ▶` and `rebuild world`.
- Per-zone offset box (`box`) lands here, since it needs live judgement.

Three constraints for whoever builds it:

- **`seek()` only steps forward.** `skipToBoss` (`panel.js:110`) has a guard and
  a top-up loop for exactly this, so "previous zone" cannot reuse it. Jumping
  backward means resetting the rail, and `campaign.js:16` warns that resetting
  `railZ` while attached replays every backlogged wave. Ship **next-zone only**
  as a live button and a `?zone=N` URL param for starting mid-level.
- **The rebuild button is nearly free**: `world.rebuild(dna)` (`corneria.js:118`)
  already exists with a job queue and per-frame budget, because the campaign hop
  needs it. Two known catches — `_warm()`'s visibility gotcha (fixed 2026-08-15,
  see `corneria.js:_warm`) and the 283 ms synchronous dispose, which is
  acceptable for a dev button.
- **Do not build a zone editor.** The panel's established pattern is tune-live →
  key `5` copies JSON → paste into source, which is how the whole shipped look
  was arrived at. Zones follow it exactly.
- The per-zone offset box changes wall feel: `TUNE.boxX/boxYUp/boxYDown`
  (`flight.js:22`) feed the soft-wall spring. Re-run the held-stick
  per-tick-acceleration probe and re-check the four box corners
  (`ROADMAP.md` `## Settled`).

### Z4 — profile kinds *(not this round; gated on Z1's result)*

`heightAtU` dispatches on a per-zone `profileKind` instead of hardcoding the
terrace stack:

- `terrace` — today's riverbed → beach → shelf → cliff stack, the default
- `trough` — glacial U, no terraces
- `trench` — near-vertical walls, flat floor with slots
- `basin` — walls recede entirely; pacing as much as looks
- `none` — no ground at all, for Sector Ω (`surface: 'none'` already exists and
  is handled at `corneria.js:134` and in `groundAt`)

Plus two things the current grammar cannot say at any parameter value:

- **Per-side asymmetry.** A key may carry `L`/`R` variants, so one overhanging
  wall can face one shallow ramp. Today side enters `heightAtU` only through
  `bankJitter()`'s phase offsets and the `wm` side-wobble (`profile.js:208`) —
  both noise, not authored — so every world is near mirror-symmetric.
- **A floor that does something.** Both levels have a flat floor for 9 km. Ice
  steps, a floor that climbs to a pass and drops away, or one that breaks into
  gaps you dive through.

**Hard constraint:** `heightAtU` stays a pure function of `(u, z)` with no
per-sample object dereference — it is on the hot path of the flight model, the AI
and every mesh build. Dispatch must resolve to a module-local scalar or a
function reference chosen in `setActiveDNA`, never an object walk per sample. The
two mesh tiers must still agree exactly at `nearHalf`, or a seam opens down the
whole level (`profile.js:188-202`) — that is what the lateral skirts were
papering over.

### Z5 — props, minimal *(not this round)*

Zones own their furniture: a `props` array on a zone, not a `world/city.js`.

**Land one rule and one real consumer together.** The first consumer should be an
**arch or bridge you fly under** — not bank towers. A city on a canyon wall is
still a canyon with things on it; the ceiling is the axis the terrain can never
provide (single-valued heightfield), it is the cheapest placement code, and a
dozen instanced meshes add far less fill than a bank of towers on a frame still
3.8 ms over budget (`PLAN-PERF.md`). Add rules only when a second consumer wants
one — five rules with no consumers is how this project accumulated ~5,400 lines
of dead code.

Rules worth having eventually, in the order their consumers are likely to arrive:

| rule | what it does | unlocks |
|---|---|---|
| `free` | explicit per-instance placement | **start here** — the dam, the bridge, one-off landmarks |
| `span` | bridges the corridor — **this is the ceiling** | arches, gantries, cavern roofs, ice bridges |
| `bank` | hugs a bank at a height band, via `landAtU`/`shoreU` | cities, ice rigs, gun emplacements |
| `floor` | scattered on the corridor floor | rubble, wreckage, séracs, pylons |
| `ridge` | skyline beyond the rim, silhouette only, cheap LOD | radar arrays, distant towers |

**The construction kit already exists and nothing consumes it.**
`render/geobuild.js` exports ~20 primitives (`loft`, `superellipse`,
`chamferBox`, `extrudePoly`, `ductGeo`, `louvers`, `tubeAlong`, `shellArc`,
`conformalPatch`, …) and five finished, tested materials sit unimported in
`world-materials.js:1313-1434` — `cityMaterial`, `concreteMaterial`,
`steelMaterial`, `foliageMaterial`, `rockPropMaterial`. `cityWeight(z)`
(`profile.js:159`) already tints terrain for a city that was never built, and
eight review cameras (`w-city`, `w-city2`, `w-dam`, `w-bridge`, `w-damface`,
`w-towers`, `w-arch`, `w-delta`) frame empty canyon. The expensive half of this
phase is written; what is missing is the placer.

Corneria's authored positions, worth keeping when they finally get built: towers
up both banks at `z ≈ -4400 … -5800` off `cityWeight`, the breached dam at
`-6060`, the bridge at `-4950`, natural arches at `-1720`, plus rock stacks and a
breakwater shoal. Scrub and conifer canopy on the shelves is the `foliageMaterial`
consumer.

Four things to watch:

- **Overdraw is not obvious.** Props add fill *and* occlude canyon behind them.
  Re-measure after the first real set, not after the scatter.
- **Instancing is not a frame-time win here** — draw count is measured dead at 7%
  of frame. Instance for memory and build time.
- **`span` is the only rule that can occlude the rail.** It must not put geometry
  inside the player's offset box without a flyable gap. Assert at build time.
- The placer should be **queue-based like `Terrain`** so it joins `corneria.js`'s
  job list and the mid-flight rebuild budget (`corneria.js:141`).

### Z6 — the seed loop *(not this round)*

Now worth building. `seed → generate zone sequences → expandZones → lint (Z2) →
sheet.mjs → owner picks → freeze as a DNA in dna.js`. Sample the **zone list**,
never the raw `keys`. Constrain generation so the linter passes by construction
where possible.

---

## What must not change

For a new agent: these are load-bearing and each has already cost a session.

**The four quiet ones are tabled under Z1, ["Hard limits a zone preset must stay
inside"](#hard-limits-a-zone-preset-must-stay-inside), and they bind in every
phase, not just Z1** — a level that breaks them still builds and merely looks
subtly wrong, which is the worst failure mode to debug. In short: corridor floor
within **±70 m**, total cross-section half-width **≤ 1250 m** (Corneria's delta
is already at 1155), `tintAt`'s colour bands are keyed to **absolute** altitude
so a taller wall gets the wrong band rather than a rescaled one, and water depth
is measured against `y = 0` rather than `WORLD.waterLevel`.

A fifth, which is not a limit but an integration: **geometry and encounters are
coupled only by convention.** `waves`/`comms`/`grants` are flat z-descending
tables driven by monotone cursors against `flight.railZ` (`combat.js:1404-1417`),
nothing sorts or validates them, and a wave's `z` only *arms* it — the craft
enters `spawn` metres ahead, up to 2400 m. Re-pace the terrain under them and
they silently fire in the wrong place.

- `heightAtU` stays pure `(u, z)`, no per-sample object dereference.
- The two mesh tiers must agree at the shared boundary column at `nearHalf`
  (`profile.js:188`) — disagreement opens a seam down the entire level.
- `|centrelineDX|` past ~0.8 breaks the perpendicular-wall assumption and the
  lateral sample rate stops matching `spacing()` (`profile.js:98`).
- `MAXW = 6` waves and `MAXB = 6` bends per axis, enforced by a throw
  (`profile.js:343`).
- No `Math.random()` — use `rng('stream')`. Island draw order is part of the seed
  contract (`profile.js:296`).
- No binary assets, no network.
- Register review cameras with `registerShot()` from your own file;
  `src/game/shots.js` is shared and read-only.

## Verification

```bash
cd games/vulpine
# 1. before/after on Fichina. Needs Fichina-specific shots first — see Z1;
#    the shipped w-* cameras are framed for Corneria.
node tools/shot.mjs --shots <fichina cams> --params "env=fichina" --out shots/z1a --port 5480
node tools/sheet.mjs shots/z1-base shots/z1a --pair --labels "before,after"

# 2. still flyable, and the re-synced waves still land
node tools/pacing.mjs 5481 120        # wave gaps, entry range, time-on-target
node tools/pilot.mjs fly --seconds 90 --port 5482

# 3. the transition still works (rebuild path touches setActiveDNA)
node tools/pilot.mjs hop --port 5483

# 4. no console errors anywhere
node tools/inputtest.mjs 5484
```

Any console error is an automatic fail. A look claim needs a PNG that was
actually read. Frame-time rules are in `PLAN-PERF.md` — never compare a headless
number to a real-Chrome one.

**Cheap sanity check before any capture:** print the expanded `keys` and confirm
they are strictly z-descending, that the cross-section sum stays under 1250 m,
and that `inner` now varies ≥3× along the level. If `inner` still varies ~1.3×
the re-authoring did not actually do anything and the experiment cannot answer
its question.

**Rebuild cost, for context when timing anything:** the queue is 264 jobs —
1 materials + **177 baked-field jobs** + 62 terrain + 23 water + 1 warm
(`corneria.js:141-147`, `world-materials.js:279-305`). The field bake dominates
at ~560 k height samples and over a second of work, and it re-runs on every
zone edit. Budget for that when iterating.

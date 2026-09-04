# level — Phase 1.2 output

World data port + per-biome heightfields + the topology proposal.
Runnable artifacts ship alongside this doc:

| File | What it is | Run it |
|---|---|---|
| `docs/specs/world-graph.mjs` | The twelve-map port, the 10-edge doorway graph with gate tiers, the QA gate | `node docs/specs/world-graph.mjs` |
| `docs/specs/heightfields.mjs` | Eight biome parameter sets, evaluated against the real noise kit | `node docs/specs/heightfields.mjs` |
| `docs/specs/tech-gates.mjs` | **Updated** — gate assignment re-run over the new 10-edge set | `node docs/specs/tech-gates.mjs` |

All three exit 0. Nothing under `src/` was touched.

Evidence read first: `CLAUDE.md`, `agents/level.md`, `CONTRACT.md`, `CONCEPT.md`,
`GAME_PLAN.md`, `docs/PROTO-REF.md`, `shots/proto-ref/menu-map.png`,
`overworld-fog-off.png`, `overworld-fog-on.png`, the donor `games/chronoforge/src/world.js`,
`src/core/const.js`, `src/core/rng.js`, `src/world/index.js`.

---

## 1. Topology — the call

**Accepted: 10 edges. The 7 inherited edges plus 3 lateral cycles. No one-way drops.**

| New edge | Gate | Why |
|---|---|---|
| Haventide ↔ Forest Veil | Survivor | Closes the starting web into a triangle. Home stops being a dead end. |
| Mire Bog ↔ Orbital Reach | Reclaimer | Kills the worst backtrack in the game. |
| Crater Ember ↔ Frost Canyon | Ascendant | Closes the northern row. Fire meets ice — a real border, not a corridor. |

### Why the tree falls short

The donor graph is a tree, so **every journey is out-and-back** and Emberline is
a cut vertex on 17 of the 28 region pairs — 61% of all travel. Mire Bog is four
map loads from Frost Canyon and four from Last Crown. That is eight loads round
trip to pick up one world drop.

### What it costs

| | inherited tree | accepted graph |
|---|---|---|
| edges | 7 | 10 |
| doorway records | 18 | 24 |
| mean hops between regions | 2.214 | **1.857** (−16%) |
| diameter | 4 | **3** |
| Mire Bog's total hops to the other seven | 20 | **13** (−35%) |
| cut vertices | Emberline, Forest Veil, Orbital Reach | **Orbital Reach only** |
| regions reachable at Survivor / Reclaimer / Ascendant | 4 / 6 / 8 | **4 / 6 / 8** |

**The reachability profile is unchanged at every tier.** Each new edge gates at the
tier at which both its endpoints were already reachable, so the cycles buy travel
time and buy nothing else. Progression pacing, the renown curve and the XP curve
are untouched. `selfCheck()` asserts the profile against the inherited numbers, so
a future edit that changes pacing fails the gate rather than passing quietly.

Cost is 6 more doorway records to author and keep symmetric, and one more Reclaimer
gate. Orbital Reach stays a cut vertex on purpose: Last Crown keeps a single
approach, because the finale should.

The added edges keep the graph **planar** on the donor's own map-tab layout, so the
Map screen — the best screen in the prototype per `PROTO-REF.md` — still draws
without crossing lines.

### One-way drops: declined

A one-way drop that unlocks its return from the far side is not a gate, it is a
second persistence mechanism. `region.mjs` would then have to walk
tier × unlock-flag states rather than tier states, save would need a new field,
and Phase 9 owns neither. The payoff — killing out-and-back travel — is already
delivered by the three cycles at zero pacing cost. Not worth it. Chrono-rifts stay
punted.

### Gate table

Re-run over the new edge set with the rule from `agents/gamedesign-output.md` §4.2,
unchanged. Rule 1 ("gate every edge that first reaches a higher tier") is why
Mire Bog ↔ Orbital Reach is Reclaimer and Crater Ember ↔ Frost Canyon is Ascendant —
leaving either open would make the existing gate on the parallel route bypassable.

`docs/specs/tech-gates.mjs` was updated to the 10-row table. The 7-row table in
`agents/gamedesign-output.md` §4.3 is the Phase 1.1 record and is now superseded;
`world-graph.mjs` `selfCheck()` imports `tech-gates.mjs` and **fails if the two
tables disagree**, so they cannot drift.

---

## 2. The port

Twelve maps, field for field. **Nothing dropped**: 8 outdoor regions across 8 biomes,
4 city interiors, 36 encounters, 8 world drops (one per outdoor region), 3 cities +
Haventide, 17 Haventide build plots, 18 Haventide interior plots, every blurb,
landmark and `unlocked` flag.

Encounter and world-drop data is carried through **untouched** — same tiles, same
enemy ids, same item ids. Phase 1.3 re-places them.

`CONCEPT.md`'s "eighteen doorway edges" is 18 doorway **records**: 14 outdoor
directed doors (7 bidirectional edges) plus 4 interior exits. Interiors are entered
by `[C]`, not by an edge, so they contribute one record each rather than two. The
accepted graph is 20 + 4 = **24 records**.

### Donor defects found — verified in source, not silently patched

**DONOR-4** — `games/chronoforge/src/world.js:82`

```js
{ x: 44, y: 15, to: { mapId: 'emberline_region', x: 1, y: 20 } },
```

Haventide's east door lands the party at Emberline (1,20). Emberline's return door
is at (1,15), five tiles north. The other six inherited edges all land exactly on
the reciprocal door, so this is the outlier, not the convention. Landing corrected
to (1,15). `selfCheck()` now asserts round-trip symmetry on every outdoor edge.

**DONOR-5** — `games/chronoforge/src/world.js:267`

```js
{ x: 15, y: 19, to: { mapId: 'haventide_region', x: 12, y: 24 } },
```

Leaving the Haventide interior lands on (12,24), which is build plot **slotIdx 7**.
Once that plot is built the party exits the city inside a building. Moved to (12,22):
still south of the city tile so `[C]` does not instantly re-trigger, and clear of
all 17 plots. `selfCheck()` asserts no landing coordinate sits on a city tile,
build plot, encounter or world drop.

### One door moved for landform reasons — not a donor bug

**LVL-DOOR-1** — Frost Canyon (30,28) → **(23,28)**, and Orbital Reach's landing with
it. The frost_canyon heightfield puts a 47 m trench down the middle of the map and
tile (30,28) lands mid-wall at 29.5°. (23,28) is the canyon mouth: trench floor,
3.6°. You now enter Frost Canyon by walking up the ravine.

---

## 3. Heightfields — the design rule

The whole spec follows from one number: at 55° pitch with `FRAME_HEIGHT_M = 18`
you see about **32 m across by 22 m deep**, so a 90 × 60 m map is 2.8 × 2.7 screens.

**Relief is read through shadow, not silhouette.** At dawn the sun sits 11.6° up, so
1 m of rise throws 4.9 m of shadow. A 3 m ridge lays a 15 m shadow — half a screen.
That is why total relief lands at 3.6–11 m and not at the 20–30 m the Phase 0
placeholder used: 11 m already casts 53 m of dawn shadow, which is the whole frame.

**The load-bearing structural decision: relief comes from the CARVE, not the noise.**
Max slope scales as ~K × amplitude / wavelength, so relief bought from a noise stack
is paid for in gradient. 11 m of noise relief on a 90 m map is a 45° wall and the
party cannot walk on it. Relief bought from an authored landform has a gradient you
set directly — depth over wall width. Every dramatic biome here is therefore a gentle
noise field with a landform cut into it. Frost Canyon is the clearest case: 7.5 m of
drop over a 17 m wall is 27°, walkable; the same 7.5 m asked of the noise stack is a
wall.

### The eight biomes

| Biome | Region | noise amp | λ | total relief | max slope | landform |
|---|---|---|---|---|---|---|
| `grassland_ruins` | Haventide T1 | 2.8 | 52 | 4.38 m | 9.9° | coastal shore ramp, −2.6 m |
| `neon_wastes` | Emberline T2 | 4.8 | 40 | 5.44 m | 21.6° | dry wash, −4.0 m × 38 m |
| `forest_veil` | Forest Veil T2 | 4.2 | 36 | 4.26 m | 17.9° | forest creek, −2.0 m |
| `mire_bog` | Mire Bog T2 | 2.2 | 40 | 2.71 m | 11.3° | 6 basins, water plane, 22.4% submerged |
| `frozen_ruins` | Orbital Reach T3 | 4.8 | 42 | 5.75 m | 18.1° | elevator mesa, +3.8 m |
| `frost_canyon` | Frost Canyon T3 | 4.6 | 60 | 8.36 m | 27.7° | trench, −7.5 m, 47 m rim to rim |
| `alien_terraform` | Last Crown T4 | 8.5 | 38 | 5.58 m | 28.0° | partial terrace, 1.4 m steps |
| `crater_ember` | Crater Ember T4 | 6.2 | 44 | 8.42 m | 26.5° | 4 craters, −5.6 m floors, +1.6 m lips |

Interiors are **flat floors plus 0.25 m of micro-relief** (max 3.3°), so contact
shadows do not land on a mathematically perfect plane. No biome field applies to them.

### Constants that are gates, not prose

| Constant | Value | Enforced by |
|---|---|---|
| `MAX_WALKABLE_SLOPE_DEG` | **34°** | every biome sampled at 0.5 m, every 4-neighbour edge |
| `VERTEX_SPACING_M` | 0.5 m | mesh cost + the Nyquist floor below |
| Nyquist floor | 2.0 m (4× spacing) | every octave of every roll / ridge / warp / detail term |
| `PLOT_MAX_SLOPE_DEG` / spread | 12° / 1.2 m over a 6 m footprint | all 17 Haventide plots |
| `DOOR_MAX_SLOPE_DEG` | 20° | all 20 outdoor doorway tiles |

Worst measured plot: **7.4°, 0.88 m** at slot 7 (12,24). Worst doorway: **11.5°** at
Orbital Reach (20,29). Both comfortable.

Phase 5 traversal should read `MAX_WALKABLE_SLOPE_DEG` as its `maxClimb`. Nothing on
any of the twelve maps exceeds it, so no tile is unreachable and the donor's
"every tile passable" stays true. Cliffs, ice walls and ruin masonry are **prop
geometry** placed on top of the field, never the field.

### Cost

Per outdoor map at 0.5 m spacing: 181 × 121 = **21,901 verts, 43,200 triangles, one
draw call, 1.41 MiB** — 1.66% of the 2.6 M triangle budget. Interiors: 19,200 tris,
0.63 MiB. All twelve resident would be ~15 MiB and 12 draw calls; keeping the current
map plus its neighbours resident is plenty.

Build cost is 11–13 noise evaluations per vertex, ~250 K evaluations per map. In Node
all eight biomes sample in **154 ms**, so a single map build is a few milliseconds —
a doorway transition can rebuild terrain inside one frame's slack, or prebuild the
neighbour.

### A finding for `render`, logged as LVL-1

The two snow biomes sit at **0.448 / 0.398** linear luminance against grassland's
**0.274** — 1.5–1.6× brighter ground under an exposure ramp that is fixed per hour
with no metering by design. Signed-off dawn (wide median 0.212) was measured on the
Phase 0 placeholder, whose ground is `0x9d8259` ≈ 0.26. Orbital Reach and Frost Canyon
will read brighter than that baseline. Snow albedo is already dirtied well below the
0.7–0.8 physical value to hold the spread to 3.96×, but this cannot be closed from the
`level` side. `render` needs either a per-biome albedo trim or a per-biome offset in
`EXPOSURE_RAMP` at Tier 1. **Not a core change I made — flagged, not touched.**

---

## 4. Self-check output

```
$ node docs/specs/world-graph.mjs
Maps 12  (outdoor 8, interiors 4)
Outdoor map size 45x30 tiles @ 2 m = 90 x 60 m
Encounters 36   world drops 8   doorway records 24   edges 10
Build plots: Haventide region 17, Haventide interior 18

Reachability by settlement tier (from Haventide):
  Survivor     4/8   Reclaimer 6/8   Ascendant 8/8   Transcendent 8/8

Topology delta (hop counts, all edges open):
  inherited tree : 7 edges, mean 2.214, diameter 4
  accepted graph : 10 edges, mean 1.857, diameter 3
  improvement    : mean -16.1%, diameter 4 -> 3
  cut vertices before: emberline, forest_veil, orbital_reach
  cut vertices after : orbital_reach (isolates last_crown)

PASS - 12 maps, 24 doorway records, 10 edges, every landing in-bounds, passable
and reciprocal; every region reachable from Haventide; no permanent one-way.
exit 0
```

```
$ node docs/specs/heightfields.mjs
Biome            noise  target  measured |  slope max / mean   limit   finest oct
grassland_ruins    2.8       5      4.38 |    9.9 /  2.0 deg   20     5.00 m
neon_wastes        4.8     6.5      5.44 |   21.6 /  4.7 deg   26     5.50 m
forest_veil        4.2       5      4.26 |   17.9 /  3.3 deg   24     4.50 m
mire_bog           2.2     3.6      2.71 |   11.3 /  2.1 deg   18     4.00 m
frozen_ruins       4.8       7      5.75 |   18.1 /  5.0 deg   28     5.00 m
frost_canyon       4.6      11      8.36 |   27.7 /  7.2 deg   33     4.50 m
alien_terraform    8.5     6.5      5.58 |   28.0 /  5.2 deg   30     5.50 m
crater_ember       6.2    10.5      8.42 |   26.5 /  6.8 deg   32     4.50 m

Haventide plots: worst slope 7.4 deg, worst spread 0.88 m (limits 12 deg / 1.2 m)
Doorways: worst 11.5 deg at orbital_reach_region (20,29) (limit 20 deg)
mire_bog standing water: 22.4% below the plane (band 16-36%)
frost_canyon rim-to-floor relief: 7.63 m (required >= 6.5 m)
albedo spread 0.113 -> 0.448 = 3.96x (limit 6x)

PASS - 8 biomes: relief in band, every slope under its own limit and under the
34 deg walkable ceiling, every octave above the Nyquist floor, 17 plots level,
20 outdoor doorways on walkable ground.
exit 0
```

```
$ node docs/specs/tech-gates.mjs
PASS - all 8 regions reachable, all 10 edges open by Transcendent.
exit 0
```

The heightfield check is not decorative. On its first run it failed with 36 issues —
six biomes over the walkable ceiling (worst 67.9°), nine plots too steep to build on,
a doorway on a 29° wall, and a bog with 2.6% standing water instead of 22%. Every
number in §3 is what survived fixing them.

---

## 5. Handoff to Phase 1.3

`heightfields.mjs` prints local relief within 7 m of each of the 36 inherited
encounter tiles — the measurement combat clearance is made against. Four sit on a
landform and want re-placing:

| Encounter | Region | Relief within 7 m | On |
|---|---|---|---|
| `e17` | Frost Canyon | 6.6 m | canyon wall |
| `e18` | Frost Canyon | 5.8 m | canyon wall |
| `e35` | Crater Ember | 4.5 m | crater rim |
| `e36` | Crater Ember | 2.5 m | crater lip, borderline |

The other 32 are on 0.2–2.6 m of relief and are fine where they are.

---

## 6. Human QA pass — **not warranted before Phase 1.3**

This phase is offline data. No `src/` file changed, so localhost renders exactly what
it rendered before this phase started — there is nothing new to click. The gates are
the two `node` runs above and both are green.

Two judgment calls are worth a **nod, not a QA session**, before Phase 1.3 builds on them:

1. **The three lateral cycles.** They are a topology change to inherited design. The
   numbers say they cost nothing in pacing, but "should Haventide have a second door"
   is a taste question, not a measurement.
2. **The Frost Canyon door move** (LVL-DOOR-1). Entering the region at the canyon
   mouth instead of the rim is a small change of first impression.

The heightfields themselves become worth looking at in **Phase 4**, not now — that is
when terrain first renders. What to look at then, and what would count as wrong:

- **Haventide at dawn** — if the ground reads flat, the 4.38 m of relief is too little
  for the camera. Measurable: the `top` shot should show shadow crossing the frame.
- **Orbital Reach and Frost Canyon at 6.4 h** — if either clips white, LVL-1 landed and
  `EXPOSURE_RAMP` needs a per-biome offset. `probe()` on `wide`: whitePct must stay < 2.
- **Last Crown** — if the terracing reads as banding rather than grown platforms, drop
  `carve.mix` from 0.45. This is the one look decision in the spec I am least sure of.

# Vulpine — level identity: two curves

**Every mechanism is landed. What is left is the authoring they exist for.**
Phases 1-5, 7 and 8 are done; phase 9 has authored two levels of four and phase
6 is open. The owner picks when each starts.

A zone carries its own cross-section, ceiling and camera; the hull pitches with
the corridor; a surface is floor or ceiling depending which side the rail runs;
and speed is measured along the rail rather than down the z axis.

Companion docs: `ROADMAP.md` is the queue, `HANDOFF.md` the harness and traps,
`PLAN-PERF.md` the other open lane, `REVIEW.md` the rubric.

## The problem this lane exists for

Owner, seeing five levels side by side: *"they all essentially look like
Corneria with filters/textures."*

Geometry, not shading. The five levels in question were exactly the five sharing
`backend: 'terrain'`, and inside it `heightAtU` folded about `Math.abs(u)` and
stacked `bed → beachH → shelfH → wallH`, each higher than the last — so every
terrain level was a **valley by construction**. The nine authorable numbers were
all widths and heights; none was a shape.

**Ruled out: another palette, lithology or structure-GLSL pass.** Shading is
downstream of the cross-section. Fortuna was the proof — the most distinctive
shading in the game, still reading as Corneria at night.

**Ownership.** *Planet* owns what it is made of — lithology, palette, structure
shader, prop kit, sky. *Level* owns what shape it is — cross-section, rail path,
ceiling, surface. Same rock, different topography.

## The four levels — the acceptance test for the lane

No two rows alike. Nothing in the toolchain checks this table; read it by hand.

| | section | rail path | ceiling | surface |
|---|---|---|---|---|
| Aquas | terraced, asymmetric ✅ | deep dive ✅ | constant lid ✅ | none ✅ |
| Venom | **inverted, whole level** ✅ | rhythm ✅ | **alternates** ❌ | lava ✅ |
| Fortuna | near-flat ✅ | dive + climb ❌ | **enters/exits** ❌ | water ✅ |
| Foundry | escarpment ❌ | steep shaft ❌ | built, varies ❌ | deck ✅ |

- **Aquas — depth is the drama.** Plunge in; shallows with terraced reef benches
  you fly *between*; a hard-asymmetric drop-off (reef to port, open blue to
  starboard); a trench the rail dives into where the lid leaves view; rise to an
  open bowl.
- **Venom — a spine, end to end.** The ship rides a crest for all nine
  kilometres with lava falling away both sides and no channel anywhere in it;
  the ridge itself dives and climbs; then a closed orbital path for the finale.
  Owner, on the version that put the ridge first and a canyon after: *"I was
  thinking the entire level from start to finish would have been on a ridge top
  with lava on either side."*
- **Fortuna — two layers, and the canopy is both.** Fly *over* a sea of glowing
  crowns (canopy as floor), dive through a gap, thread the dark understory
  (canopy as ceiling), climb back out.
- **The Foundry — outside, inside, then down.** Exterior gantry run as an
  escarpment, breach to interior, a steep shaft down through decks, then a wide
  low-ceilinged assembly floor.

## Phases

| # | Deliverable | Status |
|---|---|---|
| 1 | Cross-section becomes a polyline; `Math.abs(u)` gone | ✅ 2026-08-21 |
| 2 | Authorable `section` on a zone | ✅ 2026-08-21 |
| 3 | Per-zone `ceiling`; player flight clamped under `ceilingAt` | ✅ 2026-08-22 |
| 4 | Rail advance by arc length; `ai.js` station frame | ✅ 2026-08-22 |
| 5 | Hull pitch from `railDir` | ✅ 2026-08-22 |
| 6 | Venom orbit arena | **open** |
| 7 | Per-level camera | ✅ 2026-08-22 |
| 8 | Aquas' plunge — the rail crosses the water surface | ✅ 2026-08-22 |
| 9 | **The authoring pass** — one distinct shape per level | **Venom + Aquas done; Fortuna and the Foundry open** |

Numbers are identifiers, not an order.

### Phase 9 — what is left

Measured as metres carrying an authored `section` against corridor length:

| | authored | of level | what its brief still wants |
|---|---|---|---|
| venom | 10560 m | **100%** | the "alternates" ceiling |
| aquas | 7600 m | **72%** | done — read against its row |
| fichina | 2300 m | 22% | not in the four-levels table; the pass is authored |
| fortuna | 1500 m | **14%** | its whole two-layer beat — it has no `canopy` |
| foundry | — | **0%** | a mechanism pass first |

**Fortuna is next**, and its headline beat is the one phase 8 already built for
Aquas — it simply has no `canopy` declared. It is the most static level in the
game.

**The Foundry is not an authoring job.** `works` is one box for all 9 km
(`half`, `deckY`, `roofY` fixed in `dna.js`, and `Works.deckY()` is a static
with no z), so three of its four brief rows have nothing to author into. It
needs the mechanism pass phases 2 and 3 gave `terrain`, repeated for `works`.

**Corneria stays a valley.** It is what the others are told apart from.

### Phase 6 — the contract it has to keep

`railPoint` still composes z — `set(centrelineX(z), centrelineY(z), z)` — so the
corridor cannot double back yet. `flight.js` no longer *assumes* it (`pos.z`
reads `railPos.z` in the sim and the camera rig both), so what is left is making
`railPoint` dispatch to a per-level path object. That was deliberately not
landed with phase 4: no level would take the branch, against ship criterion 7.
Land it with the arena that authors one.

What must keep working across a looping path — all four survive a non-monotone
*position* as long as the *parameter* stays monotone:

- `railZ` is mutated in exactly one place.
- Three cursors edge-trigger off it — waves, comms and grants at
  `combat.js:1760-1774`. **The boss is a wave row**, not a separate system, so
  it rides the same cursor with no fallback.
- `campaign.js:549` (`railZ <= WORLD.zEnd`) is the **only** end-of-level test.
- All of `src/ui/`, `src/fx/`, `src/audio/`, `pickups.js` and world LOD are
  position-based, not `railZ`-based, and need nothing.

The same indirection is what the Foundry's shaft wants: `y(z)` cannot be
vertical at any authored numbers. Gradients up to ~75° now fly at honest speed
and are limited by authoring (`1.5 · climb / blend`), not by the
parameterisation.

## Constraints that outlived their phase

The load-bearing residue of everything above. All of it was paid for once.

**The chase camera needs ~340 m of lateral margin, not `boxX`'s 105.** It trails
behind and below and banks with the roll. A ridge whose zero crossing sat at
215 m put the camera in the lava through half a zone while the *ship* stayed
dry. Every crossing on Venom is at 345 m or wider for this reason.

**A surface plane at y = 0 pins the rail.** `groundAt` clamps there, and the
offset box is 46 m deep, so the rail can never come below ~60. Venom had no
`climb` anywhere because its base was 48 — it had no room to descend in either
direction, and the base had to go to 400 before it could have a rhythm. Fortuna
has water at y = 0 and the same pin.

**A generated section pins the bank line at height 0 whatever `bed` is.**
Deepening `bed` alone drops the trough and leaves the shoulders, so a rail
descending into it loses the corridor. Anything that descends needs an authored
`section`, not a deeper `bed`.

**`relief` has to come down with the section.** The relief gate opens past the
second-outermost point and the noise bands build a skyline out there whatever
the polyline says. Venom's 0.70 was rebuilding the walls its section had just
removed; 0.14 fixed it. Aquas' terraces and Fichina's pass both needed the same.

**A section is not enough on its own.** Keep the two outermost points high and
the tallest thing in frame is still a wall on each bank — a spine with walls
around it is a valley with a lump in it. Both banks have to fall away.

**Short blends across an inversion.** Interpolating an inverted section into an
upright one passes through flat, and on a level with a surface plane at y = 0
flat means flooded. Venom's ridge sat awash for seven seconds at a 1200 m blend.

**`bands.crag.face` is the only band that reaches an inverted section.** Both
gates in `heightAtU` measure distance from the centreline against the section's
*outer* points — "the tall rock is on the banks", true of a valley and backwards
on a ridge. `face` opens crag on local slope instead, defaults to 0, and leaves
the crest apex alone because slope there is zero. **`relief` is still
distance-gated**; the next inverted level that wants distant relief will meet it.

**A zone's `climb` is centred on the zone boundary**, so it spans exactly the
two keys the cross-section blends between. Centred on the entry key instead, a
zone raising both floor and rail pinches the corridor by `climb/2` on the way in.

**Nothing gates rail Y.** The digest's lattice samples `terrainHeight`, which
reads `centrelineX` only. A change that moved every climbing rail in the game
was reported as identical.

**Lid height is constrained per zone by `wallH` *plus relief*,** and the two are
easy to confuse. What actually decides the maximum is the outermost section
point: `wm` scales that one alone and the relief bands stack past the one
inboard of it. Read it from `tools/lid.mjs --audit`, never from the authored
number.

**A battery wave has to fire inside one zone's held stretch** — the zone less
half a blend at each end — with `bank` set to the ground that zone's section
actually puts there, and never where the rail is climbing.

**There is no terrain crash.** The ground is a floor with a cushion, not a
hazard (`flight.js:345-355`). Terrain rising into the rail bulldozes the ship
upward without limit; terrain falling away does nothing.

**`speed` is along the rail, not down z.** `railStretch(z)` divides the advance.
`railZ` stays monotone and stays in metres of z, which is what keeps the three
cursors and the end-of-level test working. It uses the same ±6 m central
difference as `railTangent` deliberately — the two are read on the same tick as
attitude and as rate, so an analytic derivative would pitch the hull to a slope
the speed correction did not agree existed.

**`ai.js` station offsets are in the rail's frame**, converted through
`view.toWorld` / `view.toStation` / `view.heading`. Yaw only: a station that
dived with the rail would fight the altitude clamps, which are one-sided and
have no notion of a sloping corridor. Rotating position without also rotating
spawn *facing* puts a whole wave that many degrees off its own approach.

## Deliberately not doing

**True free flight.** Needs a parallel trigger system for three monotone
cursors, a new end-of-level test, and ~20 −z-is-forward sites across `ai.js` and
`combat.js`. The orbit path gets the feel for a fraction of it.

**Asymmetric lateral *extent*.** The mesher's column layout is symmetric by
construction (`terrain.js:35-55`). Land can be lower on one side, not wider.

**One lever nobody has pulled:** the floor need not be a plane at y = 0. A level
whose floor sits far below the rail, flown between spires with no readable
ground, reads as none of the others. Cheap version — `waterLevel` well under
`bed`, so no plane draws at all.

## Open

- [x] **`shape.mjs --strict` passed a level that was 18% authored.** Closed
      2026-08-22. It took twelve samples and asked only that no two levels name
      the same set of shapes, so it measured variety ACROSS levels and nothing
      about coverage WITHIN one — which is how "Venom done" survived two
      sessions of review.

      It now does both of the things this item asked for. **Coverage** samples
      every 40 m and reports what fraction of each corridor measures each shape,
      alongside the metres carrying an authored `section` and how far the rail
      moves in how many monotone runs. And the **four-levels table is encoded in
      the tool** as `BRIEF`, with a `done` flag: a row marked done must keep
      meeting its row or `--strict` exits 1, while a row not yet done prints as
      outstanding and fails nothing — so the gate stays green on a clean tree
      instead of becoming noise the way a permanently red one does.

      Verified against the tree it was built for: the pre-rebuild Venom fails on
      three independent counts — `RIDGE covers 18% of 55%`, `rail moves 24 m of
      250`, `1 rail runs of 3`.

      Thresholds on a `done` row sit below the measured value, so the row is a
      regression test rather than a restatement of today's numbers. Writing one
      from intent is caught immediately: `minRuns: 4` on Venom broke the row on
      its first run, because the rail makes three.

- [ ] **Aquas' drop-off does not read.** The section is correct (`terrainHeight`
      runs +263 to −473 across the corridor at z = −4600) but underwater fog
      hides the fall. It wants an edge the eye can catch — a lip, a lit reef
      rim, or particles falling over it. `shots/p2-aquas-drop/`.

- [ ] **Two brief rows need a lid that ends.** Venom's "alternates" and
      Fortuna's "enters/exits" both need a ceiling that stops, and `Canopy` is a
      single flat camera-following plane carrying a *water* shader — refraction,
      caustics, the critical angle. It can neither end nor pass for rock. A
      canopy level's per-zone `ceiling` is also finite everywhere by
      construction: there is no "no lid here" to author. Solve once, for both.

- [ ] **Aquas' canopy is an underside seen from above.** The shader was built
      for a sea read from 300 m below, and the level now looks at it from over
      the top for the first 9 seconds and again on the victory lap. It reads as
      sea, but it was not built to.

- [ ] **`profileAt(z, {})` per call would allocate two typed arrays.** Both live
      callers hoist one profile object per build (`terrain.js:184`,
      `world-materials.js:282`), which is a hard contract nothing enforces.

- [x] **`fins.mjs --audit` exited non-zero on a clean tree.** Closed
      2026-08-22, and the "reversed triangles" were never a winding defect. The
      shading normal is a central difference across two mesh columns, and
      `islands` are authored far below that scale — Fortuna's 54 stalks are
      16−44 m in radius against a sample spacing of 6 m at the centreline and
      growing outward. On a feature narrower than the grid, the column
      difference and the facets it spans honestly disagree and can invert. That
      is aliasing between the mesh and the field, and the per-triangle threshold
      was measuring it instead of winding.

      A winding regression is not a scattering, it is a whole mesh: the index
      buffer is built and written per mesh, so reversing the order reverses
      every triangle in it. The gate now fails on the worst single mesh's
      back-facing *fraction*. Measured both ways — clean tree 0.607% (fortuna)
      and exit 0; with `terrain.js:333` reversed, **100.000%** on the first mesh
      and exit 1. The threshold sits two orders of magnitude clear of both.

## How to work this lane

Assume a different agent picks up every phase cold.

**Read a brief row against live play before believing it.** Venom's said
"inverted / rhythm / alternates" and was authored as a ridge at the start and a
canyon after. The owner wanted the whole nine kilometres on the spine. Two
agents shipped the narrow reading.

**Cut a digest before editing, not after,** or a stale baseline reads as your
own regression. This has cost three cycles across two agents.

**No narration in comments.** State the constraint, not the story: no "this used
to be X", no before/after numbers from a rejected iteration, no describing the
change. A comment explains why the code must be the way it is to a reader who
never saw the previous version. History is in git; reasoning is in this file.

**Never assert a magnitude you have not measured.** Three numbers in Venom's
section comment were written from intent and were wrong.

**Every phase ends with a separate quality pass**, run after the work is
committed rather than folded into it — an author checking a fresh diff reads
what they meant, not what they wrote. It is read-only, so it is a reasonable
place to spend a sub-agent. It covers: the verification block below on **all
seven** levels; every comment added or touched, against the no-narration rule;
every comment *near* changed code, for staleness; a grep for modules added but
never imported and functions left with no callers; and anything found that is
not this phase's work written into `ROADMAP.md` under its phase.

**Leave the trail before stopping.** In the same commit that closes a phase:
tick its row in the table above, and re-cut `HANDOFF.md`'s "Where we left off"
to name what closed, what is open, and the single next action.

## Verification

Run from `games/vulpine`. **Non-zero exit = console errors = automatic fail.**

```bash
# did a change reach a level it should not have
for L in corneria highlands omega foundry aquas fortuna venom; do
  node tools/digest.mjs --level $L --against shots/ref-geometry-$L.json || echo "MOVED: $L"
done
node tools/fins.mjs --audit                       # inverted-winding gate
node tools/lid.mjs --audit                        # ceiling gate: is there room to fly
node tools/shape.mjs --strict                     # phase 9: shape clash + the four-levels table
node tools/pilot.mjs fly --seconds 70 --params "level=venom"   # does it still fly

# before / after on a level
node tools/shot.mjs --shots chase,valley --t 16 --w 1280 --h 720 --quality high \
  --params "level=venom" --env venom --out shots/pN-venom --port 9301
node tools/sheet.mjs shots/ref-venom shots/pN-venom --pair --labels "before,after"
```

`shape.mjs --draw <level>` renders a cross-section as ASCII **and prints the
rail height beside it**, which is the fastest way to read a rail rhythm. Plain
`shape.mjs` prints three things: the twelve-sample picture, per-corridor
**coverage** (what fraction is each shape, plus authored metres and rail runs),
and the **four-levels table checked** — `meets` / `open` / `BROKEN` per row.
Add a level to `BRIEF` there when you author it, and mark it `done` only when
its row reads `meets`.

The digest is a *sanity* check, not a bit-identity contract — read the diff and
judge whether it is the change you meant. **Do not pixel-diff captures:** the
harness is not deterministic frame to frame (measured: same code, two runs, 3-11%
of pixels differ, max channel delta 205). Read the sheet.

Baseline: `shots/ref-<level>/` (chase + valley, all seven) and
`shots/ref-geometry-<level>.json`. Omega is chase-only — `field` backend, no
corridor for the `valley` camera.

**`shots/` is gitignored** (`.gitignore:9`), so no baseline travels with the
repo. A fresh clone has nothing to compare against and has to cut its own:

```bash
for L in corneria highlands omega foundry aquas fortuna venom; do
  node tools/digest.mjs --level $L --out shots/ref-geometry-$L.json
done
```

Read `digest.mjs --against` by **exit code**, never by grepping its output: the
failure line is `*** OUTPUT IS NOT IDENTICAL ***`, so a grep for "identical"
matches both outcomes and reports every level green.

## Guardrail

`CONTRACT.md` hard rule 8: **a new or reworked level must name a `section`/`path`
combination no existing level uses.** If it cannot, it is not a new level — it
is a variant of one that exists. This counteracts the incentive that produced
five levels on one cross-section.

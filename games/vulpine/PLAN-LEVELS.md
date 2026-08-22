# Vulpine — level identity: two curves

Open lane. **Phases 1 and 2 landed 2026-08-21; phases 3-6 open.** The owner
picks when each starts.

Companion docs: `ROADMAP.md` is the queue, `HANDOFF.md` the harness and traps,
`PLAN-PERF.md` the other open lane, `REVIEW.md` the rubric.

## The problem

Owner, seeing five levels side by side: *"they all essentially look like
Corneria with filters/textures."*

Geometry, not shading, and provable twice. The five levels in question are
exactly the five sharing `backend: 'terrain'`; the two the owner did not reach
for are Omega (`field`) and the Foundry (`works`). And inside that backend
`heightAtU` folded about `Math.abs(u)` and stacked `bed → beachH → shelfH →
wallH`, each higher than the last — so every terrain level was not merely
symmetric but a **valley by construction**. The nine authorable numbers were all
widths and heights; none was a shape.

**Ruled out: another palette, lithology or structure-GLSL pass.** Shading is
downstream of the cross-section. Fortuna is the proof — the most distinctive
shading in the game, still reads as Corneria at night.

**Why it collapsed onto one backend** is an incentive, not a discipline failure.
A level via DNA costs a data object and no code; a backend costs a mesher, a
`groundAt` branch and new materials. Everyone took the cheap path and the cheap
path only produces parameter variation.

## Ownership

**Planet** owns what it is made of — lithology, palette, structure shader, prop
kit, sky. **Level** owns what shape it is — cross-section, rail path, ceiling,
surface. Same rock, different topography.

## The two curves

**Curve 1 — the cross-section.** A polyline in (u, height), signed across both
banks, replacing the band stack. Landed in phase 1.

**Curve 2 — the rail.** Today `z ↦ (centrelineX(z), centrelineY(z), z)`, with
`flight.js:335` binding `pos.z ≡ railZ` exactly — z is simultaneously the
parameter and a world axis. Becomes an arc-length parameterised 3D path `p(s)`.
Buys real vertical excursion and the orbit arena; `railZ` stays monotone so the
three cursors at `combat.js:1759-1774` keep working. Phase 4.

## The four levels

| | section | rail path | ceiling | surface |
|---|---|---|---|---|
| Aquas | terraced, asymmetric | deep dive | constant lid | none |
| Fortuna | near-flat | dive + climb | **enters/exits** | water |
| Foundry | escarpment | steep shaft | built, varies | deck |
| Venom | **inverted** | rhythm | **alternates** | lava |

No two rows alike — the acceptance test for the lane.

- **Aquas — depth is the drama.** Plunge in; shallows with terraced reef benches
  you fly *between*; a hard-asymmetric drop-off (reef to port, open blue to
  starboard); a trench the rail dives into where the lid leaves view; rise to an
  open bowl.
- **Fortuna — two layers, and the canopy is both.** Fly *over* a sea of glowing
  crowns (canopy as floor), dive through a gap, thread the dark understory
  (canopy as ceiling), climb back out. Nothing else changes which side of an
  object you are on.
- **The Foundry — outside, inside, then down.** Exterior gantry run as an
  escarpment, breach to interior, a steep shaft down through decks, then a wide
  low-ceilinged assembly floor.
- **Venom — rhythm, then the arena.** Inverted profile riding a caldera crest
  with lava falling away both sides; plunge into a tube; out, in, out; then a
  closed orbital path for the finale.

## Phases

| # | Deliverable | Status |
|---|---|---|
| 1 | Cross-section becomes a polyline; `Math.abs(u)` gone | **done 2026-08-21** |
| 2 | Authorable `section` on a zone; Venom's ridge, Aquas' terraces + drop-off | **done 2026-08-21** |
| 3 | Per-zone `ceiling`; wire player flight to `ceilingAt` | open |
| 4 | `path` refactor — rail becomes arc-length `p(s)` | open |
| 5 | Hull pitch from `railDir`, then the vertical drama in all four | open |
| 6 | Venom orbit arena | open |

### Deliberately not doing

**True free flight.** Needs a parallel trigger system for three monotone
cursors, a new end-of-level test (`campaign.js:523` is the only one), and ~20
−z-is-forward sites across `ai.js` and `combat.js`. The orbit path gets the feel
for a fraction of it.

**Asymmetric lateral *extent*.** The mesher's column layout is symmetric by
construction (`terrain.js:35-55`). Land can be lower on one side, not wider.

## Phase 1, as landed

`profileAt` generates a nine-point polyline onto the profile object; `heightAtU`
evaluates it with `sectionAt` at a signed offset. The band fields still drive
everything — phase 2 opens the authoring path.

Equivalence was measured rather than assumed: 340.7 M samples across all five
terrain levels, every `wm` extreme, both banks, worst difference **3.4e-13 m**
(1.4e-14 relative). After the Float32 the mesh stores, 0.0034% of samples move
by one ULP — about 30 µm at wall height — because the old band stack accumulated
`beachH + (shelfH - beachH)` where the polyline uses `shelfH` directly. The
digest baseline was re-cut at that commit rather than contorting the evaluator
to reproduce a float-ordering artefact.

## Phase 2, as landed

A zone may carry `section: [[u, h] x 9]`, validated in `zones.js` for count,
finiteness and strictly ascending u. Zones without one still generate the
symmetric nine-point equivalent from the band fields, so authored and generated
sections mix freely and `profileAt` blends them point-wise. `MAX_HALF_WIDTH` now
measures an authored section's own extent rather than the band sum. `freecam`
gained `--level`, without which it could only ever park in Corneria — which is
useless to a lane about level shape.

Authored: **Venom zone 1**, the inverted caldera rim — a basalt spine at y = 26
with the lava plane at 0, lakes past 500 m and the caldera wall a kilometre out
at 210 m. **Aquas zone 1**, terraced reef benches, deliberately unequal across
the channel. **Aquas zone 4**, the drop-off — port wall at +300, starboard
falling to −420.

Three things learned authoring them, all of which cost a capture cycle:

- **The chase camera needs about 340 m of margin, not 105.** A spine whose zero
  crossing sat at 215 m put the camera in the lava through half the zone while
  the *ship* stayed dry: the camera trails behind and below and banks with the
  roll, so `boxX` is a floor on the margin, not the margin.
- **Blending an inverted section into an upright one passes through flat**, and
  on a level with a surface plane at y = 0 flat means flooded. Venom's ridge sat
  awash for seven seconds at a 1200 m blend. Short blends across an inversion.
- **A drop-off needs something to read against.** Aquas' starboard side falls
  420 m into fog, and fog is what the eye already expects there, so the void
  reads as distance rather than as a cliff edge. Geometry is correct and
  measured; the *look* is unresolved — see the open item below.

## Open, found in phase 2 and its quality pass

- [ ] **`keySection` writes onto the DNA's own key objects.** For a `keys`-
      authored DNA (Corneria) `expandZones` returns the input unchanged, so the
      polyline lands on `DNA_CORNERIA.keys` — against the "input is never
      mutated" contract at `zones.js:85`. The `if (key.su) return` memo means a
      later edit to that object's band fields would not regenerate. Harmless
      while DNAs are static; a per-load cache would close it.
- [ ] **`profileAt(z, {})` per call would allocate two typed arrays.** Both live
      callers hoist one profile object per build (`terrain.js:184`,
      `world-materials.js:282`), which is now a hard contract that nothing
      enforces.

- [ ] **Aquas' drop-off does not read.** The section is correct (`terrainHeight`
      runs +263 to −473 across the corridor at z = −4600) but underwater fog
      hides the fall. It wants an edge the eye can catch — a lip, a lit reef
      rim, or particles falling over it. `shots/p2-aquas-drop/`.
- [ ] **Terraces read weakly from the chase camera.** Aquas' benches sit at 555
      to 790 m, which is silhouette at best from a camera 17 m behind the ship.
      Either bring them inside ~350 m or accept them as background.

## What phases 3-6 already know

Read out of the source 2026-08-21 so none of it is re-derived. All line numbers
are from that date; verify before trusting one.

**Phase 3 — ceilings.**
- `ceilingAt()` exists (`corneria.js:349`, `works.js:81`) and **only the AI
  honours it** (`ai.js:359, 365`). The player can fly through the Foundry's roof
  today. `flight.js:343` reads `groundAt` and nothing else. Per-zone ceilings are
  worthless until flight is wired to it — mirror the ground's two-stage
  cushion/clamp at `flight.js:345-355`.
- `canopy.js` is **one camera-following plane** (`canopy.js:65-89`) and
  `ceilingY()` takes no arguments, so it cannot vary along z. A z-varying lid
  needs the rail-aligned strip pattern from `water.js:93-154` or a chunk queue
  like `Terrain`, and the 8k-triangles-versus-90-chunks argument at
  `canopy.js:21-27` has to be re-made. **`Works.ceilingAt(z)` (`works.js:81-88`)
  is the precedent** — discrete z-cells, per-cell overhead, already answers
  conservatively across gaps.
- Lid height is constrained per zone by that zone's `wallH` plus relief. Aquas'
  lid went 330 → 620 because at 330 it sat on every zone's rim and the level read
  as a cave (`dna.js:459-469`).

**Phase 4 — the rail as `p(s)`.**
- `railZ` is mutated in exactly one place, `flight.js:277`, and `flight.js:335`
  binds `pos.z ≡ railZ`. Speed is always in [105, 300]; there is no reverse.
- Three cursors edge-trigger off it — waves, comms and grants at
  `combat.js:1759-1774`. **The boss is a wave row**, not a separate system, so it
  rides the same cursor with no fallback. Arc length keeps them all monotone.
- `campaign.js:523` (`railZ <= WORLD.zEnd`) is the **only** end-of-level test.
- `railZ` is world z, not arc length, so on any slope true speed is
  `speed / cos(pitch)` while the HUD reads 175. Phase 4 fixes that for free.

**Phase 5 — anything steep.**
- `flight.js:397` orients the hull from `railDir` **yaw only**; the camera
  (`flight.js:490`) keeps the full tangent including Y. On a dive the camera
  pitches and the hull does not, and the divergence grows linearly with slope.
  Nothing clamps it and nothing warns. Steepest shipped is Fichina at 16.7°.
- `ai.js` has **zero** `railZ` references but adds station offsets in world axes
  (`ai.js:406`, `ai.js:704`), so "ahead" means −z rather than "in front of the
  player". Rotating the offset through the heading is ~2 lines and is required
  once the rail can turn.
- There is **no terrain crash**. The ground is a floor with a cushion, not a
  hazard (`flight.js:345-355`). Terrain rising into the rail bulldozes the ship
  upward without limit; terrain falling away does nothing.

**Everything free.** All of `src/ui/`, `src/fx/`, `src/audio/`, `pickups.js` and
world LOD are position-based, not `railZ`-based, and survive phase 4 untouched.

## How to work this lane

Assume a different agent picks up every phase cold.

**No narration in comments.** `HANDOFF.md` carries this rule and it keeps
slipping. State the constraint, not the story: no "this used to be X", no
before/after numbers from a rejected iteration, no describing the change. A
comment explains why the code must be the way it is to a reader who never saw
the previous version. History is in git; reasoning is in this file.

**Never assert a magnitude you have not measured.** Three numbers in Venom's
section comment were written from intent and were wrong; the quality pass caught
them by checking against the authored points.

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

# before / after on a level
node tools/shot.mjs --shots chase,valley --t 16 --w 1280 --h 720 --quality high \
  --params "level=venom" --env venom --out shots/pN-venom --port 9301
node tools/sheet.mjs shots/ref-venom shots/pN-venom --pair --labels "before,after"
```

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

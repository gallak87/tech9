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

## Open, found in phase 2

- [ ] **Aquas' drop-off does not read.** The section is correct (`terrainHeight`
      runs +263 to −473 across the corridor at z = −4600) but underwater fog
      hides the fall. It wants an edge the eye can catch — a lip, a lit reef
      rim, or particles falling over it. `shots/p2-aquas-drop/`.
- [ ] **Terraces read weakly from the chase camera.** Aquas' benches sit at 555
      to 790 m, which is silhouette at best from a camera 17 m behind the ship.
      Either bring them inside ~350 m or accept them as background.

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

## Guardrail

In `CONTRACT.md`: **a new level must name a section/path combination no existing
level uses.** If it cannot, it is not a new level — it is a variant of one that
exists. This counteracts the incentive that produced five-levels-on-one-backend.

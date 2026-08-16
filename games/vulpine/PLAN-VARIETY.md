# Vulpine — level variety

> **Superseded in part, 2026-08-15, by `level.plan.md`** (owner-approved), which
> makes a level a sequence of *zones* that compile to today's DNA. It **replaces
> Phase C outright** (rail verticality and the offset box become per-zone fields,
> not per-level), and reframes **Phase B** as its Z5 and **Phase D** as its Z4,
> both gated on the Z1 experiment. The diagnosis below still stands and is the
> reasoning that lane is built on — read this file for *why*, `level.plan.md` for
> *what next*. Phase letters are unchanged so existing references resolve.

**Lane status: nothing implemented.** Everything here is read from source, not
measured. Sibling lane: `PLAN-PERF.md` (was Phase A of this file; split out
2026-08-15).

**Brief** (owner, 2026-08-15): Fichina "looks basically the same as the first
level." Wants more levels, wants them to look different, wants the tooling
**reusable** so levels 3 and 4 are cheaper than level 2 was.

**Settled, do not re-ask:** perf before the furniture layer; keep the rail's
meander and get variety from verticality plus a per-level offset box.

---

## Why the two levels look the same

Three independent causes. The third is the biggest.

**1. The cross-section is one hardcoded shape function.** `heightAtU(u, z, P)`
(`profile.js:203`) is a single grammar: riverbed dip → beach → shelf → cliff →
plateau relief. `keys` only feeds widths and heights into it. A glacial U-trough,
a fortress trench, an open basin and a field of towers are **not expressible at
any parameter value**. Fichina moves `inner` 126→206 and repaints the palette;
it cannot escape the grammar.

**2. Both banks are the same shape.** Side enters `heightAtU` only via
`bankJitter()`'s phase offsets and the `wm` side-wobble (`profile.js:208`).
`beachW`, `cliffW`, `wallH` are side-independent, so every world is near
mirror-symmetric about the rail.

**3. Neither level contains a single man-made object.** Verified by grep, zero
importers outside the defining file:

- `cityMaterial`, `concreteMaterial`, `steelMaterial`, `foliageMaterial`,
  `rockPropMaterial` — `world-materials.js:1313–1434`, ~500 lines of finished
  shader code, imported by nothing.
- `cityWeight(z)` (`profile.js:159`) tints terrain for a city never built.
- Eight review cameras (`w-city`, `w-city2`, `w-dam`, `w-bridge`, `w-damface`,
  `w-towers`, `w-arch`, `w-delta`) all frame empty canyon.
- `world/city.js` and `world/landmarks.js` do not exist.

Two empty procedural canyons with different tint will always read as the same
game. SF64's Corneria and Fichina barely differ in terrain either — one has
skyscrapers, arches and a waterfall, the other radar dishes and ice rigs.

**The constraint that is not going away.** `h = f(u, z)` is a single-valued
heightfield: no overhangs, ceilings, tunnels or arches at any parameter value,
ever. The rail-aligned grid in `terrain.js` is load-bearing for band-limiting,
LOD, skirts and the baked sky-view term. **Do not try to make the terrain do
overhangs.** A ceiling does not have to be terrain — arches, ice bridges,
gantries and cavern roofs are *props*, so the biggest missing axis falls out of
Phase B with the terrain pipeline untouched.

---

## Phase B — the furniture layer (the main event)

Generic tooling, not `world/city.js`. Roadmap Phase 9 named two one-off modules;
that is the wrong shape for something serving four levels.

A prop group is data on a DNA:

```
{ geometry: <factory>, material: <factory>, place: <rule>, z: [from, to], density, seed }
```

**The placement rules are the reusable part:**

| rule | what it does | unlocks |
|---|---|---|
| `bank` | hugs a bank at a height band, via `landAtU`/`shoreU` | cities, ice rigs, gun emplacements |
| `floor` | scattered on the corridor floor | rubble, wreckage, séracs, pylons |
| `ridge` | on the skyline beyond the rim, silhouette only, cheap LOD | radar arrays, distant towers |
| **`span`** | **bridges the corridor — this is your ceiling** | arches, bridges, gantries, cavern roofs |
| `free` | explicit per-instance placement | one-off landmarks: the dam, the bridge |

`render/geobuild.js` already exports ~20 primitives (`loft`, `superellipse`,
`chamferBox`, `extrudePoly`, `ductGeo`, `louvers`, `tubeAlong`, `shellArc`,
`conformalPatch`, …) and the five materials are written and tested. **The
construction kit exists; nothing consumes it.** The expensive half of B is
already written — what is missing is the placer.

- [ ] **B1.** The placer + rules, off a `props` field on the DNA. Queue-based
      like `Terrain` so it joins `corneria.js`'s job list and the mid-flight
      rebuild budget (`corneria.js:141`).
- [ ] **B2.** Corneria's set: towers up both banks at `z ≈ -4400…-5800` off
      `cityWeight`, breached dam (`-6060`), bridge (`-4950`), natural arches
      (`-1720`), rock stacks, breakwater shoal. Ticks roadmap Phase 9.
- [ ] **B3.** Fichina's set, proving it generalises: ice rigs, radar arrays,
      pressure-ridge debris, and at least one `span` you fly under.
- [ ] **B4.** Make the eight dead review cameras show something.
- [ ] **B5.** Scatter — scrub and conifer canopy on the shelves.

**Constraints:**

- **Land B1 with one rule and one real consumer**, then add rules one at a time,
  each with something using it. The unimported modules above are the residue of
  a session that fanned out five lanes and stopped mid-flight — the failure mode
  to design against is *interruption*, so ship criterion 7 must hold at every
  commit, not only at the end of the phase.
- **`span` is the only rule that can occlude the rail.** It must not place
  geometry inside the player's offset box without a flyable gap. Assert at build
  time.
- **Instancing is not a perf win here** — draw count is measured dead at 7% of
  frame. Instance for memory and build time.
- **Overdraw is not obvious**: props add fill *and* occlude canyon behind them.
  Re-measure after B2, not after B5, per `PLAN-PERF.md`'s measuring rules.

---

## Phase C — rail verticality + per-level box

**The rail's problem is not its curvature, it is that it is flat.** Corneria's
`centrelineY` is base 44 ± 23 over 9 km (`dna.js:129`); Fichina is 52 ± 11.

- [ ] **C1.** Give Y a dog-leg term. `centrelineX` has `bends` (smoothstep,
      `profile.js:102`); Y has no equivalent and sines alone will not carry it.
      A rail that climbs 400 m over a pass and dives down the far side is a
      different-feeling level with **zero new systems** — `centrelineY` is
      already sampled by the flight model, the cameras and the shots.
- [ ] **C2.** Move `TUNE.boxX` 105 / `boxYUp` 78 / `boxYDown` 46
      (`flight.js:22`) into the DNA. A trough should feel tight, a basin open.
- [ ] **C3.** Drop the rail below the surrounding terrain somewhere — with C1,
      the cheapest "the world closes over you" with no prop work.

**Constraint:** the terrain grid shears along `centrelineDX`, and
`profile.js:98` records that past ~0.8 the "perpendicular" wall stops being
perpendicular and the lateral sample rate stops matching `spacing()`. A vertical
equivalent will have its own limit — find it before authoring against it.

---

## Phase D — profile kinds + asymmetry

Cut this seam before Sector Ω, which needs `none` anyway.

- [ ] **D1.** `heightAtU` dispatches on `dna.profileKind` instead of hardcoding
      the terrace stack: `terrace` (today, default), `trough`, `trench`, `basin`,
      `none` (`surface: 'none'` already exists, handled in `corneria.js:134` and
      `groundAt`).
- [ ] **D2.** Per-side `keys` with optional `L`/`R` variants — one overhanging
      wall against one shallow ramp.
- [ ] **D3.** A floor that does something: ice steps, a climb to a pass, gaps to
      dive through.

**Hard constraint on all three:** `heightAtU` stays a pure function of `(u, z)`
with no per-sample object dereference, and the two mesh tiers must agree exactly
at the shared boundary column at `nearHalf`. Disagreeing about the band limit
there means disagreeing about the height there, which opens a seam down the
entire level — documented at `profile.js:188–202`, and what the lateral skirts
were papering over.

---

## Rejected

- **Straightening the rail** (owner floated it). The meander is what makes walls
  sweep past and stops the corridor reading as a tube; a straight rail at
  175 m/s is *more* monotonous. The half worth keeping is C2 plus widening in
  *some* stretches as contrast — uniformly wide is uniformly empty.
- **Rebuilding on a different premise.** ~25k lines, an owner-tuned flight model
  and post chain. The variety wanted lives in the content layer.
- **Terrain overhangs.** Single-valued heightfield. Props instead.
- **Off-rail / all-range sections.** Deferred, not rejected on merit — genuinely
  the biggest pacing lever and `flight.detached` already exists (the campaign hop
  uses it), but it is real new work in AI and camera. Raise again after Phase B.

---

## Open questions for the owner

- **How different should level 3 be?** Sector Ω (asteroid belt, no ground) is
  nearly free once B exists and cannot look like the first two, but skips terrain
  entirely so it proves nothing about D. Venom (lava + fortress trench) exercises
  D1's `trench`.
- **Does Fichina get a boss? LOWEST PRIORITY** (owner, 2026-08-15).
  `commander:ice` runs through the ordinary enemy path — no health bar, no
  station-keeping, no win trigger — so Fichina cannot hand off to a level 3.
  Tracked as an open Phase 8 item in `ROADMAP.md`.

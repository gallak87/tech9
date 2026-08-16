# Vulpine — why the two levels look the same

**The diagnosis. The plan built on it is `level.plan.md`** (owner-approved
2026-08-15), which owns every task list — this file owns only the *why*.

Written 2026-08-15, read from source, not measured. Sibling lane: `PLAN-PERF.md`.

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
`level.plan.md` Z5 with the terrain pipeline untouched.

---

## Rejected

- **Straightening the rail** (owner floated it). The meander is what makes walls
  sweep past and stops the corridor reading as a tube; a straight rail at
  175 m/s is *more* monotonous. The half worth keeping is the per-zone
  offset box (`level.plan.md`) plus widening in *some* stretches as contrast — uniformly wide is uniformly empty.
- **Rebuilding on a different premise.** ~25k lines, an owner-tuned flight model
  and post chain. The variety wanted lives in the content layer.
- **Terrain overhangs.** Single-valued heightfield. Props instead.
- **Off-rail / all-range sections.** Deferred, not rejected on merit — genuinely
  the biggest pacing lever and `flight.detached` already exists (the campaign hop
  uses it), but it is real new work in AI and camera. Raise again after `level.plan.md` Z5.

---

## Open questions for the owner

- **How different should level 3 be?** Sector Ω (asteroid belt, no ground) is
  nearly free once props exist and cannot look like the first two, but skips
  terrain entirely so it proves nothing about the grammar. Venom (lava + fortress
  trench) exercises `level.plan.md` Z4's `trench` kind.
- **Does Fichina get a boss? LOWEST PRIORITY** (owner, 2026-08-15).
  `commander:ice` runs through the ordinary enemy path — no health bar, no
  station-keeping, no win trigger — so Fichina cannot hand off to a level 3.
  Tracked as an open Phase 8 item in `ROADMAP.md`.

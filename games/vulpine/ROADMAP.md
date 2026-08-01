# Vulpine — roadmap

**Status:** playable end-to-end, alpha. Phases 0–7 done. Phase 8 (encounter feel
+ legibility) in progress. Branch `g/fox64`.

Read with `CONTRACT.md` (lane rules), `REVIEW.md` (the rubric), `HANDOFF.md`
(live session state + defect queue). **This file is the plan; HANDOFF is the
queue.** Tick items here at every commit that closes one, and re-cut the Status
line at the end of each phase.

---

## Scope

**Is:** one 9 km on-rails flight-shooter level — Corneria — that beats Star Fox 64
in a blind side-by-side on visuals. Arcade feel, 2020s rendering, everything
procedural (no binary assets, no network).

**Is not:** a campaign, a hub, branching paths, multiple levels, an all-range
mode, or multiplayer. One level, finished.

**Scope call (2026-07-31, owner):** polish the first two encounters and the
moment-to-moment feel until genuinely AAA rather than spreading thin across all
9 km. Everything past `z ≈ -3000` is roughed-in on purpose.

---

## Done

| Phase | What | Where |
|---|---|---|
| 0 | Engine, fixed-step sim, interpolated render, capture API | `core/engine.js`, `main.js` |
| 1 | Post chain — god rays, DOF, motion blur, bloom, SMAA, ACES grade | `render/postfx.js` |
| 1 | Sky dome w/ lit cloud decks, PMREM IBL, fog, 3 presets | `render/sky.js`, `render/environment.js` |
| 2 | Analytic level: meander, cross-section keyframes, band-limited relief | `world/profile.js` |
| 2 | Terrain meshing, 3-step LOD, hemmed skirts, triplanar rock + lithology | `world/terrain.js`, `world/world-materials.js` |
| 2 | **Terrain sun shadows** — baked 8-sector horizon map, not CSM. No acne, no cascade seam, tracks the preset | `GLSL_HORIZON` |
| 2 | Water — Gerstner swell, 6-band ripples faded on pixel footprint, Beer depth, shoreline, glitter | `world/water.js` |
| 3 | Arwing — hull, rig, animation API, damage states | `ships/arwing.js` |
| 3 | 5 hostile classes (raptor, wasp, bulwark, hornet, vanguard) + class beacons | `ships/enemies.js` |
| 3 | Boss — Gargantua, 68 m carrier, 8 weak points, 3 phases, spinal cannon | `ships/boss.js` |
| 4 | FX — explosions, lasers, impacts, shields, trails, debris, charge, screen | `fx/**` |
| 5 | Flight model, keyboard + gamepad, barrel roll, somersault, boost/brake | `game/flight.js`, `core/input.js` |
| 5 | AI — states, formations, station-seek, evade, hunt, wingmen | `game/ai.js` |
| 5 | Combat — 17 waves + boss, comms script, bullets, bombs, lock-on, homing | `game/combat.js` |
| 6 | HUD — shield/boost/bomb, radar, score, reticle, comms, squadron, boss bar | `ui/**` |
| 6 | Title card, Esc pause menu, win/lose | `ui/menu.js`, `ui/outcome.js` |
| 7 | Audio — graph, DSP, engine, beds, music, voices, autoplay-safe | `audio/**` |
| — | Review harness: `shot`, `sheet`, `freecam`, `pacing`, `inputtest`, `bossprobe`, `blind` | `tools/**` |
| — | Dev panel — DOM overlay of playtest shortcuts, backquote to toggle, `?dev=1` to open. Add tools to the `TOOLS` array | `dev/panel.js` |

**Fixed and verified** (don't reopen): terrain winding/"fins"; enemy spawn crash;
wingman clone crash; skirt curtains; fog density; gun convergence; lock-on
tracking; HUD status text; boss station-keeping, weak-point frame, lock, hit
register, swept collision.

---

## Now — Phase 8: legibility and the first two encounters

- [ ] **TOP PRIORITY — the ship auto-yaws.** Launch, touch nothing, and the nose
      swings slowly left, then slowly right, forever. Owner: "super annoying,
      don't auto yaw."
      Source is `flight.js:226` — the yaw Euler is
      `this.yaw + Math.atan2(railDir.x, -railDir.z)`. `this.yaw` is the stick
      term and is 0 at rest; the second term is the rail heading, and the rail
      is `centrelineX`, three summed sines with periods of ~1.5 km, ~3.5 km and
      ~11 km. At 175 m/s that is an ~8.8 s wobble under a ~20 s swing under a
      ~65 s sweep — exactly the reported motion.
      The ship does need to fly down the corridor, so the fix is probably to
      scale that term well down (the world curves around you instead of you
      turning into it) rather than drop it. Check what else reads ship heading
      before changing it — gun convergence uses the camera ray, not the hull
      axis, but the chase camera and `fx` emission both derive from the hull.

- [ ] **Loading screen with a progress bar.** Today `index.html` is a bare black
      page for ~5 s while terrain meshes, textures bake, the PMREM builds and
      shaders compile. No spinner, no logo, no progress — it reads as a hang.
      Needs staged progress reporting out of `main.js` init, drawn before the
      first frame.
- [x] **Bug: one bomb press spends the whole rack.** Fixed. `bombPressed` is
      sampled once per rendered frame and read once per fixed step (1–8 per
      frame), and the launch branch guarded on `state.bombs > 0`, which stays
      true after spending one. Now guarded on `!bombs.length`, which goes false
      immediately. Audited every other `*Pressed` read: roll and somersault sit
      inside `step()` too but already flip their own predicate (`rollT >= 0`,
      `somersaultT >= 0`); everything else (`mode.js`, `legend.js`, `main.js`)
      is read outside the step loop. **Rule for any new edge-triggered action:
      the guard must be a predicate the action itself invalidates.** A resource
      counter is not one.
- [ ] **Encounter feel, waves 1–4** (`z = -260 … -1950`): spacing, entry angles,
      how long a raptor stays shootable, whether the wasp swarm reads as threat.
      Instrument with `tools/pacing.mjs`, not screenshots.
- [ ] **Enemy legibility past ~800 m.** Partly fixed (warm plating, dorsal
      camera-facing beacons). Still small and quiet at range. Re-tune now that
      the water background has changed.
- [ ] **Tiny per-enemy health bars.** Owner: doubles as a legibility fix — a
      floating bar is easier to spot than the hull it sits over. Pairs with the
      beacon work and the scale experiment; try it before assuming more emissive
      is the answer. Billboarded, clamped to a floor in *angular* size like the
      class beacons, and probably only drawn once damaged so a clean screen
      stays clean.
- [ ] **Experiment: scale every ship up.** Player, hostiles and boss are hard to
      read at combat range; a global size bump may buy more legibility than any
      shader work. Try +25% / +50% on hulls, keep hit radii honest, and A/B it
      from `combat-wave` and `combat-wide`. Cheap to test, easy to revert.
- [ ] **Rear-threat indicator.** Owner feedback: too many hostiles shoot from
      behind. Being flanked is good; being shot by something you were given no
      way to notice is not. Blocked on an owner call — see Open questions.
- [x] **Wire `world/reflection.js` into `corneria.js`.** Done. Canyon walls and
      rock stacks now reflect; costs +0.8 ms.
- [ ] **The frame is over budget.** First contract-point measurement ever taken
      (1080p `--quality high`, serial): **17.3 ms with the reflection disabled,
      18.1 ms with it**. So the reflection is not the problem — the base frame
      was already 0.7 ms over on its own, and nobody had ever checked. Profile
      the base frame before optimising anything. Note run-to-run variance is
      ±2 ms, so any fix needs a repeated A/B, not one reading.
- [ ] **Shoreline.** The beach/water boundary is still a hard geometric line
      with no foam, and the sand is a flat untextured wedge
      (`shots/refl1/w-shore.png`, mid-left; `shots/refl1/combat-wide.png`).
- [ ] **`w-shore` sits under the exposure band** — composited median 0.068
      against a 0.10–0.20 target. Clipping and black are fine, so it is grade,
      not range. Check whether other shadowed-gorge angles do the same.

## Next — Phase 9: the built world

The level is terrain + water + sky. **Nothing man-made exists.** `cityMaterial`,
`concreteMaterial`, `steelMaterial`, `foliageMaterial` and `rockPropMaterial` are
~500 lines of finished, tested material code that **nothing imports**; `cityWeight(z)`
tints the terrain for a city that was never built; and eight registered review
cameras (`w-city`, `w-city2`, `w-dam`, `w-bridge`, `w-damface`, `w-towers`,
`w-arch`, `w-delta`) all frame empty canyon. This is the single largest gap
between the level as designed and the level as shipped.

- [ ] `world/city.js` — towers up both banks at `z ≈ -4400 … -5800`, placed off
      `cityWeight`, instanced, façades already anti-aliased in the shader.
- [ ] `world/landmarks.js` — the breached dam (`-6060`), the bridge (`-4950`),
      natural arches (`-1720`), rock stacks, breakwater shoal.
- [ ] Scatter — scrub and conifer canopy on the shelves (`foliageMaterial`).
- [ ] Make the eight dead review cameras show something.

## Later — Phase 10: progression

- [ ] **Weapon upgrade system.** Drops from kills and from wave clears: laser
      tiers (single → twin → spread → homing), bomb capacity, shield pickups.
      Needs a pickup entity, a magnet/collect rule, HUD tier readout, and a
      rebalance of every enemy HP against the new DPS curve. New scope — decide
      whether it earns its keep in a single-level game before building it.
      **Motivating case (owner, live play, post-rebalance): the boss is still a
      tank.** Chewing through each compartment takes forever. The owner *likes*
      the per-compartment grind, so the fix is probably more DPS by then rather
      than less HP — either loot dropping through the level, or an automatic
      weapon upgrade granted just before the boss as the reward for reaching it.
      Do not cut boss HP again in isolation; that trades the part of the fight
      the owner likes for the part that is broken.
- [ ] Score/rank at level end (medals, hit %, time).

## Later — Phase 11: finish

- [ ] The back half of the level (`z < -3000`) raised from roughed-in to shipped.
- [ ] Difficulty pass end to end.
- [ ] Touch controls / mobile.

## Not doing

Multiple levels, all-range mode, branching paths, multiplayer, binary assets.

---

## Ship criteria

1. `REVIEW.md` rubric ≥ 8 on every axis, ≥ 9 on silhouette, lighting and cohesion.
2. Blind A/B against a modern Star Fox remaster: a reviewer cannot reliably pick
   the fan project.
3. 16.6 ms at 1080p `--quality high` on an M1 Pro, measured serially.
4. `probe()` healthy on every review shot: median 0.10–0.20, p90 < 1.5,
   clippedPct < 4, blackPct < 12.
5. Zero console errors from `shot.mjs`, `inputtest.mjs`, `pacing.mjs`, `bossprobe.mjs`.
6. Every control in `inputtest.mjs` does what the legend says.
7. No dead code: every module written is imported and reachable. Standing
   total, measured by sweeping every export in `src/**` for references outside
   its own file: **~275 lines**, essentially all of it the Phase 9 built-world
   materials. Re-run that sweep before claiming this criterion.

---

## Open questions for the owner

1. **Rear attackers** — edge-of-screen threat arc, or thin out the `from:'behind'`
   waves? Asked two sessions ago, still open, still blocking that item.
2. **Weapon upgrades** — worth the scope in a one-level game, or is a fixed
   loadout the cleaner arcade answer?
3. **Ship scale** — if the +25/+50% experiment reads better, do we accept the
   canyon feeling proportionally tighter?

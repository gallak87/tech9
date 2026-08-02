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
| — | Review harness: `shot`, `sheet`, `freecam`, `pacing`, `inputtest`, `bossprobe`, `framing`, `blind` | `tools/**` |
| — | Dev panel — DOM overlay of playtest shortcuts, backquote to toggle, `?dev=1` to open. Add tools to the `TOOLS` array | `dev/panel.js` |

**Fixed and verified** (don't reopen): terrain winding/"fins"; enemy spawn crash;
wingman clone crash; skirt curtains; fog density; gun convergence; lock-on
tracking; HUD status text; boss station-keeping, weak-point frame, lock, hit
register, swept collision.

---

## Now — Phase 8: legibility and the first two encounters

- [x] **TOP PRIORITY — the ship auto-yaws.** Fixed. Three separate causes, only
      the third of which the old note guessed at. Measured with the new
      `tools/framing.mjs` over 30 s of hands-off flight (nose-vs-camera angle and
      ship position in NDC, peak-to-peak):

      | | before | after |
      |---|---|---|
      | nose swing vs camera | 44.7° | **0.25°** |
      | world swing (camera yaw) | 19.8° | **0.25°** |
      | ship drift across frame | 0.28 ndcX | **0.016** |

      1. *A sign error in the hull yaw.* `YXZ` maps yaw θ to forward
         `(-sinθ, 0, -cosθ)`, so aligning the nose with `railDir` needs
         `atan2(-railDir.x, -railDir.z)`. The negation was missing, which pointed
         the hull at the *mirror* of the corridor heading. The camera aims down
         the corridor correctly, so the two swings added instead of cancelling —
         that doubling was most of the 44.7°.
      2. *The camera damped its ride along the rail.* `camPos`/`camLook` lerped
         toward targets that include the rail position, but the rail is a known
         function of `railZ` — damping it buys no smoothing and only puts the
         camera where the ship *was*. On a meandering rail that lateral lag is
         what made the ship slide across the frame. Only the player's offset is
         damped now (`_sOffX`/`_sOffY`).
      3. *The corridor genuinely bends ±13.7°.* `TUNE.railYawFollow` scales how
         much the hull **and** the camera lean into it — scaled together, so they
         can never disagree. **0 by default** (owner's call: the behind-cam stays
         aligned so the reticle never drifts). The cost is that the ship crabs by
         the full rail heading rather than turning into it. `?railyaw=` overrides
         it live for A/B without a rebuild.

      Note for anyone re-measuring: hands-off `framing.mjs` still shows ~3.5°
      of camera yaw and 0.17 ndcX. That is **camera shake**, not drift — the
      probe takes hits, `shake` peaks at 1.53, and shake displaces
      `camera.position` by up to 3.8 m *before* `lookAt`, which at 17 m from the
      ship is ~3°. `offx`/`offy`/`_sOffX` all measure zero variance. Do not
      chase it as drift.


- [x] **The ship left the frame at the top and bottom of the offset box.** Fixed.
      The camera copied only `camOffsetFollow` (0.70) of the offset, so the ship's
      lead over the rig was a *share* of an offset that ranges over 105 m
      laterally and 124 m vertically, against a trail of 12.6 m. At full
      deflection that is 56° off axis laterally and 47° below — outside a 58°
      frustum, so the ship simply vanished. The aim made it worse: pinned to the
      rail rather than the ship, it pitched the camera *up* 5° while the player
      dived. Lead is now capped in metres (`camLeadX` 4.5, `camLeadY` 2.5), the
      cap bounds the damper's own lag too (worth 15 m at terminal offset speed),
      the aim hangs off the ship, and `camBack` went 12.6 → 17. Verified at all
      four box corners — worst case is `ndcY -0.50`, half way to the edge:

      | | centre | full down | full up | full left/right |
      |---|---|---|---|---|
      | ndcX | 0 | 0 | 0 | ∓0.15 |
      | ndcY | −0.12 | **−0.50** | −0.12 | −0.12 |

      `camAimFollow` is gone — superseded by `camAimLead`, which scales the aim
      off the capped lead instead of off the raw offset.

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
- [ ] **Experiment: scale every ship up.** *Punted by the owner (2026-08-01).*
      Revisit only if beacons, health bars and emissive fall short.
- [ ] **Rear-threat indicator.** Owner feedback: too many hostiles shoot from
      behind. Being flanked is good; being shot by something you were given no
      way to notice is not. **Unblocked** — owner picked the edge-of-screen arc
      over thinning the waves (see Owner decisions). Arc on the side the shot
      comes from, brightness = how locked-on the hostile is.
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
   total: **~190 lines** — `concreteMaterial`, `steelMaterial`, `foliageMaterial`
   and `rockPropMaterial` (Phase 9 built-world) plus `shoreU` (Phase 8
   shoreline). Kept deliberately: each has a named consumer in a scheduled
   phase. Everything with no scheduled consumer is gone (`ahdsr`,
   `resetStreams`, `disposeMaterials`, `disposeShipMaterials`, `finPatch`,
   `L_FAR`, `L_MACRO`).
   Re-run the sweep before claiming this criterion, and note the obvious
   one-liner misses orphans on multi-declarator lines (`const A = 1, B = 2`
   only reports `A`) — that is how `L_MACRO` hid behind `L_FAR`.

---

## Owner decisions (2026-08-01) — settled, do not re-ask

1. **Rear attackers → edge-of-screen threat arc.** Keep the `from:'behind'`
   waves; being flanked is good. Add a warning arc at the screen edge on the
   side the shot is coming from, brightness scaling with how locked-on the
   hostile is.
2. **Ship scale → punted.** Not now. Get legibility from beacons, health bars
   and emissive first; revisit only if those fall short.
3. **Weapon upgrades → auto-grant one upgrade before the boss.** No pickup
   entity, no drops, no level-wide HP rebalance. A weapon tier granted as the
   reward for reaching the boss, which fixes the DPS slog without new systems.
   The full drop system is explicitly *not* being built.

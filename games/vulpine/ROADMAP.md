# Vulpine — roadmap

**Status:** playable end-to-end, alpha. Phases 0–7 done, plus the drop system
and level cards. **Seven levels, three backends**, all finishable; the four
original ones are measured (`## Campaign audit`), the three added 2026-08-20
fly but are unbalanced. Phase 8 (encounter feel + legibility) is open and is not
the active lane. Branch `g/fox64`.

**The active lane is level identity — `PLAN-LEVELS.md` is its plan and is not
restated here.** As of 2026-08-22 every mechanism in it is landed and the
remaining work is authoring: Venom, Aquas and Fortuna are done, the Foundry is
not — and the Foundry is a mechanism pass before it is an authoring one. All
four gates in that file's verification block are green on a clean tree.

**The campaign lane is accepted, 2026-08-16 (owner): "levels are in good shape
to call that work passed for now."** What is still open under `## Campaign
audit` is authoring and balance, not defects — the levels play, and nothing
there blocks the next lane. **Boot and transition cost is the lane the owner
turned to next; it is measured in `PLAN-PERF.md` under Phase B.**

**The level lane is closed — see `## Settled`.** Its conclusion, 2026-08-15,
after three rounds that each produced a large diff and a minimal visible
difference: **variety does not live in the terrain generator.** It has one
composition in it and every parameter scales that composition. What changed the
picture was giving a level the option not to use it.

Finished work and the reasoning behind it lives in `## Settled` at the bottom.
The sections above it are only what is still open.

Read with `PLAN-PERF.md` (the DPR finding and the frame-time measurement rules),
`CONTRACT.md` (lane rules), `REVIEW.md` (the rubric), `HANDOFF.md` (harness and
traps).
**This file is the plan of record; HANDOFF is the queue.** Tick items here at
every commit that closes one, and re-cut the Status line at the end of each phase.

---

## Scope

**Is:** one 9 km on-rails flight-shooter level — Corneria — that beats Star Fox 64
in a blind side-by-side on visuals. Arcade feel, 2020s rendering, everything
procedural (no binary assets, no network).

**Is not:** a hub, branching paths, an all-range mode, or multiplayer.

**Levels, as built (2026-08-15).** Corneria is one *planet* with two sectors —
the lowland river reach and the ice cap above it — joined by an overland hop.
Sector Omega and The Foundry follow, each behind an orbital hop. Four levels,
three backends (`terrain`, `field`, `works`), and the one thing they share is a
rail and a floor.

**Scope changed (2026-08-15, owner).** "Is not" used to begin "a campaign […]
multiple levels". The owner asked for more levels with a seamless transition
between them. The target is now a short campaign: seven levels, one hop between
each, all of them built.

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
| — | Dev panel — DOM overlay of playtest shortcuts, backquote to toggle, `?dev=1` to open. Add buttons to `TOOLS`, sliders to `KNOBS` | `dev/panel.js` |
| — | Live look knobs — exposure, trim, bloom, lens dirt, god rays, flare, AO, saturation, contrast, CA, vignette, motion blur, reflections, plus per-pass toggles. Key `5` copies every value as JSON so a dialled-in look can be pasted into `environment.js` verbatim | `dev/panel.js` |

**Core combat loop (owner, 2026-08-11 — was never written down):** *hold* the
trigger. It tap-fires, then builds a charge and acquires a lock; a red box over a
contact means releasing lands a guaranteed homing hit. Holding is the primary way
to fight, not a special case — anything that assumes tapping (including
autopilots) is modelling the wrong game.

**Fixed and verified** (don't reopen): the death sequence ran the level on
without the player — the rail kept advancing (so waves, comms and grants fired
into a sky with no ship in it), the engine trails kept being laid from the hidden
hull, the stick still flew it and the reticle still aimed it (2026-08-16;
`flight.die()`/`revive()`, `combat.killSelf()` to exercise it);
`state.right` pointed to port, so the
radar mirrored every contact and the rear-threat arc lit the wrong screen edge
(2026-08-16 — it was the exact negative of the camera's right vector);
terrain winding/"fins"; enemy spawn crash;
wingman clone crash; skirt curtains; fog density; gun convergence; lock-on
tracking; HUD status text; boss station-keeping, weak-point frame, lock, hit
register, swept collision.

---

## Found in passing — real, but not what the finder was doing

- [ ] **Aquas' first battery wave is most of the way orphaned by phase 8.**
      `{ z: -400, kind: 'bulwark', n: 3, form: 'banks', first: 640, step: 260 }`
      lands its three emplacements at z -1040, -1300 and -1560, where the rail is
      now roughly 640, 470 and 230 — so the first two sit 400-590 m below the
      ship, at 620 m of bank. The third works, because the plunge is descending
      into it. The wave predates the rail base moving to 710. Either move it past
      the plunge or lean into what already half works and place the whole line
      inside the dive. `tools/pacing.mjs`.
- [ ] **Fortuna's hornets lost a third of their time on target to phase 4.**
      Its station offsets now rotate through the rail's heading, which is
      correct and which every other level gained from — Corneria's vanguard went
      from never shootable to 6.4 s. Fortuna is the game's most-curving corridor
      at 34° of yaw, so its waves were the ones authored hardest against the old
      unrotated frame: hornet time on target 3.6 → 2.0 s, measured with
      `pacing.mjs 5256 60 fortuna`. A re-author of that wave, not a revert.
- [ ] **Ground batteries are placed a distance ahead in z, not along the rail.**
      `combat.js:752` takes `view.player.pos.z - (first + i * step)`, so on
      Aquas' 41.6° dive a battery authored 760 m ahead is 1017 m of rail ahead.
      Lateral placement already follows the corridor via `railPoint`; only the
      along-track distance does not. Phase 4 left it alone because fixing it
      moves every battery in the game and wants a pacing pass with it.
- [ ] **The Foundry does not finish under the probe, and it is not the rail
      work.** `pilot.mjs fly --seconds 115 --params level=foundry` runs to
      z -21200 with `boss=true`, `weapon LASER` and 17-19 kills. Its DNA is
      byte-identical to the commit before the quiet pass and `flight.js` is
      untouched, so nothing in that pass can reach it — measured, not assumed.
      It is the weapon-tier threshold already open below: at LASER the probe
      cannot kill a commander, and one missed `drops: ['weapon']` early decides
      it. The same commit won at 91 s with TWIN and 23 kills. **One sample each
      way; treat the spread as uncharacterised.** `pacing.mjs`.

- [ ] **Aquas' plunge and Venom's three climbs have not been looked at since
      they were steepened.** The quiet pass shortened the blends they run over,
      which takes Aquas 42° → 69° of nose-down and Venom 28-38° → 51-60°.
      Numbers are inside the documented ~75° limit and all seven levels fly, but
      no capture has been read. `shots/` before/after on aquas and venom.

- [ ] **`islands` groups silently drop `spire`.** `buildIslands` copies `flat`
      onto a group's output and nothing else, and `islandAt` never reads `spire`
      at all — so the field is inert on every group and on every `fixed` entry
      that carries it. Aquas, Fichina and Venom all set it. Either it was meant
      to shape a profile and never got wired, or it is decoration; nothing in
      the height field can tell. Found while authoring Fortuna, which stopped
      using it.

- [ ] **Fortuna's palette and lithology are unread against the level it is now.**
      Its rock terms were authored for banks and are now on trunks, and the
      albedo terms flagged below (`scrub` 1.20, `veg` 1.5, `moss` 1.4) were
      never measured. The trunks currently read as a strong green/violet marble;
      whether that is the look or an over-crank is a look pass, not a shape one.
      `shots/p9f-fortuna-*`.

- [ ] **A fixed pinnacle stands 240 m above the rail at 60 m of bank.**
      `islands.fixed` z -7480, u 60, h 300 (`dna.js`). Inside `boxX`, so the ship
      can fly into it, and there is no terrain crash — `groundAt` simply
      bulldozes it upward. Pre-existing and unchanged by phase 9: measured -259 m
      of clearance before that pass and -240 after. The comment above `fixed`
      calls the group "two pinnacles in the swim-through", which this third one
      is not in. Either it is deliberate and the comment is wrong, or it is a
      stray.

## Also open — the three new biomes (2026-08-20)

Owner asked for three more levels, new enemies and new bosses, one level per
biome (no sectors). **Everything below boots and is flyable via `?level=`; none
of it has had a balance pass and two look defects are open.**

Campaign order is now seven: Corneria → Highlands → Sector Omega → **Aquas** →
**Fortuna** → The Foundry → **Venom**. The Foundry gained a hop and is no longer
the finale; Venom is. That also makes `PLANET_FOR.foundry = 'venom'` correct
rather than a placeholder — the Foundry is in Venom orbit, so the level you dive
into is the body you were orbiting.

**What each new level is, and what is new in the engine to make it one:**

- **Aquas** — `terrain` + `surface: 'none'` + `canopy`. New module
  `world/canopy.js`: the underside of a sea surface at y = 620, drawn from
  below, answered by `ceilingAt`. It is the first open natural corridor in the
  game with a lid over it. New material `seaCeilingMaterial` (caustics, Snell's
  window, critical angle). God rays are cranked here and nowhere else.
- **Fortuna** — night, `kind: 'space'` preset with an aurora nebula. New
  `DNA.glow` drives an emissive term on the terrain itself (`GLSL_GLOW` in
  world-materials.js), because a hemisphere light with a bright ground colour
  lights everything *except* the ground.
- **Venom** — `surface: 'lava'` (new `lavaMaterial`, emissive, the key light for
  the level) and `surfaceKind: 'volcanic'` (new `GLSL_VOLCANIC`, columnar
  jointing — cellular and vertical, the one wall axis neither bedding nor
  foliation can reach). Needed `gGrooveAcross` in terrainMaterial so a
  structural groove can run across a face instead of up it.

- [ ] **Fortuna's palette still assumes a level nobody could see.** The albedo
      terms were authored against a black screen and several run past 1.0
      (`scrub` 1.20, `dry` 1.06, `pale` 1.02, with `veg` 1.5 / `moss` 1.4).
      Unmeasured — the glow now dominates enough that they may not matter, but
      the comment above them claims "almost no light from above" decides the
      look, and that was written about a level with no terrain in it.
- [ ] **No balance pass on any of the three.** Wave tables are authored against
      each level's zone boundaries and fog range (spawn distances are short in
      Aquas, long in Fortuna) but nothing has been flown or run through
      `tools/pacing.mjs`.
- [ ] **Boss durability does not scale with campaign position, so the campaign
      gets easier as it goes.** Opened 2026-08-21 off the table above. Every
      commander in `CMD_SPEC` takes `hp: COMMANDER.weakHp * 3` and every weak
      point is 46, so the level-7 finale is exactly as durable as the level-2
      boss while the player's gun has gone from 15 dps to as much as 83. Measured
      end to end: Highlands 31.0s, Venom 11.8s. The fix shape is obvious — scale
      weak-point HP with campaign position — but the amount is a design call and
      wants a real playthrough's weapon tier, not the probe's. **Why the probe's
      tiers are low, established by reading campaign.js 2026-08-16's note:**
      every level past Corneria carries `grants: []` on purpose, because weapon
      tier survives `resetForLevel` and a campaign player arrives holding what
      they built up. A `?level=` boot does not — it starts at tier 0 and only
      gets what it happens to collect from drops. So the probe understates the
      gun on every level except Corneria, and understates it *most* on the late
      levels, which is exactly where the durability question lives.
- [ ] **The three new hostile classes are unprobed.** `lancer`, `scarab` and
      `pylon` are referenced by the new wave tables and were never measured;
      the boss lane above says nothing about them. `tools/pacing.mjs`.
- [ ] **No hop has been flown into or out of a new level.** The wiring is there
      (`hop: 'orbital'` on Omega, Aquas, Fortuna and the Foundry; planet
      palettes for `aquas` and `fortuna` in fx/planet.js; `PLANET_FOR` entries in
      fx/transit.js) and none of it has been exercised.
- [ ] **Aquas has no arrival beat of its own.** Half addressed 2026-08-22: the
      re-entry no longer ends underwater — the level's rail base is 710, 90 m
      over its sea, and the plunge through the surface is the level's own
      opening rather than something the hop has to depict. What is still generic
      is the effect: it reuses `reentry`, and nothing marks the moment the ship
      crosses the surface.
## Campaign audit — 2026-08-16

One session, all four levels: every boss killed through `bossDie()`, every hop
flown in real time, `renderer.info` sampled at each arrival. What was checked and
what it answered, so none of it is re-derived:

**Clean.** Four levels boot with zero console errors. Three bosses spawn, publish
`state.bossHealth` and set `outcome='win'`: `ICE COMMANDER`
(`damperR`/`damperL`/`spine`), `VOID FLAGSHIP` (`bridge`/`ventR`/`ventL`),
`GARGANTUA` in the Foundry (8 parts). All three hops arrive on the right level —
`runin→whiteout→clear` overland, `ascent→space→approach→reentry` twice — with the
sim never paused on any sample, the terrain never visible mid-rebuild, the rail
reset, the wave tables swapped and the arrival comm fired.

Open, in the order they cost the player something:

- [ ] **Nothing stops a craft flying through a Foundry BULKHEAD.** Found while
      fixing the roof (`## Settled — the Foundry's roof`, 2026-08-18). A
      bulkhead is a wall across the corridor with a port through it, and
      `ceilingAt` deliberately answers Infinity in that bay: what is needed
      there is a *lateral* gate at one z, not a height field, and an enemy
      whose |x| exceeds the 128 m port half-width is inside the plate whatever
      its altitude. Rarer than the roof was — a 12 m wall in a 520 m bay,
      against a roof that covered two whole bays — and unmeasured. The obvious
      shape is a z-gated squeeze on the commanded offset as the bay's centre
      passes, not a fifth clamp in `think`.
- [ ] **`PLANET_FOR.foundry = 'venom'` is a placeholder.** The body you dive into
      for level 4 is Venom's palette. Cheap to author, and it is the only art in
      the sequence that is not the destination's own.
- [ ] **The Foundry's finale is the Corneria carrier.** Known when it landed. It
      is the only capital hull built, and the level that closes the game is the
      one place a reused boss is most visible.
- [ ] **Levels 2–4 have `grants: []`.** All three new bosses are fought at
      whatever tier Corneria left you on, and no difficulty pass has been run
      across the four. `?wpn=N` is the arm to measure with.
- [ ] **Stale, `game/campaign.js`:** the Sector Omega note says a battery there
      would be placed at `-Infinity`. `corneria.js:311` gives a `field` world a
      shelf at `centrelineY - FIELD_FLOOR` now, so it would float 163 m under the
      rail instead of vanishing. Still no bulwarks in Omega; different reason.

## Also open — Phase 8: legibility and the first two encounters

Not the active lane. The owner's "next three" from 2026-08-11 — crosshair, post
chain, motion blur — are all shipped; they and their reasoning are in
`## Settled`.

- [ ] **One-time jump when crossing into the soft wall / ground cushion.**
      Owner, live play (2026-08-01), after the stick-snap fix: "some middle
      threshold where there's a 1-time jump when you cross it." Not urgent —
      owner's call to leave it.
      Diagnosed but not fixed. Both new springs in `flight.js` gate their *extra
      damping* on a boolean rather than ramping it:

      ```js
      if (over === 0) return [v, vel];
      return [v, (vel - over * TUNE.wallSpring * dt) * Math.exp(-TUNE.wallDamp * dt)];
      ```

      The spring term is continuous — `over` ramps from 0 — but the damping
      multiplier switches on as a step the instant the boundary is crossed, so
      total damping jumps from `offsetDamp` to `offsetDamp + wallDamp` in one
      tick. That is a discontinuity in *acceleration*, which is felt once per
      crossing and not while held. `groundCushion` has the identical shape.
      Fix: scale the extra damping by penetration depth the same way the spring
      is, e.g. `Math.exp(-damp * dt * Math.min(1, pen / ramp))`, so both terms
      enter from zero. Cheap, but it changes wall feel, so re-measure per-tick
      acceleration (the held-stick probe pattern) and re-check the box corners.

- [ ] **A rebuild leaks shader programs, and across a full campaign it is 3.2x.**
      `material.dispose()` drops the refcount but `renderer.compile()` re-creates
      programs for the whole scene. Measured 2026-08-16, one session, four levels:
      **89 → 154 → 216 → 282**, ~64 per hop and none given back. Geometries
      (314 → 303), textures (35 → 44) and JS heap (146 → 150 MB) are all flat over
      the same run, so this is programs alone — nothing else is leaking. It is
      also the standing suspect for the ~190 ms re-entry frame below, which
      geometry upload and the program fix have both already been ruled out for.

- [ ] **The transition is still slightly jittery** (owner, 2026-08-15: "def
      better, still slightly jittery but worlds better"). Two measured causes
      left, neither chased — and a third, below, which is the worst of them:
      - **The overland hop's spike is ~2x the orbital one and had never been
        measured.** Corneria → Highlands became overland *after* the table below
        was taken, so the numbers in it are all from a hop Corneria no longer
        flies. Per-phase worst frame, 2026-08-16, `quality=low` headless at
        800x450: **`whiteout` 556 ms**, `clear` 60, `runin` 21. The orbital hops
        in the same run: `space` 347 / 92 ms, `reentry` 187 / 182 ms. Same
        `startRebuild()` dispose, landing in `whiteout` instead of `space` — and
        `whiteout` is 5.0 s of full-cover wash, so there is room to budget it.
      - **A 283 ms frame at the ascent→space boundary.** That is
        `startRebuild()`: `world.rebuild()` disposes the old terrain, water,
        materials and baked fields synchronously before returning the job queue.
        The dispose is not itself queued, so it cannot be budgeted. Nothing is on
        screen for it.
      - **A 203 ms frame in re-entry**, at the point the terrain is unhidden.
        Ruled out: shader programs (fixed above) and geometry upload (measured,
        above). Untested next suspect is the planar reflection's first render
        against the new world, which is disabled during `_warm` and so has never
        compiled its variants when the first visible frame arrives.
      - **A 1141 m single-frame camera teleport during `space`**, from
        `resetRail()` moving the rail from Corneria's `zEnd` to Fichina's 0 while
        the ship is detached. The world is hidden at that instant so it is
        probably invisible, but the ship moves 0.19 NDC on screen in one frame.
- [ ] **Homing rounds do not connect with the carrier.** `homingHit` is **2 of
      346** homing rounds fired at it — the lock-on ceremony is near-decorative
      against the one target it matters most against. Separate defect from weapon
      damage. Migrated here 2026-08-15 from `HANDOFF.md`, where it was the only
      record of it.
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
- [ ] **The frame is over budget, and it is the scene pass.** Owner reads 26-40
      fps at 1080p in real Chrome on `quality=high`, and reached for the pass
      toggles to make the game playable — this is affecting how the game feels to
      its owner, not an abstract criterion.

      Three measurements, each of which killed a candidate:

      1. **Six post passes off changed nothing** (2026-08-11): 55 fps / 18.3 ms
         with bloom, god rays, flare, motion blur, DOF and SMAA all off.
      2. **Draw count is dead** (2026-08-15). Three window sizes, draws and tris
         flat (1077/1217/1142, 1.43-1.52 M), frame time tracking pixels:
         11.0 / 21.0 / 38.6 ms. Fit is ~2.8 ms fixed + ~18 ms per megapixel, so
         the entire CPU side is **7% of a 38.6 ms frame**. Instancing and chunk
         merging cannot pay for themselves. Do not re-open without a measurement.
      3. **No single hot pass** (2026-08-15, `valley` @ `t=14`, 1600x900, median
         of 90 frames, baseline re-measured at -0.20 ms drift):

      | arm | frame | saves |
      |---|---|---|
      | baseline (shipped) | 12.9 ms | — |
      | reflection off | 11.9 | 1.00 |
      | AO off | 12.0 | 0.90 |
      | SMAA off | 12.0 | 0.90 |
      | bloom off | 12.2 | 0.70 |
      | TAA off | 12.4 | 0.50 |
      | DOF off | 12.4 | 0.50 |
      | **all post off** | **8.8** | **4.10** |
      | all post off + reflection off | 8.4 | 4.50 |

      Post is death by a thousand cuts — six passes at 0.5-1.0 ms, none worth
      killing alone. **The bare scene pass is 8.4 of 12.9 ms, 65% of the frame.**
      That is the terrain and water materials.

      So there are two real options, and no third: cut per-pixel cost in those
      shaders (triplanar is 3 samples where 1 often does; the lithology blend and
      the horizon lookup both run per fragment), or render the scene at reduced
      resolution and upscale.

      **Correction, 2026-08-15: the "3x faster headless" claim below was wrong,
      and it hid the DPR finding for a whole session.** Playwright runs at
      `devicePixelRatio` 1, so headless `high` is DPR 1.25 → 3.24 MP, while the
      owner's real Chrome is DPR 2.5 → 12.96 MP at the same window size. That is
      a **4x pixel-count difference, not a renderer-backend difference**, and the
      two sets of numbers were never taken at the same resolution. The *splits*
      in the table above are still valid; the milliseconds are not comparable
      across the two. Never compare a headless absolute to a real-Chrome one.
      Every measurement here varied passes, window size and draw count — the one
      quantity nobody varied was the device pixel ratio. See `PLAN-PERF.md`
      Phase A.

      Two traps, each of which cost a run:
      - **A/B by flying is unreadable.** Frame time swings 25-34 ms on scene
        content alone, a bigger effect than the setting under test. Fix the
        `shot` and the `t`.
      - **Never call `env.apply()` between arms.** It bakes a PMREM whose spike
        outlives the settle window, and `engine.avgFrameMs` is an EMA that carries
        it. A first pass did this and reported every disabled pass as *costing*
        time. Re-enable passes directly and time frames locally.

- [ ] **Shoreline.** The beach/water boundary is still a hard geometric line
      with no foam, and the sand is a flat untextured wedge
      (`shots/refl1/w-shore.png`, mid-left; `shots/refl1/combat-wide.png`).
- [ ] **The whole level sits under the exposure band, not just `w-shore`.** The
      old note asked whether other shadowed-gorge angles did the same. Measured
      (`hist.mjs`, quality high, composited median): **they all do, and so does
      everything else** — chase 0.045, valley 0.032, water 0.059, w-shore 0.079,
      sun 0.116, against a 0.10–0.20 target. Only `sun` is near the band. So this
      is not a per-shot defect and not a `w-shore` defect; it is one global grade
      offset, and it wants a single lift (exposure/trim/toe) rather than per-camera
      fixes. `p90`, `clippedPct` and `blackPct` are all healthy, so there is
      headroom to lift into.
      Left alone this session on purpose: the owner's brief was to *calm* the
      image, and lifting exposure in the same pass would have fought that and made
      both changes unmeasurable. Do it as its own pass, with the dev knobs.

## Later — Phase 10: progression

The pre-boss weapon grant and the drop system are both done (see `## Settled`).
What is left here is scoring.

- [ ] Score/rank at level end (medals, hit %, time).

## Later — Phase 11: finish

- [ ] The back half of the level (`z < -3000`) raised from roughed-in to shipped.
- [ ] Difficulty pass end to end.
- [ ] Touch controls / mobile.

## Settled — done, and why it is the way it is

**Compressed 2026-08-22** from 842 lines to what a fresh agent needs: the
decision and anything still load-bearing. The full write-ups, with their
measurements and rejected alternatives, are in git before `732f9d7`.

### Levels and worlds — 2026-08-15

**Variety does not live in the terrain generator.** Three rounds each produced a
large diff and a minimal visible difference: the generator has one composition
in it and every parameter scales that composition. What changed the picture was
giving a level the option not to use it — a second and third backend
(`field`, `works`). That conclusion is what `PLAN-LEVELS.md` was opened to
finish, by making the cross-section itself authorable.

### The Foundry — a third backend, 2026-08-15

`backend: 'works'` (`src/world/works.js`): a corridor through something that was
built — deck, plated walls, ribs, lit window strips, and roofs overhead for
stretches. The level is a sequence of *bays* on a fixed repeating pattern
(open, open, span, open, enclosed, span, open, bulkhead) rather than a random
walk, because the point is rhythm. **Still the only thing in the game that takes
the sky away completely**, and the shape phase 9's Foundry pass has to make vary
along z — today `half`, `deckY` and `roofY` are fixed and `Works.deckY()` is a
static with no z.

### The Foundry's roof — 2026-08-18

Enemies flew through it: 18.3% of foe samples in an enclosed bay were above the
roof line, worst 156 m through solid plate. `underRoof` in `ai.js` clamps them
now. The player never reached it — the offset box tops out 25.9 m below the lid.

### Bosses — every level can be finished, 2026-08-15

Before this, `bossDie()` was the only thing setting `state.outcome = 'win'` and
Corneria's carrier was the only `boss:` wave, so levels 2 and 3 could be flown
but not completed. Every level now has one and the campaign advances.

### The victory lap, and the wing's pass across it — 2026-08-18

Owner: "boss dies and it like immediately starts transitioning, kind of abrupt."
The lap had **no floor** — it ended on `railZ <= WORLD.zEnd`, and every boss is
armed close enough to the end of its corridor that a normal fight finishes with
the rail already past it, so the kill, the win card and the ascent all landed on
the same beat. `LAP_MIN` is 7 s, picked off the two things it has to cover: a
capital ship comes apart over four, and the wing's victory pass runs about seven.
`LAP_MAX` 14 s is for the opposite case, a dev-tool kill with kilometres left.

### The wing across a hop, and the wobble on station — 2026-08-18

Owner: "my wingmen seem to wiggle a lot […] then right before the transition they
seem to dive straight down into the water." Three defects, two of which predated
the victory pass — the wing sat 180–300 m under the rail and 9.7 km behind at
`whiteout`. Wingmen now hold a `homeSlot` through the hop.

### Drops — 2026-08-16

`pickups.js`, the wave-table `drops:` key, `collectPickup`, `PickupToast`.
**The rule the whole system is built on: a drop cannot be missed.** It pops out,
flies to the player, and is collected — reachability is not left to the player's
line.

### Level cards and the dev level jump — 2026-08-18

Every level opens on its own name: a plated card top-right under the score,
sliding in from the right margin and gone in 4.45 s. Owner picked the placement
and treatment from four options.

### Skip-to-boss stopped charging the run — 2026-08-18

The dev panel's skip cost two of three lives on Corneria, Sector Omega and the
Foundry. It no longer charges the run.

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
   total: **0 lines in `src/world/`**, swept 2026-08-15 when the level lane
   closed. `rockPropMaterial` gained a real consumer (Sector Omega's belt);
   `cityMaterial`, `concreteMaterial`, `steelMaterial`, `foliageMaterial`,
   `concreteSet` and `shoreU` were deleted rather than kept against a phase that
   no longer exists.
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
3. **Weapon upgrades → auto-grant before the boss.** No pickup entity, no drops,
   no level-wide HP rebalance. Weapon tiers granted as the reward for reaching
   the boss, which fixes the DPS slog without new systems. The full drop system
   is explicitly *not* being built.
   **Revised 2026-08-11 (owner): three grants, not one.** "The game is hard, the
   guns are weak — 2-3 automatic weapon upgrades right before the boss." Shipped
   as three, taking the gun to 5.6× its starting dps. Built and measured; awaiting
   the owner's hands-on pass.
   **Reversed 2026-08-16 (owner): build the drops.** "Weapon drops should be
   visible to the player like a floaty flying towards them (no penalty, it floats
   to the user so they can't miss it) — bomb drops, weapon drops, health drops —
   all drop from certain kills so the player is better equipped for the boss
   fight." Shipped; see `## Settled — drops`. The grants stayed as the floor.
   **The drops make the game easier and are meant to. Owner, same day: "you are
   WAY better than me at this game, so don't tune up any difficulty."** Nothing
   was buffed to compensate and nothing should be.

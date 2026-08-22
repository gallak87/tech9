# Vulpine — roadmap

**Status:** playable end-to-end, alpha. Phases 0–7 done, plus the drop system
(2026-08-16 — `## Settled — drops`) and level cards (2026-08-18). Phase 8 (encounter feel
+ legibility) still open but **no longer the active lane**. **Seven levels, three
backends**; the original four are finishable and measured (2026-08-16,
`## Campaign audit`), the three added 2026-08-20 boot and fly but are unbalanced
and unverified — see `## Now`. Branch `g/fox64`, which `g/fox64-dna` merged into.

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
multiple levels". The owner asked for up to three more levels with a seamless
transition between them, and Corneria -> Fichina landed the same day. The target
is now a short campaign: four planets, one hop between each. Sector Omega
(asteroid belt, no terrain) and Venom (lava + fortress trench) are not built.

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

## Found while auditing, not this lane's work (2026-08-21)

- [x] **`tools/fins.mjs --audit` had been checking nothing.** It built a
      `Terrain` and traversed it immediately, but the constructor only queues
      jobs — the meshes do not exist until the queue drains — and it never
      called `setActiveDNA`, so `WORLD` was zeroed and the tiers sized to
      nothing. It reported "0 meshes, 0 triangles" and exited green. Fixed
      2026-08-21: it now unpacks a DNA, drains the queue, and runs every
      terrain-backend level rather than only the default.
- [ ] **Fortuna has 25 truly-reversed terrain triangles**, out of 759,280.
      Measured 2026-08-21 the first time the audit ran for real, and present at
      `1ea5288` before the cross-section work, so it is not from that lane.
      Aquas has 2-3 and Venom 2; Corneria and the Highlands have none. Worst
      facet-vs-shading agreement is -0.948 at `terrain-37-lod1 tri 2797 col 22`.
      The winding is a function of column order, so the suspect is the far-tier
      column list at a bank where Fortuna's profile is unusually flat.

## Now — the level-identity lane (2026-08-21)

**This is the active lane. `PLAN-LEVELS.md` is its plan; it is not restated
here.**

Owner: "they all essentially look like Corneria with filters/textures." It was
geometry, not shading — the five levels in question were exactly the five on
`backend: 'terrain'`, and inside that backend the cross-section folded about
`Math.abs(u)` and rose monotonically away from the rail, so every one of them
was the same valley at a different scale.

Phases 1 and 2 have landed and had their quality pass: the cross-section is an
authored polyline, a zone can carry its own `section`, and Venom opens on an
inverted ridge. Phases 3-6 are open — per-zone ceilings, the rail as an
arc-length path, the vertical drama, and Venom's orbit arena.

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

- [x] **Venom's molten channel is invisible from the chase camera, and the cause
      is authoring, not code.** Fixed 2026-08-21 in `world/dna.js`: `bed` 22-34
      across Venom's seven zones, 14-24 across Fortuna's. The channel now reads
      full-width from `chase`, `valley` and `water` and is the level's key light
      (`shots/n-venom3/sheet.png`, before/after). Diagnosis, kept because it is
      the reason the numbers are what they are: measured 2026-08-20, the surface mesh is built,
      visible, carries `lavaMaterial`, and sits at y = 0; the terrain under it
      raycasts to -9.0. Swapping it for flat magenta shows nothing at y = 0, a
      narrow strip at y = +3 and the full channel at y = +40. So it is not
      occlusion by height — it is **grazing-angle self-occlusion**: the zones
      inherited `ZONE_KINDS`' default `bed` of 8-11, and a 9 m trough 410 m wide
      seen from a camera 73 m up is edge-on, so the near bank hides the floor.
      Corneria runs `bed` 15-32 for exactly this reason.
      Nothing else about the lava material is in question.
- [x] **Fortuna's terrain material never compiled, so the level had no terrain
      at all.** Found 2026-08-21 while capturing the `bed` fix. `GLSL_GLOW` in
      `world-materials.js` declared `float patch` — `patch` is a reserved word
      in GLSL ES, so the whole fragment shader failed `VALIDATE_STATUS` and
      every Fortuna terrain chunk drew nothing. Renamed to `colony`. Every
      Fortuna capture taken before this date shows a level with no landmass,
      including `shots/n-fortuna3/`; none of them are evidence about anything.
      **`shot.mjs` was reporting this as a console error the whole time** — the
      captures were being read and the non-zero exit was not.
- [x] **Fortuna's terrain composited near-white once it drew.** Fixed
      2026-08-21. It was neither albedo nor the light rig — measured by zeroing
      sun, hemi, fill, rim, `scene.environment` and every `envMapIntensity` in
      the scene, after which the valley median held at 0.501, so the terrain was
      *entirely* emissive. `terrainMaterial` sets `emissive: 0xffffff` to make
      three declare the emissive chunk that `GLSL_GLOW` injects into, and
      `totalEmissiveRadiance` starts at that colour — a flat 1.0 on every
      terrain pixel, which is why the wash was colourless and lightless. Now
      `emissiveIntensity: 0` alongside it: the declaration is unchanged and the
      starting radiance is zero. Valley median 0.501 → 0.016, and p99 pulled
      away from p90 (0.67 vs 0.04) where before the two sat together, which is
      the glow's structure appearing. `shots/n-fortuna5/`.
- [x] **Fortuna's glow tiles visibly.** Fixed 2026-08-21 — `GLSL_COLONY`
      displaces the mask lookup by a 340 m warp field instead of taking it
      straight off the 65 m tile. `shots/n-fortuna6/`. Opened 2026-08-21. The banks carry a
      regular grid of identical crescents at the rock texture's repeat period,
      worst at grazing angles (`shots/n-fortuna5/valley.png`). `GLSL_GLOW`
      builds both masks from tiled texture channels — `colony` from `crs.g`,
      `speck` from `gTri.b` — and puts them through high-contrast smoothsteps.
      Every other block that samples those channels modulates *albedo*, where
      varying light hides the repeat; an emissive term has nothing to hide
      behind. The file's own rule at the top applies: hue comes from world
      position, not from the map. Drive the colony mask the same way.
- [x] **Fortuna had no readable mid-band.** Fixed 2026-08-21. The 0.10-0.20
      band in HANDOFF is stated for *daylight* and does not apply here; the
      reference used instead was the Foundry, the shipped level closest in
      character — chase 0.038/0.27/1.39, valley 0.021/0.14/0.90 (med/p90/p99).
      Fortuna measured 0.017/0.04/0.67 and 0.014/0.04/0.22: the median was
      defensible for a night level, the **p90 was 7x low**, so the frame ran
      from near-black straight to a few emitters with no body in between.
      Not fixable from the light rig, and this was measured before touching it:
      zeroing sun/hemi/fill/rim moved the chase median 0.017 → 0.014, and
      *raising* hemi from 2.25 to 6.0 got 0.018. Terrain faces up and takes
      `hemiSky`, which is near-black by design — the reason `DNA.glow` exists.
      So the lever was the glow: `wash` 0.26 → 0.62 (it is the mat that gives
      the mid-band; `hot` is the sparse specks and already reached p99) and
      `glow.amount` 1.05 → 3.6. Now 0.026/0.16/0.71 and 0.041/0.17/0.71, clip%
      unchanged at 0.07-0.11. Coverage was then pulled from smoothstep(0.34)
      to (0.42) because at 0.34 the mat covered the banks wall to wall and the
      DNA asks for the dark base to stay most of the wall by area.
      `shots/n-fortuna7/sheet.png` is the coverage pair.
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
- [x] **The three new bosses are flyable and winnable.** All three probed
      2026-08-21 with `tools/bossprobe.mjs`; every one reaches `outcome=win`
      with all three weak points destroyed, so the "bloom runs 4x long" defect
      the ship lane stopped on is closed — the maw-reach fix landed. Against
      `commander:ice` on Highlands as the shipped reference:

      | boss | level | fight | dps | dps x s |
      |---|---|---|---|---|
      | ice (reference) | Highlands, 2 | 31.0s | 15 | 465 |
      | tide | Aquas, 4 | 21.5s | 15 | 322 |
      | bloom | Fortuna, 5 | 10.5s | 30 | 315 |
      | forge | Venom, 7 | 11.8s | 30 | 354 |

      Normalised for the gun the probe happened to be carrying they sit in a
      315-465 band, so none of the three is individually broken. What varies is
      time-on-target, not durability: ice's second damper survived to 31s
      because the player could not get on it, where bloom's three parts died at
      4.3 / 6.8 / 10.5 in a clean progression.
      **Probe `?level=` ids are the campaign ids, not the DNA ids** — `highlands`,
      not `fichina`. `level=fichina` does not error, it silently serves Corneria,
      which is how a run against the wrong boss reads as a plausible result.
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
- [x] **Homing never hitting a commander was the counter, not the homing.**
      Closed 2026-08-21. It reproduced against `commander:ice` too — 72 fired,
      0 hit — which ruled out the new levels, and then the source settled it:
      `diag.homingHit++` sat only inside the loop over `foes`, and the boss is
      a separate branch that increments `bossLand` and nothing else. Counted in
      both places now; ice reads 70 of 72. Nothing about homing was wrong.
      One more for the traps list: three outcome counters reading exactly zero
      for 72 rounds is a broken counter, not a broken system.
- [ ] **The three new hostile classes are unprobed.** `lancer`, `scarab` and
      `pylon` are referenced by the new wave tables and were never measured;
      the boss lane above says nothing about them. `tools/pacing.mjs`.
- [ ] **No hop has been flown into or out of a new level.** The wiring is there
      (`hop: 'orbital'` on Omega, Aquas, Fortuna and the Foundry; planet
      palettes for `aquas` and `fortuna` in fx/planet.js; `PLANET_FOR` entries in
      fx/transit.js) and none of it has been exercised.
- [ ] **Aquas has no arrival beat of its own.** An orbital re-entry that ends
      300 m underwater wants a plunge, not a wash. Currently it reuses `reentry`.
- [ ] **Leaving Aquas climbs 2200 m out of a level with a lid on it.** Found by
      reading, not flying, 2026-08-21. `HOPS.orbital.climb` is 2200 and it is
      unconditional; Aquas is the one level with a `canopy` — a sea surface at
      y = 620 answered by `ceilingAt` — so the ascent takes the ship straight
      through it. Whether that reads as breaching or as clipping through a
      ceiling nobody has looked at. It is the same beat as the arrival item
      above and wants solving with it: a level you plunge into is a level you
      breach out of, and `climb` being a flat number per hop *kind* is what
      makes both of them awkward.

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

- [x] **A planet limb rose out of the belt when you left Sector Omega. Fixed
      2026-08-16.** `fx/transit.js` had `destBody` and no matching `originBody`,
      so `driveAscent` ramped the origin body in from t=0.50 unconditionally at
      1.25 rad angular radius, direction `[0.10, -0.95, 0.28]` — straight down,
      which is exactly where the belt is, and `PLANET_FOR.space = 'venom'`, so it
      was brown. `originBody` now gates every non-zero `origin.setOpacity`, and
      `campaign.js:begin()` derives it from `level().dna` by the same test that
      already gave `destBody` from `to.dna`. Max origin opacity per phase,
      measured: highlands → omega `ascent`/`space`/`approach` 1.00 (unchanged),
      omega → foundry 0.00 in all four. The banner is picked the same way —
      `HOPS.orbital.vacuumLabel` reads DEPARTING SECTOR over a departure from a
      world with no atmosphere to leave.
      **The re-entry cloud deck into the Foundry was checked and deliberately
      left alone.** `driveReentry` drives the deck from `camera.y + 2600` to
      `camera.y - 900`, so it is above the camera only while t < 0.80, where the
      wash is still at heat ≥ 0.45 and covers the frame; from t = 0.80 it is
      below the camera and the shader's ray-plane test drops it, and it stays
      ~900 m under a deck the ship flies at ~50 m. Filmed at t = 0.45 / 0.62 /
      0.72 / 0.76 / 0.83 / 0.92 / 0.99 and 0.6 s and 2.0 s after arrival: no
      deck in any frame. Gating it would change no pixel.
- [x] **The final win card named the wrong planet. Fixed 2026-08-16.**
      `ui/outcome.js` hardcoded `'CORNERIA IS SAFE'`, which stood over the last
      level's card and over every mid-campaign victory lap. It reads
      `s.campaign?.level?.name` now — the same guarded reach `ui/index.js`
      already uses for `campaign.hud` — and falls back to CORNERIA when no
      campaign is installed. The Foundry's card reads THE FOUNDRY IS SAFE.
- [x] **Perf.** `QUALITY.pixelRatio` multiplied the device ratio instead of
      capping it, so `high` rendered at DPR 2.5 — 6.25x the pixels on a
      fill-bound frame. Split into a clamped device DPR and a separate
      `renderScale`, tiers retuned, one quality dial on the dev panel. Owner
      picked 0.95: **49 fps / 20.4 ms**, from 26–40. Still 3.8 ms over ship
      criterion 3 — A5 is the next lever, in `PLAN-PERF.md`.

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

- [x] **The commander is wired as a boss. Done 2026-08-15** in `7de4842`, and
      re-verified end to end 2026-08-16 — see `## Campaign audit`. Both
      commanders route through `spawnBoss`, publish the health bar and end the
      mission. The box was left unticked by the commit that closed it.

- [ ] **A rebuild leaks shader programs, and across a full campaign it is 3.2x.**
      `material.dispose()` drops the refcount but `renderer.compile()` re-creates
      programs for the whole scene. Measured 2026-08-16, one session, four levels:
      **89 → 154 → 216 → 282**, ~64 per hop and none given back. Geometries
      (314 → 303), textures (35 → 44) and JS heap (146 → 150 MB) are all flat over
      the same run, so this is programs alone — nothing else is leaking. It is
      also the standing suspect for the ~190 ms re-entry frame below, which
      geometry upload and the program fix have both already been ruled out for.

- [x] **The transition froze for 3.7 s on arrival. Fixed 2026-08-15.** The old
      note here said the rebuild's last job was "a 279 ms single-frame spike
      deliberately parked under the approach phase" — that was wrong twice over.
      `renderer.compile` walks `traverseVisible`, and `startRebuild()` hides the
      world *before* queueing the jobs, so `_warm()` compiled **nothing**; the
      whole cost then landed on the first frame that actually drew the terrain,
      inside re-entry. `_warm` unhides the root across its own call now.
      Measured with the new `pilot.mjs hopjolt`, worst frame per phase:

      | phase | before | after |
      |---|---|---|
      | ascent | 281 ms | **16 ms** |
      | space | 283 ms | 283 ms |
      | approach | 22 ms | 12 ms |
      | **re-entry** | **3702 ms** | **203 ms** |

      Also rejected, with a measurement: rendering the scene into a 1×1 target in
      `_warm` to pre-upload vertex buffers and the shadow map. Cost ~800 ms in
      `space` and moved re-entry 203 → 198 ms. Whatever re-entry still pays is
      not geometry upload.

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

### The wing across a hop, and the wobble on station — 2026-08-18

Owner, live play: "my wingmen seem to wiggle a lot when they go out in front of
me — then right before the transition they seem to dive straight down into the
water." Three separate defects, and **two of them predate the victory pass** —
confirmed by running the same probe against a worktree at `d6ea9cf`, which shows
the wing 180–300 m under the rail and 9.7 km behind at `whiteout`.

- **The wobble was a floor on the approach term.** `thinkWingman` scaled its seek
  by `clamp(dist / 45, 0.2, 1)`, so a craft sitting *on* its station still
  commanded 0.2 × 260 m/s toward it, in whatever direction that tick's metre or
  two of wander happened to point. Against the player's 175 m/s that is
  atan(52/175) = 16° of heading, re-aimed every frame, and `flyStep` banks into
  all of it. Measured holding the victory vee: 5–18° of heading change per
  0.25 s. At a floor of zero the desired velocity decays to the player's own and
  a wingman on station flies straight — **0–2°** now. The ±9 m sine the pass had
  been adding on top is gone too.
- **The dive at the transition was a 180° reversal with no defined axis.** The
  pass ends 115 m *ahead* of a slot 46–92 m *behind*, and `campaign.begin()`
  clearing `outcome` switched the state under it — `flyStep` then had a target
  dead astern, where `fwd` and the desired direction are antiparallel and the
  cross product that picks the turn axis collapses. All three pitched to
  fwdY -0.86 at the full 1.5 rad/s and levelled out 270 m under the rail. The
  `lap` state eases back to the slot and ends itself now; nothing cancels it from
  outside, and `lapDone` latches it shut (without that it re-armed on the next
  tick and looped for as long as the win card was up).
- **Off-world the wing is placed, not flown.** A hop parks the rail
  (`flight.detached`, `flight.js:277`), so the player is a *stationary point* for
  the length of it — and a wingman cannot hold station on one: `flyStep` floors
  speed at 0.12 of max and caps turn at 1.5 rad/s, so a craft arriving at
  260 m/s has a 173 m turn radius and can only orbit. Measured: a ±250 m arc for
  the whole transition. `startRebuild` then teleports the player ~9.5 km back up
  the corridor with `resetRail`, and a flown formation is simply left there —
  9.7 km back through the hop, still 7 km back on arrival, so **the first
  half-minute of every level after the first was flown alone.** Both go away by
  not simulating a formation with nothing to fly around: `dz` holds at exactly
  46/54/92 across the hop and the handoff into `form` on arrival needs no snap.

Tried and rejected: deriving `view.player.vel` from the ship's own frame delta
while detached. It is more truthful, and it does not fix the orbit — the orbit is
the speed floor, not the velocity — and it makes the foes still alive through
`runin` orbit the player instead of flying away.

### Skip-to-boss stopped charging the run — 2026-08-18

Owner: "why does skipping to boss on levels 2/3 take 1 life? i got game over
skipping on foundry." Measured, it was worse than that — the dev panel's skip
cost **two of three lives on Corneria, Sector Omega and the Foundry**, one on
Highlands, and left the Foundry's run on 51 shield.

`skipToBoss` replays rather than teleports, on purpose: waves arm on `railZ`
crossings, so jumping the rail dumps every backlogged wave into one tick. But
the replay runs with nobody at the controls — the ship never dodges and never
returns fire, so the whole flight down is free target practice for every wave in
the level. Nothing was wrong with the seek; it was simply never anyone's job to
say the player should not be billed for it.

`combat.setInvuln(s)` drives the same counter the respawn window already uses,
and the panel holds it across the seek and clears it in `finally` so a throw
cannot leave the game in god mode. All four levels now arrive at their boss on
full shield and three lives.

### The victory lap, and the wing's pass across it — 2026-08-18

Owner, live play: "boss dies and it like immediately starts transitioning, kind
of abrupt." It did, and the lap that was supposed to cover it had **no floor**.
`campaign.js` ended the lap on `railZ <= WORLD.zEnd`, and every boss in the game
is armed close enough to the end of its corridor that a fight of normal length
finishes with the rail already past it — Corneria's carrier arms at z -8300
against a zEnd of -9840, 8.8 s of rail for a fight that takes about 45 s. The
test was therefore true on the tick the boss died and the hop opened on the next
one: the kill, the win card and the ascent all landed on the same beat.

`LAP_MIN = 6` seconds, picked off the death itself — a capital ship comes apart
over four (`updateBoss`) — so the lap now covers the break-up and still leaves a
couple of seconds of clean flying. `LAP_MAX` is untouched and answers the
opposite case.

**The wing flies a victory pass across it.** A `lap` state in `thinkWingman`:
each pilot holds station, breaks on a staggered `lapWait`, sweeps out and
forward across the player's nose with one roll, and settles into a vee ahead —
two wide and one high. Driven off `state.outcome === 'win'` rather than off the
campaign, so it also plays on the Foundry, which has no hop after it and where
this is the last thing on screen.

**Every number in it came from measuring ndc, not from looking at stills.** The
beat is staged behind a chase camera and the wing starts *behind* the player, so
lateral distance early is lateral distance off camera — the first attempt swung
the slots to 2.4x and both wingmen sat past ndcX 2, off frame for the entire
pass and only visible once they were 150 m ahead with nothing left to watch. The
second attempt put a near-centreline pilot on a lateral floor and it landed on
the side another pilot already owned. Settled: 0.85x–1.25x the slot, a
near-centreline pilot lifted instead of pushed, and ~115 m ahead rather than
320 — at 320 an Arwing is 25 px of a 1200-wide frame. All three now hold
on-screen at ndc (-0.7, 0.03), (0.21, 0.02), (-0.28, 0.51).

The residual lateral bias in those numbers is the rail meander, not the tuning:
the wing stations in the *player's* frame while the camera aims down the rail,
so a corridor that is turning slides all three the same way. `combat.js` gained
an `allies` getter for the same reason it already exposes `foes` and `bullets` —
whether three ships leave formation, cross and roll is a question about position
over time.

### Level cards and the dev level jump — 2026-08-18

Every level opens on its own name now: a plated card top-right under the score,
`SECTOR IV` over `THE FOUNDRY`, sliding in from the right margin and gone in
4.45 s. Owner picked the placement and the treatment; the alternatives offered
were upper-left, a full-width band, and type-only or bracketed instead of
plated.

**It is not a screen and it stops nothing** — the sim runs, the stick is live
and the first wave is already closing. That is the whole difference between
`ui/levelcard.js` and `ui/menu.js`'s title card, which draws over a frozen sim.

Two decisions worth keeping:

- **The window is in sim time and is opened at t = 0, not on the first tick of
  `campaign.update`.** Both look identical in play, because sim time is frozen
  under the title card. Only the first survives the harness: `seekTo` drives
  `step()` directly and never calls `update`, so a card keyed to the first tick
  is raised at whatever time the seek landed on and then sits over every
  `--hud` capture. Same `until` idiom as `message` and `pickup`.
- **`campaign.js` publishes seconds, not phases.** The fade/hold/fade split
  lives in `ui/levelcard.js`, because the UI seam runs one way — game writes
  `ctx.state`, ui/ reads it — and importing the drawn timing back across it was
  the first thing tried and the wrong thing.

The dev panel gained a `level` row: one button per level, the live one marked
and disabled. It **reloads** with `?level=<id>`, for the same reason the pause
menu's RESTART reloads — arriving at a level moves the world, the wave tables,
the rail, the env preset, the enemy materials and the campaign index together,
and `?level=` is the one path that already does all of it. `Skip level` is not
redundant with it: that one flies the hop, which is the only way to watch a
transition. A row rather than numbered tools, because `tag`/`code` are the
`TOOLS` index and four more entries there would renumber every shortcut.

### Drops — 2026-08-16

`src/game/pickups.js` (bodies + flight), `combat.js` (`## drops`, the wave-table
`drops:` key, `collectPickup`), `ui/status.js` (`PickupToast`), `ui/radar.js`,
`core/audio.js` (`pickup`, `pickupDrop`), `fx/index.js` (`tracer` takes a colour).

**The rule the whole system is built on: a drop cannot be missed.** It pops out
of the wreck on a short ballistic arc so the kill is visibly the source, then
flies to the player and never expires. There is no collection skill and no
penalty for ignoring it — the skill was killing the thing that dropped it.
Three consequences, all load-bearing, all easy to break by "tidying":

- `seekOver` is added to the player's **live** speed, not to a constant, so a
  boosting player cannot outrun a drop.
- Nothing decrements a lifetime. The only exits are collection and a level reset.
- The steering rate rises as the range collapses (same construction as the
  homing rounds): a fixed turn rate has a fixed turn radius, and a body 20 m
  off-axis with 20 m to run cannot correct.

`tools/pilot.mjs drops` is the regression test for that rule — seven geometries
(two of them starting *behind* the player) × cruise and boost. **14/14 arrive,
1.2–3.1 s**, and the one 6.1 s outlier is a drop correctly holding station
through a death and respawn.

**Which kills drop.** A wave row carries `drops: ['weapon', 'health']`;
`dropSlot` spreads them across the craft in the wave rather than putting them on
the leader, and the carrier wears a halo in its drop's colour, on the hull and
on the radar. Never on a wasp swarm's arbitrary member — a reward for a
reflexive kill is a reward for the fight going your way. All four levels are
authored, including weapon drops in levels 2–4: the tier survives
`resetForLevel`, but `?level=highlands` boots at tier 0 with no `grants` row, so
without them the later levels were only completable from level 1.

**What it did to the level.** `pilot.mjs fly`, same autopilot, before → after:
shield low-water **0 → 50**, lives **2 → 3** (no deaths), score **4270 → 6310**,
and it now kills the carrier and reaches level 2 inside 85 s instead of still
grinding the boss at 72 s. That is the intended direction — see owner decision 3.

**The three weapon tiers moved from act 4 to act 2.** Both gunboat waves and the
dropship carry one, so a player who fights the middle of the level arrives at the
carrier fully armed 2.1 km early. The pre-boss grants are now the floor rather
than the only path, and at the top tier a grant pays out a bomb instead of
silently doing nothing — which is reachable in normal play now, and was the one
way the HUD could lie about a reward.

### The Foundry's roof — 2026-08-18

Owner, live play: the Foundry "has ceilings which looks like enemies go
through". They did. Measured over 60 s of the level with `?fight=1`: **18.3% of
foe samples in an enclosed bay and 5.9% in a spanned one were above the roof
line, the worst 156 m through solid plate.** The player never gets near it — the
offset box tops out at 133 and a measured run peaked at 67, against a roof at
164 — so this was always going to be an AI constraint rather than a headroom
one. Raising the roof was the other option on the table and is the wrong one:
enclosure is the axis this backend exists for, and a roof placed above where
fighters fly stops reading as a roof.

`Works.ceilingAt(z)` and `Corneria.ceilingAt(x, z)` are the mirror of `deckY`
and `groundAt` — Infinity for `terrain` and `field`, which cannot put geometry
over the rail at all — and `combat.js` carries it into the world view `ai.js`
already gets `groundAt` from. A SPAN answers a ceiling despite the sky between
its ribs: gaps are 118 m and ribs 26 m, so a craft ignoring the bay clears four
gaps and hits the fifth.

**Both halves of the clamp are load-bearing, and the first one alone measured
zero.** Capping the commanded point changed nothing at all — 18.3% before,
18.2% after — because a craft that has lagged its station in z pitches up and
loops back to recover it, and that arc leaves the commanded point far below.
Traced: a raptor commanded to y = 71 flew to y = 156 with its nose at fwd.y =
0.97. `roofStop` caps the flown position after `flyStep` and eases the nose
level over ~0.4 s rather than snapping it. **0.0% in both bay kinds now**, max
hull-past-plate 0 m, and nothing skims: 10.2 craft-seconds of contact across
60 s, half of it in `exit`.

Wingmen get the same treatment through `thinkWingman`. `pilot fly` finishes the
Foundry at 20 kills with no console errors, and Corneria and the drop lane are
byte-for-byte unaffected — every non-`works` world answers Infinity.

### The Foundry — a third backend, 2026-08-15

Level 4, and the first world in the game that is not natural rock.
`backend: 'works'` (`src/world/works.js`): a corridor through something that was
built — deck, plated walls, ribs, lit window strips, and roofs and gantries
overhead for stretches at a time. The level is a sequence of *bays* on a fixed
repeating pattern (open, open, span, open, enclosed, span, open, bulkhead)
rather than a random walk over four kinds, for the same reason Corneria's keys
beat Fichina's: a pattern is rhythm, a random walk is mush.

**Enclosure is the axis this exists for.** `terrain` is single-valued so it can
never put anything above the rail; `field` gets bodies overhead but always leaves
sky between them. A closed span is the only thing in the game that takes the sky
away completely, and open → enclosed → open is a change no re-authoring of a
canyon can produce.

It also proved the backend split generalises rather than having been shaped
around the belt: the third backend needed no changes in flight, combat, ai,
camera, HUD or campaign either. `groundAt` is the deck — a real floor here,
unlike the belt — so the ground cushion, the AI's altitude clamps and ground
batteries all behave normally with nothing special-cased.

Two things worth keeping:

- **Inside a box the IBL is doing nothing.** The environment map is a starfield,
  which is black, so `envIntensity` contributes almost nothing and hemisphere
  and fill have to carry the whole frame. First lit pass measured **40–52% of
  the frame crushed to pure black**; the fix was a `foundry` preset whose
  hemisphere is *inverted* against every other one here — `hemiGround` bright
  and `hemiSky` nearly black, because in a roofed bay the deck is the only
  source with any area — plus deck lamps in every bay rather than only the
  roofed ones. 3–17% now, and the medians sit inside the range Corneria and
  Highlands already occupy.
- `concreteMaterial`, `steelMaterial` and `cityMaterial` were restored from
  `cfe175c^` for this — deleted earlier the same day as dead code against a
  phase that no longer existed, and they turned out to be exactly right for a
  built world. `foliageMaterial` stayed deleted: nothing grows here.

Known thin: `w4-wide` shows the structure has no exterior — from outside it is
an open-topped trough in space. A bespoke boss is the other gap; the finale
reuses the Gargantua because it is the only capital hull built.

### Bosses — every level can be finished, 2026-08-15

Before this, `bossDie()` was the only thing that set `state.outcome = 'win'` and
the only `boss: true` wave in the game was Corneria's. Levels 2 and 3 could be
flown but not completed, so the transitions out of them were reachable only from
the dev panel and the campaign could not advance past level 1.

Both commanders were **already finished** in `ships/enemies.js` — three weak
points each, `partPoint`/`hitPart`/`killPart`, a `progress` getter documented as
"what the boss bar should show", and a `station` block authored in `TUNE.boss`'s
own field names. Nothing referenced any of it: `combat.js` and `ai.js` contained
zero mentions of `commander`, so they spawned through the ordinary enemy path and
their weak points, turrets and destructible state were decoration. Wiring, not
new systems.

`spawnBoss(kind)` now dispatches on a `BOSS_KINDS` table and every carrier-only
call is asked for rather than assumed (`killNacelle`, `killTurret`, `setShutter`,
`setHangar`, `hasBeam`, `turretCount`). Two defects found by measuring rather
than by looking:

- **Armour shadowed the objective.** `bossHit` took the *nearest* part, and a
  commander's hull is one 9.75 m sphere at the rig centre, so every weak point
  mounted behind that centre was unhittable from the front at any range — the
  round reached it but passed closer to the origin on the way. Measured: the
  coolant spine at local z +4.6 died normally while both recoil dampers at
  z -1.5 took 2 damage in 3000 ticks. Armour is now a last resort, never a
  nearer rival.
- **`WEAK_REACH`.** Even unshadowed, the dampers sit flush with the armour
  sphere, and the ice commander took 94 s to kill against the flagship's 26 s
  and the carrier's ~45 s. A weak point now captures at 3x its own radius. HP
  was the wrong lever — both commanders share the same 138 and only their
  *mounting* differs. 34 s / 26 s now.

Corneria's fight is untouched and verified so: its boss-health trace under the
same scripted fire is identical before and after, and `weak` is a part kind the
carrier does not have.

### Levels and worlds — closed 2026-08-15

Four levels across three worlds: **Corneria** (lowland river), **Corneria
Highlands** (the ice cap it drains from, reached overland), **Sector Omega** (an
asteroid belt), and **The Foundry** (above), the last two reached by orbital
hops. Written when there were three; the finding below is what the third one
bought and it is unchanged by the fourth.

**The finding, which cost three rounds to get and is the reason this is closed.**
The terrain generator has exactly one composition in it — ground below, walls
either side, sky above — and every DNA parameter changes that composition's
*size*, never the composition. Corridor width was pushed 1.3x -> 4.8x (Corneria
is 4.6x), longitudinal pacing was rebuilt, and the wall material was made
per-world; each landed, each was measurable, and none of it stopped the second
level reading as the first. **Variety is not a parameter of the generator. It is
whether a level uses the generator at all.**

So `WORLD.backend` chooses what a world is made of:

- `terrain` — the corridor: `heightAtU` + `terrain.js` + water + baked fields
- `field` — `belt.js`: discrete bodies, no heightfield, no surface, no floor,
  and rock overhead, which a single-valued heightfield cannot produce at any
  parameter value

**What made that cheap, measured rather than assumed: outside `src/world/` the
whole game asks a world for exactly two things** — a rail
(`centrelineX`/`centrelineY`) and a floor (`groundAt`). Flight, combat, ai,
camera, HUD, radar and the campaign hop needed no backend awareness; the only
edit outside the world lane was one line in `combat.js`, because height above
ground is not a quantity when there is no ground.

Landed with it, and load-bearing if any of this is touched again:

- **`zones.js`** — a level as held zones separated by blends, compiled to the
  `keys` a DNA already had. `expandZones` runs inside `setActiveDNA` *before*
  `DNA = dna`, because `world-materials.js` generates a GLSL twin of
  `centrelineX` from `DNA.centreline.x.bends`; publish the unexpanded DNA and the
  shader disagrees with `profile.js` about where the channel is. Corneria stays
  hand-authored and is untouched by it.
- **`DNA.surfaceKind`** — the wall's texture set and structural GLSL, not just
  its colours. Before this, `rockSet()` was globally cached with a hardcoded seed
  and the bedding was hardcoded in the shader, so an ice sheet was drawn as
  folded sedimentary bedrock with a blue tint on **both** worlds.
- **`?level=`** boots a level's world *and* its wave tables. Before it there was
  no way to load level 2 at all, which is why it had never been reviewed.
- **`y.bends`** — the rail can climb. Its limits: `centrelineY - TUNE.boxYDown`
  must stay above the surface (so ~46 m over water or ice), and `dY/dz` is nose
  attitude via `railTangent`.
- **A level's rail must not swing vertically further than the offset box can
  absorb.** Sector Omega was authored at a 251 m swing against a box of
  +78/-46; a craft placed against the rail 1500 m ahead arrives where the rail
  has since moved 100 m, so every contact was permanently out of reach. 92 m of
  swing measures at parity with Corneria for fraction-of-contacts-in-reach.
- **Encounters are coupled to geometry only by convention.** A wave's `z` arms
  it; the craft appears `spawn` metres further on. Ground batteries sit at
  `groundAt + 3.2` with an absolute `bank` offset, so a battery wave must fire
  inside one zone with `bank` near that zone's width, never where the rail is
  climbing — and never in a `field` world, which has no ground.

Deleted with the lane: `level.plan.md`, `PLAN-VARIETY.md` (both aimed at the
axis with the least leverage, kept only as history in git), and the dead prop
materials they existed to schedule — `cityMaterial`, `concreteMaterial`,
`steelMaterial`, `foliageMaterial`, `concreteSet`, `shoreU`.


Moved out of the active plan so the sections above are only open work. Kept in
full rather than summarised: `HANDOFF.md` bans this reasoning from code comments,
which makes this file its only home. Read before re-deriving anything here.

- [x] **1. The crosshair moves with the ship. Done, plus the camera jump.**
      Owner chose the behaviour by describing it: the crosshair leads the hull as
      you begin to pan and saturates at a maximum. That is only honest if the guns
      go there too, so `convergePoint()` now fires down `flight.aimDir` (hull
      forward + aim lead) and the reticle is drawn on the *same* world point
      (`state.aimPoint`), projected in `ui/index.js`. They cannot disagree by
      construction. `updateLock` was already measuring its cone off the hull, so
      the guns and the lock are finally in one frame.

      Aim lead is velocity-driven and saturating: `aimYawMax` 0.115 rad through
      `tanh(offVel / aimVelScale)`, which is ~60 m at the 520 m convergence range,
      i.e. ~0.21 ndcX of throw at full pan.

      **The camera "jump" when crossing the middle — found and fixed. It was a
      position term in a lead.** The old lead was
      `off - smoothedOff * camOffsetFollow`, which expands to
      `(off - smoothedOff) + 0.3 * smoothedOff`: a velocity proxy *plus 30% of
      position*. So which side of the ship the rig sat on was a function of which
      half of the corridor the ship was in — saturated +4.5 m at one wall, −4.5 m
      at the other, swinging through zero across the middle ±30 m. Crossing the
      centreline whipped the rig 9 m laterally plus 5.4 m of aim in ~0.45 s
      (seen-from-the-left to seen-from-the-right), while middle-to-edge showed half
      the swing in the direction of travel and felt right — exactly the asymmetry
      the owner described. The lead is now the damper's lag alone. `camOffsetFollow`
      is gone.

      **`railYawFollow` 0 → 0.35.** It was pinned at 0 only because a centre-locked
      reticle walked off the guns under any camera yaw; that constraint died with
      this change, so the view can turn down the channel instead of crabbing along
      it. Conservative because hands-off ship drift measures 0.17 ndcX at 0 and
      0.257 at 0.55, and uncommanded drift is the complaint that got the auto-yaw
      fixed.

      Regression-checked: carrier still dies (103 s vs 101.5 s) and rounds landed
      went 653 → 691, so ship-relative aim is neutral-to-better. `inputtest` clean.

      **Horizontal was inverted on the first attempt, and the cause was older than
      this work.** Reported from live play; found with the new `tools/pilot.mjs aim`,
      which holds each steering key and measures the reticle's on-screen
      displacement. Three layers, each hidden behind the one above:
      1. `yawTarget = stickX * yawPerStick` had no negation. YXZ maps yaw θ to
         forward `(-sinθ, 0, -cosθ)`, so pushing right yawed the *nose left* while
         the ship translated right — the hull crabbed against its own travel by
         0.2 rad. Pre-existing; the aim lead rode the hull and inherited it.
      2. The aim then could not ride the hull at all: bank and pitch are
         exaggerated for looks, and climbing reaches ~0.75 rad, which at 520 m of
         lever arm threw the crosshair 1.03 ndcY — clean off the frame.
      3. Basing it on the corridor heading instead made the reticle wander with
         the meander, which is drift by another name.
      Final form: the lead is built in the **camera's own basis** in
      `updateCamera`, after the camera is final. A point `aimRange` down the view
      axis from the hull projects onto the hull's own screen position, so
      displacing it along camera right/up moves the crosshair off the hull by a
      known amount on a known axis. Velocity-driven, tanh-saturating, and sized
      against the measured camera lead so it *outruns* the hull rather than being
      welded to it: dAim/dHull now 1.17–1.40 on all four axes.

      **A probe that measures the wrong thing is worse than no probe.** The first
      version of `pilot.mjs aim` compared the reticle's absolute position to the
      hull's and reported two false inversions, because the hull rests ~0.3 ndc
      *below* frame centre by design. It measures displacement from a neutral
      sample now.

      **Awaiting the owner's hands-on pass.** Three live knobs for it —
      `rail yaw follow`, `aim lead`, `cam lead` — because whether the corridor
      rotating around you reads as flying it or as the camera wandering is not a
      question a probe can answer.

- [x] **2. The post chain is overcooked.** First pass done, and it is meant to be
      dialled rather than decreed — see the dev knobs below. Owner's call was
      "same look, less post sludge", not the reference build's flatter direction.

      **The shipped look lives in `environment.js`'s preset, not in the pass
      defaults.** `env.apply()` overwrites every pass param, so the constructor
      numbers in `postfx.js` are never what is on screen. Tune the preset.

      Pulled back in `corneria` — glow and over-processing only:
      bloom `0.055 → 0.040`, lens dirt `0.04 → 0.022`, flare `0.30 → 0.19`,
      god rays `0.24 → 0.16`, AO `1.05 → 0.86`, saturation `1.16 → 1.08`,
      contrast `1.10 → 1.05`, CA `1.6 → 0.9`, vignette `1.02 → 0.92`.

      **Exposure deliberately untouched**, because it pulls against the
      `w-shore` item and would deepen it.

      **Found while measuring — and it corrects the `w-shore` item below.** The
      grade bug: `env.apply()` mapped grade key `ca` to `uCa`, but the uniform is
      `uCA`, and the loop `continue`s on a miss *silently*. So `ca` never applied
      in **any** preset and all three ran on the pass default `1.6` — higher than
      any of them asked for. Chromatic aberration is a first-order "over-cranked"
      tell, so this was part of the complaint. Fixed with a caps fallback in both
      `environment.js` and `main.js`'s `api.post`.

      Measured before/after (composited median, `hist.mjs`, quality high). The
      pull-back *raises* every median — the big cuts were to darkening terms, so
      it moves toward the 0.10–0.20 band, not away:

      | shot | before | after |
      |---|---|---|
      | chase | 0.037 | 0.045 |
      | valley | 0.030 | 0.032 |
      | water | 0.034 | **0.059** |
      | w-shore | 0.068 | 0.079 |
      | sun | 0.115 | 0.116 |

      `p90` < 0.6, `clippedPct` < 0.5, `blackPct` 0 on all of them — the other
      three legs of ship criterion 4 pass comfortably.

      **Owner-tuned live and baked in (2026-08-11, M1, Chrome):** god rays
      `0.16 → 0`, lens flare `0.19 → 0`, CA `0.9 → 0`. Everything else from the
      pull-back kept as shipped. Both zeroed passes early-out on zero intensity, so
      this is free as well as calmer, and the passes stay enabled — the dev knob
      brings either back without a rebuild. CA at 0 is also closest to how the game
      has always actually looked, since the key never reached the uniform before
      the fix above.

- [x] **3. Every dynamic object is falsely motion-blurred — ship, boss and
      enemies.** Owner: "there's also way too much blur on the ship — its like in
      constant blur", then "also the boss and enemies are also blurry". Visible on
      the wings in the live screenshot, where they smear into streaks.

      **One bug, and the comment above the pass states the wrong assumption as
      if it were a justification** (`postfx.js:739`): *"Camera motion only (no
      per-object velocity buffer) which is exactly right here — the whole world
      streams past the camera, so camera velocity is the dominant motion."*

      `MOTION_FRAG` unprojects `tDepth` and reprojects through `uPrevViewProj`,
      i.e. it treats **every pixel as static world geometry**. The velocity it
      computes is therefore only the camera's apparent sweep of a static point at
      that depth. True screen velocity is that term *plus* the object's own world
      motion, so the error equals the object's own motion — and it is **maximal
      for anything that moves with the player**, whose two terms nearly cancel to
      a true screen velocity of ~0 while the pass still applies the full camera
      term. The blur on those objects is close to 100% spurious.

      That is the ship, but also:
      - **The boss, worst of all, because it station-keeps.** Measured in
        `bossprobe`: `dz` mean −413.5, min −412, max −592 — a near-constant offset,
        so it travels at cruise alongside the player and its real screen motion is
        ~0. It gets smeared as though it were a cliff 413 m away swept past at
        175 m/s.
      - **Formation enemies and wingmen**, which pace the player the same way.

      `strength: 0.55`, `maxVel: 0.05` (a 5%-of-screen cap — ~96 px at 1920,
      which is the streak length in the screenshot), 10 taps.

      **Do not fix this by masking only the ship** — that leaves the boss and
      half the traffic smeared, which is how the item was first written and it
      was wrong. Two real options:
      - *Mask every dynamic entity out of the pass* — cheap and tractable,
        because they are already enumerable: the `combat` group (which owns
        `enemies`, `wingmen` and the boss) plus `ctx.ship`. Stencil or a 1-bit
        mask RT with the depth test. Keeps the world's streaming, which is doing
        the real work for the sense of speed. **Start here.** Two cautions: feather
        the mask, or a crisp hull cut out of a smeared background reads as a
        compositing bug; and mask the *hulls only*, since engine trails and fx
        genuinely should blur.
      - *A real per-object velocity buffer* — correct for everything including
        fast-crossing traffic, and the actual AAA answer, but it needs prev model
        matrices tracked per object and prev poses for the boss rig and the
        Arwing's animated parts, or those come out wrong in a subtler way. Only
        worth it if the mask's residual is visible.

      Do not just disable `motionBlur` — it rides the AO quality tier (`:1748`)
      and the world's speed read would go with it.

      **Note: motion blur is now OFF at every quality tier** (owner call, same
      live-tuning pass), so the hull mask below does not run by default. It is kept
      rather than reverted because the blur is expected back once the frame is in
      budget, and dev key `4` plus the `motion` pass toggle exercise it — that is
      its named consumer for ship criterion 7. It also means the unresolved
      mask-cost question below is currently moot in practice.

      **Done — masked, and the hull is visibly sharp again.** `MotionBlurPass`
      renders the dynamic hulls into a half-res mask (red = hull, green = its own
      depth so a hull behind a cliff cannot punch a hole in the blurred cliff) and
      scales the blur by it. `motion.dynamic` is `[ship, combat.group]`, set in
      `main.js`; fx and trails are deliberately excluded because they should
      smear. Toggle live on dev key `4`.

      Three things worth not re-deriving:
      - The mask is drawn from a **private 2-child scene**, not by layer-filtering
        the real one. Layer filtering works but a nested
        `renderer.render(scene, …)` re-runs the shadow-map update for everything
        in that scene.
      - It is drawn in `post.render()` **before** `composer.render()`, never as
        part of the chain.
      - `hullMask()` takes **one** sample on purpose. The mask is half-res with a
        linear filter, so one bilinear fetch already feathers the silhouette
        across ~2 full-res pixels. A 5-tap version for a softer edge cost
        **7.8 ms** at 1080p. Feather via `maskScale`, never by adding taps.

- [x] **Closed: the motion-blur mask's 8 ms was a headless artefact.** The
      note below stood for months on a split-timed reading where the composer
      chain went 3.6 -> 12.1 ms with the mask on, from a single `texture2D(tMask,
      ...)` — which cannot cost 8 ms, and it does not. The 2026-08-15 per-pass
      sweep puts *all post together* at 4.10 ms and the whole frame at 12.9 ms
      under the same headless ANGLE, so an 8 ms single fetch is not physical. The
      note already suspected this ("may be a headless ANGLE-Metal artefact").
      Ruled out at the time and still ruled out: the mask render itself (0.7 ms,
      663 meshes), the blur arithmetic, and linear vs nearest filtering.
      Re-open only with a real-Chrome measurement.

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

- [x] **The camera stuck, then jumped, then stuck again on a held turn.** Fixed.
      Owner report after the framing fix landed. Measured with a held-stick probe
      sampling per-tick acceleration (second difference) of both the camera and
      the raw offset — `offX`'s own jolt (0.853 m) matched the camera's (0.854 m)
      almost exactly, so the camera was not inventing it: at full deflection the
      lead cap is saturated **95.6%** of ticks, the rig rides rigid against the
      hull, and it passes any hitch in the offset straight to the frame.

      Two discontinuities in the *sim*, both the same mistake — rewriting
      position instead of applying a force:

      - `softClamp` remapped the offset every tick past the box
        (`hi + over * 0.35`), an iterated map that lands a fresh discontinuity on
        every tick spent against the wall, and multiplied velocity by 0.35 per
        tick besides. Now a spring + damper (`wallSpring`, `wallDamp`) that never
        touches position; overshoot is ~9 m at full offset speed.
      - The terrain floor teleported `off.y` and flipped velocity sign
        (`*= -0.25`) — a bounce. Now cushioned over the last `groundCushion` 9 m
        of clearance, with the hard stop kept as a backstop that zeroes velocity
        rather than reflecting it.

      Also softened the camera's lead cap from `clamp` to `cap * tanh(v / cap)`:
      a hard cap flips between rigid-to-ship when saturated and damped-to-rail
      when not, and that derivative corner reads as a snap each time the lead
      crosses it.

      | per-tick accel | before | after |
      |---|---|---|
      | camera X | 0.854 m | **0.102** |
      | camera Y | 0.661 m | **0.095** |

      What remains is the wall spring's own smooth response, on the order of the
      stick's own acceleration. Framing re-verified at every box corner including
      the new overshoot; worst case `ndcY -0.52`.
      **Unvalidated in live play** — measured only. Needs a hands-on pass.

- [x] **Loading screen with a progress bar.** Done. `src/ui/loading.js` draws a
      boot card with the HUD's own glyph face, `gauge()` and Arwing icon; the
      backdrop is CSS on `#boot` so it paints before any module evaluates.
      Init is synchronous, so nothing composites unless it yields: each stage in
      `main.js` is `await loader.stage(label, weight)`, which eases the bar over
      four rAF turns and hands the frame back before the blocking call runs.
      Weights are measured shares of wall time (buildMaterials alone is 1.8 s of
      ~5.2 s). The card cross-fades onto the first live frames and removes its
      node before `ready` is signalled, so `?t=`/`?shot=` never capture through
      it.

      Out of scope, found while measuring: `buildMaterials()` is 35% of boot in
      one blocking call, which is the one stage the bar cannot move through.
      Splitting it per-material would let the bar advance across it.
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
- [x] **Autopilot playthrough (`pilot.mjs fly`, 2026-08-11).** First input-driven
      run of the level: 22 kills, 2580 score, never died, shield never below 68.
      Framing holds under real input — ndcX ±0.186, ndcY −0.485…−0.101, 0 of 15
      samples near a frame edge, which is the one thing no hands-off probe can check.
      **Do not read the autopilot's survival as a difficulty signal.** It sees exact
      contact positions every tick and never panics; the owner's verdict on the same
      waves is "hard enough, perfect density". Wave difficulty is settled — the
      probe is for framing and regressions, not for balance.
- [x] **The barrel roll span the wrong way.** Owner, from live play: C rolled
      anti-clockwise and Z clockwise. `rollExtra` was `+rollDir * eased * 2π`, but a
      Z Euler term rotates the hull's up vector toward -x, so a positive sweep reads
      anti-clockwise from the chase camera — the opposite sign to `bankTarget`,
      which the same Euler is carrying at the same time. Negated.

      The 42.9 m of lateral displacement per roll is **deliberate** (owner,
      2026-08-15) and is not to be damped back out: the roll is a committed lane
      change, not a recentring dodge.

      **`pilot.mjs roll` called this correct before it was fixed, and the verdict
      was the defect.** It took the sign from peak `|upX|`. The sweep is a full
      360°, so `|upX|` peaks near 90° and again near 270° with opposite signs, and
      on a 3-frame cadence the larger sample landed at 325° — past the half turn,
      sign already flipped. It reads the first quarter turn now. This is the second
      time in this file a probe has confidently reported an inverted control as
      correct; see the `pilot.mjs aim` note above.
- [x] **The level does not end.** Starting `pilot.mjs fly` near the carrier
      (`--t 44`) flew to **z = −29237** — 20 km past the intended finish — with no
      `outcome` ever set and kills frozen at 6. Either the boss does not spawn when
      the rail is reached via a seek rather than by flying, or there is no terminal
      state once past the carrier. Both are worth knowing before the difficulty
      pass. Unrelated to flight feel, so it was left alone.
      **Narrowed (2026-08-15):** flown from `--t 6` the carrier spawns, dies and
      sets `outcome='win'` at z ≈ −10270 — so the terminal state exists and the
      `--t 44` arm is the broken one, i.e. a seek past a wave trigger skips it.
      What is still missing is anything *consuming* the outcome: the rail ran on to
      z = −14540, 4.7 km past the end of the terrain, still flying.

      **Closed (2026-08-15) — `game/campaign.js`.** The outcome now starts a
      victory lap, then an orbital hop to the next level. Measured with the new
      `pilot.mjs hop`: sim active on 183/183 samples, terrain never visible while
      the mesh is incomplete, rail lands back at 0 on Fichina, fps 31–115.

      Three things worth not re-deriving:
      - **The rail detaches, it does not rewind.** `flight.detached` holds the rail
        *and* skips the ground clamp together. Resetting `railZ` while still
        attached fires the next level's waves during the hop and drops the ship
        onto terrain that is not drawn yet.
      - **`flight.climb` is deliberately outside `off.y`.** The offset is a box
        with sprung walls and a ground cushion; pushing 2.2 km through it fights
        both. It is added to `pos.y` and to the camera's `_vShip`, and to nothing
        else — feeding it into the camera *lead* terms would saturate the lead cap
        for the whole ascent.
      - **The campaign ticks before the sim, not in `updateScene`.** Ticked in the
        render phase it lands between the two readers of `climb`: the ship is
        placed with the old value, the camera uses the new one, and at the ascent's
        ~940 m/s that is ~15 m of camera-above-ship against a 17 m chase distance.
        The hull leaves the bottom of the frame.

- [x] **The carrier flew the player's own inputs back at them.** Owner: "he kinda
      just goes where i go and past me so i just have to constantly fly to the edges
      of the deadzone". Cause was literal — the station was `_v.copy(pl)`, the
      *player's* position plus a weave, and the box clamps were player-relative too,
      so the carrier mirrored every stick input and slid past on whichever side the
      player moved to. It could be chased but never lined up.
      Lateral and vertical are now its own path in **rail** space (two
      incommensurate lateral terms plus one vertical, `TUNE.boss.path*`), clamped to
      the corridor rather than to the player. The z leash stays player-relative on
      purpose: that is what keeps it in weapon range and stops it parking out of the
      fight, which was a real defect once.
      Amplitudes sit inside the player's own box so it is always reachable, and the
      traverse peaks near 62 m/s against the player's 132 so it can always be
      caught. Measured: rounds landed 6.7/s → 4.1/s and the hit-register flash 100%
      → 78%, i.e. genuinely harder to hold on target, while still 100% inside the
      lock cone for a straight-flying probe so it never becomes unfair.
      Turn up `pathX`/`pathY` if it should demand more chasing.
- [x] **Every hostile and the carrier are 50% larger** (`NPC_SCALE` in
      `ships/enemies.js`). Visual *and* collision together: growing the model alone
      would shrink the hit area relative to the visible hull, so rounds that plainly
      look like hits would miss. `spec.radius` and the gun mounts scale at proto
      build time (mounts are transformed by the agent, not the mesh, so they do not
      inherit the root scale and would otherwise fire from inside the hull); the
      boss's weak-point radii scale in `createBoss`, since `local` offsets already
      ride the scaled node matrices but world-space radii do not.
      This is also the ship-scale legibility experiment the roadmap had parked.
- [x] **Rear-threat indicator.** Done — `ui/threat.js`, wired in `ui/index.js`.
      Arcs on an ellipse hugging the frame, at the threat's bearing in the *rail*
      frame so "that side of the radar" and "that side of the screen" always
      agree. Intensity tracks how squarely the hostile is pointed at the player
      (`aim`, published per-contact from `combat.js`), not just its range — a foe
      crossing behind you is not the same event as one lining up a shot. Bearing
      is held `GAP` clear of bottom centre so an arc never lands on the radar.
      Measured over 60 s of `?fight=1`: a rear hostile is aimed at the player
      **42.6% of ticks, peak 7 at once** — which is the owner's complaint,
      quantified. Capture: `shots/threat/arcs.png`.
      **Owner-validated in live play (2026-08-01)** — the 42.6% duty reads fine
      on screen, no tuning wanted. If a later pass ever does want it quieter,
      raise `AIM_ON` (0.55; the mean `aim` across rear foes is 0.49) rather than
      shortening `RANGE` — distance is deliberately the weak term.
- [x] **Wire `world/reflection.js` into `corneria.js`.** Done. Canyon walls and
      rock stacks now reflect; costs +0.8 ms.
- [x] **Reflections toned down.** Owner: "the reflections are WAY too good […]
      lets tune that down slightly." `PlanarReflection.strength` (default **0.72**)
      scales `uReflOn`, and the water shader already falls back to the sky probe
      wherever the mirror's alpha is 0 — the same path the edge and sky-miss cases
      take — so this is a blend toward a look that is known to work rather than a
      new branch. A perfect mirror reads as CG; a river is not a mirror.
      Side effect worth knowing: it *brightened* the river (water's composited
      median 0.034 → 0.059), because more bright sky probe survives where dark
      canyon wall used to be mirrored. Live on the `reflections` dev knob.
- [x] **Weapon upgrades, auto-granted before the boss.** Done, and the carrier
      was not merely a slog — at tier 0 it is **unkillable**. Measured with
      `bossprobe.mjs`, which holds the trigger and never dodges, so it is a
      perfect-uptime upper bound on what a player can do: 100% of samples inside
      both the range gate and the lock cone, and after **240 s** the core had
      taken *zero* damage, two of four turrets were still at full, and
      `killed: false`. Only 25% of rounds fired at the hull land, so tier 0's
      14.8 fired dps is ~3.7 landed — 900 hp of weak points is four minutes.

      Four tiers in `TUNE.weapons` (`LASER`/`TWIN`/`SPREAD`/`HYPER`), each
      overriding the tap gun wholesale — damage, fire gap, round radius, tap
      homing rate, bolt width, and how many of the four pods fire per interval
      (2 alternating pairs at the low tiers, the full rack at the top). Fired
      dps 14.8 → 29.5 → 54.2 → **83.0**, i.e. 5.6× tier 0.

      | | tier 0 | tier 3 (granted) |
      |---|---|---|
      | engines down | 25 s / 48.3 s | **6.5 s / 14.8 s** |
      | turrets down | 2 of 4, at 56 s / 64.8 s | **all 4 by 85.8 s** |
      | core | untouched at 240 s | **dead at 101.5 s** |
      | outcome | `killed: false` | **`win`** |

      Three grants at `z = -7150 / -7451 / -7751`, awarded not collected — no
      pickup entity, per the owner's settled call. Placed so each tier is
      followed by a wave to feel it on (hornets at -7250, the last wasp swarm at
      -7550), and the last one clears the -7951 comm by 1.1 s so no callout is
      stomped. HUD readout is a 4-segment pip row in `ui/status.js` that warms
      blue → green → amber → gold, plus a `powerUp` chime and a wingman line per
      grant.

      A/B switches, both needed because the fight is now balanced against the
      granted gun: `?wpn=N` starts on a tier, `?grants=0` suppresses the grants
      (the baseline arm). `bossprobe.mjs` takes a 3rd arg of extra query params
      and reports the live tier and dps, so neither arm can be run by mistake.
      Dev panel key `3` steps the tier and shows it in its own label.

      **Owner-validated in live play (2026-08-11), and the carrier was still too
      tanky, so its hp is now halved** (`BOSS` in `ships/boss.js`: hull 900→450,
      engines 170→85, turrets 60→30, core 320→160). That reverses this item's
      earlier "do not cut boss hp" guidance on purpose: that was written when
      tier-0's 3.7 landed dmg/s was the only lever, and cutting hp then would have
      traded away the per-compartment fight the owner likes. With the grants in,
      both levers exist, so this is a length cut on a structure that already works.
      Measured: carrier dies at **65.3 s**, down from 101.5 s. **Halved again on a
      second play pass — now 36.5 s** (hull 225, engines 42, turrets 15, core 80).
      Weapon knobs if a further re-balance is wanted: `TUNE.weapons[].dmg`/`gap`,
      and the grant count is just the length of `GRANTS`.

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

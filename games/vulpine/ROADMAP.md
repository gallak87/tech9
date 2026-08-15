# Vulpine — roadmap

**Status:** playable end-to-end, alpha. Phases 0–7 done. Phase 8 (encounter feel
+ legibility) in progress. Phase 10 opened early — the level transition landed
2026-08-15, so the game is now two levels and a campaign. Branch `g/fox64`.

Finished work and the reasoning behind it lives in `## Settled` at the bottom.
The sections above it are only what is still open.

Read with `CONTRACT.md` (lane rules), `REVIEW.md` (the rubric), `HANDOFF.md`
(live session state + defect queue). **This file is the plan; HANDOFF is the
queue.** Tick items here at every commit that closes one, and re-cut the Status
line at the end of each phase.

---

## Scope

**Is:** one 9 km on-rails flight-shooter level — Corneria — that beats Star Fox 64
in a blind side-by-side on visuals. Arcade feel, 2020s rendering, everything
procedural (no binary assets, no network).

**Is not:** a hub, branching paths, an all-range mode, or multiplayer.

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

**Fixed and verified** (don't reopen): terrain winding/"fins"; enemy spawn crash;
wingman clone crash; skirt curtains; fog density; gun convergence; lock-on
tracking; HUD status text; boss station-keeping, weak-point frame, lock, hit
register, swept collision.

---

## Now — Phase 8: legibility and the first two encounters

The owner's "next three" from 2026-08-11 — crosshair, post chain, motion blur —
are all shipped; they and their reasoning are in `## Settled`.

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

- [ ] **Fichina is Corneria in a white coat** (owner, 2026-08-15: "its nearly
      identical to the first level lol"). The DNA work is sound — the numbers and
      the palette really did change — but **the DNA vocabulary is itself a river
      canyon**, so every world expressed in it comes out as one. Every level built
      from `keys` gets: a flat floor at `bed` below the waterline, a
      beach→shelf→cliff terrace stack, one continuous slot, near-symmetric banks,
      and nothing whatsoever above the ship. Changing `inner` from 126 to 206 and
      the palette from stone to snow does not escape that grammar.

      So this is a **structure** problem, not a tuning one. Parameters that would
      actually make a world read differently, roughly in order of payoff:
      - **Cross-section modes.** The terrace stack is one shape function. A
        glacial U-trough is a different one; a fortress trench is a third. `keys`
        should select a profile *kind*, not just feed widths into the only one.
      - **A floor that does something.** Both worlds have a flat floor for 9 km.
        Terraces, ice steps, a floor that climbs to a pass and drops away, or
        breaks into gaps you dive through.
      - **Asymmetry.** Both worlds are near-mirror-symmetric about the centreline.
        One overhanging wall against one shallow ramp reads as a different place
        immediately, and costs one term.
      - **A ceiling.** Nothing in the vocabulary can put geometry *above* the
        ship. Arches, ice bridges, a cavern roof, a canopy of hanging séracs —
        this is the single biggest missing axis and the cheapest way to make a
        corridor stop reading as a canyon.
      - **Non-corridor stretches.** An open basin, a field of towers to weave
        between, a break where the walls vanish entirely. Pacing as much as looks.

      Sector Ω needs most of this anyway — it has no ground at all — so the
      profile-kind seam is worth cutting before that level rather than after.

- [ ] **The commander is not wired as a boss.** `commander:ice` closes Fichina
      through the ordinary enemy path: it fights, but there is no health bar, no
      station-keeping and killing it does not set `outcome`, so Fichina cannot yet
      hand off to a level 3. `enemies.js` exposes an `api.parts` conforming to
      `boss.js` plus `killPart`/`progress`; `COMMANDER.station` is a drop-in for
      `TUNE.boss`. This is the next task.

- [ ] **A rebuild leaks shader programs, 93 → 133, and does not give them back.**
      `material.dispose()` drops the refcount but `renderer.compile()` re-creates
      programs for the whole scene. Harmless across one hop; unknown across four.

- [ ] **The rebuild's last job is a 279 ms single-frame spike** (`renderer.compile`).
      Deliberately parked under the approach phase, where no terrain is on screen
      to judder. Noted, not chased (owner, 2026-08-15).
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

      Absolutes above are headless ANGLE, roughly 3x faster than real Chrome on
      the same machine. The *split* is the result, not the milliseconds.

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

The pre-boss weapon grant is done (above). What is left here is scoring.

- [ ] Score/rank at level end (medals, hit %, time).

## Later — Phase 11: finish

- [ ] The back half of the level (`z < -3000`) raised from roughed-in to shipped.
- [ ] Difficulty pass end to end.
- [ ] Touch controls / mobile.

## Settled — done, and why it is the way it is

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
3. **Weapon upgrades → auto-grant before the boss.** No pickup entity, no drops,
   no level-wide HP rebalance. Weapon tiers granted as the reward for reaching
   the boss, which fixes the DPS slog without new systems. The full drop system
   is explicitly *not* being built.
   **Revised 2026-08-11 (owner): three grants, not one.** "The game is hard, the
   guns are weak — 2-3 automatic weapon upgrades right before the boss." Shipped
   as three, taking the gun to 5.6× its starting dps. Built and measured; awaiting
   the owner's hands-on pass.

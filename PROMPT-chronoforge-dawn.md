# Goal

Build **Chronoforge Dawn** — an overhead action-RPG in Three.js (latest release) + Vite, plain ES
modules. It is a ground-up remake of `games/chronoforge`, a thin Canvas-2D prototype: same three
heroes (Kaida / Vex / Rune), same post-collapse world of neon city-states and alien-terraformed
ruins, same ATB battle, same settlement economy — rebuilt at AAA fidelity.

The bar is AAA: physically plausible sun/sky/shadows, material variety that survives a close crop,
atmospheric depth, weather that lands on surfaces, and characters that read as crisp pixel-art
silhouettes against real 3D terrain. Never programmer art.

The prototype is playable and its content is good. What it lacks is **presentation** — it renders a
flat plane of tiles with no light, no depth, and no weight. Dawn keeps the game and replaces the
rendering. Dawn is the signature hour: long shadows, warm rim light, cold shadow. That frame is what
every reviewer will judge.

---

# What is wrong with the prototype — fix all of it

Observed defects in the current build, not opinions. Every one must be gone, and each is checkable
in a screenshot:

1. **Fog of war is opaque hard-edged squares snapped to the tile grid.** It reads as a checkerboard
   laid over the art. Fog must be a soft, feathered, continuous field — no square edges anywhere, no
   visible quantisation at the boundary.
2. **The tile grid is drawn over the entire world.** Every cell is outlined. There is no grid in the
   shipped game. Tiles are an authoring convention, not a visual.
3. **Nothing casts a shadow, and nothing touches the ground.** Overworld characters sit on a flat
   ellipse blob. Battle characters float on a vertical gradient with no floor at all. Every actor
   and prop needs real contact shadowing and real grounding.
4. **The battle scene has no place.** Three heroes in a left column, one enemy on the right, over a
   purple gradient. Battles happen *somewhere* — the arena is the terrain the encounter was
   triggered on, staged and lit, with a horizon, depth and props.
5. **The world is flat.** One elevation, one lighting condition, no parallax, no vertical interest.
   The painted ground art is decent and is being wasted by uniform lighting.
6. **An enemy under fog renders as a grey ghost.** Concealment is binary and diegetic: either the
   fog hides it or it does not.
7. **Menu chrome is a 1px neon rectangle.** The tab layout and information design are genuinely
   good — keep the structure, the magenta/cyan identity, the keyboard hints row. Replace the
   material: depth, glow bleed, panel weight, type hierarchy.
8. **The HUD is unstyled text.** Resource counters and the party bar are debug readouts. Design them.

Keep the prototype's dev overlay — battle speed, fog toggle, minimap toggle, reset, replay — and
extend it. It is the most useful thing in that build.

---

# The art policy — read this twice

There is **no sprite-generation pipeline and no binary art assets.** Every character is a low-poly
3D rig built in code, posed by an animation system, and rendered through a pixel-snap and
palette-quantise pass so it reads as a sprite. Weapons, armour and accessories are separate meshes
attached to named sockets on the rig.

This is not an aesthetic preference. It is the fix for the specific defect that stalled the
prototype's art: an image-generation pipeline cannot draw the same character twice in a new stance
or holding a different weapon, and this game needs each hero in roughly forty poses across
overworld, battle, menu portrait and cutscene. Kaida must be the same Kaida idling, running,
casting, hurt and victorious, with three different swords. A rig is identical in every pose by
construction; a generated sprite never is.

Terrain, buildings, foliage, VFX and UI are likewise procedural — noise, SDFs, textures baked in
code. No downloads, no `fetch`, no PNGs in the repo except what the harness writes into `shots/`.

---

# Stack rank — build in this order, no jumping ahead

Each tier ships **playable and verified** before the next starts. A tier is not done because it
looks done; it is done when its probe exits zero and its screenshots have been scored.

1. **World & light.** The world is a **graph of twelve discrete 45×30 maps** ported from the
   prototype's `MAPS` table — eight outdoor regions (Haventide T1 · Emberline T2 · Forest Veil T2 ·
   Mire Bog T2 · Orbital Reach T3 · Frost Canyon T3 · Crater Ember T4 · Last Crown T4) plus four
   city interiors — not one contiguous landmass. Each region owns its tier, its biome from the eight
   named biomes, its fixed encounter placements, its doorway edges, and exactly one hidden world
   drop. Terrain with elevation, the overhead camera rig at locked pitch, sun/sky/IBL, time of day,
   weather, the post chain, and soft continuous fog of war.
   *Done means:* a free camera can fly anywhere and every frame is worth looking at, and defects
   1, 2, 5 and 6 are gone.
2. **Traversal.** Party of three moves — WASD and click-to-move, follower spacing, collision,
   footfalls matched to surface material, camera damping, run/idle/turn poses, contact shadows.
   *Done means:* a scripted three-minute route holds 60 fps with zero clips through geometry.
3. **Places.** Cities and buildings you enter and leave. Doors, interior lighting, the transition
   both ways, NPCs standing where they belong, shops and the forge.
   *Done means:* every door opens, returns you to the correct tile facing the correct way, and no
   interior can be soft-locked.
4. **Encounters & battle** — *the crown jewel, and the one thing the prototype already got right.*
   Visible enemies roaming the map, in-place battle start (lateral swing plus push-in at locked
   pitch, no scene swap), ATB gauges, single-target and AoE techs, dual and triple techs, crits that
   freeze time, camera cuts on combo finishers, portrait flashes, screen-shake, elemental VFX. Take
   the prototype's `battle.js` as the authoritative design spec — its ATB math, enemy tiers, tech
   tables and drop tables are already tuned — and make it cinematic. Chrono Trigger, staged and lit.
   *Done means:* 200 headless battles at a fixed seed resolve with no deadlock, time-to-kill inside
   band, every combo fires and frames its actors, and defects 3 and 4 are gone.
5. **Progression.** XP, levels, gear with three slots per hero, skill trees, the pause menu
   (Map / Party / Inventory / Skills / Quests / Save / Settings), quest log, localStorage save. Port
   the prototype's tab structure and keyboard model verbatim — Q/E cycles tabs, 1–7 jumps, Esc/Tab
   closes, the Map tab drags and zooms — and re-skin it per defect 7.
   *Done means:* full state round-trips byte-identical and every equip shows a correct stat diff.
6. **Settlement.** Town center, farms, mines, energy extractors, workers, resource ticks, four tech
   tiers (Survivor → Reclaimer → Ascendant → Transcendent) that visibly transform the base.
   *Done means:* a four-hour simulated economy neither starves nor runs away, and a tier-up is
   obvious in a screenshot.

Tiers 1–3 are the remake's real work; the prototype barely had them. Tier 6 is last on purpose.

---

# How to work

1. **Architecture first.** Before any feature code, write `ARCHITECTURE.md`: one folder per
   subsystem (`world`, `render`, `actors`, `traversal`, `places`, `battle`, `progression`,
   `settlement`, `fx`, `ui`, `audio`, `tools`), a shared world data model, a single `ctx` object
   every module receives, the public API each module exposes and the events it emits, units (metres,
   +Y up), determinism (seeded RNG only — `Math.random()` is a defect), a performance budget (60 fps
   at 1080p, ≤900 draw calls, 16.6 ms frame), and the art policy above. Isolate module failures so
   one broken module never blanks the screen.

2. **Build the verification loop before the game.** This is the part that matters most and the part
   everyone skips. Nothing ships without an instrument. In `tools/`, at minimum:

   - `shot.mjs` — deterministic GPU-backed Chromium screenshots at named camera presets, a fixed sim
     time and a given time of day. Exits non-zero on console errors. A silent black PNG is worse
     than a crash.
   - `probe.mjs` — linear-light histogram of the frame. When you are fighting the look, measure the
     exposure instead of arguing about it.
   - `sheet.mjs` — contact sheet compositor; nine PNGs reviewed one at a time lose the comparison.
   - `blind.mjs` — blind A/B pair builder; strips the labels so a judgement is worth something.
   - `walk.mjs` — drives **real keyboard input** along a route and reports fps, collision events,
     frame-to-frame camera jitter, and whether the party actually arrived.
   - `door.mjs` — enters and exits **every** door in the world, asserting return position, facing
     and load hitch. Soft-locks are invisible to screenshots.
   - `duel.mjs` — runs N seeded battles headless and reports ATB fairness, time-to-kill spread,
     damage curves, combo fire rate and deadlocks. Balance is a distribution, not a vibe.
   - `stage.mjs` — samples the battle camera over time: is the actor in frame during its own combo
     finisher, and does the cut land on the hit.
   - `fog.mjs` — samples the fog field along a transect and asserts it is continuous: no step
     discontinuity at a tile boundary. Defect 1, made into a number so it cannot come back.
   - `econ.mjs` — simulates the settlement for hours of game time and plots every resource curve.
   - `save.mjs` — round-trips full game state and diffs it.
   - `digest.mjs` — hashes every procedurally generated texture, mesh and world sample so a refactor
     that must not change output can be **proved** rather than eyeballed.
   - `census.mjs` — walks the content tables: every enemy, item, quest, building and door is
     reachable and referenced. Orphans are content bugs.
   - `region.mjs` — walks the twelve-map graph offline: every doorway target names a real map, every
     landing coordinate is in-bounds and passable, every edge is bidirectional unless deliberately
     one-way, every region is reachable from Haventide, and every encounter and world drop names
     something that exists. A typo in a `mapId` strands a whole region and no screenshot shows it.
   - `rig.mjs` — asserts a character rig is identical across poses: matching palette histograms,
     silhouette area in band, zero material drift in a fixed head and torso sample.
   - `play.mjs` — an interactive browser session that can be driven live: send input, read state,
     capture on demand. Every other tool photographs a frame or measures a scripted run; this one
     lets the build actually be played.

   Every module also ships a **showcase mode** staging a representative scene of just that module.
   Expose `window.__DAWN__` with `post()`, `probe()`, `stats()`, `seek()`, `step()`, `setShot()`,
   `setTime()`, `battle()` and `teleport()`.

   **Nothing may be claimed that has not been screenshotted and opened, or measured with the probe
   that answers that question.** Screenshots answer "how does it look". They do not answer "does it
   deadlock", "does it drift", "can you get out of the room" — those need a probe, and the probe is
   part of the deliverable.

3. **Score against the prototype, not against a memory.** Capture matched shots from
   `games/chronoforge` — overworld, battle, menu — and treat that build as the **5**. The defect
   list above, fully fixed, is the **8.5**. A **10** is a frame you would put on a store page.
   Pass is ≥8.5 with zero console errors and a green probe. Below that, the ranked issue list goes
   back and the tier runs again, up to four rounds. Score against the build we have and the defects
   we named — never against a game nobody here has looked at.

4. **Final gate: blind A/B.** Pairs of screenshots labelled only A and B — Dawn against the
   prototype at matched location, time of day and framing, order shuffled. Judges say which looks
   better and why. If a judge cannot tell which one is the remake, the remake has failed.

5. **Persist state.** Scores, probe results, frame budget and open issues go in `docs/STATUS.json`
   so an interrupted run resumes from the weakest module rather than from scratch.

---

# Rules

- **Never inflate scores.** Report real numbers, failed rounds and what is still missing.
- **No binary assets, no network fetches.** Every mesh, texture and sound is generated in code.
- **No `Math.random()`.** Seeded streams only — non-determinism makes review impossible.
- **Keep the dev server running and the app loadable at all times.** Pick a unique port if a harness
  is already running.
- **Blowing the frame budget is a defect, not a trade-off.** Do not disable a post pass to make your
  thing look better; fix your thing.
- **The prototype's game design is not up for redesign.** Its ATB math, enemy tiers, tech tables,
  drop tables, economy curves, menu structure and keyboard model are inputs. Rebuild the
  presentation, not the game.
- **Do not ask me questions.** Make routine decisions yourself, state assumptions, keep going.

---

# Current state — this is not an empty folder

An engine skeleton and the first two probes already exist and are working. **Do not clobber source.**

| Exists — keep | |
|---|---|
| `src/` (25 files) | engine skeleton, `ctx`, `__DAWN__` debug API, render stack, module stubs |
| `tools/` | `shot.mjs`, `probe.mjs`, `lintrng.mjs`, `lib/harness.mjs` — working |
| `shots/` (22) | captures including the signed-off dawn frame |
| `docs/STATUS.json` | gates, frame budget, dawn probe baselines, 10 open issues |
| `CONCEPT.md`, `concept.json` | scope constraints, rendering tier |
| `ARCHITECTURE.md` | written already; keep and extend |
| `index.html`, `package.json`, `vite.config.js` | |

Tier 1 has not started. The remaining thirteen probes in the list above are not written yet.

Dawn at hour 6.4 is signed off — median 0.212, p90 0.51, 0% blown white — and must not regress.
Exposure ramps over sun elevation (`EXPOSURE_RAMP` in `src/render/environment.js`), fixed per hour,
no metering. Verify before starting:

```
cd games/chronoforge-dawn && node tools/probe.mjs --shots wide --hour 6.4
```

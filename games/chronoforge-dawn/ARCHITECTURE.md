# Chronoforge Dawn — Architecture

> Status: **Phase 0**. The engine skeleton, the shared core and the first two
> instruments exist. No game feature does. Every lane folder below has a live
> `install*(ctx)` seam wired into `main.js` and a stub behind it.

This document is authoritative for **how the code is shaped**. `CONCEPT.md` is
authoritative for **what the game is**; `CONTRACT.md` is authoritative for **who
may edit what**. Where this document and CONCEPT.md disagree, CONCEPT.md wins and
this one is wrong.

---

## 1. Units, axes and conventions

| Quantity | Unit | Notes |
|---|---|---|
| Distance | **metres** | `TILE_M = 2.0`, `HERO_M = 1.72` |
| Up axis | **+Y**, right-handed | −Z is "north"; the camera looks −Z |
| Time | **seconds** | sim time is separate from wall time |
| Time of day | **hours, 0–24** | `DAWN_HOUR = 6.4` is the signature hour |
| Angles | **radians internally** | degrees only in authored data and at API edges |
| Colour | **linear in the scene** | sRGB only after the grade pass, and in UI CSS |
| Rotation | radians, YXZ order for actors | |

Tiles are an **authoring convention only**. Level data may be expressed in tiles;
it converts to metres at the boundary and no tile index ever reaches the
renderer. There is no tile grid in the shipped game — that is defect 2.

All of these live in `src/core/const.js`, which is read-only to builders.

---

## 2. Folder map

```
src/
  core/          shared. engine, rng, events, modules, shots, const   [INTEGRATOR ONLY]
  render/        renderer-side: camera rig, sky/sun/IBL, materials, textures, post, probe
  world/         terrain, elevation, biomes, weather, fog of war, time-of-day schedule
  actors/        code-built rigs, sockets, pose library, the pixel-snap/quantise pass
  traversal/     party movement, follower spacing, collision, footfalls, camera damping
  places/        cities, buildings, doors, interiors, NPCs, shops, the forge
  battle/        ATB combat, fought in place; techs, dual/triple techs, battle camera
  progression/   XP, levels, gear, skill trees, quests, the pause overlay, save/load
  settlement/    town centre, farms, mines, extractors, workers, ticks, four tech tiers
  fx/            particles, trails, screen shake, time freeze, elemental VFX
  ui/            HUD, menu chrome, dev overlay — draws to the #ui DOM layer only
  audio/         Web Audio synthesis: beds, stingers, chimes, SFX
tools/           the verification harness — 13 probes; 2 exist
```

`src/main.js` is the one integration point. It builds the engine, the rig, the
materials and the environment, then installs each lane through a fixed seam and
runs the loop. Nothing else may create a renderer, a light or a post pass.

---

## 3. The shared context

Every lane's `install*` receives exactly one argument: `ctx`. Fields are added
over time and **never removed** — a lane written in Phase 3 must still run in
Phase 9.

```js
ctx = {
  THREE, engine,          // Engine: renderer, camera, clock, post chain, budget
  scene, camera,
  rig,                    // CameraRig — locked 55° pitch, damped follow
  env,                    // Environment — sky, sun, IBL, fog; setTime(hour)
  materials,              // the shared material kit
  bus,                    // EventBus — the ONLY channel between lanes
  rng,                    // rng('lane.stream'); Math.random() is a defect
  registerShot,           // (name, fn) — add a review camera from your own file
  get time(),             // sim seconds, fixed-step
  get dt(),               // last frame delta, seconds
  get hour(),             // time of day, 0–24
  state,                  // gameplay state the HUD reads; lanes publish onto it

  // populated by install order, each the lane's own API object:
  world, actors, fx, audio, ui, traversal, places, battle, progression, settlement,
}
```

Install order is fixed and matters: `world → actors → fx → audio → ui →
traversal → places → battle → progression → settlement`. A lane may read
`ctx.<earlier lane>` at install time; it must not assume a later one exists yet.
Reach for a later lane inside `update()`, not inside the factory.

---

## 4. Public API each lane must expose

Every `install*(ctx)` returns an object with **at least**:

```js
{
  update(dt, ctx),   // one fixed sim step (or one frame, for fx/ui/audio)
  showcase(),        // stage a representative scene of just this module
  report(),          // cheap plain-object summary for stats() and census.mjs
}
```

Beyond that, each lane owns its surface:

| Lane | Must expose | Emits |
|---|---|---|
| `world` | `heightAt(x,z)`, `normalAt(x,z)`, `focus`, `size`, `biomeAt(x,z)`, `fogAt(x,z)` | `world:built`, `time:changed`, `weather:changed`, `fog:revealed` |
| `render`* | `CameraRig`, `Environment.setTime(h)`, `buildMaterials()`, `post.probe()` | — |
| `actors` | `spawn(def)`, `pose(actor,name,t)`, `socket(actor,name)` | `actor:spawned`, `actor:despawned`, `actor:pose` |
| `traversal` | `party`, `moveTo(v)`, `teleport(v,facing)` | `party:moved`, `party:arrived`, `footfall`, `collision` |
| `places` | `doors`, `enter(doorId)`, `exit()` | `door:enter`, `door:exit`, `interior:loaded`, `npc:talk` |
| `battle` | `start(encounter)`, `resolve()`, `headless(seed)` | `encounter:start`, `battle:begin/turn/hit/tech/combo/end` |
| `progression` | `xp`, `equip()`, `save()`, `load()`, `menu` | `xp:gained`, `level:up`, `item:*`, `quest:updated`, `save:*` |
| `settlement` | `tick(dt)`, `place()`, `upgrade()`, `resources` | `tick:resource`, `building:*`, `tier:up` |
| `fx` | `emit(kind, at, opts)`, `shake(a,t)`, `freeze(t)` | `shake`, `flash`, `timefreeze` |
| `ui` | `resize(w,h)`, `visible`, `draw()` | `menu:opened`, `menu:closed`, `menu:tab` |
| `audio` | `unlock()`, `bed(name)`, `sfx(name,opts)` | — |

\* `render` is not a lane with an `install*`; it is a library the core wires up.

**Events are the only cross-lane channel.** A lane may `import` from `core/` and
from its own folder. It may not import another lane's module. Every event name is
declared in `EVENTS` in `core/events.js`; emitting an undeclared name warns.

---

## 5. Determinism

- **`Math.random()` is a defect.** Use `rng('lane.stream')` from `core/rng.js`.
  `npm run lint:rng` greps `src/` and fails on a hit.
- Stream names are namespaced by lane (`world.terrain`, `battle.crit`,
  `fx.debris`). Two lanes must never share a stream: pulling from a shared stream
  couples them, and adding one particle in `fx` would move a rock in `world`.
- Noise (`noise2D`, `fbm2D`, `ridge2D`) is hash-based and stateless, so it is
  reproducible regardless of call order — and tileable via `period`.
- The sim is **fixed-step at 120 Hz**. Frames are not. `seek(t)` fast-forwards
  without rendering; `step(n)` advances exactly n steps. Probes use `step`, never
  `seek(now + n/120)`, which accumulates float error.
- `__DAWN__.digest()` lists every stream pulled and every texture baked, so
  `digest.mjs` can prove a refactor changed nothing.

---

## 6. Rendering

### Frame graph

```
scene ──► sceneRT (RGBA16F, 4x MSAA)
     ├──► BloomPyramid   threshold+knee → 5 down (13-tap) → 5 tent-up
     └──► GradePass      exposure → +bloom → highlight desat → ACES →
                         contrast/lift/gain → split tone → saturation →
                         vignette → dither → sRGB → screen
```

- Exposure is applied at the **front** so bloom threshold and grading work in a
  normalised space where 1.0 means diffuse white.
- Tone mapping happens **once**, at the end. `renderer.toneMapping` is
  deliberately `NoToneMapping`.
- Antialiasing is 4× MSAA on the scene target, not a post pass: cheaper for this
  fill-bound frame, correct in HDR, and it will not smear the pixel-snapped
  character pass the `actors` lane adds downstream.
- Screen-space distances in shaders are in **pixels**, divided by resolution at
  use. A "small" UV offset of 0.05 is 96 px at 1920.
- **Deferred:** depth of field. It needs a `DepthTexture`, which cannot share an
  MSAA attachment; the render lane adds a resolved depth prepass when DOF lands
  in Tier 1. Do not bolt DOF onto the current target.

### Light

One `Environment` drives everything from one number, the hour:

`setTime(h)` → sun elevation/azimuth → sky shader (turbidity rises as the sun
drops, which is what makes dawn amber) → PMREM probe baked **from that sky** →
key light colour and intensity → fog colour and density → hemisphere bounce.
Ambient and the visible sky therefore cannot disagree.

There is exactly **one shadow-casting light**. A second doubles the shadow pass
for fill that IBL already provides better. The shadow camera is ±52 m, follows
the focus, and snaps to shadow-texel increments — without that snap the map
crawls as the party walks and every shadow edge shimmers.

`bakeIBL()` costs ~10 ms, so it runs on a time change, not per frame. A lane
animating the clock should call `setTime(h, { bakeIBL: false })` each frame and
`bakeIBL()` a few times a second.

### Camera

Locked by CONCEPT.md, enforced in `core/const.js`:

- **pitch 55°, yaw 0°, no player rotation, no player zoom.**
- `FRAME_HEIGHT_M = 18` is the deferred "orthographic scale", expressed as metres
  of world at the focus plane. A 1.72 m hero lands at ~62 px of a 1080p frame
  (a vertical rod projects at cos 55° = 0.574 of its length). Visible ground is
  ≈ 32 m across by 22 m deep.
- Projection is a **narrow-FOV perspective** camera (30°), not orthographic.
  Ortho gives free tile alignment and costs every depth cue the look is built on:
  CoC falloff, parallax between terrain layers, sun shafts, correct occlusion
  behind a ridge. At 30° the divergence reads as orthographic and keeps all of it.
- Battle inherits the same pitch. It may swing laterally and push in; nothing
  else. The one licensed exception is a combo finisher — a scripted 2–3 s cut
  that may break pitch and **must** restore it. Cuts go through
  `rig.beginCinematic()` / `rig.endCinematic()`; `rig.assertLocked()` is the
  check, reported every frame by `stats().cameraLocked`.
- Following is damped by **half-life**, not by a per-frame lerp constant, so a
  30 fps frame and two 60 fps frames land in the same place. A raw lerp does not,
  and the difference shows up as camera jitter in `walk.mjs`.

### Art policy

**No binary assets. No `fetch`. No CDN.** Every mesh, texture, VFX and sound is
generated in code from noise, SDFs and in-code baking. There are no PNGs in this
repo except the ones the harness writes into `shots/`.

Characters are **low-poly 3D rigs built in code**, posed by an animation system,
with weapons/armour/accessories as separate meshes on named sockets, rendered
through a pixel-snap and palette-quantise pass so they read as sprites. This is
not a style preference: each hero needs ~40 poses across overworld, battle,
portrait and cutscene, and an image generator cannot draw the same character
twice in a new stance holding a different weapon. A rig is identical in every
pose by construction.

**Nyquist.** Procedural detail finer than ~4× the sampling rate that consumes it
is not detail, it is noise, and it reads as dirt at every zoom. Pick octaves
against the repeat the material will actually use. This already cost this build
one round: ground detail at four octaves over an 8 m repeat made every square
metre of the world identical gravel.

**Material variety** is the first thing "AAA" means here. Metal, painted
dielectric, rock, dirt and emissive trim must respond differently to the same
light, or the world is one grey plastic no matter how good the lighting is.

---

## 7. Performance budget

Hard gate at 1080p. **Blowing it is a defect, not a trade-off.** Do not disable a
pass to make your thing look better; fix your thing.

| Metric | Limit | Phase 0 measured |
|---|---|---|
| Frame time | 16.6 ms | **4.1–4.8 ms** |
| Draw calls | 900 | **47–64** |
| Triangles | 2.6 M | **292 k** |
| Programs | 220 | **22** |

`__DAWN__.stats().budget` grades every one of them and `shot.mjs` prints the
verdict. Dispose geometry, materials and textures you replace —
`core/engine.js:disposeTree()` does it — and watch `stats().geometries`.

---

## 8. Failure isolation

Eleven lanes work this repo in parallel. On any given afternoon one of them is
mid-edit and throwing. **A broken module must never blank the screen**, because
that blocks every other lane from screenshotting anything.

`core/modules.js` wraps every lane:

- a throw at **install** yields a live stub and the game boots without that lane;
- a throw in **tick** is caught, logged and counted; after 3 faults the module is
  **quarantined** — its update stops being called and the frame goes on;
- failures are loud, never silent: `console.error`, a `module:failed` event, and
  a row in `stats().modules`. `shot.mjs` prints `modules down: …` and exits
  non-zero.

A quarantined module is a defect to fix, not a state to ship.

---

## 9. Events

Declared in `core/events.js`. Add a name there **and** in this table.

| Lane | Events |
|---|---|
| core | `ready`, `resize`, `quality:changed`, `module:failed` |
| world | `world:built`, `time:changed`, `weather:changed`, `fog:revealed` |
| actors | `actor:spawned`, `actor:despawned`, `actor:pose` |
| traversal | `party:moved`, `party:arrived`, `footfall`, `collision` |
| places | `door:enter`, `door:exit`, `interior:loaded`, `npc:talk` |
| battle | `encounter:start`, `battle:begin`, `battle:turn`, `battle:hit`, `battle:tech`, `battle:combo`, `battle:end` |
| progression | `xp:gained`, `level:up`, `item:gained`, `item:equipped`, `quest:updated`, `save:written`, `save:loaded` |
| settlement | `tick:resource`, `building:placed`, `building:upgraded`, `tier:up` |
| ui | `menu:opened`, `menu:closed`, `menu:tab` |
| fx | `shake`, `flash`, `timefreeze` |

---

## 10. The debug API — `window.__DAWN__`

Every tool in `tools/` drives the game through this and nothing else. A rename
here breaks thirteen probes at once, so it is shared core.

| Call | Does |
|---|---|
| `post(patch)` | live post knobs: `exposure`, `bloom`, `contrast`, `saturation`, `vignette`, `grain`, `split`, `enable` |
| `probe(opts)` | linear-light histogram of the frame — `raw` and `exposed` taps, percentiles, `whitePct`, 16×9 tile map |
| `stats()` | frame ms, draws, tris, programs, textures, sun elevation, `cameraLocked`, per-lane health, budget verdict |
| `seek(t)` | fast-forward the fixed-step sim to absolute time `t` without rendering |
| `step(n)` | advance exactly `n` fixed steps |
| `setShot(name)` | apply a named review camera; `null` hands control back to the rig |
| `setTime(h)` | hour of day, 0–24 — drives sun, sky, IBL, fog, shadow direction |
| `digest()` | every RNG stream pulled and texture baked, for `digest.mjs` |
| `reseed()` | rewind every RNG stream |
| `pause()` / `resume()` | |
| `battle()` | **throws** — not implemented in Phase 0 (lands Tier 4 / Phase 6) |
| `teleport()` | **throws** — not implemented in Phase 0 (needs traversal, Tier 2 / Phase 4) |

`battle()` and `teleport()` throw rather than returning a plausible nothing. A
stub that silently succeeds lets a probe report green against a feature that does
not exist, which is worse than having no probe.

### Review cameras

`SHOTS` in `core/shots.js` carries the shared angles: `hero` (the shipping
framing — the one a critic scores), `wide`, `ridge`, `ground`, `top`,
`materials`, `sun`. Lanes add their own with
`ctx.registerShot('battle-finisher', fn)` **from their own file**. Nobody edits
`shots.js` to add an angle.

### URL switches

`?quality=` · `?hour=` (alias `?t=`) · `?sim=` sim seconds · `?shot=`

---

## 11. The harness

`tools/lib/harness.mjs` knows how to start the dev server, launch a **real
GPU-backed** Chromium (ANGLE/Metal — a software rasteriser mangles bloom, normal
maps and half-float precision, so a capture taken on one is not a capture of this
game), wait for `__DAWN__.ready`, and collect console errors.

| Tool | Status | Answers |
|---|---|---|
| `shot.mjs` | **shipped** | how does it look, at a named angle and hour |
| `probe.mjs` | **shipped** | is the exposure right — measure, don't argue |
| `sheet.mjs` | Phase 2 | nine frames side by side |
| `blind.mjs` | Phase 2 | A/B with the labels stripped |
| `walk.mjs` | Phase 2 | real keyboard along a route: fps, collisions, jitter, arrival |
| `door.mjs` | Phase 2 | every door in and out: return position, facing, soft-locks |
| `duel.mjs` | Phase 2 | N seeded battles: ATB fairness, TTK spread, combo rate, loot distribution, deadlocks |
| `stage.mjs` | Phase 2 | is the actor in frame during its own finisher, worst case |
| `fog.mjs` | Phase 2 | fog continuity along a transect — defect 1 as a number |
| `econ.mjs` | Phase 2 | hours of simulated economy, every curve |
| `save.mjs` | Phase 2 | full state round-trip diff |
| `digest.mjs` | Phase 2 | hash every generated texture, mesh and world sample |
| `census.mjs` | Phase 2 | every enemy, item, quest, building and door reachable |

**No agent may claim anything it has not screenshotted and looked at, or measured
with the probe that answers that question.** Screenshots answer "how does it
look". They do not answer "does it deadlock", "does it drift", "can you get out
of the room".

### Reading the probe

Healthy dawn frame, on the `exposed` tap: **median 0.09–0.25, p90 < 1.2,
whitePct < 2, blackPct < 14.** `whitePct` is the share of pixels whose *dimmest*
channel is past the point where the curve has nothing left — flat achromatic
white, a hole in the picture rather than a highlight. A whole-frame median is
necessary but not sufficient: half dark rock and half blown sky has a perfectly
healthy median, which is why the tile map exists.

---

## 12. Phase 0 decisions worth knowing

Recorded because each one cost a round and will otherwise be re-litigated:

1. **Dawn is 11.6° of sun elevation, not 6°.** A literal sunrise puts flat ground
   at a linear 0.04 by the cosine law alone and the frame reads as night. The fix
   is a slightly later "dawn", not a brighter exposure — exposure lifts the sky
   with it.
2. **Turbidity rises as the sun drops.** The first pass had it backwards and
   produced a clear midday sky at 6 a.m.: pale cyan, blown horizon, no amber.
3. **Ground albedo, not exposure.** `0x6b5c44` is 11% luminance — wet tarmac. No
   exposure recovers a frame from that; it only blows the sky trying.
4. **`environmentIntensity` 0.42, not 1.0.** The scattering sky carries real
   energy; at 1.0 it drowns the key, everything converges on sky colour and the
   frame goes milky.
5. **Split-tone the grade.** "Warm rim, cold shadow" will not emerge from
   physical lighting alone, because sky ambient fills shadows with the same
   colour it fills everything else.
6. **The shadow frustum follows the ground point the camera looks at**, not the
   camera. A review shot 130 m back puts the subject outside a ±52 m map and
   silently drops every prop shadow while terrain self-shadowing keeps working —
   which reads exactly like defect 3 and is not.

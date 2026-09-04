# Chronoforge Dawn — build contract

**Target:** an overhead action-RPG that beats the `games/chronoforge` prototype in
a blind side-by-side, with 2020s rendering. Same heroes, same world, same ATB,
same economy — rebuilt as a real 3D world under a locked overhead camera.
Dawn is the signature hour, and that frame is what every reviewer judges.

Ten lane agents, plus a critic and an integrator, work this repo — the lanes largely
**in parallel**. The rules below exist so that never turns into a merge fight or a
mystery regression.

Read `ARCHITECTURE.md` for how the code is shaped. Read `CONCEPT.md` for what the
game is. This file is about **who may touch what**.

---

## 1. File ownership — do not edit outside your lane

**Foundations (Phase 1.1–1.2)** — these three write specs and data, not engine code.
All three are finished after 1.2. `audio` is deliberately **not** here — it runs in
Tier 4 with the battle, because nothing can trigger a sound before then.

| Lane | Owns | Must not touch |
|---|---|---|
| **art** | `docs/RIG_SPEC.md`, `docs/rig-spec.json` | all of `src/**` in 1.1 — the rigs are built in Phase 2 |
| **gamedesign** | `docs/DESIGN_SPEC.md`, `docs/design-spec.json`, `tools/framing.mjs` | `src/**`, the rest of `tools/**` |
| **level** | `data/regions/**`, `tools/region.mjs`, `docs/WORLD_GRAPH.md` | `src/world/**` — that is the world lane's, and it *imports* your data |

**The build lanes** — one folder, one gate, for the whole build:

| Lane | Owns | Must not touch |
|---|---|---|
| **world** | `src/world/**` *and* `src/render/**` — terrain, biomes, weather, fog of war, plus the camera rig, environment, materials, textures, postfx, probe | `src/actors/**`, `src/ui/**`, any other lane |
| **actors** | `src/actors/**` | `src/render/postfx.js`, `src/render/environment.js`, any other lane |
| **traversal** | `src/traversal/**` | `src/battle/**`, `src/places/**` |
| **places** | `src/places/**` | `src/traversal/**`, `src/world/**` |
| **battle** | `src/battle/**` | `src/traversal/**`, `src/progression/**` |
| **progression** | `src/progression/**` *and* `src/ui/**`, `index.html` styles — XP, gear, skill trees, quests, plus the HUD and pause menu | `src/battle/**`, `src/settlement/**`, the Three scene, the post chain, `src/render/**` |
| **settlement** | `src/settlement/**` | `src/progression/**`, `src/world/**` |
| **fx** | `src/fx/**` | the post chain, any other lane |
| **audio** | `src/audio/**`, `docs/AUDIO_SPEC.md`, `tools/render-audio.mjs` | anything else — first runs in Tier 4 |
| **tools** | `tools/**` except the three named above | `src/**` — a probe that edits the thing it measures is not a probe |

`data/regions/**` is **level's** output and **world's** input. World reads it in Tier 1
and never writes it. If the graph is wrong, that is a level defect and it is fixed in
`data/`, not worked around in `src/world/`.

**World owns render. Do not split them.** The light is set by the ramps in
`environment.js` and graded by the exposure constant in `postfx.js`. Tuning one
without the other yields a build correct at one hour of the day. One gate judges the
frame; one lane owns everything that makes it.

**Progression owns ui.** Same rule.

### Lanes with no agent

`actors`, `fx` and `tools` are listed above but no `cfd-*` agent claims them. Work
routed to them reaches nobody. Assign an owner before scheduling work in these
folders:

| Folder | First needed | Candidate |
|---|---|---|
| `src/actors/**` | Phase 2 | `art` specs the rig, but is docs-only and closes after 1.2 |
| `src/fx/**` | Tier 4 | `battle` — its brief names elemental VFX |
| `tools/**` | now | orchestrator; `integrator` from Phase 3 |

`src/actors/**` must have an owner before Phase 2 opens.

### Shared core — read-only to builders

```
src/core/const.js      units, the locked camera, the budget, the named hours
src/core/engine.js     renderer, camera, clock, quality tiers, disposeTree
src/core/events.js     the event bus and the declared event table
src/core/modules.js    module isolation and quarantine
src/core/rng.js        seeded streams and the noise kit
src/core/shots.js      the shared review cameras and registerShot
src/main.js            boot, the fixed-step loop, window.__DAWN__
index.html             the page shell
ARCHITECTURE.md  CONTRACT.md  CONCEPT.md  GAME_PLAN.md  ROADMAP.md  HANDOFF.md
docs/STATUS.json       live state, open issues, nextPhase
```

**`docs/STATUS.json` is append-only to a lane, and only for its own open issues.**
Never rewrite the file wholesale and never touch another lane's entries. Waves run in
parallel: three lanes each rewriting one shared JSON file is three lanes silently
deleting each other's results. Put your numbers in your **report**; the orchestrator
or the integrator folds them in. A lane that finds STATUS.json already changed under
it must re-read before writing, not overwrite.

**Only the `integrator` edits these.** If you genuinely need a new seam, say so in
your report as a core-change request. Do not edit around it, and do not add a
`window.__MY_LANE__` global to dodge the rule.

Everything you need is already wired: `installWorld`, `installActors`,
`installTraversal`, `installPlaces`, `installBattle`, `installProgression`,
`installSettlement`, `installFx`, `installUI`, `installAudio` are all called from
`main.js` and handed the shared `ctx`. **Fill in your module; the wiring is done.**

Need a review camera angle? `ctx.registerShot('battle-finisher', ctx => {…})`
from **your own file**. Do not edit `core/shots.js`.

Need to talk to another lane? `ctx.bus.emit('encounter:start', {…})`. Do not
import another lane's module — that is how two folders become one folder.

---

## 2. The context object

```js
ctx = {
  THREE, engine,          // Engine — renderer, camera, clock, post chain
  scene, camera,
  rig,                    // CameraRig — LOCKED 55° pitch, damped follow
  env,                    // Environment — sky, sun, IBL, fog; setTime(hour)
  materials,              // shared material kit; CLONE before you mutate
  bus,                    // EventBus — the only channel between lanes
  rng,                    // rng('your.stream'); Math.random() is a defect
  registerShot,           // (name, fn) — a review camera from your own file
  get time(),             // sim seconds (fixed-step)
  get dt(),               // last frame delta, seconds
  get hour(),             // time of day, 0–24
  state,                  // gameplay state the HUD reads; publish onto it

  world, actors, fx, audio, ui,
  traversal, places, battle, progression, settlement,   // each lane's own API
}
```

Your `install*(ctx)` returns at least `{ update(dt, ctx), showcase(), report() }`.
Add fields to what you return; never remove one.

---

## 3. Seeing what you built

There is a real GPU screenshot harness. **Use it every iteration — do not guess.**
Never claim something looks good without a PNG you have actually opened.

```bash
cd games/chronoforge-dawn
node tools/shot.mjs --shots hero,ridge --t 6.4 --out shots/mywork
node tools/shot.mjs --list                          # available angles
node tools/shot.mjs --js "__DAWN__.post({exposure:0.9})"   # live tweak
node tools/probe.mjs --shots hero --t 18            # measure, don't argue
```

Useful flags: `--w/--h`, `--t <hour of day>`, `--sim <seconds>`, `--quality
low|medium|high|ultra`, `--seq N` for a motion burst, `--probe`, `--params`, and
`--port` — **pick a unique port if another agent is running the harness.**

The harness exits non-zero and prints the errors if the page threw or a module
was quarantined. **A silent black PNG is worse than a crash** — always read the
exit output, and always open the file.

`window.__DAWN__` gives you `post()`, `probe()`, `stats()`, `seek()`, `step()`,
`setShot()`, `setTime()`, `digest()`, `reseed()`, and `ctx`. `battle()` and `teleport()`
throw until their lanes land — deliberately.

`__DAWN__.ctx` is a **probe seam**, added for tools that must *build* a scene rather
than photograph one — the Encounter Framing POC stages primitives on real terrain and
measures occlusion during the push-in, which `post()`/`probe()`/`stats()` cannot do
from outside. Read-only by convention. A lane that mutates shared core through it is
violating §1, and the fact that it compiles does not make it allowed.

### Measure, don't eyeball

`__DAWN__.probe()` returns a linear-light histogram plus a 16×9 tile map. A
healthy dawn frame reads **median 0.09–0.25, p90 < 1.2, whitePct < 2,
blackPct < 14** on the `exposed` tap. If you are fighting the look, probe first —
the answer is usually exposure, and twice in Phase 0 it was albedo.

---

## 4. Hard rules

1. **No binary assets and no network fetches.** Every texture, mesh and sound is
   generated in code. `render/textures.js` is the noise and baking kit. There are
   no PNGs in this repo except the ones the harness writes into `shots/`.
2. **No `Math.random()`.** Use `rng('your.stream')` from `core/rng.js` so captures
   are reproducible. Non-determinism makes review impossible.
   `npm run lint:rng` gates it.
3. **Frame budget: 16.6 ms, ≤900 draw calls, ≤2.6 M triangles at 1080p.**
   `stats().budget` reports it. Blowing it is a defect, not a trade-off.
4. **Do not disable a pass to make your thing look better. Fix your thing.**
5. **Nyquist.** Procedural detail finer than ~4× its consumer's sampling rate is
   noise, not detail. Pick octaves against the repeat you will actually use.
6. **Post-process units are pixels, not UVs.** A 0.05 offset is 96 px at 1920.
7. **Dispose what you replace.** `disposeTree()` in `core/engine.js`;
   `stats().geometries` and `.textures` show the counts.
8. **Clone a shared material before mutating it.** A mutated shared instance is a
   bug that surfaces three phases later in someone else's screenshot.
9. **The camera pitch is locked at 55° and never rotates or zooms for the
   player.** Battle may swing laterally and push in; it may not change pitch. The
   one licensed exception is a combo finisher — wrap it in
   `rig.beginCinematic()` / `rig.endCinematic()`, and `stats().cameraLocked` must
   be `true` again when it ends.
10. **Tiles are authoring data.** No tile index reaches the renderer, and no grid
    line reaches the screen. That is defect 2 and it is checkable from the `top`
    shot.
11. **A module that throws must not blank the screen.** Everything goes through
    `installModule`; if your lane is quarantined in `stats().modules`, that is
    your bug and the build is failing because of it.
12. **The prototype's game design is not up for redesign.** ATB math, enemy
    tiers, tech tables, drop tables, economy curves, the menu tab structure and
    the keyboard model are inputs. Rebuild the presentation, not the game.

---

## 5. The eight defects, and who owns each

Every one is checkable in a screenshot. These are the bar.

| # | Defect | Owner | Lands |
|---|---|---|---|
| 1 | Fog of war is opaque hard-edged squares on the tile grid | `world` | Tier 1 |
| 2 | The tile grid is drawn over the whole world | `world` | Tier 1 |
| 3 | Nothing casts a shadow, nothing touches the ground | `render` + `actors` | Tier 1–2 |
| 4 | The battle scene has no place — heroes on a purple gradient | `battle` | Tier 4 |
| 5 | The world is flat: one elevation, one lighting condition | `world` | Tier 1 |
| 6 | An enemy under fog renders as a grey ghost | `world` + `actors` | Tier 1 |
| 7 | Menu chrome is a 1 px neon rectangle | `ui` | Tier 5 |
| 8 | The HUD is unstyled debug text | `ui` | Tier 5 |

Keep the prototype's dev overlay — battle speed, fog toggle, minimap toggle,
reset, replay — and extend it. It is the most useful thing in that build.

---

## 6. What "AAA" means here, concretely

- **Silhouette first.** If it does not read at 100 px, no shader saves it.
- **Material variety.** Metal, painted dielectric, rock, dirt and emissive trim
  must respond differently to the same light. One grey plastic is the failure.
- **No untextured flat faces** in hero framing.
- **Light does the work.** Key/fill/rim separation, real IBL, contact shadows.
  Everything must visibly *touch* the ground it stands on.
- **Restraint in post.** Bloom, grain and vignette are seasoning. If a reviewer
  can name the effect, it is too strong.
- **Every frame is worth looking at.** The camera is locked precisely so that
  every reachable angle can be art-directed. There is no bad angle to hide behind.

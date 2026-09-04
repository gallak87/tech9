# Chronoforge Dawn — Concept

> **Rendering tier:** `threejs` (Three.js latest + Vite, plain ES modules)
> This document is authoritative for **what the game is**. `ARCHITECTURE.md` is
> authoritative for how the code is shaped; `CONTRACT.md` for who may edit what.

## Game Summary

Chronoforge Dawn is an overhead action-RPG built in Three.js and Vite — a ground-up presentation
remake of the Canvas-2D prototype in `games/chronoforge`, inheriting that build's content and
systems as a starting point and beating it outright — the rendering is replaced wholesale, and
anything else that is not up to snuff is remade rather than faithfully reproduced. A three-hero
party (Kaida, Vex, Rune) crosses a post-collapse Earth of neon city-states and alien-terraformed
ruins, laid out as a graph
of twelve discrete 45×30 maps: eight outdoor regions (Haventide T1 · Emberline T2 · Forest Veil T2
· Mire Bog T2 · Orbital Reach T3 · Frost Canyon T3 · Crater Ember T4 · Last Crown T4) plus four
city interiors, joined by eighteen doorway edges. Enemies roam visibly on the map; touching one
starts a Chrono Trigger-style ATB battle fought **in place** on the terrain where it triggered,
staged and lit, with no scene swap. Between fights the party levels, equips gear across three
slots, and grows a settlement in Haventide through four tech tiers (Survivor → Reclaimer →
Ascendant → Transcendent) on food, ore and energy. The player wins by reaching Transcendent tier
and killing the Void Architect; they lose on a party wipe with no reclaim resources left. The
prototype is a **donor and a floor** — content, systems and tone to start from, and explicitly not
the quality bar. Dawn is scored against an absolute standard: a frame worth putting on a store page,
and the eight named defects gone. The visual reference comes from the human before the final gate.

## Core Loop

**Overworld.** WASD or click-to-move drives the lead hero at a locked-pitch overhead camera; two
followers trail at fixed spacing; the camera damps behind. Terrain has real elevation, a physically
plausible sun and sky, time of day, weather that lands on surfaces, and a soft continuous
fog-of-war field with no square edges and no visible tile grid. Enemies are visible props on the
map, never grey ghosts under fog — concealment is binary and diegetic. Doorways move the party
between the twelve maps and into city interiors; every door returns you to the correct tile facing
the correct way.

**Battle.** Contact triggers an in-place start — lateral camera swing plus push-in at locked pitch.
Each actor fills an ATB gauge (heroes at `spd/59` per 16.67 ms, enemies at `spd/41` with a
tier-keyed head start of `(tier−1)×8`); at 100 the hero picks attack, a single-target or AoE tech
from the nine-entry tech table, or a dual/triple tech that spends multiple filled gauges for a
scripted finisher. Crits freeze time for 250 ms with screen-shake; combo finishers cut the camera
to frame their own actors, flash portraits and fire elemental VFX. Victory pays XP, renown and
rolls the enemy's drop table.

**Inventory.** The seventeen-item catalog ported from `ITEM_DEFS` spans three slots (weapon /
armor / accessory) and eight stats (str, int, tec, def, spd, crit, hp, mp). Items arrive three ways,
all ported: the starting kit, chance-rolled enemy drop tables, and the eight hidden world drops —
one per outdoor region. Every weapon is a distinct mesh on the rig's weapon socket, so equipping one
visibly changes the hero in the world and in battle. A drop is a diegetic event with an animation,
not a silent counter increment.

**Progression.** XP levels the heroes, skill points open tree nodes that add techs, and three gear
slots per hero show a live stat diff before an equip is confirmed. The pause overlay opens on Esc
or Tab from any scene and pauses the ATB; **Q/E** cycle its seven tabs (Map · Party · Inventory ·
Skills · Quests · Save · Settings), **1–7** jump directly, and the Map tab drags and zooms over the
explored world.

**Settlement.** Haventide's plot ring takes a town center, farms, mines, energy extractors,
barracks, forge, research lab and wall; workers yield food, ore and energy on a tick, spending them
upgrades a building's level, and enough levels advance the settlement's tech tier and visibly
transform the base.

**Failure / win / save.** A party wipe reloads the last save; the run ends only if the base is razed
with no reclaim resources. Win is Transcendent tier plus the Void Architect set-piece battle. Save
is a single `localStorage` slot that round-trips byte-identical.

## Target Feel

Dawn is the signature hour and the frame every reviewer will judge: long raking shadows, warm rim
light on a cold shadow side, atmospheric depth stacking behind a ridge. AAA fidelity meaning
material variety that survives a close crop, contact shadowing so nothing looks pasted on, and
weather that wets and dusts real surfaces. Characters read as crisp pixel-art silhouettes standing
on genuine 3D terrain — SNES-era readability, modern light.

Exploration is cautious wonder: cresting a rise and seeing a neon megacity burn through haze, or a
dead orbital elevator hanging in the sky. Combat is a fireworks show with weight — every hit lands
with a crunch, a crit stops the world for half a second, a triple tech takes the camera for two
seconds and gives it back. The settlement is tactile: ticks chime, workers move, an upgrade is
obvious in a screenshot.

Tone is hopeful post-apocalypse — magenta and cyan neon accents over dusty earth, reverb-heavy
synthwave, ruins that were somebody's home. **Never programmer art.** A flat, gridded, unlit frame
is a failure regardless of what the code underneath does.

## Scope Constraints

- **IN** — Three.js (latest) + Vite, plain ES modules, twelve-folder subsystem layout under `src/`,
  one shared `ctx` object per module, per the existing `ARCHITECTURE.md` and `CONTRACT.md`. Those
  two files and `docs/STATUS.json` are extended, never clobbered.
- **IN** — Every character is a low-poly 3D rig built in code, posed by an animation system,
  rendered through a pixel-snap and palette-quantise pass so it reads as a sprite. Weapons, armour
  and accessories are separate meshes attached to named sockets.
- **OUT** — Sprite generation, image-gen pipelines and binary art assets of every kind. No PNG, no
  model file, no audio file in the repo except what the harness writes into `shots/`. Terrain,
  buildings, foliage, VFX, UI and audio are generated in code. No `fetch`, no network, no downloads.
- **OUT** — `Math.random()`. Seeded RNG streams only, via `ctx.rng('lane.stream')`. Non-determinism
  is a defect and `tools/lintrng.mjs` enforces it.
- **IN** — The verification harness ships **before** the game it verifies, and `dev` owns `tools/`
  and its exit codes. Sixteen tools: `shot`, `probe` and `lintrng` exist; `sheet`, `blind`,
  `walk`, `door`, `duel`, `stage`, `fog`, `econ`, `save`, `digest`, `census`, `region`, `rig` and
  `play` are deliverables. Nothing may be claimed that has not been screenshotted and opened, or
  measured by the probe that answers that question — and **any agent reporting done must hand the
  orchestrator the artifact itself**: the probe stdout, the tool exit code, or the path of a PNG
  that was opened.
- **IN** — Every module ships a **showcase mode** staging a representative scene of just that
  module, and `window.__DAWN__` exposes `post()`, `probe()`, `stats()`, `seek()`, `step()`,
  `setShot()`, `setTime()`, `battle()` and `teleport()`.
- **IN** — **Inventory is a first-class system, not a menu tab.** The seventeen-item catalog, three
  slots per hero, eight stats and both acquisition paths (enemy drop tables, eight hidden world
  drops) are ported from the prototype's `ITEM_DEFS`. Equipping is **visible on the rig**: every
  weapon is its own mesh on the named weapon socket, so a sword swap changes the hero in the
  overworld, in battle and in the portrait. Loot drops are diegetic events with a drop animation.
- **IN** — The eight named prototype defects are the acceptance bar, each checkable in a
  screenshot: soft continuous fog with no quantisation; no tile grid anywhere; real contact
  shadowing and grounding for every actor and prop; battles staged on the terrain that triggered
  them; terrain with elevation and varied lighting; binary diegetic concealment with no grey-ghost
  enemies; menu chrome with depth, glow bleed and type hierarchy; a designed HUD.
- **IN** — Tiers ship in a fixed order, each playable and verified before the next starts:
  1 World & Light → 2 Traversal → 3 Places → 4 Encounters & Battle → 5 Progression → 6 Settlement.
  No jumping ahead.
- **IN** — The world is a graph of twelve discrete 45×30 maps ported from the prototype's `MAPS`
  table: eight outdoor regions across eight biomes plus four city interiors, 36 placed encounters,
  18 doorway edges, and exactly one hidden world drop per outdoor region. Build plots exist in
  Haventide only. Not one contiguous landmass.
- **IN** — Tier 1 finishes **two** regions at full fidelity, Haventide (`grassland_ruins`) and
  Emberline (`neon_wastes`); the other six block in and reach fidelity in the region buildout
  phase. Correctness is never deferred: `region.mjs`, `walk.mjs` and `door.mjs` pass on all twelve
  maps from Tier 1 onward.
- **IN** — **Improving on the prototype, systems included.** `chronoforge` is a donor and a floor,
  not a specification; Dawn exists to beat it. Its tuned numbers — ATB math, five enemy tiers, the
  tech table, drop tables, the twelve-map data, economy curves, the seven-tab menu and keyboard
  model — are the **default** starting point because they are already tuned and cheap to keep. Adopt
  them unless there is a stated reason not to, and **record the reason when deviating.** Net-new
  systems and outright remakes are welcome; every idea is open to discussion. What is **not** in
  scope is silently losing content: no hero, enemy, item, quest, region, building or menu capability
  disappears without it being called out.
- **IN** — The prototype's dev overlay (battle speed, fog toggle, minimap toggle, reset, replay) is
  kept and extended.
- **IN** — Battle starts in place with a lateral camera swing and push-in at locked pitch. There is
  no separate battle scene, no gradient backdrop, and no scene swap.
- **IN** — **Graphics restraint is a stated goal, not an afterthought.** Prior experience on a
  Three.js build (`vulpine`) was tuned so far up that several whole sessions went into tuning it
  back *down*. Effects are added because they earn a frame, not because they're available. The dev
  panel carries a live **FPS / frame-ms / draws** readout and a **five-notch quality lever**
  (cheapest → most expensive), so the cost of every look decision is visible *when it is made*
  rather than discovered later. `src/core/engine.js` already defines four tiers (low, medium, high,
  ultra) and needs a fifth notch; `ultra` keeps its name because `tools/shot.mjs` defaults to it.
- **IN** — **Quality tier is chosen by what the instrument is asking.** Still captures and critic
  scoring run at **`ultra`** — a look review should judge the best frame the build can produce, so
  `tools/shot.mjs` keeps its ultra default. Gameplay probes driven through Playwright/CDP (`walk`,
  `door`, `play`, `stage`, and anything reporting fps or frame time) instead read **the quality the
  human last set in the dev panel**, because a performance number measured at a tier the player
  never runs is a meaningless number. The lever persists to `localStorage` so probes and human are
  looking at the same build. A mismatch isn't dangerous — worth a quick word before a probe run,
  not a hard gate.
- **IN** — A hard performance budget: 60 fps at 1080p, 16.6 ms frame, 900 draw calls, 2.6M
  triangles. Blowing it is a defect, not a trade-off. Disabling a post pass to make a feature look
  better is forbidden.
- **IN** — Dawn at hour 6.4 is signed off at wide median **0.212**, p90 **0.51**, **0%** blown
  white, and must not regress. Exposure ramps over sun elevation via `EXPOSURE_RAMP` in
  `src/render/environment.js`, fixed per hour. No metering, no auto-exposure.
- **IN** — Scoring is **absolute, not comparative**. The critic scores 0–10 against a named visual
  reference and the eight named defects; `games/chronoforge` is inspiration and the content source,
  never the benchmark. Pass is ≥8.5 with zero console errors and a green probe, up to four rounds
  per tier. Scores are reported honestly, including failed rounds. Until the human supplies the
  visual reference, the signed-off dawn frame in `shots/exposure-ramp/h6.4` is the internal anchor.
- **IN** — The final gate is a **blind A/B** on shuffled, label-stripped pairs, judged against the
  human-supplied visual reference. The reference and the pairing rule arrive from the human before
  that gate is run; the gate is not designed or executed until they do.
- **IN** — `docs/STATUS.json` carries scores, probe results, frame budget and open issues so an
  interrupted run resumes from the weakest module.
- **OUT** — Multiplayer, networked play, cloud save, accounts, analytics, microtransactions.
- **OUT** — Procedural map, dungeon or quest generation. The twelve maps are authored data ported
  from the prototype.
- **OUT** — Voice acting and animated cutscenes. Text boxes with portrait flashes and scripted
  actor choreography only.
- **OUT** — Mobile and touch input. Desktop keyboard and mouse only.
- **IN but DEFERRED** — **Audio does not start until the first ATB battle effort.** Web Audio
  synthesis only (per-biome beds, battle stingers, tick chimes, surface-matched footfalls), no audio
  files in the repo — but the audio lane is not scheduled before the battle tier. Every earlier
  phase ships silent.
- **IN** — The **in-game dev panel** (`src/core/devpanel.js` — a DOM overlay the *human* clicks,
  distinct from the headless `tools/` probes) is preserved and never clobbered. Lanes add controls
  via `ctx.dev.register({group,label,type,get,set})` **from their own file**; editing
  `devpanel.js` to add a control is a contract violation. Extended on human request rather than
  pre-emptively, but any lane shipping a system the human will want to poke registers a control.
- **IN** — **Never more than two agents running concurrently.** A phase needing more work is split
  into sequential waves, not widened. The orchestrator may execute a lane itself rather than spawn.
- **IN** — **Frequent human feedback.** Every agent that finishes a unit of work decides, and
  states, whether a human manual QA pass on localhost is worth it before the next phase starts —
  naming what to look at and what would count as wrong. Automated gates do not replace this; they
  decide when to ask for it.

- **IN** — **Agents are expected to PROPOSE, not just execute.** Every lane may put forward changes
  to inherited design — topology, systems, content, pacing — and should say so in its report rather
  than silently conforming to what the prototype happened to do. A proposal names what changes, why
  the inherited version falls short, and what it costs. The orchestrator decides; **the agent does
  not need permission to propose.**
- **IN** — **Doorway topology is a design surface, and one change is DECIDED: edges are gated on
  settlement tech tier.** Locking a region behind a base upgrade is what makes the settlement
  economy matter to exploration — without it the base sim and the adventure are two games sharing a
  save file. The inherited graph is a **tree** (8 outdoor regions, 7 edges, zero cycles); the
  Emberline **T2 → Crater Ember T4** jump becomes *the hard way in* rather than a wall.
  **Gates are temporary, never permanent** — at maximum settlement tier every edge traverses both
  directions and the whole world is open. No permanent one-ways. Lateral cycles and one-way drops
  that unlock their return from the far side stay open for `level` to argue. Chrono-rifts on a
  seeded time-of-day schedule are **punted** to cool-to-have.
- **IN** — **Gate data is authored before the system that reads it.** Settlement tiers don't exist
  until Phase 9, but tech-gated edges are authored in Phase 1.2. The edge carries its required tier
  as **data** from the start; the runtime check stubs to *unlocked* until settlement lands, and
  `region.mjs` walks the graph across **every tier state** offline from Tier 1 onward regardless.
  Two invariants: every region reachable at some tier, and at max tier every edge traverses both
  ways. Without this the coupling surfaces as a Phase 9 surprise on content authored eight phases
  earlier.

## Known Unknowns

| Decision | Deferred To |
|---|---|
| Dual and triple tech pairings, their combined gauge cost, damage formula and cinematic beat timings — the prototype has combo framing but no combo mechanic, so these numbers do not exist to port | `gamedesign` |
| Rig proportions, joint counts, socket names, palette-quantise level count and pixel-snap resolution that make a code-built rig read as a sprite at overhead camera distance | `art` |
| Per-biome heightfield authoring — elevation range, ridge placement and prop density for each of the eight biomes, given the 45×30 maps must stay traversable and keep 36 encounters at combat clearance | `level` |
| Web Audio synthesis palette: ambient beds per biome, battle stingers, resource-tick chimes and surface-matched footfall SFX | `audio` |
| Whether item purchase and forge crafting exist in v1, and their price/recipe tables. The prototype has **no shop and no item exchange** — its forge is a settlement building in `base.js`, not a store. Like dual/triple techs this is additive, so there is nothing tuned to inherit | `gamedesign` |

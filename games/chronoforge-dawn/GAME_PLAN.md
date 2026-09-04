# CHRONOFORGE DAWN — Game Plan

## Team

| Agent | Notes |
|-------|-------|
| `dev` | Owns the engine, the shared ctx, all six stack-ranked tiers, and tools/ — the 13-probe verification harness is dev's deliverable, not an afterthought. Never merged. |
| `qa` | Runs every probe between waves and regression-sweeps six scenes (world, traversal, interiors, battle, menus, settlement) that must not break each other. Never merged. |
| `art` | Redefined for this game: owns the code-built 3D rig system, socket and pose library, the pixel-snap plus palette-quantise shader that makes a rig read as a sprite, the palette, and the UI chrome rebuild. Owns no sprite production because the concept forbids binary assets. Carries the Character Look Gate — the earliest and hardest gate in the project, and the one the prototype never had. |
| `level` | Owns the twelve-map world graph ported from the prototype MAPS table: eight outdoor regions plus four city interiors, each with tier, biome, fixed encounter placements, doorway edges with landing coordinates, one worldDrop, and per-city build plots. Adds elevation and vertical interest to each region without changing its footprint, connectivity, or encounter placement. A massive standalone deliverable. Ships the twelve maps as validated data files in Foundations — the embryo of region.mjs. Encounter placement must respect the combat clearance number the Foundations POC emits. |
| `gamedesign` | Ports the prototype battle.js and progression.js math into an authoritative spec (ATB rates, enemy tiers, tech tables, drop tables, economy curves), then owns battle-camera choreography and economy re-verification via econ.mjs. Design is ported and verified here, not reinvented. Ships the Encounter Framing POC in Foundations — primitives only — to validate the fight-in-place push-in before anything is built on it, and to emit the combat clearance number encounter placement depends on. ATB correctness is deliberately NOT gated early; duel.mjs catches it at Tier 4. |
| `audio` | Synthwave ambient beds per biome, combo stingers, resource-tick chimes and battle SFX — all synthesised in code via Web Audio, since the concept forbids binary assets including samples. First runs in Phase 7, alongside the battle it scores. Ships four synthesised signature sounds as playable files then, not a written description of them. Deliberately not in Foundations: nothing can trigger a sound until Tier 4, and a stinger tuned against no battle is tuned against nothing. |
| `devops` | Localhost confirmation in Phase 0, then a GitHub Pages redeploy after each playable tier so the user can beta-test while later tiers continue. Absorbs release. |
| `integrator` | The only agent permitted to edit shared core. Runs between waves from Phase 3 onward, applying builders' core-seam requests and enforcing the CONTRACT.md ownership table across six parallel lanes. |
| `critic` | Writes no code. Takes its own shots at several times of day and zoom levels, runs the lane probe, and scores 0-10 with the prototype as the 5 and the fixed defect list as the 8.5. Gates every visual tier. |
| `historian` | Runs last. This is the first tech9 game to use code-built rigs instead of generated sprites and the first to ship the verification harness before the game — both lessons directly change the framework defaults for the next game. |

**Skipped / Merged:**
- `asset` → merged into `art` — Merged per asset.merge.candidates. There are no binary assets to produce — the concept forbids them outright — and rig construction is art direction work in this game.
- `release` → merged into `devops` — Merged per release.merge.candidates. Static GitHub Pages deploy with no store page or marketing copy; versioning and changelog fold into devops.
- `postlaunch` → skipped — Skipped. The game is not launched and no player-support or hotfix rotation is in scope for v1. Revisit only after public release.
- `godot_dev` → skipped — Skipped. rendering_tier is threejs, and dev and godot_dev are never both active.
- `godot_techart` → skipped — Skipped. rendering_tier is threejs.
- `godot_tools` → skipped — Skipped. rendering_tier is threejs.

---

## Phase Plan

### Phase 0 — Engine Skeleton, Contract & First Light
Agents: `dev`, `devops`, `qa`

Vite + Three.js boot, the shared ctx object, the window.__DAWN__ debug API, ARCHITECTURE.md and CONTRACT.md with the binding file-ownership table, and the first two probes (shot.mjs, probe). DevOps confirms localhost serves and configures the GitHub Pages target without deploying yet.
QA gate: Localhost serves the page with zero console errors; tools/shot.mjs captures a PNG of a lit test scene and exits 0; ARCHITECTURE.md and CONTRACT.md exist and the ownership table covers every planned folder.

### Phase 1.1 — Foundations & Paper Prototypes *(parallel)*
Agents: `art`, `gamedesign`, `level`

Specs, each shipped with the smallest executable artifact that could prove it wrong. art specifies the code-built rig system (topology, sockets, pose library) and the pixel-snap plus palette-quantise approach — its proof is Phase 2. gamedesign ports the prototype math into an authoritative spec (validated later by duel.mjs, not here) AND builds the Encounter Framing POC: primitives only, no rig, proving the lateral swing and push-in at locked pitch finds a clean framing in dense foliage, against a cliff, on a slope and at night — and emitting the minimum combat clearance number that encounter placement must respect. level delivers the twelve-map graph with elevation and biome boundaries AS DATA FILES, validates them offline for connectivity, landing coordinates and content references, and authors provisional encounter placements — provisional because the clearance number does not exist yet. Artifacts are the smallest thing that can fail — not a head start on the feature. Audio is deliberately absent: it moved to Phase 7.
QA gate: Three specs exist and agree with each other; every one of the eight named prototype defects has a named owner; no spec requires a binary asset or a network fetch. The Encounter Framing POC shows a clean push-in framing with zero occluded actors in all four worst cases and reports a combat clearance number. The world graph validates offline with zero dangling doorways and every region reachable from Haventide. A spec whose artifact was not run does not pass this gate.

### Phase 1.2 — Encounter Placement Pass
Agents: `level`, `gamedesign`, `qa`

The one handoff inside Foundations that is invisible if left implicit. gamedesign has emitted a combat clearance number; level now validates all 36 provisional encounter placements against it and moves the ones that fail. An encounter sited with less than the required clear space around it cannot be framed by the push-in, and that is a level-data defect, not a battle-lane problem to solve later. Runs after 1.1 because the number cannot exist before the POC.
QA gate: Every one of the 36 encounter placements satisfies the combat clearance number, or is explicitly annotated as a deliberate tight-quarters fight that the battle lane must handle specially; the region data still validates offline with zero dangling doorways; the moved placements have not broken any doorway or worldDrop position.

### Phase 2 — Character Look Gate
Agents: `art`, `dev`, `critic`, `qa`

The riskiest unknown in the project, answered before anything can depend on it. art builds a working rig prototype for ALL THREE heroes — Kaida, Vex, Rune — plus the pixel-snap and palette-quantise pass and the socket system for swappable weapons. dev delivers rig.mjs. Renders each hero in six poses (idle, run, cast, hurt, attack, victory), each with three different weapons, at the locked 55-degree pitch, at three times of day, in both Tier 1 biomes. No world work, no traversal, no integration — a showcase scene and a scorecard. If this fails twice, work stops and the approach is reconsidered with the user rather than iterated again.
QA gate: rig.mjs reports identical palette histograms across all six poses per hero, silhouette area inside band, and zero material drift in the fixed head and torso sample; every hero reads as a crisp pixel silhouette at 100px and at locked pitch; the same hero is unmistakably the same character across all six poses and all three weapons; critic scores >=8.5 on the character look in both Tier 1 biomes at all three times of day. Two failed rounds is a hard stop, not a third attempt.

### Phase 3 — The Harness
Agents: `dev`, `qa`

Build the remaining eleven tools (rig.mjs shipped with the Character Look Gate; region.mjs grows from the Foundations graph validation rather than starting cold): sheet, blind, walk, door, duel, stage, fog, econ, save, digest, census, region. Every module ships a showcase mode staging a representative scene of just that module.
QA gate: All 15 tools run against the skeleton and exit 0 or fail loudly with a real reason; census and digest are green; every probe prints numbers rather than a verdict alone.

### Phase 4 — Tier 1: World & Light
Agents: `dev`, `art`, `level`, `integrator`, `critic`, `qa`, `devops`

Terrain with real elevation, the overhead camera rig at locked 55-degree pitch, sun/sky/IBL, time of day, weather that lands on surfaces, the post chain, and soft continuous fog of war. Haventide (grassland_ruins) and Emberline (neon_wastes) are brought to FULL fidelity — two different biomes, so the system is proven to generalise. The other six regions ship blocked in: correct footprint, elevation, collision, doorways and encounter placements, lit by the shared system, no bespoke set dressing. Fixes defects 1, 2, 5 and 6. First GitHub Pages deploy.
QA gate: A resolved depth and normal prepass exists in the render path and is verified by a probe, whether or not any effect consumes it yet; region.mjs reports a fully connected twelve-map graph with every region reachable from Haventide and zero dangling doorways — blocked-in regions included, no exemptions; fog.mjs reports a continuous field with no step discontinuity at any tile boundary; zero grid lines in any capture; free camera finds no unlit or untextured region in Haventide or Emberline; critic scores >=8.5 on BOTH finished regions with zero console errors; play.mjs opens a real Playwright-driven browser session a QA agent can drive interactively — send input, read state, capture on demand — so the build can be played and not only photographed; build is live.

### Phase 5 — Tier 2: Traversal
Agents: `dev`, `art`, `integrator`, `critic`, `qa`

Party of three moves — WASD and click-to-move, follower spacing, collision, footfalls matched to surface material, camera damping, locomotion poses on the rigs, and real contact shadows under every actor.
QA gate: walk.mjs exits 0 over a scripted three-minute route: 60fps sustained, zero collision escapes, zero clips through geometry, camera jitter inside budget, party arrives; critic >=8.5.

### Phase 6 — Tier 3: Places & Interiors
Agents: `dev`, `level`, `art`, `integrator`, `critic`, `qa`

Cities and buildings entered and left through real doors with their own interior lighting and a transition both ways. NPCs, shops and the forge.
Interior ambience arrives one phase late, in Phase 7, and that is the accepted cost of moving audio.
QA gate: door.mjs walks every doorway in the twelve-map graph and exits 0, including region-to-region chrono-rift edges and all four city interiors — correct return position and facing, no soft-lock, load hitch inside budget; critic >=8.5 on interior lighting.

### Phase 7 — Tier 4: Encounters & Battle
Agents: `dev`, `art`, `gamedesign`, `audio`, `integrator`, `critic`, `qa`, `devops`

Roaming enemies, in-place battle start with a lateral swing and push-in at locked pitch (no scene swap, no load), ATB gauges, single-target and AoE techs, dual and triple techs, time-freeze crits, camera cuts on combo finishers, portrait flashes and elemental VFX. Fixes defects 3 and 4. Redeploy.

audio starts here and carries what was originally Foundations work: the synthesis catalog, the eight biome ambient beds, and the four signature sounds as playable files. It now tunes them against a battle that exists rather than against a description of one.
QA gate: duel.mjs resolves 200 seeded battles with zero deadlocks, time-to-kill inside band, and an observed loot distribution matching the declared drop tables with no item stuck at zero; stage.mjs confirms every combo finisher frames its own actors and the cut lands on the hit, AND that the push-in finds a clear framing in worst-case terrain (dense foliage, against a cliff, on a slope, at night) with no occluded actor; render-audio.mjs writes the four signature sounds as files and they have been listened to; critic >=8.5; build is live.

### Phase 8 — Tier 5: Progression & Menus
Agents: `dev`, `art`, `level`, `integrator`, `qa`

XP, levels, an owned-item grid with three gear slots per hero, equippable by click-then-slot and by drag-and-drop, skill trees, and the seven-tab pause overlay ported from the prototype verbatim in structure and keyboard model, re-skinned per defect 7. Quest log and localStorage save.
QA gate: save.mjs round-trips the full game state byte-identical; every equip shows a correct stat-diff preview BEFORE committing, via both click-then-slot and drag-and-drop; census.mjs reports zero orphaned items and all eight worldDrops are placed, findable and survive save/load; all seven tabs navigate by Q/E and 1-7; critic >=8.5 on menu chrome and HUD.

### Phase 9 — Tier 6: Settlement & Economy
Agents: `dev`, `art`, `gamedesign`, `integrator`, `qa`

Settlement reads the per-city plots rings from level data. Town center, farms, mines, energy extractors, workers, resource ticks, and four tech tiers that visibly transform the base.
QA gate: econ.mjs simulates four hours of game time with no starvation and no runaway on any resource curve; a tier-up is unmistakable in a single screenshot.

### Phase 10 — Region Buildout
Agents: `dev`, `art`, `level`, `integrator`, `critic`, `qa`, `devops`

Bring the remaining six regions to full fidelity as one repeatable pass, now that the complete loop — traverse, enter, fight, level, build — is proven in Haventide and Emberline. Forest Veil (forest_veil), Mire Bog (mire_bog), Orbital Reach (frozen_ruins), Frost Canyon (frost_canyon), Crater Ember (crater_ember), Last Crown (alien_terraform). Each gets its bespoke vistas, set dressing and landmark composition; each keeps its existing footprint, doorways and encounter placements unchanged.
QA gate: critic scores each of the six regions INDIVIDUALLY at >=8.5 — a region is not done because its neighbour passed; all eight biomes visually distinct in a contact sheet; region.mjs, walk.mjs and door.mjs still green across all twelve maps; frame budget held in the densest region; build is live.

### Phase 11 — Vertical Slice, Blind Gate & Release
Agents: `integrator`, `critic`, `dev`, `qa`, `devops`, `historian`

The slice: dawn over the coast, into a city, into a shop, out to an encounter, win the fight, spend the loot. Whole-game critic pass, then blind A/B judging against the prototype at matched location, time and framing. v1.0.0 tag, changelog, final deploy. Historian writes the lessons.
QA gate: Blind judges prefer Dawn at matched framing and can tell which is the remake; full slice playable with zero console errors; every probe green; v1.0.0 live on GitHub Pages; lessons written to meta/LESSONS.md.

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| Rig topology, joint count, pose library size, and the pixel-snap/palette-quantise shader parameters that make a 3D rig read as pixel art | art |
| Orthographic scale at the locked 55-degree pitch, depth-of-field falloff curve, camera damping constants, and the full post-processing chain order and parameters (the pitch itself and the no-rotation/no-zoom model are decided, not deferred) | dev |
| World map layout, elevation profile, biome boundaries, city and door placement, encounter density, and the difficulty curve | level |
| Battle camera choreography — cut timings, framing rules per tech, and the time-freeze and screen-shake envelopes | dev |
| Fog-of-war field representation and the continuity threshold the fog probe asserts against | dev |
| Synthwave ambient beds, combo stingers, resource-tick chimes and battle SFX, all synthesised in code | audio |
| Shop and forge currency — the prototype has no trade currency (its cost fields are skill and building costs), so decide whether shops trade in renown, a new salvage currency, or barter against the settlement resource pool | gamedesign |

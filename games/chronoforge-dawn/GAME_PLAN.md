# CHRONOFORGE DAWN — Game Plan

## Team

| Agent | Notes |
|-------|-------|
| `gamedesign` | Owns the one net-new mechanic: dual and triple tech pairings, combined gauge cost, damage formula and cinematic beat timings. Owns the call on which prototype systems are adopted as-is, which are remade, and which are replaced outright — the tuned tables are a default, not a mandate, and a deviation needs a stated reason rather than permission. Split from level — the world is a non-linear twelve-map graph across eight biomes, not a linear level. Co-owns the tech-gate curve with level: which settlement tier opens which region, and whether that pacing works against the XP curve. |
| `art` | Owns the rig spec (proportions, joint counts, socket names, palette, quantise level count, pixel-snap resolution), the material language, menu chrome and HUD design. Produces specs and in-code direction only — there is no asset production step in this game. Also owns the look of a loot drop and the inventory grid. Reads docs/PROTO-REF.md for what the prototype actually renders. |
| `level` | Owns the twelve-map graph ported from the prototype MAPS table, per-biome heightfield authoring across eight biomes, 36 encounter placements at combat clearance, 18 doorway edges and 8 world drops. Split from gamedesign per split_when: non-linear paths and multiple zones. EXPLICITLY LICENSED TO REDESIGN THE GRAPH. The inherited topology is a tree — 8 outdoor regions, 7 bidirectional edges, zero cycles — so Emberline sits on the path to five of the other seven regions and every trip is out-and-back, and Crater Ember T4 hangs directly off Emberline T2 as a two-tier jump. Propose a better graph rather than porting this one. Interiors are entered by a separate city mechanism, not by doorway edges. Tech-gated edges are DECIDED and yours to place; gates must be temporary so max tier opens the whole world. |
| `audio` | Active but DEFERRED by human decision: the audio lane does not start until the first ATB battle effort (Phase 7). Web Audio synthesis only — per-biome ambient beds, battle stingers, resource-tick chimes, surface-matched footfalls. No audio files in the repo. Every phase before 7 ships silent. |
| `dev` | Never merged. Owns all src/ code at rendering_tier threejs. ALSO OWNS tools/ AND ITS EXIT CODES — the thirteen unwritten instruments (sheet, blind, walk, door, duel, stage, fog, econ, save, digest, census, region, rig, play) are dev deliverables, folded in by human decision rather than given a separate harness role. Dev must hand the orchestrator real evidence with every done claim, and must decide and state when a human manual QA pass is worth it. Preserves src/core/devpanel.js — the human-facing DOM overlay — and adds controls only through ctx.dev.register from its own file. Also owns the inventory system: seventeen ported items, three slots, drop tables, eight world drops, and weapon meshes on the rig socket. Adds effects because they earn a frame, not because they are available — a prior Three.js build was over-tuned and cost several sessions of tuning back down. Gameplay probes read the dev-panel quality from localStorage rather than forcing a tier; still captures stay at ultra. |
| `qa` | Never merged; independent of dev. Owns test plans, regression checks and playtest notes, and reads the harness output rather than building it. Signs off localhost before any deploy step. |
| `devops` | Never merged for Phase 0. Owns the Vite dev server on a unique port, the build, and deploy. The app must stay loadable at all times — a broken localhost blocks every other lane. |
| `release` | Split from devops per split_when: the launch involves a blind A/B gate, store-page-grade screenshots, a changelog and a version tag, not just a push. Also absorbs postlaunch. |
| `historian` | Runs once after the final phase. The CLAUDE.md rule that every phase and sub-phase gets its own commit exists specifically so the historian can read where things broke from git log. |
| `integrator` | Active and load-bearing. This is a multi-lane build over twelve subsystem folders with one shared core; ARCHITECTURE.md already marks src/core/ INTEGRATOR ONLY and CONTRACT.md already carries the file-ownership table. Runs between waves: applies core-change requests, proves the app still loads and every lane probe still exits zero, and reverts any builder that edited outside its lane. |
| `critic` | Scores 0-10 against a named visual reference and the eight named defects — absolute, not against the prototype. Writes no code, never fixes what it finds, returns a ranked issue list. MUST NEVER run in the same parallel wave as the builder it grades: scoring a build that is still being edited produces a confident number worth nothing. Scores stills at ultra — a look review judges the best frame the build can produce. |

**Skipped / Merged:**
- `asset` → skipped — SKIPPED. Scope constraint: no sprite generation, no image-gen pipeline, no binary art assets of any kind. There is nothing for an asset artist to produce — every rig, texture, mesh, VFX and sound is generated in code, which is dev work. Merging asset into art would imply an asset pipeline that this game deliberately does not have. Note: Ollama image-gen IS available on this machine and must not be used.
- `postlaunch` → merged into `release` — MERGED into release per merge_when: nothing is live and there are no players, so post-launch is only watch-for-breakage. Scope constraint rules out accounts, analytics and cloud save, so there is no support surface to own.
- `godot_dev` → skipped — SKIPPED. rendering_tier is threejs, and dev and godot_dev may never both be active. Capability check also shows no .mcp.json, so the godot-mcp bridge is not wired.
- `godot_techart` → skipped — SKIPPED. Godot-only role; the tier is threejs.
- `godot_tools` → skipped — SKIPPED. Godot-only role; the tier is threejs. Its web-equivalent responsibility (the verification harness) is folded into dev by human decision.

---

## Phase Plan

### Phase 0 — Engine Skeleton, Contract & First Light
Agents: `dev`, `devops`

COMPLETE. Engine, shared ctx, __DAWN__ debug API, render stack (camera rig, environment, materials, textures, postfx, probe), twelve module stubs behind live install seams, ARCHITECTURE.md, CONTRACT.md, docs/STATUS.json, and tools/shot.mjs + probe.mjs + lintrng.mjs. Dawn at hour 6.4 signed off.
QA gate: PASSED and re-verified this session: node tools/probe.mjs --shots wide --hour 6.4 returns median 0.212, p90 0.51, 0.00% blown white, 4.7ms, 78 draws. Zero console errors.

### Phase 0.1 — Twilight & Night Lighting
Agents: `dev`

COMPLETE. Both broken bands brought inside the STATUS band, the five-notch quality lever shipped
(`potato` added below `low`; `ultra` keeps its name), and the FPS/frame-ms/draw/triangle readout is live.
Closes dusk-cliff and P0-5-as-a-cliff. TW-1/2/3 remain as look notes for 4b.

Human-reported and measurement-confirmed: the world falls off a cliff into near-black outside daylight. ridge at 19.75h reads median 0.118 / 0.0% black; at 20.0h it reads 0.006 / 34.1% black — a 20x drop across 15 minutes of game time. 5.1h is worse at 0.004 / 60.3% black, and 21.5h is 0.012 / 41.8%. The stated band in docs/STATUS.json is median 0.09-0.25 with blackPct < 14, so these hours violate an already-agreed gate. This is NOT the exposure ramp: exposure is already climbing to compensate (1.24 at 5.1h, 1.72 at 20.0h, versus 1.05 at signed-off dawn) and getting nothing back, and 19.75h shows clip 1.69% with p99 3.52 from that same over-gain. The cause is that there is no twilight or night lighting model — KEY_RAMP falls toward zero as the sun drops below the horizon and nothing replaces it: no moon key, no sky ambient floor, no twilight scattering term. Closes open issues dusk-cliff and P0-5, and unblocks the Night and Dusk buttons already sitting in the dev panel. Also lands the graphics-cost instrumentation, because every look decision from Tier 1 onward is made against it: the dev panel gains a five-notch quality lever (the engine has four tiers in src/core/engine.js and needs a fifth; ultra keeps its name because tools/shot.mjs defaults to it) alongside the FPS, frame-ms, draw and triangle readout it already carries. Current tuning is NOT changed in this phase — the lever exposes cost, it does not re-tune the look. The lever persists to localStorage so the Phase 3 gameplay probes and the human are measuring the same build.
QA gate: Sample only the two broken bands at 0.1h steps: 4.8-5.5h and 19.7-20.5h, on ridge and wide. No 24-hour sweep — the human has eyeballed the rest and signed it off. Within each band every sample satisfies docs/STATUS.json: blackPct < 14, whitePct < 2, p90 < 1.2, and no adjacent pair differs in median by more than 2x, so the cliff becomes a number that cannot come back. Then five spot checks at the hours already baselined in STATUS.json (6.4, 9.9, 12, 18.5, 21.5) purely to prove the fix did not drag the good hours with it — signed-off dawn 6.4 must still read median 0.212 / p90 0.51 / 0.00% white. Frame budget holds. HUMAN QA WARRANTED — this is the designated early graphics-cost pass: scrub the hour slider through both bands and confirm the transition reads, then sweep the five-notch quality lever end to end watching the FPS and draw readout, and confirm the game still reads at the cheapest notch. The lever and the readout are deliverables of this phase, not of Tier 1. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened.

### Phase 1.1 — Systems & Look Specs *(parallel)*
Agents: `gamedesign`, `art`

COMPLETE. Eight runnable specs in `docs/specs/`: combo-techs, heightfields, hud, inventory,
palette, rig, tech-gates, world-graph. Each is executable and exits 0.

gamedesign writes the dual/triple tech spec (pairings, combined gauge cost, damage formula, beat timings), the inventory spec over the seventeen ported items, and a call on whether shop/forge exchange exists in v1. art writes the rig spec (proportions, sockets — weapon socket must carry distinct meshes, palette, quantise levels, pixel-snap resolution) plus the material, menu-chrome, HUD and loot-drop language. Two agents, no more. Reference evidence: docs/PROTO-REF.md and the ten archived frames in shots/proto-ref/ — read them before writing the spec; do not work from memory of the prototype. Three findings there are spec inputs and not optional: blob-shadow colour currently carries friend/foe read and real contact shadows will destroy that affordance unless art replaces it; menu portraits are placeholder letter-circles so the rig must GENERATE the portrait with nothing to match; and the title screen exists in the prototype but appears in no tier — it lands in Tier 5 with the rest of the menu chrome.
QA gate: Every spec ships a runnable artifact, not prose. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 1.2 — World Data Port & Heightfields
Agents: `level`

COMPLETE. `docs/specs/world-graph.mjs` PASS — 12 maps, 24 doorway records, 10 edges (the inherited
7-edge tree plus 3 lateral cycles), every landing in-bounds, passable and reciprocal, every region
reachable at some tier and every edge two-way at max tier. `heightfields.mjs` carries a WORKING field:
`heightAt(biomeId, x, z)` over eight authored biomes, all inside their slope caps. Both exit 0.

level ports the twelve-map graph from the prototype MAPS table and authors per-biome heightfield parameters across the eight biomes, keeping all twelve 45x30 maps traversable. Reference evidence: docs/PROTO-REF.md and the ten archived frames in shots/proto-ref/ — read them before writing the spec; do not work from memory of the prototype. TOPOLOGY: tech-gated edges are DECIDED — place them, with the required tier carried as edge DATA and the runtime check stubbed to unlocked until settlement ships in Phase 9. Gates are temporary; at max tier the whole world traverses both ways. Lateral cycles and one-way drops remain open proposals to argue for. Chrono-rifts are punted.
QA gate: Offline graph walk: every doorway target names a real map, every landing coordinate is in-bounds and passable, every region reachable from Haventide. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 1.3 — Encounter, Doorway & World-Drop Placement
Agents: `level`

COMPLETE. Folded into the same two gates: 36 encounters naming 18 distinct enemies all clear combat
staging, 8 world drops one per outdoor region, all 17 items reachable. Four tier-coherence exceptions
are KNOWN and logged. Two donor defects fixed (DONOR-4, DONOR-5); one doorway moved (LVL-DOOR-1).

level places all 36 encounters against combat clearance, confirms the 18 doorway edges are bidirectional unless deliberately one-way, and places the eight world drops, one per outdoor region, each naming a real item. Doorway count is whatever the accepted topology needs; 18 was the inherited number, not a target.
QA gate: region.mjs walks the graph across EVERY settlement tier state offline: every region reachable at some tier, and at maximum tier every edge traversable in both directions with no permanent one-way. Every encounter and world drop names something that exists in the ported tables. No orphans. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 2 — Character Look Gate  *(ON HOLD — 2026-09-05 human decision, this session)*
**Character pipeline lives in `docs/phase2-retry/` — read `docs/phase2-retry/README.md` before touching Kaida's mesh.**
Agents: `art`, `dev`, `critic`

dev builds one code-built hero rig from the art spec — low-poly, socketed, posed by the animation system, through the pixel-snap and palette-quantise pass. art directs, critic scores. This gate exists because the rig approach has never been built and failing it throws away the whole character pipeline. HARD STOP AT 2 ROUNDS. Ships a rig viewer registered into the dev panel so the human can click to see the character the moment it exists, and click again to play each pose transition.
QA gate: HUMAN-VISIBLE GATE: a dev-panel control shows the rig on demand and plays its animations on demand — the moment a character is created it is clickable, and the moment an animation lands it is clickable. tools/rig.mjs exits 0: matching palette histograms across poses, silhouette area in band, zero material drift in a fixed head and torso sample. Two rounds maximum. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 2.0.1 — Free-Roam Play Sample
Agents: `dev`

COMPLETE. Human decision: the staged showcase is too prescribed — it can only be judged on what it chose to show. `?play=1` boots Kaida on real terrain under WASD with the locked follow camera, so the human finds what a fixed lineup hides: how she reads from behind, how she crests a dune, whether her feet touch the ground on a slope. Lives in src/traversal/ as a SAMPLE, not the tier — party of three, collision and footfalls stay in Phase 5. Adds Animator.timeScale so clip rate follows ground speed and the feet stop skating.
QA gate: PASSED. Real keyboard through playwright: idle 0 -> run 3.99 -> sprint 7.60 -> release 0.02 m/s, camera follows, rig.assertLocked() true, zero module faults, 168 fps. Slopes of 16.6-38.3 deg reached while driving. Artifact: shots/play/run-a.png at 38.3 deg.

### Phase 2.x — CHARACTER REDESIGN: KAIDA ONLY

Human decision, and the reason Phase 2 did not pass: every part of every character is one primitive — `prism()`, a tapered box — and src/actors/rig.js says so in its own comment. Snap, tone bands and palette are all downstream of a silhouette made of rectangles; no tuning of the three fixes it. SCOPE IS KAIDA ALONE. Nail her, and she becomes the reference every other character is built against. Vex, Rune, the grunt, per-character animation clips and the victory/cast tweaks all wait.

The 2D sprites in games/chronoforge/src/assets/ are a DESIGN INPUT, NOT A SCORING TARGET. Take the originality from them — the pink bob, the glowing blue blade, the fact that every character is distinct. Do NOT build an A/B scorer that grades the 3D cross-section approach against 2D illustration pixels; that optimises toward the wrong thing.

THE HUMAN IS THE LOOK GATE. An agent critic may only hold ground the human has already taken: once a part is signed off it is hash-locked via gate.fingerprint(part), and the critic asserts it has not drifted. It never judges an unsigned part. Symmetric parts derive — left arm signed means the critic covers the right.

### Phase 2.0.2 — RESOLVED: mesh source
Agents: `human`

GATES 2.1. Kaida's mesh is either code-built (status quo) or a rigged model file in the repo. Rigid skinning means nothing deforms, so limb shells rotate apart at every joint and leave gaps you can see through; a smooth-skinned mesh does not have this problem structurally. The art policy's ban on binary assets was reasoned about IMAGE GENERATION — "cannot draw the same character twice" — and a rigged .glb has exactly the property that reasoning wanted, so the ban does not transfer on its own logic. Options, cost and what survives a swap are in docs/PHASE2-HANDOFF.md. Only buildActor's shell changes under any option; skeleton, poses, ground IK, gates, material, sockets and the play-tester all survive.
RULED 2026-09-04: Kaida's mesh is GENERATED, not code-built. The binary-asset ban is overturned for character meshes and their textures; it stands for procedural world materials. Pipeline spec and stage status: docs/phase2-retry/README.md.

### Phase 2.1 — Art Re-Spec, Kaida
Agents: `art`
Unblocked by 2.0.2, and SUPERSEDED BY IT. 2.1-2.3 all assume code-built geometry; a generated mesh makes station tables, the geobuild port and per-part silhouette passes moot. Rewrite 2.1-2.3 against docs/phase2-retry/README.md before executing them.

art re-authors the rig spec from Kaida's own six sprites: cross-section station tables for torso and limbs (rx/ry/p per station, geobuild's format), head and hair volumes, proportions including head-to-height ratio, and her palette read off the sprites rather than invented. Deletes the IFF chest triangle — friend/foe read is deferred and must not be a badge on her chest.
QA gate: the spec ships as runnable station tables geobuild can consume directly, not prose. Report must ship the artifact.

### Phase 2.2 — geobuild Port
SUPERSEDED by 2.0.2 — assumes code-built geometry. See docs/phase2-retry/README.md.
Agents: `dev`

Lift games/vulpine/src/render/geobuild.js into src/render/. It is a clean take — imports only THREE and mergeGeometries, zero vulpine coupling — and it carries loft(), superellipse(count, rx, ry, p), chamferBox(), extrudePoly(), tubeAlong(), shellArc(), mirrorX(). The `p` exponent is the box-to-round knob: p=2 ellipse, p=4 rounded rectangle, p to infinity box. That is the primitive src/actors/rig.js does not have.
QA gate: a lofted limb builds and renders; tools/rig.mjs --selftest still exits 0; frame budget holds.

### Phase 2.3 — Kaida, Silhouette Then Detail
SUPERSEDED by 2.0.2 — assumes code-built geometry. See docs/phase2-retry/README.md.
Agents: `dev`, `art`, human gate

Two passes, per human decision. PASS 1: whole body as rough lofted masses, one sign-off — proportion and silhouette judged in a single look, because proportion is the thing that cannot be fixed later. PASS 2: head, hair, torso, arms, legs, sword — one sign-off each. Rig viewer gains part isolate, turntable, and an A/B toggle against the last accepted version of that part.
QA gate: HUMAN. Each signed-off part is hash-locked and the critic holds it from then on. No automated look score.

### Phase 2.4 — Ground Contact
Agents: `dev`

Slope-aligned root (40-60% toward world.normalAt, never 100%), two-bone foot IK, torso lean by slope, stride shortening uphill, and real contact shadow. Closes rig-no-slope-response and the actor half of defect 3.
QA gate: feet plant on 34 deg — MAX_WALKABLE_SLOPE_DEG — with no float and no bury, measured not eyeballed.

### Phase 2.5 — FINAL GATE: Kaida Runs the Dune
Agents: human

Human drives her uphill and downhill on real terrain and calls it. This is the gate Phase 2 should always have had.
QA gate: HUMAN, and blocking.

hey i need us to set a gate here, i'll explain when we chat (remind me: character improvement loop, 1 subagent per character if possible)

### Phase 3 — The Harness
Agents: `dev`, `qa`

PROGRESS: 6 of 16 tools exist — shot, probe, lintrng, rig, ground, region. `region.mjs` is being built
under Phase 4a because Tier 1 could not be gated without it. The remaining eleven stay here.

dev writes the thirteen remaining instruments in tools/: sheet, blind, walk, door, duel, stage, fog, econ, save, digest, census, region, play. Each exits non-zero on failure. Every module gets a showcase mode and __DAWN__ gains post, probe, stats, seek, step, setShot, setTime, battle and teleport. This ships BEFORE the game it verifies.
QA gate: All 16 tools run and exit 0 against the current build. Each tool proves it can detect a positive case before its null result is trusted. qa reviews coverage: does each named defect have an instrument that would catch its return. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 4a — Tier 1: World Build-out
Agents: `level`, `dev`

COMPLETE. All twelve maps build and switch. `region.mjs` exits 0 live across all twelve with every
live-vs-authored delta at 0.000 m — doorway conversion, landing height, encounter clearance, plot slope —
and its `--selftest` catches all ten injected faults. 21,901 verts / 43,200 tris per outdoor map in one
draw call, 1.66% of the triangle budget; 3.6-4.6 ms, 13-14 draws. No geometry leak across 65 setMap calls
(44 -> 44). `proto` held its signed-off baseline exactly: dawn 6.4 wide reads median 0.212 / p90 0.51 /
0.00% white. Nine new issues logged LVL-11..LVL-19 and TOOL-1; the look ones belong to 4b.

SPLIT FROM PHASE 4 by human decision. `src/render/` is the surface Kaida's look is judged through, and
re-tuning it underneath an in-flight character sign-off invalidates every part already accepted. So Tier 1
splits at the folder boundary and 4a takes `src/world/` alone.

The twelve maps become buildable and switchable: the heightfield runtime over the eight authored biomes,
`?map=<id>`, `__DAWN__.setMap()`, and blocked-in ground coloured from each biome's albedo table. No props,
no scatter, no fog of war, no weather, no lighting work. Shared API contract: `docs/specs/world-runtime.md`.

The Phase 0 placeholder is PRESERVED as `?map=proto` and stays the default. Every probe baseline in
docs/STATUS.json was measured on it, and Phase 2.5's character gate drives on its dune.
QA gate: all 12 maps build with zero console errors and `region.mjs` walks them live — every doorway landing
in-bounds, passable, reciprocal and under DOOR_MAX_SLOPE_DEG against the LIVE field, every encounter clearing
staging, live-vs-offline deltas reported per map. region.mjs proves it catches an injected fault before its
null result is trusted. No geometry leak across twelve setMap calls. Frame budget holds. `proto` has not
regressed: dawn 6.4 still reads median 0.212 / p90 0.51 / 0.00% white.

### Phase 4b — Tier 1: Light & Post
Agents: `level`, `dev`, `integrator`, `critic`

BLOCKED until the character gate closes — `src/render/` is frozen while Phase 2 is live.

Sun/sky/IBL, time of day, weather that lands on surfaces, the post chain including the depth+normal prepass,
soft continuous fog of war, and the overhead camera rig at locked pitch. Haventide (grassland_ruins) and
Emberline (neon_wastes) reach full fidelity; the other six stay blocked in from 4a. Kills defects 1, 2, 5 and 6.
QA gate: fog.mjs proves the fog field is continuous along a transect with no step discontinuity at a tile boundary. No grid anywhere in any capture. region.mjs still green on all twelve maps. play.mjs drivable. Depth+normal prepass exists. Frame budget holds. Dawn 6.4 has not regressed. Critic scores both regions >=8.5 individually. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 5 — Tier 2: Traversal
Agents: `dev`, `integrator`, `critic`

Party of three moves on WASD and click-to-move, follower spacing, collision, footfalls matched to surface material, camera damping, run/idle/turn poses, and real contact shadows on every actor.
QA gate: walk.mjs drives real keyboard input along a scripted three-minute route and reports 60fps held, zero clips through geometry, frame-to-frame camera jitter in band, and that the party actually arrived. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 6 — Tier 3: Places & Interiors
Agents: `level`, `dev`, `integrator`, `critic`

The four city interiors, buildings you enter and leave, doors, interior lighting, the transition both ways, NPCs standing where they belong, shops and the forge.
QA gate: door.mjs enters and exits every door across all twelve maps, asserting return position, facing and load hitch. No interior can be soft-locked. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 7 — Tier 4: Encounters & Battle
Agents: `gamedesign`, `dev`, `audio`, `integrator`, `critic`

Visible roaming enemies, in-place battle start (lateral swing plus push-in at locked pitch, no scene swap), ATB gauges, single-target and AoE techs, dual and triple techs, crits that freeze time, camera cuts on combo finishers, portrait flashes, screen-shake, elemental VFX, and audio stingers. Kills defects 3 and 4. This is where the audio lane starts — everything before this phase shipped silent.
QA gate: duel.mjs runs 200 seeded battles with no deadlock, time-to-kill inside band, every combo fires, and loot matching the ported drop tables. stage.mjs confirms each actor is in frame during its own combo finisher and the cut lands on the hit. Four sounds rendered and actually listened to. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 8 — Tier 5: Inventory, Progression & Menus
Agents: `dev`, `art`, `integrator`, `critic`

XP, levels, the seventeen-item inventory across three gear slots per hero with weapon meshes swapping on the rig socket, skill trees, the seven-tab pause overlay with the ported keyboard model, quest log (4 ported quests), and localStorage save. Re-skinned per defects 7 and 8, and the dev overlay is fixed so it stops appearing in captures. Includes the title screen (neon wordmark, CONTINUE/NEW GAME, save-summary line) which the prototype has and the tier plan never named. Reference evidence: docs/PROTO-REF.md and the ten archived frames in shots/proto-ref/ — read them before writing the spec; do not work from memory of the prototype.
QA gate: save.mjs round-trips full game state byte-identical. Every equip shows a correct stat diff AND a visible mesh change on the rig. census.mjs confirms all 17 items are reachable via a drop table, a world drop or the starting kit. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 9 — Tier 6: Settlement & Economy
Agents: `dev`, `integrator`, `critic`

Town center, farms, mines, energy extractors, workers, resource ticks on food/ore/energy, and the four tech tiers Survivor to Reclaimer to Ascendant to Transcendent that visibly transform the base. Build plots are Haventide only. Also unstubs the tech-gate check authored back in Phase 1.2: doorway edges start reading real settlement tier instead of always-unlocked.
QA gate: Tech-gated doorways now read real settlement tier and region.mjs still passes both invariants against live state rather than stubbed. econ.mjs simulates four hours of game time: no starve, no runaway, every resource curve plotted. A tier-up is obvious in a screenshot. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 10 — Region Buildout
Agents: `level`, `dev`, `critic`

The remaining six regions (Forest Veil, Mire Bog, Orbital Reach, Frost Canyon, Crater Ember, Last Crown) come up from blocked-in to full fidelity across their biomes.
QA gate: Critic scores each region INDIVIDUALLY at >=8.5 — never an average across six. census.mjs confirms every enemy, item, quest, building and door is reachable and referenced, with no orphans. digest.mjs proves no unintended change to previously signed-off output. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

### Phase 11 — Vertical Slice, Blind Gate & Release
Agents: `qa`, `release`, `historian`

End-to-end playable slice, the blind A/B gate against the human-supplied visual reference, changelog, version tag and v1.0.0. historian then writes the cross-game lessons from git log.
QA gate: BLOCKED ON HUMAN INPUT: the visual reference and the pairing rule for the blind gate come from the human before this phase is designed or run. Full playthrough with zero console errors, every tool green, frame budget held. Report must ship the artifact: probe stdout, tool exit code, or the path of a PNG that was opened. Agent also states whether a human manual QA pass on localhost is warranted, naming what to look at and what would count as wrong.

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| Dual and triple tech pairings, their combined gauge cost, damage formula and cinematic beat timings — the prototype has combo framing but no combo mechanic, so these numbers do not exist to port | gamedesign |
| Rig proportions, joint counts, socket names, palette-quantise level count and pixel-snap resolution that make a code-built rig read as a sprite at overhead camera distance | art |
| Per-biome heightfield authoring — elevation range, ridge placement and prop density for each of the eight biomes, given the 45x30 maps must stay traversable and keep 36 encounters at combat clearance | level |
| Web Audio synthesis palette: ambient beds per biome, battle stingers, resource-tick chimes and surface-matched footfall SFX | audio |
| The visual reference the critic scores against, and the pairing rule for the final blind A/B gate. Scoring is absolute rather than against the prototype, so the reference is an input the human supplies before Phase 11. | human |
| Which units of work warrant a human manual QA pass on localhost rather than an automated gate alone — decided and stated by the finishing agent, phase by phase. | dev |
| Unique Vite port for this build if 5190 is occupied by another running harness. | devops |
| Whether item purchase and forge crafting exist in v1, and their price/recipe tables. The prototype has no shop and no item exchange; its forge is a settlement building, not a store. | gamedesign |
| Dev-panel backlog, built on human request rather than pre-emptively. Five candidates: (1) un-fog, reveal the whole world; (2) teleport to any of the twelve maps or any city; (3) force-exit a battle — win, flee or instant-kill; (4) force a named item drop and replay its drop animation; (5) set party level / grant XP to jump progression gates. | human |
| How friend/foe stays readable at a glance once blob shadows are replaced by real contact shadows. The prototype encodes faction in blob colour (teal hero, red-orange enemy); defect 3 removes that channel and defect 6 forbids a non-diegetic marker. | art |
| Where the fifth quality notch goes and what it scales — below low to prove the game reads when everything is cheap, or between existing tiers. ultra must keep its name (tools/shot.mjs defaults to it) and tiers must scale COST not LOOK, per src/core/engine.js:15. The lever must persist to localStorage: still captures stay at ultra, gameplay probes read the persisted value. | dev |
| Which specific edges are tech-gated and at which settlement tier, plus whether lateral cycles and one-way drops join them. DECIDED already: tech-gated edges are in, gates are temporary, and at max tier the whole world is traversable both ways. Chrono-rifts are punted to cool-to-have. Open: the gate assignment itself, and the two remaining topology proposals. | level |

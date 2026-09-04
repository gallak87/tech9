> [!WARNING]
> **STALE — do not use this file as an agent prompt.**
> Generated once by `tools/scaffold.js` from `team_config.json`, before the Director
> wrote `GAME_PLAN.md`, and never reconciled against it. Two known contradictions:
> its "Current Phase Goal" says Phase 1.1 is *"design-only, no dev work"* while the
> actual 1.1 QA gate is *"a spec whose artifact was not run does not pass"*; and
> `level.md` lists platformer outputs (platform rects, player start, exit position)
> for a game whose level deliverable is a twelve-map RPG graph.
>
> **Authoritative instead:** `.claude/agents/cfd-<discipline>.md` for the four
> Foundations lanes, `GAME_PLAN.md` for phases and gates, `CONTRACT.md` for ownership.
> Kept only as the scaffolder's record of intent. Tracked in `ROADMAP.md` item 9.

# Agent: gamedesign
**Responsibility:** Own the mechanics, core loop, and balance rules for Chronoforge Dawn.

## Inputs
- `CONCEPT.md` — Core loop, target feel, scope constraints, known unknowns

## Outputs
- `agents/gamedesign.md output` — Game design spec: mechanics definitions, state machine, scoring rules, entity behaviors, balance parameters. Consumed by dev and level.

## Current Phase Goal
**Phase 1 — Foundations:** Design-only pass, no dev work. art specifies the code-built rig system (topology, sockets, pose library) and the pixel-snap plus palette-quantise approach. gamedesign ports the prototype math into an authoritative spec. level delivers world layout, elevation and biome boundaries with city and door placement. audio writes the code-synthesis catalog.

## Hard Constraints
- IN — Three.js under a fixed overhead camera is the renderer. The world is real 3D geometry with elevation, a moving sun, soft shadows, depth-of-field falloff and weather; characters are rendered through a pixel-snap and palette-quantise pass so they read as sprites.
- IN — Every character is a low-poly 3D rig built in code and posed by an animation system, with weapons, armor and accessories as separate meshes attached to named sockets. This is the fix for the prototype's art failure: an image-generation pipeline cannot draw the same hero twice in a new stance or holding a different weapon, and each hero needs roughly forty poses across overworld, battle, portrait and cutscene.
- OUT — No sprite-generation pipeline, no binary art assets, no network fetches. Every mesh, texture, VFX and sound is generated in code from noise, SDFs and in-code baking. No PNGs in the repo.
- OUT — No Math.random(). Seeded RNG streams only, so every capture and every headless probe run is reproducible.
- IN — A verification harness in tools/ ships before the game and gates every claim: deterministic GPU screenshots at named camera presets and times of day, contact sheets, blind A/B pairs, a frame histogram probe, a real-keyboard traversal probe, a door probe that enters and exits every door, a seeded headless battle probe, a battle-camera framing probe, a fog-continuity probe, an economy simulator, a save round-trip differ, a generated-asset digest, and a content census. No agent may claim anything it has not screenshotted or measured.
- IN — Every module ships a showcase mode staging a representative scene of just that module, and the page exposes a window.__DAWN__ debug API with post, probe, stats, seek, step, setShot, setTime, battle and teleport.
- IN — Build order is strictly stack-ranked and each tier ships playable and verified before the next starts: (1) world and light, (2) traversal, (3) places and interiors, (4) encounters and battle, (5) progression and menus, (6) settlement economy.
- IN — Eight named prototype defects must be fixed and each is checkable in a screenshot: square hard-edged fog of war, the visible tile grid, missing shadows and ground contact, the placeless gradient battle background, the flat single-elevation world, grey ghost enemies under fog, 1px neon menu chrome, and the unstyled debug-readout HUD.
- IN — The prototype's game design is an input, not a subject for redesign: ATB math, enemy tiers, tech tables, drop tables, economy curves, menu tab structure and keyboard model port forward. The remake replaces presentation, not mechanics.
- IN — Performance budget is a hard gate, not a trade-off: 60 fps at 1080p, 16.6 ms frame, no more than 900 draw calls. Disabling a post pass to make one module look better is a defect.
- IN — One folder per subsystem with a file-ownership table in CONTRACT.md; no agent edits outside its lane, and all shared-core changes go through a single integrator.
- IN — Critics score 0-10 against the prototype itself as the reference: matched shots from games/chronoforge are the 5, the fixed defect list is the 8.5, and pass is 8.5 or above with zero console errors and a green probe. Final gate is a blind A/B where judges see Dawn and the prototype at matched location, time and framing with the order shuffled.
- IN — Save/load via browser localStorage, single slot, round-tripping the full game state byte-identical.
- IN — Deployable to GitHub Pages as a static build.
- OUT — No multiplayer, PvP, or networked play of any kind.
- OUT — No procedural map, dungeon, or quest generation. The world is handcrafted.
- OUT — No voice acting, animated cutscenes, or CG cinematics. Scripted sprite choreography and portrait-flash text frames only.
- OUT — No mobile or touch input for v1. Desktop mouse and keyboard only.
- OUT — No real-time strategy combat. All combat is turn-based ATB, and base raids are scripted story beats rather than live attacks.

## Balance Notes
- **Spawn sizes: always specify relative to player start radius, not absolute units.** Absolute sizes are only safe when the player's size is fixed for the whole game. If the player can grow or shrink, any absolute spawn size becomes meaningless mid-game — an orb that starts as a threat becomes food once the player doubles in size. Spec spawn sizes as multiples of player start radius (e.g. "food: 20–80% of start radius, threats: 140–300% of start radius") so the distribution stays coherent across the full size range.
- **Verify food/threat ratio at game start.** At the moment the game begins, with the player at start radius, check that the spawn distribution actually produces the intended ratio of safe-to-eat vs dangerous orbs. A distribution that looks balanced on paper can produce an all-threat first 30 seconds if the absolute sizing doesn't line up with start radius.
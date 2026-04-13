# CHRONOFORGE — Game Plan

## Team

| Agent | Notes |
|-------|-------|
| `gamedesign` | Owns ATB math, damage formulas, tech tree progression, economy balance (farm/mine/energy yield curves), combo mechanics, skill-tree shapes, and the Survivor->Reclaimer->Ascendant->Transcendent tier unlock gates. Scope is too rich for inline-with-level design. |
| `art` | Owns visual direction AND comprehensive sprite catalog production. Merged with asset (solo pipeline uses /run-art Ollama generation). Must deliver the full sprite manifest on day one (heroes, enemies, buildings x4 tiers, tiles, VFX, UI, projectiles, portraits) so generation runs in parallel with dev from Phase 1 onward. Placeholder fallbacks first, real PNGs swap in as they complete. |
| `level` | Owns the handcrafted overhead world map: tile layout, biome boundaries, city/checkpoint placement, wilderness encounter density, quest waypoints, and the difficulty curve across the map. This is a massive standalone deliverable — cannot merge with gamedesign. |
| `audio` | Target feel explicitly calls for reverb-heavy synthwave ambience, combo stinger chimes, resource-tick chimes, and battle SFX. Scoped to minimal Web Audio / small sample set; not full composition. Produces audio spec + basic SFX hooks for dev. |
| `dev` | Owns the engine: overworld tile rendering, party controller, encounter trigger, ATB battle scene with VFX hooks, base grid + resource tick loop, UI (HUD, menus, skill tree, inventory), localStorage save/load, state machine. Vanilla JS + Canvas. Always active. |
| `qa` | Gates every playable phase. Regression sweeps between waves since the game spans three distinct scenes (overworld, battle, base) that must not break each other. Always active. |
| `devops` | Owns localhost serving (Phase 0 confirmation), GitHub Pages deploy pipeline, and repeated redeploys after each feature phase (user wants a deployable alpha early). Also absorbs release duties. |

**Skipped / Merged:**
- `asset` → merged into `art` — Merged into art — the /run-art skill in this repo handles asset generation via Ollama, so art role owns both direction and production in a single unified pipeline.
- `release` → merged into `devops` — Static GitHub Pages deploy with no store page or marketing copy — versioning and changelog fold into the devops agent per merge rule.
- `postlaunch` → skipped — Skipped for v1 — game is not yet launched and user has not asked for ongoing player support or a hotfix rotation. Revisit only after public release.

---

## Phase Plan

### Phase 0 — Engine Skeleton & Localhost
Agents: `dev`, `devops`

Bare HTML/Canvas app with game loop, top-level state machine (splash / overworld / battle / base / menu) and stubbed scene renderers. DevOps confirms localhost serves the page and the GitHub Pages repo/branch/path is configured but not yet deployed.
QA gate: Page loads on localhost, no console errors, state machine transitions between stub scenes via keyboard.

### Phase 1 — Design Foundations *(parallel)*
Agents: `gamedesign`, `art`, `audio`

Parallel design-only pass. gamedesign writes the authoritative mechanics spec (ATB math, tech tree gates, economy, combos, skill trees). art writes the visual spec and declares the full comprehensive sprite catalog as sprites-manifest.json so generation can run asynchronously from here on. audio writes the event/stinger catalog. No dev work this phase.

### Phase 2 — Overworld Alpha, Menu Shell & First Deploy
Agents: `dev`, `level`, `art`, `qa`, `devops`

First playable build. dev implements overworld tile renderer, party controller, encounter-trigger stub, AND the unified menu overlay shell — Esc/Tab opens it, shared chrome across tabs, Map tab fully live-scrollable + zoomable + fog-of-war + fast-travel on click, Party/Inventory/Skills/Quests/Save/Settings tabs present as stubs that wire up in later phases (Settings already ships the placeholder-vs-generated-sprite toggle so beta-testers can compare). level delivers the handcrafted world map data (tiles, cities, checkpoints, encounter zones). art begins generating overworld tiles, hero sprites, and city landmarks (placeholders fill in any gaps). devops deploys the alpha to GitHub Pages so the user can beta-test while later phases continue.
QA gate: Player walks across the map, opens the menu from overworld via Esc, pans and zooms the Map tab smoothly, clicks a visited city to fast-travel, switches between all seven tabs without visual inconsistency, triggers a wilderness encounter, and the game is live at the GitHub Pages URL.

### Phase 3 — Battle System
Agents: `dev`, `art`, `audio`, `qa`, `devops`

Full Chrono Trigger-style ATB battle scene. dev implements gauge ticks, turn queue, basic attacks, single-target and AoE techs, at least one dual-tech combo per hero pair, VFX hooks (screen-shake, time-freeze, particle trails), portrait-flash dialog frames, AND confirms the menu overlay opens mid-battle and correctly pauses ATB gauges. art generates enemy sprites, battle backgrounds, VFX spritesheets, portraits. audio wires combat SFX and stinger cues. Redeploy.
QA gate: Player can fight an encounter from overworld trigger through victory/defeat, at least one combo finisher plays cleanly, opening the menu mid-battle freezes ATB gauges and closing it resumes them, and the updated build is live.

### Phase 4 — Base Management & Economy
Agents: `dev`, `art`, `gamedesign`, `qa`, `devops`

dev implements the base grid scene: building placement, worker assignment, resource ticks (food/ore/energy), upgrade UI, tech-tier gates. art produces building sprites at each of the 4 tech tiers (Survivor/Reclaimer/Ascendant/Transcendent) so upgrades visibly transform the settlement. gamedesign does a balance pass on yield rates and upgrade costs. Redeploy.
QA gate: Player can build, assign workers, accrue resources, and upgrade at least one structure visibly across 2+ tech tiers. Build is live.

### Phase 5 — Progression, Content, Menu Wire-Up & Save
Agents: `dev`, `level`, `gamedesign`, `audio`, `qa`, `devops`

dev wires all remaining menu tabs to real data — Party portraits pull live hero stats, Inventory supports in-place equip swap with stat-diff preview via click-item-then-slot AND drag-and-drop, Skills spends real skill points into per-hero trees, Quests reads from level's quest log, Save/Load round-trips the full game state via localStorage. level populates city quests, encounter tuning, and the full difficulty curve across the map. gamedesign finalizes balance numbers. audio adds ambient beds per biome. Redeploy.
QA gate: Party levels, equips gear via both click and drag-and-drop with correct stat-diff preview, spends skill points, reads quest objectives, progresses through at least 3 cities and a mid-game encounter, and save/load round-trips the entire state. Build is live.

### Phase 6 — Polish, Final Art Swap & Release
Agents: `dev`, `qa`, `devops`

Final regression sweep. dev fixes QA-reported issues, integrates any late-arriving sprites, ensures placeholder fallbacks still work for any unfinished assets. devops cuts a v1.0.0 tag, writes the changelog, and does the final deploy.

Polish-phase notes (decisions deferred from earlier phases):
- **Base placement upgrade** — Phase 4 shipped a fixed-slot base layout for speed. If the base feels cramped or on-rails in beta-testing, upgrade to free placement on a small tile grid (AoE-style click-to-place). Sprites and costs already fit either model.

QA gate: Full playthrough from intro to mid-game in live build, zero console errors, all art either generated or placeholder-clean, version tag live on GitHub Pages.

### Post-release (not in v1)
- **Scripted raid events** — the `wall` building and enemy overworld presence were designed with a "scripted story raid" in mind (defend base at key beats). Explicitly deferred until after v1.0.0 ships. Walls in v1 are purely visual/tier-progress; they grant no gameplay effect until raids exist.
- **Autotile / transition tiles** — each biome boundary (grass↔dirt, sand↔rust, moss↔growth) needs ~8 edge+corner transition tiles so terrain blends organically rather than hard-cuts at a grid line. This is the industry standard (LTTP-style Wang tiles / autotile sets). Art cost: ~24 tiles for 3 main boundaries. Engine cost: neighbor-scan at map load, pick variant from a transition lookup table. Deferred post-v1 because (a) named terrain sets already ship as a strong visual upgrade and (b) transition tiles require the world layout to be locked first — adding them to a moving target wastes art budget.

### Phase 6.5 — Pixi Port (perf uplift)
Agents: `dev`, `qa`, `devops`

Port the rendering layer from Canvas 2D to PixiJS now that the game surface is stable and we know which draw paths are actually hot. Canvas 2D got us to content-complete; Pixi lifts the ceiling for the post-FX pass and any post-release content drops. See ROADMAP.md §4 for framework rationale — chronoforge is explicitly the poster child for this uplift.

Scope:
- Introduce Pixi as a dependency; keep the existing scene-state machine and game logic untouched — this is a renderer swap, not a rewrite.
- Port in order of draw-cost: overworld tilemap (biggest win — tile-sprite batching replaces per-tile `drawImage`), battle scene (sprites + VFX filters), base scene, menu overlay last.
- Introduce filter stack for the neon/synthwave look the art spec calls for: bloom, chromatic aberration, subtle CRT scanline — things Canvas 2D can't do cheaply. This is the actual payoff, not just raw fps.
- Keep the placeholder-vs-generated-sprite Settings toggle functional through the port (it's a beta-test affordance, not a renderer-specific feature).
- Historian (when it exists) should capture what broke during the port — this is the first Pixi retrofit and lessons from it directly inform the rubric in ROADMAP §4.

QA gate: Full playthrough, 60fps steady on the overworld at max zoom with fog on (current Canvas 2D build drops frames here), battle VFX visibly richer than pre-port baseline, no regressions in gameplay behavior, build is live.

**Why after Phase 6, not earlier:** porting a finished surface is cheaper than porting a moving one. Your recent atlas + placeholder-cache + fog-memo patches bought enough Canvas 2D headroom to carry us through Phase 4–5 without blocking content work.

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| ATB tick rate, combo timing windows, damage formulas, and skill-tree math | dev |
| Final sprite dimensions, palette, per-sprite frame counts, and comprehensive sprite catalog inventory | art |
| Exact world map tile layout, city placement, encounter density, biome boundaries, and quest content | level |
| Audio stingers, ambient beds, combat SFX cues, and whether to synthesize via Web Audio or ship small sample files | audio |
| Placeholder sprite convention (CSS shape vs emoji vs procedural canvas primitive) and the art-swap contract that lets real sprites replace placeholders without code changes | dev |
| GitHub Pages deploy path (repo root vs subfolder, custom domain vs default) and redeploy trigger (manual vs on-push) | devops |
| Exact menu chrome styling (border treatment, font, tab-switch animation) and drag-and-drop micro-interactions (snap thresholds, hover feedback, invalid-drop signaling) | art |
| Menu tab keyboard shortcuts (e.g. 1-7 to jump between tabs, Q/E to cycle) and gamepad support if added later | dev |

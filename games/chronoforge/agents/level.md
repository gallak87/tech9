# Agent: level
**Responsibility:** Design the level(s) for Chronoforge — geometry, enemies, pacing.

## Inputs
- `CONCEPT.md` — Scope constraints, number of levels, genre
- `GAME_PLAN.md` — Phase ordering — when level data is needed
- `agents/gamedesign.md output` — Mechanics spec — enemy behaviors, scoring rules, player constraints that level geometry must support
- `agents/dev.md output` — Level data format the engine expects (schema for platforms, enemies, start/exit)

## Outputs
- `src/level.js (or level.json)` — Level data object: platform rects, enemy list, player start, exit position, level dimensions. Dropped directly into src/ by dev.
- `ASCII level diagram` — Human-readable layout for review before coding starts. Accompanies the data file.

## Current Phase Goal
**Phase 2 — Overworld Alpha, Menu Shell & First Deploy:** First playable build. dev implements overworld tile renderer, party controller, encounter-trigger stub, AND the unified menu overlay shell — Esc/Tab opens it, shared chrome across tabs, Map tab fully live-scrollable + zoomable + fog-of-war + fast-travel on click, Party/Inventory/Skills/Quests/Save/Settings tabs present as stubs that wire up in later phases (Settings already ships the placeholder-vs-generated-sprite toggle so beta-testers can compare). level delivers the handcrafted world map data (tiles, cities, checkpoints, encounter zones). art begins generating overworld tiles, hero sprites, and city landmarks (placeholders fill in any gaps). devops deploys the alpha to GitHub Pages so the user can beta-test while later phases continue.

## Hard Constraints
- IN scope — Handcrafted overhead world map with prebuilt cities, checkpoints, and visible wilderness encounters (no procedural generation).
- IN scope — Chrono Trigger-style turn-based ATB battle system with single-target techs, AoE techs, and at least one dual-tech combo per hero pair.
- IN scope — Age of Empires-style base economy with town center, farm, mine, energy extractor, barracks, and at least one research structure, all upgradable across 4 tech tiers.
- IN scope — Fixed three-hero party with individual skill trees, equippable gear (weapon/armor/accessory), and leveling.
- IN scope — Deployable to GitHub Pages as a fully static single-page web build (HTML/CSS/JS only, no backend, no build-step requirement beyond optional bundling).
- IN scope — Placeholder sprite system from day one (colored rectangles / CSS shapes / emoji) swappable with generated PNG sprites as the art pipeline produces them; gameplay must be fully playable with placeholders.
- IN scope — Comprehensive sprite catalog declared up front (heroes x3 with idle/walk/attack/cast/hurt/victory frames, 8+ enemy types with idle/attack/hurt/death, every building at each of 4 tech tiers, resource icons, UI portraits, battle VFX spritesheets, world tiles for 3+ biomes, city landmarks, projectile sprites) so art generation can run in parallel with dev.
- IN scope — Save/load via browser localStorage (single slot is acceptable).
- IN scope — Unified pause/menu overlay opened with Esc (or Tab), openable from any scene including mid-battle (pauses ATB gauges while open). Tab-based layout, keyboard + mouse navigable, with tabs: Map, Party, Inventory, Skills, Quests, Save, Settings. Must share consistent visual chrome across all tabs so it reads as one clean system.
- IN scope — Map tab is a live-scrollable world view — drag or WASD/arrows to pan, mouse wheel or +/- to zoom, shows current party position, cities visited, fog-of-war on unexplored tiles, click a city or checkpoint to fast-travel if unlocked.
- IN scope — Inventory tab shows owned-item grid plus three equipped slots per hero (weapon/armor/accessory). In-place equip swap via click-item-then-click-slot or drag-and-drop, with instant stat-diff preview (plus/minus numbers on affected stats) before the swap is confirmed.
- IN scope — Party tab (three hero portraits with HP/MP/XP bars, stat panel), Skills tab (per-hero skill tree, spend skill points), Quests tab (active/completed log with objectives), Save tab (save/load/delete single localStorage slot), Settings tab (volume sliders, key rebind, placeholder-vs-generated-sprite toggle for beta-testing).
- OUT of scope — Real-time multiplayer, PvP, or any networked play.
- OUT of scope — Procedural map, dungeon, or quest generation.
- OUT of scope — Voice acting, full animated cutscenes, and CG cinematics; text boxes with portrait flashes and scripted sprite choreography only.
- OUT of scope — Mobile / touch input for v1; desktop mouse + keyboard only.
- OUT of scope — Cloud save, account system, analytics, microtransactions.
- OUT of scope — Real-time strategy combat (all combat is turn-based ATB; base management is not attacked in real-time — raids are scripted story beats).
# CHRONOFORGE — Concept

## Game Summary

Chronoforge is a futuristic strategy-RPG hybrid set on a post-collapse Earth where neon megacities sit beside ancient ruins and alien-terraformed biomes. The player guides a three-hero party and their fledgling settlement from a lone primitive town center into a sprawling sci-fi civilization, exploring a handcrafted overhead world map dotted with prebuilt cities, checkpoints, and encounter zones. Away from base, encounters trigger cinematic Chrono Trigger-style tactical battles with ATB gauges, positional AoE rings, and dual/triple-tech combo finishers complete with time-freeze camera cuts, particle storms, and screen-shake crits. Between fights the player runs an Age of Empires-style economy — farms, mines, and energy extractors feeding resource loops that upgrade buildings through four tech tiers (Survivor → Reclaimer → Ascendant → Transcendent), unlocking better gear, skills, and exploration reach. The player wins by reuniting the fractured city-states, climbing to the Transcendent tier, and defeating the Void Architect who caused the collapse; they lose if the party is wiped or the home base is razed with no reclaim resources left.

## Core Loop

**Overworld:** point-and-click (or WASD) moves the three-hero party across an overhead tile map; cities act as fast-travel hubs, quest-givers, and shop/forge access; wilderness tiles spawn visible enemy sprites that, on collision, transition via a Chrono Trigger-style swipe into the battle scene.

**Battle:** turn-based ATB — each hero and enemy has a filling action gauge; when it fills, the player picks a basic attack, a tech (single-target / AoE), or a dual/triple-tech combo that consumes multiple heroes' gauges for a cinematic finisher with time-freeze, camera zoom, particle trails, screen-shake, and portrait flashes.

**Base management:** from the overworld you open the home settlement view — a grid where you place/upgrade structures (town center, farm, mine, energy extractor, barracks, forge, research lab, wall); workers auto-generate food/ore/energy on tick; spending resources upgrades the building's sprite and unlocks the next tech tier.

**Progression:** battles grant XP and gear drops for the party; base upgrades unlock new techs, higher equipment tiers, and extended overworld exploration (e.g. hover-tech to cross broken bridges).

**Controls:** mouse for map/base/menus, 1–4 number keys for battle actions, WASD optional overworld movement, Esc to pause.

**Scoring:** renown (quests + cities liberated) and civilization power index (sum of tier + building levels).

**Failure:** party wipe reloads last checkpoint; base destruction costs tier progress.

**Win:** reach Transcendent tier and defeat the Void Architect in the final set-piece battle.

## Target Feel

AAA-grade retro-futurism — SNES-era pixel-art battle theatrics cranked up with modern particle effects, post-processing bloom, and cinematic camera work. Exploration evokes cautious wonder: cresting a ridge to see a neon megacity glowing through sandstorms, or a derelict orbital elevator piercing the clouds. Combat is a fireworks show — every hit lands with a crunch, every crit freezes time for a half-second zoom, combo finishers interrupt the battle for a 2–3 second scripted camera sequence with portrait flashes and synthwave stingers. Base-building is tactile and rewarding: each upgrade visibly transforms the settlement (wood huts → neon spires), resource ticks chime, workers animate scurrying between buildings. Tone is hopeful post-apocalypse — reverb-heavy synthwave ambience over ruin-strewn vistas, bright magenta/cyan accents on dusty earth palettes, heroes with anime-leaning silhouettes but grounded gear. Success feels like watching a civilization bloom; death feels like a wistful fade with "reclaim what was lost" undertones.

## Scope Constraints

- **IN** — Handcrafted overhead world map with prebuilt cities, checkpoints, and visible wilderness encounters (no procedural generation).
- **IN** — Chrono Trigger-style turn-based ATB battle system with single-target techs, AoE techs, and at least one dual-tech combo per hero pair.
- **IN** — Age of Empires-style base economy with town center, farm, mine, energy extractor, barracks, and at least one research structure, all upgradable across 4 tech tiers.
- **IN** — Fixed three-hero party with individual skill trees, equippable gear (weapon/armor/accessory), and leveling.
- **IN** — Deployable to GitHub Pages as a fully static single-page web build (HTML/CSS/JS only, no backend, no build-step requirement beyond optional bundling).
- **IN** — Placeholder sprite system from day one (colored rectangles / CSS shapes / emoji) swappable with generated PNG sprites as the art pipeline produces them; gameplay must be fully playable with placeholders.
- **IN** — Comprehensive sprite catalog declared up front (heroes ×3 with idle/walk/attack/cast/hurt/victory frames, 8+ enemy types with idle/attack/hurt/death, every building at each of 4 tech tiers, resource icons, UI portraits, battle VFX spritesheets, world tiles for 3+ biomes, city landmarks, projectile sprites) so art generation can run in parallel with dev.
- **IN** — Save/load via browser localStorage (single slot is acceptable).
- **IN** — Unified pause/menu overlay opened with `Esc` (or `Tab`), openable from any scene including mid-battle (pauses ATB gauges while open). Tab-based layout, keyboard + mouse navigable, tabs: **Map, Party, Inventory, Skills, Quests, Save, Settings**. Consistent visual chrome across all tabs.
- **IN** — **Map tab**: live-scrollable world view — drag or WASD/arrows to pan, mouse wheel or `+`/`-` to zoom, shows current party position, cities visited, fog-of-war on unexplored tiles, click a city/checkpoint to fast-travel if unlocked.
- **IN** — **Inventory tab**: owned-item grid plus three equipped slots per hero (weapon/armor/accessory). In-place equip swap via click-item-then-click-slot or drag-and-drop, with instant stat-diff preview (±numbers on affected stats) before the swap is confirmed.
- **IN** — **Party / Skills / Quests / Save / Settings tabs**: hero portraits with HP/MP/XP bars and stat panel; per-hero skill tree; active/completed quest log; save/load/delete single localStorage slot; volume sliders, key rebind, and a placeholder-vs-generated-sprite toggle for beta-testing.
- **OUT** — Real-time multiplayer, PvP, or any networked play.
- **OUT** — Procedural map, dungeon, or quest generation.
- **OUT** — Voice acting, full animated cutscenes, and CG cinematics; text boxes with portrait flashes and scripted sprite choreography only.
- **OUT** — Mobile / touch input for v1; desktop mouse + keyboard only.
- **OUT** — Cloud save, account system, analytics, microtransactions.
- **OUT** — Real-time strategy combat (all combat is turn-based ATB; base management is not attacked in real-time — raids are scripted story beats).

## Known Unknowns

| Decision | Deferred To |
|----------|-------------|
| ATB tick rate, combo timing windows, damage formulas, and skill-tree math | dev |
| Final sprite dimensions, palette, and per-sprite frame counts for the comprehensive catalog | art |
| Exact world map tile layout, city placement, encounter density, and biome boundaries | level |
| Audio stingers, ambient beds, and battle SFX cues (if audio role active) | audio |

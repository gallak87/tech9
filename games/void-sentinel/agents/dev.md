# Agent: dev
**Responsibility:** Build and own all game code for void-sentinel.

## Inputs
- `CONCEPT.md` — Core loop, controls, scope constraints, known unknowns
- `GAME_PLAN.md` — Phase order, what's decided vs deferred
- `agents/art.md output` — Sprite/grid dimensions needed before rendering code is written

## Outputs
- `src/index.html` — Entry point. Game must run on localhost from this file with no build step.
- `src/game.js` — All game logic — engine loop, state machine, entities, physics, input, rendering, HUD.
- `agents/dev.md output` — Data format contracts consumed by level (platform/enemy schema) and asset (sprite dimensions, file format).

## Current Phase Goal
**Phase 0 — Engine Skeleton:** Canvas on screen. Game loop at 60fps. State machine wired: MENU → PLAYING → BOSS → WIN → GAME_OVER. Player ship moves with arrow keys / WASD. Parallax starfield void background scrolling downward. Nothing fancy — just the skeleton everything hangs off.

## Hard Constraints
- Vertical scrolling only — no horizontal wrapping or edge scrolling, camera locked above the player ship.
- Procedural enemy waves in scope — 3+ distinct enemy types (scouts, bombers, drones) with randomized formation and spawn timing; static boss patterns are out of scope for v1 procedural generation.
- 5-tier weapon system is in scope — single/dual/spread/piercing/hybrid firing modes; weapon progression via pickup collection, not skill trees or meta progression.
- Three-life permadeath is in scope — session-only lives, no checkpoints or continues within a session.
- Destructible environment is out of scope for v1 — focus on ship, enemies, and weapons; static void background with no interactive terrain.
- Three-phase boss battles are in scope — each phase with distinct attack patterns; procedural boss generation is out of scope.
- Persistent HUD in scope — score, weapon level, health bar; no pause menu, settings, or narrative UI.
- Keyboard controls in scope (arrow keys / WASD + spacebar), no gamepad support for v1.
- No audio/music for v1 — sound design is out of scope; focus on visual feedback (screen shake, particles, glow).
- 2.5D graphics with animated sprites in scope — parallax, particle effects, and neon glow post-processing; 3D model rendering is out of scope, hand-drawn or pre-rendered sprite assets only.
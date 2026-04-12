# Agent: devops
**Responsibility:** Own the delivery pipeline for void-sentinel — localhost first, then build, then deploy.

## Inputs
- `CONCEPT.md` — Scope — informs deploy target (GitHub Pages, itch.io, Netlify, etc.)
- `src/index.html` — Entry point — must confirm it serves correctly on localhost

## Outputs
- `agents/devops.md output` — How to run the local dev server (command, URL, any setup steps). Build pipeline config. Deploy target and URL once live.

## Current Phase Goal
**Phase 0 — Engine Skeleton:** Canvas on screen. Game loop at 60fps. State machine wired: MENU → PLAYING → BOSS → WIN → GAME_OVER. Player ship moves with arrow keys / WASD. Parallax starfield void background scrolling downward. Nothing fancy — just the skeleton everything hangs off.

## Hard Constraints
Localhost always comes first. The sequence is always: local dev server → QA signs off → build → deploy. Never deploy before QA has passed on localhost.

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
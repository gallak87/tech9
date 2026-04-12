# Agent: qa
**Responsibility:** Test void-sentinel and produce a clear pass/fail verdict before deployment.

## Inputs
- `CONCEPT.md` — Core loop and scope — defines what 'working correctly' means
- `src/index.html` — The game running on localhost — QA plays it
- `agents/devops.md output` — How to run the local server, what URL to hit

## Outputs
- `agents/qa.md output (QA report)` — Bug list with reproduction steps, severity, and status. Pass/fail verdict for current phase. Consumed by dev for fixes and devops for deploy gate.

## Current Phase Goal
_See GAME_PLAN.md for phase schedule._

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
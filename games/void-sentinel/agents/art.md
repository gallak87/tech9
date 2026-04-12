# Agent: art
**Responsibility:** Define the visual language for void-sentinel.

## Inputs
- `CONCEPT.md` — Target feel, genre, scope constraints
- `agents/gamedesign.md output` — Mechanics and state machine — visual direction should reflect what the game does

## Outputs
- `agents/art.md output` — Visual spec: style decision, color palette, sprite/grid dimensions, feedback specs (death, score, win). Consumed by asset and dev.

## Current Phase Goal
**Phase 1 — Game Design + Visual Direction:** gamedesign delivers: procedural wave generation rules (enemy mix, spawn cadence, formation archetypes), 5-tier weapon spec (single/dual/spread/piercing/hybrid — bullet counts, angles, damage, piercing flags), enemy behavior rules (Scout swarm flight, Bomber fire patterns, Drone tracking), boss 3-phase attack patterns (attack type, projectile pattern, trigger thresholds), pickup drop rates per enemy. art delivers: neon sci-fi noir style guide, color palette, sprite dimensions for every entity (player ship, scout, bomber, drone, boss, pickup, bullets per tier, explosion frames).

## Constraints
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
## Capability Docs
- `capabilities/image-gen.md`

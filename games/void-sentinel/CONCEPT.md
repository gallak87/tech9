# Void Sentinel — Concept

## Game Summary

Void Sentinel is a vertical-scrolling space shooter with cinematic 2.5D graphics where players defend against procedurally-generated enemy waves using a dynamic 5-tier weapon system. Navigate screen-filling bullet patterns, manage limited lives across sessions, and confront multi-phase boss encounters with intricate attack mechanics. The game rewards tactical weapon selection, precise dodging, and pattern recognition, combining the bullet-hell intensity of Ikaruga with the arcade simplicity of Asteroids.

## Core Loop

Players control a ship with responsive keyboard input (arrow keys or WASD to move, spacebar to fire). Each frame, enemies spawn in procedurally-varied waves and fire or charge toward the player. The player's weapon fires automatically—pressing a button cycles through 5 tiers (single shot → dual → spread → piercing → hybrid). Hits on enemies yield destruction particles and glow-effect pickups that both heal and advance weapon tier. Enemy destruction grants score points. Hitting an enemy or bullet costs 1 life; 3 lives per session means permadeath. When life count reaches zero, the session ends but score persists. Defeating all waves in a phase triggers the boss—a choreographed multi-phase encounter with distinct attack patterns. Surviving all boss phases advances to the next wave loop. The session ends on permadeath; score is the only persistent reward.

## Target Feel

Fast-paced, twitchy arcade action with modern AAA polish on indie scope. Success feels visceral: snappy weapon feedback, screen-shake on explosions, satisfying collision detonations with particle trails, neon glow and energy effects. Failure is punishing but fair—pattern-readable enemy behavior lets skilled players thread the needle. The aesthetic is sci-fi noir: dark void background, neon-rimmed enemies and effects, glowing weapon trails, HUD text in cyan/magenta. The game breathes with rhythm—calm buildup, sudden waves, climactic boss patterns. Moment-to-moment feel is 60fps responsiveness, fluid sprite animation, and kinetic projectile trails.

## Scope Constraints

- Vertical scrolling only — no horizontal wrapping or edge scrolling, camera locked above the player ship.
- Procedural enemy waves in scope — yes, 3+ distinct enemy types (scouts, bombers, drones) with randomized formation and spawn timing; static boss patterns are out of scope for v1 procedural generation.
- 5-tier weapon system is in scope — single/dual/spread/piercing/hybrid firing modes; weapon progression via pickup collection, not skill trees or meta progression.
- Three-life permadeath is in scope — session-only lives, no checkpoints or continues within a session.
- Destructible environment is out of scope for v1 — focus on ship, enemies, and weapons; static void background with no interactive terrain.
- Three-phase boss battles are in scope — each phase with distinct attack patterns; procedural boss generation is out of scope.
- Persistent HUD in scope — score, weapon level, health bar; no pause menu, settings, or narrative UI.
- Keyboard controls in scope (arrow keys / WASD + spacebar), no gamepad support for v1.
- No audio/music for v1 — sound design is out of scope; focus on visual feedback (screen shake, particles, glow).
- 2.5D graphics with animated sprites in scope — parallax, particle effects, and neon glow post-processing; 3D model rendering is out of scope, hand-drawn or pre-rendered sprite assets only.

## Known Unknowns

| Decision | Deferred To |
|----------|-------------|
| Exact physics tuning (ship acceleration, bullet speed, enemy speed curves) | dev |
| Sprite dimensions, animation frame counts, and enemy visual taxonomy | art |
| Difficulty curve and spawn rates per wave progression | level |
| Exact neon glow parameters, color palette, and particle trail effects | art |

# VOID-SENTINEL — Game Plan

## Team

| Agent | Notes |
|-------|-------|
| `gamedesign` | Owns procedural wave generation rules (enemy mix per wave, spawn cadence, formation archetypes), 5-tier weapon behavior spec (bullet count, angles, piercing logic), enemy behavior specs (Scout, Bomber, Drone), boss 3-phase attack patterns, pickup drop rates, hit/damage tuning. |
| `art` | Owns visual style decision (neon sci-fi noir), color palette, all sprite dimensions, and produces all sprites via Ollama. Merged with asset — direction and production in one agent. |
| `dev` | Owns all game code — engine loop, scrolling void background, player ship, 5-tier weapon system with cycling, procedural wave spawner, 3 enemy entities, boss with 3-phase state machine, collision, particle/glow effects, screen shake, HUD, state machine. |
| `qa` | Playtests after each dev phase. Gates on weapon cycling/progression, enemy behaviors, wave progression, boss phase transitions, collision accuracy, HUD correctness, and final deployed build. |
| `devops` | Localhost first. Owns local dev server, build pipeline, deploy to GitHub Pages. Absorbs release — single deploy step, no ceremony. |

**Skipped / Merged:**
- `asset` → merged into `art` — Merged into art. Ollama-based sprite gen means one agent does both direction and production.
- `level` → skipped — Skipped. Procedural wave shooter with no spatial level geometry — wave scripts belong to gamedesign, not a level designer.
- `audio` → skipped — Skipped per scope constraint: 'No audio/music for v1 — sound design is out of scope'. Visual feedback only.
- `release` → merged into `devops` — Merged into devops. GitHub Pages deploy is a single step with no store page or launch checklist.
- `postlaunch` → skipped — Skipped. Out of scope for v1.

---

## Phase Plan

### Phase 0 — Engine Skeleton
Agents: `dev`, `devops`

Canvas on screen. Game loop at 60fps. State machine wired: MENU → PLAYING → BOSS → WIN → GAME_OVER. Player ship moves with arrow keys / WASD. Parallax starfield void background scrolling downward. Nothing fancy — just the skeleton everything hangs off.
QA gate: Game runs on localhost. Player ship moves. State machine transitions work. 60fps confirmed.

### Phase 1 — Game Design + Visual Direction *(parallel)*
Agents: `gamedesign`, `art`

gamedesign delivers: procedural wave generation rules (enemy mix, spawn cadence, formation archetypes), 5-tier weapon spec (single/dual/spread/piercing/hybrid — bullet counts, angles, damage, piercing flags), enemy behavior rules (Scout swarm flight, Bomber fire patterns, Drone tracking), boss 3-phase attack patterns (attack type, projectile pattern, trigger thresholds), pickup drop rates per enemy. art delivers: neon sci-fi noir style guide, color palette, sprite dimensions for every entity (player ship, scout, bomber, drone, boss, pickup, bullets per tier, explosion frames).

### Phase 2 — Core Combat
Agents: `dev`

Player shoots. 5-tier weapon system fully implemented (cycling via key, distinct bullet patterns per tier, piercing flag). Enemy hit detection and health pools per spec. Player hit detection — costs 1 life, permadeath at 0. Score accumulation. Pickup entity that both heals and advances weapon tier. HUD: score, weapon tier, lives. All using placeholder rects — no sprites yet. Particle explosions on enemy destruction. Screen shake on hits.
QA gate: Shoot enemies, collect pickups, weapon tier advances on pickup and resets on death. Lives decrement on hit. Score counts accurately. HUD reflects state. Particles + shake feel punchy.

### Phase 3 — Procedural Waves + Enemies
Agents: `dev`

All 3 enemy types (Scout/Bomber/Drone) implemented with behaviors from gamedesign spec. Procedural wave spawner generates varied formations and spawn timings per the wave generation rules. Bomber fires projectiles. Drone tracks the player. Difficulty curve escalates across waves. End of wave loop triggers boss transition.
QA gate: All 3 enemy types spawn, move, and behave per spec. Procedural waves vary between runs. Boss transition reached. No spawn or collision bugs.

### Phase 4 — Boss + Bullet Hell
Agents: `dev`

Boss entity enters after wave clear. Health bar at top. Boss has 3 attack phases — transitions at 66% and 33% HP trigger visibly different bullet-hell patterns per gamedesign spec. Boss defeat loops back to next wave phase (and/or WIN state for v1). Player death during boss triggers GAME_OVER.
QA gate: Boss enters cleanly. All 3 phases trigger and behave correctly. Health bar drains accurately. Bullet patterns readable but challenging. WIN and GAME_OVER states reached from boss fight.

### Phase 5 — Art Integration + Neon Polish
Agents: `art`, `dev`

art generates all sprites via Ollama (player ship, Scout, Bomber, Drone, boss, bullet tiers, pickup, explosion frames). dev swaps placeholder rects for sprites. Neon glow post-processing layered on entities and bullets. Parallax starfield fleshed out. No gameplay changes beyond visual drop.
QA gate: Visual regression check. All sprites render correctly. Neon glow legible. Screen composition reads cleanly. No new collision or gameplay bugs.

### Phase 6 — Polish + Ship
Agents: `dev`, `devops`

Start screen with title, controls (arrows/WASD = move, space = fire, X = cycle weapon tier), and start prompt. Win screen with final score. Game Over screen with score. Smooth menu → game flow. devops final build + deploy to GitHub Pages.
QA gate: Full playthrough on deployed build. Start screen shows controls. Win and Game Over screens work. Score displays correctly on both.

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| Exact physics tuning (ship acceleration, bullet speed, enemy speed curves) | dev |
| Sprite dimensions, animation frame counts, and enemy visual taxonomy | art |
| Difficulty curve and spawn rates per wave progression | gamedesign |
| Exact neon glow parameters, color palette, and particle trail effects | art |
| Procedural wave generation rules (RNG seed, formation archetypes, mix ratios) | gamedesign |
| Boss attack patterns and HP threshold feedback per phase | gamedesign |
| Weapon tier cycling key + whether cycling is manual or auto on pickup | gamedesign |
| Pickup drop probability per enemy type | gamedesign |

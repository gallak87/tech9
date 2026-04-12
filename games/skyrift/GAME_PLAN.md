# SKYRIFT — Game Plan

## Team

| Agent | Notes |
|-------|-------|
| `gamedesign` | Owns wave scripts (spawn order, timing, difficulty curve), boss attack patterns for all 3 phases, enemy behavior specs (Scout movement, Bomber fire patterns, Interceptor evasion), and weapon drop probabilities. Too much design work to fold into concept alone. |
| `art` | Owns visual style decision (pixel art vs vector glow), color palette, all sprite dimensions, and produces all assets via Ollama. Merged with asset — direction and production in one agent. |
| `audio` | Audio is explicitly in scope. Owns Web Audio API synthesis for: shoot SFX per weapon level (5 variants), enemy hit, explosion (enemy + boss), weapon-level-up fanfare, boss phase transition sting, boss death. Real work. |
| `dev` | Owns all game code — engine, scrolling background, player entity, weapon system (5 levels + distinct bullet types), enemy entities (Scout/Bomber/Interceptor), wave spawner, boss entity + 3-phase system, collision detection, scoring, HUD, state machine. |
| `qa` | Playtests after every dev phase. Gates on weapon level progression correctness, all enemy behaviors, boss phase transitions, audio event firing, and final deployed build. |
| `devops` | Localhost first. Owns local dev server, build pipeline, deploy to GitHub Pages. Absorbs release — single deploy step, no ceremony. |

**Skipped / Merged:**
- `asset` → merged into `art` — Merged into art. Ollama-based sprite gen means one agent does both direction and production.
- `level` → skipped — Skipped. No spatial level geometry. This is a wave shooter — enemy spawn patterns belong to gamedesign, not a level designer.
- `release` → merged into `devops` — Merged into devops. GitHub Pages deploy is a single step with no store page or launch checklist required.
- `postlaunch` → skipped — Skipped. Out of scope for v1.

---

## Phase Plan

### Phase 0 — Engine Skeleton
Agents: `dev`, `devops`

Canvas on screen. Game loop running at 60fps. State machine wired: MENU → PLAYING → BOSS → WIN → GAME_OVER. Player jet moves with arrow keys. Vertical scroll background (static color or simple gradient). Nothing fancy — just the skeleton everything hangs off.
QA gate: Game runs on localhost. Player jet moves. State machine transitions work. 60fps confirmed.

### Phase 1 — Game Design + Visual Direction *(parallel)*
Agents: `gamedesign`, `art`

gamedesign delivers: wave script (enemy type, spawn position, timing across the level), boss attack specs for all 3 phases, enemy behavior rules (Scout flight patterns, Bomber fire cadence, Interceptor evasion logic), weapon drop probability per enemy type. art delivers: visual style decision, color palette, sprite dimensions for all entities (player, Scout, Bomber, Interceptor, boss, bullets per weapon level, explosion, pickup).

### Phase 2 — Core Combat
Agents: `dev`

Player shoots. Weapon system fully implemented (5 levels, distinct bullet patterns per level). Enemy hit detection and health pools (Scout=1, Bomber=3, Interceptor=5). Player hit detection — lose life + drop weapon level. Score accumulation (Scout=100, Bomber=250, Interceptor=500). Weapon power-up pickup entity. HUD: score, weapon level, lives. All using placeholder rects — no sprites yet.
QA gate: Shoot enemies, collect pickups, weapon level advances and drops correctly. Lives decrement on hit. Score counts accurately. HUD reflects state.

### Phase 3 — Enemies + Wave Spawner
Agents: `dev`

All 3 enemy types implemented with behaviors from gamedesign spec. Wave spawner reads the wave script and spawns enemies at the right times and positions. Bomber fires projectiles. Interceptor exhibits evasion behavior. Difficulty curve plays out correctly end-to-end.
QA gate: All 3 enemy types spawn, move, and behave per gamedesign spec. Wave progression reaches the boss transition. No spawn or collision bugs.

### Phase 4 — Boss
Agents: `dev`

Boss entity enters after wave clear. Health bar displayed at top of screen. Boss has 3 attack phases — transitions at 66% and 33% HP trigger visibly different attack patterns per gamedesign spec. Boss defeat triggers WIN state. Player death during boss triggers GAME_OVER.
QA gate: Boss enters cleanly. All 3 phases trigger and behave correctly. Health bar drains accurately. WIN and GAME_OVER states reached from boss fight.

### Phase 5 — Art Integration
Agents: `art`, `dev`

art generates all sprites via Ollama (player jet, Scout, Bomber, Interceptor, boss, bullet variants per weapon level, explosion, weapon pickup). dev swaps placeholder rects for sprites. No gameplay changes — art drop only.
QA gate: Visual regression check. All sprites render correctly at correct dimensions. No new collision or gameplay bugs introduced.

### Phase 6 — Audio Integration
Agents: `audio`, `dev`

audio designs and implements all SFX via Web Audio API: shoot sounds (5 variants, one per weapon level), enemy hit, explosion (small for enemies, large for boss), weapon-level-up fanfare, boss phase transition sting, boss death. dev integrates audio events at the correct trigger points.
QA gate: All audio events fire at the right moments. No performance degradation. Sounds are distinct and appropriate per event.

### Phase 7 — Polish + Ship
Agents: `dev`, `devops`

Start screen with game title, controls display (Arrows = move, Z/Space = auto-fire), and start prompt. Win screen with final score. Game Over screen with score. Smooth menu → game flow. devops final build + deploy to GitHub Pages.
QA gate: Full playthrough on the deployed build. Start screen shows controls. Win and Game Over screens work. Score displays correctly on both.

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| Enemy wave patterns and spawn timing across the level | gamedesign |
| Boss attack patterns per phase (projectile types, movement, timing) | gamedesign |
| Whether Bomber fires in fixed patterns or randomized bursts | gamedesign |
| Interceptor evasion behavior (speed boost on approach, dodge pattern, or pre-programmed path) | gamedesign |
| Exact boss health pool total and visual feedback at phase thresholds | gamedesign |
| Visual style — pixel art vs vector glow aesthetic, color palette | art |
| Sprite dimensions and bullet visual design per weapon level | art |
| SFX synthesis approach per event (shoot, hit, explosion, level-up, boss death) | audio |
| Bullet speeds, enemy movement speeds, collision hitbox sizes, scroll rate | dev |
| Weapon power-up drop probability per enemy type | dev |

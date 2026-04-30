# VOID SENTINEL: BREACH — Game Plan

## Team

| Agent | Notes |
|-------|-------|
| `gamedesign` | Owns the full wave script (all formations, timing, density curve), all 3 boss types x 3 phases each (attack patterns, bullet types, movement), all 4 enemy behaviors, 7 weapon tier specs, and weapon/bomb drop probabilities. This is the largest gamedesign workload in the pipeline — cannot be merged. |
| `art` | Merged with asset. Owns visual direction + Ollama sprite generation for all entities: player ship, Scout, Bomber, Drone, Elite, Sentinel boss, Interceptor boss, Colossus boss, 7 bullet tier variants, explosion, weapon pickup, bomb pickup. Billboard sprite dimensions must match what dev expects for THREE.Sprite. |
| `audio` | Web Audio API SFX is explicitly in scope. Owns synthesis specs and implementation for: 7 weapon tier shoot sounds, enemy hit, small explosion, large explosion, weapon tier-up fanfare, bomb blast, boss phase transition sting, boss death. |
| `dev` | Owns all code: Three.js scene, behind-jet camera, scrolling world layers, state machine (MENU/PLAYING/BOSS/WIN/GAME_OVER), player entity, 7-tier weapon system, 4 enemy types + behaviors, wave spawner, 3 boss types + 3-phase system, collision detection, HUD, bloom post-processing, sprite billboard integration, audio event hooks. |
| `qa` | Gates every dev phase. Critical checkpoints: weapon tier progression and drop correctness, all 4 enemy behaviors, all 3 boss types x 3 phases, audio event firing, full run playthrough on deployed build. |
| `devops` | Phase 0 localhost confirmation. Final phase: Vite build + deploy to GitHub Pages. Merged with release — no store page or launch checklist needed. |
| `historian` | Runs post-hoc after ship. This is the first Three.js billboard-sprite hybrid in the pipeline — learnings on that pattern are especially valuable to capture. |

**Skipped / Merged:**
- `asset` → merged into `art` — Art direction and production in one agent — Ollama pipeline handles both.
- `level` → merged into `gamedesign` — Wave-based shooter — no spatial level geometry. Enemy spawn scripts and wave sequencing belong entirely to gamedesign.
- `release` → merged into `devops` — Simple GitHub Pages static deploy. No store page, no changelog ceremony. DevOps handles it.
- `postlaunch` → skipped — Nothing shipped yet. Activate after v1 is live.

---

## Phase Plan

### Phase 0 — Engine Skeleton
Agents: `dev`, `devops`

Three.js scene with behind-jet camera at low angle. Scrolling world: terrain plane + 2 cloud layers at different speeds + atmosphere haze, all procedural geometry. Player ship as BoxGeometry placeholder. WASD/arrows move player within screen bounds. Auto-fire shoots BoxGeometry bullet placeholders forward. State machine wired: MENU → PLAYING → BOSS → WIN → GAME_OVER (transitions work, states are stubs). DevOps confirms npm install + npx vite on localhost:5173.
QA gate: Game loads on localhost with no errors. Player moves. Placeholder bullets fire. World scrolls. State machine transitions between all 5 states.

### Phase 1 — Design + Art Spec *(parallel)*
Agents: `gamedesign`, `art`

gamedesign delivers: complete wave script (all formations, timing, density curve), all 3 boss types x 3 attack phases each (bullet patterns, movement paths, charge-cone timing), all 4 enemy behavior rules, 7 weapon tier bullet patterns, drop probabilities. art delivers: visual style decision, full color palette, exact sprite dimensions for every entity (player, 4 enemies, 3 bosses, 7 bullet variants, explosion, 2 pickups) — dimensions must be billboard-ready for THREE.Sprite.

### Phase 2 — Core Combat
Agents: `dev`

All 7 weapon tiers implemented with placeholder geometry bullets (distinct colors/shapes per tier). All 4 enemy types with movement behaviors and attack patterns (polygon placeholders). Player-bullet vs enemy collision. Enemy-bullet vs player collision. Lives system — hit costs life + drops weapon tier. Bomb mechanic — clears screen. Score accumulation. HUD: score, weapon tier, lives, bomb count. Pickup entities (weapon + bomb) spawn and collect correctly.
QA gate: Shoot all 4 enemy types, weapon tiers advance and drop correctly, lives decrement on hit, bomb clears screen, score counts accurately, all pickup types collect correctly.

### Phase 3 — Wave System + Boss
Agents: `dev`

Wave spawner reads gamedesign wave script — correct enemy types spawn at correct times and positions. All 3 boss types implemented with 3-phase attack patterns, health bar at top of screen, charge-cone telegraph before heavy attacks. Phase transitions at 66%/33% HP. Boss death → WIN. Player death during boss → GAME_OVER. Start and end screens with score.
QA gate: Full run playable from wave 1 through boss to WIN. All 3 boss types reachable. Phase transitions fire correctly. WIN and GAME_OVER screens show correct score.

### Phase 4 — Art Integration
Agents: `art`, `dev`

art generates all sprites via Ollama (player, Scout, Bomber, Drone, Elite, Sentinel, Interceptor, Colossus, 7 bullet variants, explosion, weapon pickup, bomb pickup). dev swaps all BoxGeometry/ConeGeometry placeholders for THREE.Sprite billboards with generated PNG textures. Bloom parameters tuned. No gameplay changes.
QA gate: Visual regression — all sprites render at correct sizes, no new collision or gameplay bugs, bloom looks correct, game is visually impressive.

### Phase 5 — Audio Integration
Agents: `audio`, `dev`

audio designs and implements all Web Audio API SFX: 7 weapon tier shoot sounds (distinct per tier), enemy hit, small explosion (enemies), large explosion (boss), weapon tier-up fanfare, bomb blast, boss phase transition sting, boss death. dev integrates audio events at all correct trigger points. Camera shake on hit and boss phase transitions implemented here if not already.
QA gate: All audio events fire at correct moments. No performance degradation. Tier 7 sounds dramatically different from tier 1.

### Phase 6 — Polish + Ship
Agents: `dev`, `devops`

Start screen polished with title, controls (Arrows/WASD = move, Space/Z = cycle weapon), and start prompt. WIN and GAME_OVER screens polished with final score. Smooth menu flow. devops final Vite build + deploy to GitHub Pages.
QA gate: Full playthrough on deployed URL. Start screen shows controls. WIN and GAME_OVER work. Score correct. No console errors on deploy.

## Key Decisions Deferred to Agents

| Decision | Deferred To |
|----------|-------------|
| Full wave script — spawn order, formation types, timing, density curve across all waves. | gamedesign |
| Boss attack patterns per phase for all 3 boss types — bullet types, counts, speeds, movement paths. | gamedesign |
| Weapon pickup drop probabilities per enemy type. Bomb drop probability from Bombers. | gamedesign |
| Visual style — color palette, sprite art direction for all entities. | art |
| SFX synthesis specifics — oscillator types, envelope shapes, frequencies per event. | audio |
| Bullet speeds, enemy movement speeds, scroll rate, player movement bounds, hitbox sizes, bloom parameters. | dev |

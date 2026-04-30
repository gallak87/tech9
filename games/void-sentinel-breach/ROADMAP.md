# VOID SENTINEL: BREACH — Roadmap

## Status: Phase 4 complete (geo art), Phase 5 partially done

---

## Done

### Phase 0 — Engine skeleton
Three.js scene, behind-jet camera, scrolling terrain, player ship, auto-fire, state machine. Vite on localhost:5173.

### Phase 1 — Design + Art spec
gamedesign agent: full 12-wave script, 3 boss types × 3 attack phases, 4 enemy behaviors, 7 weapon tiers, drop probabilities.
art agent: visual direction, full geo-manifest spec (see below).

### Phase 2 — Core combat
7-tier weapon system (single → twin → spread → homing → spread+homing → spread+piercing → full chaos). 4 enemy types with movement + attack patterns. Collision, lives, bomb, score, HUD, pickups.

### Phase 3 — Wave system + boss
12-wave spawner with escalating world speed. All 3 boss types (Sentinel, Interceptor, Colossus) with 3-phase attack patterns. Boss health bar with phase-color transitions. WIN / GAME_OVER states.

### Phase 4 — Art (geo pass, not sprites)
**Pivoted from Ollama sprites → procedural geometry.**
Wrote `geo-manifest.json`: each entity defined as composite Three.js primitives (Box, Cone, Cylinder, Sphere, Torus) with colors + emissive. `buildEntityMesh()` in game.js reads the manifest and builds `THREE.Group` meshes. UnrealBloomPass makes emissive geometry glow cleanly. Art mode (M key in dev panel) spawns all entities in a grid for visual spot-check.

### Audio agent
`src/audio.js` written with 17 synthesized Web Audio API SFX. **Not yet wired into game.js** — integration is Phase 5.

### Fixes applied
- Enemy fire gate: enemies only shoot when in front of player
- Elite entity freeze: MeshStandardMaterial instead of MeshBasicMaterial for emissive pulse
- Hitbox radius: bumped from 0.4 to 1.2 + halfSize
- Pickup drift: now moves toward player, collection radius 1.2, out-of-bounds check both directions
- Cloud boxes: disabled (visual clutter)

---

## Up Next

### Geometry polish (art re-run)
Current meshes are too boxy — BoxGeometry overused. Re-run art agent with a sharper brief:
- Player: delta-wing silhouette, swept nacelles, narrow cockpit nose using ConeGeometry/OctahedronGeometry
- Enemies: distinct silhouettes — scouts should be thin darts, bombers should be wide/heavy, drones compact, elites aggressive
- Bosses: massive, asymmetric, imposing — use IcosahedronGeometry for core bodies, multiple engine clusters
- Key instruction: **minimize BoxGeometry**, prefer Cone/Sphere/Octahedron/Icosahedron for primary shapes, use thin flat boxes only for wing planes

### Boss attack planes
Boss bullets currently all fire in a single horizontal plane. They should fire in 3D — diagonal volleys, angled upward/downward spreads, ring patterns at varying Y heights. Revisit all 3 boss attack patterns (burst, sweep, seeker, beam, ring, column, spiral, annihilation) and add Y-axis variation so the player has to dodge in 3D space, not just left/right.

### Hit blink on damage
When a bullet lands on an enemy or boss, flash white for ~0.1s.
- Add `hitFlash: 0` to each enemy spawn
- On hit: `e.hitFlash = 0.12`
- In update loop: decrement, traverse mesh, set `emissiveIntensity` to 8.0 + `color` to white while active, restore after
- Same pattern for boss

### Phase 5 — Audio integration
Wire `src/audio.js` `playSound()` calls into game.js trigger points:
- Player fire (per tier), enemy hit, enemy death, player hit, bomb, boss phase transition, boss death, weapon pickup, win/game over stings

### Terrain going black
The terrain plane scrolls off-screen during longer sessions — reset math doesn't match plane size. Fix: either scale the plane to 400+ units or leapfrog two planes.

### Phase 6 — Polish + ship
- Start screen with title + controls
- WIN / GAME_OVER screens polished
- Mobile touch controls (virtual joystick + tap-to-bomb) — explicitly planned
- Vite build + GitHub Pages deploy

---

## Dev shortcuts (in-game, requires `__DEV_TOOLS__`)
| Key | Action |
|-----|--------|
| `1` | → MENU |
| `2` | → PLAYING (wave 1) |
| `3` | → BOSS (instant, random boss type) |
| `4` | → WIN |
| `5` | → GAME_OVER |
| `[` / `]` | Weapon tier down/up |
| `Shift+S/B/D/E` | Spawn Scout/Bomber/Drone/Elite |
| `M` | Art mode — freeze game, render all entities in grid |

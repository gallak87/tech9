# Void Fracture — Roadmap

## Done

### Phase 1 — Core Mechanics
- Player ship (F-35 approximation), 7 weapon tiers, auto-fire
- 3 enemy types: Scout (needle+wings), Bomber (weapon pods), Drone (gyroscope rings)
- Wave spawner: seeded mulberry32 RNG, 6 formation archetypes, gap-based timing
- Pickups: weapon tier advance, bomb
- HUD: score, lives, wave, weapon, bombs, flash messages
- Starfield: 3-layer parallax (dimmed, no bloom)

### Phase 2 — Boss System
- 3 boss types: Sentinel (orbital rings), Interceptor (swept fighter), Colossus (dreadnought + cannon)
- 3 phases per boss at 66%/33% HP with color transitions
- Fire patterns: spread, aimed, ring, spiral
- Boss HP bar (ASCII block fill + phase label, top-center HUD)
- Entry slide-in animation

### Phase 3 — Visual Polish
- Procedural explosion effects per enemy type (type-colored debris)
- Engine glow pulse on player ship
- Shape pass: enemies oriented along Z (flying toward camera), distinct silhouettes

### Dev Tool (done, lives in DevTool.gd, child of Main)
Toggle with backtick (`). Keys:
- `[` / `]` — weapon tier down/up
- `1` / `2` / `3` — spawn SENTINEL / INTERCEPTOR / COLOSSUS boss
- `B` — spawn next boss in rotation
- `N` — skip wave
- `G` — geo gallery (hard-pauses game, shows all GeoManifest entities with labels, `G` again restarts)
- `K` — kill all enemies
- Overlay open = god mode (player immune)

---

## Up Next (in order)

### 1. Y-Axis Movement
- Extend player bounds: `BOUNDS_Y_MIN = -1.2`, `BOUNDS_Y_MAX = 1.2`
- `move_up` / `move_down` inputs already mapped in project.godot — just add `dir.y` to movement
- Camera should subtly follow player Y: lerp `_cam_base_pos.y` toward `player.position.y * 0.3`
- Enemy spawn positions and boss entry Z don't need changes (they're already at y=0 which is fine)

### 2. Terrain Obstacles (VSB-inspired corridor feel)
- Static building columns that scroll toward camera
- SpawnTerrain.gd: every wave, spawn 3–5 BoxMesh columns at random X, y=0, z=-40 to z=-20
- Columns drift toward camera at ~2 units/sec, despawn at z=8
- Player dodges them; bullets/enemies pass through (visual only, no collision)
- Column geometry in GeoManifest or inline (stacked boxes, varying heights 1–4 units)

### 3. Phase 4 — Web Export
- Godot 4 web export templates must be installed via Editor → Export Templates
- HTML5 export preset: renderer = Forward+ requires SharedArrayBuffer (COOP/COEP headers)
- Cloudflare Pages supports these headers; GitHub Pages does NOT without a service worker hack
- Deploy target: same Cloudflare Pages project as other tech9 games
- After export: test on mobile Safari (touch drag input — DoDonPachi style)
- Mobile input: single-finger drag moves ship, auto-fire stays on

### 4. Phase 5 — Historian → Framework
- Add `godot4` rendering tier to `meta/02_director.md` and `tools/scaffold.js`
- New: `vocab/templates/stacks/stack-godot4.md` (GDScript bootstrap, scene structure, export notes)
- Update `meta/LESSONS.md` with Godot4-specific patterns from this build

---

## Known Issues / Tech Debt
- Boss hitbox radius (2.5 units in Game.gd `_check_bullet_hits`) is too large — feels like invisible wall; reduce to ~1.8
- `on_enemy_died()` in WaveSpawner can fire `wave_complete` multiple times if enemies die simultaneously at `_enemies_alive=0` — add a `_wave_complete_fired` guard flag
- Victory screen exists but game should loop endlessly (void-sentinel style): in `_on_boss_died`, instead of `_win()` after 3 cycles, just increment `boss_cycles_beaten` and continue with `_next_wave()`. Difficulty scales via `cycle` param already.
- Gallery spawns boss fire if `B` pressed while in gallery (now blocked, but verify)

---

## Key Files
- `scripts/GeoManifest.gd` — all entity geometry, edit this for shape changes
- `scripts/Game.gd` — main orchestrator, state machine, collision detection
- `scripts/WaveSpawner.gd` — mulberry32 seeded wave generation
- `scripts/Boss.gd` — boss AI, phase transitions, fire patterns
- `scripts/DevTool.gd` — dev overlay, geo gallery, god mode
- `scenes/Main.tscn` — scene wiring
- `project.godot` — input mappings, renderer config

## Godot Setup
- Binary: `/Applications/Godot.app/Contents/MacOS/Godot` (alias: `godot4`)
- Version: 4.6.3.stable
- Renderer: Forward+ (required for bloom)
- `--headless --check-only` hangs on M1 — always wrap with `timeout 12` and `pkill -f "Godot.*headless"` after

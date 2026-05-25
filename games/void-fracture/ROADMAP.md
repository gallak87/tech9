# Void Fracture — Roadmap

## Done

### Phase 1 — Core Mechanics
- Player ship (F-35 approximation), 7 weapon tiers, auto-fire
- 3 enemy types: Scout (cone), Bomber (box+sphere), Drone (sphere+torus)
- Wave spawner: seeded mulberry32 RNG, 6 formation archetypes, gap-based timing
- Pickups: weapon tier advance, bomb
- HUD: score, lives, wave, weapon, bombs, flash messages
- Starfield: 3-layer parallax

### Phase 2 — Boss System
- 3 boss types: Sentinel (orbital rings), Interceptor (swept fighter), Colossus (dreadnought)
- 3 phases per boss at 66%/33% HP with color transitions
- Fire patterns: spread, aimed, ring, spiral
- Boss HP bar (ASCII block fill + phase label, top-center HUD)
- Entry slide-in animation

### Phase 3 — Visual Polish (partial)
- Procedural explosion effects per enemy type (type-colored debris)
- Engine glow pulse on player ship
- Star visual fix: dimmer, smaller, no bloom confusion with bullets

---

## Up Next

### Dev Tool (High Priority — before more shape iteration)
In-game overlay toggled with a dev key (e.g. backtick/Tab):
- **Geo viewer**: cycle through all GeoManifest entities, see them in isolation with labels
- **Weapon cycle**: instantly cycle weapon tiers (was in VSB)
- **Boss drop**: spawn any boss type at current wave/cycle (was in VSB)
- **Wave skip**: advance to next wave immediately
- **Entity list**: shows all active nodes + count
Approach: DevTool.gd script added as autoload or child of Main, only active in debug builds

### Shape Iteration (needs dev tool first)
- Sentinel boss: flat orbital rings look like a circle from camera angle — needs depth/asymmetry
- Interceptor boss: review proportions
- Colossus boss: review proportions
- Scout: cone orientation review
- Player: further F-35 refinement once geo viewer is live

### Y-Axis Movement (adds depth to 3D presentation)
- Extend player bounds to include Y: `BOUNDS_Y_MIN/MAX = ±1.5`
- Update movement: `dir.y` from up/down input
- Tweak camera to compensate (slight upward tilt when player moves up)
- Boss and enemy positions may need Y offsets

### Terrain Obstacles (VSB-inspired)
- Static procedural building columns scrolling toward camera
- 3–5 columns per wave, randomized X/Y positions, varying heights
- Bullets and enemies pass through (visual only), player has to dodge
- Built from BoxMesh stacks in GeoManifest or inline in a TerrainSpawner.gd

### Phase 4 — Web Export
- Install Godot web export templates
- HTML5 export preset (Forward+ requires SharedArrayBuffer / COOP+COEP headers)
- Deploy to Cloudflare Pages (supports required headers; GitHub Pages does not without workarounds)
- Mobile touch input: DoDonPachi-style drag (same as VSB)

### Phase 5 — Historian → Framework
- Capture what worked, what patterns emerged from Godot4 dev
- Add `godot4` rendering tier to `meta/02_director.md` and `tools/scaffold.js`
- New: `vocab/templates/stacks/stack-godot4.md` (GDScript bootstrap, scene structure, export notes)
- Update `meta/LESSONS.md` with Godot4-specific patterns

---

## Known Issues
- Stars can be confused with bullets at a glance (fix in progress)
- Boss hitbox radius (2.5) feels like an invisible wall — reduce or add visual indicator
- `on_enemy_died()` can trigger `wave_complete` multiple times if multiple enemies die simultaneously at _enemies_alive=0 — add a guard flag

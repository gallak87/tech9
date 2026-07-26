# DUNEGLIDE — Roadmap

## Status: Phase 1 done (terrain renderer). Phase 2 (glide controller) next.

Free-roam terrain-glide arcade shooter. Keeps void-fracture's shooter DNA —
waves, 3 enemy archetypes, 3 bosses with phases, 7 weapon tiers, bombs, score —
on a dense analytic block heightfield instead of an on-rails neon corridor.

Visual target: "Hyperion One" by Seba_dev (r/godot) — flat delta ship carving at
speed over a dune mosaic of tiny extruded tiles, soft dawn sky, heavy haze.

## Done

### Phase 0 — Skeleton
- Godot 4.6.3, Forward+, `res://scenes/Main.tscn`.
- `mcp_interaction_server.gd` copied from void-fracture, port parameterized
  (`--mcp-port=N` / `GODOT_MCP_PORT` / 9090 default) so both games can run at
  once for A/B.
- Input map for free-roam flight: `steer_left/right`, `nose_up/down`, `boost`,
  `brake`, `fire_bomb`, `cycle_weapon`.
- TAA **off**, MSAA 2x + FXAA. Godot builds motion vectors from
  `PREV_MODEL_MATRIX`, which knows nothing about vertex-shader displacement, so
  TAA smears the terrain to mush at speed. Do not turn it back on.

### Phase 1 — Heightfield + terrain renderer
- `scripts/Height.gd` / `shaders/terrain_height.gdshaderinc` — the same analytic
  height function on CPU and GPU. Six directional waves, ridged fundamental.
  Integer spatial coefficients make the field exactly periodic at 8192 units so
  both sides pre-reduce with `mod` and float32 phase error stays under 1e-4 rad
  (< 0.002 units of height). Integer time harmonics of `OMEGA0 = 0.05` keep
  every phase continuous across the `t` wrap at 125.66s.
- `scripts/BlockChunkMesh.gd` — one baked ArrayMesh per LOD, 20 verts/block
  (top + 4 sides, no bottom). `ARRAY_TEX_UV` carries the block centre so all 20
  verts sample one height — that is what makes a block instead of a smooth
  surface.
- `scripts/SubstrateMesh.gd` + `shaders/substrate.gdshader` — continuous floor
  under the tiles. Without it you see sky through the gaps where a tall tile
  neighbours a short one.
- `scripts/TerrainField.gd` — 4-ring clipmap, `chunk_n 48`, 52 chunks,
  ~120k blocks, ±768 units. Streaming is `global_position` writes only; no
  allocation, no mesh rebuild, so recycling cannot hitch.
- `scripts/DebugParity.gd` — press **P**. Grid of emissive dots at CPU heights;
  they must sit tangent to the GPU block tops. Verified passing.
- `shaders/dawn_sky.gdshader` + `assets/dawn_env.tres` — dawn gradient, sun orb,
  depth fog, glow carried over from void-fracture (`glow_hdr_threshold 0.7`).

**Measured: 24 draw calls, 120fps (vsync-capped) on M1 Pro at 1280x800.**
Baseline it replaces: void-fracture at 894 draw calls / 973 objects.

## Up Next (in order)

1. **Phase 2 — Glide controller + camera.** `Glider.gd`: velocity + yaw heading,
   bank-drives-yaw coordinated turn, critically damped altitude spring against
   `Height.height_grad()` with forward look-ahead, attitude from the analytic
   surface normal. `CameraRig.gd`: damped follower with *independent* time
   constants for position / yaw / roll — not a child of the ship (a hard child
   transform transmits every bank into the viewport and is nauseating), and
   roll must live on a child pivot because `look_at()` rewrites the basis.
   Terrain is **soft** — the hover spring always wins, there is no crash case.
2. **Phase 3 — Art direction pass.** Delta ship in `GeoManifest`, palette,
   thruster.
3. **Phase 4 — Combat port.** Weapon tiers, bullets, pickups, bombs, HUD,
   `Game.gd` state machine. All fire directions become
   `global_transform.basis * local_dir` — void-fracture's are literal `-Z`.
4. **Phase 5 — Enemies + bosses.** Per-archetype altitude behaviour: scouts hug
   terrain, bombers hold altitude, drones dive. Formations rewritten from
   corridor coordinate literals to heading-relative offsets.
5. **Phase 6 — UX pass.** Menu, game over, wave transitions, speed/altitude
   readout, dev tool with terrain toggles.
6. **Phase 7 — Polish.** See below.

## Known Issues / Tech Debt

- **Tiles read "vectory" rather than "concrete"** (raised at the Phase 1 gate).
  Better reference stills supplied afterwards show the cause is not finish
  detail — **our value relationship is inverted from the target**:

  | | Reference (Hyperion One) | duneglide as built |
  |---|---|---|
  | base surface | smooth, glossy, near-mirror; ship reflection and a specular sun streak are clearly visible | dark matte substrate, barely seen |
  | raised tiles | **dark**, sparse, elongated slabs sitting **on** that floor | **light**, densely packed, they *are* the surface |
  | extra detail | coarse grid of thin dark lines, much larger than the dash spacing | none |

  So the reference's solidity comes from dark marks reading against a
  reflective floor, not from texture on the marks. The fix, in order:
  1. Swap the values — substrate becomes the light glossy surface (low
     roughness, high specular, strong sky reflection); blocks go dark.
  2. Drop `fill_z` back toward ~0.3 so the dashes are sparse again (they were
     widened to 0.76 precisely because the dark substrate read as holes — that
     pressure disappears once the substrate is the bright surface).
  3. Add the coarse grid lines to `substrate.gdshader` (cheap: `fract()` on
     world XZ).
  4. Then the finish pass — SSAO in the gaps, per-tile roughness/albedo
     variation off the existing `v_hash`, possibly SSR for the wet sheen.

  Still material-only; no geometry change, and there is vertex budget spare.
  **Only gets harder if it turns out to need per-block bevels**, which would
  mean a `BlockChunkMesh` rebuild.
- Faint hairline at LOD ring boundaries on steep slopes. The rings sample height
  at different block centres, so they disagree slightly; substrate fills most of
  it. Revisit once the real viewing altitude is known.
- One dark region on steep back-slopes where the substrate shows through at a
  grazing angle.
- Morph rate (~126s cycle, big dunes drifting ~2.8 u/s) is unreviewed — tune
  once there is a ship to judge it against.

## Key Files

| Path | Purpose |
|---|---|
| `scripts/Height.gd` | Analytic height + gradient. **CPU source of truth.** |
| `shaders/terrain_height.gdshaderinc` | GPU twin. **Must stay identical.** |
| `scripts/BlockChunkMesh.gd` | Baked block chunk, 20 verts/block |
| `scripts/SubstrateMesh.gd` | Continuous floor closing the tile gaps |
| `scripts/TerrainField.gd` | 4-ring clipmap: spawn, snap, recycle, drive `h_time` |
| `shaders/block_terrain.gdshader` | Extrusion, rim/cap shading, fog fade |
| `shaders/dawn_sky.gdshader` | Dawn gradient + sun orb |
| `scripts/DebugParity.gd` | CPU/GPU agreement harness (**P**) |
| `scripts/FlyCam.gd` | Free-flight dev camera (**M** capture, **F** auto-forward) |
| `mcp_interaction_server.gd` | MCP bridge autoload, TCP 9090 |

## Godot Setup

- Binary: `/Applications/Godot.app/Contents/MacOS/Godot` (also `/opt/homebrew/bin/godot`,
  alias `godot4`). Version 4.6.3.stable.
- Renderer: **Forward+** (required for glow).
- `--headless --check-only` **hangs on M1** — background it, `sleep`, then
  `pkill -f "Godot.*headless"`. `timeout` is not installed on this machine.
- New `class_name` scripts are not visible to a `run_project` until the class
  cache exists. Run `Godot --headless --editor --quit --path .` once after
  adding one, or you get `Identifier "X" not declared in the current scope`.
- Shader globals `h_time` / `h_amplitude` are declared in `project.godot`
  under `[shader_globals]` and driven by `TerrainField._process`.

## Gotchas already paid for

- `ArrayMesh.custom_aabb` is **mandatory** on vertex-displaced meshes. Without
  it Godot culls against the undisplaced AABB and chunks blink out when the
  camera pitches up.
- `add_surface_from_arrays(..., flags = 0)` — attribute compression half-floats
  UV, and UV carries block-centre geometry here, not texture coords.
- `chunk_n` caps at 48; 58 overflows 16-bit indices and silently doubles vertex
  bandwidth.
- `cast_shadow = OFF` on all terrain. 120k blocks in a shadow pass is a second
  full geometry draw per cascade.
- Emission energies tuned for void-fracture's thin neon strips blow out
  completely on full tile faces. `cap_energy` is 0.10 here, not 3.5.

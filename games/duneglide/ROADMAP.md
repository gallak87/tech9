# DUNEGLIDE — Roadmap

## Status: Phases 1, 2, 2.5, 2.75, 3a, 3c done. Phase 3b (finish + thruster) next.

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
- ~~`scripts/SubstrateMesh.gd` + `shaders/substrate.gdshader`~~ — was a
  continuous floor under gapped tiles. **Deleted in Phase 3c**; the columns are
  the floor now. See 3c for why that sheet was structurally unfixable.
- `scripts/TerrainField.gd` — 4-ring clipmap, `chunk_n 48`, 52 chunks,
  ~120k blocks, ±768 units. Streaming is `global_position` writes only; no
  allocation, no mesh rebuild, so recycling cannot hitch.
- `scripts/DebugParity.gd` — press **P**. Grid of emissive dots at CPU heights;
  they must sit tangent to the GPU block tops. Verified passing.
- `shaders/dawn_sky.gdshader` + `assets/dawn_env.tres` — dawn gradient, sun orb,
  depth fog, glow carried over from void-fracture (`glow_hdr_threshold 0.7`).

**Measured: 24 draw calls, 120fps (vsync-capped) on M1 Pro at 1280x800.**
Baseline it replaces: void-fracture at 894 draw calls / 973 objects.

### Phase 2 — Glide controller + camera
- `scripts/Glider.gd` — owns position and yaw only; bank/pitch are cosmetic and
  live on the `Attitude` child so gameplay direction is never contaminated by
  visual roll. Bank is the state, yaw rate is *derived* from it via a
  coordinated turn, so turn radius scales with speed automatically (33m at
  cruise 78 u/s, 76m at boost 118 — boost widens turns for free).
- Altitude: critically damped spring to `Height.height_grad()` + hover, with
  0.28s forward look-ahead so the ship climbs *before* the dune arrives.
  Terrain is soft; the spring always wins and there is no crash case.
- `scripts/ChaseCamera.gd` — damped follower with **independent** time
  constants for position / yaw / roll (~22° yaw lag mid-carve is what makes a
  carve read as one). Not a child of the ship, and roll lives on a child pivot
  because `look_at()` rewrites the basis.
- `scripts/Damp.gd` — delta-based smoothing helpers. Never use a bare
  `lerp(a, b, k)` here; it settles at different rates at 60 and 120fps.
- `debug_attitude_report()` on the Glider scores nose-vs-slope agreement per
  frame. Currently 89.4%; the residual is damping lag. A sign inversion reads
  ~10%, so this catches the bug class below if it ever comes back.

### Phase 2.5 — Real ship mesh
- Swapped the placeholder `PrismMesh` delta for void-fracture's TripoSR-derived
  jet (`assets/ship.glb`, originally `void-fracture/staging/0/mesh.glb`).
- Carries the same hand-tuned rotation basis void-fracture uses — TripoSR has
  no guaranteed output orientation, so that basis is the only thing making the
  nose point `-Z`. Uniformly scaled ×5: the raw mesh is only 0.88 units at its
  longest and read as a speck at the chase-camera distance.
- `Glider._skin_hull()` overrides the GLB's baked TripoSR texture with a flat
  material, the same trick void-fracture uses — the baked texture fights the
  dawn palette.

### Phase 2.75 — Dev overlay
- `scripts/DevTool.gd`, backtick (`` ` ``) to toggle, matching void-fracture's
  convention. `PROCESS_MODE_ALWAYS` so it survives a pause.
- Live telemetry: fps, draw calls, speed, boost, altitude, bank, heading,
  terrain height, position, camera yaw lag, fov, wave clock.
- Cell-look knobs, bound only while the overlay is open so they don't reserve
  keys from flight: `[` / `]` bar height, `-` / `=` bar row spacing, `;` / `'`
  bar thickness, `,` / `.` cell fill.
- Bar shape is pure shader state and therefore free. **`fill` is the expensive
  one** — it is baked into vertex positions, so unlike every other terrain
  parameter it cannot be a uniform, and `TerrainField.set_fill()` rebuilds one
  ArrayMesh per LOD (4 x 46080 verts). Fine on a keypress, never per frame.
- **`\` freezes** the tree and hands the camera to an orbit rig — drag to orbit
  the ship, wheel to zoom. Unfreezing calls `ChaseCamera.snap()` so play resumes
  from behind the ship instead of easing back from an arbitrary angle. This is a
  geometry-inspection tool for the cell tuning, **not** a game pause; delete it
  once the look is settled.
- Otherwise reads state, never writes it. Knobs drive the exported vars on
  `Glider` / `ChaseCamera` / `TerrainField` directly, so the overlay stays a
  view and the defaults stay in the scripts.

### Phase 3a — Value inversion
The "tiles read vectory" issue below, steps 1-3. The substrate and the blocks
swapped roles: **the substrate is now the bright glossy surface and the blocks
are the dark marks on it.** Do not partially revert either half — the look
depends entirely on the contrast between them, so darkening the floor without
lightening the blocks (or vice versa) collapses straight back to the flat read.

- `substrate.gdshader` — `floor_color` 0.44 -> 0.74, roughness 0.95 -> 0.07,
  specular 0.1 -> 1.0. Normal is now recomputed **per-fragment** from
  `terrain_hd`; at this roughness the sky reflection is sharp enough that the
  interpolated vertex normal showed the substrate's triangulation as faceted
  bands. Costs nothing measurable (still 120fps / 19 draw calls).
- `substrate.gdshader` — the floor now samples the **min of the four block
  centres bracketing each vertex**, not the height at the vertex itself. Blocks
  hold one height flat across each block; a smooth sample disagrees by up to
  `slope * pitch/2`, which at LOD3 (pitch 8) is several units against a `drop`
  of 0.14 — the floor punched up through the tops and rendered as smooth pale
  wedges lying over the mosaic. The min is correct by construction at every LOD
  and slope, so `drop` only has to cover LOD seams now. Needs the ring's `pitch`
  as a uniform; `TerrainField._substrate_mat()` passes it.
- `substrate.gdshader` — coarse dark grid, `grid_spacing 24.0` (24x the block
  pitch, so it reads as panel seams *under* the mosaic, not more mosaic).
  Distance-widened line mask so far seams dim instead of moireing. Seams are
  matte, so they stay legible where the sun sheen crosses them.
- `block_terrain.gdshader` — `base_color` 0.60 -> 0.13, `body_energy` and
  `cap_energy` to 0, `edge_energy` 0.55 -> 0.05 (0.14 still read as neon piping
  around every block), both faces matte. Per-block `hue` range tightened to
  0.82-1.18: on a dark albedo the old 0.72-1.28 is a far bigger *relative* swing
  and the field went speckly.
- Lighting had to come up with it, or the "bright" floor rendered as dark slate:
  `ambient_light_energy` 0.42 -> 0.62, sun energy 0.55 -> 0.85, and the sky's
  `ground` colour 0.26 -> 0.40. `ambient_light_source` is SKY, so that ground
  colour is half the irradiance on an up-facing surface even though it is never
  seen directly.

### Phase 3c — Solid columns (the substrate is gone)

**This supersedes the geometry half of 3a. The 3a shader notes above are kept
for the colour/lighting reasoning only — `substrate.gdshader` and
`SubstrateMesh.gd` no longer exist.**

Phase 3a shipped three terrain bugs in a row and they were all one bug. A cell
was a top quad with a short skirt *hovering* over a separate smooth sheet, and
the gap between skirt-bottom and sheet was a free variable that moves with
slope. A smooth sheet cannot stay a constant distance under a stepped surface —
on a slope they diverge by `slope * pitch`. Each fix pushed the error into a
different symptom:

| symptom | what was actually wrong |
|---|---|
| pale smooth wedges lying over the mosaic | sheet came up through the tile tops |
| far slope visible under the near tiles | skirt stopped short of the sheet |
| tiles read as "+" risers up close | skirt stretched to reach the sheet |

Now: **every cell is a full-width solid column, and the columns are the ground.**
`fill = 1.0`, no substrate mesh, no `substrate_drop`, no adaptive skirt. Those
three states are not fixed, they are unrepresentable. Confirmed against the
reference video — it is solid pillars with zero gaps, each slightly proud of its
neighbours, and the slope comes purely from their varying height.

- The bright-floor / dark-bar value split from 3a survives, but as two **cell
  types on one mesh** instead of two meshes: bar cells sit `bar_height` proud,
  shade dark and matte; floor cells shade bright and glossy. The coarse grid
  seams moved onto floor-cell tops.
- `column_depth` (x pitch) only has to exceed the largest step to a neighbour,
  ~1.66 x pitch. Everything below that is hidden behind the neighbouring column,
  so being generous costs nothing. 3.0 is the default.
- All four top verts still share the cell-centre sample, so a cell top is
  flat-shaded — that IS the voxel read, and it also sidesteps the normal
  aliasing that 3a's per-fragment substrate normal needed a distance filter for.
- **Draw calls halved, 19 -> 11**, and terrain vertex count dropped by the whole
  substrate grid. Still 120fps.
- `fill` stays on a dev knob (`,` / `.`) purely to demonstrate that anything
  below 1.0 opens real holes you can see the far side of the dune through. The
  intended value is 1.0 and there is no reason to ship anything else.

## Up Next (in order)

1. **Phase 3b — Art finish + thruster.** Step 4 of the inversion (SSAO in the
   gaps, per-tile roughness/albedo off `v_hash`, possibly SSR for a true wet
   sheen and a visible ship reflection) plus the engine thruster.
2. **Phase 4 — Combat port.** Weapon tiers, bullets, pickups, bombs, HUD,
   `Game.gd` state machine. All fire directions become
   `global_transform.basis * local_dir` — void-fracture's are literal `-Z`.
3. **Phase 5 — Enemies + bosses.** Per-archetype altitude behaviour: scouts hug
   terrain, bombers hold altitude, drones dive. Formations rewritten from
   corridor coordinate literals to heading-relative offsets.
4. **Phase 6 — UX pass.** Menu, game over, wave transitions, speed/altitude
   readout, dev tool with terrain toggles.
5. **Phase 7 — Polish.** See below.

## Known Issues / Tech Debt

- ~~**Tiles read "vectory" rather than "concrete"**~~ — steps 1-3 done in
  Phase 3a above; only step 4 (the finish pass) is left. Original analysis kept
  because it is the reasoning behind the whole current palette:

  **Tiles read "vectory" rather than "concrete"** (raised at the Phase 1 gate).
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
- **The clipmap edge is only hidden by a haze band in the sky shader**, and the
  sky's below-horizon colour is load-bearing for far more than the sky. Two
  separate couplings, both of which produced "dark patch" reports:

  1. *Seeing past the edge.* Terrain stops at +-768 and `fog_sky_affect` is 0,
     so rays that would hit terrain further out hit raw sky instead. That makes
     a band running from the horizon down to
     `atan(eye_height_above_the_DISTANT_terrain / 768)` — bounded above by the
     far silhouette, below by near terrain. The driver is height above the
     *distant* terrain, **not altitude**: skimming a ridge crest at 2 units puts
     the eye ~70 above a far trough = 5.2 degrees. Flying ridge lines is the
     worst case and is exactly how it was found.
  2. *Aerial perspective.* `fog_aerial_perspective = 0.55` tints distance fog
     with the sky radiance **along the view ray**. Looking even slightly down at
     distant terrain samples below the horizon, so the ground colour bleeds
     straight onto far terrain. Proved by setting `ground` to red: the entire
     terrain went pink, not just a sky band. This is the stronger of the two and
     is why the artifact reads as a broad dark *region* rather than a thin strip.

  Fix for both: `haze_color` = `fog_color` over a band `haze_depth` deep, with a
  long tail to `ground` so the shelf's own lower edge is never a visible line.
  **0.20 (11.5 degrees)**, up from 0.055 (3.2), which covered flat ground and
  failed on every ridge. Verified clean at 30 units of lift and at a 35-degree
  down-angle.
  Widening the *band* is safe; raising `ground` itself is the trap — that floods
  ambient AND aerial perspective AND gets mirrored by the glossy floor cells,
  and the whole scene washes to white.
- Riser-to-width ratio on the columns is exactly the terrain slope, so
  **shrinking `pitch0` does not make the steps less chunky** — it scales the
  riser and the cell width together. On the ~30 degree dune faces that is ~0.55.
  Post-3c that is the intended look rather than a defect, but if it ever needs
  softening the only real lever is the heightfield's own slope (amplitude or
  dominant wavelength), which also changes how the terrain flies.
- **LOD banding / pop.** The cell pitch doubles per ring, so the mosaic is
  visibly coarser further out and a band of ground re-resolves to finer cells as
  you fly into the next ring. Expected clipmap behaviour, not a bug — but it is
  a hard switch with no blend. Standard cures if it bothers: morph the outer
  cells of a ring toward the coarser sample over the last stretch before the
  seam (geometry-clipmap style), or push the seams further out with more rings.
  Cosmetic; deferred.
- Faint hairline at LOD ring boundaries on steep slopes. The rings sample height
  at different cell centres, so they disagree slightly. There is no substrate
  filling it any more, so this is now the only thing that can show a crack —
  recheck it before the terrain is called done.
- `DebugParity` (**P**) plots CPU heights against the raw analytic surface, so
  its dots sit tangent to **floor**-cell tops. Bar cells are raised
  `bar_height` above that, so a bar row reading high by exactly `bar_height` is
  correct, not a parity failure.
- Heavy moire on the tile field when viewed from high altitude. Not visible at
  gameplay altitude and MSAA 2x + FXAA is all we have (TAA is banned, see Phase
  0), so it is only a problem if a high camera ever ships.
- Morph rate (~126s cycle, big dunes drifting ~2.8 u/s) is unreviewed — tune
  once there is a ship to judge it against.
- Total nose pitch swing is ~41° over varied terrain, which is a lot of drama.
  It moves in the right direction now, so it may read as expressive rather than
  wrong — if not, halve `surf_pitch_gain` and the `_climb_pitch` clamp.
- **Perceived** speed is unreviewed. The numbers are already there (cruise
  78 u/s ≈ 175 mph, boost 118 ≈ 264 mph, 78 tiles/sec), so if it doesn't *feel*
  fast the fix is the cues — motion blur, speed lines, camera distance, FOV
  kick — not a bigger number.

## Key Files

| Path | Purpose |
|---|---|
| `scripts/Height.gd` | Analytic height + gradient. **CPU source of truth.** |
| `shaders/terrain_height.gdshaderinc` | GPU twin. **Must stay identical.** |
| `scripts/BlockChunkMesh.gd` | Baked column chunk, 20 verts/cell |
| `scripts/TerrainField.gd` | 4-ring clipmap: spawn, snap, recycle, drive `h_time`; owns cell/bar params |
| `shaders/block_terrain.gdshader` | Column extrusion, bar pattern, floor/bar shading, grid seams, fog fade |
| `shaders/dawn_sky.gdshader` | Dawn gradient + sun orb |
| `scripts/DebugParity.gd` | CPU/GPU agreement harness (**P**) |
| `scripts/DevTool.gd` | Dev overlay (**`**), cell knobs, freeze+orbit (**\\**) |
| `scripts/Glider.gd` | Flight controller; owns position + yaw only |
| `scripts/ChaseCamera.gd` | Damped follower, independent pos/yaw/roll rates |
| `scripts/Damp.gd` | Frame-rate-independent smoothing helpers |
| `assets/ship.glb` | TripoSR jet from void-fracture; basis is load-bearing |
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

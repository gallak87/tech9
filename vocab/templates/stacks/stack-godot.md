## Rendering Tier — godot

Godot 4.6, Forward+ renderer. Native 3D. **Not a web stack** — there is no Vite, no npm, no
`src/index.html`. Ignore any instruction that assumes one.

Read `capabilities/godot-mcp.md` before writing code. Without that bridge you cannot see what
you build.

### Project structure

```
{{game_name}}/
  project.godot
  mcp_interaction_server.gd     ← REQUIRED autoload, copy from another Godot game
  scenes/
    Main.tscn                   ← main scene
  scripts/
    *.gd or *.cs             ← see "Language" below; not prescribed
  shaders/
    *.gdshader
    *.gdshaderinc
  assets/
    *.tres  *.glb
```

### project.godot essentials

```ini
[application]
run/main_scene="res://scenes/Main.tscn"

[autoload]
McpInteractionServer="*res://mcp_interaction_server.gd"

[rendering]
renderer/rendering_method="forward_plus"
anti_aliasing/quality/msaa_3d=1
anti_aliasing/quality/screen_space_aa=1
```

**Forward+ is required for glow.** Mobile/Compatibility silently drop it.

### Anti-aliasing: TAA is a trap for displaced geometry

Use **MSAA 2x + FXAA**. Do **not** enable TAA on any game that moves vertices in a vertex
shader. Godot builds motion vectors from `PREV_MODEL_MATRIX`, which knows nothing about
vertex-shader displacement, so TAA smears displaced geometry to mush at speed.

### Boot pattern

`Main.tscn` holds `WorldEnvironment`, a `DirectionalLight3D`, the player/camera rig, and the
world root. Scripts own behaviour; the scene owns wiring. Prefer script-driven cameras over
`Camera3D` as a child of the player — a rigid child inherits every twitch.

### Shader globals

Values every terrain/world shader needs go in `project.godot` under `[shader_globals]` and are
driven from one `_process`:

```gdscript
RenderingServer.global_shader_parameter_set("my_time", t)
```

One write updates every material atomically. Far better than looping over materials.

### Vertex-displacement rules

If a vertex shader moves geometry, these are not optional:

- **`ArrayMesh.custom_aabb` is mandatory.** Godot culls against the undisplaced AABB, so
  chunks blink out when the camera turns. Size it to cover the full displacement range.
- **`add_surface_from_arrays(..., flags = 0)`** if any vertex attribute carries geometry
  rather than texture data — attribute compression half-floats UV and will corrupt it.
- **Keep index counts under 65536 per surface** or Godot silently promotes to 32-bit indices
  and doubles vertex bandwidth.
- **`cast_shadow = OFF`** on dense procedural geometry. A shadow pass is a second full
  geometry draw per cascade.

### Language: C# and GDScript, and where each actually wins

**Not prescribed — decide per game, and state the decision in the roadmap.** The examples in
this doc and in `capabilities/godot-mcp.md` are written in GDScript for brevity; they are not a
recommendation. Both languages have full engine access.

The real tradeoff, because "C# is faster" is only half true:

- **C# wins on compute.** JIT-compiled, typically several times faster than GDScript on tight
  numeric loops — mesh generation, noise fields, pathfinding, physics you run yourself, anything
  iterating tens of thousands of times per frame.
- **C# loses on chatter.** Every call across the C#↔engine boundary marshals. Code that is mostly
  node manipulation, property sets and signal handling can be *slower* in C# than in GDScript,
  which has no boundary to cross. Gameplay glue is exactly this shape.
- The Godot-idiomatic split is: GDScript for glue and scene behaviour, C# (or GDExtension in
  C++/Rust) for the measured hot path. Mixing is supported and normal.

One hard constraint regardless of preference: **C# requires the .NET build of Godot.** Confirm
the binary `mcp:setup` found is the .NET one before committing to it, or nothing compiles.

Do not pick on benchmark folklore. If the hot path is uncertain, write it in either, then
measure with `Performance.get_monitor` and move only what the numbers say to move.

### Analytic normals remove your only warning that winding is wrong

`SurfaceTool.generate_normals()` derives normals *from* triangle winding, so a mesh built
backwards comes out obviously black and you find it in seconds.

The moment you write normals yourself — which you will, for any heightfield, because analytic
normals band-limit and generated ones do not — you decouple shading from winding and that signal
is gone. An inverted mesh then **shades perfectly correctly** while back-face culling silently
keeps the faces pointing away from the camera and discards the ones pointing at it. The world
renders as a hollow shell: near walls missing, far walls visible through them, everything below
eye height gone. It does not look like a winding bug. It looks like missing geometry or torn
terrain, and it will survive every test you write against vertex positions, because the vertex
positions are fine.

This cost three sessions on the last game. If you write normals analytically, assert winding
once at build time — the geometric normal `(b-a) × (c-a)` must agree with the analytic normal at
the same vertex. A dot product below zero means the surface is inside-out. One assert over the
first chunk is enough; the bug is systematic, never local.

Layout convention that satisfies it for a heightfield grid where `+i → +X` and `+j → -Z`:
with `a=(i,j)`, `b=(i+s,j)`, `c=(i,j+s)`, `d=(i+s,j+s)`, the sky-facing pair is `(a,b,c)` and
`(b,d,c)`. Get it right in *every* index generator — interior grid, LOD stitch bands and skirts
are three separate loops and they were all wrong together.

### Use the engine before writing one

The previous Three.js game hand-rolled 1,839 lines of post-processing and 1,402 lines of CPU
particle simulation. In Godot that is `WorldEnvironment` and `GPUParticles3D`, tuned, on the GPU,
free.

Use built-in CSM shadows, volumetric fog, SSAO, SSR, glow and GPU particles until you can
*measure* that they are insufficient. The pull toward hand-rolling is strong and it is where the
budget goes. Custom shaders are for the things the engine genuinely has no answer for — the
terrain surface, the water surface — not for a bloom pass.

### Nothing exists until it is in the scene tree

A script file is not a feature. A previous session produced 4,873 lines of finished, correct
modules that nothing instantiated — they looked like progress in the diff and did not exist in
the running game.

Get a playable end-to-end loop first: ship flies, one enemy spawns, one gun fires, one HUD
element updates, death and respawn work. Then deepen each in place. Never build a system that is
not already wired into `Main.tscn` and running.

### Verify before claiming done

```
run_project → game_get_errors → game_eval (assert state) → game_screenshot → draw calls
```

Record fps and draw calls in the roadmap on every rendering change.

### Ship

**There is no publish target.** "Playable" means the Godot binary running the project locally,
and that is the finish line. Do not spend a phase on export, packaging or web builds, and do not
constrain any technical decision by what would export cleanly — pick whatever makes the game
better to build and to play. If a publish target ever appears, it becomes its own project.

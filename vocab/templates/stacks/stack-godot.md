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
    *.gd
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

### Verify before claiming done

```
run_project → game_get_errors → game_eval (assert state) → game_screenshot → draw calls
```

Record fps and draw calls in the roadmap on every rendering change.

### Ship

Godot exports to HTML5, but web export of a Forward+ 3D game is a real task with its own
constraints — treat it as its own phase, not a free step at the end. Until then "playable"
means the Godot binary running the project locally.

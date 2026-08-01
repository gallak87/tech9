# Capability: godot-mcp

Drive a running Godot game from an agent. Launch it, read its scene tree, inject input,
execute GDScript inside it, screenshot it, and read its frame counters.

Without this an agent can write GDScript but cannot see the result — it is coding blind and
the human becomes the render loop. With it, the agent closes its own loop: change → run →
verify → measure → iterate. **This is the difference between a Godot game an agent can
actually build and one it can only type.**

## Probe

Before using this capability, check whether it's available:

```
npm run mcp:check      # reports status, changes nothing
```

Also confirm the tools are registered — `/mcp` should list `godot-mcp`. If the server is
present the agent has `run_project`, `game_screenshot`, `game_eval`, `game_get_scene_tree`,
`game_key_press`, `game_get_errors`, `stop_project` and the rest of the `game_*` family.

**If godot-mcp is not available: do not start a Godot game.** Unlike image-gen, there is no
useful fallback — a written spec is not a substitute for a 3D build, and an agent that cannot
see its own output will produce hours of confidently wrong geometry. Surface it to the user
and stop.

## Setup

Needs Godot 4.4+ and Node 18+.

```
npm run mcp:setup
```

Clones and builds [tugcantopaloglu/godot-mcp], finds the Godot binary, writes a
project-scoped `.mcp.json`. Restart Claude Code afterwards.

`.mcp.json` is per-machine (absolute paths) and gitignored. **If godot-mcp is already
configured at user level — check `claude mcp list` — skip setup**, a project-scoped copy just
registers a duplicate.

### The in-game half — required, and easy to forget

The MCP server is only one side of the bridge. Every Godot project must also carry
`mcp_interaction_server.gd` at its root, registered as an autoload:

```ini
[autoload]
McpInteractionServer="*res://mcp_interaction_server.gd"
```

It opens a TCP JSON server on `127.0.0.1:9090` and is what every `game_*` tool actually talks
to. **Copy it into any new Godot project or none of the tools work.** Port is overridable
(`--mcp-port=N` or `GODOT_MCP_PORT`) so two games can run side by side for A/B comparison.

## The verify loop

The loop that works, in order:

```
1. run_project                    launch
2. game_get_errors                catch script/shader compile failures FIRST
3. game_eval                      assert on state — numbers, not vibes
4. game_screenshot                confirm it looks right
5. Performance.get_monitor(...)   confirm it still runs
```

Step 3 before step 4 is the important ordering. A screenshot tells you something is wrong;
an eval tells you what.

### Measuring performance

```gdscript
return {
  "fps":         Performance.get_monitor(Performance.TIME_FPS),
  "draw_calls":  Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
  "objects":     Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
}
```

Record draw calls in the roadmap on every rendering change. It is the number that catches a
regression a screenshot never will.

## Debugging technique — this is where the capability pays for itself

**Prefer a numeric invariant over hunting for a lucky frame.** Intermittent visual artifacts
are extremely expensive to chase by screenshot. If the bug has any geometric or arithmetic
statement behind it, test that statement directly over thousands of cases in `game_eval`:

```gdscript
# Actual example: proving LOD ring coverage was broken
var bad := 0
for i in 20000:
    var p = Vector2(rng.randf_range(-5000, 5000), rng.randf_range(-5000, 5000))
    ...  # recompute the invariant that should hold
    if not holds: bad += 1
return {"trials": 20000, "violations": bad}
```

That returned `44830 / 60000` in one call and turned a multi-hour intermittent-artifact hunt
into a proven root cause. Screenshots had failed to catch it across a dozen attempts.

**Use garish debug colours to test a hypothesis.** Set a uniform or material to pure red and
see what turns red. It converts "I think that dark patch is X" into a yes/no in one frame.
Be aware of what else the value feeds — setting a sky's ground colour red tinted the entire
terrain, because it also fed ambient light and aerial-perspective fog. That accidental result
was itself the finding.

**Isolate by hiding.** Toggling `visible` on a subset of meshes via `game_eval` answers
"which mesh is that?" instantly.

**When the invariant keeps passing and the artifact is still there, stop deriving and raycast.**
This is the failure mode of the technique above, and it is expensive. Deriving proves statements
about your *model*. It cannot see a defect where the model is correct and the renderer disagrees
with it — there, every derivation you run will keep confirming the model, truthfully, forever.

The last game had ribbons of geometry hanging in mid-air. Three sessions of deriving proved the
height field had no spikes, that every mesh vertex lay exactly on that field, and that the
steepest slope was legitimate. All true. Every triangle was wound backwards, so back-face culling
was keeping the faces turned away from the camera and discarding the ones facing it. Nothing in
the pipeline inspected index order, and the normals were written analytically, so the surface
still shaded correctly.

Switch instruments the moment clean results and a visible defect coexist:

```gdscript
# what is actually under those pixels?
var params := PhysicsRayQueryParameters3D.create(from, to)
var hit := get_tree().root.get_world_3d().direct_space_state.intersect_ray(params)
```

- **Raycast the artifact.** A control ray fired straight down from 5000 m onto a chunk's own AABB
  centre returned *no hit* — impossible for a front-facing heightfield. That one result was the
  whole diagnosis. (For a `MeshInstance3D` with no collider, do the ray against the vertex arrays
  in `game_eval`, or attach a temporary `create_trimesh_collision()`.)
- **Compare geometric to shading normal**: `(b-a).cross(c-a)` against the normal written at that
  vertex. A dot of −1.000 is conclusive; nothing else reports it.
- **Diff two renders**, one with the suspect meshes hidden — that difference is the silhouette
  exactly as rasterised, no assumptions.
- **Flip what you cannot observe.** Setting the material to `cull_disabled` draws precisely the
  triangles the GPU was discarding. If the frame becomes correct, you are finished.

**Rule of thumb: derive against the model, raycast against the render.**

**Validate an instrument before believing it reports nothing.** A measurement that says "no
effect" is the most dangerous reading you can get, because it looks like a result. A guidance
probe on the last game reported 0 hits out of 49 while the system was connecting on two thirds
of them — it sampled once per tick, the sim tested the swept segment between ticks, and every
clean strike registered as a near miss. The numbers were also *stable across parameter changes*,
which reads exactly like "my edit did nothing".

- Before trusting a null, feed the instrument a case you know is positive. If it cannot see that,
  it cannot see anything.
- **Count events where they are applied, not by polling from outside.** An entity is usually
  freed on the frame its event fires, so a sampler structurally cannot observe it — the last
  frame it ever sees is the one before. Increment a counter inside the collision/damage handler
  and read it with `game_eval`.
- **Tell:** a number that does not move when you change the parameter it measures is almost never
  a real invariance. Suspect the instrument first.

**Build an input harness and a time-domain harness early.** A screenshot is one frame with no
keys held, so whole classes of bug are invisible to it however many you take:

- *Input domain* — "does the fire button actually fire" cannot be answered by any capture,
  because the capture path never presses a key. `game_key_press` / `game_key_hold` plus a
  `game_eval` assert on the resulting state. This caught a gun bug that a dozen review
  screenshots had missed.
- *Time domain* — "is there dead air in this encounter", "does the boss drift out of range" are
  questions about seconds, not frames. Step the sim and sample state ~10×/second. This found an
  AI bug where every enemy lagged its commanded position.

## Gotchas already paid for

Each of these cost real time. Read them before you lose an hour.

- **Screenshots go stale when the game window is occluded or unfocused.** macOS stops
  rendering the window, and `game_screenshot` happily returns the last frame — pixel-identical,
  no error. If successive screenshots look impossibly unchanged, verify the game is live
  (`game_eval` a moving value) before concluding your change did nothing. Bring the window
  forward or restart the project.
- **`--headless --check-only` hangs on Apple Silicon.** Background it, sleep, then
  `pkill -f "Godot.*headless"`. `timeout` is not installed on macOS by default.
- **New `class_name` scripts are invisible to a launched game until the class cache exists.**
  Run `Godot --headless --editor --quit --path .` once after adding one, or you get
  `Identifier "X" not declared in the current scope`.
- **Do not `await` inside `game_eval`** — it deadlocks against the server's busy mutex.
  (Short `create_timer` awaits do work in practice, but treat anything longer as unsafe.)
- **`load()` returns the cached resource.** Editing a `.gdshader` or `.gd` on disk does not
  affect the running game. Restart the project to pick up file edits — otherwise you will
  "fix" something and watch nothing change.
- **Values set via `game_eval` are runtime-only.** After tuning a shader param live, bake it
  into the file, then restart and re-verify from a cold start. Easy to lose an hour of tuning.
- **Script-driven nodes overwrite what you set.** Moving a camera that a controller script
  drives every frame does nothing visible. Pause the tree first (the dev overlay should
  survive pause via `PROCESS_MODE_ALWAYS`), and move the node the script actually writes —
  setting a child's transform when the script drives the parent silently breaks the rig.

## What to build into the game to make this capability stronger

A Godot project that carries these is dramatically faster for an agent to work on:

- **A dev overlay** on a dedicated key, `PROCESS_MODE_ALWAYS` so it survives pause. Live
  telemetry the agent can also read via `game_eval`.
- **Runtime knobs** for anything being tuned by eye, so the human can dial it without a
  rebuild and the agent can set it via `game_eval`.
- **A freeze + orbit camera.** Being able to stop time and fly around the geometry is worth
  more than any number of forward-facing screenshots for diagnosing 3D problems.
- **A parity/invariant harness** for anything computed twice (e.g. the same function on CPU
  and GPU). One glance confirms they still agree.

## Known limitations

- Screenshot fidelity depends on the OS actually compositing the window — see the staleness
  gotcha above. Headless screenshotting is not supported through this bridge.
- One game per port. Run two by overriding `--mcp-port`, and point the tools at the right one.
- `game_eval` runs in the server's context, not a scene script's — reach nodes via
  `get_tree().root.get_node("...")`.
- Godot's own `push_error`/`push_warning` stream is polled by `game_get_errors`; it returns
  only what is new since the last call, so call it right after launch or you will miss the
  compile errors.

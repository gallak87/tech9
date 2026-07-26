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

# Dev Tool Contract

Rules for dev tools built during development. On web tiers this is scoped to art generation
phases and every tool is stripped at ship time. On the Godot tier the overlay is a general
tuning/inspection tool used across all phases — see [Godot](#godot) below.

---

## Web tiers (canvas2d, pixi, threejs)

### What a dev tool is

A lightweight in-game overlay mounted by the dev agent when the art agent enters a new
sprite domain. It gives the user real in-game context for art decisions — not a PNG in
chat. One tool per domain, stays live for the duration of that domain's generation.

Examples:
- **Terrain domain** → floating panel cycling through generated tile sets on the live map
- **Hero domain** → overlay showing the hero sprite in idle/walk/attack states over a background
- **Building domain** → side-by-side panel showing upgrade tiers as they complete
- **Enemy domain** → encounter preview showing the enemy sprite at battle scale

---

### Mount pattern

```js
// Wrap in env check — stripped at build time when DEV_TOOLS=false
if (import.meta.env?.DEV_TOOLS !== 'false') {
  (function mount<DomainName>DevTool() {
    // minimal DOM, no framework
    // reads from the live asset paths the art agent is writing to
    // updates as new sprites land (poll or hot-reload)
  })();
}
```

Rules:
- One IIFE per domain, clearly labelled `// DEV TOOL — <domain>`
- No coupling to game state or save data — read assets only
- Positioned so it doesn't obscure the primary game view
- Removable by deleting the IIFE block — no other code depends on it

---

### Env gate

Add to the game's build/serve config:

```
DEV_TOOLS=true   # default during development
DEV_TOOLS=false  # set before final ship build
```

For static builds with no bundler, use a global:

```js
// index.html, before game.js
window.__DEV_TOOLS__ = true; // removed at ship time
```

And check `window.__DEV_TOOLS__` instead of `import.meta.env`.

---

### Ship gate

Final phase checklist item (dev agent owns this):
- [ ] Set `DEV_TOOLS=false` (or remove `window.__DEV_TOOLS__ = true`)
- [ ] Confirm no dev tool overlays visible in the build
- [ ] Remove IIFE blocks if desired for clean source (optional — env gate is sufficient)

---

## Godot

Godot has no build-time strip step and no separate art-generation phase boundary, so the
overlay is not disposable scaffolding — it's a permanent tuning/inspection tool that stays in
the project. `godot_tools` owns it. Reference implementation: `games/duneglide/scripts/DevTool.gd`
and `games/duneglide/scripts/DebugParity.gd`.

### Overlay lifecycle

- `CanvasLayer`, `process_mode = Node.PROCESS_MODE_ALWAYS` so it keeps working through
  `get_tree().paused` — a dev overlay that dies with the pause state is useless exactly when
  you need it (e.g. driving an orbit camera while frozen).
- Toggle on a dedicated key not used by gameplay (duneglide: backtick).
- Tuning knobs bind **only while the overlay is visible**, so plain keys (`[`, `]`, `-`, `=`)
  can be reused without stealing them from gameplay input the rest of the time.

### Overlay is a view, not a source of truth

The overlay reads and writes the owning script's `@export` vars directly — it never holds its
own copy of a value. Defaults live in the scripts, not the overlay. This keeps the overlay
deletable without touching tuned behavior, and keeps "what's the current value" a single
source of truth.

### Cheap vs. expensive knobs

Know which category a knob is before wiring it to a live key:
- **Cheap** — shader uniforms (`set_shader_param`), material colors, camera params. Safe to
  drive every frame or on every keypress.
- **Expensive** — anything baked into vertex positions or a mesh resource (e.g. duneglide's
  bar height/period/width, which trigger `TerrainField.set_bars` → a mesh rebuild). Fine to
  drive from a discrete keypress; must never be wired to a continuous input (mouse drag,
  per-frame slider) or it'll rebuild geometry every frame.

### Freeze + orbit inspection camera

A temporary pause-and-orbit mode for inspecting geometry up close (mouse-drag yaw/pitch, wheel
zoom, hands the camera back to its rig cleanly on unfreeze) is a useful enough pattern to
reuse, but mark it explicitly temporary in a comment with the condition under which it should
come out (duneglide: "once the cell look is settled"). It is not a game pause and shouldn't
pretend to be one — it drives the camera transform directly while the rest of the tree is
paused.

### Parity/invariant harness

For anything computed on both CPU (gameplay/physics) and GPU (shader) — most commonly a
displacement or height function — add a toggleable harness that visibly proves the two agree:
spawn markers at the CPU-computed positions and check they sit exactly on the GPU-rendered
surface. Any drift between the two implementations shows up as visible floating/sinking within
one frame instead of a subtle gameplay bug. Cheap to build, catches a whole class of "shader
and CPU code silently diverged" bugs before they're ambiguous. Leave it in the tree
permanently on its own toggle key — every future edit to the shared function gets verified in
one keypress.

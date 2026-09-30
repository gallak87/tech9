# Nacre leviathan

The game loads the original280m v2creature. See [current asset details](README-v2.md) for its editable Blender source, GLB contract, budgets and rebuild instructions. `concept-v1.json` records the generated concept prompt/provenance. Older v1source files are not loaded at runtime.

`src/environment/level3/leviathan/` owns two presentation-only appearances: a curved first-jump breach and an early left-to-right underwater crossing. One loaded body follows arc-length paths; speed-aware timing, pause/reset, reduced motion and disposal never mutate vehicle or race state. Tests cover actual GLB framing, complete road/world clearance, loading and lifecycle behavior.

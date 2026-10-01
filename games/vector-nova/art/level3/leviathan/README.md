# Nacre leviathan

The game loads the original 280 m v2 creature. See [current asset details](README-v2.md) for its editable Blender source, GLB contract and rebuild instructions. `concept-v1.json` records the generated concept prompt/provenance. Older v1 source files are not loaded at runtime.

`src/levels/nacre/environment/leviathan/` owns two presentation-only appearances: a curved first-jump breach and an early left-to-right underwater crossing. One loaded body follows arc-length paths; speed-aware timing, pause/reset, reduced motion and disposal never mutate vehicle or race state. Tests cover actual GLB framing, complete road/world clearance, loading and lifecycle behavior.

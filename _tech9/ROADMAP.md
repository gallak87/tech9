# tech9 — Roadmap

## Current state

A runnable `baselines/web-3d-world` forest, twelve reusable modules and five independent pilots. `baselines/web-2.5d-world` awaits Echo extraction. Games start from owned source copies. Landscape, weather, aircraft, sailing and driving capabilities are available for new games.

```text
idea → baseline + modules → game → playtest → framework-dev
```

---

## Open

### 1. Graduate to the repository root

Extract reusable 2.5D capabilities from Echo, add starting-point selection and check the result against existing Canvas2D, Three.js and Godot games. Complete a new 2D/2.5D game using the accepted framework, then finish and integrate its framework-dev phase.

Move the older framework into `_archive/` and promote `_tech9/` to root. Keep GitHub Pages serving committed browser games and pilots. Decide archive coverage and retain stable public routes.

[Session prompt](../PROMPT-framework-expansion.md) · [Graduation gate and cutover plan](../HANDOFF-tech9-graduation.md)

### 2. Build a full game

Define the new 2D/2.5D game's experience, presentation and target devices. Build it in `games/<slug>/` from the appropriate starting point and modules. Its completed framework-dev phase is the graduation gate.

[Game brief gate](../PROMPT-framework-expansion.md#game-brief-gate)

### 3. Improve baseline performance

Profile frame pacing, foliage, shadows and atmosphere on target hardware. Keep visual comparisons at matching views and settings.

[Baseline performance roadmap](baselines/web-3d-world/ROADMAP.md)

### 4. Develop the canyon starting point

Build an authored canyon with its own terrain, materials and traversal. Reuse weather to exercise rain, snow and shelter in a second environment. Register the accepted package through starting-point selection.

[Canyon brief](docs/plans/canyon.md)

### 5. Compose connected worlds

Build a real level containing forest and canyon regions under one renderer, controller and weather state. Use it to establish terrain/material transitions, consistent contacts and exposure, and bounded detail/loading.

Extract the smallest interfaces that the mixed level proves useful.

### 6. Raise model quality where it matters

Improve prominent models against visual references and actual gameplay views. Choose procedural geometry or Blender according to the asset. Preserve editable sources, usable presets and integration.

---

## Available

| Capability        | Modules                                              |
| ----------------- | ---------------------------------------------------- |
| Grounded movement | grounded-walking, placement-collisions               |
| Water and sailing | pond-water, island-ocean, boat-motion, sailing-ships |
| Cameras           | follow-camera                                        |
| Weather           | weather                                              |
| Flying            | flight-motion, aircraft                              |
| Forest rendering  | landscape                                            |
| Driving           | vehicles                                             |

[Usage and dependencies](modules/README.md)

---

## Deferred

- **Simpler planning metadata:** reduce required scaffolding fields when the current plan format adds work without improving a game build.
- **Native runtime comparison:** compare the same forest assets and views in Godot; use measured results to guide further work.

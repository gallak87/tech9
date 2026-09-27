# tech9 — Roadmap

## Current state

A runnable forest baseline, twelve reusable modules and five independent pilots. Games start from owned source copies. Landscape, weather, aircraft, sailing and driving capabilities are available for new games.

```text
idea → baseline + modules → game → playtest → framework-dev
```

---

## Open

### 1. Graduate to the repository root

Move the older framework into `_archive/` and promote `_tech9/` to root. Keep GitHub Pages serving committed browser games and pilots. Decide archive coverage and retain stable public routes.

[Cutover plan](../HANDOFF-tech9-graduation.md)

### 2. Build a full game

Use a fresh session to build a complete game in `games/<slug>/`, combining the accepted modules. Let gameplay and playtesting identify the next useful improvements.

### 3. Improve baseline performance

Profile frame pacing, foliage, shadows and atmosphere on target hardware. Keep visual comparisons at matching views and settings.

[Baseline performance roadmap](baseline/ROADMAP.md)

### 4. Develop the canyon starting point

Build an authored canyon with its own terrain, materials and traversal. Reuse weather to exercise rain, snow and shelter in a second environment. Add baseline selection when a second starting package is accepted.

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

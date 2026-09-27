# tech9 — Roadmap

## Current state

Runnable Three.js forest and Pixi/Canvas coastal starting applications, thirteen reusable modules, three minimal web scaffolds and five independent pilots. Games start from owned source copies. Landscape, weather, aircraft, sailing and driving capabilities are available for new games.

```text
idea → baseline + modules → game → playtest → framework-dev
```

---

## Open

### 1. Graduate to the repository root

Preparation adds Echo-derived sprite exploration, named starting packages, minimal web scaffolds and source-qualified reference findings. Next, complete a new 2D/2.5D game from the user’s brief, then finish and integrate its framework-dev phase. Preparation alone does not satisfy graduation.

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
| Sprite worlds     | sprite-world                                         |
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

### Concrete extraction opportunities

- **Audio runtime:** gesture-safe Web Audio ownership, buses, bounded synthesized cues and cleanup; keep score and game-event mapping local. This is the strongest independent candidate from the reference review. User decision: defer extraction and review it after step 03.
- **Sprite authoring:** extend sprite-world with portable recipe-driven atlas/icon preparation and pixel-parity fixtures; preserve prepared alpha, measured anchors and editable originals.
- **Rigid GLB ownership:** use a real consumer to prove template/instance leases, independent materials, failed/late loads and disposal before introducing another asset abstraction.
- **Deterministic scenery authoring:** build on accepted landscape/world-composition modules with shared seeded placement and matching-camera previews.
- **Native Godot packages:** implement a runnable native source package, scene/resource copying and validated export path before advertising support.

[Source-qualified reference findings](docs/REFERENCE-GAMES.md)

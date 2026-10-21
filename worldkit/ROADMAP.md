# tech9 — Roadmap

> Historical framework reference. This guide is not the Worldkit package development workflow; use [README.md](README.md) for the consumable environment package.

## Current state

Runnable Three.js forest and Pixi/Canvas coastal starting applications, thirteen reusable modules, three minimal web scaffolds and five independent pilots. Games start from owned source copies. Landscape, weather, aircraft, sailing and driving capabilities are available for new games.

```text
idea → baseline + modules → game → playtest → framework-dev
```

---

## Open

### 1. Graduate to the repository root

Preparation is complete: Echo-derived sprite exploration, named starting packages, minimal web scaffolds and source-qualified reference findings are integrated and validated. Next, complete a new 2D/2.5D game from the user’s brief, then finish and integrate its framework-dev phase. Preparation alone does not satisfy graduation.

Move the older framework into `_archive/` and promote `_tech9/` to root. Keep GitHub Pages serving committed browser games and pilots. Decide archive coverage and retain stable public routes.

[Session prompt](../PROMPT-framework-expansion.md) · [Graduation gate and cutover plan](../HANDOFF-tech9-graduation.md)

### 2. Build a full game

Define the new 2.5D game's experience, presentation and target devices. The user's direction is a distinct, non-RPG premise with a new visual identity; the concept and scope remain to be chosen. Reuse sprite-world's capabilities with game-owned artwork and composition. The coastal baseline's Echo-derived artwork is a replaceable example preset, not a requirement for the new game.

Build it in `games/<slug>/` from the appropriate starting point and modules. Its completed framework-dev phase is the graduation gate. Record time to the first playable loop, repeated implementation work and awkward integration points to guide that phase; a useful improvement or authoring tool can be a better contribution than another runtime module.

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

- **Native runtime comparison:** compare the same forest assets and views in Godot; use measured results to guide further work.

### Faster game development

These are roadmap follow-ups, not additional graduation requirements or approved implementation scope. Prioritize them using friction observed in the next game.

- **Shorter path to a playable experiment:** `GENERATE.md` now expands a short pitch into a brief/build summary, a Goal / How to work / Rules prompt and an execution plan, with one default user review before building. Further tooling can automate packet creation and validation; no slash command or natural-language CLI parser is implemented yet. Retain detailed ownership and validation options for larger work without requiring users to author coordination metadata.
- **Playable capability catalog:** connect module descriptions to runnable examples, actual consumers, supported renderers and composition recipes. Let a developer see what a capability does and which pieces work together before reading implementation details. Reuse existing examples and pilots first.
- **Reviewable module updates:** compare a game's owned copy, its recorded source and the current canonical module. Distinguish local customization from upstream changes, preview proposed updates and preserve immutable fork receipts. Current explicit synchronization is not a merge workflow.
- **Framework-dev starter and checks:** scaffold module source, tests, asset notices and a small example; verify registry requirements, owned-copy integration and standalone use. Keep scope and interface decisions reviewable. Extraction should preserve assets, presets and the behavior that made the original useful; module count is not a success metric.
- **Gameplay patterns worth investigating:** compare repeated start/pause/results/retry flows and interaction/feedback behavior across games. Extract only after concrete consumers establish a shared contract; keep each game's objectives, scoring and progression local.

### Concrete extraction opportunities

- **Audio runtime:** gesture-safe Web Audio ownership, buses, bounded synthesized cues and cleanup; keep score and game-event mapping local. This is the strongest independent candidate from the reference review. User decision: defer extraction and review it after step 03.
- **Sprite authoring:** extend sprite-world's existing helpers into portable recipe-driven atlas/icon preparation with crop, transparency, anchor and frame validation. Preserve prepared alpha, measured anchors and editable originals; verify reproducibility with pixel-parity fixtures. Start as an authoring tool owned with sprite-world rather than another runtime module.
- **Rigid GLB ownership:** use a real consumer to prove template/instance leases, independent materials, failed/late loads and disposal before introducing another asset abstraction.
- **Scene and scenery authoring:** begin with a concrete game's small placement inspector for props, collision footprints and interaction zones, previewed through the actual camera. Save deterministic scene data and verify that rendered placement matches traversal. Extend existing landscape/world-composition capabilities for seeded 3D scenery where useful; a full general-purpose editor is not the initial scope.
- **Native Godot packages:** implement a runnable native source package, scene/resource copying and validated export path before advertising support.

[Source-qualified reference findings](docs/REFERENCE-GAMES.md)

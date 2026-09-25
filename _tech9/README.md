# Tech9 · playable foundations

The active framework lives in `_tech9/` alongside the legacy root framework. Root replacement is a separate, later migration. Games own their source copies; framework changes do not silently upgrade them.

## Choose a workflow

- **Build a game:** give an agent your idea and [GENERATE.md](./GENERATE.md). It selects a real starter and builds a complete playable loop.
- **Build or bring back a capability:** give an agent [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md) and the capability or game source to work from. It lands reusable code, tests and one usage aid: an example **or** concise documentation.

Both flows follow [WORKFLOW.md](./WORKFLOW.md). They work from a fresh clone without historical run records. `/generate` registration is deferred; the manual agent kickoff supports both task modes now.

## What is available

A **scene** is runnable authored content. A **starter** is a registered scene bundle with honest limits. A **game** owns a copied starter. A **module** is reusable source incorporated into those copies.

- [Forest exploration](./scenes/scene-test/README.md): fixed 160 m forest, fly or grounded movement, placement-derived collisions and five graphics controls.
- [Pond exploration](./scenes/pond-test/README.md): grounded traversal, reflective water and coupled shore/terrain/vegetation.

These scenes are the usage examples for walking, collision and water modules; see the [capability index](./modules/README.md). They do not provide full physics, vehicles or finished game rules. `t9 catalog` lists current availability.

## Install and run

Use Node `^22.13.0 || >=24.0.0`. From the repository root:

```sh
./_tech9/run --runtime
./_tech9/run ci
./_tech9/run --prefix scenes/scene-test ci
./_tech9/run --prefix scenes/pond-test ci
./_tech9/run run dev:walk
# Or: ./_tech9/run run dev:pond
```

`run` selects a supported installed Node and anchors npm to the framework directory. `TECH9_NODE` can select an explicit executable. It never installs Node or changes hooks implicitly. Ordinary npm commands with supported Node also work. Each scene/game has its own dependencies and lockfile; root installation is not required.

Framework checks are `./_tech9/run test` and `./_tech9/run run lint`. Each scene supplies its own test/lint/build/browser commands. Use a free `SCENE_PORT` for browser checks.

## Source and local workspace

| Location                         | Purpose                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `catalog.json`, `framework.json` | Current versions and availability                                |
| `scenes/`, `modules/`            | Reusable source and runnable starter examples                    |
| `tools/`, `schemas/`, `tests/`   | Source-copy CLI, contracts and safety checks                     |
| `games/<game>/`                  | Independent game output                                          |
| `docs/`                          | Current operating guidance                                       |
| `runs/<task>/`                   | Ignored local plans, coordination and reviews; created on demand |

Commit source, tests and required licenses. `runs/` and `.artifacts/` stay local and are never force-added. Remove a completed task's run folder after handoff; do not turn it into tracked history elsewhere. Ignoring a folder does not hide it from an editor or delete local copies. A game's current README explains how to play it; Git provides development history.

The optional scoped hook is installed explicitly with `./_tech9/run run hooks:install`. It reports the prior Git hook setting and checks only staged `_tech9` files using the nearest package's lint configuration. Dependency installation does not change repository hooks. See [migration](./docs/MIGRATION.md) for hook details and the future root-migration contract.

See [architecture](./ARCHITECTURE.md), [capability copying](./docs/CAPABILITIES.md), [extension seams](./docs/EXTENDING.md), and [roadmap](./ROADMAP.md).

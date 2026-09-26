# Tech9

Tech9 provides tested source modules, runnable starters and tools for building games. The framework lives in `_tech9/`. Each generated game is a standalone package with its own source, assets, dependencies, tests and development lifecycle.

## Workflows

- [Game development](./GENERATE.md): select a starter, compose capabilities and build the player experience.
- [Framework development](./FRAMEWORK_DEV.md): develop reusable capabilities or extract them from a game.

[WORKFLOW.md](./WORKFLOW.md) covers planning, validation and handoff.

## Available foundations

- [Forest exploration](./scenes/scene-test/README.md): a fixed 160 m forest with fly or grounded movement, placement-derived collisions and graphics controls.
- [Pond exploration](./scenes/pond-test/README.md): grounded traversal, reflective water and shared shoreline, terrain and vegetation queries.
- [Modules](./modules/README.md): grounded walking, placement collisions, pond water, boat motion/input, follow/mounted cameras and island ocean.

The [catalog](./catalog.json) records versions, starter contents and limitations. Starters are copied into games; additional modules are integrated through their documented interfaces.

## Install and check

Use Node `^22.13.0 || >=24.0.0`. From the repository root:

```sh
./_tech9/run ci
./_tech9/run run check
./_tech9/run run t9 -- catalog
```

`run` selects an installed supported Node and runs npm from `_tech9`. `TECH9_NODE` selects an explicit executable; `./_tech9/run --runtime` reports the selection. Ordinary npm commands with supported Node also work.

| Command                                    | Purpose                                                    |
| ------------------------------------------ | ---------------------------------------------------------- |
| `./_tech9/run test`                        | Tooling and module tests                                   |
| `./_tech9/run run lint`                    | Source lint and formatting                                 |
| `./_tech9/run run build`                   | Compile registered modules into `.artifacts/module-build/` |
| `./_tech9/run run check`                   | Tests, lint, module builds and catalog validation          |
| `./_tech9/run run sync:modules -- --check` | Compare starter module copies with canonical source        |

Scenes and games provide their own install, development and validation commands in their package READMEs. The optional scoped Git hook is installed with `./_tech9/run run hooks:install`; see [local setup](./docs/MIGRATION.md#local-setup).

## Layout

| Location                         | Purpose                                         |
| -------------------------------- | ----------------------------------------------- |
| `catalog.json`, `framework.json` | Versions and availability                       |
| `modules/`                       | Canonical capabilities, tests and usage aids    |
| `scenes/`                        | Runnable starter examples                       |
| `tools/`, `schemas/`, `tests/`   | Source-copy CLI and development tooling         |
| `games/<game>/`                  | Standalone game packages                        |
| `docs/`                          | Operating guidance                              |
| `runs/<task>/`, `.artifacts/`    | Ignored local coordination and generated output |

See [architecture](./ARCHITECTURE.md), [capability copying](./docs/CAPABILITIES.md), [extension contracts](./docs/EXTENDING.md), and [roadmap](./ROADMAP.md).

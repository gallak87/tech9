# Tech9

Tested game modules and a runnable baseline. Games own their copied source, assets, dependencies and development lifecycle.

## Start

From `_tech9/`, use Node `^22.13.0 || >=24.0.0`:

```sh
./run ci
./run run check
./run run t9 -- modules
```

`run` selects an installed supported Node and runs npm from the framework directory. `TECH9_NODE` selects an executable; `./run --runtime` reports it. Ordinary npm commands also work with supported Node.

To explore the [baseline](./baseline/README.md):

```sh
./run --prefix baseline ci
./run --prefix baseline run dev
```

## Develop

- [Game development](./GENERATE.md): define the experience, copy the baseline and compose modules.
- [Framework development](./FRAMEWORK_DEV.md): build a module or extract reusable work from a game.
- [Module guide](./modules/README.md): interfaces, dependencies and integration examples.
- [Shared workflow](./WORKFLOW.md): planning, review and handoff.

## Layout

| Path                           | Contents                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| `modules.json`                 | Module IDs and versions; each ID names a folder in `modules/`   |
| `modules/<id>/`                | Source, tests, usage documentation and required assets/licenses |
| `baseline/`                    | Standalone starting application and staging environment         |
| `games/<slug>/`                | Independently owned game packages                               |
| `tools/`, `schemas/`, `tests/` | Framework tooling and checks                                    |
| `runs/`, `.artifacts/`         | Ignored task records and generated output                       |

`./run run check` runs framework tests, lint, module compilation and registry validation. `./run run sync:modules -- --write` refreshes the baseline's selected module copies; `--check` compares them. Package commands are documented in each package's README.

See [architecture](./ARCHITECTURE.md), [module copying](./docs/MODULES.md), [runtime contracts](./docs/EXTENDING.md) and [local setup](./docs/MIGRATION.md).

# Architecture

## Modules and baseline

`modules.json` records module IDs and versions. Source paths follow `modules/<id>/src`; each module includes tests and an integration guide. Assets and licenses travel with the source.

`baseline/` is a standalone Three.js application with its own package, lockfile, renderer, authored world and assets. Its package version identifies the starting application. `package.json` lists selected modules in `tech9.modules`; `sync:modules` copies them into `src/modules/<id>` and records source versions and hashes in `PROVENANCE.json`.

The baseline uses one renderer/frame loop, one camera controller and disposable layers. The world definition supplies terrain, bounds, views and presentation. See [runtime contracts](./docs/EXTENDING.md).

## Game copies

The CLI copies a clean, committed baseline into `games/<slug>`, preserving source, editable assets and licenses. It adapts package name/ports and writes two records:

- `tech9.json`: baseline package version, source commit and per-file hashes.
- `GAME_PLAN.json`: the execution plan used for the copy.

The generated `.prettierignore` preserves their bytes. Each game owns its files, package and subsequent changes. Additional modules are integrated as local source copies.

## Tools

Tool paths resolve from the framework directory. The CLI validates module IDs, plans, baseline version, path ownership and source provenance. Fork tests use small disposable fixtures.

Framework checks compile canonical module JavaScript with Three.js external. Three.js supplies real cameras, materials and geometry for module tests; Vite compiles source. Build output goes to `.artifacts/module-build/`. Game development uses source files.

Each package installs dependencies independently. The optional Git hook selects the nearest package's lint-staged configuration. See [setup and relocation](./docs/MIGRATION.md).

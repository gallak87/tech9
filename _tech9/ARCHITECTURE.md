# Architecture

## Source ownership

The framework supplies reusable source and starter bundles. Each scene and game is a standalone package with its own lockfile, runtime, assets, licenses and tests. A generated game owns its copied files and can be developed or distributed independently.

Canonical module source lives under `modules/<id>/src`, with tests under `modules/<id>/tests`. A module's usage aid describes its interface, dependencies, resource ownership and limits. Framework-dev maintains these capabilities and incorporates reusable work from games.

Each starter scene declares module IDs in `capabilities.json`. The sync tool copies canonical source into `src/capabilities/<id>/src` and records versions and hashes in `PROVENANCE.json`. Runtime imports resolve to those local copies. See [capability copying](./docs/CAPABILITIES.md).

## Catalog and forks

The catalog resolves starter → scene → manifest and lists optional modules. Starter records describe provided features, exclusions and availability.

The CLI forks a clean, committed starter into `_tech9/games/<slug>`. It copies source, assets and licenses; adapts the package name and ports; and creates two immutable records:

- `tech9.json`: starter/scene versions, source commit and per-file SHA-256 hashes.
- `GAME_PLAN.json`: the execution plan used for the fork.

The generated `.prettierignore` preserves those records' bytes. CLI validation checks catalog references, plans, path ownership, dependency cycles, destination safety and source provenance. Fork tests use disposable fixtures.

## Runtime composition

The forest and pond starters use one `SceneApp` for the renderer, camera, frame loop, lighting, settings and layer lifecycle. A scene definition supplies authored content, terrain, bounds, views and presentation. One controller owns camera movement; disposable layers own world and interaction resources. See [extension contracts](./docs/EXTENDING.md).

The scene definition is selected at boot. The environment renderer uses an outdoor sun/sky setup. Collision descriptors are conservative horizontal proxies. The catalog and scene READMEs describe each starter's limits.

## Development tools

Framework tools use ESM and resolve catalog/plan paths relative to the Git repository root. Workflow paths are relative to `_tech9`.

`check` runs tooling/module tests, lint, module compilation and catalog validation. Three.js supplies objects used by module tests; Vite compiles registered module JavaScript with Three.js external. Both are framework development dependencies. Compilation output is local verification output; game generation uses canonical source.

`sync:modules -- --check` compares starter copies with canonical source. `sync:modules -- --write` updates those copies and their metadata.

Each package installs its own dependencies. The optional scoped hook selects the nearest package's lint-staged configuration. Hook setup and repository relocation are described in [MIGRATION.md](./docs/MIGRATION.md).

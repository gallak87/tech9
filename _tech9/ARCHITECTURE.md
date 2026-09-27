# Architecture

## Source packages and modules

Authored applications live in `baselines/<name>/`: `web-3d-world` composes a Three.js forest; `web-2.5d-world` composes an Echo-derived coastal sprite world. Minimal dependency-owned applications live in `scaffolds/`: `web-canvas2d`, `web-pixi` and `web-three`. The explicit catalog in `tools/lib/starting-points.mjs` maps supported names to package paths, kind, runtime and renderer. A folder name identifies a source independently of game slug syntax.

Every runnable package owns its manifest/lockfile, launch/build commands, rendering loop, authored composition and `tech9` metadata. `tech9.runtime`, `tech9.renderer` and `tech9.modules` make compatibility explicit. Modules have no live dependency on a game or on the older root framework.

`modules.json` records canonical versions and requirements: renderer/runtime, concrete package dependencies and required sibling modules. Portable simulation modules may have no renderer requirement. Canonical source lives in `modules/<id>/src`, with tests, a usage guide, and any supporting assets, editable sources and license records.

## Owned module copies

`sync:modules -- --from <name>` selects a source package; `--package games/<slug>` explicitly targets an owned game. It validates dependencies, source/destination paths and unexpected files before writing. Selected source, README/notices and assets are copied to `src/modules/<id>/`; versions and hashes go in `src/modules/PROVENANCE.json`. See [copying](docs/MODULES.md). Existing games are never refreshed implicitly.

The Three.js application owns one renderer/frame loop and camera controller, with disposable layers and authored terrain/placement queries. The sprite application owns its coastal composition and HTML presentation while `sprite-world` owns bounded rendering surfaces, movement/control state and loaded artwork. Canvas2D composes logical sprite depth and PixiJS presents it. See each package's architecture for concrete interfaces.

## Generation and provenance

Schema-2 plans select a `startingPoint`; absent means the legacy `web-3d-world`. `baselineVersion` always refers to the selected source package, including minimal scaffolds. Validation checks scope, exclusive ownership, dependency cycles and selected version. Unsupported sources fail explicitly; web scaffolds do not imply native engine support.

Fork copies a clean, committed source into absent `games/<slug>`, adapts name/ports, and preserves its package boundaries and licenses. It writes immutable `tech9.json` (source identity, kind, runtime/renderer, version, commit and hashes) and `GAME_PLAN.json` (the execution plan). Generated formatting exclusions preserve receipt bytes. Existing fork receipts remain unchanged. A copy owns every file and evolves independently; there are no runtime source links.

New games live in `games/<slug>`; reference pilots stay in `games/_pilot/<slug>`. Disposable verification packages and output stay in ignored `.artifacts/`.

## Verification and tooling

Framework checks run unit/integration tests, lint/format, canonical module builds and registry validation. Module builds externalize declared runtime packages; the consuming package supplies those dependencies. Build output goes to `.artifacts/module-build/`.

Starting packages run their own tests/builds and browser checks. Generation tests cover source selection, receipts, synchronization, overwrite/path protection and compatibility. [Reference findings](docs/REFERENCE-GAMES.md) distinguish inspected game implementations from verified framework support. Each package installs independently. Optional hooks select the nearest package's lint-staged configuration; see [setup](docs/MIGRATION.md).

# Architecture

## Source ownership

The repository is a workshop, not a shared game engine package. Each starter is executable on its own; the CLI copies its tracked source into `_tech9/games/<slug>`. A fork receipt records the starter/scene versions, source commit and SHA-256 for every included file. Outputs carry their own package, lockfile, code, assets, Blender source, licenses and tests. They do not import framework runtime code.

This costs some duplicated source and assets. In exchange, experiments stay isolated, a game can leave this repository, and framework upgrades cannot break it silently. A later update command would need an explicit three-way merge against the recorded baseline; it is not implemented now.

The catalog is small descriptive data. It resolves starter → scene → manifest. An available entry means the source exists and its documented checks can run. `planned` describes a future recipe, never a working feature. Metadata is not an executable remote plugin system.

Source review captures are excluded from forks. The CLI removes the scene manifest's historical `qualityEvidence` and `qualityStatus` fields from the game copy and records the source review path/status in `tech9.json` under `source.qualityEvidence`, resolved at `source.commit`. A fork has no inherited art pass or game review. Receipt hashes always describe the original source before these metadata adaptations.

The CLI also preserves the starter's `.prettierignore` content and appends exclusions for `tech9.json` and `GAME_PLAN.json`, creating the ignore file when absent. These generated provenance artifacts retain their exact bytes through ordinary game formatting, so the receipt's plan hash remains valid. The receipt's source hashes still describe the starter's original ignore file, before this adaptation.

## Runtime seams

The forest runtime separates `SceneApp` (renderer, loop, environment), a scene definition (terrain, views, content factory, bounds, presentation), one replaceable camera controller, and disposable world/game layers. These are enough for the current proof game. See the [exact contract](./scenes/scene-test/ARCHITECTURE.md).

The renderer still assumes an outdoor sun/sky scene. Scene definitions are chosen at boot; live switching is future work. Collider descriptors are approximate circles, not a physics engine. A racing starter can choose a different controller, collision system and renderer without forcing this foundation to anticipate it.

## Tool boundary

`tools/tech9.mjs` validates local data and produces local source copies. Built-in Node APIs keep it easy to inspect. It never executes plan commands, calls a model, spends API credits, publishes, or assigns a model roster. The producer agent owns interpretation and execution through [GENERATE.md](./GENERATE.md) and [WORKFLOW.md](./WORKFLOW.md). The user-facing kickoff is agent-led; a future `/generate` adapter will call that same workflow. Command registration and repository-root migration remain deferred. Current CLI paths remain repository-relative; a future migration must update the path adapter and catalog as well as relocating files.

Schemas document serialized formats. Runtime validation additionally checks cross-references, lane ownership and dependency cycles, safe filesystem destinations, clean source and immutable fork provenance. Tests cover invalid inputs and transactional failure paths.

The framework package and tools live under `_tech9`; no root package changes are required. CLI metadata and plan paths are repository-relative, and new games go to `_tech9/games/<slug>`. The root remains CommonJS for old game tools; framework tools use `.mjs`. Games and scenes install independently rather than sharing a monorepo dependency graph.

The optional `_tech9` Husky hook is explicitly installed with `npm --prefix _tech9 run hooks:install`, never by `prepare`. It runs lint-staged from `_tech9` without forcing a working directory for child tasks: configuration discovery stays inside the foundation and each scene or game uses its nearest package's tooling. Root files and older games are excluded. Git has one hook path per repository, so installation reports the previous value and is an intentional local choice.

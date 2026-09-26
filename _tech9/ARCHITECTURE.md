# Architecture

## Source ownership

The repository is a workshop, not a shared game engine package. Each starter is executable on its own; the CLI copies its tracked source into `_tech9/games/<slug>`. A fork receipt records the starter/scene versions, source commit and SHA-256 for every included file. Outputs carry their own package, lockfile, code, assets, Blender source, licenses and tests. They do not import framework runtime code.

This costs some duplicated source and assets. In exchange, experiments stay isolated, a game can leave this repository, and framework upgrades cannot break it silently. A later update command would need an explicit three-way merge against the recorded baseline; it is not implemented now.

Independence goes both ways: framework modules, tests and builds do not import or execute consumer game source. `games/` is an output workspace, not a set of framework fixtures. Each consumer owns its iteration, tests and release cycle; promotion back into canonical modules is optional and scoped separately. Maintained scenes are framework starter examples, with their own integration checks.

Canonical promoted modules live under `modules/<id>/src`. Each framework scene declares its module IDs in `capabilities.json`; a maintainer snapshot copies source into its local `src/capabilities/<id>/src` and records versions/hashes. CI-style check mode rejects drift, and source forks inherit local copies rather than framework imports. The sync tool is restricted to framework scenes and never updates accepted games. See [capability integration](./docs/CAPABILITIES.md).

The catalog is small descriptive data. It resolves starter → scene → manifest. An available entry means the source exists and its documented checks can run. `planned` describes a future recipe, never a working feature. Metadata is not an executable remote plugin system.

Run plans, review reports and captures are ignored local coordination. Current starters do not depend on those files. The fork tool retains compatibility with older manifests carrying quality attribution; that metadata is not an inherited game review or a reason to commit new review archives.

The CLI also preserves the starter's `.prettierignore` content and appends exclusions for `tech9.json` and `GAME_PLAN.json`, creating the ignore file when absent. These generated provenance artifacts retain their exact bytes through ordinary game formatting, so the receipt's plan hash remains valid. The receipt's source hashes still describe the starter's original ignore file, before this adaptation.

## Runtime seams

The forest runtime separates `SceneApp` (renderer, loop, environment), a scene definition (terrain, views, content factory, bounds, presentation), one replaceable camera controller, and disposable world/game layers. These are enough for the current proof game. See the [exact contract](./scenes/scene-test/ARCHITECTURE.md).

The renderer still assumes an outdoor sun/sky scene. Scene definitions are chosen at boot; live switching is future work. Collider descriptors are approximate circles, not a physics engine. A racing starter can choose a different controller, collision system and renderer without forcing this foundation to anticipate it.

## Tool boundary

`tools/tech9.mjs` validates local data and produces local source copies. Built-in Node APIs keep it easy to inspect. It never executes plan commands, calls a model, spends API credits, publishes, or assigns a model roster. The agent owns interpretation and execution through [GENERATE.md](./GENERATE.md), [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md) and [WORKFLOW.md](./WORKFLOW.md). The two supported task modes are game-dev and framework-dev; they do not require CLI flags or run history. The user-facing kickoff is agent-led; a future `/generate` adapter will call that same workflow. Command registration and repository-root migration remain deferred. Current CLI paths remain repository-relative; a future migration must update the path adapter and catalog as well as relocating files.

Schemas document serialized formats. Runtime validation additionally checks cross-references, lane ownership and dependency cycles, safe filesystem destinations, clean source and immutable fork provenance. Tests cover invalid inputs and transactional failure paths.

The framework's `check` command runs tooling/module tests, lint, a canonical module build and catalog validation. Starter-copy comparison is an explicit maintenance operation (`sync:modules -- --check`), separate from lint. `build` compiles all registered module JavaScript with the framework's own pinned Vite dependency and externalizes Three.js. Its ignored output is a compilation check, not a shared engine distribution. Three.js is a development dependency for canonical module tests; games install their own runtime dependencies. CLI tests create synthetic disposable fixtures rather than using an existing game.

The framework package and tools live under `_tech9`; no root package changes are required. CLI metadata and plan paths are repository-relative, and new games go to `_tech9/games/<slug>`. The root remains CommonJS for old game tools; framework tools use `.mjs`. Games and scenes install independently rather than sharing a monorepo dependency graph.

The optional `_tech9` Husky hook is explicitly installed with `npm --prefix _tech9 run hooks:install`, never by `prepare`. It runs lint-staged from `_tech9` without forcing a working directory for child tasks: configuration discovery stays inside the foundation and each scene or game uses its nearest package's tooling. Root files and older games are excluded. Git has one hook path per repository, so installation reports the previous value and is an intentional local choice.

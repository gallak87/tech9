# 02 — Choose the game's starting point

Extend `_tech9` generation so a game can select a suitable starting package or scaffold a minimal standalone package when none fits. Preserve the owned-source model and straightforward out-of-the-box commands.

## Start

Prompts 01–03 can run concurrently from the same accepted commit, each in an isolated worktree. Read `_tech9/AGENTS.md`, `_tech9/WORKFLOW.md`, `_tech9/GENERATE.md`, `_tech9/ARCHITECTURE.md`, `HANDOFF-tech9-graduation.md`, and the available starting packages.

Inspect `tools/scaffold.js` for its Canvas2D, PixiJS, Three.js and Godot stack-selection approach. Use it as a reference for selecting appropriate tools; implement the smallest coherent solution in `_tech9`.

## Parallel ownership

Own generation, source-copy/synchronization tooling, plan and receipt schemas, related tests and shared framework usage docs. Prompt 01 owns canonical extraction, module build/dependency changes and `_tech9/baselines/sprite-world/`; prompt 03 owns reference findings and separately scoped authoring tools.

Use the current forest and small test fixtures to develop selection independently. Prompt 01's package will declare its dependencies, launch/build commands and selected modules. Discover named packages by their declared configuration. Final integration verifies the actual sprite-world package; this session can complete its tooling work before that package lands.

## Deliver

1. Make the starting package and runtime explicit generation choices. Provide working selection for the forest and additional named packages, plus a minimal web-package path for a game that needs its own foundation. Derive runtime dependencies from the selected package. The integrated result must expose prompt 01's sprite-world package.
2. Use one discoverable layout for available baselines, with forest and sprite-world as named starting points. Keep authored composition in the starting package and reusable capabilities in modules.
3. Adapt the CLI, plan validation, copying, module synchronization and provenance to the selected source. Preserve existing games and immutable fork receipts. Retain overwrite protection and clean-source provenance for package copies.
4. Update `GENERATE.md`, quickstart, architecture and copying instructions with concise examples. Keep runtime-specific choices visible; advertise only launch paths that are implemented and verified.

Each generated game owns its package, source, assets and dependencies. A baseline can use a particular renderer and art style. Modules declare their concrete dependencies. Keep native-engine support a deliberate package choice rather than an implied consequence of a runtime label.

## Verify and hand off

Use focused tooling fixtures to check source selection, module copies, provenance and package creation. Check generated dependency/configuration output and the accepted starting packages' relevant builds. Keep disposable verification output in ignored task artifacts.

Commit completed work in the worktree. Report available choices, exact creation commands, verification and limitations. Leave the branch ready for review and merge alongside prompts 01 and 03. Final integration checks the extracted package and resolves relevant reference findings. The new game in prompt 04 is the integrated gameplay gate.

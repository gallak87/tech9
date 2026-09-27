# 01 — Extract Echo's 2.5D foundation

Use framework-dev to bring reusable capabilities from `games/chronoforge-echo/` into `_tech9/`. The goal is a usable foundation for another 2D/2.5D game, with source, art, presets and integration.

## Start

Work in an isolated Git worktree from the current accepted branch. Reuse a suitable task worktree or create a managed one. Read `_tech9/AGENTS.md`, `_tech9/WORKFLOW.md`, `_tech9/FRAMEWORK_DEV.md`, `HANDOFF-tech9-graduation.md`, and Echo's `AGENTS.md`, `ARCHITECTURE.md` and `ART_DIRECTION.md`.

Echo uses PixiJS and Canvas. Its local instructions govern any work inside Echo, including permission to run its browser checks. Echo remains an independently maintained game with its own source and content.

## Parallel ownership

Prompts 01–03 can run concurrently from the same accepted commit. Own the new modules, their registry entries and guides, the sprite-world package, and necessary module build/dependency changes. Prompt 02 owns generation, shared workflow/usage docs, source-copy tooling and schemas. Prompt 03 supplies reference findings and separately scoped authoring tools.

Build the starting package at `_tech9/baselines/sprite-world/` with its own package, launch/build commands and `tech9.modules` selection. Copy the selected canonical modules according to the current copying guide. Prompt 02 adds synchronization and discovery for named baselines; final integration connects them.

## Deliver

1. Inspect the implementation and existing tests. Select cohesive extraction boundaries around sprite-world rendering and exploration, touch/viewport handling, and asset loading. Treat these as candidate capabilities, not a required module count.
2. Implement the selected canonical modules in `_tech9/modules/`. Parameterize authored content, dimensions, budgets and game callbacks. Include the selected reusable assets, editable sources, licenses, usable defaults and concise integration instructions.
3. Supply a compact runnable 2.5D starting package under `_tech9/baselines/sprite-world/`. Compose owned module copies into an authored example with movement, camera, scenery depth/occlusion and usable controls. Make it a useful game-development starting point. The full Echo campaign remains in Echo.
4. Register modules and update their usage guides and the starting package's documentation. Extend module build/dependency handling only where the extracted implementation requires it. Keep the existing forest package usable; prompt 02 owns generation and starting-point selection.

Prioritize exploration and presentation. Broader RPG systems such as ATB combat, campaign progression and save migrations need their own justified extraction scope. Keep closely related parts together unless independent reuse warrants a separate module.

## Verify and hand off

Run framework checks and the new starting package's relevant checks. Exercise its rendering, movement, touch/viewport behavior and asset lifetime through real input. Use the shared workflow's harsh independent visual critique for the authored starting package, preserving Echo's demonstrated presentation quality where assets are reused.

Commit completed work in the worktree. Report the modules, starting package, launch command, checks and concrete limitations. Leave the branch ready for review and merge alongside prompts 02 and 03. Integration verifies that generation discovers and copies this package before prompt 04 begins. Root cutover follows the graduation gate.

# Framework location and future root migration

The active framework lives under `_tech9`. Preserve legacy root planners, commands, helpers and games until root migration is separately authorized. New games use `_tech9/games`; existing root games stay where they are.

## Carry the workflows forward

The framework root is the directory containing README, GENERATE, FRAMEWORK_DEV and WORKFLOW. Agents resolve their workflow documents, scenes, modules, games and local workspace relative to that directory. When the framework eventually moves to repository root:

- Carry both first-class flows: game-dev and framework-dev. A consumer can bring a game capability back by following FRAMEWORK_DEV and reading the game source; historical run records are unnecessary.
- Carry `.gitignore` with its framework-relative `/runs/` and artifact exclusions. Do not copy local run records into tracked files, commit a placeholder run directory, or create a replacement history archive.
- Preserve the graduation rule: code, tests, required licenses and one usage aid, either an existing working example or concise documentation.
- Update CLI path adapters, catalog paths, hooks and command examples. The current tools deliberately use repository-relative `_tech9/...` paths; moving files alone does not complete migration.
- Verify both workflows from a fresh clone with no `runs/` directory. Run source-copy and module-sync checks, and prove relevant standalone consumers.

The future `/generate` adapter should route to these same flows and preserve user authority, local coordination and stop conditions. Registration is separate work; the manual agent entrypoints already support both flows.

## Current local setup

Framework, scene and game packages install independently with supported Node. Root remains CommonJS for legacy helpers; new tools use `.mjs`. Existing games retain their source and original copy metadata.

Git has one `core.hooksPath` per repository. `npm --prefix _tech9 run hooks:install` is the explicit command that installs the scoped hook and reports the prior setting. It checks staged `_tech9` files using each package's nearest lint-staged configuration. Dependency installation and starter forks do not alter hooks. Do not add a global lint-staged `--cwd`, which would break nested package configuration.

To reverse that local hook choice, restore the prior valid path with `git config core.hooksPath <previous-path>` or unset it for the default `.git/hooks`. Scene/game packages need their development tools available when committing changes in those packages. No publishing or root retirement is implied by these setup commands.

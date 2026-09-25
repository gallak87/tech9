# Additive foundation and forest migration

The new foundation lives under `_tech9` alongside the existing root Tech9 framework. The root README, planners, role vocabulary, stack templates, capabilities, slash commands and scaffold/validation tools retain their existing behavior. There is no retired-framework archive to maintain. Root replacement is much later, after user playtests and proof from another game, potentially built by a different agent. This effort stops at Alder Signal ready for the user's playtest.

The original forest moved from `games/scene-test` to `_tech9/scenes/scene-test`. Assets, Blender sources, licenses and all four art reviews were retained. Scene metadata and generic scene/controller seams were added without intentionally changing its art. The previous 6.2/10 review remains historical evidence; this migration does not claim an AAA pass.

Framework dependencies, scripts, formatting and lint configuration live in `_tech9/package.json` and adjacent files. Run `npm --prefix _tech9 ci` independently of the root package. CLI plan and catalog paths are repository-relative, so `npm --prefix _tech9 run t9 -- validate _tech9/runs/alder-signal/plan.json` works from the repository root. The CLI's intentional output convention is root `games/<slug>`; copied games own their packages, source, assets and checks.

Compatibility helpers stay in root `tools`, including `landscape-gen.js`, sprite/probe helpers, and Godot MCP setup/server commands. The root package remains CommonJS. Existing games have not been converted to the new contract automatically.

## Optional local hook

Git has a single `core.hooksPath` for this repository. The former forest hook path, `games/scene-test/.husky/_`, no longer points to the migrated scene. Inspect the local setting with `git config --get core.hooksPath`, then intentionally install the foundation's scoped hook when desired:

```sh
npm --prefix _tech9 run hooks:install
```

This is the only framework installation command that changes Git configuration. It reports the prior value, installs Husky at `_tech9/.husky/_`, and runs lint-staged from `_tech9` on commits. That keeps root and older-game files outside its scope while preserving nearest-package lint configurations within `_tech9`. Scene dependencies must be installed before committing scene changes. Do not add `--cwd` to lint-staged here: forcing one task directory would prevent nested scene configurations from running in their own package.

Dependency installation and source forks do not install hooks. Older games retain their own setup behavior and may replace the repository hook when their installation scripts run. Reinstall the scoped hook explicitly only when that is the intended local choice. To remove this choice, restore the previous valid path with `git config core.hooksPath <previous-path>`, or use `git config --unset core.hooksPath` for Git's default `.git/hooks`; do not restore the forest's obsolete path.

No publication, deployment, or root retirement is part of this migration.

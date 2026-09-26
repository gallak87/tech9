# Setup and framework location

The framework currently lives in `_tech9/`. Commands and plan paths resolve from the framework directory. Packages under `baseline/` and `games/` install their own dependencies.

## Local setup

Install the optional scoped Git hook from the framework directory:

```sh
./run run hooks:install
```

Git has one `core.hooksPath` per repository. Installation reports the previous setting and selects the framework's `.husky/_`. The hook uses the nearest package's lint-staged configuration. Install the affected package's development dependencies before committing.

Restore a prior hook with `git config core.hooksPath <path>`, or unset it to use `.git/hooks`.

## Root graduation

1. Account for existing root packages, commands and games.
2. Move the framework files, baseline and workflows to the root; reconcile directory conflicts.
3. Carry framework ignore rules and reinstall the scoped hook at its new location.
4. Update repository entry links and run framework checks.

Module paths, plan paths, game output and tool entrypoints are framework-relative.

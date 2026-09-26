# Framework location and setup

The framework root is `_tech9/`. Workflow paths are relative to that directory; CLI catalog and plan paths are relative to the Git repository root. Game output is `_tech9/games/<slug>`.

## Local setup

Framework, scene and game packages install independently. Framework tools use ESM; root helpers use CommonJS.

Install the optional scoped hook from the repository root:

```sh
./_tech9/run run hooks:install
```

Git has one `core.hooksPath` per repository. Installation reports the previous setting and selects `_tech9/.husky/_`. The hook checks staged `_tech9` files using the nearest package's lint-staged configuration. Install that package's development dependencies before committing its files. Dependency installation leaves hook configuration unchanged.

Restore a prior valid hook path with `git config core.hooksPath <path>`, or unset it to use `.git/hooks`.

## Root relocation checklist

When relocating the framework to the repository root:

1. Account for existing root commands, helpers, packages and games.
2. Move the framework source and both workflow entrypoints.
3. Update CLI path adapters, catalog/output paths, hooks and command examples.
4. Carry framework-relative `/runs/` and artifact ignore rules.
5. Run framework checks, module-copy checks and standalone fork validation from a clean checkout.

Root relocation is a separate task from capability development.

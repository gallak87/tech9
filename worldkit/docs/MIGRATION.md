# Setup and framework location

The framework lives in `_tech9/`. Commands and plan paths resolve from the framework directory. Starting packages, games and reference pilots each install their own dependencies.

## Local setup

Install the optional scoped Git hook from the framework directory:

```sh
./run run hooks:install
```

Git has one `core.hooksPath` per repository. Installation reports the previous setting and selects the framework's `.husky/_`. The hook uses the nearest package's lint-staged configuration. Install the affected package's development dependencies before committing.

Restore a prior hook with `git config core.hooksPath <path>`, or unset it to use `.git/hooks`.

## GitHub Pages

From the framework directory, list committed browser games or build the site:

```sh
./run exec -- node tools/pages.mjs --list
./run exec -- node tools/pages.mjs
```

Discovery reads Git's tracked paths. Package games use their build scripts; static games retain their browser entry. Godot projects are excluded. Generated output lives in the repository's ignored `_site/`.

Games use `/<slug>/` and pilots use `/_pilot/<slug>/`. Vulpine also remains the front door when present; `games.html` lists every included game. The workflow supports the nested framework and its promotion to root. Archived games are excluded by default; the repository variable `INCLUDE_ARCHIVE_GAMES=true` includes `_archive/games/` at `/_archive/<slug>/`.

## Root graduation

Module paths, plan paths, game output and tool entrypoints are framework-relative. The [graduation plan](../../HANDOFF-tech9-graduation.md) defines the archive, promotion and deployment cutover.

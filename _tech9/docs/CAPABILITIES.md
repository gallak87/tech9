# Capability source copies

Canonical source lives under `modules/<id>/src`. The [capability index](../modules/README.md) links each module's usage aid, dependencies and limits.

Starter scenes contain local copies under `src/capabilities/<id>/src`, with versions and SHA-256 records in `src/capabilities/PROVENANCE.json`. A starter fork copies the complete scene into a standalone game package. Additional modules are copied and integrated explicitly, preserving sibling paths and required licenses.

## Maintain starter copies

Each scene's `capabilities.json` lists its modules. Edit and format canonical source, update module versions and scene manifests as appropriate, then run from `_tech9`:

```sh
./run run sync:modules -- --write
./run run sync:modules -- --check
./run run check
```

Sync targets registered framework scenes. Check mode compares source, versions and hashes. Unexpected files and symlinks require inspection before syncing. Preserve relative module layout and license notices.

Run affected scene checks for integration changes. Verify a fresh source fork before marking a starter available. [FRAMEWORK_DEV.md](../FRAMEWORK_DEV.md) describes capability development and review.

## Runtime

Use Node `^22.13.0 || >=24.0.0`. `./run --runtime` reports the installed executable selected by the launcher. `TECH9_NODE` provides an explicit override. The shell launcher supports macOS/Linux; ordinary supported Node/npm is the portable interface.

Scene packages document their own ports and browser commands. `SCENE_PORT` selects an isolated verification port; `SCENE_URL` selects an existing server. Native capture/focus checks require an unlocked desktop.

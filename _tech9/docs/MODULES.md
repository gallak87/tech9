# Module source copies

[modules.json](../modules.json) maps IDs to `modules/<id>/`. The [module guide](../modules/README.md) links each interface and its dependencies.

Copy a module's `src/`, README, licenses and optional `assets/` into the consuming package's `src/modules/<id>/`. Preserve sibling directories for module dependencies. Install runtime dependencies in the consuming package. Integration examples assume imports from `src/main.js`.

## Baseline composition

`baseline/package.json` lists module IDs in `tech9.modules`. From the framework directory:

```sh
./run run sync:modules -- --write
./run run sync:modules -- --check
```

The sync tool copies selected modules into `baseline/src/modules/` and records versions and file hashes in `PROVENANCE.json`. It checks unexpected destination files before writing. Format canonical source before syncing.

A game copy inherits the baseline's local files. Further module adoption is explicit: copy the required module folders and wire their documented interfaces in the game.

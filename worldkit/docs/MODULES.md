# Module source copies

[modules.json](../modules.json) maps IDs to `modules/<id>/`, versions and concrete requirements. The [module guide](../modules/README.md) documents integration and resource ownership.

A consuming package owns copies of each selected module's `src/`, README/notices and `assets/`, including editable sources and licenses. Preserve sibling layout for module-to-module imports. Install runtime dependencies in the package itself; framework tooling dependencies do not satisfy an independently deployed game's manifest.

## Select and synchronize

Declare `tech9.runtime`, `tech9.renderer` and a unique `tech9.modules` list in the owning `package.json`. The registry checks required runtime/renderer, pinned dependencies and sibling modules. An empty selection is valid for minimal scaffolds.

From `_tech9/`:

```sh
./run run sync:modules -- --from web-3d-world --check
./run run sync:modules -- --from web-2.5d-world --write
./run run sync:modules -- --from web-2.5d-world --check
```

Without `--from`, sync retains the legacy `web-3d-world` default. For an explicit game adoption:

```sh
./run run sync:modules -- --package games/<slug> --write
./run run sync:modules -- --package games/<slug> --check
```

Use one selector. Format canonical module source before syncing. The tool validates all paths and unexpected destination files before writes; it will not silently delete local additions. Review local game edits before replacing a selected copy. Unsupported requirements fail rather than installing dependencies or changing the manifest implicitly.

Copies live under the selected package's `src/modules/<id>/`. `src/modules/PROVENANCE.json` records source versions and file hashes. A fork inherits the selected package's copies; later synchronization is explicit and never rewrites immutable `tech9.json` or `GAME_PLAN.json` receipts.

For manual integration, copy the same folders and records, install declared dependencies, and wire the module's documented interface. Source copying supplies a capability, not automatic game-specific composition.

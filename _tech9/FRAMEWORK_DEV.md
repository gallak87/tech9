# Develop a module

Use **framework-dev** to create or improve reusable capabilities, including extraction from a game. Include the supporting assets, presets and integration needed to use the feature in another game. Keep related implementation parts in one module unless independent reuse justifies a split. Follow [WORKFLOW.md](./WORKFLOW.md).

1. Read the relevant implementation and tests. Define the reusable behavior, configuration, dependencies, resource ownership and acceptance criteria.
2. Put source in `modules/<id>/src`, tests in `tests/`, and required assets in `assets/`. Preserve licenses and editable source assets.
3. Document integration, dependencies, lifecycle and concrete constraints in a concise README. Include or link a working example where it clarifies usage. Link the module from the [module guide](./modules/README.md).
4. Record the module ID and version in [modules.json](./modules.json). The ID matches its folder name.
5. Run `./run run check`. Use rendering or real-input checks when required by the change. Review stable source and resolve actionable findings.

When changing modules selected by the baseline, format canonical source and refresh the local copies:

```sh
./run run sync:modules -- --write
```

The baseline selects modules through `package.json` → `tech9.modules`. See [module copying](./docs/MODULES.md).

Keep usage documentation current; record task progress and review evidence in the shared workflow's local artifacts.

# Develop a module

Use **framework-dev** to create or improve reusable code, including extraction from a game. Follow [WORKFLOW.md](./WORKFLOW.md).

1. Read the relevant implementation and tests. Define the reusable behavior, configuration, dependencies, resource ownership and acceptance criteria.
2. Put source in `modules/<id>/src`, tests in `tests/`, and required assets in `assets/`. Preserve licenses and editable source assets.
3. Write a concise module README with a working integration example, dependencies, lifecycle and concrete constraints. Link it from the [module guide](./modules/README.md).
4. Record the module ID and version in [modules.json](./modules.json). The ID matches its folder name.
5. Run `./run run check`. Use rendering or real-input checks when required by the change. Review stable source and resolve actionable findings.

When changing modules selected by the baseline, format canonical source and refresh the local copies:

```sh
./run run sync:modules -- --write
```

The baseline selects modules through `package.json` → `tech9.modules`. See [module copying](./docs/MODULES.md).

Deliver source, tests, usage documentation, required assets/licenses and current version metadata. Report validation and material limits in the task.

# Develop a framework capability

Use **framework-dev** to create or improve reusable capabilities, including extracting useful code from a game. Follow [WORKFLOW.md](./WORKFLOW.md). Paths in this document are relative to `_tech9/`.

## Scope

Read the catalog and relevant source/tests. For an extraction, inspect the game's implementation and identify the reusable behavior, configuration, dependencies, resource ownership and limits. Define acceptance and validation for the capability.

## Implement

Put runtime source in `modules/<id>/src` and tests in `modules/<id>/tests`, or update the relevant scene/tool. Keep the interface concrete and preserve licenses and editable asset sources.

Choose one usage aid:

- An existing runnable example, linked from the [capability index](./modules/README.md).
- Concise module documentation describing integration and current limits.

Walking, placement collisions and pond water use the forest/pond scenes as examples. Boat motion, follow camera and island ocean use module documentation.

Register the module and version in the catalog. When updating a scene's module composition, update its `capabilities.json`, format canonical source, then run:

```sh
./run run sync:modules -- --write
./run run sync:modules -- --check
```

See [capability copying](./docs/CAPABILITIES.md) for layout and metadata details.

## Validate and review

Run `./run run check`. Cover behavior, configuration and resource lifecycle in module tests. Use a focused browser fixture or maintained scene for rendering and input behavior when relevant. Verify a standalone source fork before marking a new starter available.

Commit a stable implementation and obtain an independent engineering review when warranted. Fix actionable findings and rerun affected checks.

## Deliver

Provide source, tests, required licenses, the usage aid and current catalog/copy metadata. Report availability, integration instructions, checks and limitations. Follow the shared workflow for local artifacts and handoff.

# Roadmap

## Current workflows

- **game-dev:** [GENERATE.md](./GENERATE.md) takes a game idea through starter selection, implementation, real-input validation and bounded critique.
- **framework-dev:** [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md) creates shared capabilities or brings them back from games. It is a supported manual agent flow, with no historian archive required.
- Walking/input, placement collisions, supported Node startup, pond water, island ocean, configurable boat motion/input and follow/mounted cameras are available. Current versions live in the catalog; the [capability index](./modules/README.md) links each usage aid. Vehicles and ocean are optional modules, not yet a registered starter.

## Next capabilities

- Improve graphics efficiency from measurements: CPU/GPU split, pacing, overdraw, LOD/culling, shadows and adaptive resolution. Keep comparable visual quality; see the [scene roadmap](./scenes/scene-test/ROADMAP.md).
- Prove an alternate season/layout and add other starter flavors when a real game needs them.
- Explicit source upgrade/diff tooling; no silent migrations of existing games.
- Broader hardware, accessibility and mobile controls when a chosen game warrants them.
- Streaming worlds, more exact physics, destruction, multiplayer and publishing only within an authorized task.

## Future root and command integration

Root migration remains a separately scoped decision. Move the workflow entrypoints and framework-relative `/runs/` ignore rule with the source; never commit a local run archive during migration. Update CLI path adapters and catalog paths then. Preserve legacy root entrypoints until that work is authorized.

Register a thin `/generate` adapter that routes the user's task to game-dev or framework-dev, retaining authority and stop conditions. The manual workflows already exist; command registration and CLI mode flags are not implemented. A fresh consumer should need the current source and workflow, not someone else's coordination history.

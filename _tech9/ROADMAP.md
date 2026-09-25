# Roadmap

## Foundation being proven

- Migrated Alder Vale scene with explicit scene/controller/layer seams.
- Catalog, plan validation, safe source fork and provenance receipts.
- Agent-led producer/build/QA/critic workflow and independent game outputs.
- Complete a small playable Alder Signal and hand it to the user for playtesting. Its run directory records actual progress and review status; a plan or source fork alone is not completion. This effort stops at that playtest handoff, without an autonomous four-round polish marathon.

## Next decisions

- Hunting and fishing consumer trials are complete, merged and user-playtested. Walking/input, placement collisions, supported-Node startup and pond water are promoted and verified; see the [bounded framework handoff](./runs/capability-promotion/EXECUTION.md).
- The [Tidebreak boat pilot](./games/tidebreak/BRIEF.md) has a brief and kickoff prompt for a fresh agent/worktree. Ocean/island inversion, boat controls and chase camera remain new game work; none is advertised as an existing framework capability.
- Improve graphics efficiency with measurements: CPU/GPU split, frame pacing, vegetation overdraw, LOD/culling, shadow and atmosphere budgets, adaptive resolution and quality defaults. Preserve image quality using fixed-camera comparisons. Detailed acceptance remains in the [scene roadmap](./scenes/scene-test/ROADMAP.md).
- Prove one alternate season or scene layout; record the concrete authoring steps. Add live switching only with explicit loading/disposal and state-reset behavior.

## Planned agent modes and learning handoff

Let the user choose the overall task at kickoff, including the future `/generate` entrypoint. Record that choice in the execution plan so scope, path ownership, validation and completion criteria follow the purpose of the work. These modes are planned, not implemented command options.

- **`game-dev`**: consume the framework to build a playable game. Keep new systems in the owned game, prioritize its player experience, and record framework friction, workarounds and potential reusable capabilities as they emerge.
- **`framework-dev`**: intentionally build or improve framework capabilities, such as scenes, starters, assets, modules, tools or workflows. Define the reusable contract and its limits, prove it through a runnable consumer example, and update tests, documentation, provenance and versioning as appropriate.

After a game is complete, a **historian/review role** examines its run records, implementation and playtest evidence. Capture what worked, what failed, useful tools and techniques, and candidate assets or systems to bring back. Each candidate should identify its source, licenses, demonstrated uses, dependencies, limitations and validation needs. Feed lessons back into framework documentation and hand capability proposals to a scoped `framework-dev` task; promotion should preserve the evidence and follow the existing reuse policy rather than automatically copying every game feature into the framework.

The learning handoff follows the game delivery instead of turning game development into an open-ended framework rewrite. Mode selection defines the task's purpose, not a mandatory agent roster; existing games retain ownership of their copied source when improvements return to the framework.

## After evidence exists

- Prove another game, potentially with a different agent, and learn from user playtests before considering root graduation. Root replacement is much later and requires a separately scoped decision. Preserve existing root entrypoints, metadata and compatibility tooling throughout this effort.
- Register a thin `/generate` adapter over the existing manual [kickoff](./GENERATE.md): idea → director brief → valid authorized plan → source fork → bounded builders → real-input QA → independent critic → playable handoff. It should call the existing CLI, retain approval context and stop conditions, and report failures honestly.
- Promote further interaction/HUD systems when real consumers reveal stable interfaces; prefer two uses and honor explicit earlier promotion with narrower evidence.
- Add platformer, overhead and racing starter flavors one working game at a time.
- Explicit starter upgrade/diff tooling against recorded source hashes; no silent game migrations.
- Asset compression/packaging, broader hardware and accessibility coverage, mobile controls where a chosen game warrants them.
- Streaming/generated worlds, more exact physics, destruction, multiplayer and publishing only when requested by a game.

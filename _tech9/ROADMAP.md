# Roadmap

## Foundation being proven

- Migrated Alder Vale scene with explicit scene/controller/layer seams.
- Catalog, plan validation, safe source fork and provenance receipts.
- Agent-led producer/build/QA/critic workflow and independent game outputs.
- Complete a small playable Alder Signal and hand it to the user for playtesting. Its run directory records actual progress and review status; a plan or source fork alone is not completion. This effort stops at that playtest handoff, without an autonomous four-round polish marathon.

## Next decisions

- Run the hunting and fishing launch packets under `_tech9/games` in separate worktrees, using [GENERATE.md](./GENERATE.md). Each should prove one complete interaction, a managed goal and bounded independent AAA art critique. Record consumer friction before promoting shared systems.
- Improve graphics efficiency with measurements: CPU/GPU split, frame pacing, vegetation overdraw, LOD/culling, shadow and atmosphere budgets, adaptive resolution and quality defaults. Preserve image quality using fixed-camera comparisons. Detailed acceptance remains in the [scene roadmap](./scenes/scene-test/ROADMAP.md).
- Prove one alternate season or scene layout; record the concrete authoring steps. Add live switching only with explicit loading/disposal and state-reset behavior.

## After evidence exists

- Prove another game, potentially with a different agent, and learn from user playtests before considering root graduation. Root replacement is much later and requires a separately scoped decision. Preserve existing root entrypoints, metadata and compatibility tooling throughout this effort.
- Register a thin `/generate` adapter over the existing manual [kickoff](./GENERATE.md): idea → director brief → valid authorized plan → source fork → bounded builders → real-input QA → independent critic → playable handoff. It should call the existing CLI, retain approval context and stop conditions, and report failures honestly.
- Promote walking/interactions/HUD systems only after reuse in a second game; define stable interfaces from real differences.
- Add platformer, overhead and racing starter flavors one working game at a time.
- Explicit starter upgrade/diff tooling against recorded source hashes; no silent game migrations.
- Asset compression/packaging, broader hardware and accessibility coverage, mobile controls where a chosen game warrants them.
- Streaming/generated worlds, more exact physics, destruction, multiplayer and publishing only when requested by a game.

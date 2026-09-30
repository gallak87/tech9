# VECTOR//NOVA

Standalone Three.js/Vite game. Work inside this app; do not import repository frameworks or modify reference games.

## Read only what the task needs

Start with this file and [current status](docs/STATUS.json).

- Runtime/geometry changes: relevant sections of [ARCHITECTURE.md](ARCHITECTURE.md).
- Visual work: [art direction](docs/ART_BIBLE.md).
- Planning: [ROADMAP.md](ROADMAP.md).
- Assigned level/integration work: that task's current handoff only. Do not preload all level briefs, status files or old transcripts.

## Working rules

- Preserve approved levels, shared controls and 0.3 steering assistance unless the user requests a change.
- Use isolated worktrees for parallel implementation, exclusive file ownership and one integrator for shared code. Preserve other agents' edits and servers.
- The Nacre merge and seven-map launch remain separate pending steps; follow their current handoffs. Finished critic loops stay closed.
- Run checks appropriate to the change: targeted tests, lint/build for code; formatting and links for docs. Existing ESLint/Prettier/Husky package scripts own tooling.
- Browsers stay hidden/headless. No unsolicited videos or normal-speed automated full laps. Coordinate GPU use and servers with their owner; report only actually verified results.
- Commit when requested. Human approval cannot be supplied by an agent.

## Keep documentation small

STATUS.json is a current snapshot, not an event log. Put lasting technical decisions in architecture/source docs, visual direction in the art bible, and future work in the roadmap. Handoffs hold only active execution context. After merge, remove completed handoffs/review histories; Git retains them. Keep asset provenance and licences. Raw captures/reports belong in ignored .experiments/. Do not create separate status, implementation, performance and integration reports that repeat each other.

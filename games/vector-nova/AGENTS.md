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
- Follow the assigned handoff; finished critic loops stay closed.
- Run targeted tests and a production build when appropriate; check documentation links. Let the pre-commit hook run ESLint/Prettier through lint-staged. Do not repeat manual lint/format passes for routine edits. Ensure generated Husky hooks exist in a new worktree via the existing package prepare script.
- Use Node/npm from the user's configured shell or version manager. Check the project's Node requirement once; do not prepend a machine-specific runtime path to every command. Report a version mismatch rather than silently pinning another runtime.
- Browsers stay hidden/headless. No unsolicited videos or normal-speed automated full laps. Coordinate GPU use and servers with their owner; report only actually verified results.
- Commit when requested. Human approval cannot be supplied by an agent.

## Keep documentation small

STATUS.json is a current snapshot, not an event log. Put lasting technical decisions in architecture/source docs, visual direction in the art bible, and future work in the roadmap. Handoffs hold only active execution context. After merge, remove completed handoffs/review histories; Git retains them. Keep asset provenance and licences. Raw captures/reports belong in ignored .experiments/. Do not create separate status, implementation, performance and integration reports that repeat each other.

Keep handoffs stable: describe the assigned work, not temporary cross-task holds or progress. Store shared readiness once in the coordination ledger and link to it; do not copy it into each handoff.

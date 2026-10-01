# VECTOR//NOVA

Standalone Three.js/Vite game. Work inside this app; do not import repository frameworks or modify reference games.

## Read only what the task needs

Start with this file and the assigned task's brief.

- Runtime/geometry changes: relevant sections of [ARCHITECTURE.md](ARCHITECTURE.md).
- Visual work: [art direction](docs/ART_BIBLE.md).
- Planning: [ROADMAP.md](ROADMAP.md).
- Assigned level expansion: your level brief, [common execution rules](docs/EXPANSION_HANDOFF.md), [level API](docs/EXPANSION_LEVEL_CONTRACT.md) and [Vesper learnings](docs/expansion/vesper/learnings.md). Read the current primary-worktree docs on resume; do not preload other level briefs or old transcripts.

## Working rules

- Preserve approved levels, shared controls and 0.3 steering assistance unless the user requests a change.
- The user starts level agents sequentially. Resume your assigned checkout, incorporate current primary code, and own the level through commit, merge into the primary worktree and verification there. Implement necessary shared framework/environment/tooling improvements yourself and document reusable lessons. Preserve unrelated edits and servers.
- Follow the assigned handoff; finished critic loops stay closed.
- Finish desktop art and critique before the final mobile pass. Do not repeat mobile checks after every critic round.
- Chat startup/sequencing belongs to the user. Do not message other level chats or introduce integrators, GPU grants/queues, coordination ledgers or automations.
- Run targeted tests and a production build when appropriate; check documentation links. Let the pre-commit hook run ESLint/Prettier through lint-staged. Do not repeat manual lint/format passes for routine edits. Ensure generated Husky hooks exist in a new worktree via the existing package prepare script.
- Use Node/npm from the user's configured shell or version manager. Check the project's Node requirement once; do not prepend a machine-specific runtime path to every command. Report a version mismatch rather than silently pinning another runtime.
- Browsers stay hidden/headless. No unsolicited videos or normal-speed automated full laps. Start your own server on a free port and run browser/render batches sequentially, closing owned processes afterward. Report only actually verified results.
- Commit when requested. Human approval cannot be supplied by an agent.

## Keep documentation small

Do not create or maintain STATUS.json or launch/coordination ledgers. Keep progress and critic results in the chat. Put lasting technical decisions in architecture/source/tool docs, visual direction in the art bible, future work in the roadmap and concise reusable lessons in the level's learnings. Keep measured future-support coordinates as a short Markdown product note. After merge, remove completed execution handoffs; Git retains history. Keep asset provenance and licences. Raw captures/reports belong in ignored .experiments/. Do not create duplicate status, implementation, performance or integration reports.

Keep handoffs stable: describe the assigned work and acceptance criteria. Each level agent owns completion; no cross-task holds, readiness tracking or package handoff to another agent.

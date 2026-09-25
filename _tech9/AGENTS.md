# Working in the new Tech9 foundation

These instructions apply inside `_tech9`. This foundation is developed alongside the existing root framework. Read [README.md](./README.md) and [WORKFLOW.md](./WORKFLOW.md), then the target scene/game's README, architecture and local instructions. Root replacement and retirement of its planners, tools and commands are a later migration; preserve them during foundation work.

Choose `game-dev` to build a game through [GENERATE.md](./GENERATE.md), or `framework-dev` to add/improve shared capabilities through [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md). These are supported agent workflows; they do not require CLI mode flags or a prior run archive.

- Deliver a complete playable loop before adding depth. Wire every new system into the running game and verify real input.
- Choose a registered starter honestly. Do not advertise planned systems as available. Games own copied source; no runtime imports back into `_tech9`.
- Separate authored content, renderer ownership, controllers and game rules at concrete seams. Avoid broad abstractions before a second real use.
- Assign bounded agents only when the task authorizes delegation. Use one owner per edited path. Serialize browser/GPU captures against frozen source; a separate critic reviews the committed checkpoint.
- A plan records scope, acceptance, path ownership, validation, authority and stop conditions. Honor authority the user already delegated; a planning gate is not an automatic request for another confirmation.
- Commit deliverable source checkpoints. Keep plans, assignments, reviews, screenshots and handoff notes in ignored `runs/<task>/` or `.artifacts/`; never force-add them or create a tracked replacement archive. Report a failed art gate honestly after its round limit. Visual score and behavioral correctness are separate.
- A graduated capability retains code, tests, required licenses and exactly one usage aid: a working example OR concise documentation. Prefer an existing example when it already shows the integration. Keep current limits where consumers use the capability; omit origin-game narratives, evaluation history and promotion reports. Git holds history.
- Run relevant unit/lint/build and browser checks. Use real input for gameplay. Record browser, GPU, viewport, preset and frame timing for performance claims. Test hooks exist only behind `?test=1`.
- Preserve asset sources and license records. Install supported Node dependencies in the owning package. Dependency installation must not change repository hooks. The optional scoped hook is installed explicitly; preserve each scene/game's lint configuration and older games' tooling.
- Do not publish, push, or start the next game unless requested. Stop only processes this task started.

From the repository root, use `npm --prefix _tech9 run t9 -- --help`, `npm --prefix _tech9 test`, `npm --prefix _tech9 run lint`, and `npm --prefix _tech9 run dev:scene`. Scenes and games install separately. Framework tools are ESM; the root keeps its existing CommonJS helpers.

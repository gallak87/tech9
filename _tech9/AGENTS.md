# Working in Tech9

Read [README.md](./README.md) and the relevant workflow: [GENERATE.md](./GENERATE.md) for a game, [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md) for reusable modules. Read the target package's README, architecture and local instructions before editing.

The framework root is `_tech9/`. Games are standalone source copies with their own packages. `modules.json` lists reusable modules; `baseline/` provides the starting application.

- Define scope, acceptance, ownership, validation, authority and the stopping point in the task plan.
- Build a complete playable loop before adding depth. Verify player actions with real input.
- Keep authored content, renderer ownership, controllers and rules at concrete interfaces.
- Use bounded agents when authorized, with one owner per edited path. Commit stable checkpoints before independent review; serialize browser/GPU captures.
- Keep source, tests, editable assets and required licenses in Git. Keep task coordination and captures in ignored `runs/<task>/` or `.artifacts/`; remove completed run folders after handoff.
- Each module has code, tests, required licenses and one usage aid: a working example or concise documentation.
- Run checks appropriate to the changed package. Record browser, GPU, viewport, preset and frame timing for performance measurements. Test hooks use `?test=1`.
- Install dependencies in the owning package. Hook setup is explicit through `hooks:install`.
- Stay within the authorized task scope and stop only task-owned processes.

From the repository root, `./_tech9/run run check` runs framework tests, lint, module builds and module validation. [WORKFLOW.md](./WORKFLOW.md) defines shared execution and review practices.

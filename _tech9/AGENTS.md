# Working in Tech9

Read [README.md](./README.md), [WORKFLOW.md](./WORKFLOW.md) and the relevant role guide: [GENERATE.md](./GENERATE.md) for a game or [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md) for reusable capabilities. Read the target package's README, architecture and local instructions before editing.

The framework root is `_tech9/`. Games are standalone source copies with their own packages. `modules.json` lists reusable modules; `baseline/` provides the starting application.

- Canonical modules live in `modules/<id>/`; the baseline selects owned copies through `package.json` → `tech9.modules`.
- New games go in `games/<slug>/`; completed reference pilots live in `games/_pilot/<slug>/`.
- Install dependencies in the owning package. Hook setup is explicit through `hooks:install`.

From the repository root, `./_tech9/run run check` runs framework tests, lint, module builds and registry validation. Baseline and game commands run in their own packages.

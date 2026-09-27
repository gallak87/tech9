# Working in Tech9

Read [README.md](./README.md), [WORKFLOW.md](./WORKFLOW.md) and the relevant role guide: [GENERATE.md](./GENERATE.md) for a game or [FRAMEWORK_DEV.md](./FRAMEWORK_DEV.md) for reusable capabilities. Read the target package's README, architecture and local instructions before editing.

The framework root is `_tech9/`. Games are standalone source copies with their own packages. `modules.json` lists reusable modules; `baselines/<name>/` holds starting applications. `web-3d-world` and `web-2.5d-world` are runnable; `scaffolds/` contains minimal Canvas2D, PixiJS and Three.js packages.

- Canonical modules live in `modules/<id>/`; each package selects owned copies through `package.json` → `tech9.modules`.
- New games go in `games/<slug>/`; completed reference pilots live in `games/_pilot/<slug>/`.
- Install dependencies in the owning package. Hook setup is explicit through `hooks:install`.
- For new game builds, propose bounded subagent fanout and a separate **harsh AAA art critic** through `GENERATE.md`. After approval, delegate independent work to available subagents with exclusive paths and one integrator; keep existing games' approved scope and review targets intact.

From the repository root, `./_tech9/run run check` runs framework tests, lint, module builds and registry validation. Baseline and game commands run in their own packages.

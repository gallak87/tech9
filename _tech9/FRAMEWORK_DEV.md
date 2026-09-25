# Build or bring back a framework capability

Use **framework-dev** when the user wants a new shared capability, a framework fix, or reusable game code brought back into the framework. This is a supported agent workflow, alongside game-dev. No historian role, prior run record or special CLI mode is required.

A consumer can start a fresh agent with: “Read FRAMEWORK_DEV.md and bring the boat controller from games/my-game into the framework.” Resolve these paths from the active framework directory, currently `_tech9/`. The same entrypoint and rules carry forward when the framework later moves to the repository root.

## 1. Scope the capability

Read README, WORKFLOW, the catalog, and the relevant source/tests. Inspect the working game directly when promoting from one. Identify the reusable behavior, configuration, dependencies, ownership/cleanup and meaningful limits; leave game rules, assets and UI behind unless they are part of the requested capability.

Write a short plan in ignored `runs/<task>/` if coordination needs one: scope, acceptance, owned paths, validation, authority and stop condition. Use authority already delegated by the user. Comparing consumers can reveal a better interface, but a second game and a historical report are not prerequisites to an explicitly requested promotion.

## 2. Land the implementation

Put reusable runtime source in `modules/<id>/src`, or update the appropriate existing scene/tool when that is the actual shared capability. Keep a small concrete interface; avoid a general system built around hypothetical future games. Preserve required third-party license notices and editable asset sources.

Choose **exactly one usage aid** for the capability:

- A working example, preferably an existing scene integration. Link to its entry point from the capability index; omit a separate module usage manual.
- Concise usage documentation when an example would add unnecessary maintenance. Omit a dedicated example project. Tests and validation still need to prove that the implementation works.

The current walking, placement-collision and pond-water modules use the forest/pond scenes as their examples. Keep current limits with that example. Do not retain originating-game names, extraction accounts, review scores, agent rosters or source-checkpoint narratives as capability documentation.

Register the capability/version honestly in the catalog. For module copies, update the target scene's `capabilities.json`, format canonical source, then run `./run run sync:modules -- --write`. The sync command targets registered framework scenes only. Existing games retain their owned copies; any game upgrade needs its own scope. Source-copy version/hash metadata is used to check current copies, not to store a promotion diary.

## 3. Validate and review

Run affected module/framework tests, lint and builds. Prove runtime behavior in the chosen integration with real input when relevant, including lifecycle and resource cleanup. Validate an independent source fork before marking a new starter available. A documentation-only usage aid does not excuse untested runtime code; validation can use a disposable local consumer instead of committing a second usage aid.

Commit a stable implementation and obtain an independent engineering review when the change warrants one. Fix actionable findings and rerun affected checks. Put temporary reports, screenshots and comparisons under ignored `runs/` or `.artifacts/`. No committed review dossier or fresh AAA art cycle is required merely to promote an existing capability.

## 4. Complete

The result is code, tests, required licenses and the chosen usage aid, plus current catalog/copy metadata where needed. Tell the user what is available, how to use it, what was checked and any current limits. Convert findings into code/tests/current guidance; remove the completed task's local run folder after handoff. Preserve other tasks' active work. Do not commit run records or link shipped docs to them.

Completion check: a fresh clone can discover and use the capability without any `runs/` directory. Preserve `/runs/` in the framework's `.gitignore` during the eventual root migration; do not migrate a local run archive into Git.

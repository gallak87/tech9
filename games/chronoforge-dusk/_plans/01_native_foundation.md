# 01 — Native game foundation

**Type:** bounded implementation assignment. **Status:** complete — native app and runtime checks verified; diagnostic placeholders only.

**Requires:** an explicit assignment to implement this step. No Kaida model is required to begin.

**Ready to assign:** yes. This is the first implementation task; do not run 02 or later plans as part of it. Work in the Dusk directory and follow its `AGENTS.md` even if the task starts at the repository root.

**Read:** [AGENTS.md](../AGENTS.md), the defaults in [DECISIONS.md](../DECISIONS.md), the draft [asset handoff](../_prep/ASSET_CONTRACT.md), and relevant [validation guidance](../VALIDATION.md). Inspect other references only as needed.

## Outcome

A small native Godot game that can become Dusk. It owns prepared-asset loading and a development mode for inspection, traversal, and action rehearsal. It must run as a Mac `.app` without opening the Godot editor.

## Work

- Establish `game/` as the Godot project root, with `_prep/` outside its import/export scope. Use typed GDScript, a pinned stable Godot version and matching export templates, and native Forward+ with conservative effects. Record versions.
- Create one small traversal patch with collision, camera-relative keyboard movement, turning, walking/running, a 60 FPS cap, and a harmless rehearsal target. Keep scene composition useful for evaluating a character. Use a neutral, restrained development presentation; this is not a task to redesign Chronoforge's art.
- Build the runtime character/asset assembly around Godot's standard import path. A local fixture and clearly labeled temporary actor may bootstrap this step. Support selecting prepared candidates; an arbitrary-file upload server or custom general-purpose importer is unnecessary.
- Turn the handoff draft into the smallest concrete runtime descriptor needed by these fixtures: asset identity/revision, model and clip references, dimensions/facing, attachments, and motion ownership as applicable. The game lane owns this shared format and documents an example for 02. Avoid speculative provider/schema infrastructure.
- Expose inspection, traversal, and rehearsal as development views inside the game. Use the actual actor/controller/action components. Include asset revision/load status, camera reset and orbit, neutral/game lighting, animation/action selection where applicable, pause/replay, and basic performance diagnostics.
- Establish the action presentation seam: approach, attack, a single impact event, reaction, recovery, and return. Temporary motion demonstrates wiring only. This component later receives real clips in 03 and ATB commands in 06.
- Keep controller-owned displacement separate from clip motion. Traversal starts with in-place clips; the action controller owns battle approach/return. Preserve game tuning outside generated imported scenes.
- Make accepted tuning deliberately savable and confirm it survives restart. Show import errors clearly; never silently present a fallback actor as a successful Kaida load.

Choose a simple internal organization for actors, gameplay, assets, content, UI, and development tools. Prefer Godot's existing features and defer abstractions until an actual second use needs them.

## Ownership and parallel work

Own `game/`, native build instructions, and the concrete runtime portion of the asset handoff. Coordinate changes to that handoff before 02 depends on it. The asset lane may inspect original art and prepare hosted inputs concurrently; do not edit its production tools or source files without coordination.

You may create small original test fixtures and retain their generating source under `_prep/fixtures/` for this import proof. Fixtures are diagnostic assets, not Kaida or the production pipeline. No hosted model generation, Mixamo input, or asset purchase is needed to finish 01.

## Done and handoff

The owner can launch the native application, move the identified test actor, switch development views, trigger a complete rehearsal action, and inspect basic diagnostics. A prepared model/animation fixture exercises the intended import path. Repeat tests after a cold restart and report actual performance/build observations.

Provide run/export instructions, the runtime descriptor/example, and a concise explanation of where 02 will deliver assets. State which demonstrations use placeholders. This step does **not** establish Kaida's visual or motion quality.

Report any unavailable tool/export template or test you could not complete rather than claiming a native build was verified. Run the produced application and exercise the actual controls; an editor screenshot or a passing import alone is insufficient.

Stop before full ATB rules, inventory, quests, settlement production, broad content, web export, and framework work. Do not advance to 02 automatically.


## Delivered

The native foundation provides the actor, importer, traversal patch, rehearsal target, camera, development controls and saved tuning used by Kaida a1. Fixture regressions are available through `python3 tools/native.py test-foundation` when shared importer or foundation behavior changes. The normal release gate tests Kaida.

[Native instructions](../NATIVE.md), [runtime contract](../_prep/ASSET_CONTRACT.md), and [current evidence](../evidence/README.md). 01–03 are implemented; 04 is paused.

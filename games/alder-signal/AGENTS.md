# Working on Alder Signal

This is an owned copy of the forest starter. Read README.md, ARCHITECTURE.md and GAME_PLAN.json before changing it. The user wants this scene-as-building-block POC ready for playtesting; stop for feedback after its first validated playable handoff. `_tech9` stays separate much longer and is not migrated to the root by this task.

- Keep the source receipt `tech9.json` and its original `GAME_PLAN.json` immutable as fork provenance. Record later scope/results in the run documents and this game's docs.
- No runtime imports from `_tech9`. Keep renderer ownership, grounded controls, mission rules, equipment, UI and audio at concrete seams.
- Complete start → walk → restore three relays → return → win → restart, plus pause and timeout. Use real keyboard/mouse browser input to prove it.
- Test hooks only exist with `?test=1`. Observers may read state; rare-state clock setup may test timeout. Do not use teleport/completion hooks to claim a real playthrough.
- Builder owns src/**, index.html, public/game/** and tests/game.test.js. QA owns tests/game-browser.mjs and tests/lib/browser.mjs. Producer owns package metadata, scripts, other docs, integration and commits. Transfer ownership explicitly before fixes.
- Freeze source for browser/GPU captures; commit implementation before a separate critic reviews it. Art assessment is honest, and further art rounds wait for user playtest feedback.
- Run this package's tests, lint and build directly. Dependency installation must not change repository hooks. Use supported Node (^22.13.0 or >=24).
- Preserve source assets/licenses. No push, publication or unrelated game work. Stop only task-owned processes; a playtest server may be left running intentionally for the user.

# Orb Vacuum — Historian Output
## Framework Learnings

---

## Issue 1 — `{{rendering_tier_section}}` placeholder left in dev agent stub

### What happened
`vocab/roles/06_dev.json` has `{{rendering_tier_section}}` in its `prompt_template`. The scaffolder (`tools/scaffold.js`) calls `fillTemplate()` to substitute known variables into the template, then appends `devContracts` (which contains the stack template content) as a raw string concat after the fill. The variable `rendering_tier_section` is never passed into `fillTemplate()`, so the literal tag appears in the generated agent stub.

The stack content ends up appended correctly after the placeholder — so the dev agent gets both `{{rendering_tier_section}}` (unfilled) and the actual stack docs below it. Confusing but not fatal: an LLM reading the stub sees the stack docs and usually works correctly. Still a bug.

### Root cause
`renderAgentStub()` in `tools/scaffold.js` builds `devContracts` containing the stack section, but passes it as a post-fill concat rather than injecting it into `fillTemplate()`. The placeholder in `06_dev.json`'s template was added expecting the fill to handle it, but the fill call only gets `game_name`, `concept_summary`, `phase_goal`, `inputs_list`, `outputs_list`, `hard_constraints` — not `rendering_tier_section`.

### Fix (implemented)
In `renderAgentStub()`, extract the stack section content before calling `fillTemplate()`, pass it as `rendering_tier_section` in the vars object, and remove the post-fill append of `stackSection` from `devContracts`. The placeholder is then properly replaced. See changes in `tools/scaffold.js`.

---

## Issue 2 — Gamedesign agent specced absolute spawn sizes; produced broken first experience

### What happened
Gamedesign output specced orb spawn radii as absolute values (0.4–4.0 units) with no relationship to player start radius. With `PLAYER_RADIUS_START = 1.5`, almost every orb in the initial arena was a threat — nothing was clearly smaller than the player. The game opened with the player being continuously shrunk and unable to grow. Fix required: lower the start radius to 0.6 AND switch to relative spawn sizing (food = 20–80% of player radius, threats = 140–350%).

### Why it happened
The gamedesign agent had no guidance that spawn sizes should be specified relative to player start radius in arcade games where player scale changes dramatically. The spec said "no special sizing relative to player" — an explicit design decision that turned out to be wrong for this genre.

### Fix (implemented)
Added a balance note to the gamedesign role's `prompt_template` in `vocab/roles/01_gamedesign.json`: when speccing NPC spawn sizes for arcade games where the player grows/shrinks, specify sizes as *multiples of player start radius*, not absolute units. Absolute sizes are only safe when player size is fixed.

---

## Issue 3 — Camera distance fixed at 22 in Three.js template; breaks games with variable player scale

### What happened
The Three.js stack template (`vocab/templates/stacks/stack-threejs.md`) gives a boot pattern with a static camera at a fixed position. The dev agent used this pattern as a starting point. For Orb Vacuum, where player radius ranges from 0.4 to 12.0 (30× scale change), any fixed camera distance is wrong for at least part of the game. The fix required the camera distance to scale with player radius: `CAM_DISTANCE = Math.max(10, playerRadius * 8 + 6)`.

### Why it happened
The template has no mention of the pattern "camera distance should scale with subject size." This is a well-known pattern for games with variable-scale subjects (Agar.io, Osmos, flOw all do it) but it's not documented anywhere the dev agent reads.

### Fix (implemented)
Added a note to `vocab/templates/stacks/stack-threejs.md` under Notes, flagging the pattern and giving the formula used in Orb Vacuum as a reference example.

---

## Issues flagged for human review (not implemented)

### Spawn rate default
The gamedesign role's `prompt_template` has no guidance on spawn rate calibration relative to arena size. Gamedesign specced 1.5/s for a 60×60 arena; shipped as 2.0/s after feeling thin at 1.5. This is hard to encode as a rule — it's genuinely playtesting territory. Flagging: consider adding a note that spawn rate should be sanity-checked against (arena area / orb max size) to ensure the arena never goes nearly empty at start. But this is fuzzy enough that it shouldn't be a hard rule in the template.

### Gamedesign and dev agents both touching balance numbers
In practice, the dev agent re-tuned several gamedesign numbers (start radius, spawn rate, spawn method) without explicit authority to do so — those changes just happened because the game didn't play correctly. The framework has no explicit "dev may rebalance if playtest reveals broken numbers" permission or handoff protocol. Consider adding a note to the dev role that balance numbers from gamedesign are *starting targets*, not hard constraints, and that dev should document any deviations in `agents/dev.md output`.

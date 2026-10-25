# New-chat brief — current Chronoforge Echo in Godot3D

## Request and project boundary

Build **the current Chronoforge Echo game in Godot3D**, in `/Users/g/code/scratch/tech9/games/chronoforge-godot`. The owner explicitly chose a clean project beside Echo instead of continuing the Dusk rewrite. Work hands-off, plan/fan out/build in layers/commit coherent checkpoints. Create a new active Goal only when the owner explicitly requests one; they are deleting the old paused Goal. This folder currently contains the handoff docs only, not an implemented Godot game.

**Authority:** `/Users/g/code/scratch/tech9/games/chronoforge-echo`. Actual source, story, connected world graph, current artwork and behavior win over memory or Dusk's implementation. Observed Echo tree `05e79fafbd375e6f1630d6326712d3dbb177f9fb` (latest Echo-path commit `fe9a463ee369c1f7c658ca8134dfeed5505de5bd`). Recheck working source before export. Echo remains unchanged.

**Read-only donor:** `/Users/g/code/scratch/chronoforge-dusk-creative/games/chronoforge-dusk`, branch `codex/dusk-creative`. Borrow selected 3D models, rigs, physical equipment, Mixamo motion, Blender/model-generation tools and useful presentation code. Copy only required dependency closures/licences. Do not inherit its campaign application, bespoke story, save migration, map layout, fixed three-member backend, tests or old acceptance estimates. Do not keep fallback builds or legacy code paths. Dusk was created BEFORE Echo, which explains much of the drift.

The previous plan to preserve Dusk's missing-passenger/Bellwether story and return to its saved Goal is **CANCELLED**. The old Goal/scope snapshot in donor `_prep/echo_alignment/` is historical only. Saves may be discarded; this game is under construction. Existing Dusk r20 is not an Echo3D release. No old chapter completion percentage applies.

## Confirmed source facts — do not invent replacements

- Fresh `progression.createState()` contains Kaida only, saved individual HP/MP/XP/SP/skills/equipment and real inventory/resources. Actual membership is `heroes[]`, not three slots with invisible/zeroHP members.
- Kaida remains alone throughout Haventide. Vex joins in **Emberline** after the separate `ember_signal` victory AND actual Vex/lens interaction; the Exchange guard alone is insufficient. Rune joins in **Orbital Reach/Anchor Nine**, the third main region, after `orbital_guard` AND Rune/lift interaction. Forest is a branch. Inspect `src/world-construction.js:70`, `src/narrative.js:644` and `:711`, `src/recruitment.js` and the source tests.
- Unlocks and edge exits form a connected world. Players can travel back and forth through unlocked neighbors without resetting progress. Build adjacency/arrival/cleared-state contracts into the initial architecture; do not reconstruct Dusk's linear next-level campaign.
- Export FINAL `buildWorld()`/`ALL_SCENES`, after scene scaling, interior overrides, scenery footprints and patrol setup. Raw `world-authored.js`/`createRegions()` alone is incomplete. Include scene bounds/spawn, roads/water/islands, walkability, object IDs/anchors/physical footprints/interaction areas/requirements, portal destinations/arrivals, NPC presence and interior walk areas. Avoid applying the1.25scale twice.
- Mara's real Haventide placement is inside the service hall after `configureHaventideInterior()` (560,815). Tavi belongs to her actual Echo story/presence rules including Frost Canyon; she is not the old Dusk quay-rope scene. Dusk's cottage/ferry/242floor contracts are replaceable.
- Unbeaten ordinary enemies patrol and swept player/enemy contact starts encounters, respecting requirements/arrival protection. Cleared encounters remain opt-in replays. Bosses/anchored encounters do not automatically share patrol behavior. Echo's explicit paid/timed **Retreat** action is different from freely walking away or saving-to-title out of a fight.

## Rules and3D adapter boundary

Small static-data exporter + native GDScript rules modules + JavaScript oracle traces is the recommended approach. JSON can export catalogs/state/worlds, not executable `interactStory`/`onEvent`/`choose` mutations. Port bounded functions faithfully; avoid a generic JS VM/transpiler/IPC project.

Source owners: `src/progression.js`, `content.js`, `equipment.js`, `narrative.js`, `recruitment.js`, `world-construction.js`, `world-geometry.js`, `npc-identities.js`, `combat.js`, `consumables.js`, `game-session.js`, `persistence.js`. Existing Node tests are the behavioral oracle.

Combat uses `createBattle`, `battleKey`, `battleIntent`, `updateBattle`, `battleView`, a true ready queue and seeded RNG. Preserve Attack/Tech/Defend/Item/Retreat, real submenus, target then Execute, participants’ full-gauge debits and Tech-only MP costs, learned prerequisites, exact rounding/RNG order and once-only contact. Choices/actions hold gauges; pause stops updates; rewards belong outside the kernel. Preserve suspended selection/action/timing for save/resume. Prism is level 8, 2 SP, `chrono_strike`+`null_field`,10 MP each—not Dusk's ferry/level2/Focus unlock.

Timing and action clocks come from Echo: solo contact/duration.76/1.54s, combined.93/1.92s, incoming strike.72/1.40s. Standard outgoing window contact−.28 through contact−.095; assisted window differs. Offensive timing raises critical probability; successful Defend/incoming timing gives 75% damage reduction. Dusk’s guaranteed1.35outgoing damage multiplier is not the target. Check exact source rather than treating these notes as a replacement specification.

Godot presentation consumes rule events and maps hero/enemy IDs to selected rigs, gear, safe routes, clips, physical contacts, reactions, VFX/audio and a stable camera. Reuse prepared melee/receiving/weapon geometry where useful. The old autonomous Rehearsal gameplay clock and impact callbacks must NOT apply a second hit or debit. Fit retained3D clips/approach/contact/recovery to the authoritative Echo action timeline; prove one sequence before scaling.

## First milestone and next layers

1. Establish clean Godot boot, exporter and small oracle traces for actual fresh state/world and one fight. No invented narrative or economy. Proposed world scale `.025metres/finalEcho unit` is an audit suggestion, NOT a committed layout; validate capsule/door/road clearance before adopting it.
2. First real playable: **solo Kaida → `hav_first` Rust Scrapper → all five commands, both actual starter techniques (`rift_cleave`, `salt_mend`), supplies/Defend/Retreat, pause/save/resume and earned rewards**. Inspect real1x battle readability, animation and sound. Use2–5x functional probes rather than whole-route normal-speed replay.
3. Expand actual Haventide: coast/branching road/town hall/cave, `hav_guard` Drone Sentinel, Mara/town/beacon progression and permitted Emberline edge. `hav_guard` must bind to an actual Drone Sentinel3D asset; never silently substitute Dusk's Warden.
4. Add real Emberline/Exchange + separate signal encounter/Vex recruitment, then Orbital Reach/Rune. Preserve full graph, optional branches and backtracking. UI, equipment/rarity, individual levels/skills, town stages and other regions expand in layers.

## Art, UI and feedback

Echo's current graphite/parchment/orange, Barlow/EBGaramond, HUD/minimap, seven tabs, ATB accordion and information hierarchy are the reference. Large Party character views should use actual equipped3D natural idle. White-dotted image edges are ROADMAP ONLY; do not spend this first pass repairing them.

Translate Echo's coastal jade water, pale stepped shore, winding road, dense grove masses, ivory/teal/brass architecture and distinct landmarks into real geometry. Build terrain silhouette and tier1Haventide/service hall before detailing or generating all tiers/levels. Reuse donor ingredient meshes; its rectangular paved inlet is not a layout requirement. Keep roofs/foliage separate for occlusion and overhead art separate from walkable footprints.

Environment reactions should have meaningful cause/action/payoff. The owner liked reactivity but rejected the old awning rollout as a weak payoff. Do not spend time changing that old scene. Require an independent concept critic BEFORE implementing future environmental cinema, then review the actual exterior/interior consequence. Use Echo's town-upgrade grammar, not camera movement/sparkles alone.

Retain Mixamo-like movement flavor; smoother/slightly arcadey transitions are later polish. Existing Echo audio can be reused; new local audio generation waits for the owner's model. No paid Meshy/Tripo or renewed body-generation rabbit hole.

## Donor status and verification boundaries

Read DONOR_ASSETS.md for pointers. Donor source is frozen at the old playable core after removing the unverified Dusk-specific reconciliation. One73KB reusable UI source patch is retained in `_prep/echo_alignment/ui_candidate.patch`; it is a prototype, NOT an automatic patch to apply to the new architecture. Existing Echo audio was rendered offline through its unchanged WebAudio implementation into donor `game/audio/echo/`, with source/hash/peak receipts and `_prep/audio/render_echo.mjs`; there was no listening-quality acceptance. Other old proof concerns the old game only.

Keep native/Godot/Blender/GPU jobs serial on16 GB M1 Pro. Fan out disjoint source work. Broad/detail critics50/50, focus weakest two, stop accepted variants. No source-only or headless claim of visual quality/fun. Keep selected masters/original inputs/licences, current candidate and compact essential proof; clean superseded outputs after consumer checks. Do not touch the donor owner's export preset or unrelated main-tree `housing-study/`. No push.

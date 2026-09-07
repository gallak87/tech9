# Lessons from the Chronoforge projects

These findings come from a read-only review of existing source, documentation, images, and recorded validation. The old games and their gates were not rerun during this planning session. Historical reports are evidence to interpret, not automatically current truth.

## Original Chronoforge: preserve identity, verify mechanics

The original has the strongest visual and world identity for this project, along with a substantial vocabulary of crew skills, regions, cities, enemies, items, and buildings. Preserve that creative work as the north star. See its [concept](../chronoforge/CONCEPT.md), [progression](../chronoforge/src/progression.js), and [world](../chronoforge/src/world.js).

Its breadth does not mean every advertised system is finished. The [battle code](../chronoforge/src/battle.js) has ATB, attacks, techniques, and defense, but the original dual/triple-tech intent is not a complete implemented combination system. Several skill descriptions are richer than their effects. Map/tier and settlement advancement logic also contain gaps, including a circular research requirement in [base progression](../chronoforge/src/base.js).

**Dusk consequence:** inherit identity and intended experience; rebuild and validate behavior. Do not treat a renderer replacement or bulk data migration as a complete modernization.

## Dawn: structural correctness is not character quality

The [phase2-retry work](../chronoforge-dawn/docs/phase2-retry/README.md) established useful separation between preparation, rigging, normalization, installation, and real-runtime checks. Its [pitfalls](../chronoforge-dawn/docs/phase2-retry/PITFALLS.md) record arms visibly wrong despite passing skeleton checks, bind/rest confusion, stale specifications, and screenshots of unintended actors.

Its [character contract](../chronoforge-dawn/docs/phase2-retry/CONTRACT.md) deliberately excluded imported animation and imposed conventions to preserve seven hand-authored clips. Those are Dawn-specific constraints. The [canonicalizer](../chronoforge-dawn/docs/phase2-retry/tools/canonicalise.py) also records damaged hand deformation following mesh reduction; a correct socket cannot repair a mangled palm or grip.

The code's validation is narrower than some prose promises. The capture helper's detection of a GLB request does not prove that the intended asset is drawn. README and PLAYTEST contain conflicting descriptions of the installed character's provenance.

**Dusk consequence:** build fresh; retain source clips and useful rig detail; test actual hands, skin, grip, and motion. Record the exact asset and game revision visible in the runtime. Keep claims aligned with what each check proves. Do not copy Dawn code or assets.

## Dusk prototype: useful choreography, different asset architecture

The completed prototype is a valuable reference for traversal, authored world composition, battle staging, melee approach/contact/retreat, paired actions, and rehearsal. Its [rules module](../chronoforge-dusk-prototype/src/game.js) and [validation notes](../chronoforge-dusk-prototype/TESTING.md) provide useful behavioral examples.

Its [character exporter](../chronoforge-dusk-prototype/assets/source/characters.py) disables animation export. The runtime animates named rigid pieces; these models are not skinned characters with imported clips. Its [source statistics](../chronoforge-dusk-prototype/assets/source/characters-stats.json) put Kaida at 94,550 triangles across 62 meshes. This is not a drop-in integration point for Mixamo motion.

The prototype changed original character identities and visual theme. Our earlier prompt allowed more reinterpretation than the owner wanted. Engine choice did not cause that drift.

**Dusk consequence:** preserve behavior through reference actions and play scenarios, then implement it for the new actor system. Establish original visual anchors before generating assets. Use explicit action IDs and event timing rather than interpreting display labels.

## Performance: measure work as well as FPS

The prototype's recorded native-GPU browser run was around 120 FPS. Its [main loop](../chronoforge-dusk-prototype/src/main.js) continues updating/rendering through menus. Several render and allocation costs are plausible investigation targets, but no new profiling established the cause of the owner's CPU reading.

**Dusk consequence:** use a frame cap, test active and inactive states, measure exported native builds, and inspect resource lifetime. Godot is not a demonstrated automatic CPU fix. High FPS alone does not establish an efficient game.

## Integration and tools: validate the running result

The repository's [cross-game lessons](../../meta/LESSONS.md) describe 4,873 lines of disconnected modules, simultaneous edits contaminating screenshots, stale captured frames, and tuning that disappeared after restart. They also explain why real-input and motion tests find failures still captures miss.

**Dusk consequence:** connect every feature to the game early. Let the game own its inspection tools. Isolate live comparisons, verify liveness and revisions, persist accepted settings, and recheck from a cold start. Parallel files are useful only when their integration can be demonstrated.

Historical tool claims are not permanent constraints. For example, one textured Mixamo upload failure is not proof that all textured uploads fail, and a provider's old API availability says nothing about its current service. Use manual steps now because they are acceptable and practical; re-evaluate automation only when it would solve an observed bottleneck.

# Decisions and working assumptions

This is the current decision record. Earlier prompts and historical game documents are references, not instructions to resume those projects. The owner's latest direction takes precedence.

## Agreed with the owner

| Decision | Meaning for Dusk |
| --- | --- |
| Planning before execution | Planning preceded implementation. The owner subsequently authorized 01; later numbered steps still require their own assignment. |
| Fresh game implementation | Preserve original Chronoforge design and identity; create a runtime suited to the new asset workflow. |
| Godot, native first | Produce a native application for the owner's Mac first. No browser build or web accommodation is required now. |
| Browser only if a need emerges | A later playtest or user need may justify a pivot. Do not build a second target, compatibility layer, or reduced web presentation in anticipation. |
| Dawn is parked | Read its lessons; do not reuse its code or assets. |
| Original Chronoforge is the north star | Preserve the crew, setting, core loop, and breadth of content ideas. Existing defects and incomplete mechanics are not requirements. |
| Original assets establish the art style | Agents may inspect `../chronoforge/src/assets/` directly. New Blender assets should translate those recognizable designs into highly polished game assets; AAA quality is an ambition for execution and presentation, not a different aesthetic. |
| Prototype is a behavior reference | Retain the useful world/traversal approach, ATB staging, lunges, and coordinated actions. Its graphics and theme do not define Dusk. |
| Kaida first | Establish one character's identity, asset quality, animation, and in-game feel before scaling production. |
| Game owns development tools | The game exposes preview, inspection, tuning, and playtesting using its real runtime systems. |
| Pipeline serves multiple asset kinds | Metadata selects necessary processing stages. Static props need no rigging; Blender assets need no generation service. |
| Manual hosted steps are acceptable | Meshy/Mixamo are practical starting tools. Local ML capability and fully automated service integration are not prerequisites. |
| One region at a time | Keep wider Chronoforge content as reference/backlog. Do not produce eight biomes or all progression tiers upfront. |
| Story and personality get an owner-led pass | After Kaida is accepted, discuss the storyline and crew with the owner before detailed region production. The original has little developed narrative and the prototype's story felt too wacky. Chrono Trigger is an inspiration; it does not supply Dusk's plot. |
| Parallel work where useful | Asset and game work proceed together around a shared handoff. Integration and visual evaluation need explicit ownership. |
| Future tech9 rethink is deferred | Preserve the intention to extract reusable capabilities from the working game. Archiving existing work and replacing the director/scaffolder are discussion topics, not current instructions. |

## Proposed defaults for the implementation task

These fill gaps using the discussion. They can change when a concrete result provides a reason.

- **Language:** typed GDScript for gameplay and game tools; Python/Blender scripting for asset processing. Add dependencies only for an observed need.
- **Renderer:** begin with Godot's native Forward+ renderer and conservative effects. Measure on the actual Mac. A different native renderer is an option if evidence favors it; there is no browser-driven renderer constraint.
- **Versions:** record and pin the chosen stable Godot version, matching export templates, and Blender version when implementation begins. Do not upgrade during an asset comparison.
- **Presentation:** 3D characters and environments seen through an elevated, authored 2.5D camera. Explore stylized anime-influenced forms and painterly texture treatment while preserving original costume, silhouette, and color identity.
- **Art direction:** original Kaida's magenta hair, cyan jacket, dark lower clothing, and magenta energy blade are the starting anchors. A new reference sheet will resolve details; the prototype's redesign is not automatically inherited.
- **Movement:** initially let the game controller own traversal displacement and facing, with in-place animation. Let the battle action controller own approach/retreat. Coordinate these with clips and contact timing. Reconsider root-motion use only after a specific motion test calls for it.
- **Controls:** keyboard/mouse first. Do not build touch support initially. Revisit gamepad support when the first playable loop exists or the owner requests it.
- **Performance:** begin with a 60 FPS target at a documented 1080p internal render resolution and a frame cap. Tune based on measured frame pacing, resource use, and perceived responsiveness.
- **First region:** use a compact Haventide/coastal reclamation area as the proposed starting point. Its exact layout, story incident, and encounter content remain open for the owner-led story/design step after the character foundation works.
- **Asset storage:** retain immutable source downloads, editable Blender sources, candidate exports, and accepted versions. Keep only selected runtime assets in the Godot project. Plan for large-file storage once actual source sizes justify it; do not configure it during planning.

## Decisions that need evidence

1. Kaida's exact 3D proportions, face, texture style, and final camera framing: compare a small number of candidates at game scale and in motion.
2. Character geometry, material, texture, and animation budgets: establish from the first representative asset on target hardware. Avoid a universal triangle number that destroys hands or silhouette.
3. Clip selection and authored corrections: choose usable source motion, then assess grip, foot contact, transitions, and attack personality in Dusk.
4. How much environment detail and post-processing helps this art direction: test a small representative patch rather than a whole biome.
5. The first region's scope and progression pacing: settle after the first character and encounter loop are convincing.

These are small creative or technical decisions within the agreed direction, not reasons to invent a broad framework or begin campaign production.

## Why Godot

Godot is selected for the integrated game-editing and animation workflow, not a guarantee that a different engine automatically improves artwork, input latency, or CPU usage. Its animation tools include blending and state machines; its native renderers offer different performance/feature tradeoffs. See the official [animation documentation](https://docs.godotengine.org/en/stable/tutorials/animation/animation_tree.html) and [renderer comparison](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html).

If browser delivery is reconsidered, treat it as a new platform decision with a small feasibility test. Godot's current web renderer differs from Forward+, so it must not be described as a free, identical export. No work is scheduled for that possibility.


## 01 implementation record

Godot and Mac export templates are pinned to 4.6.3 stable (`7d41c59c4`), using native Forward+ / Metal. The original diagnostic fixtures use Python 3.14.5 without Blender or hosted generation. The first handoff embeds role clips in a model GLB and keeps equipment separate. Game-owned camera/controller/contact tuning is deliberately saved outside imported scenes. See [NATIVE.md](NATIVE.md), the now-concrete [asset contract](_prep/ASSET_CONTRACT.md), and [measured results](evidence/README.md). Production Blender and Kaida decisions remain for 02/03.

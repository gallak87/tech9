# Chronoforge Dusk

A fresh Godot implementation of the original Chronoforge: a stylized 2.5D strategy RPG about a three-person crew reclaiming a post-collapse Earth and helping a settlement rebuild civilization.

**Status: [06's coastal exploration](evidence/environment-06/README.md) is implemented for native review.** Kaida a1 explores an outdoor reclamation loop with original Blender scenery, camera-aligned keyboard traversal, an upper ruin and overlook, water/vegetation motion, ambient audio, pause/reset and F2 development access. See [run/build instructions](NATIVE.md) and [environment authoring guidelines](ENVIRONMENTS.md). **04 remains paused; 05's story proposal is separate, and 07–10 are unimplemented.** The subsequent [workshop POC](evidence/room-poc/README.md) adds one enterable room with close cutaway and third-person camera comparison.

The [local production pipeline](_prep/README.md) builds the current [a1 source and asset handoff](_prep/KAIDA_HANDOFF.md). Kaida’s proportions and detailed grip/whole-body motion remain provisional under the owner’s [good-enough cutoff](DECISIONS.md#phase-one-quality-cutoff--2026-09-07). 06 uses this handoff without changing her source, clips or immutable package. Additional character polish and story acceptance remain separate work.

The owner-authorized [encounter staging POC](evidence/encounter-poc/README.md) adds a practice sentry on the upper terrace. Engage it to zoom into a side view of the same location, strike, guard a pulse, and return to exploration. This establishes staging boundaries for 07; its complete ATB/progression loop remains future work.

## The direction

- Preserve the original Chronoforge's identity: Kaida, Vex, Rune, neon city-states, alien wilderness, ATB battles, crew combinations, exploration, equipment, skills, and settlement growth.
- Use the [original assets](../chronoforge/src/assets) as references for recognizable designs, world motifs, and color identity. Character appearance follows its character references; environments use grounded architecture, believable materials, and natural lighting. AAA-quality finish is the ambition for new assets and their in-game presentation.
- Use the completed Dusk prototype as a playable reference for world composition, traversal, and battle choreography. Its visual theme and character construction are not the new target.
- Build fresh in Godot. Dawn contributes lessons only; do not copy its implementation or assets into Dusk.
- Target a **native desktop application**, initially a macOS `.app` bundle containing the game executable. The owner should be able to launch it without opening the Godot editor. Browser delivery is a possible future pivot if playtesting reveals a compelling need. There is no current web export, renderer parity, or compatibility-layer work.
- Start with **Kaida in the actual game**, and refine her appearance and movement before producing the whole cast or a complete chapter. Build out one region at a time afterward.
- Build a small, polished coastal environment for Kaida independently of story, ATB, progression, and further characters. Story and crew personality develop with the owner alongside it, before integrating the complete gameplay loop in 07. Chrono Trigger is an acknowledged inspiration; the owner can drive Dusk's storyline.

The first playable Dusk is a small game foundation with a traversal patch and battle rehearsal. The game itself exposes asset inspection, animation controls, lighting/camera tuning, and performance measurements. These tools remain useful as Dusk grows.

`_prep` produces assets and metadata. **The game consumes them and owns the preview/playtest experience.** Both work lanes use the game's tools to inspect results.

## Reading for a task

Start with [AGENTS.md](AGENTS.md) and the current assignment, then read the relevant subplan. The documents below are a reference library, not a mandatory reading sequence or an instruction to build the entire roadmap. Start new agent tasks in this directory, or explicitly direct them to read its `AGENTS.md` when working from the repository root.

## Plans to consult when relevant

| Document | Purpose |
| --- | --- |
| [Decisions](DECISIONS.md) | Settled direction, proposed defaults, and questions deliberately left for evidence |
| [Roadmap](ROADMAP.md) | Linear sequence, dependencies, and agent handoff guidance |
| [Planner handoff](PLANNER.md) | Context and judgment for a fresh session planning the next assignments |
| [Numbered plans](_plans) | Individual assignments; 01–03 provide the base, and 06 is the first outdoor environment |
| [Environment guidelines](ENVIRONMENTS.md) | Evidence-based route, camera, collision, asset and playtest rules |
| [Validation](VALIDATION.md) | Appearance, motion, input, performance, and repeatable evidence |
| [Lessons](LESSONS.md) | Findings from the existing games and what Dusk does with them |
| [Future tech9 direction](FRAMEWORK_FUTURE.md) | Deferred ambition to extract reusable capabilities and rethink the director/scaffolder |
| [Asset preparation](_prep/README.md) | Asset production lane and its subplans |

## Reference entry points

Use these starting points and inspect what the current task needs. There is no need to duplicate the old games into a new reference archive.

| Need | Start here | Intended use |
| --- | --- | --- |
| Original premise and core loop | [Original concept](../chronoforge/CONCEPT.md) | Creative identity and intended mechanics; old delivery/process constraints do not govern Dusk |
| Original appearance and interface | [proto-ref screenshots](../chronoforge-dawn/shots/proto-ref) | Original-game images such as `overworld-fog-off.png`, `battle-open.png`, and `menu-party.png`; `dawn-*.png` files instead show historical Dawn lighting problems |
| Original character and asset designs | [Original assets](../chronoforge/src/assets) | Character designs and world motifs: inspect relevant assets directly; Kaida's overworld and battle images guide character work |
| Original content and implemented behavior | [World](../chronoforge/src/world.js), [progression](../chronoforge/src/progression.js), [battle](../chronoforge/src/battle.js), [settlement](../chronoforge/src/base.js) | Inspect relevant definitions and behavior; distinguish implementation gaps from intended design |
| Prototype traversal and battle choreography | [Prototype README](../chronoforge-dusk-prototype/README.md) | Find the relevant playable behavior/rehearsal; inspect specific source only when it helps the assignment |
| Previous failures and integration lessons | [Dusk's lesson summary](LESSONS.md) | Use the distilled findings before considering more historical investigation |

`proto-ref` is allowed visual reference even though it is stored under Dawn. Its location does not make Dawn's code, models, or pipeline part of this project. Prototype behavior is useful reference; its art direction and implementation are not defaults for Dusk.

## Repository boundaries

This project lives in the tech9 repository but does not adopt tech9's orchestration or phase machinery. Parallel agents may help with bounded work; the plans define responsibilities and integration points, not a prescribed agent framework.

There is a longer-term intention to feed the proven workflow back into a redesigned tech9. Keep that future discussion in view without turning Dusk's first milestone into framework development.

Keep the original game, Dawn, and the Dusk prototype intact as references. Do not bulk migrate their code, assets, balance, or roadmaps. A plan's presence does not start implementation. Once work is assigned, follow the checkpoint commit policy in [AGENTS.md](AGENTS.md); pushing or publishing requires an explicit request.

The Godot project root is `game/`, with source production files in sibling `_prep/`. Open `game/project.godot` and press F5 for editor play, or launch `dist/Chronoforge Dusk.app` for standalone play. Keeping production sources outside the Godot project avoids importing every raw FBX, Blender scene, and rejected candidate into the game.

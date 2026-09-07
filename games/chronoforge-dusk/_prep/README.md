# Asset preparation for Chronoforge Dusk

**Status: planned, not implemented.** This folder owns asset production: source references, downloaded/generated files, editable working assets, processing recipes, export metadata, and candidate/accepted revisions.

**The game owns asset consumption, preview, inspection, tuning, and playtesting.** `_prep` does not contain a second engine or the authoritative character viewer. Asset work is evaluated through the actual Dusk runtime and its development mode.

The original animated-character idea remains a useful route, now within a reusable asset system. Metadata selects the necessary steps for each asset. A static prop does not need rigging; a Blender-authored model does not need Meshy; a moving machine does not need Mixamo.

Inspect [Chronoforge's original assets](../../chronoforge/src/assets) directly as the art-style and design reference. For assets being made in 3D, Blender work should translate those designs into highly polished models and materials, with animation where needed. AAA-quality finish is the target ambition, evaluated in Dusk while preserving the original identity.

## Recipes

| Asset kind | Example route |
| --- | --- |
| Humanoid character | Approved image/reference → Meshy or Blender modeling → Blender cleanup → Mixamo rig and selected animations → Blender finishing/export → game import |
| Static prop or environment piece | Blender modeling or an existing source → material/geometry preparation → export → game import |
| Animated machinery/prop | Blender model and rigid animation → export → game import |
| Non-humanoid animated character | Suitable modeling and rigging workflow → source clips → finishing/export → game import; choose the rigging tool when this asset is needed |
| Portrait, icon, or texture | Image creation/editing → image processing → game import |

These are examples, not mandatory service chains. A static asset may use Meshy if useful; it still bypasses humanoid rigging. Animation needs are explicit: none, rigid, or skeletal.

## Read next

- [Pipeline plan](../_plans/02_asset_pipeline.md): metadata-driven processing, source retention, manual steps, and promotion.
- [Kaida plan](../_plans/03_kaida_in_game.md): first character's visual and motion goals.
- [Asset handoff](ASSET_CONTRACT.md): shared producer/consumer expectations to prove with real assets.
- [Game foundation](../_plans/01_native_foundation.md): the runtime and tools that consume the result.
- [Roadmap](../ROADMAP.md): numbered sequence and parallel work. Production assignments are in `../_plans/`; this folder holds production sources, tools, and handoff reference material.

## Working boundaries

Use hosted generation/rigging where useful and manual downloads where practical. Blender CLI/Python can handle repeatable local preparation. Neither Blender MCP nor a local ML stack is required to begin. Provider-specific automation is future work only if repetition makes it worthwhile.

Keep raw downloads and editable sources. Export candidates into distinct revisions and preserve the last accepted version. Passing structural checks means an asset is ready to evaluate, not that it looks or plays correctly.

The first proof is new Kaida working in Dusk, followed by a revised Kaida and one static prop through their appropriate routes. Do not generate the entire cast, enemy roster, or biome catalog upfront. Do not copy Dawn's assets, skeleton contract, or processing code.

The proposed Godot project is in sibling `../game/`, so raw production files are outside its import/export scope. Detailed source/output directories and scripts are created during implementation, not by this planning handoff.

The production approach may later become a tech9 capability for other games, including 2D side-scrollers. See [future framework direction](../FRAMEWORK_FUTURE.md). Prove the current recipes first; do not turn `_prep` into a universal asset platform before Dusk works.

# Zephyr Basilica — whole-course art improvement

Improve Zephyr's overall world, materials, lighting and water through an autonomous art loop. Stop when an independent, brutal AAA environment-art critic awards **9/10 overall, or after 18 completed improvement-and-review rounds, whichever comes first**. The user wants a substantial visual step forward across the course, not many rounds polishing small props. Implementation choices are yours.

## Start with the original direction

Open the [original imagegen scene reference](../../assets/levels/zephyr/zephyr-scene-reference.png) before inspecting the game. Use its monumental Gothic scale, warm light through deep cathedral interiors, layered floating islands, bronze construction and powerful silver waterfalls as general direction. It is not an exact layout or asset checklist; the playable world should have its own coherent composition.

Read [AGENTS.md](../../AGENTS.md), Zephyr's section of the [art bible](../ART_BIBLE.md#zephyr-basilica), and the [asset README](../../assets/levels/zephyr/README.md). Inspect the current production scene with `?artPass=1&level=zephyr`, including normal chase-camera views and motion. Establish what actually limits the whole course before editing.

## Priorities

- **World and composition first.** Make the cathedral archipelago feel monumental, constructed and spatially connected. Improve silhouettes, architectural depth, island undersides, foreground/middle/distant layers and the transitions between landmarks. Ordinary connectors deserve the same world quality as hero shots. Avoid repeated toy-like buildings, empty approaches and scenery that only works from a special camera.
- **Lighting and atmosphere across the lap.** Shape warm exterior light, cooler cloud depth and shaded nave interiors into distinct experiences. Use motivated light, readable materials and controlled exposure. Clouds should establish height and separation without washing out architecture, craft or receiving decks. Choose major changes that transform the racing view before decorative glow or extra particles.
- **Convincing construction and materials.** Use the editable Blender kit and high-quality, correctly scaled textures where they help. Stone needs relief, weathering and believable joints; bronze needs finish variation; the graphite roadway needs a convincing woven, coated surface. Preserve the road's identity and local wetness. The existing [road finish brief](../expansion/roads/zephyr.md) is useful context, but this assignment covers the whole environment.
- **Water as a major visual feature.** Give the falls weight, depth, motion and a visible relationship to architecture. Large discharges should emerge from convincing reservoirs, aqueducts and spill lips; receiving pools should foam and drain where the geography supports them. Let spray catch the sunlight and existing practical lights. Long falls can disappear into lower clouds. Preserve both wet crossings' landing visibility and the falling belfry's silhouette.

## Reuse the successful Nightweir water work

Inspect Nightweir in motion and read its [water description](nightweir.md). Start from [falling-water.js](../../src/levels/nightweir/environment/falling-water.js), [turbine-water.js](../../src/levels/nightweir/environment/turbine-water.js) and [water.js](../../src/levels/nightweir/environment/water.js), with the authored [hydraulic anchors](../../assets/levels/nightweir/water-kit.json).

Reuse suitable flow shading, aerated discharges, impact foam, downstream currents, ripples, reflections and light-responsive spray. Adapt them to Zephyr's cathedral waterways rather than transplanting industrial machinery. Prefer the existing Nacre/Nightweir water integration over importing the stale `_tech9` framework. Keep placement and event behavior local; extract shared helpers only where useful, and verify any affected consumers.

Avoid the earlier failures: translucent flat curtains, missing impacts, flicker, frozen water before the race, or dense mist hiding the road. Follow the established presentation clock and pause/reduced-motion behavior. Keep effects bounded and resource ownership correct; water must not introduce new driving forces or collision changes.

## Critic loop

Use a separate critic agent, supplied with the original reference and actual current runtime views. Its primary question is whether the **whole playable environment** feels substantially more convincing and beautiful. Cover the shattered rose approach, nave wall ride, both waterfall flights and receivers, chapel, climbing spiral, broken halo, belfry event and ordinary connectors. Inspect water in motion as well as stills.

Each round identifies the largest visible weaknesses, makes a meaningful improvement, then rechecks the affected views and overall course. Prioritize the biggest one to three issues; do not count extra captures or tiny parameter nudges as additional rounds. If progress plateaus, reconsider composition, geometry or lighting instead of accumulating detail. A 9 requires consistent quality from normal driving views, readable gameplay and acceptable performance, not one flattering screenshot. Keep the score honest at the round limit.

## Scope and finish

Preserve the route, jumps, wall ride, spiral, clearance envelopes, water-exposure behavior and falling-belfry timing. Shared road/rail physics belongs to the separate [contact redesign brief](../road-contact-redesign.md); do not mask those issues by changing Zephyr's track or handling.

Verify internally with working probes, relevant desktop tests, runtime performance checks and a production build. Check first encounters with water/events, high/low quality and reduced motion. Follow the campaign's desktop-only scope. Refresh Zephyr's saved circuit-picker still through the [preview workflow](../../ARCHITECTURE.md#circuit-preview-refresh), and affected consumers if shared assets change. Retain editable sources and required asset provenance.

Do not save or present evidence bundles, probe data or round-by-round reports. Use temporary captures only for inspection and remove them afterward; useful regression tests and actual game assets remain. Commit the finished work. Give a short handoff with the main visual changes, final critic score and round count, and any significant remaining limitation.

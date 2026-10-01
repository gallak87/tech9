# Map 5 — Glasswake Comet: level completion brief

## Assignment and authority

**Goal:** Finish a cobalt-comet circuit with crystal fracture jumps, readable frost/grip choices, a calving ice shelf and distinct cavern/exterior light.

Read this brief, [the common execution rules](../README.md) and the current [level API](../../LEVEL_API.md) from the primary worktree when the user resumes you. Continue your existing level work with the latest primary code. Consult architecture/art sections as needed.

Own `glasswake` through production, critique, necessary shared framework/environment/tooling improvements, final mobile verification, commit and merge into the primary worktree. Follow the [completion ownership rules](../README.md#worktree-and-completion-ownership). Start your own preview on a free port; use `?level=glasswake` and `&review=shape`. Chat sequencing belongs to the user. Keep progress in the chat and expansion notes in this folder. Document reusable technical changes with their APIs.

## Defining interactions and spectacle

- **Fracture jumps:** broken crystal bridges launch you across deep fissures, with transparent landing shelves visible through ice below.

- **Mixed grip:** frosted sections allow more lateral drift, while exposed crystal ribs restore strong magnetic grip. Choosing where to brake becomes part of learning the course.

- **Calving ice shelf:** A huge ice shelf calves beside the circuit. Cracks propagate through its body before it separates, revealing a luminous cavern and drifting fragments.

Retain long momentum-led cavern/rim bends, but compose Fracture Reach as supported crystal spans interrupted by intentional airborne crossings. Repeat readable frost/crystal decisions in the gallery and descending chasm. Show the calving shelf on approach and departure rather than hiding all spectacle at one jump.

## World and driving direction

Cobalt cavities, pale fractured ice and a quiet violet-green aurora surround optically clear crystal spans. This circuit should feel spacious, cold and exposed, with deliberate frost/crystal grip zones; ordinary magnetic handling remains unchanged outside them.

Start near 4.8 km with a constant 30 m usable width and roughly 220 m of elevation change. Favor long linked bends with a few distinct braking decisions over repetitive hairpins; connect the surface rim, cavern and canyon as one physical route. Target one 450–650 m panoramic crossing with curvature and structural landmarks along it. Supported transparent spans and clearly authored flight gaps must be visually distinct; build actual launch/landing behavior for the fracture jumps.

| District idea        | Route and composition starting point                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Aurora Berth**     | Launch from a shallow rim shelf into an early bank. A crystalline dock mast frames the aurora and exposes deck ribs beneath the starting grid.                                                                       |
| **Cobalt Mouth**     | Two linked bends enter a torn cavern entrance. Dark blue ice walls have sharp broken planes, rounded melt pockets and bright fracture edges, not repeated identical crystal spikes.                                  |
| **Prism Gallery**    | A long climbing interior sweeper threads layered ice curtains. Daylight shafts pick out the transparent road edge and illuminate a massive trapped dark inclusion.                                                   |
| **Fracture Reach**   | Exit onto engineered crystal spans and authored fracture jumps over a deep canyon. Closely readable beams beneath clear deck panes prove support and surface while the far approach is visible well before the span. |
| **Auroral Rim**      | Broad banked arcs skim the comet exterior, with the sky opening wide. A distant fractured fragment and sparse dust establish scale without forming a collision hazard.                                               |
| **Bluebell Chasm**   | A descending S passes suspended bell-shaped ice vaults and a dark fissure floor. Solid frosted panel bands alternate with clear panes so the exit cannot disappear into the blue background.                         |
| **Thawlight Return** | A rising linked bend reaches the pale surface and dock mast again. Amber-white navigation fittings and warmer grazing sunlight provide a final tonal release.                                                        |

## Raceway construction and whole-world finish

- Running surface: optically clear ribbed crystal deck cassettes with visible thickness, bounded frosted travel bands and occasional opaque blue reinforcement panels. Pane edges catch light; the road must remain readable over both bright ice and the black canyon.
- Boundaries: low plinths support tall blue blade-shaped fins, spaced and tapered by turn direction. Their pale interior faces and dark outer thickness make an entirely different silhouette from orbital U frames and Nacre swept fins.
- Underside/supports: bundled clear compression struts, blue coupling collars and articulated crystal arches anchor into fractured bedrock. On the canyon bridge, longitudinal load ribs and transverse sills are actually visible through the surface.
- District variation: clear surface-rim panes, frost-edged gallery glass and deep cobalt cave ribs; change transparency and physical panel coverage, not just the emissive accent. Avoid stacked transparent shells and any effect that hides the ship.

- Hero landmarks: the dock mast, huge dark inclusion in the Prism Gallery and one sweeping canyon bridge. Shape the canyon and its depths as real scene geometry visible through and beside the road.
- Ordinary stretches: tiered fractures, snowless wind-polished ice, trapped bubbles, rubble shelves and broad fault walls. Build near broken edges, middle-distance cavern chambers and distant exterior fragments; do not substitute a panorama for nearby terrain.
- Lighting: Contrast shadowed cobalt caverns with aurora-lit exterior ice and shafts of light through fractures. Separate frost from clear crystal by broad material/light response so grip can be anticipated. Transparent landing shelves need lit thickness and support silhouettes against both dark fissures and bright ice. Keep reflections stable and preserve geometry within the newly revealed luminous cavern.

**Reject these shortcuts:** Reject a transparent road that disappears, ice triangles with unstable highlights, a sky-only world, repeated crystal spikes, an invisible bridge masquerading as a jump, or unmarked grip changes. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Presets and resource discipline

High may use restrained crystal transmission and slow layered aurora motion; low replaces costly transmission with carefully lit transparent/opaque approximations while preserving floor thickness, support visibility and route contrast. Reduce overlapping transparent surfaces first, not canyon depth. Reduced motion holds the aurora pattern and removes dust streaks; no rapid glitter or full-screen flashes.

## Production and review

Use the [scene-imagegen → Blender workflow](../README.md#asset-workflow-imagegen-to-blender) for major assets: The fractured bridge and landing shelves, layered cavern/ice curtains, and multi-part calving shelf are major scene-to-Blender subjects. Reuse authored fracture families for secondary rubble instead of generating each shard separately.

Use the [shared production/critic loop](../README.md#production-and-critique-loop) and [common verification/completion rules](../README.md#verification-and-resource-discipline). The checks below add this level’s specific interactions and lighting. Iterate on desktop first; perform the mobile pass once desktop art and critique are settled. Merge and verify the completed level yourself, including affected existing circuits after shared changes.

## Acceptance on the actual production build

1. Drive linked bends across declared frost/crystal boundaries and compare braking/drift at matched speeds; preserve ordinary handling outside those zones.
2. Cross the fracture jumps with actual input and existing boost; inspect takeoff, real airborne motion, transparent landing shelves, misses/recovery and checkpoint order.
3. Inspect the calving shelf and clear road against bright ice, deep canyon and sky at high/low; verify the event and grip state reset/replay deterministically.
4. Check cavern-to-rim lighting, low/reduced-motion readability and landing/recovery behavior; record difficult speed/grip requirements without implementing pickups.

# Map 5 — Glasswake Comet: overnight production handoff

> A fractured comet reveals cobalt ice caverns and an aurora-filled sky, while clear ribbed crystal decks and blue blade-shaped boundaries expose enormous fissures below. Long linked bends, fracture jumps and readable frost/crystal grip changes reward smooth momentum and deliberate braking.

## Assignment and authority

**Goal:** Finish a complete comet circuit through fractured cobalt ice, with legible transparent crystal raceway construction and a spectacular engineered canyon crossing, then deliver the verified candidate through one independent critic loop and final human review.

Read this brief, [the common execution rules](../../EXPANSION_HANDOFF.md) and the [frozen level contract](../../EXPANSION_LEVEL_CONTRACT.md) when available. Consult architecture/art sections only as needed; do not preload the full roadmap or other lane briefs. Use the integrator’s verified base/API.

Own only `src/levels/glasswake/**`, `public/assets/levels/glasswake/**`, `tools/expansion-glasswake-*.mjs` and `docs/expansion/glasswake/**` in the assigned isolated worktree. Shared core, renderer, camera, UI, physics, race, settings, package/config and other levels are outside this lane. Request necessary contract changes from the launching integrator recorded in `docs/expansion/LAUNCH_STATE.json`; continue independent owned work while they are resolved. No copied runtime, private launcher or alternate shared implementation.

Planned dev/preview ports: **5203/5204**. Production route: `http://127.0.0.1:5204/?level=glasswake`; shape route adds `&review=shape`. These are reservations, not evidence of running servers. The launching integrator in `docs/expansion/LAUNCH_STATE.json` owns server assignment and GPU capture scheduling. Coordinate before a hidden browser run; report the exact served build and browser CLOSED afterward. Do not touch the historical Gate 4 servers or ping those sessions.

## Defining interactions and spectacle

- **Fracture jumps:** broken crystal bridges launch you across deep fissures, with transparent landing shelves visible through ice below.

- **Mixed grip:** frosted sections allow more lateral drift, while exposed crystal ribs restore strong magnetic grip. Choosing where to brake becomes part of learning the course.

- **Calving ice shelf:** A huge ice shelf calves beside the circuit. Cracks propagate through its body before it separates, revealing a luminous cavern and drifting fragments.

Retain long momentum-led cavern/rim bends, but compose Fracture Reach as supported crystal spans interrupted by intentional airborne crossings. Repeat readable frost/crystal decisions in the gallery and descending chasm. Show the calving shelf on approach and departure rather than hiding all spectacle at one jump.

## World and driving direction

Cobalt cavities, pale fractured ice and a quiet violet-green aurora surround optically clear crystal spans. This circuit should feel spacious, cold and exposed, with deliberate frost/crystal grip zones; ordinary magnetic handling remains unchanged outside them.

Start near 4.8 km with a constant 30 m usable width and roughly 220 m of elevation change. Favor long linked bends with a few distinct braking decisions over repetitive hairpins; connect the surface rim, cavern and canyon as one physical route. Target one 450–650 m panoramic crossing with curvature and structural landmarks along it. Supported transparent spans and clearly authored flight gaps must be visually distinct; build actual launch/landing behavior for the fracture jumps.

| Initial lap interval | District             | Geometry, composition and gameplay purpose                                                                                                                                                                           |
| -------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–12%                | **Aurora Berth**     | Launch from a shallow rim shelf into an early bank. A crystalline dock mast frames the aurora and exposes deck ribs beneath the starting grid.                                                                       |
| 12–26%               | **Cobalt Mouth**     | Two linked bends enter a torn cavern entrance. Dark blue ice walls have sharp broken planes, rounded melt pockets and bright fracture edges, not repeated identical crystal spikes.                                  |
| 26–41%               | **Prism Gallery**    | A long climbing interior sweeper threads layered ice curtains. Daylight shafts pick out the transparent road edge and illuminate a massive trapped dark inclusion.                                                   |
| 41–56%               | **Fracture Reach**   | Exit onto engineered crystal spans and authored fracture jumps over a deep canyon. Closely readable beams beneath clear deck panes prove support and surface while the far approach is visible well before the span. |
| 56–70%               | **Auroral Rim**      | Broad banked arcs skim the comet exterior, with the sky opening wide. A distant fractured fragment and sparse dust establish scale without forming a collision hazard.                                               |
| 70–84%               | **Bluebell Chasm**   | A descending S passes suspended bell-shaped ice vaults and a dark fissure floor. Solid frosted panel bands alternate with clear panes so the exit cannot disappear into the blue background.                         |
| 84–100%              | **Thawlight Return** | A rising linked bend reaches the pale surface and dock mast again. Amber-white navigation fittings and warmer grazing sunlight provide a final tonal release.                                                        |

## Raceway construction and whole-world finish

- Running surface: optically clear ribbed crystal deck cassettes with visible thickness, bounded frosted travel bands and occasional opaque blue reinforcement panels. Pane edges catch light; the road must remain readable over both bright ice and the black canyon.
- Boundaries: low plinths support tall blue blade-shaped fins, spaced and tapered by turn direction. Their pale interior faces and dark outer thickness make an entirely different silhouette from orbital U frames and Nacre swept fins.
- Underside/supports: bundled clear compression struts, blue coupling collars and articulated crystal arches anchor into fractured bedrock. On the canyon bridge, longitudinal load ribs and transverse sills are actually visible through the surface.
- District variation: clear surface-rim panes, frost-edged gallery glass and deep cobalt cave ribs; change transparency and physical panel coverage, not just the emissive accent. Avoid stacked transparent shells and any effect that hides the ship.

- Hero landmarks: the dock mast, huge dark inclusion in the Prism Gallery and one sweeping canyon bridge. Shape the canyon and its depths as real scene geometry visible through and beside the road.
- Ordinary stretches: tiered fractures, snowless wind-polished ice, trapped bubbles, rubble shelves and broad fault walls. Build near broken edges, middle-distance cavern chambers and distant exterior fragments; do not substitute a panorama for nearby terrain.
- Lighting: Contrast shadowed cobalt caverns with aurora-lit exterior ice and shafts of light through fractures. Separate frost from clear crystal by broad material/light response so grip can be anticipated. Transparent landing shelves need lit thickness and support silhouettes against both dark fissures and bright ice. Keep reflections stable and preserve geometry within the newly revealed luminous cavern.

**Reject these shortcuts:** Reject a transparent road that disappears, ice triangles with unstable highlights, a sky-only world, repeated crystal spikes, an invisible bridge masquerading as a jump, or unmarked grip changes. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Future shared pickup/boost locations

Mark safe boost setup/refill positions before fracture jumps, recovery areas after landings, and approaches where a future shared grip/stability aid could help with frost. These are shared-system candidates only; keep the authored mixed-grip challenge. Record actual built-route coordinates using the [shared placement-note format](../../EXPANSION_HANDOFF.md#future-shared-pickup-and-boost-placement), without implementing those systems or replacing the approved level mechanics.

## Presets and resource discipline

High may use restrained crystal transmission and slow layered aurora motion; low replaces costly transmission with carefully lit transparent/opaque approximations while preserving floor thickness, support visibility and route contrast. Reduce overlapping transparent surfaces first, not canyon depth. Reduced motion holds the aurora pattern and removes dust streaks; no rapid glitter or full-screen flashes.

The [common brief](../../EXPANSION_HANDOFF.md) defines resource limits, ownership, provenance and high/low verification.

## Production and review

Use the [scene-imagegen → Blender workflow](../../EXPANSION_HANDOFF.md#asset-workflow-imagegen-to-blender) for major assets: The fractured bridge and landing shelves, layered cavern/ice curtains, and multi-part calving shelf are major scene-to-Blender subjects. Reuse authored fracture families for secondary rubble instead of generating each shard separately. Keep all asset iteration inside the single eight-round level critic budget; simple procedural parts need no separate concept/model loop.

Follow the [shared production/critic loop](../../EXPANSION_HANDOFF.md): internal shape checks, full production, one independent counter capped at eight, then final human review. The initial critique counts; stop at the first verified pass or cap. Use the level-specific checks below alongside shared control/lifecycle regressions.

## Acceptance on the actual production build

1. Drive linked bends across declared frost/crystal boundaries and compare braking/drift at matched speeds; preserve ordinary handling outside those zones.
2. Cross the fracture jumps with actual input and existing boost; inspect takeoff, real airborne motion, transparent landing shelves, misses/recovery and checkpoint order.
3. Inspect the calving shelf and clear road against bright ice, deep canyon and sky at high/low; verify the event and grip state reset/replay deterministically.
4. Check cavern-to-rim lighting, low/reduced-motion readability and future support coordinates; record difficult speed/grip requirements without implementing pickups.
5. Across representative starts, prove driver-left/right steering, throttle, brake, airbrake, manual boost, rail feedback, slope rest, pause/resume, reset and valid ordered checkpoint progression. Use real keyboard inputs for motion; deterministic starts are setup, never autopilot evidence. Fast numerical full-lap checks are complementary and must be labelled as simulated.
6. Inspect the whole shape plus each district in driving view; test desktop, **844×390**, **640×360** and **390×844**. Check actual HUD, notice, map and control bounds during motion and feedback, not only initial screenshots. Shared UI/camera defects go to the integrator rather than being patched outside lane ownership.
7. Verify shape and production routes, loading/error handling, high/low/reduced motion, compatible replay behavior and incompatible-rules rejection through the supplied contract. Check level exit/disposal and no accidental assets/effects in a baseline route. The integrator owns the combined all-map regression.
8. Record shader/console/page/asset errors and drawn-resource maxima with the served build identifiers. Hidden runs do **not** certify foreground frame pacing, audible quality, physical gamepad/mobile behavior or OS-lock operation; leave each unperformed check explicitly unverified.

## Scope limits and final evidence

Build the named level interactions and spectacle under the [shared runtime/ownership boundaries](../../EXPANSION_HANDOFF.md#gameplay-and-presentation-boundaries). Preserve the existing ship, controls and default handling outside declared local effects; coordinate reusable runtime support with the integrator. Shared pickup/boost expansion remains placement notes only. Only the user supplies final human approval.

Keep `STATUS.json` to current phase, counter/latest scores, build/checks and open issues. Use this handoff for a short current integration note and, during active review, a compact round table. Keep asset provenance with the assets. Do not create separate implementation/performance/integration/critique reports; raw evidence stays in ignored `.experiments/`. After merge, fold lasting decisions into source/architecture and retire the completed handoff/history.

At handback, provide the playable production and shape URLs, controls/section starts, exact source revision or patch manifest/checksum, final served JS/CSS identifiers, tests/lint/build/browser results, measured budgets, critic history and honest limitations. Leave review servers to the launching integrator, report browser CLOSED, and keep `humanApproved: false` until the user actually approves this map. Final human review is the only planned human gate; reaching the overnight end state does not itself mean approval.

# Map 7 — Saffron Leviathan: overnight production handoff

> Cross an alien dune sea through continent-sized fossil ribs and cascading sandfalls, on fused-gold glass ribbons with low split aerodynamic baffles. Open crests lead into sheltered bone corridors and offset braking turns, with a long panoramic acceleration section as the circuit's signature.

## Assignment and authority

**Goal:** Finish a complete alien desert circuit across huge fossil architecture and dunes, with fused-gold glass raceway and an authored panoramic acceleration reach, then deliver the verified candidate through one independent critic loop and final human review.

Read this brief, [the common execution rules](../../EXPANSION_HANDOFF.md) and the [frozen level contract](../../EXPANSION_LEVEL_CONTRACT.md) when available. Consult architecture/art sections only as needed; do not preload the full roadmap or other lane briefs. Use the integrator’s verified base/API.

Own only `src/levels/saffron/**`, `public/assets/levels/saffron/**`, `tools/expansion-saffron-*.mjs` and `docs/expansion/saffron/**` in the assigned isolated worktree. Shared core, renderer, camera, UI, physics, race, settings, package/config and other levels are outside this lane. Request necessary contract changes from the launching integrator recorded in `docs/expansion/LAUNCH_STATE.json`; continue independent owned work while they are resolved. No copied runtime, private launcher or alternate shared implementation.

Planned dev/preview ports: **5207/5208**. Production route: `http://127.0.0.1:5208/?level=saffron`; shape route adds `&review=shape`. These are reservations, not evidence of running servers. The launching integrator in `docs/expansion/LAUNCH_STATE.json` owns server assignment and GPU capture scheduling. Coordinate before a hidden browser run; report the exact served build and browser CLOSED afterward. Do not touch the historical Gate 4 servers or ping those sessions.

## Defining interactions and spectacle

- **Ride through the skeleton:** descend through the skull’s mouth, bank along its interior and jump between broken vertebrae. The fossil becomes the actual course.

- **Shifting sand crossings:** migrating dunes partially bury the road. Exposed glass offers speed; sand drags you down, while crest jumps can skip the deepest deposits.

- **Living burrower:** A living burrower travels beneath the desert alongside the fossil, raising a moving ridge before breaching beyond the track. Its movement sends sand pouring through the bones.

Rework the skull from a distant prop into a traversable part of Leviathan Vista/Marrow Switch; spread broken-vertebra crossings and sand/glass choices through the route. Preserve a worthwhile panoramic acceleration reach, and let the burrower’s ridge/breach/sandfalls build through separate sightlines.

## World and driving direction

Saffron sand, pale fossil bone and smoked-gold glass sit beneath an immense dry alien sky. The remains have age, stratification and specific anatomy; this is an archaeological landscape at impossible scale, not a desert highway with a few rib props.

Start near 5.2 km with a constant 32 m usable width and roughly 130 m of rolling elevation. Alternate broad visible crests with protected bone-corridor bends and two offset braking decisions. Reserve a 600–750 m signature panorama for acceleration, using a shallow evolving arc, stepped sightlines and nearby scale markers so its length earns its place. Keep grounded crests magnetic and distinguish intentionally airborne vertebral/dune-skip jumps from ordinary deck.

| Initial lap interval | District             | Geometry, composition and gameplay purpose                                                                                                                                                |
| -------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–12%                | **Ochre Anchorage**  | Begin beside a small bone-suspended survey station and enter an open crest. Low split baffles, layered dunes and a distant immense ribcage establish the course identity immediately.     |
| 12–26%               | **Ribshadow Reach**  | Broad alternating banks pass through fossil ribs. Each rib has different erosion and section shape; bright sky gaps reveal the upcoming road rather than creating a strobing tunnel.      |
| 26–40%               | **Sandfall Gallery** | An offset braking sequence follows a sheltered fossil ledge beside slow sand cascades. Warm reflected sand light gives the dark inner bone readable depth.                                |
| 40–57%               | **Leviathan Vista**  | The long panoramic acceleration reach emerges along a glass ribbon beside the creature’s vast spine. Near vertebral fragments, middle ribs and a remote skull reveal the scale in layers. |
| 57–71%               | **Marrow Switch**    | Two linked turns enter a hollow vertebral corridor, with a short straight between decisions. Pale porous arches and gold road reflections keep the sheltered route legible.               |
| 71–85%               | **Amber Crest**      | A rising bank reaches a wind-carved ridge and reveals the original station. Broad dune faces carry slowly changing color bands rather than featureless flat yellow planes.                |
| 85–100%              | **Siltwake Return**  | An offset descent and compact final bend pass buried rib tips back to the grid. Low vegetation-like mineral fans and embedded markers enrich the ordinary closing stretch.                |

## Raceway construction and whole-world finish

- Running surface: thick fused-gold glass ribbons with a smoked central travel band, translucent shoulders and broad lens-like panel sections. Subsurface bubbles and sparse mineral laminae belong inside the material, not a sandy asphalt overlay.
- Boundaries: low split aerodynamic baffles have two separated vanes and a continuous grounded toe. Their tapered ends and shadow gaps make a horizontal silhouette unique among the circuits; no tall generic rails.
- Underside/supports: forked gold-ceramic shoes spread onto stable fossil shelves, while bridge ribs clamp around bone without implausibly floating. Exposed underside glass reveals a restrained structural web over the deepest dune troughs.
- District variation: clear amber outer spans, honey-opaque reinforced turns and smoke-gold corridor panels. Pale baffle interiors, dark curb seams and physical arrow fittings must remain readable against bright sand.

- Hero landmarks: the approaching ribcage, distant skull beyond Leviathan Vista and bone-suspended survey station. The continent-sized fossil impression comes from scale layers, partial views and terrain integration, not simply one enlarged low-poly skeleton.
- Ordinary stretches: dune families with different orientations, exposed bone strata, buried fragments, mineral crust, eroded ledges and slow sandfalls. Keep a composed near layer around every crest and corridor entrance.
- Lighting: Let pale sun and long rib shadows define exterior scale, then use warm sand bounce and narrow skylight openings inside the skull and vertebrae. Interior corners must remain readable without losing their sheltered darkness. Gold glass and buried sand must look materially different at driving speed; distant lavender haze must preserve the fossil’s layered silhouette.

**Reject these shortcuts:** Reject a flat yellow backdrop, copied highway panels, repeated identical ribs, sand obscuring the route, rib-shadow strobing, or a featureless full-throttle straight added solely for length. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Future shared pickup/boost locations

Mark boost/refill opportunities before vertebral and dune-skip jumps, safe recovery points after sand-heavy stretches, and preparation space before the skull descent. Note future shared support needs without creating a desert-specific item or shortening the fossil experience. Record actual built-route coordinates using the [shared placement-note format](../../EXPANSION_HANDOFF.md#future-shared-pickup-and-boost-placement), without implementing those systems or replacing the approved level mechanics.

## Presets and resource discipline

High may add sparse drifting grains, limited glass transmission and animated sandfall ribbons. Low preserves the fossil silhouettes, dune contours, deck thickness and readable inner corridor lighting while simplifying grains and material layers. Reduced motion removes blowing grains and holds sandfalls nearly still; ensure repeated ribs do not produce harsh flashing at speed.

The [common brief](../../EXPANSION_HANDOFF.md) defines resource limits, ownership, provenance and high/low verification.

## Production and review

Use the [scene-imagegen → Blender workflow](../../EXPANSION_HANDOFF.md#asset-workflow-imagegen-to-blender) for major assets: The traversable skull and anatomically varied vertebrae, living burrower, and displaced dune/sandfall assemblies are major scene-to-Blender subjects. Establish reusable bone and dune families for the remaining landscape. Keep all asset iteration inside the single eight-round level critic budget; simple procedural parts need no separate concept/model loop.

Follow the [shared production/critic loop](../../EXPANSION_HANDOFF.md): internal shape checks, full production, one independent counter capped at eight, then final human review. The initial critique counts; stop at the first verified pass or cap. Use the level-specific checks below alongside shared control/lifecycle regressions.

## Acceptance on the actual production build

1. Drive the skull descent/interior bank and vertebral jumps with actual inputs; verify camera clearance, real takeoff/landing and visible exits.
2. Compare exposed glass and sand drag at matched speeds; check migrating deposit state, crest-jump bypasses and deterministic reset/replay.
3. Inspect the burrower ridge, breach and bone sandfalls along the route; ensure the spectacle has scale without hiding landings or becoming repeated identical props.
4. Check exterior/interior lighting and glass/sand readability in high/low/reduced motion; verify future placement coordinates and report unsupported difficulty.
5. Across representative starts, prove driver-left/right steering, throttle, brake, airbrake, manual boost, rail feedback, slope rest, pause/resume, reset and valid ordered checkpoint progression. Use real keyboard inputs for motion; deterministic starts are setup, never autopilot evidence. Fast numerical full-lap checks are complementary and must be labelled as simulated.
6. Inspect the whole shape plus each district in driving view; test desktop, **844×390**, **640×360** and **390×844**. Check actual HUD, notice, map and control bounds during motion and feedback, not only initial screenshots. Shared UI/camera defects go to the integrator rather than being patched outside lane ownership.
7. Verify shape and production routes, loading/error handling, high/low/reduced motion, compatible replay behavior and incompatible-rules rejection through the supplied contract. Check level exit/disposal and no accidental assets/effects in a baseline route. The integrator owns the combined all-map regression.
8. Record shader/console/page/asset errors and drawn-resource maxima with the served build identifiers. Hidden runs do **not** certify foreground frame pacing, audible quality, physical gamepad/mobile behavior or OS-lock operation; leave each unperformed check explicitly unverified.

## Scope limits and final evidence

Build the named level interactions and spectacle under the [shared runtime/ownership boundaries](../../EXPANSION_HANDOFF.md#gameplay-and-presentation-boundaries). Preserve the existing ship, controls and default handling outside declared local effects; coordinate reusable runtime support with the integrator. Shared pickup/boost expansion remains placement notes only. Only the user supplies final human approval.

Keep `STATUS.json` to current phase, counter/latest scores, build/checks and open issues. Use this handoff for a short current integration note and, during active review, a compact round table. Keep asset provenance with the assets. Do not create separate implementation/performance/integration/critique reports; raw evidence stays in ignored `.experiments/`. After merge, fold lasting decisions into source/architecture and retire the completed handoff/history.

At handback, provide the playable production and shape URLs, controls/section starts, exact source revision or patch manifest/checksum, final served JS/CSS identifiers, tests/lint/build/browser results, measured budgets, critic history and honest limitations. Leave review servers to the launching integrator, report browser CLOSED, and keep `humanApproved: false` until the user actually approves this map. Final human review is the only planned human gate; reaching the overnight end state does not itself mean approval.

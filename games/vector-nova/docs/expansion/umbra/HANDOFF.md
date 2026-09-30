# Map 10 — Umbra Fold: overnight production handoff

> A ruined gravity observatory hangs beside a luminous black-hole accretion ring, its dark segmented decks bounded by asymmetric suspended side plates and bright continuous guidance. Stacked crossings, inverted transitions and a descending fold over the start form a technical finale whose difficulty comes from learning linked corners rather than invisible hazards.

## Assignment and authority

**Goal:** Finish a complete technical finale through a ruined gravity observatory beside a luminous accretion ring, with distinct segmented raceway and readable stacked/inverted geometry, then deliver the verified candidate through one independent critic loop and final human review.

Launch remains on hold for final Nacre completion/review and a verified shared foundation. The [integrator handoff](../../EXPANSION_INTEGRATOR_HANDOFF.md) owns readiness and launch; this brief does not start work.

Read this brief, [the common execution rules](../../EXPANSION_HANDOFF.md) and the [frozen level contract](../../EXPANSION_LEVEL_CONTRACT.md) when available. Consult architecture/art sections only as needed; do not preload the full roadmap or other lane briefs. Use the integrator’s verified base/API.

Own only `src/levels/umbra/**`, `public/assets/levels/umbra/**`, `tools/expansion-umbra-*.mjs` and `docs/expansion/umbra/**` in the assigned isolated worktree. Shared core, renderer, camera, UI, physics, race, settings, package/config and other levels are outside this lane. Request necessary contract changes from the launching integrator recorded in `docs/expansion/LAUNCH_STATE.json`; continue independent owned work while they are resolved. No copied runtime, private launcher or alternate shared implementation.

Planned dev/preview ports: **5213/5214**. Production route: `http://127.0.0.1:5214/?level=umbra`; shape route adds `&review=shape`. These are reservations, not evidence of running servers. The launching integrator in `docs/expansion/LAUNCH_STATE.json` owns server assignment and GPU capture scheduling. Coordinate before a hidden browser run; report the exact served build and browser CLOSED afterward. Do not touch the historical Gate 4 servers or ping those sessions.

## World and driving direction

Dark graphite, fractured pale observatory stone and restrained cold metal hang against a luminous accretion ring. The architecture is asymmetrical and damaged, yet the functioning raceway remains engineered and clearly guided. Difficulty comes from linked corners and layered road geometry, never invisible hazards or unexplained gravity changes.

Start near 5.4 km with a constant 28 m usable width and roughly 320 m of vertical range. Build a learnable sequence of linked turns, one extended inversion and two visually separable stacked crossings, finishing with a descending continuous fold over the start. Give each demanding feature a recognizable entry landmark and short recovery shelf. Keep all surfaces continuously magnetic with validated frames; the black hole exerts no new physics.

| Initial lap interval | District            | Geometry, composition and gameplay purpose                                                                                                                                                     |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–11%                | **Broken Meridian** | An early offset S leaves a half-ruined observatory deck. Pale broken ring fragments and the first asymmetric boundary plates point toward the intact racing surface.                           |
| 11–25%               | **Parallax Stacks** | Linked climbing turns thread the first stacked crossing. The nearer upper deck has a clearly different underside and lit support line, making route order readable from chase view.            |
| 25–39%               | **Lensward Arc**    | A broad bank opens onto the accretion ring and a tilted observatory lens. Dark running panels retain edge detail against the bright ring without becoming a silhouette-only road.              |
| 39–55%               | **Inversion Vault** | A gradual continuous roll enters an inverted hold beneath a broken instrument vault. Lighted floor-edge continuity and spare architecture reveal the direction through the transition.         |
| 55–69%               | **Tidal Knots**     | Two linked braking turns cross the route a second time at a different height. Distinct amber approach markers and unequal suspended plates make the corner order learnable.                    |
| 69–85%               | **Event Fold**      | A steep continuous descent curls above the start on a folded ribbon, then releases onto a recovery shelf. The earlier grid becomes a dramatic depth reference; it is never a jump or teleport. |
| 85–100%              | **Quiet Meridian**  | A lower return arc threads abandoned instrument ribs back to the line. A dimmer ring view and calm pale lighting provide relief while preserving rich near-field structural detail.            |

## Raceway construction and whole-world finish

- Running surface: dark segmented deck blocks with broad graphite facets, cold metallic edge bands and occasional pale service panels. Bright continuous guidance is physically embedded along the drivable corridor; the dark surface must retain roughness and shape.
- Boundaries: asymmetric suspended side plates hang from offset struts above a low continuous curb. Alternate taller outer plates and shorter inner pieces by corner need, with recognizable open windows; do not copy U frames or random floating rectangles.
- Underside/supports: paired tension spines, broken-but-repaired load nodes and tilted support hoops attach to the observatory. Expose different deck bottoms at the two crossings so their spatial order can be learned.
- District variation: pale patched launch panels, dark lens-facing spans, ribbed inversion shells and silver reinforcing bands on the descending fold. Keep the continuous guidance coherent without making every surface emissive.

- Hero landmarks: the luminous accretion ring, tilted lens assembly and ruined instrument vault. A composed apparent lensing treatment may provide visual spectacle, but avoid full-screen distortion that alters the road or implies simulated astrophysics.
- Ordinary stretches: fractured observatory terraces, repair gantries, suspended instrument ribs, small service lights and distant debris families. Damaged architecture needs deliberate construction details and silhouette variation, not arbitrary floating debris cubes.
- Light and sky: ring-derived warm/cool gradients and steady engineered road lighting shape the dark craft and deck. Include structured stars and sparse far ruins in views away from the ring; the majority of the world must not revert to empty black.

**Reject these shortcuts:** Reject arbitrary floating blocks, empty black views away from the ring, a technical route that is merely confusing, invisible crossings, bright guides hiding absent road geometry, inverted camera collisions or new black-hole physics. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Presets and resource discipline

High may add restrained layered ring detail and slow far-debris drift. Low keeps the accretion silhouette, background stars, every route marker and major ruined landmark while simplifying distant assemblies. Reduced motion stops ring flow and debris motion; no camera shake, rotating horizon illusion or pulsing edge lights. Never distort HUD or driving geometry.

The [common brief](../../EXPANSION_HANDOFF.md) defines resource limits, ownership, provenance and high/low verification.

## Production and review

Follow the [shared production/critic loop](../../EXPANSION_HANDOFF.md): internal shape checks, full production, one independent counter capped at eight, then final human review. The initial critique counts; stop at the first verified pass or cap. Use the level-specific checks below alongside shared control/lifecycle regressions.

## Acceptance on the actual production build

1. Drive Parallax Stacks and Tidal Knots with actual braking, steering and airbrake; verify the correct deck and next corner are visually clear from the ordinary chase camera.
2. Traverse the inversion at normal and boosted speed with a mid-roll input correction; numerically verify seam-continuous finite frames and inspect camera clearance throughout entry, hold and exit.
3. Descend Event Fold with controlled braking and a deliberately imperfect line; show continuous contact, a visible recovery shelf and no false flight, teleport or altered gravity.
4. Inspect views toward and away from the ring at high/low and reduced motion, including dark ordinary return stretches; road, boundaries, ship and background depth must remain legible.
5. Across representative starts, prove driver-left/right steering, throttle, brake, airbrake, manual boost, rail feedback, slope rest, pause/resume, reset and valid ordered checkpoint progression. Use real keyboard inputs for motion; deterministic starts are setup, never autopilot evidence. Fast numerical full-lap checks are complementary and must be labelled as simulated.
6. Inspect the whole shape plus each district in driving view; test desktop, **844×390**, **640×360** and **390×844**. Check actual HUD, notice, map and control bounds during motion and feedback, not only initial screenshots. Shared UI/camera defects go to the integrator rather than being patched outside lane ownership.
7. Verify shape and production routes, loading/error handling, high/low/reduced motion, compatible replay behavior and incompatible-rules rejection through the supplied contract. Check level exit/disposal and no accidental assets/effects in a baseline route. The integrator owns the combined all-map regression.
8. Record shader/console/page/asset errors and drawn-resource maxima with the served build identifiers. Hidden runs do **not** certify foreground frame pacing, audible quality, physical gamepad/mobile behavior or OS-lock operation; leave each unperformed check explicitly unverified.

## Scope limits and final evidence

Use the common scope: continuous magnetic road, existing ship/controls, no new gameplay systems or Nacre flight dependency. Only the user supplies final human approval.

Keep `STATUS.json` to current phase, counter/latest scores, build/checks and open issues. Use this handoff for a short current integration note and, during active review, a compact round table. Keep asset provenance with the assets. Do not create separate implementation/performance/integration/critique reports; raw evidence stays in ignored `.experiments/`. After merge, fold lasting decisions into source/architecture and retire the completed handoff/history.

At handback, provide the playable production and shape URLs, controls/section starts, exact source revision or patch manifest/checksum, final served JS/CSS identifiers, tests/lint/build/browser results, measured budgets, critic history and honest limitations. Leave review servers to the launching integrator, report browser CLOSED, and keep `humanApproved: false` until the user actually approves this map. Final human review is the only planned human gate; reaching the overnight end state does not itself mean approval.

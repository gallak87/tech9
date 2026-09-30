# Map 6 — Cindercoil: overnight production handoff

> Black volcanic terraces, slow lava curtains and a glowing caldera surround broad heat-shield ceramic plates with heavy cantilever edge walls. Descending gravity bowls alternate with sharp braking shelves and a rising corkscrew, creating a forceful rhythm of compression and release.

## Assignment and authority

**Goal:** Finish a complete volcanic circuit with broad heat-shield ceramic raceway, a forceful sequence of bowls and braking shelves, and a readable rising corkscrew, then deliver the verified candidate through one independent critic loop and final human review.

Read this brief, [the common execution rules](../../EXPANSION_HANDOFF.md) and the [frozen level contract](../../EXPANSION_LEVEL_CONTRACT.md) when available. Consult architecture/art sections only as needed; do not preload the full roadmap or other lane briefs. Use the integrator’s verified base/API.

Own only `src/levels/cindercoil/**`, `public/assets/levels/cindercoil/**`, `tools/expansion-cindercoil-*.mjs` and `docs/expansion/cindercoil/**` in the assigned isolated worktree. Shared core, renderer, camera, UI, physics, race, settings, package/config and other levels are outside this lane. Request necessary contract changes from the launching integrator recorded in `docs/expansion/LAUNCH_STATE.json`; continue independent owned work while they are resolved. No copied runtime, private launcher or alternate shared implementation.

Planned dev/preview ports: **5205/5206**. Production route: `http://127.0.0.1:5206/?level=cindercoil`; shape route adds `&review=shape`. These are reservations, not evidence of running servers. The launching integrator in `docs/expansion/LAUNCH_STATE.json` owns server assignment and GPU capture scheduling. Coordinate before a hidden browser run; report the exact served build and browser CLOSED afterward. Do not touch the historical Gate 4 servers or ping those sessions.

## Defining interactions and spectacle

- **An erupting route:** clearly signalled lava surges temporarily cover parts of the deck, making you choose between a tight protected line and a faster exposed line.

- **Volcanic launch:** a broken spiral ramp sends you across an active vent; timing the approach between eruptions determines how cleanly you cross.

- **Caldera rupture:** A caldera wall ruptures, sending thick lava cascades into the basin beneath you, with cooling crust breaking into rafts.

Keep descending bowls, braking shelves and the rising corkscrew. Spread surge choices across the bowl/curtain reaches, integrate the broken-ramp vent launch into the coil sequence with an explicit landing, and reveal the caldera rupture from several districts. Do not confine all new action to one short segment.

## World and driving direction

A vast natural caldera surrounds heavy ivory, charcoal and oxidized-red ceramic infrastructure. Slow molten curtains provide scale and warmth; cold ash layers and readable shadow faces prevent the world from becoming an orange bloom wall. The tabled industrial energy-complex concept stays tabled.

Start near 4.5 km with a constant 30 m usable width and about 260 m of vertical range. Alternate 300–550 m loaded descending arcs with obvious 100–200 m braking shelves; vary the exit directions instead of repeating one bowl. Give the rising 360° corkscrew a long, smooth transport frame and clear entry/exit. Grounded sections remain magnetic; explicitly authored vent jumps and telegraphed lava-contact hazards belong to this level’s runtime.

| Initial lap interval | District             | Geometry, composition and gameplay purpose                                                                                                                                   |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–11%                | **Ashgate Shelf**    | A short rising approach reveals the caldera rim and enters an early bending descent. Angular ceramic buttresses and a split basalt arch establish heavy construction.        |
| 11–25%               | **Ember Bowl**       | A broad descending bank turns around a quiet molten lake. Successive terrace edges establish speed and depth while the outside wall stays low enough to read the next exit.  |
| 25–39%               | **Basalt Teeth**     | Two offset braking shelves cross black columnar formations. The first tight exit points toward a distinctive breached rock tooth so players can learn the sequence.          |
| 39–54%               | **Curtain Reach**    | A long lateral view passes multiple slow lava curtains at different depths. A smooth S and short acceleration stretch keep the road active while giving the spectacle space. |
| 54–70%               | **Furnace Coil**     | A rising continuous corkscrew winds around a hollow cooled lava tower. Open cantilever supports remain outside the racing and camera envelopes throughout the roll.          |
| 70–85%               | **Blackglass Crown** | A high banked shelf crosses obsidian terraces under dark drifting ash. Cooler polished inserts and distant warm lake reflections create tonal relief after the coil.         |
| 85–100%              | **Cinder Return**    | A measured descent with one braking turn returns to Ashgate. The original arch and tiered support foundations become familiar markers, with a brief stable run to the line.  |

## Raceway construction and whole-world finish

- Running surface: broad interlocking white and charcoal heat-shield plates with restrained expansion joints, thick beveled edges and selected oxide-red replacement cassettes. Show ceramic roughness and construction; avoid asphalt and rows of tiny glowing rectangles.
- Boundaries: heavy cantilever edge walls rise from offset external supports, with a low continuous inner curb and slotted upper masses. Shape their outer silhouette like kiln shelves, keeping corners readable through deliberate openings.
- Underside/supports: deep ceramic box keels, cooling slots, basalt-founded piers and wide bracket arms. Foundations meet stable rock terraces; the coil is visibly suspended from its central tower without braces crossing the path.
- District variation: pale heat plates above lava, darker glazed panels at Blackglass Crown and red inset reinforcement through the coil. The full road assembly responds to warm reflected light without saturating to featureless red.

- Hero landmarks: the caldera lake, layered lava curtains and hollow coil tower. Curtains originate at believable channels and terminate in pools; no floating flat orange sheets.
- Ordinary stretches: broken lava tubes, cooled ropy flows, basalt columns of varied cluster shapes, ash drifts and terrain terraces. Give shadowed near rocks edge definition and multiple middle-distance silhouettes so the world stays rich away from lava.
- Lighting: Use lava as a motivated warm light source against cool ash sky and darker basalt shelters. Surges and rupture should visibly affect nearby surfaces without blowing out ceramic plates or hiding the safe line. Give shaded shelves readable rock depth and cooling relief; transitions into exposed bowls must retain the ship and braking markers.

**Reject these shortcuts:** Reject orange fog that erases the route, generic factory scenery, unsupported bridge masses, repeated identical bowls, corkscrew camera intersections, or heat/smoke that secretly changes handling. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Future shared pickup/boost locations

Mark safe launch-approach boost/refill locations, preparation shelves before repeated surge exposure, and recovery points after the vent landing. Flag where a future shared protection/recovery pickup could help without implementing it or converting hazards into harmless scenery. Record actual built-route coordinates using the [shared placement-note format](../../EXPANSION_HANDOFF.md#future-shared-pickup-and-boost-placement), without implementing those systems or replacing the approved level mechanics.

## Presets and resource discipline

High may add slow lava-surface detail, sparse ember particles and limited localized heat distortion. Low retains the large lava silhouettes, terrain layers, ceramic material blocks and lighting contrast while reducing particles and secondary molten detail. Reduced motion disables distortion and swirling ember fields; slow lava flow can become a static illuminated surface.

The [common brief](../../EXPANSION_HANDOFF.md) defines resource limits, ownership, provenance and high/low verification.

## Production and review

Use the [scene-imagegen → Blender workflow](../../EXPANSION_HANDOFF.md#asset-workflow-imagegen-to-blender) for major assets: The rupturing caldera wall, volumetric lava channels/cascades and crust rafts, and broken vent-launch structure are major scene-to-Blender subjects. Use reusable rock/ceramic families for ordinary stretches; avoid flat orange sheets and visibly crude hero silhouettes. Keep all asset iteration inside the single eight-round level critic budget; simple procedural parts need no separate concept/model loop.

Follow the [shared production/critic loop](../../EXPANSION_HANDOFF.md): internal shape checks, full production, one independent counter capped at eight, then final human review. The initial critique counts; stop at the first verified pass or cap. Use the level-specific checks below alongside shared control/lifecycle regressions.

## Acceptance on the actual production build

1. Drive both protected and exposed surge lines with real input; verify warning, timing, declared contact consequence and clear safe boundaries.
2. Traverse the corkscrew and volcanic launch, including imperfect eruption timing; check grounded frames, actual flight/landing and recovery/checkpoint order.
3. Inspect the caldera rupture, thick cascades and crust rafts from near/middle/far views; verify reset/pause/replay of hazard and spectacle state.
4. Check warm bowls/cool shelves in high/low/reduced motion and document future boost/protection markers plus any difficult unsupported section.
5. Across representative starts, prove driver-left/right steering, throttle, brake, airbrake, manual boost, rail feedback, slope rest, pause/resume, reset and valid ordered checkpoint progression. Use real keyboard inputs for motion; deterministic starts are setup, never autopilot evidence. Fast numerical full-lap checks are complementary and must be labelled as simulated.
6. Inspect the whole shape plus each district in driving view; test desktop, **844×390**, **640×360** and **390×844**. Check actual HUD, notice, map and control bounds during motion and feedback, not only initial screenshots. Shared UI/camera defects go to the integrator rather than being patched outside lane ownership.
7. Verify shape and production routes, loading/error handling, high/low/reduced motion, compatible replay behavior and incompatible-rules rejection through the supplied contract. Check level exit/disposal and no accidental assets/effects in a baseline route. The integrator owns the combined all-map regression.
8. Record shader/console/page/asset errors and drawn-resource maxima with the served build identifiers. Hidden runs do **not** certify foreground frame pacing, audible quality, physical gamepad/mobile behavior or OS-lock operation; leave each unperformed check explicitly unverified.

## Scope limits and final evidence

Build the named level interactions and spectacle under the [shared runtime/ownership boundaries](../../EXPANSION_HANDOFF.md#gameplay-and-presentation-boundaries). Preserve the existing ship, controls and default handling outside declared local effects; coordinate reusable runtime support with the integrator. Shared pickup/boost expansion remains placement notes only. Only the user supplies final human approval.

Keep `STATUS.json` to current phase, counter/latest scores, build/checks and open issues. Use this handoff for a short current integration note and, during active review, a compact round table. Keep asset provenance with the assets. Do not create separate implementation/performance/integration/critique reports; raw evidence stays in ignored `.experiments/`. After merge, fold lasting decisions into source/architecture and retire the completed handoff/history.

At handback, provide the playable production and shape URLs, controls/section starts, exact source revision or patch manifest/checksum, final served JS/CSS identifiers, tests/lint/build/browser results, measured budgets, critic history and honest limitations. Leave review servers to the launching integrator, report browser CLOSED, and keep `humanApproved: false` until the user actually approves this map. Final human review is the only planned human gate; reaching the overnight end state does not itself mean approval.

# Map 4 — Vesper Canopy: overnight production handoff

> Race through a colossal nocturnal alien forest, with amber resin decks grown into braided branches and tall hooked petal barriers beneath luminous leaves. Tight trunk slaloms open into banked canopy sweepers before a plunging root tunnel, emphasizing precise exits and a living, organic raceway.

## Assignment and authority

**Goal:** Finish a complete, drivable nocturnal alien forest circuit whose grown resin raceway, immense living canopy and root descent remain distinctive through an ordinary lap, then deliver the verified candidate through one independent critic loop and final human review.

Launch remains on hold for final Nacre completion/review and a verified shared foundation. The [integrator handoff](../../EXPANSION_INTEGRATOR_HANDOFF.md) owns readiness and launch; this brief does not start work.

Read this brief, [the common execution rules](../../EXPANSION_HANDOFF.md) and the [frozen level contract](../../EXPANSION_LEVEL_CONTRACT.md) when available. Consult architecture/art sections only as needed; do not preload the full roadmap or other lane briefs. Use the integrator’s verified base/API.

Own only `src/levels/vesper/**`, `public/assets/levels/vesper/**`, `tools/expansion-vesper-*.mjs` and `docs/expansion/vesper/**` in the assigned isolated worktree. Shared core, renderer, camera, UI, physics, race, settings, package/config and other levels are outside this lane. Request necessary contract changes from the launching integrator recorded in `docs/expansion/LAUNCH_STATE.json`; continue independent owned work while they are resolved. No copied runtime, private launcher or alternate shared implementation.

Planned dev/preview ports: **5201/5202**. Production route: `http://127.0.0.1:5202/?level=vesper`; shape route adds `&review=shape`. These are reservations, not evidence of running servers. The launching integrator in `docs/expansion/LAUNCH_STATE.json` owns server assignment and GPU capture scheduling. Coordinate before a hidden browser run; report the exact served build and browser CLOSED afterward. Do not touch the historical Gate 4 servers or ping those sessions.

## World and driving direction

Warm amber resin against ink-blue forest depth; enormous leaves carry cool bioluminescent veins, while pale sapwood and tiny warm maintenance lights make construction readable. This is a living transport system grown into a forest, with deliberate load paths and access fittings rather than random branches pasted around a generic road.

Start near 4.6 km with a constant 28 m usable magnetic width and roughly 180 m of vertical range. Tune from actual controls at assistance 0.3: tight trunk turns must have visible exits, canopy arcs should invite committed speed, and the root plunge must release into a readable recovery bend. Engage within the first 250 m; use brief 150–250 m breaths, not long straight padding. The following normalized intervals are an initial allocation, not seven separate tracks.

| Initial lap interval | District             | Geometry, composition and gameplay purpose                                                                                                                                                   |
| -------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–11%                | **Saplight Landing** | A shallow rising S enters the forest immediately. Braided timber buttresses, translucent amber deck shoulders and a split seedpod station establish the grown-road language at start/finish. |
| 11–25%               | **Pillar Grove**     | Offset trunk slaloms demand braking and precise exits. Three immense trunks differ in taper, wounds and root collars; visible open spaces between them preserve anticipation.                |
| 25–40%               | **Lantern Crown**    | A 40–60° banked canopy sweeper opens above luminous leaves. The whole course is briefly visible through a crown break, with seed lanterns and fine branch layers providing scale.            |
| 40–55%               | **Bloomspan**        | A continuous resin bridge crosses a forest ravine beneath a monumental hanging flower. Broader milky sap panels and petal barriers change the material rhythm without losing amber identity. |
| 55–70%               | **Rootfall**         | A steep magnetic descent coils beside exposed roots into a tunnel. Root ribs open at intervals so this is a plunge through a world, not a featureless brown tube.                            |
| 70–85%               | **Mycelium Vault**   | Two linked low bends pass tall fungal fans, shallow dark pools and veined resin floor inserts. Cool fungal light defines the road edge while warm sap remains visible beneath the ship.      |
| 85–100%              | **Dawnscar Return**  | A rising offset bend escapes through a torn tree crown and settles toward the grid. A pale distant atmosphere slit and the original seedpod station orient the final approach.               |

## Raceway construction and whole-world finish

- Running surface: broad cast-resin panels with a visible internal layered structure, polished travel bands and milky sap reinforcement near joints. Show substantial amber color over actual surfaces, not only thin emissive lines; no asphalt grain, tire wear or city expansion-seal palette.
- Boundaries: tall hooked petals lean outward from a low continuous protective curb. Vary petals between folded hard sap, pale inner tissue and open ribbed backs; put the largest hooks beyond the chase-camera corridor.
- Underside/supports: paired braided load roots meet trunks or ravine walls, resin tension ribs carry bridge spans, and root sockets visibly transfer loads. Small clamps and maintenance sleeves make the grown infrastructure intentional.
- District variation: honey-clear canopy decks, milkier bloom panels and darker smoke-amber root passages. Keep the same joint logic and curving petal family, with uninterrupted warm direction guidance through cool-lit districts.

- Hero landmarks: the three-trunk gate, suspended enormous flower, and split seedpod station must each have an approach, drive-by and departing silhouette. The flower should dwarf the roadway without filling every frame.
- Ordinary stretches: authored trunk families, root shelves, young shoots, layered leaf crowns, fungal clusters and occasional maintenance nests. Populate foreground, middle canopy and distant forest at every district; use instanced families with meaningful silhouette variation.
- Light and sky: a luminous high canopy opens onto blue-violet night and a soft horizon. Leaf veining illuminates nearby tissue; warm fixtures expose resin thickness and the Kestrel shape without recoloring the ship. Preserve negative spaces between crowns.

**Reject these shortcuts:** Reject uniform trunk cylinders, a black forest beyond one flower, asphalt with green edges, foliage clipping the racing line, root-tunnel camera occlusion, or emissive leaves that erase road contrast. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Presets and resource discipline

High may add local leaf translucency, sparse drifting spores and slow localized frond motion. Low keeps every landmark, major leaf silhouette, deck thickness and road edge while reducing small foliage and secondary lights; do not turn the whole forest into billboards. Reduced motion freezes large frond sweeps and suppresses drifting pollen, with steady bioluminescence and no rhythmic full-screen pulse.

The [common brief](../../EXPANSION_HANDOFF.md) defines resource limits, ownership, provenance and high/low verification.

## Production and review

Follow the [shared production/critic loop](../../EXPANSION_HANDOFF.md): internal shape checks, full production, one independent counter capped at eight, then final human review. The initial critique counts; stop at the first verified pass or cap. Use the level-specific checks below alongside shared control/lifecycle regressions.

## Acceptance on the actual production build

1. Run a real-key trunk slalom with braking, driver-left/right steering and an airbrake correction; show at least one recoverable bad line, not just a centred scenario.
2. Boost into the canopy arc and brake before Bloomspan; verify petal clearances, road direction and the true continuous deck from chase and oblique views.
3. Descend Rootfall into Mycelium Vault at normal and boosted approach speed; inspect frame continuity, camera clearance, road visibility and stable rest on the slope.
4. Inspect ordinary grove, crown and root-vault stretches at high/low and reduced motion. Forest depth, amber road identity and distinct barrier silhouette must survive all presets.
5. Across representative starts, prove driver-left/right steering, throttle, brake, airbrake, manual boost, rail feedback, slope rest, pause/resume, reset and valid ordered checkpoint progression. Use real keyboard inputs for motion; deterministic starts are setup, never autopilot evidence. Fast numerical full-lap checks are complementary and must be labelled as simulated.
6. Inspect the whole shape plus each district in driving view; test desktop, **844×390**, **640×360** and **390×844**. Check actual HUD, notice, map and control bounds during motion and feedback, not only initial screenshots. Shared UI/camera defects go to the integrator rather than being patched outside lane ownership.
7. Verify shape and production routes, loading/error handling, high/low/reduced motion, compatible replay behavior and incompatible-rules rejection through the supplied contract. Check level exit/disposal and no accidental assets/effects in a baseline route. The integrator owns the combined all-map regression.
8. Record shader/console/page/asset errors and drawn-resource maxima with the served build identifiers. Hidden runs do **not** certify foreground frame pacing, audible quality, physical gamepad/mobile behavior or OS-lock operation; leave each unperformed check explicitly unverified.

## Scope limits and final evidence

Use the common scope: continuous magnetic road, existing ship/controls, no new gameplay systems or Nacre flight dependency. Only the user supplies final human approval.

Keep `STATUS.json` to current phase, counter/latest scores, build/checks and open issues. Use this handoff for a short current integration note and, during active review, a compact round table. Keep asset provenance with the assets. Do not create separate implementation/performance/integration/critique reports; raw evidence stays in ignored `.experiments/`. After merge, fold lasting decisions into source/architecture and retire the completed handoff/history.

At handback, provide the playable production and shape URLs, controls/section starts, exact source revision or patch manifest/checksum, final served JS/CSS identifiers, tests/lint/build/browser results, measured budgets, critic history and honest limitations. Leave review servers to the launching integrator, report browser CLOSED, and keep `humanApproved: false` until the user actually approves this map. Final human review is the only planned human gate; reaching the overnight end state does not itself mean approval.

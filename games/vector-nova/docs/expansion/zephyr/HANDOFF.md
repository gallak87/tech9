# Map 8 — Zephyr Basilica: overnight production handoff

> Drift among cathedral-sized stone islands and waterfalls suspended inside a pastel gas giant, on woven graphite bridges with bronze keels and tall sail-like side structures. Wide banked arcs feed offset bridge transitions and a spiral climb through a cloud opening; wind is visual atmosphere until a handling effect is separately approved.

## Assignment and authority

**Goal:** Finish a complete floating-island circuit with woven graphite and bronze raceway, cathedral-scale stone forms and a spiral cloud ascent, then deliver the verified candidate through one independent critic loop and final human review.

Read this brief, [the common execution rules](../../EXPANSION_HANDOFF.md) and the [frozen level contract](../../EXPANSION_LEVEL_CONTRACT.md) when available. Consult architecture/art sections only as needed; do not preload the full roadmap or other lane briefs. Use the integrator’s verified base/API.

Own only `src/levels/zephyr/**`, `public/assets/levels/zephyr/**`, `tools/expansion-zephyr-*.mjs` and `docs/expansion/zephyr/**` in the assigned isolated worktree. Shared core, renderer, camera, UI, physics, race, settings, package/config and other levels are outside this lane. Request necessary contract changes from the launching integrator recorded in `docs/expansion/LAUNCH_STATE.json`; continue independent owned work while they are resolved. No copied runtime, private launcher or alternate shared implementation.

Planned dev/preview ports: **5209/5210**. Production route: `http://127.0.0.1:5210/?level=zephyr`; shape route adds `&review=shape`. These are reservations, not evidence of running servers. The launching integrator in `docs/expansion/LAUNCH_STATE.json` owns server assignment and GPU capture scheduling. Coordinate before a hidden browser run; report the exact served build and browser CLOSED afterward. Do not touch the historical Gate 4 servers or ping those sessions.

## Defining interactions and spectacle

- **Cathedral traversal:** race through a shattered rose window, wall-ride around the nave and launch across a missing floor into the next floating chapel.

- **Waterfall crossings:** punch through water curtains immediately before selected jumps. Water streams off the camera and ship; lighting and visible exit markers help you commit to the landing.

- **Falling cathedral:** A cathedral island slowly tilts or sheds a massive tower into the clouds, pulling its waterfall into a long trailing arc. Keep the racing surface predictable during the event.

Take the route through cathedral interiors rather than merely around islands. Spread rose-window/nave/chapel traversal through the archipelago, integrate actual curtain crossings and selected jumps into Falls Between, and retain the cloud spiral as another distinct passage. Stage the falling tower and trailing waterfall across approach and departure views.

## World and driving direction

Pastel atmospheric bands, vast weathered stone islands and silver waterfalls surround dark woven bridges carried by bronze keels. The floating world has a coherent gravity-defying construction language and deep open vistas; wind and waterfall spray are visual atmosphere, not new forces.

Start near 4.9 km with a constant 32 m usable width and roughly 300 m of climb/descent. Wide banked arcs feed offset bridge transitions that need steering rather than automatic alignment, with a long spiral ascent as the central memory. Keep vertical and lateral transitions smooth and place short calm shelves before the most demanding turns. Mix supported bridges with explicitly authored cathedral/waterfall jumps and readable landing shelves.

| Initial lap interval | District              | Geometry, composition and gameplay purpose                                                                                                                                                         |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–12%                | **Narthex Mooring**   | A gentle climbing S leaves a sheltered stone landing. The first dark woven bridge points toward a distant cathedral island and bronze keel silhouette.                                             |
| 12–26%               | **Sailcourt Arc**     | A broad banked arc threads tall sail-shaped edge structures. Open cloud depth and a pair of small hanging islands establish exposure without filling the sky with repeated rocks.                  |
| 26–40%               | **Falls Between**     | Offset bridges and selected jumps pass beneath, beside and through enormous waterfalls. Stone catch basins and distant disappearing spray make the falls feel rooted in the floating architecture. |
| 40–56%               | **Choir Archipelago** | Linked broad turns weave through a cluster of weathered cathedral islands. Each island offers a distinct arch, stair or broken terrace silhouette, with readable gaps for upcoming road.           |
| 56–73%               | **Cloudspire Ascent** | A smooth climbing spiral passes a tall central stone needle and exits a cloud opening. Lateral support arms attach to the keel without crossing the road or camera path.                           |
| 73–87%               | **Halo Terrace**      | A high banked sweep opens onto layered pastel gas bands above the cloud deck. A monumental broken halo of stone frames a brief sightline over the earlier bridges.                                 |
| 87–100%              | **Bronzewake Return** | A stepped descending curve reaches the starting island. Warm bronze understructure, small gardens of mineral reeds and the original mooring provide familiar closing detail.                       |

## Raceway construction and whole-world finish

- Running surface: broad woven graphite plates with coarse readable structural weave and smooth central induction bands. Bronze seam ferrules and selected pale fabric-like tension inserts create large-scale material variation; avoid asphalt grain disguised as weave.
- Boundaries: tall sail-shaped side structures rise from a compact continuous curb, with alternating solid ribs and open stretched panels. Their outward sweep and spacing preserve the next corner and chase-camera envelope.
- Underside/supports: deep bronze keels, tension ties and articulated stone-mounted saddles communicate how bridges span the islands. Floating islands expose shaped undersides with strata, roots of architecture and consistent suspension motifs.
- District variation: graphite-heavy sheltered bridges, bronze-rich ascent structure and pale tension panels on Halo Terrace. Use whole panel blocks and support changes rather than colored light strips alone.

- Hero landmarks: the cathedral island, Cloudspire needle and broken stone halo. Waterfalls supply a second scale system, with visible sources, paths and distant terminations.
- Ordinary stretches: terraced small islands, eroded openings, suspended stone shards, reed gardens and layered cloud shelves. Compose near bridge hardware, middle islands and distant atmospheric bands all around the route, including its inward-facing views.
- Lighting: Cathedral interiors should be substantially darker than the pastel exterior, with rose-window light, broken-roof shafts and restrained local fill exposing stone depth, road and ship. Build convincing light transitions through windows and waterfall curtains; backlit water, spray and wet surfaces must not erase the landing. The cloud ascent and return should have different atmospheric depth without becoming opaque fog.

**Reject these shortcuts:** Reject pastel fog replacing geometry, identical floating rocks, asphalt on an unrelated bridge, sails filling the camera, water curtains that erase the next landing, or unauthorized wind physics. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Future shared pickup/boost locations

Mark sheltered boost/refill setup points before waterfall/chapel jumps, recovery shelves after landings and a possible shared visibility/protection aid before the hardest water curtain. Record intended benefits only; keep the cathedral/waterfall experience even if it is demanding without later items. Record actual built-route coordinates using the [shared placement-note format](../../EXPANSION_HANDOFF.md#future-shared-pickup-and-boost-placement), without implementing those systems or replacing the approved level mechanics.

## Presets and resource discipline

High may add soft local waterfall mist and slow sail flex beyond the collision envelope. Low keeps the large falls, island openings, bridge structure and cloud depth while reducing mist and minor hanging fragments. Reduced motion freezes sail flex and moving cloud texture; no camera sway or procedural wind force. Avoid full-screen opaque cloud transitions.

The [common brief](../../EXPANSION_HANDOFF.md) defines resource limits, ownership, provenance and high/low verification.

## Production and review

Use the [scene-imagegen → Blender workflow](../../EXPANSION_HANDOFF.md#asset-workflow-imagegen-to-blender) for major assets: The traversable cathedral/nave/rose window, adjacent chapels, large waterfall masses and falling tower/island assembly are major scene-to-Blender subjects. Use a small authored kit for secondary islands and bridge hardware; hero water must have convincing volume, layered breakup and scale. Keep all asset iteration inside the single eight-round level critic budget; simple procedural parts need no separate concept/model loop.

Follow the [shared production/critic loop](../../EXPANSION_HANDOFF.md): internal shape checks, full production, one independent counter capped at eight, then final human review. The initial critique counts; stop at the first verified pass or cap. Use the level-specific checks below alongside shared control/lifecycle regressions.

## Acceptance on the actual production build

1. Drive through the rose window, nave wall ride and chapel jump using actual input; verify architectural/camera clearance and a genuine flight/landing transition.
2. Cross waterfalls into selected jumps with existing manual boost; inspect wet camera/ship effects, exit cues, imperfect approaches and recovery.
3. Inspect the tilting island or falling tower and trailing waterfall while racing; verify the supported racing surface stays predictable and event reset/pause/replay works.
4. Check dark interiors, bright windows and backlit water in high/low/reduced motion; verify future aid coordinates and honestly record no-pickup difficulty.
5. Across representative starts, prove driver-left/right steering, throttle, brake, airbrake, manual boost, rail feedback, slope rest, pause/resume, reset and valid ordered checkpoint progression. Use real keyboard inputs for motion; deterministic starts are setup, never autopilot evidence. Fast numerical full-lap checks are complementary and must be labelled as simulated.
6. Inspect the whole shape plus each district in driving view; test desktop, **844×390**, **640×360** and **390×844**. Check actual HUD, notice, map and control bounds during motion and feedback, not only initial screenshots. Shared UI/camera defects go to the integrator rather than being patched outside lane ownership.
7. Verify shape and production routes, loading/error handling, high/low/reduced motion, compatible replay behavior and incompatible-rules rejection through the supplied contract. Check level exit/disposal and no accidental assets/effects in a baseline route. The integrator owns the combined all-map regression.
8. Record shader/console/page/asset errors and drawn-resource maxima with the served build identifiers. Hidden runs do **not** certify foreground frame pacing, audible quality, physical gamepad/mobile behavior or OS-lock operation; leave each unperformed check explicitly unverified.

## Scope limits and final evidence

Build the named level interactions and spectacle under the [shared runtime/ownership boundaries](../../EXPANSION_HANDOFF.md#gameplay-and-presentation-boundaries). Preserve the existing ship, controls and default handling outside declared local effects; coordinate reusable runtime support with the integrator. Shared pickup/boost expansion remains placement notes only. Only the user supplies final human approval.

Keep `STATUS.json` to current phase, counter/latest scores, build/checks and open issues. Use this handoff for a short current integration note and, during active review, a compact round table. Keep asset provenance with the assets. Do not create separate implementation/performance/integration/critique reports; raw evidence stays in ignored `.experiments/`. After merge, fold lasting decisions into source/architecture and retire the completed handoff/history.

At handback, provide the playable production and shape URLs, controls/section starts, exact source revision or patch manifest/checksum, final served JS/CSS identifiers, tests/lint/build/browser results, measured budgets, critic history and honest limitations. Leave review servers to the launching integrator, report browser CLOSED, and keep `humanApproved: false` until the user actually approves this map. Final human review is the only planned human gate; reaching the overnight end state does not itself mean approval.

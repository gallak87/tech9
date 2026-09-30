# Map 8 — Zephyr Basilica: overnight production handoff

> Drift among cathedral-sized stone islands and waterfalls suspended inside a pastel gas giant, on woven graphite bridges with bronze keels and tall sail-like side structures. Wide banked arcs feed offset bridge transitions and a spiral climb through a cloud opening; wind is visual atmosphere until a handling effect is separately approved.

## Assignment and authority

**Goal:** Finish a complete floating-island circuit with woven graphite and bronze raceway, cathedral-scale stone forms and a spiral cloud ascent, then deliver the verified candidate through one independent critic loop and final human review.

Read this brief, [the common execution rules](../../EXPANSION_HANDOFF.md) and the [frozen level contract](../../EXPANSION_LEVEL_CONTRACT.md) when available. Consult architecture/art sections only as needed; do not preload the full roadmap or other lane briefs. Use the integrator’s verified base/API.

Own only `src/levels/zephyr/**`, `public/assets/levels/zephyr/**`, `tools/expansion-zephyr-*.mjs` and `docs/expansion/zephyr/**` in the assigned isolated worktree. Shared core, renderer, camera, UI, physics, race, settings, package/config and other levels are outside this lane. Request necessary contract changes from the launching integrator recorded in `docs/expansion/LAUNCH_STATE.json`; continue independent owned work while they are resolved. No copied runtime, private launcher or alternate shared implementation.

Planned dev/preview ports: **5209/5210**. Production route: `http://127.0.0.1:5210/?level=zephyr`; shape route adds `&review=shape`. These are reservations, not evidence of running servers. The launching integrator in `docs/expansion/LAUNCH_STATE.json` owns server assignment and GPU capture scheduling. Coordinate before a hidden browser run; report the exact served build and browser CLOSED afterward. Do not touch the historical Gate 4 servers or ping those sessions.

## World and driving direction

Pastel atmospheric bands, vast weathered stone islands and silver waterfalls surround dark woven bridges carried by bronze keels. The floating world has a coherent gravity-defying construction language and deep open vistas; wind and waterfall spray are visual atmosphere, not new forces.

Start near 4.9 km with a constant 32 m usable width and roughly 300 m of climb/descent. Wide banked arcs feed offset bridge transitions that need steering rather than automatic alignment, with a long spiral ascent as the central memory. Keep vertical and lateral transitions smooth and place short calm shelves before the most demanding turns. Every crossing is a continuous magnetic deck.

| Initial lap interval | District              | Geometry, composition and gameplay purpose                                                                                                                                               |
| -------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–12%                | **Narthex Mooring**   | A gentle climbing S leaves a sheltered stone landing. The first dark woven bridge points toward a distant cathedral island and bronze keel silhouette.                                   |
| 12–26%               | **Sailcourt Arc**     | A broad banked arc threads tall sail-shaped edge structures. Open cloud depth and a pair of small hanging islands establish exposure without filling the sky with repeated rocks.        |
| 26–40%               | **Falls Between**     | Offset continuous bridges cross beneath and beside enormous waterfalls. Stone catch basins and distant disappearing spray make the falls feel rooted in the floating architecture.       |
| 40–56%               | **Choir Archipelago** | Linked broad turns weave through a cluster of weathered cathedral islands. Each island offers a distinct arch, stair or broken terrace silhouette, with readable gaps for upcoming road. |
| 56–73%               | **Cloudspire Ascent** | A smooth climbing spiral passes a tall central stone needle and exits a cloud opening. Lateral support arms attach to the keel without crossing the road or camera path.                 |
| 73–87%               | **Halo Terrace**      | A high banked sweep opens onto layered pastel gas bands above the cloud deck. A monumental broken halo of stone frames a brief sightline over the earlier bridges.                       |
| 87–100%              | **Bronzewake Return** | A stepped descending curve reaches the starting island. Warm bronze understructure, small gardens of mineral reeds and the original mooring provide familiar closing detail.             |

## Raceway construction and whole-world finish

- Running surface: broad woven graphite plates with coarse readable structural weave and smooth central induction bands. Bronze seam ferrules and selected pale fabric-like tension inserts create large-scale material variation; avoid asphalt grain disguised as weave.
- Boundaries: tall sail-shaped side structures rise from a compact continuous curb, with alternating solid ribs and open stretched panels. Their outward sweep and spacing preserve the next corner and chase-camera envelope.
- Underside/supports: deep bronze keels, tension ties and articulated stone-mounted saddles communicate how bridges span the islands. Floating islands expose shaped undersides with strata, roots of architecture and consistent suspension motifs.
- District variation: graphite-heavy sheltered bridges, bronze-rich ascent structure and pale tension panels on Halo Terrace. Use whole panel blocks and support changes rather than colored light strips alone.

- Hero landmarks: the cathedral island, Cloudspire needle and broken stone halo. Waterfalls supply a second scale system, with visible sources, paths and distant terminations.
- Ordinary stretches: terraced small islands, eroded openings, suspended stone shards, reed gardens and layered cloud shelves. Compose near bridge hardware, middle islands and distant atmospheric bands all around the route, including its inward-facing views.
- Light and sky: broad peach, lavender and pale mint gas bands with cool shadow fill. Sunlight must reveal dark weave and warm keel metal; the cloud ascent changes depth and visibility without hiding the racing surface.

**Reject these shortcuts:** Reject pastel fog replacing geometry, identical floating rocks, asphalt on an unrelated bridge, sails filling the camera, opaque waterfall sheets across the road, or unauthorized wind physics. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Presets and resource discipline

High may add soft local waterfall mist and slow sail flex beyond the collision envelope. Low keeps the large falls, island openings, bridge structure and cloud depth while reducing mist and minor hanging fragments. Reduced motion freezes sail flex and moving cloud texture; no camera sway or procedural wind force. Avoid full-screen opaque cloud transitions.

The [common brief](../../EXPANSION_HANDOFF.md) defines resource limits, ownership, provenance and high/low verification.

## Production and review

Follow the [shared production/critic loop](../../EXPANSION_HANDOFF.md): internal shape checks, full production, one independent counter capped at eight, then final human review. The initial critique counts; stop at the first verified pass or cap. Use the level-specific checks below alongside shared control/lifecycle regressions.

## Acceptance on the actual production build

1. Drive Sailcourt and offset Falls Between approaches with actual steering, braking and boost; confirm no wind force and no invisible handling modifier appears.
2. Climb Cloudspire at normal and boosted speeds, brake to rest on its grade, and resume; inspect frame continuity, camera clearance and support placement.
3. Check waterfall and cloud-entry views in high/low and reduced motion; the road, edge silhouettes and Kestrel must remain visible through the atmosphere.
4. Inspect the inward-facing ordinary bridge stretches and the return descent, not only outward hero vistas; verify sky/island coverage and absence of floating unsupported track joints.
5. Across representative starts, prove driver-left/right steering, throttle, brake, airbrake, manual boost, rail feedback, slope rest, pause/resume, reset and valid ordered checkpoint progression. Use real keyboard inputs for motion; deterministic starts are setup, never autopilot evidence. Fast numerical full-lap checks are complementary and must be labelled as simulated.
6. Inspect the whole shape plus each district in driving view; test desktop, **844×390**, **640×360** and **390×844**. Check actual HUD, notice, map and control bounds during motion and feedback, not only initial screenshots. Shared UI/camera defects go to the integrator rather than being patched outside lane ownership.
7. Verify shape and production routes, loading/error handling, high/low/reduced motion, compatible replay behavior and incompatible-rules rejection through the supplied contract. Check level exit/disposal and no accidental assets/effects in a baseline route. The integrator owns the combined all-map regression.
8. Record shader/console/page/asset errors and drawn-resource maxima with the served build identifiers. Hidden runs do **not** certify foreground frame pacing, audible quality, physical gamepad/mobile behavior or OS-lock operation; leave each unperformed check explicitly unverified.

## Scope limits and final evidence

Use the common scope: continuous magnetic road, existing ship/controls, no new gameplay systems or Nacre flight dependency. Only the user supplies final human approval.

Keep `STATUS.json` to current phase, counter/latest scores, build/checks and open issues. Use this handoff for a short current integration note and, during active review, a compact round table. Keep asset provenance with the assets. Do not create separate implementation/performance/integration/critique reports; raw evidence stays in ignored `.experiments/`. After merge, fold lasting decisions into source/architecture and retire the completed handoff/history.

At handback, provide the playable production and shape URLs, controls/section starts, exact source revision or patch manifest/checksum, final served JS/CSS identifiers, tests/lint/build/browser results, measured budgets, critic history and honest limitations. Leave review servers to the launching integrator, report browser CLOSED, and keep `humanApproved: false` until the user actually approves this map. Final human review is the only planned human gate; reaching the overnight end state does not itself mean approval.

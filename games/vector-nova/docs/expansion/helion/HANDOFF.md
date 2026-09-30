# Map 9 — Helion Flare: overnight production handoff

> Skim a vast solar observatory as stellar prominences curl beyond its shields, with broad white heat-tile race panels and copper feathered radiator edges. Fast exposure/shadow straights end in readable braking turns, and a wraparound shield-wall ride reveals the star without washing out the racing line.

## Assignment and authority

**Goal:** Finish a complete solar-observatory circuit whose broad heat-tile deck and copper radiator edges stay readable across exposure, shade and a shield-wall ride, then deliver the verified candidate through one independent critic loop and final human review.

Read this brief, [the common execution rules](../../EXPANSION_HANDOFF.md) and the [frozen level contract](../../EXPANSION_LEVEL_CONTRACT.md) when available. Consult architecture/art sections only as needed; do not preload the full roadmap or other lane briefs. Use the integrator’s verified base/API.

Own only `src/levels/helion/**`, `public/assets/levels/helion/**`, `tools/expansion-helion-*.mjs` and `docs/expansion/helion/**` in the assigned isolated worktree. Shared core, renderer, camera, UI, physics, race, settings, package/config and other levels are outside this lane. Request necessary contract changes from the launching integrator recorded in `docs/expansion/LAUNCH_STATE.json`; continue independent owned work while they are resolved. No copied runtime, private launcher or alternate shared implementation.

Planned dev/preview ports: **5211/5212**. Production route: `http://127.0.0.1:5212/?level=helion`; shape route adds `&review=shape`. These are reservations, not evidence of running servers. The launching integrator in `docs/expansion/LAUNCH_STATE.json` owns server assignment and GPU capture scheduling. Coordinate before a hidden browser run; report the exact served build and browser CLOSED afterward. Do not touch the historical Gate 4 servers or ping those sessions.

## Defining interactions and spectacle

- **Flare-swept racing lanes:** fire rolls across exposed sections, forcing lateral evasion or a brief sheltered detour. Contact builds heat; sustained exposure causes damage or power loss.

- **Mandatory furnace passages:** a few short sections always expose you to heat. Cooling strips before and after them make approach preparation and fast traversal matter; shielded jumps can bypass optional hot sections.

- **Stellar prominence:** A stellar prominence rises, curls over the facility and breaks against enormous shields, spilling luminous plasma around their edges.

Keep the sunshield wall ride and deliberate braking shelves, but distribute flare-lane evasion, mandatory furnace passages and optional shielded jumps across the course. Build a couple of gigantic solar flares/prominences with distinct timing and silhouettes; they must influence the world’s light and frame the ride, not all occur in one hero corner.

## World and driving direction

A monumental working observatory sits beside the star’s visible limb, with vast dark sunshields, pale heat-tile infrastructure and feathered copper radiators. The stellar surface has coherent scale, structure and slow prominences; this is a new thermal-engineering identity, not an orbital road recolored orange.

Start near 5.0 km with a constant 30 m usable width and roughly 200 m of elevation change. Alternate 350–550 m fast exposure/shadow reaches with readable braking turns; give every approach a stable physical marker. A continuous 95–110° banked shield-wall ride reveals the star, with gradual roll entry/exit and a clear subsequent braking shelf. Implement the approved heat/contact consequences and explicit shielded jumps; do not add unrelated solar-wind handling.

| Initial lap interval | District             | Geometry, composition and gameplay purpose                                                                                                                                                  |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–12%                | **Dawnshield Dock**  | An early shallow climb leaves a shaded service berth. White tile thickness, copper edge feathers and the first sunshield establish a designed working facility.                             |
| 12–26%               | **Radiator Reach**   | A fast exposed arc follows enormous staggered radiator fans. Each fan has a different angle and joint hierarchy; the next braking turn is visible between them.                             |
| 26–40%               | **Umbrae Exchange**  | Two deliberate braking turns pass through deep shield shade and warm service light. Layered trusses and a small glazed control gallery give scale without becoming a generic city district. |
| 40–57%               | **Prominence Run**   | An open continuous deck reveals a slowly curling stellar prominence beyond the shields. Broad white travel panels retain texture and form against the intensely bright background.          |
| 57–73%               | **Heliopause Wall**  | The road wraps along a monumental shield at 95–110° bank. Copper load spines trace the underside; a dark shield edge frames the star while the exit shelf remains visible.                  |
| 73–87%               | **Coronal Shelf**    | A compact braking shelf transitions into a banked shaded connector. Rotating instrument silhouettes and layered thermal shutters enrich the middle distance without moving into the road.   |
| 87–100%              | **Afterglow Return** | A gentle dropping S returns through the service berth’s warm light. Smaller heat exchangers, exterior access decks and the original shield profile make the final stretch feel inhabited.   |

## Raceway construction and whole-world finish

- Running surface: broad white heat-tile panels with subtle warm-grey edge bevels, sparse charcoal reinforcement sections and selected copper service inserts. Large physical tile blocks carry identity; no asphalt or tiny neon strips masquerading as material design.
- Boundaries: overlapping copper feathered radiator edges rise in an outward stepped profile above a dark continuous curb. Thick roots, open cooling slots and tapered tips must read clearly without producing repetitive high-frequency flicker.
- Underside/supports: graphite trusses wrapped in pale thermal blankets, copper heat pipes and massive shield anchors. Every large span connects to observatory structure, with clear expansion joints and accessible service paths.
- District variation: pale exposed decks, charcoal-and-copper shaded connectors and broad alternating heat shields through the wall ride. Maintain one construction family and preserve the craft’s actual material response.

- Hero landmarks: the star limb and prominence, monumental curved shield and one intricate central instrument tower. The star needs textured radiance and scale cues; a white disk plus bloom is insufficient.
- Ordinary stretches: radiator banks, articulated sensors, layered shutters, thermal mantles, small access decks and quiet service lighting. Use foreground joints, middle structural assemblies and distant shield silhouettes through both inward and star-facing turns.
- Lighting: Make bright stellar exposure, cooler deep shield shade and localized furnace/fire light distinct throughout the lap. At least two gigantic solar flare events should cast convincing changing light on nearby shields and tiles while retaining visible road, heat warnings and ship materials. White heat tiles must retain shape at peak brightness; sheltered service areas need intentional local illumination, not crushed black or a flat ambient wash.

**Reject these shortcuts:** Reject a featureless overexposed star, crushed black service areas, generic orbital U frames, thin orange highlights on Halcyon panels, shield-wall camera collisions, or hidden solar forces/damage. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Future shared pickup/boost locations

Mark boost/refill setup areas before mandatory furnace passages, safe recovery points after heat chains and optional jump approaches. Flag where future shared heat protection, repair or energy support would help; implement no pickups, shields, inventory or new boost system. Preserve unavoidable short exposure and report its cost/difficulty without those aids. Record actual built-route coordinates using the [shared placement-note format](../../EXPANSION_HANDOFF.md#future-shared-pickup-and-boost-placement), without implementing those systems or replacing the approved level mechanics.

## Presets and resource discipline

High may add slowly evolving prominence detail, restrained radiance and small instrument motions. Low preserves star structure, major flare silhouettes, shield geometry and shaded route fill while reducing fine turbulence and minor hardware. Reduced motion holds stellar surface flow and instruments steady; no rapid flare flashes or camera shake; retain readable heat warnings and all gameplay hazard cues.

The [common brief](../../EXPANSION_HANDOFF.md) defines resource limits, ownership, provenance and high/low verification.

## Production and review

Use the [scene-imagegen → Blender workflow](../../EXPANSION_HANDOFF.md#asset-workflow-imagegen-to-blender) for major assets: The monumental shields/radiators, shielded jump structures and large flare/plasma shapes are major scene-to-Blender subjects. Use the modeled forms as the basis for layered animated materials/particles where useful; fire and stellar flow need not be literal static meshes. Keep ordinary service hardware reusable. Keep all asset iteration inside the single eight-round level critic budget; simple procedural parts need no separate concept/model loop.

Follow the [shared production/critic loop](../../EXPANSION_HANDOFF.md): internal shape checks, full production, one independent counter capped at eight, then final human review. The initial critique counts; stop at the first verified pass or cap. Use the level-specific checks below alongside shared control/lifecycle regressions.

## Acceptance on the actual production build

1. Drive exposed flare lanes and sheltered detours; verify telegraphing, heat buildup, declared damage or power-loss consequence and cooling-strip recovery.
2. Traverse mandatory furnace passages, optional shielded jumps and the sunshield wall ride with existing controls/boost; record unsupported heat cost and speed requirements.
3. Inspect at least two gigantic flare/prominence events and their local illumination at peak brightness and deep shade; verify reset/replay, legible warnings and non-strobing reduced-motion behavior.
4. Check high/low and bright-to-dark transitions, future boost/protection/recovery coordinates, controlled impacts and reset while heat is active.
5. Across representative starts, prove driver-left/right steering, throttle, brake, airbrake, manual boost, rail feedback, slope rest, pause/resume, reset and valid ordered checkpoint progression. Use real keyboard inputs for motion; deterministic starts are setup, never autopilot evidence. Fast numerical full-lap checks are complementary and must be labelled as simulated.
6. Inspect the whole shape plus each district in driving view; test desktop, **844×390**, **640×360** and **390×844**. Check actual HUD, notice, map and control bounds during motion and feedback, not only initial screenshots. Shared UI/camera defects go to the integrator rather than being patched outside lane ownership.
7. Verify shape and production routes, loading/error handling, high/low/reduced motion, compatible replay behavior and incompatible-rules rejection through the supplied contract. Check level exit/disposal and no accidental assets/effects in a baseline route. The integrator owns the combined all-map regression.
8. Record shader/console/page/asset errors and drawn-resource maxima with the served build identifiers. Hidden runs do **not** certify foreground frame pacing, audible quality, physical gamepad/mobile behavior or OS-lock operation; leave each unperformed check explicitly unverified.

## Scope limits and final evidence

Build the named level interactions and spectacle under the [shared runtime/ownership boundaries](../../EXPANSION_HANDOFF.md#gameplay-and-presentation-boundaries). Preserve the existing ship, controls and default handling outside declared local effects; coordinate reusable runtime support with the integrator. Shared pickup/boost expansion remains placement notes only. Only the user supplies final human approval.

Keep `STATUS.json` to current phase, counter/latest scores, build/checks and open issues. Use this handoff for a short current integration note and, during active review, a compact round table. Keep asset provenance with the assets. Do not create separate implementation/performance/integration/critique reports; raw evidence stays in ignored `.experiments/`. After merge, fold lasting decisions into source/architecture and retire the completed handoff/history.

At handback, provide the playable production and shape URLs, controls/section starts, exact source revision or patch manifest/checksum, final served JS/CSS identifiers, tests/lint/build/browser results, measured budgets, critic history and honest limitations. Leave review servers to the launching integrator, report browser CLOSED, and keep `humanApproved: false` until the user actually approves this map. Final human review is the only planned human gate; reaching the overnight end state does not itself mean approval.

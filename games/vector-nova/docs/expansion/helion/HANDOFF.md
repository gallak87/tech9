# Map 9 — Helion Flare: level completion brief

## Assignment and authority

**Goal:** Finish a solar-observatory circuit with flare-lane evasion, mandatory heat passages and optional sheltered jumps, a couple of gigantic solar flares and readable exposure/shade transitions.

Read this brief, [the common execution rules](../README.md) and the current [level API](../../LEVEL_API.md) from the primary worktree when the user resumes you. Continue your existing level work with the latest primary code. Consult architecture/art sections as needed.

Own `helion` through production, critique, necessary shared framework/environment/tooling improvements, final mobile verification, commit and merge into the primary worktree. Follow the [completion ownership rules](../README.md#worktree-and-completion-ownership). Start your own preview on a free port; use `?level=helion` and `&review=shape`. Chat sequencing belongs to the user. Keep progress in the chat and expansion notes in this folder. Document reusable technical changes with their APIs.

## Defining interactions and spectacle

- **Flare-swept racing lanes:** fire rolls across exposed sections, forcing lateral evasion or a brief sheltered detour. Contact builds heat; sustained exposure causes damage or power loss.

- **Mandatory furnace passages:** a few short sections always expose you to heat. Cooling strips before and after them make approach preparation and fast traversal matter; shielded jumps can bypass optional hot sections.

- **Stellar prominence:** A stellar prominence rises, curls over the facility and breaks against enormous shields, spilling luminous plasma around their edges.

Keep the sunshield wall ride and deliberate braking shelves, but distribute flare-lane evasion, mandatory furnace passages and optional shielded jumps across the course. “Shielded” means physical cover supplied by the track’s architecture, not a new player shield. Cooling strips are authored heat-management surfaces, not collectible items. Build a couple of gigantic solar flares/prominences with distinct timing and silhouettes; they must influence the world’s light and frame the ride, not all occur in one hero corner.

## World and driving direction

A monumental working observatory sits beside the star’s visible limb, with vast dark sunshields, pale heat-tile infrastructure and feathered copper radiators. The stellar surface has coherent scale, structure and slow prominences; this is a new thermal-engineering identity, not an orbital road recolored orange.

Start near 5.0 km with a constant 30 m usable width and roughly 200 m of elevation change. Alternate 350–550 m fast exposure/shadow reaches with readable braking turns; give every approach a stable physical marker. A continuous 95–110° banked shield-wall ride reveals the star, with gradual roll entry/exit and a clear subsequent braking shelf. Implement the approved heat/contact consequences and explicit shielded jumps; do not add unrelated solar-wind handling.

| District idea        | Route and composition starting point                                                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dawnshield Dock**  | An early shallow climb leaves a shaded service berth. White tile thickness, copper edge feathers and the first sunshield establish a designed working facility.                                                                             |
| **Radiator Reach**   | A fast exposed arc follows enormous staggered radiator fans. Each fan has a different angle and joint hierarchy; the next braking turn is visible between them.                                                                             |
| **Umbrae Exchange**  | Two deliberate braking turns pass through deep shield shade and warm service light. Layered trusses and a small glazed control gallery give scale without becoming a generic city district.                                                 |
| **Prominence Run**   | Exposed decks and sheltered detours introduce flare sweeps beneath one gigantic stellar prominence. Broad white travel panels retain texture and form against the intensely bright background.                                              |
| **Heliopause Wall**  | The road wraps along a monumental shield at 95–110° bank. Copper load spines trace the underside; a dark shield edge frames the star while the exit shelf remains visible.                                                                  |
| **Coronal Shelf**    | A cooling approach feeds a short mandatory furnace passage; an optional sheltered jump bypasses a separate hot reach. Rotating instrument silhouettes and layered thermal shutters enrich the middle distance without moving into the road. |
| **Afterglow Return** | A gentle dropping S returns through the service berth’s warm light. Smaller heat exchangers, exterior access decks and the original shield profile make the final stretch feel inhabited.                                                   |

## Raceway construction and whole-world finish

- Running surface: broad white heat-tile panels with subtle warm-grey edge bevels, sparse charcoal reinforcement sections and selected copper service inserts. Large physical tile blocks carry identity; no asphalt or tiny neon strips masquerading as material design.
- Boundaries: overlapping copper feathered radiator edges rise in an outward stepped profile above a dark continuous curb. Thick roots, open cooling slots and tapered tips must read clearly without producing repetitive high-frequency flicker.
- Underside/supports: graphite trusses wrapped in pale thermal blankets, copper heat pipes and massive shield anchors. Every large span connects to observatory structure, with clear expansion joints and accessible service paths.
- District variation: pale exposed decks, charcoal-and-copper shaded connectors and broad alternating heat shields through the wall ride. Maintain one construction family and preserve the craft’s actual material response.

- Hero landmarks: the star limb and prominence, monumental curved shield and one intricate central instrument tower. The star needs textured radiance and scale cues; a white disk plus bloom is insufficient.
- Ordinary stretches: radiator banks, articulated sensors, layered shutters, thermal mantles, small access decks and quiet service lighting. Use foreground joints, middle structural assemblies and distant shield silhouettes through both inward and star-facing turns.
- Lighting: Make bright stellar exposure, cooler deep shield shade and localized furnace/fire light distinct throughout the lap. At least two gigantic solar flare events should cast convincing changing light on nearby shields and tiles while retaining visible road, heat warnings and ship materials. White heat tiles must retain shape at peak brightness; sheltered service areas need intentional local illumination, not crushed black or a flat ambient wash.

**Reject these shortcuts:** Reject a featureless overexposed star, crushed black service areas, generic orbital U frames, thin orange highlights on Halcyon panels, shield-wall camera collisions, or hidden solar forces/damage. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Presets and resource discipline

High may add slowly evolving prominence detail, restrained radiance and small instrument motions. Low preserves star structure, major flare silhouettes, shield geometry and shaded route fill while reducing fine turbulence and minor hardware. Reduced motion holds stellar surface flow and instruments steady; no rapid flare flashes or camera shake; retain readable heat warnings and all gameplay hazard cues.

## Production and review

Use the [scene-imagegen → Blender workflow](../README.md#asset-workflow-imagegen-to-blender) for major assets: The monumental shields/radiators, shielded jump structures and large flare/plasma shapes are major scene-to-Blender subjects. Use the modeled forms as the basis for layered animated materials/particles where useful; fire and stellar flow need not be literal static meshes. Keep ordinary service hardware reusable.

Use the [shared production/critic loop](../README.md#production-and-critique-loop) and [common verification/completion rules](../README.md#verification-and-resource-discipline). The checks below add this level’s specific interactions and lighting. Iterate on desktop first; perform the mobile pass once desktop art and critique are settled. Merge and verify the completed level yourself, including affected existing circuits after shared changes.

## Acceptance on the actual production build

1. Drive exposed flare lanes and sheltered detours; verify telegraphing, heat buildup, declared damage or power-loss consequence and cooling-strip recovery.
2. Traverse mandatory furnace passages, optional shielded jumps and the sunshield wall ride with existing controls/boost; record unsupported heat cost and speed requirements.
3. Inspect at least two gigantic flare/prominence events and their local illumination at peak brightness and deep shade; verify reset/replay, legible warnings and non-strobing reduced-motion behavior.
4. Check high/low and bright-to-dark transitions, heat and landing cues, controlled impacts and reset while heat is active.

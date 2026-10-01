# Map 9 — Helion Flare: replacement session handoff

## Assignment and authority

**Goal:** Finish a solar-observatory circuit with flare-lane evasion, mandatory heat passages and optional sheltered jumps, a couple of gigantic solar flares and readable exposure/shade transitions.

Read the current version of this handoff from the primary worktree. Take over the existing authored level and complete it using the startup instructions below.

Own `helion` through production, critique, necessary shared framework/environment/tooling improvements, final mobile verification, commit and merge into the primary worktree. Follow the [completion ownership rules](../README.md#worktree-and-completion-ownership). Start your own preview on a free port; use `?level=helion` and `&review=shape`. Chat sequencing belongs to the user. Keep progress in the chat and expansion notes in this folder. Document reusable technical changes with their APIs.

## Start here: replacement session

Existing worktree: `/Users/g/.codex/worktrees/fzero-helion1/tech9`. Existing branch: `codex/fzero-helion1`. Primary worktree: `/Users/g/code/scratch/tech9`.

1. Read the current primary's `games/vector-nova/AGENTS.md`, this handoff, [common execution rules](../README.md) and [level API](../../LEVEL_API.md). Consult architecture/art sections as needed.
2. Preserve existing committed and uncommitted gameplay/asset work, then merge the latest commit currently checked out in the primary worktree into this existing branch before implementation or critic round 1. Resolve conflicts retaining authored work, integrated levels and shared improvements; use the primary's current docs and process-file deletions. Build and run affected checks before continuing.
3. Begin a fresh formal critic cycle at round 1. Keep the existing implementation, selected artwork and useful learnings. Stop when every applicable category reaches at least 9/10 with evidence and no critical failures, or after 8 completed formal rounds, whichever comes first. Use one counter for the whole desktop finish, including sky/lighting changes; complete mobile last, then commit, merge and verify the primary game.

### Preserve existing artwork and useful fixes

Sources are in `games/vector-nova/assets/levels/helion/` inside the existing worktree. Preserve `reference/thermal-observatory-scene.png`, `reference/prompt.txt`, `provenance.json`, `blender/thermal-observatory.blend` and `blender/build_helion.py`, their runtime exports and any newer authored versions. View the selected scene reference before making art changes and carry useful technical learnings forward from source/provenance and existing evidence. Keep raw captures/reports ignored.

Preserve the observatory kit, heat/contact logic, shared landing/contact fixes and responsive mechanic feedback. Confirm production rendering and real-input flare evasion, mandatory furnace passages, cooling strips and sheltered jumps. Keep useful existing checks and remove obsolete scheduling dependencies from verification scripts when updating them.

### Selected generated sky

Use the [original sky panorama](../../../assets/levels/helion/helion-sky-v1.png), [exact generation prompt](../../../assets/levels/helion/sky-prompt.txt) and [sky provenance](../../../assets/levels/helion/SKY_PROVENANCE.md) brought in from the primary worktree. Use the selected restrained deep-space starfield with fine cold stellar dust, dark negative space and subtle copper horizon glow. Keep the star limb, radiance and gigantic prominences as separate scene effects with their own local illumination. Verify white tile shape and readable shield shade at peak exposure.

Follow the [sky integration checks](../README.md#generated-sky-panoramas), preserve the source image and export a runtime texture under `public/assets/levels/helion/`. Confirm seam/horizon, exposure, loading/disposal and high/low/reduced motion on the actual production build. Nearby scenery and gameplay remain authored 3D content.

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

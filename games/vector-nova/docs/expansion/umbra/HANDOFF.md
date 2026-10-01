# Map 10 — Umbra Fold: level completion brief

## Assignment and authority

**Goal:** Finish a gravity-observatory circuit with tidal line control, curved airborne crossings, continuous debris consumption and one enormous spaghettification event.

Read this brief, [the common execution rules](../README.md) and the current [level API](../../LEVEL_API.md) from the primary worktree when the user resumes you. Continue your existing level work with the latest primary code. Consult architecture/art sections as needed.

Own `umbra` through production, critique, necessary shared framework/environment/tooling improvements, final mobile verification, commit and merge into the primary worktree. Follow the [completion ownership rules](../README.md#worktree-and-completion-ownership). Start your own preview on a free port; use `?level=umbra` and `&review=shape`. Chat sequencing belongs to the user. Keep progress in the chat and expansion notes in this folder. Document reusable technical changes with their APIs.

## Defining interactions and spectacle

- **Tidal racing zones:** a visible, gradually increasing pull toward the black hole changes how you hold your line. Banking, countersteering and boost become tools for crossing the strongest zones.

- **Gravity-assisted leaps:** launch from a broken deck and follow a deliberately curved flight path around an observatory fragment onto a lower road. The landing is visible before commitment.

- **Continuous accretion:** The black hole continuously consumes debris: intact distant structures stretch into strands, fragment and spiral into the bright ring. One enormous object undergoes that transformation during the lap.

Retain stacked crossings, inversion and the grounded descending fold, then distribute clearly introduced tidal zones and curved airborne crossings among those features. Build continuous distant accretion plus one enormous, staged spaghettification event with readable stretching and fragmentation; do not replace it with a generic particle swirl.

## World and driving direction

Dark graphite, fractured pale observatory stone and restrained cold metal hang against a luminous accretion ring. The architecture is asymmetrical and damaged, yet the functioning raceway remains engineered and clearly guided. Difficulty comes from linked corners and layered road geometry, never invisible hazards or unexplained gravity changes.

Start near 5.4 km with a constant 28 m usable width and roughly 320 m of vertical range. Build a learnable sequence of linked turns, one extended inversion and two visually separable stacked crossings, finishing with a descending continuous fold over the start. Give each demanding feature a recognizable entry landmark and short recovery shelf. Grounded surfaces retain validated magnetic frames; explicitly declared tidal zones and curved airborne crossings supply the approved gravity interaction.

| District idea       | Route and composition starting point                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Broken Meridian** | An early offset S leaves a half-ruined observatory deck. Pale broken ring fragments and the first asymmetric boundary plates point toward the intact racing surface.                                                                                                      |
| **Parallax Stacks** | Linked climbing turns thread the first stacked crossing. The nearer upper deck has a clearly different underside and lit support line, making route order readable from chase view.                                                                                       |
| **Lensward Arc**    | A broad bank opens onto the accretion ring and a tilted observatory lens. Dark running panels retain edge detail against the bright ring without becoming a silhouette-only road.                                                                                         |
| **Inversion Vault** | A gradual continuous roll enters an inverted hold beneath a broken instrument vault. Lighted floor-edge continuity and spare architecture reveal the direction through the transition.                                                                                    |
| **Tidal Knots**     | Linked braking turns and a progressively signalled tidal pull cross the route at a different height; a broken span introduces a curved leap toward a visible lower landing. Distinct amber approach markers and unequal suspended plates make the corner order learnable. |
| **Event Fold**      | A steep continuous descent curls above the start on a folded ribbon, then releases onto a recovery shelf. The earlier grid becomes a dramatic depth reference; it is never a jump or teleport.                                                                            |
| **Quiet Meridian**  | A lower return arc threads abandoned instrument ribs back to the line. A dimmer ring view and calm pale lighting provide relief while preserving rich near-field structural detail.                                                                                       |

## Raceway construction and whole-world finish

- Running surface: dark segmented deck blocks with broad graphite facets, cold metallic edge bands and occasional pale service panels. Bright continuous guidance is physically embedded along the drivable corridor; the dark surface must retain roughness and shape.
- Boundaries: asymmetric suspended side plates hang from offset struts above a low continuous curb. Alternate taller outer plates and shorter inner pieces by corner need, with recognizable open windows; do not copy U frames or random floating rectangles.
- Underside/supports: paired tension spines, broken-but-repaired load nodes and tilted support hoops attach to the observatory. Expose different deck bottoms at the two crossings so their spatial order can be learned.
- District variation: pale patched launch panels, dark lens-facing spans, ribbed inversion shells and silver reinforcing bands on the descending fold. Keep the continuous guidance coherent without making every surface emissive.

- Hero landmarks: the luminous accretion ring, tilted lens assembly and ruined instrument vault. A composed apparent lensing treatment may provide visual spectacle, but avoid full-screen distortion that alters the road or implies simulated astrophysics.
- Ordinary stretches: fractured observatory terraces, repair gantries, suspended instrument ribs, small service lights and distant debris families. Damaged architecture needs deliberate construction details and silhouette variation, not arbitrary floating debris cubes.
- Lighting: Use ring-derived warm/cool illumination to sculpt dark graphite and pale ruins, with darker instrument vaults and brighter exposed lens-facing spans. Tidal-zone direction/strength and lower landings must remain readable against the accretion ring. Light the stretching object across its deformation so it has mass and strands, and keep away-from-ring views populated and intentionally lit.

**Reject these shortcuts:** Reject arbitrary floating blocks, empty black views away from the ring, a technical route that is merely confusing, invisible crossings, bright guides hiding absent road geometry, inverted camera collisions or unexplained global gravity changes. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Presets and resource discipline

High may add restrained layered ring detail and slow far-debris drift. Low keeps the accretion silhouette, background stars, every route marker and major ruined landmark while simplifying distant assemblies. Reduced motion stops decorative ring flow and far-debris drift; no camera shake, rotating horizon illusion or pulsing edge lights. Never distort HUD or driving geometry.

## Production and review

Use the [scene-imagegen → Blender workflow](../README.md#asset-workflow-imagegen-to-blender) for major assets: The observatory fragments/landing structures, tilted lens and enormous object with staged stretched/fragmented forms are major scene-to-Blender subjects. Use reproducible deformation/animation for continuous accretion and reuse small debris families.

Use the [shared production/critic loop](../README.md#production-and-critique-loop) and [common verification/completion rules](../README.md#verification-and-resource-discipline). The checks below add this level’s specific interactions and lighting. Iterate on desktop first; perform the mobile pass once desktop art and critique are settled. Merge and verify the completed level yourself, including affected existing circuits after shared changes.

## Acceptance on the actual production build

The user reported an apparently oversized or incomplete map, with a black central 3D viewport while the HUD/minimap remained visible. Inspect the resumed production build and establish the cause before declaring completion; the screenshot alone did not establish whether this was scale, loading, camera placement or missing scenery.

1. Drive progressively stronger tidal zones with actual countersteering/braking/boost; measure the declared pull and show ordinary handling outside the zones.
2. Traverse curved gravity-assisted leaps with actual input, visible lower landing and an imperfect approach; verify airborne force integration, recovery and ordered checkpoints alongside grounded inversions/crossings.
3. Inspect continuous debris consumption and the enormous object stretching into strands, fragmenting and spiralling inward; verify event/runtime reset, pause and replay without screen-wide road distortion.
4. Check ring-facing and shadowed views at high/low/reduced motion, tidal/landing cues and landing/recovery behavior; report hard no-pickup sections honestly.

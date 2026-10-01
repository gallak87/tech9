# Map 7 — Saffron Leviathan: replacement session handoff

## Assignment and authority

**Goal:** Finish a fossil-desert circuit through skull and vertebrae, with sand/glass route choices, a breaching burrower and readable sheltered interiors.

Read the current version of this handoff from the primary worktree. Take over the existing authored level and complete it using the startup instructions below.

Own `saffron` through production, critique, necessary shared framework/environment/tooling improvements, final mobile verification, commit and merge into the primary worktree. Follow the [completion ownership rules](../README.md#worktree-and-completion-ownership). Start your own preview on a free port; use `?level=saffron` and `&review=shape`. Chat sequencing belongs to the user. Keep progress in the chat and expansion notes in this folder. Document reusable technical changes with their APIs.

## Start here: replacement session

Existing worktree: `/Users/g/.codex/worktrees/fzero-saffron1/tech9`. Existing branch: `codex/fzero-saffron1`. Primary worktree: `/Users/g/code/scratch/tech9`.

1. Read the current primary's `games/vector-nova/AGENTS.md`, this handoff, [common execution rules](../README.md) and [level API](../../LEVEL_API.md). Consult architecture/art sections as needed.
2. Preserve existing committed and uncommitted gameplay/asset work, then merge the latest commit currently checked out in the primary worktree into this existing branch before implementation or critic round 1. Resolve conflicts retaining authored work, integrated levels and shared improvements; use the primary's current docs and process-file deletions. Build and run affected checks before continuing.
3. Begin a fresh formal critic cycle at round 1. Keep the existing implementation, selected artwork and useful learnings. Stop when every applicable category reaches at least 9/10 with evidence and no critical failures, or after 8 completed formal rounds, whichever comes first. Use one counter for the whole desktop finish, including sky/lighting changes; complete mobile last, then commit, merge and verify the primary game.

### Preserve existing artwork and useful fixes

Sources are in `games/vector-nova/assets/levels/saffron/` inside the existing worktree. Preserve `scene-reference.png`, `PROVENANCE.md`, `leviathan-kit.blend` and `build_saffron.py`, their runtime exports and any newer authored versions. View the selected scene reference before making art changes and carry useful technical learnings forward from source/provenance and existing evidence. Keep raw captures/reports ignored.

Preserve the corrected landing rules, shared deck/rail contact behavior, compact mechanic feedback and authored fossil kit. Confirm them with real-input skull/vertebral traversal, sand-versus-glass comparisons and recovery. Keep the chosen fossil anatomy, dune families and sheltered bone lighting while finishing the burrower and sandfalls.

### Selected generated sky

Use the [selected reference-guided sky](../../../assets/levels/saffron/saffron-sky-v2.png), [exact generation prompt](../../../assets/levels/saffron/sky-prompt-v2.txt) and [sky provenance](../../../assets/levels/saffron/SKY_PROVENANCE.md) brought in from the primary worktree. Match the [original scene drawing](../../../assets/levels/saffron/scene-reference.png): luminous pale lavender/lilac dry daylight, calm open atmosphere, soft golden illumination and a faint large moon. Preserve the selected image's moon and avoid also drawing the old procedural moon disk. Align the separate sun/light direction, warm sand bounce and readable bone interiors with the reference; avoid changing the world to blue/peach sunset.

Follow the [sky integration checks](../README.md#generated-sky-panoramas), preserve the source image and export a runtime texture under `public/assets/levels/saffron/`. Confirm seam/horizon, exposure, loading/disposal and high/low/reduced motion on the actual production build. Nearby scenery and gameplay remain authored 3D content.

## Defining interactions and spectacle

- **Ride through the skeleton:** descend through the skull’s mouth, bank along its interior and jump between broken vertebrae. The fossil becomes the actual course.

- **Shifting sand crossings:** migrating dunes partially bury the road. Exposed glass offers speed; sand drags you down, while crest jumps can skip the deepest deposits.

- **Living burrower:** A living burrower travels beneath the desert alongside the fossil, raising a moving ridge before breaching beyond the track. Its movement sends sand pouring through the bones.

Rework the skull from a distant prop into a traversable part of Leviathan Vista/Marrow Switch; spread broken-vertebra crossings and sand/glass choices through the route. Preserve a worthwhile panoramic acceleration reach, and let the burrower’s ridge/breach/sandfalls build through separate sightlines.

## World and driving direction

Saffron sand, pale fossil bone and smoked-gold glass sit beneath an immense dry alien sky. The remains have age, stratification and specific anatomy; this is an archaeological landscape at impossible scale, not a desert highway with a few rib props.

Start near 5.2 km with a constant 32 m usable width and roughly 130 m of rolling elevation. Alternate broad visible crests with protected bone-corridor bends and two offset braking decisions. Reserve a 600–750 m signature panorama for acceleration, using a shallow evolving arc, stepped sightlines and nearby scale markers so its length earns its place. Keep grounded crests magnetic and distinguish intentionally airborne vertebral/dune-skip jumps from ordinary deck.

| District idea        | Route and composition starting point                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Ochre Anchorage**  | Begin beside a small bone-suspended survey station and enter an open crest. Low split baffles, layered dunes and a distant immense ribcage establish the course identity immediately.                        |
| **Ribshadow Reach**  | Broad alternating banks pass through fossil ribs. Each rib has different erosion and section shape; bright sky gaps reveal the upcoming road rather than creating a strobing tunnel.                         |
| **Sandfall Gallery** | An offset braking sequence follows a sheltered fossil ledge beside slow sand cascades. Warm reflected sand light gives the dark inner bone readable depth.                                                   |
| **Leviathan Vista**  | The long panoramic acceleration reach emerges along a glass ribbon beside the creature’s vast spine. Near vertebral fragments and middle ribs reveal the approaching traversable skull in layers.            |
| **Marrow Switch**    | A skull-mouth descent and interior bank lead into broken vertebral jumps, with readable receiving segments between decisions. Pale porous arches and gold road reflections keep the sheltered route legible. |
| **Amber Crest**      | A rising bank reaches a wind-carved ridge and reveals the original station. Broad dune faces carry slowly changing color bands rather than featureless flat yellow planes.                                   |
| **Siltwake Return**  | An offset descent and compact final bend pass buried rib tips back to the grid. Low vegetation-like mineral fans and embedded markers enrich the ordinary closing stretch.                                   |

## Raceway construction and whole-world finish

- Running surface: thick fused-gold glass ribbons with a smoked central travel band, translucent shoulders and broad lens-like panel sections. Subsurface bubbles and sparse mineral laminae belong inside the material, not a sandy asphalt overlay.
- Boundaries: low split aerodynamic baffles have two separated vanes and a continuous grounded toe. Their tapered ends and shadow gaps make a horizontal silhouette unique among the circuits; no tall generic rails.
- Underside/supports: forked gold-ceramic shoes spread onto stable fossil shelves, while bridge ribs clamp around bone without implausibly floating. Exposed underside glass reveals a restrained structural web over the deepest dune troughs.
- District variation: clear amber outer spans, honey-opaque reinforced turns and smoke-gold corridor panels. Pale baffle interiors, dark curb seams and physical arrow fittings must remain readable against bright sand.

- Hero landmarks: the approaching ribcage, traversable skull reached from Leviathan Vista and bone-suspended survey station. The continent-sized fossil impression comes from scale layers, partial views and terrain integration, not simply one enlarged low-poly skeleton.
- Ordinary stretches: dune families with different orientations, exposed bone strata, buried fragments, mineral crust, eroded ledges and slow sandfalls. Keep a composed near layer around every crest and corridor entrance.
- Lighting: Let pale sun and long rib shadows define exterior scale, then use warm sand bounce and narrow skylight openings inside the skull and vertebrae. Interior corners must remain readable without losing their sheltered darkness. Gold glass and buried sand must look materially different at driving speed; distant lavender haze must preserve the fossil’s layered silhouette.

**Reject these shortcuts:** Reject a flat yellow backdrop, copied highway panels, repeated identical ribs, sand obscuring the route, rib-shadow strobing, or a featureless full-throttle straight added solely for length. Inspect the mundane connectors with the same care as the hero image. The route, running surface, barriers, underside/supports, near/middle/far scenery and sky must all identify this world without relying on its name.

## Presets and resource discipline

High may add sparse drifting grains, limited glass transmission and animated sandfall ribbons. Low preserves the fossil silhouettes, dune contours, deck thickness and readable inner corridor lighting while simplifying grains and material layers. Reduced motion removes blowing grains and holds sandfalls nearly still; ensure repeated ribs do not produce harsh flashing at speed.

## Production and review

Use the [scene-imagegen → Blender workflow](../README.md#asset-workflow-imagegen-to-blender) for major assets: The traversable skull and anatomically varied vertebrae, living burrower, and displaced dune/sandfall assemblies are major scene-to-Blender subjects. Establish reusable bone and dune families for the remaining landscape.

Use the [shared production/critic loop](../README.md#production-and-critique-loop) and [common verification/completion rules](../README.md#verification-and-resource-discipline). The checks below add this level’s specific interactions and lighting. Iterate on desktop first; perform the mobile pass once desktop art and critique are settled. Merge and verify the completed level yourself, including affected existing circuits after shared changes.

## Acceptance on the actual production build

1. Drive the skull descent/interior bank and vertebral jumps with actual inputs; verify camera clearance, real takeoff/landing and visible exits.
2. Compare exposed glass and sand drag at matched speeds; check migrating deposit state, crest-jump bypasses and deterministic reset/replay.
3. Inspect the burrower ridge, breach and bone sandfalls along the route; ensure the spectacle has scale without hiding landings or becoming repeated identical props.
4. Check exterior/interior lighting and glass/sand readability in high/low/reduced motion; verify landing/recovery cues and report difficult passages.

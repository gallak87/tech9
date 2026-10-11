# Road finish passes

Bring each raceway toward Halcyon's approved level of material quality while keeping its own identity. The target is a convincing, crisp surface in the actual racing view: appropriate scale, believable light response, readable construction and stable detail in motion. More wear, more gloss or larger textures are not acceptance criteria.

These are briefs for future assignment, not an instruction to start every level. Read the assigned brief and [AGENTS.md](../../../AGENTS.md). This is a surface-quality effort, separate from the parent folder's widening campaign: no new playable variants or widening phase gates are required. Coordinate with any active level owner before touching the same files; a road pass does not advance or approve their widening work.

## Scope

| Circuit           | Brief / disposition                                                |
| ----------------- | ------------------------------------------------------------------ |
| Halcyon Speedway  | Completed reference; preserve the approved asphalt                 |
| Asterion Orbital  | [Induction cassettes and alloy](orbital.md)                        |
| Nacre Tempest     | [Pearl ceramic and pressure membranes](nacre.md)                   |
| Vesper Canopy     | Deferred from this initial set; preserve its existing resin finish |
| Glasswake Comet   | [Crystal and frost](glasswake.md)                                  |
| Cindercoil        | [Fired ceramic and glazed panels](cindercoil.md)                   |
| Saffron Leviathan | Deprecated original; skip this road pass                           |
| Saffron Wide      | [Width-specific companion](saffron-wide.md)                        |
| Umbra Fold        | Deprecated original; skip this road pass                           |
| Umbra Wide        | [Width-specific companion](umbra-wide.md)                          |
| Helion Flare      | [Thermal tiles, graphite and copper](helion.md)                    |
| Zephyr Basilica   | [Woven graphite and local wetness](zephyr.md)                      |
| Shatterline       | [Induction decks and clear running tubes](shatterline.md)          |

The briefs' starting points come from source inspection. Their questions are hypotheses to investigate, not claims that a fresh visual audit has already found those defects. Recheck the current implementation when assigned. The original Saffron and Umbra are being deprecated; finish work targets only their wide variants. Preserve borrowed asset ownership and keep changes local where possible.

## What worked on Halcyon

We inspected the existing procedural color/bump and roughness maps, their road mapping and the available reflections. A live sheen/reflection experiment improved response only modestly; the surface still needed better material information and scale. The approved pass used licensed scan data with separate color, normal and packed material channels, a repeat measured in metres, broader moisture variation independent of the grain, and the existing district reflection probe. Mipmapped compressed maps kept the change practical. Matching Three.js views and driving checks established the improvement; the final path removed the old generator and comparison switch.

That sequence is the reference, not the asphalt recipe. See the [finished material](../../../src/levels/halcyon/track/asphalt.js), [source/build/provenance](../../../assets/levels/halcyon/asphalt/) and [runtime notes](../../../ARCHITECTURE.md#lifecycle-and-verification). Its three maps occupy about 12 MiB on ASTC/BC7 hardware and added no draw calls. That is an example cost, not an allocation for every circuit.

## Working process

1. **Inspect what is actually there.** In an isolated worktree, read the road builder, material helpers, texture sources, UVs, lighting/reflection setup and consumers. Open `?artPass=1&level=<slug>` on that worktree's preview. Inventory ordinary road, special surfaces and hazards, including their visual sources, contact behavior and entry/exit transitions. Check a close oblique view, a normal chase view, and each distinct surface/lighting situation. Save a small named set of camera links with `__VN.getArtPassURL()` and baseline metrics. State the main limitation in plain language before editing.
2. **Choose the improvement from that diagnosis.** Resolve scale, normals, light response or construction problems where they originate. Use existing maps, authored shaders, licensed materials, new maps or limited finish geometry as appropriate. There is no prescribed texture source, resolution, wetness level or authoring tool. Try a meaningful change in-engine early; avoid a long asset bake before proving it matters. Reuse the [Dev tools pattern](../../../src/ui/graphics-settings.js) for a useful level-local control if live tuning helps; do not add a generic material editor.
3. **Make the pass coherent.** Carry the successful approach through ordinary connectors and relevant surface families, not just the showcase view. Keep fine detail at a believable physical scale through bends, banks and width changes. Separate surface relief from broad variation and from actual construction. Evaluate the clean material first; add wear only where it improves the material's reading.
4. **Compare and check.** Show actual Three.js before/after screenshots with matching camera, viewport, quality and lighting/event state. Use several fly-camera positions, covering ordinary road and the level-specific features and their transitions: for example Saffron sand strips, Helion heated/cooling floors and Cindercoil lava spills. Compare animated hazards at the same phase, including active and quiet states where relevant. Check short driving segments for stretching, repetition, shimmer, seams and glare; include the brief's special cases. Reflections must not obscure or imitate a hazard, its boundaries or the safe route. If lighting changes are necessary, distinguish their contribution from the material change. Use one main pass and one focused correction of concrete findings, then hand off the result and remaining limitations. A weak improvement is a reason to reassess the diagnosis, not launch an indefinite critic-score loop.
5. **Finish the production integration.** After acceptance, remove superseded maps, generators, unused materials and temporary A/B paths once all consumers have migrated. Keep useful finish controls with the approved defaults, editable sources, reproducible asset tools and licences. Refresh affected menu stills and their manifest. Put enduring decisions in architecture/art docs, progress in chat, and remove owned temporary captures/scripts/reports from `.experiments/`. Commit and merge only when requested; do not start the next level automatically.

## Boundaries and verification

Preserve routes, widths, banks, supported surfaces, gap/landing intervals, collisions, hazard footprints, markings, event timing, ships, handling and 0.3 steering assistance. Small finish-geometry changes may support highlights or fitted construction, but cannot silently alter the physical driving surface. Preserve each level's [art direction](../../ART_BIBLE.md). Shared lighting/exposure changes and unrelated scenery rebuilds are outside a road brief.

Measure cost on the same device, view and preset before/after: frame intervals and spikes, draw calls/passes, triangles, texture memory and loading/compilation behavior. Halcyon's result is not proof of spare budget elsewhere. The [M1 profiling work](../../../ROADMAP.md) remains open; do not invent a universal performance guarantee or spend unmeasured headroom. Prefer changes within the measured baseline; report and resolve material regressions. High/Low must retain surface identity and guidance. Compression, mipmaps and bounded anisotropy are options to use appropriately, not a substitute for measuring transparency or shader cost.

Follow the [level lifecycle](../../LEVEL_API.md): await new assets, report failures, support retry and dispose owned resources without disposing borrowed probes/assets. Register new or replaced resources in the [asset manifest](../../ASSET_MANIFEST.json). Confirm base-color/data color spaces and normal convention; a single lit photograph is not a complete PBR material.

Run a production build and the relevant [level checks](../../../tools/level-checks/README.md), including `VN_URL=<preview-url> npm run verify:level -- <slug>`. Add only focused checks warranted by the change and the brief. Check affected shared-asset consumers too. Use the [menu preview workflow](../../../ARCHITECTURE.md#circuit-preview-refresh) for every affected circuit, including wide variants. Existing screenshots or neutral shape review are not proof of the new production finish.

This set follows the expansion folder's **desktop-only** scope: no mobile, portrait, touch-emulation or mobile-landscape cases, including embedded cases in combined CPU/browser suites. Inspect runners before invoking them and report that coverage as deferred. Keep autonomous browser checks hidden, bounded and free of unsolicited videos or normal-speed full laps. These briefs do not require delegation; if requested, give agents finite scopes against the same build.

Handoff: what limited the old surface, what changed and why, matching game screenshots, checked behavior/cost, unresolved limitations, and the commit/worktree status. A technically passing build alone does not establish visual improvement.

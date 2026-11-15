# Track editor roadmap

The editor includes direct road editing, seeded Circuit/Downhill courses through 20 km, Flowing/Technical/Woven/Big Air starters, optional grade-separated crossovers, rotation chunks, jumps, pickups, saves and test driving. Road and Environment share one preview and history with independent seeds. Regional generation and curated whole-course choices cover all 17 base biome families. Individual prop placement and Electron release verification remain deferred.

## Completed foundation

- **Road / Environment contexts:** one preview, one saved course and one Undo/Redo history. Changing context preserves the active pointer tool, selection and camera. Generation/replacement actions are explicit.
- **Independent seeds:** road generation preserves the applied environment; environment regeneration preserves authored road points, roll/bank, jump anchors and pickups. Pending world controls remain separate from the applied saved course.
- **Nightweir regions:** seeded terrain, connected shore/basins/canals, neighborhoods, near-road wards, industrial yards, parks and founded landmarks. Automatic infrastructure reserves road, camera and flight corridors.
- **Whole-course biomes:** all 17 base world families have curated characters, distinct generated scenery/road kits and registered backdrop/lighting. Campaign routes and active hazards remain separate. Mode variants reuse their base biome.
- **Compatibility:** legacy missing environment data inherits its old seed and roadside layout; new courses use stable regional layout 2, while saved layouts 0/1 remain supported. Loading never regenerates authored road points.
- **Jump editing and local testing:** sampled size proposals, reversible resize, stock point/jump starts, immediate retry and retained actual landing/miss feedback.
- **Draft recovery:** separate applied-draft checkpoints, native Continue/Start fresh, unchanged explicit library saves.
- **Stable regional editing:** layout 2 preserves earlier layouts, clips Nightweir courts to terrain/shore contours and reuses unchanged distant buffers after full CPU clearance checks.
- **Road-finish pilot:** anchored Nightweir/Vesper sections, passive join bands, continuous physical decks and shared Undo/save behavior. Environment mixing remains below.

## Regional generation improvements

- Let route generation optionally follow the regional plan so a course deliberately visits distinct places; current scenery fits around the authoritative road.
- Extend the current exact-content environment geometry/buffer reuse into incremental CPU survey/assembly generation. Current road edits still reevaluate all CPU clearance commands, with matching fresh collision geometry; distant byte-identical chunks retain their buffers.
- Extend the terrain-triangle-clipped Nightweir court/shore boundaries to richer clearance-edge treatments. Add richer connected drainage/waterfall systems and founded large assemblies.
- Continue measuring detailed near, simpler middle and distant geometry at both quality presets over 20 km courses. Static preview CPU submission measurements do not establish GPU/FPS headroom; keep the 60 FPS target and bound reflection/water costs.

## Mix and match biomes

The first bounded pilot supports anchored Nightweir/Vesper road-finish spans, passive join bands and unchanged driving geometry. It does not mix environment kits, skies or hazards.

- Apply a biome to an individual road placement or route span rather than locking the entire track to one biome.
- Keep the centerline, elevation, width, rotation, jumps and race progress continuous across biome boundaries. Automatically choose compatible road edges, supports and foundations, and blend road finishes at seams.
- Separate road style, surroundings, backdrop and gameplay hazards so changing one does not silently replace the others.
- Store stable span/point anchors and versioned kit IDs in the course file. Extract reusable kits from the authored campaign levels; their existing environments contain route-specific assumptions.

## Backdrops

- Add a picker for the existing generated level skies, independent of road biome and prop selection.
- Reuse registered runtime assets and retain provenance. Save a sky preset ID, not an arbitrary image URL.
- Define consistent sun, fog, exposure and reflection settings for each preset. Preview the complete result before applying it; keep Low/High navigation equally legible.

## Cross-biome props and road hazards

A future optional placement workflow may expose props or hazards from any biome, regardless of the road or scenery biome. Revisit whether this adds enough value over complete seeded world presets before expanding the current simple editor. If adopted, offer whole useful assemblies with simple move/rotate/scale controls and optional snapping to road, water, terrain or another assembly. Decorative scenery and functional hazards need clear labels.

| Source biome | Props and systems to expose                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Nightweir    | Buildings, waterfalls, dams and drainage assemblies                                                |
| Zephyr       | Towers and waterfalls                                                                              |
| Vesper       | Trees, ferns, river sections and resin/sap slowdown road hazard                                    |
| Glasswake    | Snow banks and ice shelves                                                                         |
| Colossus     | Grinding and conveyor slowdown hazards; the moving ledge that lunges and shoves ships off the road |
| Umbra        | Gravitational lensing, including its visible field and appropriate physical effect                 |
| Cindercoil   | Lava floor hazard                                                                                  |
| Helion       | Fire floor hazard                                                                                  |

Hazards must remain available across biome boundaries. Placement should preserve the original gameplay response—slowdown, heat, gravity, contact or shove—and expose only a small useful set of bounded controls. Show the affected area, activation state and clearance in the editor. A visual effect alone is not a functional hazard.

## Reusable systems needed

- A versioned biome/assembly registry with thumbnails, bounds, supported attachment points, asset ownership and optional collision/hazard factories.
- Shared placement data for rendering, collision and simulation. Moving machinery needs deterministic timing, pause/reset behavior, safe respawn handling and matching physical/visible swept volumes.
- River and waterfall authoring with connected sources, receivers and terrain/water contacts; avoid making users assemble water from disconnected cosmetic pieces.
- Route-aware hazard masks that follow banked, inverted and moving surfaces; scenery should not unexpectedly cover the driving or landing corridor.
- Geometry identity updates for every gameplay-affecting edit, plus migrations for saved kit versions. Existing saved routes remain authoritative.
- Define cross-runtime numeric canonicalization before custom records or Workshop sharing. Tiny differences in derived anchored fractions currently change exact hashes between Node and the browser even when resolved points match; saved geometry remains authoritative.
- Asset sharing and lazy loading across mixed kits. Batch compatible static props, bound water/reflection/volume passes, and measure matched warm views against the 60 FPS target before expanding density limits.
- Keyboard/controller parity, reliable undo/redo and save/load for every new placement tool.

## Suggested sequence

1. Continue the whole-course foundation: local CPU generation and richer connected regional water/clearance boundaries. Jump proposals/resizing, local test/retry feedback, draft recovery and immutable distant geometry reuse are implemented.
2. Extend the Nightweir/Vesper road-finish pilot to complete mixed environment regions with deliberate transitions, compatible supports/foundations and continuous driving/race progress; expand combinations only after that path is proven.
3. Add the independent sky picker. Reconsider an optional cross-biome static prop palette after the complete-world workflow is established.
4. Add a stationary road hazard such as Vesper sap or a lava/fire floor. Validate exact road contact, reset, replay identity and clear visual warnings.
5. Add connected water systems and richer Nightweir/Zephyr construction assemblies.
6. Add Colossus moving machinery and Umbra lensing after the simulation and rendering budgets are established.

Each step is complete when its course can be edited in the shared preview, saved/reopened, undone/redone, inspected with the free camera and driven through using the real physics, with matching visual/physical placement and no controller-only dead ends. Mixed-biome steps also require complete transitions between regions.

## Later editor capabilities

- **Optional trick mechanics:** a track setting enabling aerial tricks and a separate score display. Scores must not change race time, position or finish rules. Reuse the existing Freestyle mechanics without requiring the full Freestyle event format. Explicitly deferred from the current implementation.
- More sophisticated wave, pitch and rotation curves beyond the first section presets.
- Additional road pieces, branches, tubes and moving road, each with its own collision and race-progress contract.
- Custom Quick Race/Time Trial competition and separate custom-course records.
- Sharing, Steam Workshop and Steam Cloud, including version compatibility and asset availability checks.
- Update the Electron IPC document validator for the expanded whole-course biome/environment schema, then complete native Save/Import/Export and Steam release validation after browser authoring and gameplay are stable.

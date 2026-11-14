# Track editor roadmap

The editor starts with direct road editing, seeded Circuit/Downhill courses through 20 km with starter jumps, connected 90°/180°/270° rotation and straight sections, flight previews, seeded Nightweir world presets, automatic infrastructure, pickup fill, saves and test driving. World presets handle complete surroundings; individual prop placement is deferred for reconsideration. The browser workflow is the foundation for the work below. Electron release verification is deferred.

## Mix and match biomes

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
- Asset sharing and lazy loading across mixed kits. Batch compatible static props, bound water/reflection/volume passes, and measure matched warm views against the 60 FPS target before expanding density limits.
- Keyboard/controller parity, reliable undo/redo and save/load for every new placement tool.

## Suggested sequence

1. Introduce the assembly/biome registry and extract one small additional kit. Prove mixed road spans, automatic supports and roundtrip saves.
2. Add the independent sky picker and a cross-biome static prop palette.
3. Add a stationary road hazard such as Vesper sap or a lava/fire floor. Validate exact road contact, reset, replay identity and clear visual warnings.
4. Add connected water systems and richer Nightweir/Zephyr construction assemblies.
5. Add Colossus moving machinery and Umbra lensing after the simulation and rendering budgets are established.

Each step is complete when a mixed course can be edited, saved/reopened, inspected with the free camera and driven through using the real physics, with matching visual/physical placement and no controller-only dead ends.

## Later editor capabilities

- **Optional trick mechanics:** a track setting enabling aerial tricks and a separate score display. Scores must not change race time, position or finish rules. Reuse the existing Freestyle mechanics without requiring the full Freestyle event format. Explicitly deferred from the current implementation.
- More sophisticated wave, pitch and rotation curves beyond the first section presets.
- Additional road pieces, branches, tubes and moving road, each with its own collision and race-progress contract.
- Custom Quick Race/Time Trial competition and separate custom-course records.
- Sharing, Steam Workshop and Steam Cloud, including version compatibility and asset availability checks.
- Final Electron/Steam release validation after browser authoring and gameplay are stable.

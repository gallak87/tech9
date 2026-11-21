# Track editor roadmap

Track Workshop already supports direct road editing, seeded circuits and downhills, rotation chunks, jumps, pickups, a track library, and real Practice sessions. All 17 base biomes have production scenery kits. The next milestone is a coherent authoring workspace and one Shatterline course that demonstrates a fast, shaped road through recognizable places. The first workspace pass ships a palette, viewport toolbar, inspector, direct Test Drive, and on-demand warnings and elevation profile. The detailed inventory below guides later refinements and the generation pilot.

## Workspace design

Use one document workspace throughout authoring. Borrow the menu, viewport, dock and inspector conventions from [Godot's editor](https://docs.godotengine.org/en/stable/getting_started/introduction/first_look_at_the_editor.html), with Vector Nova's own graphite surfaces, typography and red primary action. Keep the viewport dominant. Cyan identifies editable handles, amber identifies the selection, and red identifies blockers. Pair each with a label or symbol. Use a compact type scale, consistent field heights and aligned values. Show few handles at overview zoom and concentrate the editing guides around the selected span.

- **Header** groups File, Save and direct Test Drive. Track name, course type, Undo/Redo, Tunes and Back stay in the header.
- **Left dock** holds Road, Scenery and Pickups. Road contains starters, generation and a short outline of meaningful sections. Scenery contains thumbnail swatches, biome settings and landmarks. Pickups owns fill and density. Changing palettes preserves the selected road and current tool. An explicit clean-view toggle hides guides when inspecting scenery.
- **Viewport** owns Draw, Select/move, Height and Pan. The compact toolbar keeps Focus, Overview, Zoom, Fly, Map and Profile available. Keep ground-plane drag, right-drag orbit, wheel zoom and F to focus.
- **Right inspector** follows the selected track, point, section, jump or landmark. Put the common controls first and leave exact coordinates, numeric ranges and technical settings one disclosure deeper. Keep selection stable through palette switches and viewport changes.
- **Warnings and Profile** open on demand. Warnings locate measured issues and offer bounded repairs where available. Profile shows elevation against distance, jump gaps and finish/runout. Future refinements can align selected spans, bank and protected corridors with that plot.

### Screen and state inventory

| Surface                       | Proposed behavior                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Race Setup → Editor           | Keep the Editor entry in Race Setup. Show loading and a cancellable return to the previous session. Offer Retry and Back if the preview cannot open.                                                                                                                                                                                                                                                            |
| Draft recovery and first run  | Show the draft name and timestamp with Continue draft and Start fresh. Send backup failures to the status line with Save/Export as recovery actions. An empty Road dock offers the three playable starters and Draw from scratch. An incomplete road shows how many points are needed and exposes Finish Drawing when eligible.                                                                                 |
| File and library              | Anchor a command popover to File. Keep New track, Load, Delete saved, Reset road, Save a copy, Import and Export together with native dialogs. Show empty, busy, cancelled and failed states. Name the item at risk before deleting or discarding work that cannot be recovered.                                                                                                                                |
| Document settings and history | Show course type, width, length and downhill drop/runout at track level. Preview the impact of a type change on existing jumps, rolls and pickups before Apply. Save and Undo/Redo operate on committed drafts.                                                                                                                                                                                                 |
| Create Road                   | Begin with a style and length, then expose requested intensity and Customize. Keep seed, Curviness, elevation, Crossovers and jump options in Customize. Show progress and Cancel. Give the user a short result summary with actual length, grade, roll and what fit. Create and Try another variation each commit one accepted draft and one history entry. Keep the current draft on failure or cancellation. |
| Direct road editing           | Keep Draw, Move, Height and Hand visible. Click in Draw to place a point and drag empty space to pan. Use handles for point edits, a line/range highlight for section edits, and a ghost for unapplied work. Keep start, finish, jump lips and crossing-deck cues distinguishable.                                                                                                                              |
| Point inspector               | Select or move to a neighboring point. Offer raise/lower, insert, delete, reorder, bank trim and exact X/Y/Z. Keep width in track settings. A drag commits once. Escape restores the point.                                                                                                                                                                                                                     |
| Section inspector             | Select endpoints, extend or shrink the range, and focus the result. Offer straightening, raise/lower with eased transitions, bank/twist and road finish. Show length, entry/exit height, steepest grade, tightest radius, peak roll and protected features before Apply.                                                                                                                                        |
| Jump inspector                | Select an existing jump or find space. Show Small/Medium/Large, takeoff, receiver and recovery in 3D and Profile. Preserve assisted preview, resize, rebuild, remove and clear. Tuck manual anchors under Advanced. Label prediction progress and failures, with one Apply/Cancel pair and distinct cruise/boost forecasts.                                                                                     |
| Scenery and landmarks         | Show swatches and current versus pending world choices. Apply and variation reuse the road and pickups. Put density and seed in Scenery settings. A named landmark appears in the outline and inspector with side, offset and lock. An unfit landmark points to the conflicting section.                                                                                                                        |
| Pickups                       | Show fill preset, spacing, device count and legend beside the commands to refill or clear. Highlight placements in 3D/Map. Preserve exact layout through save and Undo.                                                                                                                                                                                                                                         |
| Map, camera and guides        | Treat 3D and Map as views of one selection, with linked Profile. Keep Focus, Overview, Zoom and Fly accessible in each appropriate view. Show deck separation at crossings, hide dense handles in overview, and keep a return target after Fly or a view change.                                                                                                                                                |
| Track Warnings and repair     | List issues to address before driving and advisory notes. Show measured values, limits and affected points. Locate issues in the viewport and offer bounded, undoable repairs.                                                                                                                                                                                                                                  |
| Test Drive setup              | Start a regular drive from the header or a point/jump start from its Inspector. Keep entry speed and reserve with the local starts and repeat the current start in Practice.                                                                                                                                                                                                                                    |
| Practice, Pause and return    | Cover driving HUD and map, touch, pause, restart, downhill finish, Settings, Tunes, Back to editor, and session-load failure. Restore the draft, editing context and launcher focus.                                                                                                                                                                                                                            |
| Compact and touch layouts     | At 1100 × 720 use a collapsible left palette and bounded inspector. At 390 × 844 show one active touch sheet with the viewport, Focus and Back still reachable. At 1440 × 900 show both docks. Verify large text/browser zoom and aim for 44 px touch targets.                                                                                                                                                  |

Use native focusable controls and the [menu input contract](ARCHITECTURE.md#menu-input-contract). Give every popover predictable Tab order, visible focus, and Escape/B return to its launcher. Announce status on decisions and commits. Verify complete create, shape, diagnose, repair, Test Drive, pause/Settings/Tunes, retry, save and reopen flows with mouse, keyboard and standard controller navigation. Also exercise damaged import, cancelled generation and draft recovery. This UX pass preserves the game's existing steering behavior.

## High-octane generation

The screenshot shows the distinction the generator needs to make. A raised point near 401 m produced a dramatic silhouette, but the adjacent point reported an 11.1 m radius against a 35 m minimum, plus grade and crossing issues. The desired shape needs an eased section, with enough distance to enter the climb, pass the crest and settle the deck. Elevation changes the centerline. Banking and twisting rotate the deck around it. The current generator emits zero authored bank and roll, with modest automatic banking applied by the sampler. Its density controls already shrink features to fit available road. In a read-only 5 km Shatterline run with seed 42, 44 m width, maximum Curviness/Elevation/Crossovers and Many/Large jumps, the result had one jump and no authored roll. [Current generator](src/editor/seeded-layout.js) · [Track checks](src/editor/document.js)

1. **Plan the sections and reserve their distance.** Start with the current horizontal layout for the first pilot or a known campaign-inspired section sequence. Allocate grids, circuit closure or the 600 m downhill runout, overpass approaches, bank transitions, and jump approach/takeoff/receiver/recovery before shaping the profile. Assign the seed a small set of named beats and transition lengths. Base styles such as Carve, Weave and Big Air pick different priorities. Numeric controls tune the requested intensity within those budgets.
2. **Shape the centerline and deck.** Fit smooth height curves between anchors with compatible entry/exit grades. Shape elevation and deck rotation independently, then evaluate the actual combined 3D frames. Use sustained crests, plunges and linked banked carves, with some ordinary road to set up the next move. Solve the height difference at a crossover against both rotated road decks, supports and camera corridors. Keep the start, runout and reserved takeoff/receiver frames stable. Refit connector lengths so the course stays at the requested physical length. Expose the same bounded section shaping operator in the inspector for hand-built roads.
3. **Build the jumps inside their reservations.** Use the same flight and landing checks as assisted jump editing. Keep each approach, lip, receiving deck and recovery as a unit. Reject or resize a gap that cannot fit the planned speed, visibility and clearance. Validate after every connector adjustment that can change the approach. Rebuild pickups and scenery after the road is resolved.
4. **Accept a single versioned result.** Reuse bounded deterministic attempts and independent seeded draws for route shape, vertical profile/roll and gaps. Check spacing, centerline radius, grade changes, roll rate, deck separation, road/camera/flight envelopes, finish clearance and downhill runout. Keep strict generation checks. Try an alternate section or reduce the lowest-priority optional feature when the request conflicts with the available metres. Report the tradeoff and actual features, or leave the existing draft intact if no candidate passes. Commit the resolved road once. Saved points, roll, jumps and ordered anchors stay authoritative. Retain historical seed versions.

**Pilot.** Use a 5 km Shatterline Circuit with an over-under crest/dive, one linked banked S and one legible jump. A read-only proof added a smooth 40 m lift and roughly 55° of roll across an unprotected 800 m section of the seed 42 road. The result passed strict geometry checks at roughly 5.01 km, with an 85.8 m minimum radius and 33.4% maximum grade. The remaining jump landed in both cruise and boost predictions. This measured geometry and forecast flight. The implementation still needs exact length fitting and live Practice validation.

**Promotion gate.** Compare the same seed and length against the current generator in map, profile and chase-camera views. Test tight and short requests at 3 km, the 5 km pilot, and the 20 km budget case, with low and all-max settings across several fixed seeds. Verify materially different ordering of carves, climbs and jumps, deterministic replay, and predictable handling when an optional feature cannot fit. Test a 5 km Vesper Downhill with distinct pacing and a supported finish before widening the pool. Use the stock hulls at representative cruise and boost conditions and real approach, apex and landing runs. Confirm one-step undo and exact save/load of the selected candidate.

## Biome storytelling

Start with route-led landmarks in Shatterline. The 5 km pilot leaves a **service shelf**, reveals a broken accelerator crown on the **banked turn**, then aims a transfer at a **receiving terrace**. Use existing shelter, strata, crown, foundation and receiving-tower assets. Give each landmark a job the driver can read at speed. Leave quieter connectors between the beats. [Shatterline art direction](docs/ART_BIBLE.md#shatterline) · [Current placement](src/editor/shatterline-environment.js)

1. **Pin up to three landmarks to a route.** Select a section or an anchor point, choose a swatch and a side, then apply. Store the assembly ID, version, section/point anchors, offset and lock. Ground scenery in world-up and follow the road frame for fixtures attached to the deck. Reserve the landmark footprint, sightline and complete driving/flight/camera envelope before filling surrounding scenery. Show an actionable conflict for a placement that cannot fit. A scenery reroll retains locked landmarks and the authored road.
2. **Let landmarks guide a new route.** Once positioning works on a drawn road, offer a short ordered sequence of compatible places during Create Road. Treat the landmarks as target windows in the first generation pass, with clear constraints if a window cannot be hit. Begin with Shatterline, then try Nightweir quay → basin → spillway or Vesper roots → canopy → river.
3. **Prove one trip at driving speed.** Review the approach, reveal, touchdown and an ordinary connector in the actual chase camera. The receiver should be readable before takeoff. Check foundations, both decks at crossings, locally edited and reopened drafts, High/Low and reduced motion. Compare matched warm frame times, draw calls, triangles, memory and available GPU timing against the 60 FPS target. Refresh real preset captures when their scenery changes. Add one stationary, legible hazard after this workflow is reliable. [Environment capture tools](tools/README.md)

## Delivery order

1. Build the workspace shell and linked Profile/Track Checks first. Use the screenshot's crest edit as the first end-to-end repair and test-drive case.
2. Prototype the versioned Shatterline section pipeline and prove it in Practice. Extend to the Vesper Downhill pilot when the data and editing flow work for both track types.
3. Compose the first Shatterline journey using three route-led landmarks. Validate readability and clearance before using landmarks to constrain generated routes.
4. Reuse compatible authored or campaign-inspired sections as remix donors after the section and validation contracts work. Expand to mixed scenery, more skies, props and moving hazards when the single-biome workflow and measured rendering budgets support them.

## Completed foundation

- **Road / Environment contexts:** one preview, one saved course and one Undo/Redo history. Changing context preserves the active pointer tool, selection and camera. Generation/replacement actions are explicit.
- **Focused authoring UI:** one compact preview strip; camera controls stay visible, Road tools stay out of Environment, and common point/jump actions precede precision controls. Creation starts with a style and length; File contains track management.
- **Independent seeds:** road generation preserves the applied environment; environment regeneration preserves authored road points, roll/bank, jump anchors and pickups. Pending world controls remain separate from the applied saved course.
- **Nightweir regions:** seeded terrain, connected shore/basins/canals, neighborhoods, near-road wards, industrial yards, parks and founded landmarks. Automatic infrastructure reserves road, camera and flight corridors.
- **Whole-course biomes:** all 17 base world families have curated characters, production scenery/road kits and registered backdrop/lighting. Static GLBs, canonical procedural assemblies and owned material finishes adapt to seeded custom roads; campaign routes and active hazards remain separate. Mode variants reuse their base biome.
- **Compatibility:** legacy missing environment data inherits its old seed and roadside layout; new courses use production scenery layout 4, while saved layouts 0/1/2/3 remain supported until explicit Environment Apply. Loading never regenerates authored road points.
- **Jump editing and local testing:** sampled size proposals, reversible resize, stock point/jump starts, immediate retry and retained actual landing/miss feedback.
- **Draft recovery:** separate applied-draft checkpoints, native Continue/Start fresh, unchanged explicit library saves.
- **Stable regional editing:** layout 2 preserves earlier layouts, clips Nightweir courts to terrain/shore contours and reuses unchanged distant buffers after full CPU clearance checks.
- **Road-finish pilot:** anchored Nightweir/Vesper sections, passive join bands, continuous physical decks and shared Undo/save behavior. Environment mixing remains below.

## Production scenery foundation and next polish

- Production kits now cover all 17 families. Shatterline retains its layout-3 adapter; layout 4 introduces the other 16 without changing saved layouts 0–3 or campaign placement. Nightweir has a retained original-builder Blender editor kit; Nacre has ocean seabed, reef and observatory composition; forest and industrial maps retain their existing provenance.
- Keep curated visual presets and independent environment seeds as the primary workflow. Coherent complete assemblies are a useful starting point; further terrain and construction polish can be incremental without blocking the other families.
- Refine prominent terrain cuts with authored geological assemblies and richer road-edge/support treatments where they improve racing views. Regional terrain is still a generated foundation, not a replacement for authored campaign composition.
- Add distance/quality-specific simplification and culling for production scenery, especially long Downhill courses. Low currently reduces texture/postprocessing budgets while retaining static kit geometry. Contact is already bounded separately: selected structures use exact open geometry, forests use trunk proxies, and remaining art is explicitly decorative with complete visual clearance.
- Extend connected water, suspended districts and large habitat sectors through family adapters; active/moving hazards still need their own simulation contracts.
- Refresh actual generated preset thumbnails when their scenery changes. Keep representative racing views alongside overviews when judging scale, density and material readability.

The simple-first approach is consistent with [Nadeo's Trackmania design discussion](https://news.ubisoft.com/en-ca/article/2TT6868Gzx9cZpbqOVXCJn/trackmania-nations-remake-revealed), which describes recovering simplicity as map-making gained depth. Our adaptation is a small useful starting choice with optional precision, rather than copying its block model or artwork.

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

## Later editor capabilities

- **Optional trick mechanics:** a track setting enabling aerial tricks and a separate score display. Scores must not change race time, position or finish rules. Reuse the existing Freestyle mechanics without requiring the full Freestyle event format. Explicitly deferred from the current implementation.
- More sophisticated wave, pitch and rotation curves beyond the first section presets.
- Additional road pieces, branches, tubes and moving road, each with its own collision and race-progress contract.
- Custom Quick Race/Time Trial competition and separate custom-course records.
- Sharing, Steam Workshop and Steam Cloud, including version compatibility and asset availability checks.
- Complete full Steam release validation after browser authoring and gameplay are stable. Native and browser track storage share a bounded file format and test current biomes, legacy environments, and assisted jumps.

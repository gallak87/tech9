# Track editor roadmap

## Next up

1. **Improve seeded scenery on the sparsest biomes.** Compare the same long course in each biome from the overview and the chase camera. Prioritize worlds where isolated props disappear at racing speed. Aim for roughly 80% of the visible map to feel composed, with more detail near the road. Use connected groups that suit the terrain, and leave open water, sightlines and jump landings clear. The player should get this result by choosing a preset and clicking **Apply environment**.
2. **Give Shatterline’s 5 km starter a recognizable sequence.** Start on a service shelf, reveal a broken accelerator crown as the ship banks, then aim the jump at a receiving terrace. Place the crown against the actual turn and the terrace against the actual landing. Check in Practice that the crown comes into view through the corner and the driver can see the receiver before takeoff at cruise and boost speeds. [Shatterline art direction](docs/ART_BIBLE.md#shatterline)

## Authoring gaps

- When switching between Circuit and Downhill would clear authored roll sections, jumps or pickups, show which items the draft would lose before applying the change.
- Let the player cancel **Create road** or **Try another variation** and keep the current draft. Report the generated length, steepest grade, peak bank and any requested features that did not fit.
- Let a selected span rise or fall with smooth transitions at both ends. Show its steepest grade and tightest radius. Mark the bank angle and protected approach, landing and runout distances on the elevation profile so the player can see where the edit will take effect.

## Long-course performance

- After a local road edit, recompute terrain, scenery placement and clearance only in affected regions. Include nearby decks at crossings and jump corridors. Check that both visible scenery and collision match a full rebuild.
- Identify which distant scenery costs the most on 20 km courses, including downhill. Measure warm driving views on Low and High against the 60 FPS target, then simplify or cull the costly distant assemblies. [Existing measurements](docs/TRACK_EDITOR.md)

## Parked ideas

- **Campaign remixes.** Borrow a carve, wall ride or jump sequence from a shipped circuit. Reshape its connections to fit the seed and course length, then verify the racing line and landing on the generated road.
- **Landmark editing.** Let players pin up to three assemblies to road points, adjust their side and offset, and keep them through a scenery reroll. Later, let an ordered set of landmarks guide a new route.
- **Mixed environments and skies.** Extend per-span editing to the surrounding scenery, supports and foundations. Blend adjacent kits across the seam. Allow a separate sky choice with its matching light, fog and reflections.
- **Manual scenery and hazards.** Revisit area painting or placement of complete assemblies if seeded fill still leaves a gap. For functional hazards, start with one readable effect such as Vesper sap slowing a ship on a banked deck. Its visible footprint, collision and gameplay effect should agree before adding moving machinery.
- **Road pieces and scoring.** Explore editable wave, pitch and roll curves, branches, tubes and moving road. Keep optional Freestyle trick scoring separate from race time and position.
- **Sharing and release.** Make course identities reproducible across runtimes before sharing tracks through Steam Workshop or syncing them through Steam Cloud. Verify file and asset compatibility, then complete the editor workflow on the packaged game with physical Steam Input. [Steam release checklist](docs/steam/release.md)

# Zephyr Basilica scene assets

This kit models the selected [scene reference](zephyr-scene-reference.png) as editable stone, bronze, glass and flowing-water geometry. The exact imagegen prompt/tool/output provenance, dimensions, mesh roles and approximations are in [asset-manifest.json](asset-manifest.json). The geometry kit retains CPU-baked contact occlusion using the exported split normals at actual mesh corners; live lighting supplies illumination. It contains no image planes or embedded textures. The separately owned [selected panorama](SKY_PROVENANCE.md) supplies distant cloud atmosphere.

The [Blender library](zephyr-asset-library.blend) keeps each asset in a named collection at its export origin; only the facade collection starts visible. Isolate a collection to edit it. [build_assets.py](build_assets.py) reproduces the complete geometry and GLBs using Blender CPU modeling/export. Regeneration replaces generated outputs; save manual variants separately.

From the game directory:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/levels/zephyr/build_assets.py -- "$PWD"
python3 assets/levels/zephyr/validate_assets.py "$PWD"
```

The generator writes conventional Python JSON; the repository pre-commit hook formats the manifest. No rendering, GPU baking, browser or server is needed for those commands.

Runtime mesh vertices are baked into **metres, X lateral, Y up, forward +Z**. GLB nodes have identity transforms. The Python modeling API uses those game coordinates and converts them to Blender native Z-up as `(X, -Z, Y)` before export. Align architecture to route yaw and choose its road-relative height explicitly. Place island terrace origins sufficiently below the road: perimeter pinnacles reach approximately 30 m above an island's local origin.

The facade, nave and chapel contain actual clear apertures. The CPU validator reads the exported GLBs and checks every triangle against each declared rectangular clearance using a separating-axis test, in addition to binary integrity, bounds, finite positions, unit normals and nondegenerate triangles. This does not certify route placement, curved-road clearance, camera behavior or the final game lighting; those require the level's production-camera checks.

The falling tower rotates around its base origin. Waterfall vertices descend from the source lip at `y=0`, so deformation can use `-position.y / 360`; cloned geometries are needed when individual falls deform independently. Water meshes are merged by the `water`, `water_silver`, `water_shadow` and `water_foam` roles. The curtain combines a thin central veil, deeper outer lobes and long foam ropes. Its central material density is attenuated across the driving sightline, allowing the receiving deck to remain visible. Wet presentation, spray, simulation-time motion and the trailing arc are owned by the level.

Original procedural geometry was authored for this task from the generated scene reference. No third-party meshes, textures or fonts are included. The manifest preserves the modeling approximations; the kit is subject to the lane's single production critic workflow and final human approval.

The current kit includes eroded island caverns, carved leaf capitals and closed voussoir vaults. Layered water volumes overlap at unequal lengths; the falling arc updates its deformed normals and carries porous foam instances plus bounded spray. It adds small modeled bevels to carved stone and bronze, a compressed nave vault for the banked racing camera, and a source reservoir with spill channels, full-height piers and foundations. The exporter triangulates and removes zero-area bevel faces before validating. `environment/materials.js` adds metric sediment, pores and bronze patina without replacing mesh relief. The original generated [limestone tile](zephyr-limestone-v1.png) adds local triplanar stone detail; its exact prompt, tool and native output are retained in [material provenance](MATERIAL_PROVENANCE.json). `environment/details.js` connects bridge keels and architectural plinths to the island terraces and owns bounded source-fed spray.

The v2 panorama was selected over the earlier procedural backdrop and v1 image because its ivory/peach backlight and violet cloud volume fit the original drawing. The native source is copied to `public/assets/levels/zephyr/zephyr-sky-v2.png`; runtime longitude overlap, analytic derivatives and pole blending preserve wrap without editing source pixels. Shape review retains the neutral procedural backdrop.

Water exposure uses the actual route curtain intervals and grounded contact. Recorded crossing time keeps droplets and ship wetness through flight, with time-based drainage and faster clearing in the nave. Deck gloss is confined to curtain receiving strips. Sky/cloud/flow and droplets simplify under reduced motion while the deterministic falling tower still reports the event. The weather module and forest adapter informed the exposure/shelter design; no source was copied from them.

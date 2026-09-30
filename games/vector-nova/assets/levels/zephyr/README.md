# Zephyr Basilica scene assets

This kit models the selected [scene reference](zephyr-scene-reference.png) as editable stone, bronze, glass and flowing-water geometry. The exact imagegen prompt/tool/output provenance, dimensions, mesh roles and approximations are in [asset-manifest.json](asset-manifest.json). Runtime exports contain no image planes, embedded textures or baked lighting.

The [Blender library](zephyr-asset-library.blend) keeps each asset in a named collection at its export origin; only the facade collection starts visible. Isolate a collection to edit it. [build_assets.py](build_assets.py) reproduces the complete geometry and GLBs using Blender CPU modeling/export. Regeneration replaces generated outputs; save manual variants separately.

From the game directory:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python assets/levels/zephyr/build_assets.py -- "$PWD"
python3 assets/levels/zephyr/validate_assets.py "$PWD"
npx prettier --write assets/levels/zephyr/asset-manifest.json
```

The generator writes conventional Python JSON; the final command applies repository formatting. No rendering, baking, browser, server or GPU is needed for those commands.

Runtime mesh vertices are baked into **metres, X lateral, Y up, forward +Z**. GLB nodes have identity transforms. The Python modeling API uses those game coordinates and converts them to Blender native Z-up as `(X, -Z, Y)` before export. Align architecture to route yaw and choose its road-relative height explicitly. Place island terrace origins sufficiently below the road: perimeter pinnacles reach approximately 30 m above an island's local origin.

The facade, nave and chapel contain actual clear apertures. The CPU validator reads the exported GLBs and checks every triangle against each declared rectangular clearance using a separating-axis test, in addition to binary integrity, bounds, finite positions, unit normals and nondegenerate triangles. This does not certify route placement, curved-road clearance, camera behavior or the final game lighting; those require the level's production-camera checks.

The falling tower rotates around its base origin. Waterfall vertices descend from the source lip at `y=0`, so deformation can use `-position.y / 360`; cloned geometries are needed when individual falls deform independently. Water meshes are merged by the `water`, `water_silver`, `water_shadow` and `water_foam` roles. The curtain has separate ropes with approximately 46–49% open silhouette at 40–60 m below its source, allowing a landing to remain visible. Wet presentation, spray, simulation-time motion and the trailing arc are owned by the level.

Original procedural geometry was authored for this task from the generated scene reference. No third-party meshes, textures or fonts are included. The manifest preserves the modeling approximations; the kit is subject to the lane's single production critic workflow and final human approval.

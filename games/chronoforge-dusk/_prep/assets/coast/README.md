# Coastal kit — original Blender sources

`author_coast.py` authors the eight initial metre-scale static assets in pinned Blender 5.1.1. Each source has editable geometry, explicit UVs, packed base color and ORM maps, recipe metadata and provenance. Run one named part per Blender process so only that part's material inventory is saved:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python _prep/assets/coast/author_coast.py -- NEW_REVISION arch
python3 _prep/pipeline.py build _prep/assets/coast.arch/asset.json
python3 _prep/pipeline.py handoff _prep/candidates/coast.arch/NEW_REVISION/manifest.json
```

The normal runtime consumes the selected descriptors through `DuskAssetAssembly` and batches their imported meshes. Collision and layout remain game-owned. Static assets are not registered as characters. Blender reimport verifies texture pixels, inventory and height for every part. Base-color and packed ORM images are original deterministic maps; no external textures or geometry were acquired. The original Chronoforge Haventide image was viewed only as a color/material reference.

Preparation finding: portable roughness/metallic textures must use explicit glTF channel packing. An unpublished build caught Blender's automatic channel conversion; authoring packed ORM maps fixed it without changing the pipeline. Use the exact script hash listed by each source revision. Future source edits need fresh identities.


Current selection: seawall, arch, bollard, supplies, rocks, grass and tower **r1**; repair bridge **r2**; tide pump **r1**. `author_pump.py` uses the original local material/geometry helpers to author the ninth asset. `revise_bridge.py` creates r2 from the original r1 source, adding bolted salvage rails. Its export/reimport retains the existing maps. The current recipe rebuilds from the r2 master; the original r1 master is retained as a provenance input, while superseded candidate/runtime packages live in the scenery checkpoint in Git.

The owner-authorized room follow-up adds `coast.workshop/r1`, authored by `author_workshop.py` using these same local helpers. Named roof/front-wall meshes survive the existing static export so the game can use one full-scale shell outside and inside, with intentional cutaway visibility. See [the room POC](../../../evidence/room-poc/README.md).

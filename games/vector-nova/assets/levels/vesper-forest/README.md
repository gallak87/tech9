# Carved ancient oak

The giant is a baked solid tree with a real helical driving passage. It uses
Worldkit's independent authored growth graph and fresh Sapling fine branches;
Vesper supplies the route cutter and final placement. The former radial hollow
generator is not an input to this asset.

`ancient-oak-v1.glb` is the runtime export; `ancient-oak-v1.blend` retains the
editable joined wood, original growth sweeps, passage cutter and fine-growth
sources. The JSON manifest records recipe hashes, geometry counts and export
hashes. Bark and leaf images remain borrowed from Worldkit.

## Rebuild

From `games/vector-nova`, using Node 22:

```sh
node assets/levels/vesper-forest/export-tree-clearance.mjs
blender --background --factory-startup \
  --python ../../worldkit/modules/living-forest/art/ancient-oak/build_ancient_oak.py -- \
  --passage .experiments/giant-rebuild/clearance.json \
  --output assets/levels/vesper-forest/ancient-oak-v1
BLENDER_USER_RESOURCES=/path/to/isolated-sapling-profile \
  blender --background --factory-startup \
  --python ../../worldkit/modules/living-forest/art/ancient-oak/build_canopy.py -- \
  --blend assets/levels/vesper-forest/ancient-oak-v1.blend
```

The canopy step needs Sapling Tree Gen 1.0.0; installation and attribution are in
the [Worldkit Sapling guide](../../../../../worldkit/modules/living-forest/art/sapling/README.md).
The clearance JSON is deterministic build input regenerated from the current
route and terrain, and stays ignored. No local absolute source path is required
to rebuild the asset.

Review the wood with leaves hidden before judging the full canopy. Check the
actual retained bark, heartwood, twigs and moving foliage against the entire
road/camera corridor after rebuilding, then refresh the circuit's menu preview.

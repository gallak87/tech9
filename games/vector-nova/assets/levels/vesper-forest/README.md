# Carved ancient oak

The giant is a baked solid tree with a real helical driving passage. It uses
Worldkit's independent authored growth graph and fresh Sapling fine branches;
Vesper supplies the route cutter and final placement. The former radial hollow
generator is not an input to this asset.

`ancient-oak-v1.glb` is the runtime export; `ancient-oak-v1.blend` retains the
editable joined wood, original growth sweeps, passage cutter and fine-growth
sources. The JSON manifest records recipe hashes, geometry counts and export
hashes. Fine branches, heartwood and leaf images remain borrowed from Worldkit.
The outer bole and primary limbs use Vesper's dedicated coarse bark palette.

## Landmark bark

`ancient-oak-bark-v1.jpg` is a 1024px custom albedo with broad interlocking plates,
encoded from the retained built-in imagegen source in `bark-source/`. The exact
prompt and source/output hashes are retained there. The 512px grayscale
`ancient-oak-bark-height-v1.png` approximates relief from source luminance with
a wrapped low-pass filter; it is bump data, not measured displacement.

[The giant material](../../../src/levels/vesper-forest/environment/ancient-oak-material.js) repeats both maps every 52 metres on the
wood's existing metric UVs. Only `AncientOak_Bark` receives this owned palette;
grove trees, small branches and carved heartwood keep their existing materials.
No geometry or Worldkit shared image is changed. Re-encode the runtime maps with
Node 22 and local Chrome from `games/vector-nova`:

```sh
node assets/levels/vesper-forest/bark-source/prepare.mjs
```

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

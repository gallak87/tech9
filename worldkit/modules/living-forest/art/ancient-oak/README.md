# Joined ancient oak source

`shape.json` authors a new solid tree as unequal, curved growth paths with
variable radii. It supplies the leaning bole, substantial forks and grounded
buttresses; it does not reuse the Living Forest hollow-shell generator.

`build_ancient_oak.py` runs in Blender 5.2 or later. It joins capped growth sweeps
with voxel remeshing, rounds their junctions, and transfers metre-scaled bark UVs
from the original sweeps. Optional consumer-owned passage data supplies a swept
Boolean cutter. The tree and its passage use local metres and +Y up.

```sh
blender --background --factory-startup --python build_ancient_oak.py -- \
  --shape shape.json --passage /path/consumer-clearance.json \
  --output /path/consumer-assets/ancient-oak-v1
```

The output stem produces `.blend`, `.glb` and `.json` files. The editable blend
retains the individual growth meshes, original UV donors and watertight cutter
in a hidden source collection. The GLB contains `AncientOak_Bark` and, when a
passage intersects the tree, `AncientOak_Heartwood`. It has no material or image
payload. Consumers supply materials and own derived route-carved assets.

The passage accepts `route.samples` records containing `point`, `right`, `up`
and optionally `cutterPoint`. `clearance.cutterRadius` and
`clearance.centerOffsetUp` configure its section. Remote route segments are
trimmed only outside an expanded tree bound, leaving cutter end caps beyond the
wood. Voxel and decimation tolerances require an explicit clearance reserve;
consumers must verify the actual finished triangles against their complete
driving and camera corridor.

After carving, clearly overstretched transferred UV faces are projected through
one lateral source-triangle chart per target face. Buried cap fans are excluded
from the donors. This avoids interpolating unrelated longitudinal charts inside
one triangle when large growth sweeps overlap. The repair changes UVs only;
positions, normals and separately owned foliage attributes remain intact.

After triangulation the builder removes only sub-0.01 m² dangling Boolean ears
whose edge face counts are `[1, 1, 3]` and whose longest edge is below 0.5 m.
Removing that extra fin restores its supporting edge to two faces; ordinary
small surface triangles are retained. Detached voxel wisps are removed only when
they have fewer than 64 vertices and span less than 4 m. The manifest records
cleanup and final component/boundary/nonmanifold edge counts.

## Fine canopy bake

Review the bare solid form before adding fine wood or foliage. `build_canopy.py`
opens that approved `.blend` and grows fresh Sapling graphs at the penultimate
point of each non-buttress path. It checks the manifest's shape hash before
modifying the asset, so a changed shape requires a new bare bake and review.

Run from this directory with **Sapling Tree Gen 1.0.0** installed in the isolated
Blender profile described in the [Sapling source guide](../sapling/README.md):

```sh
BLENDER_USER_RESOURCES=/tmp/worldkit-sapling-profile blender --background --factory-startup \
  --python build_canopy.py -- \
  --blend /path/consumer-assets/ancient-oak-v1.blend \
  --shape shape.json --canopy canopy.json
```

`canopy.json` owns the new seeds, branching settings, scale range, attachment
inset, root-width policy and geometry budgets. The source tree's +Z growth axis
rotates orthogonally into the final parent-path direction; the grown volume is
preserved. Root centers sit inside their parent wood, and radii target 45% of
the parent radius with a 60% safety cap. Fine wood is sampled from actual Bezier
growth curves, simplified while preserving curvature and radius changes, and
swept with metre-scaled bark UVs. Review the combined wood with leaves hidden
before judging the full canopy.

Both tree builders use the canonical curved cutout spray implementation in
`../sapling/foliage.py`. The original grove builder imports that same helper;
extracting it does not regenerate or change the existing grove assets. Attached
sprays retain `_WIND_ANCHOR`, `_WIND_WEIGHT`, `_WIND_GRADIENT` and `_WIND_PHASE`
for Worldkit Weather. Custom vector attributes are explicitly encoded in glTF's
Y-up frame. Never voxel-remesh or decimate the leaf cards and their attachment
attributes.

The canopy stage replaces only its owned hidden fine-growth collection and
runtime `AncientOak_Twigs`/`AncientOak_Leaves` objects. It preserves the carved
bark and heartwood meshes. The compressed editable blend retains every new live
Sapling source, width adjustment and generated branch mesh. Its GLB exports the
four named runtime parts without embedded materials or images. The consumer
manifest records the canopy recipe hash, cluster seeds/attachments, actual root
radii, spray count, triangle counts and final GLB hash.

## Source ownership and credits

Worldkit owns this reusable shape, build code and canopy recipe. Consumers own
their route-clearance input and derived carved `.blend`/`.glb`/`.json` outputs.
No old hollow-shell mesh, profile or Sapling crown module is used in this tree.
The bark and cutout images remain the canonical Living Forest assets with their
[existing provenance](../../assets/provenance.json).

Sapling Tree Gen 1.0.0 is a free GPL-3.0-or-later build tool. The canopy starts
from the adapted **Coast Live Oak** settings credited to Brad Chamberlain
(2026, preset source GPL-3.0-only), then supplies fresh seeds and fine-branch
settings in `canopy.json`. The parameter recipe retains that source credit;
the tool is required for rebuilding, not for the runtime game. Full upstream
credits and the verified installation archive are in the
[Sapling source guide](../sapling/README.md).

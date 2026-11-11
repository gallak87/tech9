# Crown glacier sector

A course-private replacement for the **crown-fault** geological host in
Glasswake Fracture. The other two private massif sites and the original
Glasswake level remain unchanged. Thick unequal shear masses, offset deep
cobalt galleries and a founded folded return form the landscape itself;
separate roof cards or luminous shelf rules are not added in front.

From `games/vector-nova`, regenerate the temporary editor guide and build:

```sh
node assets/levels/eliminator-glasswake/export-sector-guides.mjs /tmp/glasswake-sector-guide.json
blender --background --factory-startup --python assets/levels/eliminator-glasswake/glacier-sector/build_glacier_sector.py -- --guide /tmp/glasswake-sector-guide.json
```

The explicit guide path can be absolute or relative. Its large temporary JSON
is not shipped or required at runtime. The Blend retains six editable closed
geological volumes, live constructive unions, the exact production parent and
editor-only world road/geology/camera references. Runtime exports only the new
native identity prototype `fracture_glacier_sector`, with a closed geological
body and separate embedded mineral. Coordinates are native host metres: +Y up,
+X outboard, +Z along shore. The closed Y0 foot is 15 m beneath the existing
basal datum under the retained production parent.

The selected [original reference](../../glasswake/scene-reference.png) and
[exact prompt](../../glasswake/scene-prompt.txt) establish pale overburden,
compact blue planes, deep cobalt recesses and a dark mineral inclusion.
Broad geometric fault shears and tapered ends break the existing masses; the
Y0 foot stays fixed. The core has two broad cleavage faces. No fine noise or
cavity bake supplies this shape. Established canonical scalar material roles are reused; runtime supplies the
existing owned ice tile and material finish. No new lights, textures, motion
or gameplay surfaces are introduced by this source.

The dark inclusion is an intentional project-owned derivative of only the
`Trapped meteoric inclusion` material primitive in the canonical v5 GLB. Its
ornamental pale torus primitives are excluded. The source manifest records the
input asset hash, selected primitive and actual containment inside the new
closed body. The retained sector adds a stratified glacial pocket to one crown encounter.
Broad planar fault faces remain; the source adds no lighting or material bake.

`manifest.json` records source/Blend/export/reference hashes, semantic guide
identity, source closedness, actual mineral containment, the founded foot and
actual-triangle checks against every retained broad banked road/camera volume
(X ±42 m, Y −12..90 m, Z ±16 m). Source hashes are snapshots; the semantic guide
identity protects geometry through source-only formatting changes.

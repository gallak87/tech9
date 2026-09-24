# Forest kit provenance

`forest-kit.glb` is the runtime export of `art/forest-kit.blend`, authored for this
scene with the deterministic Blender script `art/build_forest.py`. Tree, rock,
and log geometry and timber end-grain artwork are original to this project.
Grass and fern geometry are selected CC0 Poly Haven variants. The pine
spray is a derivative collage of CC0 photographed needles. Pine silhouettes use
tapered, irregular branch geometry and
individual alpha-tested shoot cards; there are no cone/tree stand-ins.

Photographic PBR source images are **CC0 1.0** from Poly Haven:

| Material | Asset | Creators | Files used |
| --- | --- | --- | --- |
| Bark | [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) | Rob Tuytel | 1K diffuse, OpenGL normal, roughness JPG |
| MossyGranite | [Rock Boulder Cracked](https://polyhaven.com/a/rock_boulder_cracked) | Dimitrios Savva (photography), Dario Barresi (processing) | 1K diffuse, OpenGL normal, roughness JPG |
| PineNeedles | [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) | Rob Tuytel (photography), Rico Cilliers (original model) | 1K twig diffuse JPG and twig alpha PNG; only image sources used, no model geometry |
| MeadowGrass | [Grass Medium 01](https://polyhaven.com/a/grass_medium_01) | Rob Tuytel (photography), Rico Cilliers (modeling) | Tall B, Small B and Tiny C model variants; 1K diffuse, alpha, OpenGL normal and ARM maps |
| ForestFern | [Fern 02](https://polyhaven.com/a/fern_02) | Rob Tuytel (scanning), Rico Cilliers (modeling) | A and D model variants; 1K diffuse, alpha, OpenGL normal and ARM maps |

Source metadata was obtained from `https://api.polyhaven.com/files/{asset}` and
`https://api.polyhaven.com/info/{asset}` on 2026-09-24. Original downloads remain
in `art/textures/`, and images are embedded in the GLB and packed in the Blender
project. See [Poly Haven license](https://polyhaven.com/license).

Plant sources are reduced to the five selected meshes in `art/sources/`, only
86 KB of source geometry. Upstream URLs and MD5 checksums are pinned in
`art/sources/manifest.json`. The optional `art/acquire_groundcover.py --download`
verifies and reacquires the upstream files, then trims all unused mesh variants.
Normal builds and the browser runtime use local files and need no network.
`grass_short_lod` is a 194-triangle Blender decimation of the 653-triangle tuft.

`forest-granite-diff.jpg` is a derivative of the CC0 orange stone scan, graded
to gray forest granite with patchy olive moss while retaining photographed
detail. The rock color attribute adds further nonuniform moss tint. Pine vertex
colors vary the density of foliage shading. Bark and rock
retain photographic normal and roughness maps. `PineNeedles` deliberately uses
glTF `MASK`, cutoff 0.42, double-sided, avoiding blended foliage sorting and
giving foliage correct cutout shadows. `generate_needles.py` isolates the pine
shoot from its source UV atlas and composes overlapping shoots into a broad
spray, preserving coverage at ordinary viewing distances. Source branches are
not rectangular opaque decals. Runtime may lower cutoff slightly for coverage
and add a small foliage bounce-light response.

The published grass and fern glTF files reference JPEG base color images even
for cutout foliage. `generate_needles.py` reconstructs RGBA PNGs from their
separate official alpha maps. Export validation confirms embedded PNG alpha
ranges from 0 to 255, and materials use `MASK` with photographic normal and
roughness maps. This prevents rectangular grass/fern cards.

## Rebuild

From `games/scene-test`, with Blender 5.1+ and Python 3 with Pillow installed:

```sh
python3 art/generate_needles.py
blender --background --factory-startup --python art/build_forest.py
```

`npm run assets:build` runs both steps. Set `PYTHON_BIN` or `BLENDER_PATH` if
needed. The build uses the committed source meshes and images offline.

The builder uses factory startup and never touches an existing interactive
Blender document. It writes the GLB, packed `.blend`, and measured
`art/asset-report.json`. The small final GLB JSON adjustment makes Blender 5's
dithered foliage export an explicit glTF alpha cutout.

## Runtime contract

Base-origin, metre-scale, +Y-up groups: `pine_a` (21.5 m), `pine_b` (24 m),
`pine_c` (19.6 m), `pine_sapling` (5 m), `rock_a`, `rock_b`, `fallen_log` (5.4 m). Each pine has `*_wood` and `*_needles`
children, each rock one `*_stone` mesh, and the log bark/end-grain children.
Keep prototype hierarchy transforms when extracting meshes for instancing.
Materials are shared and named `Bark`, `PineNeedles`, `MossyGranite`, and
`TimberEndgrain`. Ground cover groups are `grass_tall` (0.51 m), `grass_short`
and `grass_short_lod` (0.25 m), `grass_tiny` (0.21 m), `fern_a` (0.57 m) and
`fern_b` (0.43 m). Each has a `*_leaves` child with `MeadowGrass` or `ForestFern`
material. The tiny grass is a sparse accent; full short tufts provide coverage.
Material textures repeat in both dimensions. Instanced trees
should share geometry and materials; do not clone image data per tree.

`pine_c` is an older, leaning, asymmetric open-crown variant. Its bole leans
2.7 m, the crown starts at 61% of trunk height, and one side carries longer
scaffold limbs. Its 4,186 triangles distinguish its form from the taller,
fuller 6,490-triangle A/B crowns without adding another foliage material.

The rock prototypes begin as asymmetric chipped granite chunks with broad
fracture planes. Uneven shoulders, 10.5 cm worn bevels, local subdivision and
small coherent displacement soften the cut boundaries and break straight edges.
Runtime reduction retains 2,556/2,280 triangles. Top-facing zones carry stronger
localized moss while exposed fracture faces retain photographic stone detail.
Box UVs use 3.2 repeats per metre before runtime scaling, keeping cracks smaller
than the broad geological forms; the shared normal map supplies fine relief.

See `art/asset-report.json` for exact triangle counts and GLB bytes. These are
source prototype counts, not scene instance counts or a GPU performance claim.

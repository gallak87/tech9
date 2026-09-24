# Forest kit provenance

`forest-kit.glb` is the runtime export of `art/forest-kit.blend`, authored for this
scene with the deterministic Blender script `art/build_forest.py`. All mesh
geometry and timber end-grain artwork are original to this project. The pine
spray is a derivative collage of CC0 photographed needles. Pine silhouettes use
tapered, irregular branch geometry and
individual alpha-tested shoot cards; there are no cone/tree stand-ins.

Photographic PBR source images are **CC0 1.0** from Poly Haven:

| Material | Asset | Creators | Files used |
| --- | --- | --- | --- |
| Bark | [Bark Brown 02](https://polyhaven.com/a/bark_brown_02) | Rob Tuytel | 1K diffuse, OpenGL normal, roughness JPG |
| MossyGranite | [Rock Boulder Cracked](https://polyhaven.com/a/rock_boulder_cracked) | Dimitrios Savva (photography), Dario Barresi (processing) | 1K diffuse, OpenGL normal, roughness JPG |
| PineNeedles | [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) | Rob Tuytel (photography), Rico Cilliers (original model) | 1K twig diffuse JPG and twig alpha PNG; only image sources used, no model geometry |

Source metadata was obtained from `https://api.polyhaven.com/files/{asset}` and
`https://api.polyhaven.com/info/{asset}` on 2026-09-24. Original downloads remain
in `art/textures/`, and images are embedded in the GLB and packed in the Blender
project. See [Poly Haven license](https://polyhaven.com/license).

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

## Rebuild

From `games/scene-test`, with Blender 5.1+ and Python 3 with Pillow installed:

```sh
python3 art/generate_needles.py
blender --background --factory-startup --python art/build_forest.py
```

The builder uses factory startup and never touches an existing interactive
Blender document. It writes the GLB, packed `.blend`, and measured
`art/asset-report.json`. The small final GLB JSON adjustment makes Blender 5's
dithered foliage export an explicit glTF alpha cutout.

## Runtime contract

Six base-origin, metre-scale, +Y-up groups: `pine_a` (21.5 m), `pine_b` (24 m),
`pine_sapling` (5 m), `rock_a`, `rock_b`, `fallen_log` (5.4 m). Each pine has `*_wood` and `*_needles`
children, each rock one `*_stone` mesh, and the log bark/end-grain children.
Keep prototype hierarchy transforms when extracting meshes for instancing.
Materials are shared and named `Bark`, `PineNeedles`, `MossyGranite`, and
`TimberEndgrain`. Material textures repeat in both dimensions. Instanced trees
should share geometry and materials; do not clone image data per tree.

See `art/asset-report.json` for exact triangle counts and GLB bytes. These are
source prototype counts, not scene instance counts or a GPU performance claim.

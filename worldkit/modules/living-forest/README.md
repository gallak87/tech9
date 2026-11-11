# Living Forest

New monumental cloud-forest art, generated deterministically from authored branching and attached foliage-card geometry. It contains no original Vesper geometry or textures. The factory generates geometry synchronously and does not load images; a supplied leaf-spray texture is required for visible foliage. Separately loadable generated bark color and transparent foliage-spray images are included.

```js
import * as THREE from 'three';
import {
  createLivingForestKit,
  livingForestBarkURL,
  livingForestLeafURL,
} from '@worldkit/environment/living-forest';

const loader = new THREE.TextureLoader();
const [bark, leaves] = await Promise.all([
  loader.loadAsync(livingForestBarkURL),
  loader.loadAsync(livingForestLeafURL),
]);
bark.colorSpace = leaves.colorSpace = THREE.SRGBColorSpace;
bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
bark.repeat.set(1, 1); // Wood UVs already use approximately one tile per 11m.
leaves.wrapS = leaves.wrapT = THREE.ClampToEdgeWrapping;
leaves.repeat.set(1, 1); // Preserve the complete transparent spray image.
bark.anisotropy = leaves.anisotropy = 4;

const kit = createLivingForestKit({
  detail: 'high',
  seed: 7319,
  textures: { wood: { map: bark }, leaf: { map: leaves } },
});
const tree = new THREE.Group();
for (const { geometry, material } of kit.prototypes[0].treeParts) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  tree.add(mesh);
}
scene.add(tree); // Your existing scene owns lighting, renderer and frame loop.

function disposeTree() {
  tree.removeFromParent();
  kit.dispose(); // Kit owns geometry and materials, and borrows these images.
  tree.clear();
  bark.dispose();
  leaves.dispose(); // Release caller-owned textures after their final user.
}
```

Three mature forms (`cathedral`, `windward`, `forked`) are around 100m tall. Each has a wood draw and a leaf draw. `treeParts` aliases the first form; `shrubParts` and `rockParts` offer related understory. `detail: 'low'` rebuilds smaller meshes for distant instances. Each prototype exposes `bounds`, `height`, `radius`, `foliageClusterCount`, and `foliageCardCount`.

`kit.materials.wood`, `.leaf`, and `.rock` are shared materials (also available through `kit.palette`). Optional `textures.wood.map`, `textures.wood.bumpMap`, `textures.wood.normalMap`, `textures.wood.roughnessMap`, and `textures.leaf.map` are borrowed; the kit owns only its empty leaf placeholder texture. Bark maps are supplied by the consumer; without them the wood uses a neutral slate material. `createLivingForestMaterials` exposes the same palette for unique landmarks. Wood UVs use about one tile per 11m. Consumers own light, fog, placement, route clearances and LOD selection.

`includeTrees: false` creates only the same seeded shrubs, rocks and shared
palette, skipping all three mature-tree meshes. `prototypes` and `treeParts`
are empty in this mode; ownership/disposal remain the same. The default is
`true` and preserves the existing procedural tree geometry. This lets consumers
combine the understory with a separately loaded tree family.
`foliageWind: true` adds branch-anchored wind attributes to those understory
sprays without changing their positions, normals, images or default finish.
Bind their meshes to the existing [Weather foliage response](../weather/README.md#anchored-foliage-wind)
to animate them; the option alone creates no clock or movement.

`livingForestLeafURL` resolves the RGBA foliage spray. Pass its loaded sRGB texture as `textures.leaf.map`; the shared leaf material uses `alphaTest: 0.5`, depth writes and double-sided cutout rendering. Each tree retains all 120 attached spray clusters in both qualities, with three crossed cards per cluster near and two far. No foliage renders until a real spray map is supplied.

`livingForestBarkURL` resolves the packaged `silver-bark-color-v1.png` in Vite. Load it with a consumer `TextureLoader`, mark color data as `SRGBColorSpace`, and pass it as `textures.wood.map`. The image is stored exactly as generated; its prompt, generation ID, dimensions and SHA-256 are in [provenance.json](assets/provenance.json). It is a color texture, not a calibrated scan or authored normal map. The consumer owns and disposes all loaded or cloned textures.

The three `rockParts` are worn, cleaved slate forms with a flat buried foot,
shared-corner normals, layered fissures and restrained upper-surface lichen.
Their reusable geometry and metre-scale procedural finish belong to this kit;
consumers own instance scale, ground seating and clustering.

`branchFinish: 'natural'` optionally gives the monumental trees upward-grown,
flared branch collars, tapered bole/bough ends and attached terminal twig sprays.
It retains two merged draws per prototype and all 150 foliage attachment sites
at both detail levels. Distant trees omit the subpixel terminal wood extensions
while their leaf cards remain attached to the retained parent-limb tips. The default `'cut'` finish preserves existing consumers'
geometry; consumers choose the finish and still own placement/route clearances.

`createLivingHollow({ ageRelief: 1, ... })` opts into deep asymmetric cambium
bays, eroded crossing arches and uneven rolled wound lips. Relief ranges from
0 (the existing shape) to 1, carves away from the protected cavity, and reuses
the same shell tessellation. Games still own heartwood/rim materials and the
route points that establish portal clearances.

`createLivingHollow({ crownParts: kit.crownParts, ... })` borrows a wood/leaf
geometry/material pair with its true base bearing at the origin, +Y up, +X
outward and +Z lateral. Omit `crownParts` to preserve the original crown boughs;
pass `[]` to suppress them. The hollow owns transformed clones merged into two
draws, while source parts and materials remain borrowed. Accepted root caps sit
between the actual shell skins, and both wood and foliage triangles must clear
the full supplied route.

Optional positive, finite `crownScale` sets the module scale; otherwise the hollow
fits a reference pitched bough's rise to 62% of its height. Optional
`crownBearings: [{ angle, v, scale?, splay?, pitch? }]` replaces the default five
bearings: angles are radians, `v` is normalized shell height with `0 < v < 1`,
and each positive `scale` multiplies `crownScale`. `splay` adjusts outward yaw
and `pitch` tilts the module upward. Custom descriptors replace the seeded
default composition; the consumer owns their layout. Seating and route clearance
can adjust or reject a bearing. `crownMotionMargin` defaults to zero and adds a
world-space displacement reserve to the foliage corridor only; use the same
maximum offset as the consumer's foliage wind.

Optional `bodyProfile: [{ v, outer, inner }, ...]` supplies an independent torso
cross-section. Rings run from `v: 0` at `base` to `v: 1` at `top`; `outer` and
`inner` are positive radius ratios multiplied by `radius`, with `inner < outer`.
Shape-preserving interpolation follows the authored taper without intermediate
bulges. In this mode the original broad shoulders, deep cambium shelves, wound
masses and crown pads are absent. `fluteDepth` (default 6 metres) adds only slim
longitudinal relief. Without a fork transition, the upper rim varies by at most
8 metres. The supplied
route still reserves the complete road/camera corridor before clipping openings.
Consumers may close the unused upper cavity inward above that reserve to seat
major forks in real wood while keeping the outer silhouette tapered. Consumers
own the torso profile and fork placements. Omit `bodyProfile` to preserve the
existing hollow geometry exactly.

`forkTransition: { rise, crotchDrop, start, halfWidth }` continues an authored
torso into unequal fork-bearing crests aligned with `crownBearings`, replacing
the horizontal terminal annulus with real intervening crotches. `rise` and
`crotchDrop` are metres above/below `top`, `start` is the normalized torso height
where this transition begins, and `halfWidth` is each crest's angular half-width
in radians. Its vertical mapping stays monotone. This option requires both a
`bodyProfile` and grown crown parts; the consumer owns proportions and source
bough choice. Root seating solves the resulting nonlinear surface and retains
the full route and motion clearances. Carved portal lips retain the borrowed
`materials.rim`; grown terminal fork surfaces use borrowed `materials.bark` in
one additional material group/draw. No material or image ownership changes.

## Sculpted solid landmarks

`@worldkit/environment/living-forest/ancient-tree` exports
`loadAncientTree({url, materials: {bark, inner, leaf}})`. The consumer supplies a
derived GLB URL and owns its placement and material palette. The loader owns
private geometry clones and exposes `{group, metrics, dispose}`. Imported
transforms and wind attachment attributes are flattened together; borrowed maps
use the normal TextureLoader UV convention. Disposal releases the geometry and
import resources without disposing the caller's materials or images.

The model has required `AncientOak_Bark` and `AncientOak_Heartwood` meshes, plus
optional `AncientOak_Twigs` and `AncientOak_Leaves`. Leaves retain the Weather
attachment attributes. Loading allocates no renderer or frame loop and performs
no runtime carving.

The [ancient oak source tools](art/ancient-oak/README.md) build a new solid tree
from an authored growth graph, fuse its branch junctions, and subtract an optional
consumer-owned swept passage. Worldkit owns the reusable anatomy and build
machinery; consumers retain their route constraints and derived GLB/Blender
assets. This pipeline is independent of `createLivingHollow` and its radial
shell parameters.

## Baked Sapling forest

The separate `@worldkit/environment/living-forest/sapling` entry exports
`loadSaplingForestKit({ textures, includeCrown: true })` and `saplingForestURL`. It loads four baked
Blender/Sapling grove forms and a branching crown module. The procedural
`createLivingForestKit` entry remains unchanged for its existing consumers and
does not emit this GLB.
Set `includeCrown: false` when only the four groves are used; the legacy crown
parts are then skipped rather than cloned into the runtime kit.

The async result exposes:

- `prototypes`: four named forms, each with near `treeParts`, matching
  `farParts`, and shared `bounds`, `height` and `radius` in metres. Bounds include
  both detail levels so a single placement transform and clearance envelope
  remain valid while changing detail.
- `crownParts`: a wood/leaf pair whose origin is its base bearing, with +Y up,
  +X growing outward and +Z lateral. Consumers can instance it or pass it to
  `createLivingHollow`; neither placement nor landmark scale is prescribed.
- `materials`: the shared owned palette used by all forms, both detail levels
  and the crown. Wood uses bump scale 0.75; consumers can tune its finish.
- `dispose()`: releases all owned geometries and materials exactly once.

Each part contains `kind` (`wood` or `leaf`), owned geometry with flattened source
transforms, and its shared material. The loader borrows the supplied
`textures.wood` / `textures.leaf` maps, including normal/bump/roughness maps, and
never disposes those images. They use the regular TextureLoader `flipY: true`
convention; the loader restores that convention on its cloned baked glTF UVs.
Without a supplied leaf-spray map, the material keeps foliage invisible rather
than drawing opaque card rectangles.
The baked leaves retain per-spray anchor, normalized tip weight, weight gradient
and deterministic phase attributes. The loader converts exported glTF custom
attributes and transforms anchors/gradients with the source hierarchy; near/far
sprays retain matching attachment sites and phases. Animation remains an opt-in
consumer binding to the reusable Weather response.

The source recipe, settings and tool attribution are in the
[Sapling source guide](art/sapling/README.md). The game needs only the baked GLB
and borrowed maps; Blender and Sapling run during asset authoring. Dispose the
kit after its instances/borrowers are removed, then release the caller's images.
Consumers own placement, lighting, LOD selection, visibility and road/camera
clearance. Loading allocates no renderer, scene or frame loop.

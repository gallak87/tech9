# Opaline

A focused porcelain-geology artkit for authored alien canyons. It provides six seeded mineral masses, an eroded arch, shared mineral materials, and one canonical original color texture. Route geometry, driving/contact surfaces, river behavior, landmarks, placement, lighting and culling belong to the game.

```js
import * as THREE from 'three';
import {
  createOpalineKit,
  opalineStoneURL,
} from '@worldkit/environment/opaline';

const map = await new THREE.TextureLoader().loadAsync(opalineStoneURL);
map.colorSpace = THREE.SRGBColorSpace;
map.wrapS = map.wrapT = THREE.RepeatWrapping;
map.anisotropy = 4;
const kit = createOpalineKit({ detail: 'high', textures: { stone: { map } } });
const { geometry, material } = kit.prototypes[0];
const cliff = new THREE.Mesh(geometry, material);
cliff.castShadow = cliff.receiveShadow = true;
scene.add(cliff);
// Teardown, after all instances and landmark users have been removed:
cliff.removeFromParent();
kit.dispose(); // Owned geometry and materials, idempotent.
map.dispose(); // Caller-owned texture, after its final user.
```

`prototypes` contains `cutbank`, `folded-bastion`, `eroded-bowl`, `needle`, `split-pinnacle`, and `cantilever`. Each exposes `geometry`, `material`, `bounds` and `height`. Nominal sizes range from 52–174m; bases sit at y=0 and x/z are centered. `archParts` contains one closed arch standing in the XY plane, with the passage along Z. High masses use fewer than 7,500 triangles each; low masses use fewer than 1,700. High/low arch budgets are 4,000/850. The two detail levels preserve the seeded contour and the same ledge break heights, keeping undercuts visible at a distance; consumers decide where to switch or instance them.

`createOpalineMassGeometry({seed, width, height, depth, detail, profile})` makes an independently owned geometry. Profiles are `terrace`, `spire`, and `shelf`. `createOpalineArchGeometry({seed, width, height, depth, thickness, detail})` makes an independently owned arch; width is the centerline span, depth is full Z depth, and thickness is the shell radius. Geology is decoration: these factories do not prescribe drivable surfaces or colliders.

`createOpalineMaterials({textures, detail, textureScale})` returns named `stone`, `shadow`, `translucent`, and `vein` references, the same references under `materials`, a `materialList`, and an idempotent `dispose`. Optional `textures.stone.{map,bumpMap,normalMap,roughnessMap}` are borrowed without mutation. The color/roughness/bump surfaces use world-space triplanar sampling at 0.07 tiles/m by default, so adjoining pieces share scale without stretched UVs. An optional normal map uses authored UVs. High detail adds shallow pore relief from the substrate and accepts a separate bump map; low detail retains the color layers and roughness variation while omitting that relief. The pearl stone has roughness 0.55. Make a second palette and change its roughness for polished route surfaces: `Material.clone()` does not preserve Three's shader hook. Shared program keys do not vary by prototype.

`translucent` is a thin, softly emissive emerald membrane with alpha blending and no transmission render pass. Its placement, backlighting and opaque surroundings must establish depth; it does not simulate refraction. The palette creates no texture, renderer, animation loop or render target. Kit construction cleans up partially created resources if it fails; borrowers must remove all objects before releasing the kit.

`opalineStoneURL` resolves [porcelain-color-v1.png](assets/porcelain-color-v1.png) through the consuming Vite build. The image is retained exactly as generated with built-in imagegen; its exact prompt, dimensions and SHA-256 are in [provenance.json](assets/provenance.json). It is an authored color image, not a calibrated normal or height scan.

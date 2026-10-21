# Opaline

A focused porcelain-geology artkit for authored alien canyons. It provides authored mineral sculptures in three detail tiers, shared mineral materials, and a canonical CC0 cliff PBR set. The earlier seeded mass/arch factories remain available for geometric studies. Route geometry, driving/contact surfaces, river behavior, landmarks, placement, lighting and culling belong to the game.

```js
import * as THREE from 'three';
import {
  createOpalineKit,
  opalineStoneURLs,
} from '@worldkit/environment/opaline';

const stone = Object.fromEntries(
  await Promise.all(
    Object.entries(opalineStoneURLs).map(async ([channel, url]) => {
      const texture = await new THREE.TextureLoader().loadAsync(url);
      texture.colorSpace =
        channel === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      return [channel, texture];
    }),
  ),
);
const kit = createOpalineKit({ detail: 'high', textures: { stone } });
const { geometry, material } = kit.prototypes[0];
const cliff = new THREE.Mesh(geometry, material);
cliff.castShadow = cliff.receiveShadow = true;
scene.add(cliff);
// Teardown, after all instances and landmark users have been removed:
cliff.removeFromParent();
kit.dispose(); // Owned geometry and materials, idempotent.
Object.values(stone).forEach((texture) => texture.dispose()); // After final user.
```

`prototypes` contains `cutbank`, `folded-bastion`, `eroded-bowl`, `needle`, `split-pinnacle`, and `cantilever`. Each exposes `geometry`, `material`, `bounds` and `height`. Nominal sizes range from 52–174m; bases sit at y=0 and x/z are centered. `archParts` contains one closed arch standing in the XY plane, with the passage along Z. High masses use fewer than 7,500 triangles each; low masses use fewer than 1,700. High/low arch budgets are 4,000/850. The two detail levels preserve the seeded contour and the same ledge break heights, keeping undercuts visible at a distance; consumers decide where to switch or instance them.

`createOpalineMassGeometry({seed, width, height, depth, detail, profile, form})` makes an independently owned geometry. Profiles are `terrace`, `spire`, and `shelf`; optional `form` selects any of the six named prototype shapes. The cutbank, bowl, blade and cantilever forms have distinct section profiles, with tilted fracture planes, broken rims and bounded erosion at roughly 5–20m scales in both detail tiers. `createOpalineArchGeometry({seed, width, height, depth, thickness, detail})` makes an independently owned arch; width is the centerline span, depth is full Z depth, and thickness is the shell radius. Geology is decoration: these factories do not prescribe drivable surfaces or colliders.

`createOpalineMaterials({textures, detail, textureScale, surface, wetness})` returns named `stone`, `shadow`, `translucent` is a thin, softly emissive emerald membrane with alpha blending and no transmission render pass. Its placement, backlighting and opaque surroundings must establish depth; it does not simulate refraction. The palette creates no texture, renderer, animation loop or render target. Kit construction cleans up partially created resources if it fails; borrowers must remove all objects before releasing the kit.

The earlier `opalineStoneURL` resolves [porcelain-color-v1.png](assets/porcelain-color-v1.png) through the consuming Vite build. This concept-stage color asset is retained exactly as generated with built-in imagegen; its exact prompt, dimensions and SHA-256 are in [provenance.json](assets/provenance.json). It is an authored color image, not a calibrated normal or height scan.

`loadOpalineSculptures({loader})` loads the packaged `high`, `low` and `distant` GLBs. Each tier maps five stable names (`mineral-buttress-1` through `-3`, `mineral-curl-crust`, `mineral-curl-emerald`) to `{geometry,bounds}`. Consumers borrow these geometries and assign materials; call the returned idempotent `dispose()` only after all instances have been removed. Partial load failures release every acquired resource. `opalineSculptureURLs` exposes the URLs for custom loading.

The complete five-part collections contain approximately 180k / 46k / 7k triangles; use high only for close hero assemblies and distant for the skyline. The curl has a real opening and closed aperture reveal, with a separate inset fluid volume. Its transmitting material belongs to the consumer, including its render-pass budget. [Blender authoring source](art/build-sculptures.py) rebuilds all tiers from the canonical height map; [sculpture provenance](assets/sculpture-provenance.json) records source, scale and hashes. Decorative sculpture relief never substitutes for the game's shared rendered/contact driving skin.

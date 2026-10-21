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

`livingForestLeafURL` resolves the RGBA foliage spray. Pass its loaded sRGB texture as `textures.leaf.map`; the shared leaf material uses `alphaTest: 0.5`, depth writes and double-sided cutout rendering. Each tree retains all 120 attached spray clusters in both qualities, with three crossed cards per cluster near and two far. No foliage renders until a real spray map is supplied.

`livingForestBarkURL` resolves the packaged `silver-bark-color-v1.png` in Vite. Load it with a consumer `TextureLoader`, mark color data as `SRGBColorSpace`, and pass it as `textures.wood.map`. The image is stored exactly as generated; its prompt, generation ID, dimensions and SHA-256 are in [provenance.json](assets/provenance.json). It is a color texture, not a calibrated scan or authored normal map. The consumer owns and disposes all loaded or cloned textures.

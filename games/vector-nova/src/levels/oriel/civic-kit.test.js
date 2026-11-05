import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCivicKit } from './environment/civic-kit.js';
import manifest from '../../../assets/levels/oriel/blender/civic-kit-manifest.json' with { type: 'json' };

const live = [
  'gardenCourt',
  'gardenCourtFar',
  'pavilion',
  'sunBracket',
  'tower',
  'towerFar',
  'waterfront',
  'waterfrontFar',
].sort();
const bytes = await readFile(
  new URL(
    '../../../public/assets/levels/oriel/oriel-civic-kit.glb',
    import.meta.url,
  ),
);
const parse = () =>
  new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );

function observe(asset) {
  const resources = new Map();
  function watch(item) {
    if (resources.has(item)) return;
    resources.set(item, 0);
    item.addEventListener('dispose', () =>
      resources.set(item, resources.get(item) + 1),
    );
  }
  asset.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    watch(mesh.geometry);
    for (const material of [].concat(mesh.material)) watch(material);
    const clone = mesh.geometry.clone.bind(mesh.geometry);
    mesh.geometry.clone = () => {
      const result = clone();
      watch(result);
      return result;
    };
  });
  return resources;
}

test('Oriel civic export contains only the final live prototypes and matching provenance', async () => {
  assert.deepEqual(manifest.prototypes.map((p) => p.name).sort(), live);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    manifest.export.sha256,
  );
  const asset = await parse(),
    resources = observe(asset);
  const kit = await createCivicKit({ loadAsset: async () => asset });
  try {
    assert.deepEqual(Object.keys(kit.prototypes).sort(), live);
    for (const entry of manifest.prototypes) {
      const parts = kit.prototypes[entry.name];
      assert.equal(parts.length, entry.materials);
      assert.equal(
        parts.reduce(
          (sum, part) =>
            sum +
            (part.geometry.index?.count ??
              part.geometry.attributes.position.count) /
              3,
          0,
        ),
        entry.triangles,
      );
      assert.deepEqual(kit.plantingAnchors[entry.name], entry.plantingAnchors);
    }
  } finally {
    kit.dispose();
    kit.dispose();
  }
  assert.ok([...resources.values()].every((count) => count === 1));
});

test('Oriel missing live civic prototype releases decoded and cloned resources', async () => {
  const asset = await parse(),
    resources = observe(asset);
  asset.scene.traverse((mesh) => {
    if (mesh.isMesh && mesh.name.startsWith('waterfrontFar__'))
      mesh.name = mesh.name.replace('waterfrontFar__', 'unavailable__');
  });
  await assert.rejects(
    createCivicKit({ loadAsset: async () => asset }),
    /missing waterfrontFar/,
  );
  assert.ok([...resources.values()].every((count) => count === 1));
});

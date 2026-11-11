import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  loadSaplingForestKit,
  saplingForestURL,
} from '../../../src/living-forest-sapling.js';

function watch(resource) {
  const result = { disposals: 0 };
  resource.addEventListener('dispose', () => result.disposals++);
  return result;
}

const names = [
  ...['A', 'B', 'C', 'D'].flatMap((variant) =>
    ['Near', 'Far'].flatMap((detail) => [
      `Grove${variant}_Wood${detail}`,
      `Grove${variant}_Leaves${detail}`,
    ]),
  ),
  'Crown_Wood',
  'Crown_Leaves',
];

const allParts = (kit) => [
  ...kit.prototypes.flatMap(({ treeParts, farParts }) => [
    ...treeParts,
    ...farParts,
  ]),
  ...kit.crownParts,
];
const triangles = (parts) =>
  parts.reduce(
    (count, { geometry }) =>
      count + (geometry.index?.count ?? geometry.attributes.position.count) / 3,
    0,
  );

function fixture({ leaf = true } = {}) {
  const scene = new T.Group();
  scene.position.set(2, 3, 4);
  const attachment = new T.Group();
  attachment.position.set(5, 7, 11);
  scene.add(attachment);
  const texture = new T.Texture();
  const material = new T.MeshStandardMaterial({ map: texture });
  const meshes = names
    .filter((name) => leaf || name !== 'Crown_Leaves')
    .map((name) => {
      const mesh = new T.Mesh(new T.BoxGeometry(2, 10, 4), material);
      mesh.name = name;
      attachment.add(mesh);
      return mesh;
    });
  return { scene, scenes: [scene], meshes, texture, material };
}

test('baked Sapling forest has four matched grove LODs and an attached crown module without texture requests', async (t) => {
  const bytes = await readFile(new URL(saplingForestURL));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const document = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  );
  assert.equal(document.images?.length ?? 0, 0, 'forest borrows existing maps');
  assert.equal(document.buffers.length, 1);
  assert.equal(document.buffers[0].uri, undefined, 'GLB is self-contained');
  const parsed = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const exportedUVs = names.map(
    (name) => parsed.scene.getObjectByName(name).geometry.attributes.uv,
  );
  const importedGeometry = [];
  parsed.scene.traverse((object) => {
    if (object.isMesh) importedGeometry.push(watch(object.geometry));
  });
  assert.equal(importedGeometry.length, 18);
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url) => {
    assert.equal(url, saplingForestURL);
    return parsed;
  });
  const kit = await loadSaplingForestKit();
  try {
    assert.equal(kit.prototypes.length, 4);
    assert.equal(
      new Set(kit.prototypes.map((prototype) => prototype.name)).size,
      4,
    );
    assert.equal(
      new Set(
        kit.prototypes.map(({ treeParts }) =>
          createHash('sha256')
            .update(
              Buffer.from(
                treeParts[0].geometry.attributes.position.array.buffer,
              ),
            )
            .digest('hex'),
        ),
      ).size,
      4,
      'grove variants have distinct branch geometry',
    );
    for (const prototype of kit.prototypes) {
      assert.deepEqual(
        prototype.treeParts.map((part) => part.kind),
        ['wood', 'leaf'],
      );
      assert.deepEqual(
        prototype.farParts.map((part) => part.kind),
        ['wood', 'leaf'],
      );
      assert.ok(
        prototype.height > 60 && prototype.height < 200,
        `height ${prototype.height}`,
      );
      assert.ok(
        prototype.radius > 10 && prototype.radius < 200,
        `radius ${prototype.radius}`,
      );
      const near = triangles(prototype.treeParts),
        far = triangles(prototype.farParts);
      assert.ok(near > 1000 && near <= 30000, `${near} near triangles`);
      assert.ok(
        far > 500 && far <= 7000 && far < near * 0.5,
        `${far} far triangles`,
      );
      const nearBox = new T.Box3(),
        farBox = new T.Box3();
      prototype.treeParts.forEach(({ geometry }) =>
        nearBox.union(geometry.boundingBox),
      );
      prototype.farParts.forEach(({ geometry }) =>
        farBox.union(geometry.boundingBox),
      );
      const nearSize = nearBox.getSize(new T.Vector3()),
        farSize = farBox.getSize(new T.Vector3());
      for (const axis of ['x', 'y', 'z'])
        assert.ok(
          Math.abs(nearSize[axis] - farSize[axis]) <
            Math.max(5, nearSize[axis] * 0.12),
          `matched ${axis} LOD extent`,
        );
    }
    assert.deepEqual(
      kit.crownParts.map((part) => part.kind),
      ['wood', 'leaf'],
    );
    const parts = allParts(kit);
    parts.forEach(({ geometry, material }, partIndex) => {
      for (const name of ['position', 'normal', 'uv', 'color']) {
        assert.ok(geometry.attributes[name], name);
        assert.ok(
          Array.from(geometry.attributes[name].array).every(Number.isFinite),
        );
      }
      const uv = geometry.attributes.uv,
        exportedUV = exportedUVs[partIndex];
      for (let index = 0; index < uv.count; index++)
        assert.equal(uv.getY(index), Math.fround(1 - exportedUV.getY(index)));
      if (parts[partIndex].kind === 'leaf') {
        assert.equal(
          exportedUV.getY(0),
          1,
          'Blender writes the first spray anchor with glTF V=1',
        );
        assert.equal(
          uv.getY(0),
          0,
          'borrowed full-image spray starts at its branch anchor',
        );
      }
      assert.ok(geometry.boundingSphere.radius > 0);
      assert.equal(
        material,
        kit.materials[parts[partIndex].kind],
        'all LODs and crown share the owned palette',
      );
    });
    assert.ok(importedGeometry.every((entry) => entry.disposals === 1));
  } finally {
    kit.dispose();
  }
});

test('Sapling loader flattens hierarchy transforms, releases imports and borrows caller maps', async (t) => {
  const source = fixture();
  source.meshes[1].geometry.attributes.uv.setY(0, 0.75);
  source.meshes.find((mesh) => mesh.name === 'GroveA_WoodFar').position.y = 4;
  const inputGeometry = source.meshes.map((mesh) => watch(mesh.geometry));
  const inputMaterial = watch(source.material),
    inputTexture = watch(source.texture);
  const bark = new T.Texture(),
    leaves = new T.Texture();
  const barkState = watch(bark),
    leafState = watch(leaves);
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => source);
  const kit = await loadSaplingForestKit({
    textures: { wood: { map: bark }, leaf: { map: leaves } },
  });
  const parts = allParts(kit);
  const outputGeometry = parts.map(({ geometry }) => watch(geometry));
  const outputMaterials = kit.materials.materials.map(watch);
  assert.equal(kit.prototypes[0].bounds.min.x, 6);
  assert.equal(kit.prototypes[0].bounds.min.y, 5);
  assert.equal(kit.prototypes[0].bounds.min.z, 13);
  assert.equal(
    kit.prototypes[0].bounds.max.y,
    19,
    'placement bounds include far geometry',
  );
  assert.equal(kit.prototypes[0].height, 14);
  assert.equal(parts[0].material.map, bark);
  assert.equal(parts[1].material.map, leaves);
  assert.equal(parts[1].geometry.attributes.uv.getY(0), 0.25);
  assert.equal(
    source.meshes[1].geometry.attributes.uv.getY(0),
    0.75,
    'source UVs remain untouched',
  );
  assert.equal(
    leaves.flipY,
    true,
    'borrowed image upload convention remains untouched',
  );
  assert.notEqual(parts[0].geometry, source.meshes[0].geometry);
  assert.ok(inputGeometry.every((entry) => entry.disposals === 1));
  assert.equal(inputMaterial.disposals, 1);
  assert.equal(inputTexture.disposals, 1);
  kit.dispose();
  kit.dispose();
  assert.ok(outputGeometry.every((entry) => entry.disposals === 1));
  assert.ok(outputMaterials.every((entry) => entry.disposals === 1));
  assert.equal(barkState.disposals, 0);
  assert.equal(leafState.disposals, 0);
  bark.dispose();
  leaves.dispose();
});

test('Sapling loader releases imports and partial clones when the final crown leaf mesh is absent', async (t) => {
  const source = fixture({ leaf: false });
  const geometry = watch(source.meshes[0].geometry),
    material = watch(source.material),
    texture = watch(source.texture);
  const cloneStates = source.meshes.map((mesh) => {
    const originalClone = mesh.geometry.clone.bind(mesh.geometry);
    const state = { value: null };
    t.mock.method(mesh.geometry, 'clone', () => {
      const clone = originalClone();
      state.value = watch(clone);
      return clone;
    });
    return state;
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => source);
  await assert.rejects(loadSaplingForestKit(), /missing the Crown_Leaves mesh/);
  assert.equal(geometry.disposals, 1);
  assert.equal(material.disposals, 1);
  assert.equal(texture.disposals, 1);
  assert.equal(cloneStates.length, 17);
  assert.ok(cloneStates.every((state) => state.value?.disposals === 1));
});

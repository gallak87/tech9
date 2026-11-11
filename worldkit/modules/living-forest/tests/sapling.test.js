import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  loadSaplingTree,
  saplingTreeURL,
} from '../../../src/living-forest-sapling.js';

function watch(resource) {
  const result = { disposals: 0 };
  resource.addEventListener('dispose', () => result.disposals++);
  return result;
}

function fixture({ leaf = true } = {}) {
  const scene = new T.Group();
  scene.position.set(2, 3, 4);
  const attachment = new T.Group();
  attachment.position.set(5, 7, 11);
  scene.add(attachment);
  const texture = new T.Texture();
  const material = new T.MeshStandardMaterial({ map: texture });
  const meshes = ['SaplingWood', ...(leaf ? ['SaplingLeaves'] : [])].map(
    (name) => {
      const mesh = new T.Mesh(new T.BoxGeometry(2, 10, 4), material);
      mesh.name = name;
      attachment.add(mesh);
      return mesh;
    },
  );
  return { scene, scenes: [scene], meshes, texture, material };
}

test('baked Sapling asset loads as two finite ready-to-instance parts without texture requests', async (t) => {
  const bytes = await readFile(new URL(saplingTreeURL));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  const document = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
  );
  assert.equal(document.images?.length ?? 0, 0, 'study borrows existing maps');
  assert.equal(document.buffers.length, 1);
  assert.equal(document.buffers[0].uri, undefined, 'GLB is self-contained');
  const parsed = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  const exportedLeafUV =
    parsed.scene.getObjectByName('SaplingLeaves').geometry.attributes.uv;
  assert.equal(
    exportedLeafUV.getY(0),
    1,
    'Blender writes the first spray anchor with glTF V=1',
  );
  const importGeometry = [];
  parsed.scene.traverse((object) => {
    if (object.isMesh) importGeometry.push(watch(object.geometry));
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async (url) => {
    assert.equal(url, saplingTreeURL);
    return parsed;
  });
  const tree = await loadSaplingTree();
  try {
    assert.deepEqual(
      tree.treeParts.map((part) => part.kind),
      ['wood', 'leaf'],
    );
    assert.equal(tree.treeParts.length, 2);
    const leafUV = tree.treeParts.find((part) => part.kind === 'leaf').geometry
      .attributes.uv;
    assert.equal(
      leafUV.getY(0),
      0,
      'the borrowed full-image spray starts at its branch anchor',
    );
    for (let index = 0; index < exportedLeafUV.count; index++)
      assert.equal(leafUV.getY(index), 1 - exportedLeafUV.getY(index));
    assert.ok(tree.height > 60 && tree.height < 200, `height ${tree.height}`);
    assert.ok(tree.radius > 10 && tree.radius < 200, `radius ${tree.radius}`);
    const triangles = tree.treeParts.reduce(
      (count, { geometry }) =>
        count +
        (geometry.index?.count ?? geometry.attributes.position.count) / 3,
      0,
    );
    assert.ok(
      triangles > 1000 && triangles <= 100000,
      `${triangles} triangles`,
    );
    for (const { geometry, material } of tree.treeParts) {
      for (const name of ['position', 'normal', 'uv', 'color']) {
        assert.ok(geometry.attributes[name], name);
        assert.ok(
          Array.from(geometry.attributes[name].array).every(Number.isFinite),
        );
      }
      assert.ok(geometry.boundingSphere.radius > 0);
      assert.ok(material instanceof T.Material);
    }
    assert.ok(importGeometry.every((entry) => entry.disposals === 1));
  } finally {
    tree.dispose();
  }
});

test('Sapling loader flattens hierarchy transforms, releases imports and borrows caller maps', async (t) => {
  const source = fixture();
  source.meshes[1].geometry.attributes.uv.setY(0, 0.75);
  const inputGeometry = source.meshes.map((mesh) => watch(mesh.geometry));
  const inputMaterial = watch(source.material),
    inputTexture = watch(source.texture);
  const bark = new T.Texture(),
    leaves = new T.Texture();
  const barkState = watch(bark),
    leafState = watch(leaves);
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => source);
  const tree = await loadSaplingTree({
    textures: { wood: { map: bark }, leaf: { map: leaves } },
  });
  const outputGeometry = tree.treeParts.map(({ geometry }) => watch(geometry));
  const outputMaterials = tree.materials.materials.map(watch);
  assert.equal(tree.bounds.min.x, 6);
  assert.equal(tree.bounds.min.y, 5);
  assert.equal(tree.bounds.min.z, 13);
  assert.equal(tree.bounds.max.y, 15);
  assert.equal(tree.treeParts[0].material.map, bark);
  assert.equal(tree.treeParts[1].material.map, leaves);
  assert.equal(tree.treeParts[1].geometry.attributes.uv.getY(0), 0.25);
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
  assert.notEqual(tree.treeParts[0].geometry, source.meshes[0].geometry);
  assert.ok(inputGeometry.every((entry) => entry.disposals === 1));
  assert.equal(inputMaterial.disposals, 1);
  assert.equal(inputTexture.disposals, 1);
  tree.dispose();
  tree.dispose();
  assert.ok(outputGeometry.every((entry) => entry.disposals === 1));
  assert.ok(outputMaterials.every((entry) => entry.disposals === 1));
  assert.equal(barkState.disposals, 0);
  assert.equal(leafState.disposals, 0);
  bark.dispose();
  leaves.dispose();
});

test('Sapling loader releases imports and partial clones when the expected leaf mesh is absent', async (t) => {
  const source = fixture({ leaf: false });
  const geometry = watch(source.meshes[0].geometry),
    material = watch(source.material),
    texture = watch(source.texture);
  let cloneState;
  const originalClone = source.meshes[0].geometry.clone.bind(
    source.meshes[0].geometry,
  );
  t.mock.method(source.meshes[0].geometry, 'clone', () => {
    const clone = originalClone();
    cloneState = watch(clone);
    return clone;
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => source);
  await assert.rejects(loadSaplingTree(), /missing the SaplingLeaves mesh/);
  assert.equal(geometry.disposals, 1);
  assert.equal(material.disposals, 1);
  assert.equal(texture.disposals, 1);
  assert.equal(cloneState.disposals, 1);
});

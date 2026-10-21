import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  createLivingForestKit,
  createWoodGeometry,
} from '../../../src/living-forest.js';

const triangleCount = (parts) =>
  parts.reduce((count, { geometry }) => count + geometry.index.count / 3, 0);

test('new mature silhouettes stay within near/far budgets with broad non-flat crowns', () => {
  const high = createLivingForestKit(),
    low = createLivingForestKit({ detail: 'low' });
  try {
    assert.equal(high.prototypes.length, 3);
    assert.equal(new Set(high.prototypes.map((p) => p.name)).size, 3);
    for (let i = 0; i < 3; i++) {
      const prototype = high.prototypes[i],
        far = low.prototypes[i];
      assert.ok(prototype.height > 80 && prototype.height < 125);
      assert.ok(prototype.radius > 45 && prototype.radius < 85);
      assert.ok(
        prototype.foliageClusterCount >= 120 &&
          far.foliageClusterCount === prototype.foliageClusterCount,
        'near and far crowns preserve every attached spray cluster',
      );
      assert.ok(
        triangleCount(prototype.treeParts) >= 18000 &&
          triangleCount(prototype.treeParts) <= 40000,
      );
      assert.ok(
        triangleCount(far.treeParts) >= 2000 &&
          triangleCount(far.treeParts) <= 6000,
      );
      assert.equal(prototype.foliageCardCount, 360);
      assert.equal(far.foliageCardCount, 240);
      assert.ok(
        Math.abs(prototype.height - far.height) < 3,
        'same seeded crown morphology',
      );
      assert.ok(
        Math.abs(prototype.radius - far.radius) < 5,
        'same seeded spread',
      );
      const leaf = prototype.treeParts.find((p) => p.kind === 'leaf').geometry;
      const size = leaf.boundingBox.getSize(new T.Vector3());
      assert.ok(
        size.y > 30 && size.x > 70 && size.z > 70,
        'layered crown volume',
      );
      for (const { geometry, material } of prototype.treeParts) {
        assert.ok(material.vertexColors);
        assert.ok(
          Array.from(geometry.attributes.position.array).every(Number.isFinite),
        );
        assert.ok(
          Array.from(geometry.attributes.normal.array).every(Number.isFinite),
        );
        assert.ok(geometry.boundingSphere.radius > 0);
      }
    }
  } finally {
    high.dispose();
    low.dispose();
  }
});

test('wood faces and normals point outward, including the embedded end caps', () => {
  const geometry = createWoodGeometry(
    [
      [0, 0, 0],
      [0, 5, 0],
      [0, 10, 0],
    ],
    [2, 2, 2],
    { segments: 10, sides: 24, fluting: 0 },
  );
  const p = geometry.attributes.position,
    n = geometry.attributes.normal;
  for (let i = 25; i < 10 * 25; i++) {
    const radial = new T.Vector3(p.getX(i), 0, p.getZ(i)).normalize();
    assert.ok(
      radial.dot(new T.Vector3(n.getX(i), n.getY(i), n.getZ(i))) > 0.85,
    );
  }
  assert.ok(n.getY(p.count - 2) < -0.99);
  assert.ok(n.getY(p.count - 1) > 0.99);
  geometry.dispose();
});

test('seed controls original geometry deterministically', () => {
  const a = createLivingForestKit({ detail: 'low', seed: 48 }),
    b = createLivingForestKit({ detail: 'low', seed: 48 }),
    c = createLivingForestKit({ detail: 'low', seed: 49 });
  try {
    const vertices = (kit) =>
      kit.treeParts[1].geometry.attributes.position.array;
    assert.deepEqual(vertices(a), vertices(b));
    assert.notDeepEqual(vertices(a), vertices(c));
  } finally {
    a.dispose();
    b.dispose();
    c.dispose();
  }
});

test('kit owns each generated resource exactly once and never disposes borrowed maps', () => {
  const borrowed = new T.Texture();
  const leafMap = new T.Texture();
  leafMap.addEventListener('dispose', () => borrowedDisposals++);
  const normal = new T.Texture(),
    roughness = new T.Texture();
  normal.addEventListener('dispose', () => borrowedDisposals++);
  roughness.addEventListener('dispose', () => borrowedDisposals++);
  let borrowedDisposals = 0;
  borrowed.addEventListener('dispose', () => borrowedDisposals++);
  const kit = createLivingForestKit({
    detail: 'low',
    textures: {
      wood: { map: borrowed, normalMap: normal, roughnessMap: roughness },
      leaf: { map: leafMap },
    },
  });
  assert.equal(kit.materials.wood.map, borrowed);
  assert.equal(kit.materials.leaf.map, leafMap);
  assert.equal(kit.materials.leaf.alphaTest, 0.5);
  assert.equal(kit.materials.leaf.depthWrite, true);
  assert.equal(kit.materials.leaf.side, T.DoubleSide);
  assert.equal(kit.materials.wood.normalMap, normal);
  assert.equal(kit.materials.wood.roughnessMap, roughness);
  const resources = new Set(
    [
      ...kit.prototypes.flatMap((p) => p.treeParts),
      ...kit.shrubParts,
      ...kit.rockParts,
    ].map((p) => p.geometry),
  );
  kit.materialList.forEach((m) => resources.add(m));
  kit.textures.forEach((t) => resources.add(t));
  const disposals = new Map([...resources].map((r) => [r, 0]));
  for (const resource of resources)
    resource.addEventListener('dispose', () =>
      disposals.set(resource, disposals.get(resource) + 1),
    );
  kit.dispose();
  kit.dispose();
  assert.ok([...disposals.values()].every((count) => count === 1));
  assert.equal(borrowedDisposals, 0);
  leafMap.dispose();
  borrowed.dispose();
  normal.dispose();
  roughness.dispose();
});

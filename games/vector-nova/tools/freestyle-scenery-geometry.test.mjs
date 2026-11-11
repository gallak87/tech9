import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  collectReceiverScenery,
  collisionWorldScale,
  SCENERY_COLLISION_ERROR,
} from './freestyle-scenery-geometry.mjs';

const track = {
  sample: (distance) => ({ position: new T.Vector3(0, 0, distance) }),
};
const jump = { id: 'receiver', landingStart: 0, recovery: 40 };

function fixture(t) {
  const group = new T.Group();
  const geometries = new Set(),
    materials = new Set();
  t.after(() => {
    group.traverse((object) => {
      if (object.isBatchedMesh) object.dispose();
      else if (object.geometry) geometries.add(object.geometry);
      for (const material of [object.material].flat().filter(Boolean))
        materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  });
  return { group, geometries, materials };
}

function worldTriangles(part) {
  const matrix = new T.Matrix4().fromArray(part.matrix),
    triangles = [];
  for (let i = 0; i < part.indices.length; i += 3) {
    const points = part.indices
      .slice(i, i + 3)
      .map((index) =>
        new T.Vector3()
          .fromArray(part.positions, index * 3)
          .applyMatrix4(matrix),
      );
    triangles.push(new T.Triangle(...points));
  }
  return triangles;
}

function hits(part, ray) {
  return worldTriangles(part).some((triangle) =>
    ray.intersectTriangle(
      triangle.a,
      triangle.b,
      triangle.c,
      false,
      new T.Vector3(),
    ),
  );
}

test('receiver scenery selects opaque architecture and excludes non-solid presentation', async (t) => {
  const { group } = fixture(t);
  const add = (name, settings = {}) => {
    const material = new T.MeshBasicMaterial(settings);
    material.name = name;
    const mesh = new T.Mesh(new T.BoxGeometry(2, 2, 2), material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  add('opaque landing pier');
  add('opaque water surface');
  add('generic alpha foliage', { alphaTest: 0.4 });
  add('transparent glass', { transparent: true });
  add('faded overlay', { opacity: 0.5 });
  add('hidden material', { visible: false });
  add('hidden mesh').visible = false;
  add('separate driving skin').userData.drivingSurface = true;
  add('Skywell far / background arc');
  add('remote solid').position.x = 1000;
  const parts = await collectReceiverScenery(group, track, jump);
  assert.deepEqual(
    parts.map((part) => part.name),
    ['opaque landing pier'],
  );
  assert.equal(parts[0].receiver, jump.id);
  assert.equal(parts[0].indices.length, 36);
});

test('instanced meshes retain parent/instance transforms and the authored draw range', async (t) => {
  const { group } = fixture(t);
  group.position.set(4, 7, 13);
  group.rotation.y = 0.25;
  const geometry = new T.BoxGeometry(2, 4, 6);
  geometry.setDrawRange(3, 6);
  const mesh = new T.InstancedMesh(geometry, new T.MeshBasicMaterial(), 3);
  mesh.position.set(10, -3, 2);
  mesh.rotation.z = 0.2;
  mesh.setMatrixAt(0, new T.Matrix4().makeTranslation(2, 0, 0));
  mesh.setMatrixAt(
    1,
    new T.Matrix4().compose(
      new T.Vector3(-9, 5, 4),
      new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), 0.4),
      new T.Vector3(2, 1, 0.5),
    ),
  );
  mesh.setMatrixAt(2, new T.Matrix4().makeTranslation(1000, 0, 0));
  group.add(mesh);
  const parts = await collectReceiverScenery(group, track, jump);
  assert.equal(
    parts.length,
    2,
    'the remote instance is not a receiver obstacle',
  );
  for (let instance = 0; instance < 2; instance++) {
    const placement = new T.Matrix4();
    mesh.getMatrixAt(instance, placement);
    const matrix = mesh.matrixWorld.clone().multiply(placement);
    assert.deepEqual(parts[instance].matrix, matrix.toArray());
    const actual = worldTriangles(parts[instance]);
    assert.equal(actual.length, 2, 'draw-range triangles only');
    for (let face = 0; face < 2; face++) {
      for (const [corner, key] of ['a', 'b', 'c'].entries()) {
        const source = geometry.index.getX(3 + face * 3 + corner);
        const expected = new T.Vector3()
          .fromBufferAttribute(geometry.attributes.position, source)
          .applyMatrix4(matrix);
        assert.ok(actual[face][key].distanceTo(expected) < 1e-6);
      }
    }
  }
});

test('BatchedMesh instances use their actual geometry range and instance visibility', async (t) => {
  const { group, geometries } = fixture(t);
  const unused = new T.BoxGeometry(2, 2, 2).translate(-30, 0, 0);
  const selected = new T.BoxGeometry(4, 6, 8).translate(12, 0, 0);
  geometries.add(unused);
  geometries.add(selected);
  const batch = new T.BatchedMesh(4, 256, 768, new T.MeshBasicMaterial());
  const unusedId = batch.addGeometry(unused, 64, 192);
  const selectedId = batch.addGeometry(selected, 64, 192);
  const visible = batch.addInstance(selectedId);
  const hidden = batch.addInstance(unusedId);
  const distant = batch.addInstance(selectedId);
  batch.setVisibleAt(hidden, false);
  batch.setMatrixAt(visible, new T.Matrix4().makeTranslation(3, 4, 20));
  batch.setMatrixAt(distant, new T.Matrix4().makeTranslation(1000, 0, 0));
  batch.position.set(7, -2, 0);
  batch.rotation.y = 0.3;
  group.add(batch);
  const parts = await collectReceiverScenery(group, track, jump);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].indices.length, selected.index.count);
  const instance = new T.Matrix4();
  batch.getMatrixAt(visible, instance);
  const expectedMatrix = batch.matrixWorld.clone().multiply(instance);
  assert.deepEqual(parts[0].matrix, expectedMatrix.toArray());
  const expected = new T.Box3()
    .setFromBufferAttribute(selected.attributes.position)
    .applyMatrix4(expectedMatrix);
  const actual = new T.Box3();
  for (const triangle of worldTriangles(parts[0]))
    for (const point of [triangle.a, triangle.b, triangle.c])
      actual.expandByPoint(point);
  assert.ok(actual.min.distanceTo(expected.min) < 1e-6);
  assert.ok(actual.max.distanceTo(expected.max) < 1e-6);
  assert.ok(
    batch.getGeometryRangeAt(selectedId).start > unused.index.count,
    'the selected range follows reserved padding and cannot be assumed to start at zero',
  );
});

for (const scale of [1, 10]) {
  test(`scenery simplification leaves a genuine through-hole open at ${scale}x scale`, async (t) => {
    const { group } = fixture(t);
    const outline = new T.Shape()
      .moveTo(-8, -8)
      .lineTo(8, -8)
      .lineTo(8, 8)
      .lineTo(-8, 8)
      .closePath();
    const hole = new T.Path()
      .moveTo(-3, -3)
      .lineTo(-3, 3)
      .lineTo(3, 3)
      .lineTo(3, -3)
      .closePath();
    outline.holes.push(hole);
    const geometry = new T.ExtrudeGeometry(outline, {
      depth: 4,
      steps: 8,
      bevelEnabled: true,
      bevelSegments: 5,
      bevelThickness: 0.2,
      bevelSize: 0.2,
    });
    const mesh = new T.Mesh(geometry, new T.MeshBasicMaterial());
    mesh.position.z = 10;
    mesh.scale.setScalar(scale);
    group.add(mesh);
    const [part] = await collectReceiverScenery(group, track, jump);
    assert.ok(
      part.indices.length < geometry.attributes.position.count,
      'the fixture exercises simplification rather than a small-mesh bypass',
    );
    assert.equal(
      hits(
        part,
        new T.Ray(new T.Vector3(0, 0, -20 * scale), new T.Vector3(0, 0, 1)),
      ),
      false,
      'the aperture must not become an enclosing collision slab',
    );
    assert.equal(
      hits(
        part,
        new T.Ray(
          new T.Vector3(5 * scale, 0, -20 * scale),
          new T.Vector3(0, 0, 1),
        ),
      ),
      true,
      'the surrounding real wall remains solid',
    );
  });
}

test('collision scale bounds real world stretch after rotated nonuniform parent scaling', () => {
  const matrix = new T.Matrix4()
    .makeScale(6, 0.5, 1.75)
    .multiply(new T.Matrix4().makeRotationY(Math.PI / 4));
  const scale = collisionWorldScale(matrix);
  assert.ok(scale >= 6 - 1e-9);
  assert.ok(
    scale > matrix.getMaxScaleOnAxis(),
    'maximum column length underestimates this real sheared transform',
  );
  const linear = new T.Matrix3().setFromMatrix4(matrix);
  for (let x = -2; x <= 2; x++)
    for (let y = -2; y <= 2; y++)
      for (let z = -2; z <= 2; z++) {
        if (!x && !y && !z) continue;
        const direction = new T.Vector3(x, y, z)
          .normalize()
          .applyMatrix3(linear);
        assert.ok(direction.length() <= scale + 1e-9);
      }
});

test('reused geometry keeps its absolute world-space simplification bound under nonuniform scale and shear', async (t) => {
  const { group } = fixture(t);
  // The rotated 6x parent still has a maximum 60m extent: this fixture must
  // exercise the small-object budget rather than the coarse colossal-body tier.
  const geometry = new T.SphereGeometry(5, 48, 24);
  const ordinary = new T.Mesh(geometry, new T.MeshBasicMaterial());
  ordinary.name = 'unit-scale source';
  ordinary.position.x = -45;
  group.add(ordinary);
  const scaledParent = new T.Group();
  scaledParent.position.set(35, 0, 15);
  scaledParent.scale.set(6, 0.5, 1.75);
  const scaled = new T.Mesh(geometry, ordinary.material);
  scaled.name = 'nonuniform rotated source';
  scaled.rotation.y = Math.PI / 4;
  scaledParent.add(scaled);
  group.add(scaledParent);
  const parts = await collectReceiverScenery(group, track, jump);
  assert.equal(parts.length, 2);
  assert.ok(
    parts.every((part) => part.indices.length < geometry.index.count),
    'both scale variants exercise actual simplification',
  );
  assert.ok(
    parts[1].indices.length >= parts[0].indices.length,
    'a cached unit-scale result must not be reused at the larger world scale',
  );
  for (const [index, mesh] of [ordinary, scaled].entries()) {
    const triangles = worldTriangles(parts[index]).map((triangle) => ({
      triangle,
      bounds: new T.Box3().setFromPoints([triangle.a, triangle.b, triangle.c]),
    }));
    const closest = new T.Vector3();
    let maximum = 0;
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const point = new T.Vector3()
        .fromBufferAttribute(geometry.attributes.position, i)
        .applyMatrix4(mesh.matrixWorld);
      let nearest = Infinity;
      for (const { triangle, bounds } of triangles) {
        if (bounds.distanceToPoint(point) ** 2 >= nearest) continue;
        triangle.closestPointToPoint(point, closest);
        nearest = Math.min(nearest, closest.distanceToSquared(point));
      }
      maximum = Math.max(maximum, Math.sqrt(nearest));
    }
    assert.ok(
      maximum <= SCENERY_COLLISION_ERROR + 1e-5,
      `${mesh.name}: actual source-to-collider error ${maximum}m exceeds ${SCENERY_COLLISION_ERROR}m`,
    );
  }
});

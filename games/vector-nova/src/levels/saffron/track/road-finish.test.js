import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSaffronTrack } from './model.js';
import { createSaffronRoad } from './road.js';

function attributeData(attribute) {
  if (!attribute) return null;
  const array = attribute.array;
  return {
    itemSize: attribute.itemSize,
    normalized: attribute.normalized,
    count: attribute.count,
    hash: createHash('sha256')
      .update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength))
      .digest('hex'),
  };
}

function geometryData(geometry) {
  return {
    index: attributeData(geometry.index),
    attributes: Object.fromEntries(
      Object.entries(geometry.attributes).map(([name, attribute]) => [
        name,
        attributeData(attribute),
      ]),
    ),
    groups: geometry.groups.map((group) => ({ ...group })),
    drawRange: { ...geometry.drawRange },
  };
}

test('Saffron keeps optical depth without a scene transmission pass across quality changes', (t) => {
  const road = createSaffronRoad({
    track: createSaffronTrack(),
    settings: { quality: 'high' },
  });
  t.after(() => road.dispose());
  // Hold simulation time fixed: migrating deposits remain factual geometry,
  // while a paused quality/finish change must leave every road buffer intact.
  const time = 7;
  road.update({ time, settings: { quality: 'high' } });
  const meshes = [];
  road.group.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  const central = meshes.filter((mesh) => mesh.userData.drivingSurface);
  const honey = meshes.filter(
    (mesh) => mesh.name === 'Honey-opaque reinforced turn panels',
  );
  const shoulders = meshes.filter(
    (mesh) => mesh.name === 'Translucent lens shoulder',
  );
  assert.ok(central.length > 0, 'inspect the production driving surfaces');
  assert.ok(honey.length > 0, 'inspect reinforced braking panels');
  assert.ok(shoulders.length > 0, 'retain the transparent shoulder windows');

  const geometries = new Map(
    meshes.map((mesh) => [mesh.geometry, geometryData(mesh.geometry)]),
  );
  const bindings = meshes.map((mesh) => ({
    mesh,
    geometry: mesh.geometry,
    count: mesh.count,
    instances: attributeData(mesh.instanceMatrix),
  }));
  const materials = new Set(
    meshes.flatMap((mesh) =>
      Array.isArray(mesh.material) ? mesh.material : [mesh.material],
    ),
  );
  const released = new Map(
    [...geometries.keys(), ...materials].map((resource) => [resource, 0]),
  );
  for (const resource of released.keys())
    resource.addEventListener('dispose', () =>
      released.set(resource, released.get(resource) + 1),
    );

  for (const quality of ['high', 'low', 'high']) {
    road.update({ time, settings: { quality } });
    const currentMeshes = [];
    road.group.traverse((object) => {
      if (object.isMesh) currentMeshes.push(object);
      for (const material of Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [])
        assert.equal(
          material.transmission ?? 0,
          0,
          `${quality}: ${object.name} must not request another scene render`,
        );
    });
    assert.deepEqual(currentMeshes, meshes, 'finish changes keep the draw set');
    for (const mesh of [...central, ...honey]) {
      assert.equal(mesh.material.transparent, false);
      assert.equal(mesh.material.opacity, 1);
      assert.equal(mesh.material.depthWrite, true);
    }
    for (const mesh of shoulders) {
      assert.equal(mesh.material.transparent, true);
      assert.ok(mesh.material.opacity > 0 && mesh.material.opacity < 1);
      assert.equal(mesh.material.depthWrite, false);
      assert.equal(mesh.material.forceSinglePass, true);
    }
    for (const { mesh, geometry, count, instances } of bindings) {
      assert.equal(mesh.geometry, geometry);
      assert.equal(mesh.count, count);
      assert.deepEqual(attributeData(mesh.instanceMatrix), instances);
    }
    for (const [geometry, data] of geometries)
      assert.deepEqual(geometryData(geometry), data);
    assert.ok([...released.values()].every((count) => count === 0));
  }

  road.dispose();
  road.dispose();
  assert.ok(
    [...released.values()].every((count) => count === 1),
    'each owned geometry/material is released exactly once',
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createShip } from './index.js';

const meshes = (ship) => {
  const result = [];
  ship.group.traverse((object) => {
    if (object.isMesh) result.push(object);
  });
  return result;
};

test('orbital propulsion preserves every approved hull vertex and adds no mesh submissions', () => {
  const legacy = createShip();
  const orbital = createShip({ plumeExposure: 1.65 });
  const oldMeshes = meshes(legacy),
    newMeshes = meshes(orbital);
  assert.equal(newMeshes.length, oldMeshes.length);
  assert.equal(newMeshes.length, 25);
  for (let index = 0; index < oldMeshes.length; index += 1) {
    const a = oldMeshes[index],
      b = newMeshes[index];
    assert.equal(a.name, b.name);
    if (a.name === 'Ion exhaust') continue;
    assert.deepEqual(
      a.geometry.attributes.position.array,
      b.geometry.attributes.position.array,
    );
    assert.deepEqual(a.position.toArray(), b.position.toArray());
    assert.deepEqual(a.quaternion.toArray(), b.quaternion.toArray());
    assert.equal(a.material.type, b.material.type);
    assert.equal(a.material.roughness, b.material.roughness);
    assert.equal(a.material.metalness, b.material.metalness);
  }
  const triangles = (objects) =>
    objects.reduce(
      (sum, object) =>
        sum +
        (object.geometry.index?.count ??
          object.geometry.attributes.position.count) /
          3,
      0,
    );
  assert.equal(triangles(oldMeshes), 85534);
  assert.ok(triangles(newMeshes) < triangles(oldMeshes));
  for (const mesh of newMeshes)
    assert.ok(
      Array.from(mesh.geometry.attributes.position.array).every(
        Number.isFinite,
      ),
    );
  legacy.dispose();
  orbital.dispose();
});

test('orbital exhaust has a clear boost state and releases immediately when boost or reserve ends', () => {
  const ship = createShip({ plumeExposure: 1.65 });
  const plume = meshes(ship).find((mesh) => mesh.name === 'Ion exhaust');
  ship.update({ speed: 85, boost: false, time: 2, energy: 1 });
  const cruise = {
    strength: plume.material.uniforms.strength.value,
    length: plume.scale.z,
  };
  ship.update({ speed: 85, boost: true, time: 2, energy: 1 });
  assert.ok(plume.material.uniforms.strength.value > cruise.strength * 4);
  assert.ok(plume.scale.z > cruise.length * 3);
  assert.equal(plume.material.uniforms.boostMix.value, 1);
  ship.update({ speed: 85, boost: true, time: 2, energy: 0 });
  assert.equal(plume.material.uniforms.boostMix.value, 0);
  assert.equal(plume.scale.z, cruise.length);
  assert.equal(plume.material.uniforms.strength.value, cruise.strength);
  ship.update({ speed: NaN, boost: false, time: NaN, energy: NaN });
  assert.ok(plume.scale.toArray().every(Number.isFinite));
  assert.ok(Number.isFinite(plume.material.uniforms.strength.value));
  ship.dispose();
});

test('orbital volume geometry and shared material are released exactly once', () => {
  const ship = createShip({ plumeExposure: 1.65 });
  const resources = new Set();
  for (const mesh of meshes(ship)) {
    resources.add(mesh.geometry);
    resources.add(mesh.material);
  }
  const counts = new Map();
  for (const resource of resources) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () =>
      counts.set(resource, counts.get(resource) + 1),
    );
  }
  ship.dispose();
  ship.dispose();
  for (const count of counts.values()) assert.equal(count, 1);
  assert.equal(ship.group.children.length, 0);
});

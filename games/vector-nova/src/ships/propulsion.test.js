import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createShip } from './index.js';

const bytes = await readFile(
  new URL('../../public/assets/ships/kestrel/kestrel.glb', import.meta.url),
);
// CPU ownership checks decode geometry; browser verification decodes the maps.
const loader = new GLTFLoader();
loader.register(() => ({
  name: 'CPU_TEXTURES',
  loadTexture: async () => new THREE.Texture(),
}));
const { scene: model } = await loader.parseAsync(
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  '',
);
const meshes = (root) => {
  const result = [];
  root.traverse((object) => {
    if (object.isMesh) result.push(object);
  });
  return result;
};
const resources = (root) =>
  new Set(
    meshes(root).flatMap((mesh) => [
      mesh.geometry,
      ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]),
    ]),
  );

test('Blender export fits the racing envelope with finite geometry and aft exhaust anchors', () => {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.x > 3 && size.x <= 4.5, `width ${size.x}`);
  assert.ok(size.z >= 6.8 && size.z <= 7.2, `length ${size.z}`);
  assert.ok(bounds.min.y >= -0.12, `hover datum ${bounds.min.y}`);
  assert.ok(bounds.max.y <= 1.8, `height ${bounds.max.y}`);
  const hardware = meshes(model);
  assert.ok(hardware.length <= 30, `opaque submissions ${hardware.length}`);
  const triangles = hardware.reduce(
    (sum, mesh) =>
      sum +
      (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) /
        3,
    0,
  );
  assert.ok(triangles > 1000 && triangles <= 85534, `triangles ${triangles}`);
  for (const mesh of hardware) {
    for (const attribute of Object.values(mesh.geometry.attributes))
      assert.ok(
        Array.from(attribute.array).every(Number.isFinite),
        `finite attributes: ${mesh.name}`,
      );
    assert.ok(mesh.geometry.attributes.normal, `normals: ${mesh.name}`);
  }
  const anchors = ['Exhaust_L', 'Exhaust_R'].map((name) => {
    const anchor = model.getObjectByName(name);
    assert.ok(anchor, name);
    return anchor.getWorldPosition(new THREE.Vector3());
  });
  assert.ok(anchors[0].x * anchors[1].x < 0, 'opposite engine sides');
  for (const anchor of anchors) {
    assert.ok(anchor.z < -2.5 && anchor.z >= bounds.min.z - 0.2);
    assert.ok(anchor.y > bounds.min.y && anchor.y < bounds.max.y);
  }
});

test('both levels use identical hull geometry and matched nozzle attachment points', async () => {
  const ships = await Promise.all([
    createShip({ model }),
    createShip({ model, plumeExposure: 1.65 }),
  ]);
  const a = meshes(ships[0].group),
    b = meshes(ships[1].group);
  assert.equal(a.length, b.length);
  for (let index = 0; index < a.length; index++) {
    assert.equal(a[index].name, b[index].name);
    assert.deepEqual(a[index].position.toArray(), b[index].position.toArray());
    if (a[index].name === 'Ion exhaust') continue;
    assert.deepEqual(
      a[index].geometry.attributes.position.array,
      b[index].geometry.attributes.position.array,
    );
  }
  for (const ship of ships) {
    const plumes = meshes(ship.group).filter(
      (mesh) => mesh.name === 'Ion exhaust',
    );
    assert.equal(plumes.length, 2);
    for (let index = 0; index < plumes.length; index++) {
      const anchor = ship.group.getObjectByName(
        ['Exhaust_L', 'Exhaust_R'][index],
      );
      assert.ok(
        plumes[index].position.distanceTo(
          anchor.getWorldPosition(new THREE.Vector3()),
        ) < 1e-6,
      );
    }
    ship.dispose();
  }
});

test('boost releases without moving the hull or leaving nonfinite presentation state', async () => {
  for (const plumeExposure of [1, 1.65]) {
    const ship = await createShip({ model, plumeExposure });
    const plume = meshes(ship.group).find(
      (mesh) => mesh.name === 'Ion exhaust',
    );
    ship.group.position.set(3, 17, 41);
    ship.group.rotation.set(0.4, -0.7, Math.PI);
    const pose = {
      position: ship.group.position.clone(),
      quaternion: ship.group.quaternion.clone(),
    };
    ship.update({ speed: 85, boost: false, time: 2, energy: 1 });
    const cruise = {
      strength: plume.material.uniforms.strength.value,
      length: plume.scale.z,
    };
    ship.update({ speed: 85, boost: true, time: 2, energy: 1 });
    assert.ok(plume.material.uniforms.strength.value > cruise.strength * 3);
    assert.ok(plume.scale.z > cruise.length * 3);
    assert.equal(plume.material.uniforms.boostMix.value, 1);
    ship.update({ speed: 85, boost: true, time: 2, energy: 0 });
    assert.equal(plume.material.uniforms.boostMix.value, 0);
    assert.equal(plume.scale.z, cruise.length);
    assert.equal(plume.material.uniforms.strength.value, cruise.strength);
    ship.update({ speed: NaN, boost: false, time: NaN, energy: NaN });
    assert.ok(plume.scale.toArray().every(Number.isFinite));
    assert.ok(Number.isFinite(plume.material.uniforms.strength.value));
    assert.ok(ship.group.position.equals(pose.position));
    assert.ok(ship.group.quaternion.equals(pose.quaternion));
    ship.dispose();
  }
});

test('ship instances release owned resources once and leave source, siblings and borrowed reflection intact', async () => {
  const a = await createShip({ model });
  const b = await createShip({ model });
  const sourceResources = resources(model);
  const aResources = resources(a.group);
  const bResources = resources(b.group);
  const reflection = new THREE.Texture();
  const counts = new Map();
  for (const resource of new Set([
    ...sourceResources,
    ...aResources,
    ...bResources,
    reflection,
  ])) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () =>
      counts.set(resource, counts.get(resource) + 1),
    );
  }
  for (const mesh of meshes(a.group))
    if (mesh.material.isMeshStandardMaterial) mesh.material.envMap = reflection;
  a.dispose();
  a.dispose();
  for (const resource of aResources) assert.equal(counts.get(resource), 1);
  for (const resource of [...sourceResources, ...bResources, reflection])
    assert.equal(counts.get(resource), 0);
  assert.equal(a.group.children.length, 0);
  b.update({ speed: 100, boost: true, time: 3 });
  assert.ok(b.group.children.length > 0);
  b.dispose();
  reflection.dispose();
});

test('an incomplete export fails before game readiness with a useful error', async () => {
  await assert.rejects(
    createShip({ model: new THREE.Group() }),
    /exhaust attachment points/,
  );
});

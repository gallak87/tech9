import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { seatSkywellStrata } from './strata.js';

async function canonicalIsland(name) {
  const data = await readFile(
    new URL(
      `../../../public/assets/levels/zephyr/${name}.glb`,
      import.meta.url,
    ),
  );
  return (
    await new GLTFLoader().parseAsync(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      '',
    )
  ).scene;
}

function release(root) {
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const material of [mesh.material].flat()) material.dispose();
  });
}

test('canonical detached grand-island wedge becomes an embedded outcrop while attached strata stay unchanged', async () => {
  const root = await canonicalIsland('island-grand');
  const strata = root.getObjectByName('island-grand__rock_light');
  const mineral = root.getObjectByName('island-grand__rock');
  const original = strata.geometry;
  const positions = original.attributes.position.array.slice();
  const mainBounds = new T.Box3(
    new T.Vector3(-136.652, -39.083, -33.132),
    new T.Vector3(-114.939, -24.465, -11.05),
  );
  const attachedBounds = new T.Box3(
    new T.Vector3(40.808, -29.766, -118.376),
    new T.Vector3(59.808, -21.873, -84.022),
  );
  const main = [],
    attached = [],
    point = new T.Vector3();
  for (let i = 0; i < original.attributes.position.count; i++) {
    point.fromBufferAttribute(original.attributes.position, i);
    if (mainBounds.containsPoint(point)) main.push(i);
    if (attachedBounds.containsPoint(point)) attached.push(i);
  }
  assert.ok(main.length > 5 && attached.length > 5);
  const before = main.map((i) =>
    new T.Vector3().fromBufferAttribute(original.attributes.position, i),
  );
  let originalReleases = 0;
  original.addEventListener('dispose', () => originalReleases++);
  const repair = seatSkywellStrata(root);
  assert.equal(repair.movedComponents, 2);
  assert.equal(repair.preservedComponents, 9);
  assert.equal(repair.replacedGeometries.size, 1);
  assert.ok(repair.replacedGeometries.has(original));
  assert.notEqual(strata.geometry, original);
  assert.deepEqual(
    original.attributes.position.array,
    positions,
    'the canonical private input remains unmodified',
  );
  assert.equal(
    originalReleases,
    0,
    'the source caller retains replacement ownership',
  );
  for (const i of attached)
    for (let k = 0; k < 3; k++)
      assert.equal(
        strata.geometry.attributes.position.array[i * 3 + k],
        positions[i * 3 + k],
        'the attached approximately two-metre-gap cap does not move',
      );

  // Independent radial entry check against the actual mineral triangles:
  // the formerly loose component now sits mostly behind its cliff face.
  const after = main.map((i) =>
    new T.Vector3().fromBufferAttribute(strata.geometry.attributes.position, i),
  );
  const oldCenter = new T.Box3()
    .setFromPoints(before)
    .getCenter(new T.Vector3());
  const newCenter = new T.Box3()
    .setFromPoints(after)
    .getCenter(new T.Vector3());
  const ray = new T.Raycaster();
  function gap(center) {
    const inward = new T.Vector3(-center.x, 0, -center.z).normalize();
    ray.set(center.clone().addScaledVector(inward, -1000), inward);
    const hit = ray.intersectObject(mineral, false)[0];
    assert.ok(hit);
    return hit.point.sub(center).dot(inward);
  }
  assert.ok(
    gap(oldCenter) > 20,
    'the fixture is the real detached wedge from the chase view',
  );
  assert.ok(
    gap(newCenter) < -5,
    'most of the wedge is embedded rather than merely touching',
  );
  const second = seatSkywellStrata(root);
  assert.equal(
    second.movedComponents,
    0,
    'repeated preparation cannot drift the fitted strata',
  );
  repair.replacedGeometries.forEach((geometry) => geometry.dispose());
  assert.equal(originalReleases, 1);
  release(root);
});

test('canonical terrace island keeps its original geometry when every wedge already attaches', async () => {
  const root = await canonicalIsland('island-terrace');
  const strata = root.getObjectByName('island-terrace__rock_light');
  const original = strata.geometry;
  const repair = seatSkywellStrata(root);
  assert.equal(repair.movedComponents, 0);
  assert.equal(repair.preservedComponents, 11);
  assert.equal(repair.replacedGeometries.size, 0);
  assert.equal(strata.geometry, original);
  release(root);
});

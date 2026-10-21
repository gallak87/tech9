import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVesperEnvironment } from './index.js';
import { createVesperTrack } from '../track/model.js';

function watch(resources) {
  const counts = new Map();
  for (const resource of new Set(resources)) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () =>
      counts.set(resource, counts.get(resource) + 1),
    );
  }
  return counts;
}
function sceneResources(group) {
  const resources = [];
  group.traverse((object) => {
    if (object.isInstancedMesh) resources.push(object);
    if (object.geometry) resources.push(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      if (!material) continue;
      resources.push(material);
      for (const key of ['map', 'bumpMap', 'normalMap', 'roughnessMap'])
        if (material[key]) resources.push(material[key]);
    }
  });
  return resources;
}
function assertReleasedOnce(counts) {
  assert.ok(counts.size > 0);
  for (const [resource, count] of counts)
    assert.equal(count, 1, resource.name || resource.type);
}

test('a failed foliage load releases the earlier bark texture and reports the real error', async (t) => {
  const bark = new T.Texture(),
    counts = watch([bark]);
  const cause = new Error('missing foliage');
  let calls = 0;
  t.mock.method(T.TextureLoader.prototype, 'loadAsync', async () => {
    if (++calls === 1) return bark;
    throw cause;
  });
  await assert.rejects(createVesperEnvironment(), (error) => {
    assert.match(error.message, /Living Forest art could not load/);
    assert.equal(error.cause, cause);
    return true;
  });
  assert.equal(calls, 2);
  assertReleasedOnce(counts);
});

test('a late construction failure releases loaded maps, partial instances and temporary root geometry', async (t) => {
  t.mock.method(
    T.TextureLoader.prototype,
    'loadAsync',
    async () => new T.Texture(),
  );
  const geometries = new Map(),
    setAttribute = T.BufferGeometry.prototype.setAttribute;
  t.mock.method(T.BufferGeometry.prototype, 'setAttribute', function (...args) {
    if (!geometries.has(this)) {
      geometries.set(this, 0);
      this.addEventListener('dispose', () =>
        geometries.set(this, geometries.get(this) + 1),
      );
    }
    return setAttribute.apply(this, args);
  });
  const cause = new Error('attachment query failed');
  let resources, group;
  t.mock.method(T.Raycaster.prototype, 'intersectObject', (object) => {
    group = object.parent.parent;
    resources = watch(sceneResources(group));
    throw cause;
  });
  await assert.rejects(
    createVesperEnvironment({ track: createVesperTrack() }),
    (error) => error === cause,
  );
  assert.equal(group.children.length, 0);
  assertReleasedOnce(resources);
  assertReleasedOnce(geometries);
});

test('the complete environment respects inherited reduced motion and owns shared resources once', async (t) => {
  t.mock.method(
    T.TextureLoader.prototype,
    'loadAsync',
    async () => new T.Texture(),
  );
  const camera = new T.PerspectiveCamera();
  camera.position.set(-205, 58, 172);
  const environment = await createVesperEnvironment({
    track: createVesperTrack(),
    view: { camera },
    settings: { quality: 'low', reducedMotion: true },
  });
  const resources = watch(sceneResources(environment.group));
  try {
    const water = environment.group.getObjectByName(
      'Living Forest / reflective floodplain',
    );
    const time = water.material.uniforms.time.value;
    environment.update({ dt: 1 });
    assert.equal(water.material.uniforms.time.value, time);
    environment.update({
      dt: 1,
      settings: { quality: 'high', reducedMotion: false },
    });
    assert.ok(water.material.uniforms.time.value > time);
    assert.equal(water.renderTarget.width, 768);
    environment.update({
      dt: 0,
      settings: { quality: 'low', reducedMotion: true },
    });
    assert.equal(water.renderTarget.width, 512);
    for (const mesh of environment.group.children.filter(
      (object) => object.isInstancedMesh,
    )) {
      assert.ok(mesh.count <= mesh.instanceMatrix.count);
      assert.ok(mesh.boundingSphere);
    }
  } finally {
    environment.dispose();
    environment.dispose();
  }
  environment.update({ dt: 1 });
  assert.equal(environment.group.children.length, 0);
  assertReleasedOnce(resources);
});

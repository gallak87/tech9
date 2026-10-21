import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createOpalineTrack } from './track/model.js';
import { createOpalineRoad } from './track/road.js';
import { createOpalineEnvironment } from './environment/index.js';

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
      : [object.material])
      if (material) resources.push(material);
    if (object.renderTarget) resources.push(object.renderTarget);
  });
  return resources;
}
function assertCounts(counts, expected) {
  assert.ok(counts.size > 0);
  for (const [resource, count] of counts)
    assert.equal(
      count,
      expected,
      resource.name || resource.type || resource.constructor.name,
    );
}
function mockMap(t) {
  const texture = new T.Texture();
  t.mock.method(T.TextureLoader.prototype, 'loadAsync', async () => texture);
  return texture;
}

test('road failure after partial mesh construction releases owned maps and completed geometry', async (t) => {
  const texture = mockMap(t),
    textures = [texture],
    clone = T.Texture.prototype.clone;
  t.mock.method(T.Texture.prototype, 'clone', function () {
    const next = clone.call(this);
    textures.push(next);
    return next;
  });
  let group, resources, textureCounts;
  const add = T.Group.prototype.add;
  t.mock.method(T.Group.prototype, 'add', function (...objects) {
    if (this.name === 'Opaline / polished mineral running surfaces')
      group = this;
    return add.apply(this, objects);
  });
  const track = createOpalineTrack(),
    sample = track.sample,
    cause = new Error('failed road sample');
  t.mock.method(track, 'sample', (distance) => {
    if (group?.children.length >= 3) {
      resources = watch(sceneResources(group));
      textureCounts = watch(textures);
      throw cause;
    }
    return sample(distance);
  });
  await assert.rejects(
    createOpalineRoad({ track }),
    (error) => error === cause,
  );
  assert.equal(group.children.length, 0);
  assertCounts(resources, 1);
  assertCounts(textureCounts, 1);
});

test('environment borrows road maps, releases its own resources once, and preserves accurate cues in reduced motion', async (t) => {
  mockMap(t);
  const track = createOpalineTrack(),
    road = await createOpalineRoad({ track });
  const maps = Object.values(road.textures.stone),
    mapCounts = watch(maps),
    roadCounts = watch(sceneResources(road.group));
  const camera = new T.PerspectiveCamera();
  camera.position.copy(track.sample(track.landmarks.veil.distance).position);
  let environment, environmentCounts;
  try {
    environment = createOpalineEnvironment({
      track,
      road,
      settings: { quality: 'low', reducedMotion: true },
    });
    environmentCounts = watch(sceneResources(environment.group));
    assert.equal(
      environment.group.userData.metrics.runoffs,
      3,
      'shaded banks retain attachment metadata for all authored runoffs',
    );
    const water = environment.group.getObjectByName(
        'Opaline / iridescent river',
      ),
      initialTime = water.material.uniforms.time.value;
    const flow = environment.group.getObjectByName(
      'Opaline / current surface ' + track.surgeZones[0].id,
    );
    environment.update({ camera, dt: 1, time: 6 });
    assert.equal(water.material.uniforms.time.value, initialTime);
    assert.equal(water.renderTarget.width, 384);
    assert.equal(flow.material.uniforms.clock.value, 0);
    assert.ok(
      flow.material.uniforms.strength.value > 0.99,
      'force timing remains visible in reduced motion',
    );
    const activeHead = flow.material.uniforms.head.value;
    environment.update({ camera, dt: 0, time: 6 });
    assert.equal(flow.material.uniforms.head.value, activeHead);
    environment.update({
      camera,
      dt: 1,
      time: 6.5,
      settings: { quality: 'high', reducedMotion: false },
    });
    assert.ok(water.material.uniforms.time.value > initialTime);
    assert.equal(water.renderTarget.width, 768);
    assert.ok(flow.material.uniforms.head.value > activeHead);
    assert.equal(flow.material.uniforms.clock.value, 6.5);
    // Render-target resizing releases the previous GPU allocation; count final teardown separately.
    assert.ok(environmentCounts.get(water.renderTarget) >= 2);
    environmentCounts.set(water.renderTarget, 0);
    environment.dispose();
    environment.dispose();
    assert.equal(environment.group.children.length, 0);
    assertCounts(environmentCounts, 1);
    assertCounts(mapCounts, 0);
    assertCounts(roadCounts, 0);
    assert.ok(
      road.group.children.some(
        (object) => object.material?.map === road.textures.stone.map,
      ),
    );
    environment.update({ dt: 1, time: 10 });
  } finally {
    environment?.dispose();
    road.dispose();
    road.dispose();
  }
  assertCounts(mapCounts, 1);
  assertCounts(roadCounts, 1);
  assert.equal(road.group.children.length, 0);
});

test('late environment construction failure releases its scene but leaves borrowed road textures intact', async (t) => {
  mockMap(t);
  const track = createOpalineTrack(),
    road = await createOpalineRoad({ track }),
    mapCounts = watch(Object.values(road.textures.stone));
  const cause = new Error('failed pressure-vein attachment');
  let group, resources;
  t.mock.method(T.Raycaster.prototype, 'intersectObjects', (objects) => {
    group = objects[0].parent;
    resources = watch(sceneResources(group));
    throw cause;
  });
  try {
    assert.throws(
      () => createOpalineEnvironment({ track, road }),
      (error) => error === cause,
    );
    assert.equal(group.children.length, 0);
    assertCounts(resources, 1);
    assertCounts(mapCounts, 0);
    assert.ok(road.group.children.length > 0);
  } finally {
    road.dispose();
  }
  assertCounts(mapCounts, 1);
});

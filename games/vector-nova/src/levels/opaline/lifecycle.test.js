import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createOpalineTrack } from './track/model.js';
import { createOpalineRoad } from './track/road.js';
import { createOpalineEnvironment } from './environment/index.js';

// Linked Worldkit resolves its own Node peer; Vite deduplicates it in the game.
const requireKit = createRequire(
  import.meta.resolve('@worldkit/environment/package.json'),
);
const { GLTFLoader } = await import(
  pathToFileURL(requireKit.resolve('three/addons/loaders/GLTFLoader.js')).href
);

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
function mockAssets(t, { textureFailure = -1, cause } = {}) {
  const textures = [],
    sculptureResources = new Set();
  let textureLoads = 0;
  t.mock.method(T.TextureLoader.prototype, 'loadAsync', async (url) => {
    if (textureLoads++ === textureFailure) throw cause;
    const texture = new T.Texture();
    texture.name = url.split('/').at(-1);
    textures.push(texture);
    return texture;
  });
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async function (url) {
    const bytes = await readFile(fileURLToPath(url));
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const gltf = await this.parseAsync(buffer, '');
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      sculptureResources.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        if (material) sculptureResources.add(material);
    });
    return gltf;
  });
  return { textures, sculptureResources };
}

function borrowedGeometries(road) {
  return new Set(
    ['high', 'low', 'distant'].flatMap((detail) =>
      Object.values(road.sculptures[detail]).map((part) => part.geometry),
    ),
  );
}

test('road failure after partial mesh construction releases owned maps and completed geometry', async (t) => {
  const { textures, sculptureResources } = mockAssets(t);
  let group, resources, textureCounts, sculptureCounts;
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
      sculptureCounts = watch(sculptureResources);
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
  assertCounts(sculptureCounts, 1);
});

test('environment borrows road maps and sculptures, releases its own resources once, and preserves accurate cues in reduced motion', async (t) => {
  const { textures, sculptureResources } = mockAssets(t);
  const track = createOpalineTrack(),
    road = await createOpalineRoad({ track });
  const maps = Object.values(road.textures.stone),
    mapCounts = watch(maps),
    roadCounts = watch(sceneResources(road.group)),
    sculptureCounts = watch(sculptureResources),
    borrowed = borrowedGeometries(road);
  assert.equal(textures.length, 4);
  assert.equal(
    new Set(maps).size,
    4,
    'PBR channels are independently loaded, not cloned or aliased',
  );
  assert.equal(road.textures.stone.map.colorSpace, T.SRGBColorSpace);
  for (const [key, map] of Object.entries(road.textures.stone))
    if (key !== 'map') assert.equal(map.colorSpace, T.NoColorSpace);
  const camera = new T.PerspectiveCamera();
  camera.position.copy(track.sample(track.landmarks.veil.distance).position);
  let environment, environmentCounts;
  try {
    environment = createOpalineEnvironment({
      track,
      road,
      settings: { quality: 'low', reducedMotion: true },
    });
    const environmentResources = sceneResources(environment.group);
    assert.ok(
      environmentResources.some((resource) => borrowed.has(resource)),
      'scene actually borrows authored sculpture geometry',
    );
    environmentCounts = watch(
      environmentResources.filter((resource) => !borrowed.has(resource)),
    );
    assert.equal(
      environment.group.userData.metrics.runoffs,
      3,
      'shaded banks retain attachment metadata for all authored runoffs',
    );
    const water = environment.group.getObjectByName(
        'Opaline / iridescent river',
      ),
      initialTime = water.material.uniforms.time.value;
    const basin = environment.group.getObjectByName(
      'Opaline / contained upper emerald water',
    );
    const basinNormal = basin.material.uniforms.normalSampler.value;
    assert.ok(basinNormal.isTexture, 'reservoir owns a real normal texture');
    const basinNormalCounts = watch([basinNormal]);
    const flow = environment.group.getObjectByName(
      'Opaline / current surface ' + track.surgeZones[0].id,
    );
    environment.update({ camera, dt: 1, time: 6 });
    assert.equal(water.material.uniforms.time.value, initialTime);
    assert.equal(water.renderTarget.width, 384);
    assert.equal(basin.renderTarget.width, 256);
    assert.equal(basin.material.uniforms.time.value, 0);
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
    assert.equal(basin.renderTarget.width, 384);
    assert.ok(basin.material.uniforms.time.value > 0);
    assert.ok(flow.material.uniforms.head.value > activeHead);
    assert.equal(flow.material.uniforms.clock.value, 6.5);
    // Render-target resizing releases the previous GPU allocation; count final teardown separately.
    for (const reflector of [water, basin]) {
      assert.ok(environmentCounts.get(reflector.renderTarget) >= 1);
      environmentCounts.set(reflector.renderTarget, 0);
    }
    environment.dispose();
    environment.dispose();
    assert.equal(environment.group.children.length, 0);
    assertCounts(environmentCounts, 1);
    assertCounts(basinNormalCounts, 1);
    assertCounts(mapCounts, 0);
    assertCounts(roadCounts, 0);
    assertCounts(sculptureCounts, 0);
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
  assertCounts(sculptureCounts, 1);
  assert.equal(road.group.children.length, 0);
});

test('late environment construction failure releases its scene but leaves borrowed road assets intact', async (t) => {
  const { sculptureResources } = mockAssets(t);
  const track = createOpalineTrack(),
    road = await createOpalineRoad({ track }),
    mapCounts = watch(Object.values(road.textures.stone)),
    sculptureCounts = watch(sculptureResources),
    borrowed = borrowedGeometries(road);
  const cause = new Error('failed pressure-vein attachment');
  let group, resources;
  t.mock.method(T.Raycaster.prototype, 'intersectObjects', (objects) => {
    group = objects[0].parent;
    resources = watch(
      sceneResources(group).filter((resource) => !borrowed.has(resource)),
    );
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
    assertCounts(sculptureCounts, 0);
    assert.ok(road.group.children.length > 0);
  } finally {
    road.dispose();
  }
  assertCounts(mapCounts, 1);
  assertCounts(sculptureCounts, 1);
});

test('a failed PBR channel releases previously loaded unique maps before any sculpture acquisition', async (t) => {
  const cause = new Error('failed roughness channel');
  const { textures, sculptureResources } = mockAssets(t, {
    textureFailure: 2,
    cause,
  });
  const counts = new Map();
  t.mock.method(T.Texture.prototype, 'dispose', function () {
    counts.set(this, (counts.get(this) ?? 0) + 1);
  });
  await assert.rejects(
    createOpalineRoad({ track: createOpalineTrack() }),
    (error) => error === cause,
  );
  assert.equal(textures.length, 2);
  assert.equal(new Set(textures).size, 2);
  for (const texture of textures) assert.equal(counts.get(texture), 1);
  assert.equal(sculptureResources.size, 0);
});

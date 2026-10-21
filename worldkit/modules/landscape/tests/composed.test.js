import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createComposedLandscape } from '../src/Landscape.js';

function fixture() {
  const kit = new THREE.Group();
  const texture = new THREE.Texture({ close() {} });
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.4 }),
  );
  mesh.name = 'grass_short';
  kit.add(mesh);
  const terrain = {
    bounds: { minX: 100, maxX: 108, minZ: -20, maxZ: -12 },
    segments: 4,
    groundHeight: (x, z) => x * 0.01 + z * 0.02,
    pathMask: () => 0.5,
    tint: () => [0.9, 0.8, 0.7],
  };
  const entries = [false, false, true].map((reserve, i) => ({
    x: 101 + i,
    z: -19,
    matrix: new THREE.Matrix4().makeTranslation(101 + i, 2, -19),
    reserve,
  }));
  return {
    kit,
    mesh,
    texture,
    options: {
      terrain,
      placements: [{ prototype: 'grass_short', entries, density: true }],
    },
    context: {
      scene: new THREE.Scene(),
      renderer: {
        capabilities: { getMaxAnisotropy: () => 8 },
        shadowMap: { needsUpdate: false },
      },
    },
  };
}
function track(resources) {
  const disposed = resources.map(() => 0);
  resources.forEach((resource, i) =>
    resource.addEventListener('dispose', () => disposed[i]++),
  );
  return disposed;
}
function floorTextures(t) {
  const textures = [];
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => {
    const texture = new THREE.Texture();
    textures.push(texture);
    return texture;
  });
  return textures;
}

test('authored terrain and instance transforms survive configuration; borrowed kit survives disposal', async (t) => {
  const { kit, mesh, texture, options, context } = fixture();
  const borrowed = track([mesh.geometry, mesh.material, texture]);
  const textures = floorTextures(t);
  const layer = createComposedLandscape(options);
  layer.configure({ quality: 'balanced' });
  await layer.init({ ...context, assets: new Map([['forestKit', kit]]) });
  const group = context.scene.children[0];
  const terrain = group.children.find((item) => !item.isInstancedMesh);
  const batch = group.children.find((item) => item.isInstancedMesh);
  const owned = track([
    terrain.geometry,
    terrain.material,
    batch.geometry,
    batch.material,
    ...textures,
  ]);
  assert.equal(terrain.geometry.attributes.position.count, 25);
  const point = new THREE.Vector3().fromBufferAttribute(
    terrain.geometry.attributes.position,
    0,
  );
  assert.ok(
    Math.abs(point.y - options.terrain.groundHeight(point.x, point.z)) < 1e-6,
  );
  const matrix = new THREE.Matrix4();
  batch.getMatrixAt(1, matrix);
  assert.deepEqual(
    matrix.elements,
    options.placements[0].entries[1].matrix.elements,
  );
  assert.equal(batch.count, 1);
  layer.configure({ quality: 'high', richness: 1.6 });
  assert.equal(batch.count, 3);
  layer.configure({ richness: 0 });
  assert.equal(batch.count, 0);
  layer.configure({ richness: 1 });
  assert.equal(batch.count, 2);
  assert.ok(layer.getWeatherTargets().some((target) => target.ground));
  assert.ok(layer.getWeatherTargets().some((target) => target.wind === 0.7));
  layer.dispose();
  layer.dispose();
  assert.deepEqual(borrowed, [0, 0, 0]);
  assert.ok(owned.every((count) => count === 1));
  assert.equal(context.scene.children.length, 0);
  await assert.rejects(layer.init(context), /fresh/);
});

test('cancellation during owned kit loading releases the eventual kit and image once', async (t) => {
  const { kit, mesh, texture, options, context } = fixture();
  const closed = t.mock.method(texture.source.data, 'close');
  const disposed = track([mesh.geometry, mesh.material, texture]);
  let finish;
  t.mock.method(
    GLTFLoader.prototype,
    'loadAsync',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const layer = createComposedLandscape(options);
  const pending = layer.init(context);
  layer.dispose();
  layer.dispose();
  finish({ scene: kit });
  await pending;
  assert.deepEqual(disposed, [1, 1, 1]);
  assert.equal(closed.mock.callCount(), 1);
  assert.equal(context.scene.children.length, 0);
});

test('cancellation while floor maps load releases maps and preserves the borrowed kit', async (t) => {
  const { kit, mesh, texture, options, context } = fixture();
  const borrowed = track([mesh.geometry, mesh.material, texture]);
  const textures = Array.from({ length: 6 }, () => new THREE.Texture());
  const disposed = track(textures);
  const finish = [];
  t.mock.method(
    THREE.TextureLoader.prototype,
    'loadAsync',
    () => new Promise((resolve) => finish.push(resolve)),
  );
  const layer = createComposedLandscape(options);
  const pending = layer.init({ ...context, assets: { forestKit: kit } });
  layer.dispose();
  finish.forEach((resolve, i) => resolve(textures[i]));
  await pending;
  assert.ok(disposed.every((count) => count === 1));
  assert.deepEqual(borrowed, [0, 0, 0]);
  assert.equal(context.scene.children.length, 0);
});

test('a failed map load releases all other maps and the owned kit', async (t) => {
  const { kit, mesh, texture, options, context } = fixture();
  const disposed = track([mesh.geometry, mesh.material, texture]);
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => ({
    scene: kit,
  }));
  const maps = Array.from({ length: 5 }, () => new THREE.Texture());
  const mapDisposals = track(maps);
  let next = 0;
  t.mock.method(THREE.TextureLoader.prototype, 'loadAsync', async () => {
    if (next === 5) throw new Error('missing floor map');
    return maps[next++];
  });
  const layer = createComposedLandscape(options);
  await assert.rejects(layer.init(context), /missing floor map/);
  layer.dispose();
  assert.deepEqual(disposed, [1, 1, 1]);
  assert.ok(mapDisposals.every((count) => count === 1));
  assert.equal(context.scene.children.length, 0);
});

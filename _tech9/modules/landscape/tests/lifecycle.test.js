import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Group,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
  Texture,
  Scene,
  PerspectiveCamera,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLandscape } from '../src/Landscape.js';
const options = {
  layout: {
    bounds: { minX: 0, maxX: 64, minZ: 0, maxZ: 64 },
    forestCover: () => 0,
  },
};
test('dispose during asset load releases late resources once without touching the scene', async (t) => {
  let resolve;
  t.mock.method(
    GLTFLoader.prototype,
    'loadAsync',
    () => new Promise((r) => (resolve = r)),
  );
  let closed = 0;
  const texture = new Texture({ close: () => closed++ }),
    geometry = new BoxGeometry(),
    material = new MeshStandardMaterial({ map: texture });
  const kit = new Group();
  kit.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const releases = [0, 0, 0];
  [texture, geometry, material].forEach((r, i) =>
    r.addEventListener('dispose', () => releases[i]++),
  );
  const landscape = createLandscape(options),
    scene = new Scene();
  landscape.configure({ quality: 'balanced' });
  assert.throws(() => landscape.configure({ quality: 'invalid' }), /quality/);
  const pending = landscape.init({
    scene,
    camera: new PerspectiveCamera(),
    renderer: {},
  });
  landscape.dispose();
  landscape.dispose();
  resolve({ scene: kit });
  await pending;
  assert.deepEqual(releases, [1, 1, 1]);
  assert.equal(closed, 1);
  assert.equal(scene.children.length, 0);
  await assert.rejects(
    landscape.init({ scene, camera: {}, renderer: {} }),
    /fresh/,
  );
  assert.throws(() => landscape.getWeatherTargets(), /Initialize/);
});
test('asset failure rejects init and prevents reuse of a partially initialized layer', async (t) => {
  t.mock.method(GLTFLoader.prototype, 'loadAsync', async () => {
    throw new Error('missing forest asset');
  });
  const landscape = createLandscape(options);
  await assert.rejects(
    landscape.init({
      scene: new Scene(),
      camera: new PerspectiveCamera(),
      renderer: {},
    }),
    /missing forest/,
  );
  landscape.dispose();
  await assert.rejects(
    landscape.init({ scene: {}, camera: {}, renderer: {} }),
    /fresh/,
  );
});

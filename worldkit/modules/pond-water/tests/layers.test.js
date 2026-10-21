import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShoreline, SHORE_GLSL } from '../src/shoreline.js';
import { createPondWaterLayer } from '../src/PondWater.js';
import { Water } from '../src/WaterSurface.js';
import { createPondShoreLayer } from '../src/PondShore.js';
const close = (a, b, epsilon = 1e-8) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test('relocated shoreline uses one CPU and shader frame without hardcoded pond coordinates', () => {
  const shore = createShoreline({
    x: 12,
    z: 4,
    radiusX: 9,
    radiusZ: 13,
    level: 2,
  });
  const water = new Water(new THREE.PlaneGeometry(), { shoreline: shore });
  assert.deepEqual(
    water.material.uniforms.pondFrame.value.toArray(),
    [12, 4, 9, 13],
  );
  assert.ok(water.material.fragmentShader.includes(SHORE_GLSL));
  assert.match(
    water.material.fragmentShader,
    /length\(pond\) \/ shoreShape\(a\)/,
  );
  for (let a = 0; a < 6.2; a += 0.1) {
    const p = shore.point(a);
    close(shore.radius(...p), 1);
    close(
      shore.terrainHeight(...p, () => 10),
      2,
    );
    assert.equal(shore.isWalkable(...p), false);
  }
  assert.throws(() => createShoreline({ radiusX: 0 }), /positive radii/);
  assert.throws(() => createShoreline({ level: NaN }), /finite/);
  water.geometry.dispose();
  water.dispose();
});

test('water quality validates fallback and layer releases its exact owned resources once', () => {
  const scene = new THREE.Scene();
  const layer = createPondWaterLayer();
  layer.init({ scene });
  const water = scene.children[0];
  for (const [quality, size, stride] of [
    ['ultra', 2048, 2],
    ['high', 1536, 2],
    ['balanced', 1024, 3],
    ['bogus', 1024, 3],
  ]) {
    layer.configure({ quality });
    assert.equal(water.renderTarget.width, size);
    assert.equal(layer.stats.reflectionStride, stride);
  }
  layer.configure({ quality: '__proto__' });
  assert.equal(layer.stats.quality, 'balanced');
  layer.update(0.5);
  close(water.material.uniforms.time.value, 0.17);
  const resources = [
    water.renderTarget,
    water.geometry,
    water.material,
    water.material.uniforms.normalSampler.value,
  ];
  const counts = resources.map(() => 0);
  resources.forEach((r, i) => r.addEventListener('dispose', () => counts[i]++));
  layer.dispose();
  layer.dispose();
  layer.update(0.2);
  layer.configure({ quality: 'ultra' });
  assert.deepEqual(counts, [1, 1, 1, 1]);
  assert.equal(scene.children.length, 0);
});

test('water layer supports disposal before initialization and after partial initialization', () => {
  const unopened = createPondWaterLayer();
  unopened.dispose();
  unopened.dispose();
  assert.throws(
    () => unopened.init({ scene: new THREE.Scene() }),
    /initialize once/,
  );
  const layer = createPondWaterLayer();
  let captured;
  assert.throws(
    () =>
      layer.init({
        scene: {
          add(water) {
            captured = water;
            throw new Error('add failed');
          },
          remove() {},
        },
      }),
    /add failed/,
  );
  let disposed = 0;
  captured.renderTarget.addEventListener('dispose', () => disposed++);
  layer.dispose();
  layer.dispose();
  assert.equal(disposed, 1);
});

test('shore detail releases texture requests which settle after failed initialization', async () => {
  const original = THREE.TextureLoader.prototype.loadAsync;
  let calls = 0;
  const settle = [];
  THREE.TextureLoader.prototype.loadAsync = function () {
    if (calls++ === 0) return Promise.reject(new Error('texture missing'));
    return new Promise((resolve) => settle.push(resolve));
  };
  const layer = createPondShoreLayer();
  try {
    await assert.rejects(
      layer.init({
        scene: new THREE.Scene(),
        renderer: { capabilities: { getMaxAnisotropy: () => 8 } },
      }),
      /texture missing/,
    );
    layer.dispose();
    layer.dispose();
    let disposals = 0;
    for (const resolve of settle) {
      const texture = new THREE.Texture();
      texture.addEventListener('dispose', () => disposals++);
      resolve(texture);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(disposals, 2);
  } finally {
    THREE.TextureLoader.prototype.loadAsync = original;
    layer.dispose();
  }
});

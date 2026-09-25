import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createIslandCoast, createNavigationArea } from '../src/islandCoast.js';
import { createOceanLayer } from '../src/OceanLayer.js';
import { createOceanNormals } from '../src/oceanNormals.js';

const coast = createIslandCoast({
  x: 30,
  z: -20,
  radius: 18,
  level: 2,
  harmonics: [{ amplitude: 2, frequency: 5, phase: 0.3 }],
});

test('one immutable coast supplies translated terrain, vegetation, navigation and GLSL', () => {
  assert.ok(Object.isFrozen(coast.definition.harmonics[0]));
  assert.match(coast.glsl, /vec2\(30.0, -20.0\)/);
  for (let angle = 0; angle < 6.28; angle += 0.031) {
    const shore = coast.point(angle),
      land = coast.point(angle, 4),
      sea = coast.point(angle, -4);
    assert.ok(Math.abs(coast.terrainHeight(...shore) - 2) < 1e-8);
    assert.ok(
      coast.terrainHeight(...land) > 2 && coast.vegetationAllowed(...land),
    );
    assert.ok(coast.terrainHeight(...sea) < 2 && coast.isNavigable(...sea, 1));
    assert.equal(coast.isNavigable(...land, 1), false);
    assert.equal(coast.isNavigable(...shore, 1), false);
  }
  assert.throws(() => createIslandCoast({ radius: 2 }), /variation/);
  assert.throws(
    () => createIslandCoast({ harmonics: [{ amplitude: 2, frequency: 2.5 }] }),
    /harmonic/,
  );
});

test('conservative disc query rejects hulls crossing a high-curvature coast between samples', () => {
  const jagged = createIslandCoast({
    radius: 20,
    segments: 64,
    harmonics: [{ amplitude: 5, frequency: 16 }],
  });
  let accepted = 0;
  for (let a = 0; a < 6.28; a += 0.037)
    for (let offset = 1; offset < 5; offset += 0.5) {
      const [x, z] = jagged.point(a, -offset);
      if (!jagged.isNavigable(x, z, 1.5)) continue;
      accepted++;
      for (let h = 0; h < 6.28; h += 0.04)
        assert.ok(
          jagged.distance(x + Math.cos(h) * 1.5, z + Math.sin(h) * 1.5) > 0,
        );
    }
  assert.ok(accepted > 50);
});

test('navigation uses copied circle, box and bounds placements with hull radius', () => {
  const bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    circles = [{ x: -40, z: 0, radius: 3 }],
    boxes = [{ x: -40, z: 20, width: 10, depth: 4 }];
  const free = createNavigationArea({ coast, bounds, circles, boxes });
  circles[0].radius = 50;
  boxes[0].width = 100;
  bounds.minX = 0;
  assert.equal(free(-30, 0, 2), true);
  assert.equal(free(-36, 0, 2), false);
  assert.equal(free(-34, 20, 2), false);
  assert.equal(free(-32, 20, 2), true);
  assert.equal(free(-99, 0, 2), false);
  assert.equal(free(NaN, 0), false);
});

test('ocean has relocated hole, explicit surface shading, bounded quality and exact cleanup', () => {
  const scene = new THREE.Scene(),
    layer = createOceanLayer({ coast, halfSize: 100, normalSize: 32 });
  layer.init({ scene });
  const water = scene.children[0];
  assert.ok(water.material.fragmentShader.includes(coast.glsl));
  assert.doesNotMatch(water.material.fragmentShader, /vec2 pond =/);
  assert.match(water.material.fragmentShader, /reflectionValid/);
  water.geometry.computeBoundingBox();
  assert.equal(water.geometry.boundingBox.min.x, -70);
  assert.equal(water.geometry.boundingBox.max.y, 120);
  assert.equal(water.position.y, 2.02);
  for (const [quality, size] of [
    ['ultra', 2048],
    ['high', 1536],
    ['__proto__', 1024],
  ]) {
    layer.configure({ quality });
    assert.equal(layer.stats.reflectionSize, size);
  }
  water.reflectionFrame = 11;
  layer.invalidateReflection();
  assert.equal(water.reflectionFrame, 0);
  layer.update(NaN);
  layer.update(-1);
  layer.update(0.2);
  assert.equal(water.material.uniforms.time.value, 0.1);
  const resources = [
    water.renderTarget,
    water.geometry,
    water.material,
    water.material.uniforms.normalSampler.value,
  ];
  const disposed = resources.map(() => 0);
  resources.forEach((r, i) =>
    r.addEventListener('dispose', () => disposed[i]++),
  );
  assert.throws(() => layer.init({ scene }), /once/);
  layer.dispose();
  layer.dispose();
  layer.update(1);
  layer.configure();
  assert.deepEqual(disposed, [1, 1, 1, 1]);
  assert.equal(scene.children.length, 0);
});

test('ocean cleans up failed initialization and rejects invalid shapes/textures', () => {
  assert.throws(() => createOceanLayer({ coast, halfSize: 10 }), /extent/);
  assert.throws(() => createOceanNormals(17), /power/);
  const layer = createOceanLayer({ coast, normalSize: 16 });
  let counts;
  assert.throws(
    () =>
      layer.init({
        scene: {
          add(water) {
            const resources = [
              water.renderTarget,
              water.geometry,
              water.material,
              water.material.uniforms.normalSampler.value,
            ];
            counts = resources.map(() => 0);
            resources.forEach((r, i) =>
              r.addEventListener('dispose', () => counts[i]++),
            );
            throw new Error('add failed');
          },
          remove() {},
        },
      }),
    /add failed/,
  );
  assert.deepEqual(counts, [1, 1, 1, 1]);
  layer.dispose();
  assert.throws(() => layer.init({ scene: new THREE.Scene() }), /once/);
  const unopened = createOceanLayer();
  unopened.dispose();
  assert.throws(() => unopened.init({ scene: new THREE.Scene() }), /once/);
});

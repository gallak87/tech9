import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createRiverWaterLayer } from '../../../src/water.js';

test('river follows supplied points, has upward triangles, and releases every resource once', () => {
  const scene = new T.Scene();
  const layer = createRiverWaterLayer({
    points: [
      [-30, 5],
      [0, 8],
      [40, 16],
    ],
    halfWidth: 10,
    level: -12,
  });
  layer.init({ scene });
  const water = scene.children[0];
  water.updateMatrixWorld(true);
  const p = water.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const vertex = new T.Vector3()
      .fromBufferAttribute(p, i)
      .applyMatrix4(water.matrixWorld);
    assert.ok(Math.abs(vertex.y + 12) < 1e-8);
  }
  const index = water.geometry.index;
  const a = new T.Vector3().fromBufferAttribute(p, index.getX(0)),
    b = new T.Vector3().fromBufferAttribute(p, index.getX(1)),
    c = new T.Vector3().fromBufferAttribute(p, index.getX(2));
  assert.ok(b.sub(a).cross(c.sub(a)).z > 0, 'upward-facing ribbon');
  const resources = [
    water.geometry,
    water.material,
    water.renderTarget,
    water.material.uniforms.normalSampler.value,
  ];
  const counts = resources.map(() => 0);
  resources.forEach((resource, i) =>
    resource.addEventListener('dispose', () => counts[i]++),
  );
  layer.update(2);
  assert.equal(water.material.uniforms.time.value, 1);
  layer.configure({ quality: 'bogus' });
  assert.equal(layer.stats.quality, 'balanced');
  layer.dispose();
  layer.dispose();
  layer.update(2);
  assert.equal(scene.children.length, 0);
  assert.deepEqual(counts, [1, 1, 1, 1]);
});

test('river validates its authored centreline and survives failed initialization', () => {
  assert.throws(() => createRiverWaterLayer(), /points/);
  assert.throws(
    () =>
      createRiverWaterLayer({
        points: [
          [0, 0],
          [NaN, 1],
        ],
      }),
    /finite/,
  );
  assert.throws(
    () =>
      createRiverWaterLayer({
        points: [
          [0, 0],
          [0, 0],
        ],
      }),
    /distinct/,
  );
  assert.throws(
    () =>
      createRiverWaterLayer({
        points: [
          [0, 0],
          [5, 5],
        ],
        halfWidth: 0,
      }),
    /positive/,
  );
  const unopened = createRiverWaterLayer({
    points: [
      [0, 0],
      [5, 5],
    ],
  });
  unopened.dispose();
  assert.throws(
    () => unopened.init({ scene: new T.Scene() }),
    /initialize once/,
  );
  const layer = createRiverWaterLayer({
    points: [
      [0, 0],
      [5, 5],
    ],
  });
  assert.throws(
    () =>
      layer.init({
        scene: {
          add() {
            throw new Error('scene failed');
          },
          remove() {},
        },
      }),
    /scene failed/,
  );
  layer.dispose();
});

test('river samples signed bathymetry across the channel and along long centreline spans', () => {
  const scene = new T.Scene();
  const layer = createRiverWaterLayer({
    points: [
      [0, 0],
      [100, 0],
    ],
    halfWidth: 10,
    depthAt: (x, z) => 8 - z * z * 0.15,
  });
  layer.init({ scene });
  try {
    const geometry = scene.children[0].geometry;
    const p = geometry.attributes.position,
      d = geometry.attributes.riverWaterDepth,
      flow = geometry.attributes.riverFlow;
    assert.equal(d.count, p.count);
    assert.equal(flow.count, p.count);
    assert.ok(
      Math.min(...d.array) < 0 && Math.max(...d.array) > 7.9,
      'both dry banks and a deep current are retained',
    );
    const xs = new Set();
    for (let i = 0; i < p.count; i++) {
      xs.add(p.getX(i));
      assert.ok(Math.abs(d.getX(i) - (8 - p.getY(i) ** 2 * 0.15)) < 1e-5);
    }
    const stations = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < stations.length; i++)
      assert.ok(stations[i] - stations[i - 1] <= 12.00001);
  } finally {
    layer.dispose();
  }
});

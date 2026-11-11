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

test('advected current transports material downstream through a bend and slows near shallow banks', () => {
  const scene = new T.Scene();
  let depthCalls = 0;
  const layer = createRiverWaterLayer({
    points: [
      [0, 0],
      [70, 0],
      [110, 40],
      [110, 100],
    ],
    halfWidth: 10,
    flowSpeed: 6,
    depthAt: (x, z) => {
      depthCalls++;
      // A deep entry reach with shallow side margins, then constant depth around the bend.
      return x < 65 ? 14 - Math.abs(z) * 1.35 : 14;
    },
  });
  layer.init({ scene });
  try {
    const callsAfterInit = depthCalls;
    const deep = layer.sampleFlow(30, 0, 6);
    const shallow = layer.sampleFlow(30, 9, 6);
    assert.equal(deep.speed, 6);
    assert.ok(
      shallow.speed < deep.speed * 0.4,
      'banks move substantially slower than the thalweg',
    );
    const carried = layer.sampleFlow(30 + deep.speed * 2, 0, 8);
    assert.ok(
      Math.abs(
        carried.layers[0].sourceDistance - deep.layers[0].sourceDistance,
      ) < 1e-8,
      'a material feature keeps its source coordinate while travelling downstream',
    );
    const afterBend = layer.sampleFlow(155, 0, 8);
    assert.ok(
      afterBend.velocity[1] > afterBend.velocity[0] * 3,
      'transport follows the bent centreline instead of a global scrolling axis',
    );
    assert.ok(deep.velocity[0] > 5.99 && Math.abs(deep.velocity[1]) < 1e-8);
    assert.equal(
      depthCalls,
      callsAfterInit,
      'queries use retained sampled depths, not the consumer terrain',
    );
    assert.equal(layer.sampleFlow(NaN), null);
    assert.equal(layer.stats.flowSpeed, 6);
    assert.equal(layer.stats.flowPeriod, 24);
  } finally {
    layer.dispose();
  }
  assert.equal(layer.sampleFlow(30), null);
});

test('overlapping transport phases hide both resets without reversing downstream motion', () => {
  const scene = new T.Scene();
  const layer = createRiverWaterLayer({
    points: [
      [0, 0],
      [400, 0],
    ],
    flowSpeed: 5,
  });
  layer.init({ scene });
  try {
    const value = (time) =>
      layer
        .sampleFlow(150, 0, time)
        .layers.reduce(
          (sum, phase) =>
            sum +
            phase.weight *
              (Math.sin(phase.sourceDistance * 0.047) +
                Math.cos(phase.sourceDistance * 0.081)),
          0,
        );
    for (const seam of [12, 24, 36, 48, 96]) {
      const before = layer.sampleFlow(150, 0, seam - 1e-6);
      const after = layer.sampleFlow(150, 0, seam + 1e-6);
      assert.ok(
        Math.abs(before.layers.reduce((sum, p) => sum + p.weight, 0) - 1) <
          1e-12,
      );
      assert.ok(
        Math.abs(after.layers.reduce((sum, p) => sum + p.weight, 0) - 1) <
          1e-12,
      );
      assert.ok(
        Math.abs(value(seam - 1e-6) - value(seam + 1e-6)) < 1e-5,
        `material field remains continuous through reset at ${seam}s`,
      );
      const continuous = seam % 24 === 0 ? 1 : 0;
      assert.ok(
        after.layers[continuous].sourceDistance <
          before.layers[continuous].sourceDistance,
        'visible phase keeps moving downstream across the other phase reset',
      );
    }
  } finally {
    layer.dispose();
  }
});

test('absolute river time, pause, reduced motion and configuration share one deterministic transport clock', () => {
  const scene = new T.Scene();
  const layer = createRiverWaterLayer({
    points: [
      [0, 0],
      [100, 0],
    ],
    foamStrength: 0.8,
  });
  layer.init({ scene });
  const water = scene.children[0];
  try {
    layer.update(2);
    assert.equal(layer.stats.time, 2);
    assert.equal(water.material.uniforms.riverTime.value, 2);
    layer.update(100, { paused: true });
    layer.update(100, { reducedMotion: true });
    assert.equal(layer.stats.time, 2);
    layer.configure({ reducedMotion: true, flowSpeed: 7, foamStrength: 0.4 });
    layer.update(100);
    assert.equal(layer.stats.time, 2);
    assert.equal(water.material.uniforms.riverSpeed.value, 7);
    assert.equal(water.material.uniforms.riverFoamStrength.value, 0.4);
    layer.configure({ reducedMotion: false });
    layer.update(0, { time: 15 });
    assert.equal(layer.stats.time, 15);
    assert.equal(water.material.uniforms.time.value, 7.5);
    const seek = layer.sampleFlow(50);
    layer.update(20);
    layer.update(0, { time: 15 });
    assert.deepEqual(
      layer.sampleFlow(50),
      seek,
      'absolute time exactly restores the material field',
    );
    for (const flowSpeed of [-1, NaN, Infinity])
      assert.throws(() => layer.configure({ flowSpeed }), /flowSpeed/);
    for (const foamStrength of [-1, 2, NaN])
      assert.throws(() => layer.configure({ foamStrength }), /foamStrength/);
  } finally {
    layer.dispose();
  }
  assert.throws(
    () =>
      createRiverWaterLayer({
        points: [
          [0, 0],
          [1, 0],
        ],
        flowSpeed: -1,
      }),
    /flowSpeed/,
  );
});

test('native flow probes interpolate the same triangle and signed depth as the rendered ribbon', () => {
  const scene = new T.Scene();
  const layer = createRiverWaterLayer({
    points: [
      [0, 0],
      [10, 0],
    ],
    halfWidth: 10,
    crossSegments: 2,
    depthAt: (x, z) => 200 + x * z,
  });
  layer.init({ scene });
  try {
    const mesh = scene.children[0];
    mesh.updateMatrixWorld(true);
    const probe = layer.sampleFlow(2, -5);
    const hit = new T.Raycaster(
      new T.Vector3(2, 100, -5),
      new T.Vector3(0, -1, 0),
    ).intersectObject(mesh)[0];
    assert.ok(hit);
    const p = mesh.geometry.attributes.position;
    const triangle = new T.Triangle(
      ...[hit.face.a, hit.face.b, hit.face.c].map((i) =>
        new T.Vector3().fromBufferAttribute(p, i),
      ),
    );
    const bary = triangle.getBarycoord(
      mesh.worldToLocal(hit.point.clone()),
      new T.Vector3(),
    );
    const d = mesh.geometry.attributes.riverWaterDepth;
    const renderedDepth =
      d.getX(hit.face.a) * bary.x +
      d.getX(hit.face.b) * bary.y +
      d.getX(hit.face.c) * bary.z;
    assert.ok(
      Math.abs(probe.depth - renderedDepth) < 1e-6,
      'probe and fragment interpolation agree, including non-bilinear depth fields',
    );
    assert.ok(new T.Vector3(...probe.position).distanceTo(hit.point) < 1e-6);
  } finally {
    layer.dispose();
  }
});

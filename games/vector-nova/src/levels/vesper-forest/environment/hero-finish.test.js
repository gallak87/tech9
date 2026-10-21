import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createVesperTrack } from '../track/model.js';
import { refineHollow } from './hero-finish.js';

async function heroGeometry() {
  const bytes = await readFile(
    new URL(
      '../../../../public/assets/levels/vesper/vesper-canopy.glb',
      import.meta.url,
    ),
  );
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  const stripTextures = (object) => {
    for (const key of Object.keys(object)) {
      if (key.endsWith('Texture')) delete object[key];
      else if (object[key] && typeof object[key] === 'object')
        stripTextures(object[key]);
    }
  };
  json.materials.forEach(stripTextures);
  delete json.images;
  delete json.textures;
  const source = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(source.length / 4) * 4;
  const binary = bytes.subarray(20 + jsonLength);
  const result = new Uint8Array(20 + padded + binary.byteLength);
  const view = new DataView(result.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, result.byteLength, true);
  view.setUint32(12, padded, true);
  view.setUint32(16, 0x4e4f534a, true);
  result.fill(32, 20, 20 + padded);
  result.set(source, 20);
  result.set(binary, 20 + padded);
  return (await new GLTFLoader().parseAsync(result.buffer, '')).scene;
}

const pointKey = (p) =>
  [p.x, p.y, p.z].map((v) => Math.round(v * 1000)).join(',');

test('actual hollow rim stays connected to exact authored edges and preserves all non-rim sapwood', async () => {
  const library = await heroGeometry();
  const source = library.getObjectByName('hero_hollow');
  const track = createVesperTrack(),
    hollow = source.clone(true);
  hollow.position.set(
    track.landmarks.hollow.center[0],
    track.landmarks.hollow.base,
    track.landmarks.hollow.center[2],
  );
  let originalSapwood;
  source.traverse((object) => {
    if (
      /hero_hollow/.test(object.name) &&
      /exposed ivory sapwood/.test(object.material?.name ?? '')
    )
      originalSapwood = object;
  });
  const originalGeometry = originalSapwood.geometry;
  const originalIndex = [...originalGeometry.index.array];
  const originalPositions = [...originalGeometry.attributes.position.array];
  let originalDisposals = 0;
  originalGeometry.addEventListener('dispose', () => originalDisposals++);
  const result = refineHollow(hollow, track);
  assert.equal(result.changed, true);
  assert.equal(result.stats.stations, 126);
  assert.equal(result.stats.removedTriangles, 252);
  assert.equal(result.stats.addedTriangles, 1008);
  assert.equal(result.stats.extraDraws, 1);
  assert.ok(result.stats.maxRetreat > 2);
  assert.ok(result.stats.maxRetreat < 5);
  assert.ok(result.stats.minClearanceDelta > -0.002);
  assert.equal(originalDisposals, 0);
  assert.deepEqual([...originalGeometry.index.array], originalIndex);
  assert.deepEqual(
    [...originalGeometry.attributes.position.array],
    originalPositions,
  );
  assert.equal(
    result.rim.parent.geometry.index.count,
    originalIndex.length - 252 * 3,
  );
  assert.equal(result.materials[0].vertexColors, true);

  const originalPoints = new Set();
  const p = new T.Vector3();
  for (let i = 0; i < originalGeometry.attributes.position.count; i++)
    originalPoints.add(
      pointKey(p.fromBufferAttribute(originalGeometry.attributes.position, i)),
    );
  const positions = result.rim.geometry.attributes.position;
  for (let station = 0; station < 126; station++) {
    for (const row of [0, 4])
      assert.ok(
        originalPoints.has(
          pointKey(p.fromBufferAttribute(positions, station * 5 + row)),
        ),
        'both wall attachment edges are exact',
      );
  }
  for (const attribute of Object.values(result.rim.geometry.attributes))
    assert.ok([...attribute.array].every(Number.isFinite));
  assert.equal(
    refineHollow(hollow, track).changed,
    false,
    'refinement is idempotent',
  );

  // Independently compare every finished sample with its original flat ribbon
  // using denser route sampling than the implementation's safety projection.
  const route = [];
  for (let s = 0; s < track.length; s += 2)
    route.push(track.sample(s).position.clone());
  const nearest = (point) =>
    Math.sqrt(
      Math.min(...route.map((sample) => sample.distanceToSquared(point))),
    );
  const outer = new T.Vector3(),
    inner = new T.Vector3(),
    finished = new T.Vector3();
  for (let station = 0; station < 126; station++) {
    outer.fromBufferAttribute(positions, station * 5);
    inner.fromBufferAttribute(positions, station * 5 + 4);
    for (const [row, t] of [0, 0.15, 0.5, 0.85, 1].entries()) {
      const baseline = outer
        .clone()
        .lerp(inner, t)
        .applyMatrix4(result.rim.parent.matrixWorld);
      finished
        .fromBufferAttribute(positions, station * 5 + row)
        .applyMatrix4(result.rim.parent.matrixWorld);
      assert.ok(
        nearest(finished) >= nearest(baseline) - 0.03,
        `opening preserved at ${station}/${row}`,
      );
    }
  }
  result.rim.geometry.dispose();
  result.rim.parent.geometry.dispose();
  result.materials[0].dispose();
  const geometries = new Set(),
    materials = new Set();
  library.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
});

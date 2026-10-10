import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createShatterlineTrack } from '../src/levels/shatterline/track/model.js';
import { shatterlinePlacements } from '../src/levels/shatterline/environment/placements.js';
import { groundFrame } from '../src/environment/placement.js';

const track = createShatterlineTrack();
const cellSize = 96;
const clearanceRadius = 5;
const assets = new Map();
for (const name of [
  'geology-bedded-ridge',
  'geology-eroded-bluff',
  'geology-distant-range',
]) {
  const bytes = await readFile(
    new URL(`../public/assets/levels/shatterline/${name}.glb`, import.meta.url),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  scene.updateMatrixWorld(true);
  assets.set(name, scene);
}

// Closed tubes are checked around their entire circumference, not just the AI
// reference lane. Camera offsets also cover the exposed corkscrews and joins.
const probes = [];
const corridor = new T.Box3();
for (let s = track.overturn.start - 48; s <= track.overturn.end + 48; s += 8) {
  const halfWidth = track.tubeProfile(s)?.halfWidth ?? track.width / 2;
  for (let column = 0; column <= 32; column++) {
    const lateral = halfWidth * (column / 16 - 1);
    let frame = track.sampleSurface(s, lateral);
    if (!frame) {
      frame = track.sample(s);
      frame.position.addScaledVector(frame.right, lateral);
    }
    for (const height of [0, 12, 24, 40])
      for (const back of [0, 20]) {
        const point = frame.position
          .clone()
          .addScaledVector(frame.up, height)
          .addScaledVector(frame.tangent, -back);
        probes.push({ s, lateral, height, back, point });
        corridor.expandByPoint(point);
      }
  }
}
corridor.expandByScalar(clearanceRadius);

function geologyIndex(placements) {
  const cells = new Map();
  let ceiling = -Infinity;
  for (const placement of placements) {
    const meshes = [];
    const bounds = new T.Box3();
    assets.get(placement.asset).traverse((mesh) => {
      if (!mesh.isMesh) return;
      const matrix = placement.matrix.clone().multiply(mesh.matrixWorld);
      mesh.geometry.computeBoundingBox();
      bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(matrix));
      meshes.push({ geometry: mesh.geometry, matrix });
    });
    if (!bounds.intersectsBox(corridor)) continue;
    ceiling = Math.max(ceiling, bounds.max.y);
    for (const { geometry, matrix } of meshes) {
      const positions = geometry.attributes.position,
        indices = geometry.index;
      for (let n = 0; n < (indices?.count ?? positions.count); n += 3) {
        const vertices = [0, 1, 2].map((i) =>
          new T.Vector3()
            .fromBufferAttribute(
              positions,
              indices ? indices.getX(n + i) : n + i,
            )
            .applyMatrix4(matrix),
        );
        const bounds = new T.Box3().setFromPoints(vertices);
        // Keep bottom caps even below the road envelope. Surface intersections
        // alone miss a hull or camera fully contained inside a solid mountain.
        if (
          bounds.max.x < corridor.min.x ||
          bounds.min.x > corridor.max.x ||
          bounds.max.z < corridor.min.z ||
          bounds.min.z > corridor.max.z
        )
          continue;
        const face = {
          id: placement.id,
          triangle: new T.Triangle(...vertices),
          bounds,
        };
        for (
          let x = Math.floor((bounds.min.x - clearanceRadius) / cellSize);
          x <= Math.floor((bounds.max.x + clearanceRadius) / cellSize);
          x++
        )
          for (
            let z = Math.floor((bounds.min.z - clearanceRadius) / cellSize);
            z <= Math.floor((bounds.max.z + clearanceRadius) / cellSize);
            z++
          ) {
            const key = `${x}:${z}`;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(face);
          }
      }
    }
  }
  return { cells, ceiling: ceiling + 100 };
}

function firstObstruction(placements) {
  const { cells, ceiling } = geologyIndex(placements);
  const ray = new T.Ray(),
    hit = new T.Vector3(),
    closest = new T.Vector3();
  for (const probe of probes) {
    const { point } = probe;
    const faces = cells.get(
      `${Math.floor(point.x / cellSize)}:${Math.floor(point.z / cellSize)}`,
    );
    if (!faces) continue;
    const heights = new Map();
    ray.origin.set(point.x, ceiling, point.z);
    ray.direction.set(0, -1, 0);
    for (const { id, triangle, bounds } of faces) {
      if (
        bounds.distanceToPoint(point) < clearanceRadius &&
        triangle.closestPointToPoint(point, closest).distanceTo(point) <
          clearanceRadius
      )
        return { kind: 'surface', id, ...probe, point: point.toArray() };
      if (
        !ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)
      )
        continue;
      if (!heights.has(id)) heights.set(id, []);
      heights.get(id).push(hit.y);
    }
    for (const [id, hits] of heights) {
      const unique = hits
        .sort((a, b) => b - a)
        .filter((y, i, all) => !i || Math.abs(y - all[i - 1]) > 1e-4);
      for (let i = 0; i + 1 < unique.length; i += 2)
        if (point.y < unique[i] && point.y > unique[i + 1])
          return {
            kind: 'inside solid',
            id,
            ...probe,
            point: point.toArray(),
            top: unique[i],
            bottom: unique[i + 1],
          };
    }
  }
  return null;
}

const placements = shatterlinePlacements(track).filter((p) =>
  p.asset.startsWith('geology-'),
);
test('actual mountain meshes clear the entire two-tube sheet and chase camera corridor', () => {
  const obstruction = firstObstruction(placements);
  assert.equal(obstruction, null, JSON.stringify(obstruction));
});

test('clearance regression detects the former tangent-aligned canyon wall', () => {
  const s = T.MathUtils.lerp(track.overturn.start, track.overturn.end, 0.78);
  const frame = groundFrame(track, s);
  const position = frame.position.clone().addScaledVector(frame.right, 650);
  position.y -= 135;
  const quaternion = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 1, 0),
    Math.atan2(frame.tangent.x, frame.tangent.z) + 0.025,
  );
  const matrix = new T.Matrix4().compose(
    position,
    quaternion,
    new T.Vector3(1.1, 0.95, 0.78),
  );
  const delta = track
    .sample(s + 280)
    .position.sub(track.sample(s - 280).position);
  const grade = T.MathUtils.clamp(
    delta.y / Math.max(1, Math.hypot(delta.x, delta.z)),
    -0.85,
    -0.06,
  );
  for (const column of [0, 4, 8])
    matrix.elements[column + 1] +=
      grade *
      (frame.tangent.x * matrix.elements[column] +
        frame.tangent.z * matrix.elements[column + 2]);
  const obstruction = firstObstruction([
    { id: 'legacy-overturn-ridge', asset: 'geology-bedded-ridge', matrix },
  ]);
  assert.ok(
    obstruction,
    'the original floating canyon transform must fail this audit',
  );
  assert.equal(obstruction.id, 'legacy-overturn-ridge');
});

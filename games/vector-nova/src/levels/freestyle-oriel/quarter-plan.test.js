import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOrielFreestyleTrack } from './track/model.js';
import {
  createSunvaultQuarterPlan,
  verifySunvaultQuarterPlan,
  sunvaultQuarterClearanceEnvelope,
} from './quarter-plan.js';

async function load(path) {
  const bytes = await readFile(new URL(`../../../${path}`, import.meta.url));
  const { scene } = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  scene.updateMatrixWorld(true);
  return scene;
}
function signature(root) {
  const hash = createHash('sha256');
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    hash.update(
      JSON.stringify({
        matrix: mesh.matrixWorld.toArray(),
        material: mesh.material.name,
      }),
    );
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes))
      hash
        .update(name)
        .update(
          Buffer.from(
            attribute.array.buffer,
            attribute.array.byteOffset,
            attribute.array.byteLength,
          ),
        );
    if (mesh.geometry.index)
      hash.update(
        Buffer.from(
          mesh.geometry.index.array.buffer,
          mesh.geometry.index.array.byteOffset,
          mesh.geometry.index.array.byteLength,
        ),
      );
  });
  return hash.digest('hex');
}
function intersections(parts, matrix, point, direction) {
  const ray = new T.Ray(point, direction),
    triangle = new T.Triangle(),
    hit = new T.Vector3(),
    distances = [];
  for (const part of parts) {
    const positions = part.geometry.getAttribute('position'),
      index = part.geometry.index;
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      triangle.a
        .fromBufferAttribute(positions, index ? index.getX(i) : i)
        .applyMatrix4(matrix);
      triangle.b
        .fromBufferAttribute(positions, index ? index.getX(i + 1) : i + 1)
        .applyMatrix4(matrix);
      triangle.c
        .fromBufferAttribute(positions, index ? index.getX(i + 2) : i + 2)
        .applyMatrix4(matrix);
      if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit))
        distances.push(hit.distanceTo(point));
    }
  }
  return distances
    .sort((a, b) => a - b)
    .filter((d, i, all) => !i || d - all[i - 1] > 0.0001);
}

test('One complete Oriel quarter has actual foundation bearings, closed formed load paths and protected transfer clearance', async () => {
  const quarter = await load(
    'public/assets/levels/oriel/oriel-garden-quarter.glb',
  );
  const kit = await load(
    'public/assets/levels/freestyle-oriel/sunvault-civic-works.glb',
  );
  const parts = [],
    owned = [];
  try {
    kit.getObjectByName('anchor_pier').traverse((mesh) => {
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      parts.push({ geometry, material: mesh.material });
      owned.push(geometry);
    });
    const before = signature(quarter),
      plan = createSunvaultQuarterPlan({
        track: createOrielFreestyleTrack(),
        sourceGroup: quarter,
        pierParts: parts,
      });
    assert.equal(
      signature(quarter),
      before,
      'source vertex/index/normal/material/matrix streams are borrowed unchanged',
    );
    assert.equal(plan.provenance.targetFrame, 6100);
    assert.equal(plan.provenance.worldVerticalOffset, -80);
    // Retained native ordinary-6000 camera: geometric frustum presence is
    // only a coarse guard. Native object-ID/road occlusion proof is separate.
    const camera = new T.PerspectiveCamera(
      67.68789808917198,
      1440 / 900,
      0.1,
      20000,
    );
    camera.position.set(
      -97.15527563494379,
      -1376.1037206389783,
      1512.1896770580424,
    );
    camera.quaternion.set(
      0.3281085932286499,
      -0.26482805530103476,
      0.4505277888916313,
      -0.7869152200913425,
    );
    camera.updateMatrixWorld(true);
    let visibleVertices = 0;
    quarter.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const positions = mesh.geometry.getAttribute('position'),
        transform = plan.matrix.clone().multiply(mesh.matrixWorld);
      for (let i = 0; i < positions.count; i++) {
        const world = new T.Vector3()
          .fromBufferAttribute(positions, i)
          .applyMatrix4(transform);
        if (world.clone().applyMatrix4(camera.matrixWorldInverse).z >= -0.1)
          continue;
        const ndc = world.project(camera);
        if (Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) {
          visibleVertices++;
        }
      }
    });
    assert.ok(
      visibleVertices > 12000,
      'a substantial actual quarter surface is visible at ordinary-6000',
    );
    assert.equal(plan.foundations.length, 6);
    assert.equal(plan.bearings.length, 6);
    assert.ok(
      Math.abs(plan.matrix.determinant() - 1) < 1e-8,
      'quarter stays a proper unit rigid transform',
    );
    const clearance = verifySunvaultQuarterPlan({
      track: createOrielFreestyleTrack(),
      sourceGroup: quarter,
      pierParts: parts,
      plan,
    });
    assert.equal(clearance.safe, true);
    assert.equal(clearance.frames, 640);
    assert.ok(
      clearance.triangles > 1000000,
      'actual source triangles, not hollow architecture AABBs, establish clearance',
    );
    for (const [i, matrix] of plan.foundations.entries()) {
      assert.ok(matrix.elements.every(Number.isFinite));
      const scale = new T.Vector3(),
        rotation = new T.Quaternion(),
        position = new T.Vector3();
      matrix.decompose(position, rotation, scale);
      assert.ok(scale.x > 0 && scale.y > 0 && scale.z > 0);
      assert.ok(
        new T.Vector3(0, 1, 0)
          .applyQuaternion(rotation)
          .distanceTo(new T.Vector3(0, 1, 0)) < 1e-8,
        'world-upright founded shafts',
      );
      const seat = plan.bearings[i];
      const above = intersections(parts, matrix, seat, new T.Vector3(0, 1, 0));
      const below = intersections(parts, matrix, seat, new T.Vector3(0, -1, 0));
      assert.ok(
        above.length && below.length,
        'actual bearing is inside a closed pier head with geometry above and below',
      );
      assert.ok(
        Math.abs(above[0] - 6) < 0.001,
        'real source lower face enters actual closed cap by six metres',
      );
      let sourceDistance = Infinity;
      const triangle = new T.Triangle(),
        nearest = new T.Vector3();
      quarter.traverse((mesh) => {
        if (!mesh.isMesh || !/warm limestone/.test(mesh.material.name)) return;
        const p = mesh.geometry.getAttribute('position'),
          index = mesh.geometry.index,
          world = plan.matrix.clone().multiply(mesh.matrixWorld);
        for (let j = 0; j < (index?.count ?? p.count); j += 3) {
          triangle.a
            .fromBufferAttribute(p, index ? index.getX(j) : j)
            .applyMatrix4(world);
          triangle.b
            .fromBufferAttribute(p, index ? index.getX(j + 1) : j + 1)
            .applyMatrix4(world);
          triangle.c
            .fromBufferAttribute(p, index ? index.getX(j + 2) : j + 2)
            .applyMatrix4(world);
          sourceDistance = Math.min(
            sourceDistance,
            triangle.closestPointToPoint(seat, nearest).distanceTo(seat),
          );
        }
      });
      assert.ok(
        sourceDistance < 0.0001,
        'cap attachment enters an actual source foundation triangle',
      );
      let footVertices = 0;
      for (const part of parts) {
        const p = part.geometry.getAttribute('position');
        for (let j = 0; j < p.count; j++) {
          if (Math.abs(p.getY(j)) > 0.0001) continue;
          const foot = new T.Vector3()
            .fromBufferAttribute(p, j)
            .applyMatrix4(matrix);
          const shellY = 1000 - Math.sqrt(5000 ** 2 - foot.x ** 2);
          assert.ok(
            foot.y <= shellY - 9.999,
            'every actual closed foot vertex is buried in the shell',
          );
          footVertices++;
        }
      }
      assert.ok(footVertices >= 4);
    }
  } finally {
    for (const geometry of owned) geometry.dispose();
    for (const root of [quarter, kit])
      root.traverse((mesh) => {
        mesh.geometry?.dispose();
        for (const material of [mesh.material].flat().filter(Boolean))
          material.dispose();
      });
  }
});

test('Quarter validation keeps grounded road/camera bounds before launch and the full wide transfer through recovery', () => {
  const track = createOrielFreestyleTrack();
  const groundMin = [-40, -12, -16],
    groundMax = [40, 90, 16];
  const airMin = [-81, -12, -16],
    airMax = [81, 420, 16];
  for (const jump of track.jumps) {
    const before = sunvaultQuarterClearanceEnvelope(
      track,
      jump.takeoff - 0.001,
    );
    assert.equal(before.phase, 'grounded');
    assert.deepEqual(before.min.toArray(), groundMin);
    assert.deepEqual(before.max.toArray(), groundMax);
    for (const distance of [
      jump.takeoff,
      jump.landingStart,
      jump.landingEnd,
      jump.recovery,
    ]) {
      const transfer = sunvaultQuarterClearanceEnvelope(track, distance);
      assert.equal(transfer.phase, 'transfer');
      assert.deepEqual(transfer.min.toArray(), airMin);
      assert.deepEqual(transfer.max.toArray(), airMax);
    }
    const recovered = sunvaultQuarterClearanceEnvelope(
      track,
      jump.recovery + 0.001,
    );
    assert.equal(recovered.phase, 'grounded');
    assert.deepEqual(recovered.min.toArray(), groundMin);
    assert.deepEqual(recovered.max.toArray(), groundMax);
  }
  for (const distance of [6304, 6320])
    assert.equal(
      sunvaultQuarterClearanceEnvelope(track, distance).phase,
      'grounded',
      'the real Civic Reverse connector remains grounded before 6342.91 m',
    );
});

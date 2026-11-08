import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack } from './model.js';
import { createLanePaintGeometry } from './lane-paint.js';
import { createSurfaceProjector } from '../../../pickups/surface-projector.js';
import { roadSealGeometry, sweepGeometry } from '../../../track/geometry.js';

test('every expansion seal follows the rendered road with positive depth clearance', () => {
  const track = createTrack();
  const surface = sweepGeometry(track, [
    [-track.width / 2, 0],
    [track.width / 2, 0],
  ]);
  const seals = roadSealGeometry(track, surface);
  const road = new THREE.Mesh(
    surface,
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  const position = seals.getAttribute('position');
  const normal = seals.getAttribute('normal');
  const ray = new THREE.Raycaster();
  const centre = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const up = new THREE.Vector3();
  road.updateMatrixWorld(true);
  assert.ok(position.count > 1500, 'Exercise seals around the entire circuit');
  for (let index = 0; index < position.count; index += 3) {
    centre.set(0, 0, 0);
    for (let corner = 0; corner < 3; corner += 1) {
      vertex.fromBufferAttribute(position, index + corner);
      assert.ok(vertex.toArray().every(Number.isFinite));
      centre.addScaledVector(vertex, 1 / 3);
    }
    up.fromBufferAttribute(normal, index).normalize();
    ray.set(centre.clone().addScaledVector(up, 0.1), up.clone().negate());
    ray.far = 0.2;
    const hit = ray.intersectObject(road, false)[0];
    assert.ok(hit, `Seal triangle ${index / 3} has no road underneath`);
    const clearance = hit.distance - 0.1;
    assert.ok(
      clearance > 0.0075 && clearance < 0.0085,
      `Seal triangle ${index / 3} clips the road: ${clearance}m clearance`,
    );
  }
  surface.dispose();
  seals.dispose();
  road.material.dispose();
});

test('all grid lane dashes follow the exact asphalt triangles through the opening climb and banks', () => {
  const track = createTrack();
  const surface = sweepGeometry(track, [
    [-track.width / 2, 0],
    [track.width / 2, 0],
  ]);
  const paint = createLanePaintGeometry(track, surface);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const road = new THREE.Mesh(surface, material);
  const positions = paint.getAttribute('position');
  const normals = paint.getAttribute('normal');
  const ray = new THREE.Raycaster();
  const point = new THREE.Vector3();
  const up = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  let area = 0;
  road.updateMatrixWorld(true);
  try {
    assert.ok(
      positions.count > 40 * 6,
      'paint splits at road triangle boundaries',
    );
    for (let index = 0; index < positions.count; index += 3) {
      const triangle = new THREE.Triangle(
        new THREE.Vector3().fromBufferAttribute(positions, index),
        new THREE.Vector3().fromBufferAttribute(positions, index + 1),
        new THREE.Vector3().fromBufferAttribute(positions, index + 2),
      );
      area += triangle.getArea();
      up.fromBufferAttribute(normals, index).normalize();
      // Centroids and points near all corners catch both buried paint and
      // patches that bridge a road triangle boundary instead of following it.
      const centre = triangle.getMidpoint(new THREE.Vector3());
      for (let corner = 0; corner < 3; corner++) {
        vertex.fromBufferAttribute(positions, index + corner);
        point.copy(centre).lerp(vertex, 0.98);
        ray.set(point.clone().addScaledVector(up, 0.1), up.clone().negate());
        ray.far = 0.2;
        const hit = ray.intersectObject(road, false)[0];
        assert.ok(hit, `paint triangle ${index / 3} has no asphalt underneath`);
        const clearance = hit.distance - 0.1;
        assert.ok(
          clearance > 0.0115 && clearance < 0.0125,
          `paint triangle ${index / 3} clips/floats above asphalt: ${clearance}m`,
        );
      }
    }
    assert.ok(
      area > 29 && area < 31,
      'all forty original 0.12×6.2m dashes remain',
    );
    const seals = roadSealGeometry(track, surface);
    const sealMesh = new THREE.Mesh(seals, material);
    const paintMesh = new THREE.Mesh(paint, material);
    const projector = createSurfaceProjector(track, [road]);
    sealMesh.updateMatrixWorld(true);
    paintMesh.updateMatrixWorld(true);
    let crossings = 0;
    try {
      for (let distance = 36; distance < 420; distance += 36) {
        const nearestDash = 12 + Math.round((distance - 12) / 21) * 21;
        if (Math.abs(nearestDash - distance) > 3.1) continue;
        for (const lateral of [-4.7, 4.7]) {
          const position = projector.sample(distance, lateral);
          const normal = track.sample(distance).up;
          ray.set(
            position.addScaledVector(normal, 0.1),
            normal.clone().negate(),
          );
          const paintHit = ray.intersectObject(paintMesh, false)[0];
          const sealHit = ray.intersectObject(sealMesh, false)[0];
          assert.ok(
            paintHit && sealHit,
            `missing paint/seal crossing at ${distance}m`,
          );
          assert.ok(
            sealHit.distance - paintHit.distance > 0.003,
            `paint and expansion seal are coplanar at ${distance}m`,
          );
          crossings++;
        }
      }
      assert.equal(crossings, 10, 'exercise every paint/seal overlap');
    } finally {
      projector.dispose();
      seals.dispose();
    }
  } finally {
    paint.dispose();
    surface.dispose();
    material.dispose();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTrack } from './model.js';
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

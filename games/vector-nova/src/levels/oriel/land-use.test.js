import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { createLifetime } from '../../core/lifecycle.js';
import { createOrielTrack } from './track/model.js';
import {
  boroughAt,
  createHabitatLandUse,
  HABITAT_BOROUGHS,
} from './environment/land-use.js';
import { groundHeight } from './environment/ground-field.js';
import { getGardenQuarterReservation } from './environment/garden-quarter.js';
import { getShoreQuarterReservation } from './environment/shore-quarter.js';
import { getGardenSectorReservation } from './environment/garden-sector.js';

test('Oriel civic boroughs have unequal paired centers and wrap across the habitat seam', () => {
  assert.equal(HABITAT_BOROUGHS.length, 14);
  for (const borough of HABITAT_BOROUGHS) {
    assert.equal(boroughAt(borough.angle, borough.z).id, borough.id);
    assert.equal(
      boroughAt(borough.angle + Math.PI * 2, borough.z).id,
      borough.id,
    );
  }
  assert.equal(boroughAt(0, 2300), null);
});

test('Oriel cultivated districts preserve the complete route and finished quarter envelopes with bounded geometry', () => {
  const track = createOrielTrack();
  const reservations = [
    getGardenQuarterReservation(track),
    getShoreQuarterReservation(track),
    getGardenSectorReservation(),
  ];
  const lifetime = createLifetime();
  const district = createHabitatLandUse({
    track,
    reservations,
    own: (resource) => lifetime.own(resource),
  });
  const frames = [];
  for (let s = 0; s < track.length; s += 10)
    frames.push(track.sample(s).position);
  let nearest = Infinity;
  const point = new Vector3();
  const disposals = new Map();
  try {
    assert.equal(district.group.userData.agriculturalDistricts, 7);
    assert.ok(district.group.userData.triangles < 9000);
    const texture = district.cultivation;
    disposals.set(texture, 0);
    texture.addEventListener('dispose', () =>
      disposals.set(texture, disposals.get(texture) + 1),
    );
    assert.equal(texture.image.width, 512);
    assert.equal(texture.image.height, 384);
    let plantedPixels = 0;
    for (let row = 0; row < texture.image.height; row++) {
      for (let col = 0; col < texture.image.width; col++) {
        if (!texture.image.data[row * texture.image.width + col]) continue;
        plantedPixels++;
        const angle = ((col + 0.5) / texture.image.width) * Math.PI * 2;
        const z = ((row + 0.5) / texture.image.height) * 4800 - 2400;
        const radius = 1000 - groundHeight(angle, z);
        const p = new Vector3(
          Math.sin(angle) * radius,
          1000 - Math.cos(angle) * radius,
          z,
        );
        assert.ok(
          !reservations.some((reservation) => reservation.contains(p, 30)),
        );
        for (const frame of frames)
          assert.ok(
            p.distanceToSquared(frame) > 140 ** 2,
            'cultivation texture leaks into a protected road/flight envelope',
          );
      }
    }
    assert.ok(
      plantedPixels > 1000,
      'the cultivated belts must remain present around the inhabited shell',
    );
    district.group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      for (const resource of [mesh.geometry, mesh.material]) {
        if (disposals.has(resource)) continue;
        disposals.set(resource, 0);
        resource.addEventListener('dispose', () =>
          disposals.set(resource, disposals.get(resource) + 1),
        );
      }
      const positions = mesh.geometry.attributes.position;
      const matrix = new Matrix4();
      for (
        let instance = 0;
        instance < (mesh.isInstancedMesh ? mesh.count : 1);
        instance++
      ) {
        if (mesh.isInstancedMesh) mesh.getMatrixAt(instance, matrix);
        else matrix.identity();
        for (let i = 0; i < positions.count; i++) {
          point.fromBufferAttribute(positions, i).applyMatrix4(matrix);
          assert.ok(point.toArray().every(Number.isFinite));
          const angle = Math.atan2(point.x, 1000 - point.y);
          const height = 1000 - Math.hypot(point.x, 1000 - point.y);
          assert.ok(
            Math.abs(height - groundHeight(angle, point.z)) <
              (mesh.isInstancedMesh ? 6 : 1),
          );
          assert.ok(
            !reservations.some((reservation) =>
              reservation.contains(point, 15),
            ),
          );
          for (const frame of frames)
            nearest = Math.min(nearest, point.distanceToSquared(frame));
        }
      }
    });
    assert.ok(
      Math.sqrt(nearest) - 5 > 110,
      `agricultural district intrudes into the road/camera corridor: ${Math.sqrt(nearest) - 5}m`,
    );
  } finally {
    lifetime.dispose();
    lifetime.dispose();
  }
  assert.ok([...disposals.values()].every((count) => count === 1));
});

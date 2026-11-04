import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import {
  installNomadMotion,
  sampleCarrierMotion,
} from '../src/levels/nomad/motion.js';
import { createNomadDust } from '../src/levels/nomad/dust.js';

test('Nomad tire wakes stay below the raceway and inside their culled all-phase bounds', () => {
  const track = installNomadMotion(createNomadTrack());
  const dust = createNomadDust({ track });
  const matrix = new T.Matrix4(),
    centre = new T.Vector3(),
    point = new T.Vector3();
  try {
    assert.equal(dust.group.children.length, track.carriers.length);
    for (const time of [0, 1.7, 9.2, 17.8, 38, 102.5]) {
      track.presentationTime = time;
      dust.update({ settings: { quality: 'high' } });
      for (const [carrierIndex, mesh] of dust.group.children.entries()) {
        const carrier = track.carriers[carrierIndex];
        assert.equal(mesh.count, 54);
        assert.ok(
          mesh.position.distanceTo(
            carrier.origin
              .clone()
              .add(sampleCarrierMotion(carrier, time).translation),
          ) < 1e-9,
        );
        assert.equal(mesh.castShadow, false);
        assert.equal(mesh.userData.aoExclude, true);
        assert.equal(mesh.userData.reflectionExclude, true);
        for (let index = 0; index < mesh.count; index++) {
          mesh.getMatrixAt(index, matrix);
          centre.setFromMatrixPosition(matrix);
          const age = mesh.geometry.attributes.dustAge.getX(index);
          assert.ok(age >= 0 && age <= 1);
          // The shader's vertical card can face any horizontal camera azimuth,
          // including a camera banked on the exterior wall ride.
          for (const angle of [0, Math.PI / 3, Math.PI / 2, Math.PI])
            for (const sx of [-1, 1])
              for (const sy of [-1, 1]) {
                point
                  .copy(centre)
                  .add(
                    new T.Vector3(
                      Math.cos(angle) * sx * matrix.elements[0],
                      sy * matrix.elements[5],
                      Math.sin(angle) * sx * matrix.elements[0],
                    ),
                  );
                assert.ok(
                  mesh.boundingSphere.containsPoint(point),
                  'a shader-expanded puff escapes the culling sphere',
                );
                point.add(mesh.position);
                const ground =
                  track.saltPlane.height - track.saltPlane.grade * point.z;
                assert.ok(
                  point.y - ground < 15,
                  `dust reaches ${point.y - ground}m above salt`,
                );
              }
        }
      }
    }
  } finally {
    dust.dispose();
  }
});

test('Nomad dust holds exact pause/reduced-motion poses, retains both Low wheel rows and disposes once', () => {
  const track = installNomadMotion(createNomadTrack());
  const dust = createNomadDust({ track });
  const mesh = dust.group.children[0];
  let materialDisposals = 0,
    geometryDisposals = 0,
    instanceDisposals = 0;
  mesh.material.addEventListener('dispose', () => materialDisposals++);
  for (const child of dust.group.children) {
    child.geometry.addEventListener('dispose', () => geometryDisposals++);
    child.addEventListener('dispose', () => instanceDisposals++);
  }
  track.presentationTime = 7;
  dust.update({ settings: { quality: 'high', reducedMotion: false } });
  const paused = Array.from(mesh.instanceMatrix.array);
  dust.update({
    mode: 'paused',
    settings: { quality: 'high', reducedMotion: false },
  });
  assert.deepEqual(Array.from(mesh.instanceMatrix.array), paused);
  dust.update({ settings: { quality: 'low', reducedMotion: true } });
  assert.equal(mesh.count, 18);
  const reduced = Array.from(
    mesh.instanceMatrix.array.slice(0, mesh.count * 16),
  );
  const previous = mesh.position.clone();
  track.presentationTime = 19;
  dust.update({ settings: { quality: 'low', reducedMotion: true } });
  assert.deepEqual(
    Array.from(mesh.instanceMatrix.array.slice(0, mesh.count * 16)),
    reduced,
  );
  assert.ok(
    mesh.position.distanceTo(previous) > 1,
    'real moving carriers still carry the frozen decoration',
  );
  const xs = Array.from(
    { length: mesh.count },
    (_, index) => mesh.instanceMatrix.array[index * 16 + 12],
  );
  assert.ok(
    xs.some((x) => x < -90) && xs.some((x) => x > 90),
    'Low keeps both wheel rows',
  );
  dust.dispose();
  dust.dispose();
  dust.update();
  assert.equal(dust.group.children.length, 0);
  assert.equal(materialDisposals, 1);
  assert.equal(geometryDisposals, track.carriers.length);
  assert.equal(instanceDisposals, track.carriers.length);
});

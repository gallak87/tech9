import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import createLevel from '../src/levels/nomad/index.js';
import { createNomadCompanions } from '../src/levels/nomad/companions.js';
import { createNomadWheelContacts } from '../src/levels/nomad/wheel-contact.js';
import { sampleCarrierMotion } from '../src/levels/nomad/motion.js';
import kit from '../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const anchors = kit.prototypes
  .find((part) => part.name === 'nomad_carrier')
  .anchors.filter((anchor) => anchor.kind === 'wheel');

test('one instanced draw seats every main and companion tire contact on the real graded salt', () => {
  const track = createLevel().createTrack();
  const carriers = [...track.carriers, ...createNomadCompanions(track)];
  const contact = createNomadWheelContacts({ track, carriers });
  const normal = new T.Vector3(0, 1, track.saltPlane.grade).normalize();
  const matrix = new T.Matrix4(),
    centre = new T.Vector3(),
    corner = new T.Vector3();
  try {
    assert.equal(contact.group.children.length, 1);
    assert.equal(contact.mesh.count, carriers.length * 18);
    assert.equal(contact.mesh.geometry.index.count / 3, 2);
    assert.equal(contact.mesh.material.transparent, true);
    assert.equal(contact.mesh.material.depthWrite, false);
    assert.equal(contact.mesh.castShadow, false);
    assert.equal(contact.mesh.receiveShadow, false);
    assert.equal(contact.mesh.userData.aoExclude, true);
    assert.equal(contact.mesh.userData.reflectionExclude, true);
    assert.ok(contact.mesh.material.uniforms.contactOpacity.value >= 0.2);
    assert.ok(contact.mesh.material.uniforms.contactOpacity.value <= 0.3);
    for (const time of [0, 9.5, 19, 28.5, 102.7]) {
      track.presentationTime = time;
      contact.update();
      for (const [carrierIndex, carrier] of carriers.entries()) {
        const pose = new T.Matrix4().compose(
          carrier.origin,
          carrier.quaternion,
          carrier.scale,
        );
        const displacement = sampleCarrierMotion(carrier, time).translation;
        for (const [anchorIndex, anchor] of anchors.entries()) {
          contact.mesh.getMatrixAt(
            carrierIndex * anchors.length + anchorIndex,
            matrix,
          );
          centre.setFromMatrixPosition(matrix);
          const expected = new T.Vector3()
            .fromArray(anchor.position)
            .applyMatrix4(pose)
            .add(displacement)
            .addScaledVector(
              normal,
              -anchor.rollingRadius * carrier.scale.x + 0.06,
            );
          assert.ok(centre.distanceTo(expected) < 0.001);
          assert.ok(
            Math.abs(
              new T.Vector3().setFromMatrixColumn(matrix, 0).length() -
                12 * carrier.scale.x,
            ) < 1e-5,
          );
          assert.ok(
            Math.abs(
              new T.Vector3().setFromMatrixColumn(matrix, 1).length() -
                18 * carrier.scale.x,
            ) < 1e-5,
          );
          assert.ok(
            new T.Vector3().setFromMatrixColumn(matrix, 2).dot(normal) >
              0.999999,
          );
          for (const x of [-0.5, 0.5])
            for (const y of [-0.5, 0.5]) {
              corner.set(x, y, 0).applyMatrix4(matrix);
              const planeDistance =
                (corner.y +
                  track.saltPlane.grade * corner.z -
                  track.saltPlane.height) /
                Math.sqrt(1 + track.saltPlane.grade * track.saltPlane.grade);
              assert.ok(Math.abs(planeDistance - 0.06) < 0.001);
              assert.ok(contact.mesh.boundingBox.containsPoint(corner));
              assert.ok(contact.mesh.boundingSphere.containsPoint(corner));
            }
        }
      }
    }
  } finally {
    contact.dispose();
  }
});

test('wheel contacts hold paused matrices and follow physical motion in Low and reduced motion', () => {
  const track = createLevel().createTrack();
  const contact = createNomadWheelContacts({ track });
  try {
    track.presentationTime = 8;
    contact.update();
    const paused = Array.from(contact.mesh.instanceMatrix.array);
    const version = contact.mesh.instanceMatrix.version;
    contact.update({
      mode: 'paused',
      settings: { quality: 'low', reducedMotion: true },
    });
    assert.deepEqual(Array.from(contact.mesh.instanceMatrix.array), paused);
    assert.equal(
      contact.mesh.instanceMatrix.version,
      version,
      'pause avoids identical GPU uploads',
    );
    track.presentationTime = 19;
    contact.update({ settings: { quality: 'low', reducedMotion: true } });
    assert.notDeepEqual(Array.from(contact.mesh.instanceMatrix.array), paused);
    assert.equal(contact.mesh.count, track.carriers.length * 18);
  } finally {
    contact.dispose();
  }
});

test('wheel contact component releases only its own instance, geometry and material once', () => {
  const track = createLevel().createTrack();
  const contact = createNomadWheelContacts({ track });
  const counts = { mesh: 0, geometry: 0, material: 0 };
  for (const [key, object] of Object.entries({
    mesh: contact.mesh,
    geometry: contact.mesh.geometry,
    material: contact.mesh.material,
  }))
    object.addEventListener('dispose', () => counts[key]++);
  const parent = new T.Group();
  parent.add(contact.group);
  const version = contact.mesh.instanceMatrix.version;
  contact.dispose();
  contact.dispose();
  track.presentationTime = 25;
  contact.update();
  assert.deepEqual(counts, { mesh: 1, geometry: 1, material: 1 });
  assert.equal(parent.children.length, 0);
  assert.equal(contact.group.children.length, 0);
  assert.equal(contact.mesh.instanceMatrix.version, version);
  assert.equal(track.carriers.length, 11);
});

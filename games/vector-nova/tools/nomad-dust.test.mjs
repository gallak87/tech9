import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from 'three';
import { createNomadTrack } from '../src/levels/nomad/track/model.js';
import { createNomadCompanions } from '../src/levels/nomad/companions.js';
import {
  installNomadMotion,
  sampleCarrierMotion,
} from '../src/levels/nomad/motion.js';
import { sampleNomadGroundMotion } from '../src/levels/nomad/ground-motion.js';
import {
  nomadGroundHeightAt,
  nomadGroundNormalAt,
} from '../src/levels/nomad/ground-profile.js';
import { createNomadDust } from '../src/levels/nomad/dust.js';
import {
  createNomadDustField,
  sampleNomadDustParticle,
} from '../src/levels/nomad/dust-field.js';
import kit from '../assets/levels/nomad/blender/carrier-kit-provenance.json' with { type: 'json' };

const wheels = kit.prototypes
  .find((part) => part.name === 'nomad_carrier')
  .anchors.filter((anchor) => anchor.kind === 'wheel');

function fixture() {
  const track = installNomadMotion(createNomadTrack());
  track.carriers = [...track.carriers, ...createNomadCompanions(track)];
  return track;
}

function planeDistance(track, point) {
  return (
    (point.y - nomadGroundHeightAt(track, point.x, point.z)) *
    nomadGroundNormalAt(track, point.x, point.z).y
  );
}

test('salt is emitted from every real tire at its historical pose, then follows the moving graded ground', () => {
  const track = fixture();
  const normal = new T.Vector3(0, 1, track.saltPlane.grade).normalize();
  let oldestDistance = 0;
  for (const carrier of track.carriers) {
    const field = createNomadDustField(track, carrier);
    const contactZ = field.particles.map((particle) => particle.contact.z);
    assert.ok(
      field.bounds.max.z -
        field.bounds.min.z -
        (Math.max(...contactZ) - Math.min(...contactZ)) <
        1000,
      'faster convoy travel must not create multi-kilometre wake culling volumes',
    );
    const found = new Set();
    for (const particle of field.particles) {
      found.add(particle.wheel);
      const anchor = wheels[particle.wheel];
      const contact = new T.Vector3()
        .fromArray(anchor.position)
        .multiply(carrier.scale)
        .applyQuaternion(carrier.quaternion)
        .add(carrier.origin)
        .addScaledVector(
          normal,
          -anchor.rollingRadius * carrier.scale.x + 0.06,
        );
      assert.ok(Math.abs(planeDistance(track, contact) - 0.06) < 1e-8);
      for (const time of [0, 7.25, 19.8, 42.6, 103.5]) {
        const sample = sampleNomadDustParticle(track, carrier, particle, time);
        const current = sampleCarrierMotion(carrier, time).translation;
        const actual = (
          particle.kind === 'spray' ? sample.tail : sample.position
        )
          .clone()
          .add(carrier.origin)
          .add(current)
          .addScaledVector(
            normal,
            particle.kind === 'spray'
              ? -sample.tailLift
              : -sample.height * 0.72,
          );
        actual.x -= particle.side * sample.outward;
        const emitted = contact
          .clone()
          .add(sampleCarrierMotion(carrier, sample.emittedAt).translation);
        const transport = sampleNomadGroundMotion(track, time).translation.sub(
          sampleNomadGroundMotion(track, sample.emittedAt).translation,
        );
        assert.ok(
          actual.distanceTo(emitted.add(transport)) < 1e-8,
          'a wake must use the actual historical pose, not a present velocity approximation',
        );
        assert.ok(
          Math.abs(planeDistance(track, actual) - 0.06) < 1e-8,
          'advected salt lost its original ground contact',
        );
        assert.ok(sample.age >= 0 && sample.age <= particle.life);
        assert.ok(sample.fraction >= 0 && sample.fraction < 1);
        if (particle.kind === 'wake')
          oldestDistance = Math.max(oldestDistance, -transport.z);
        else {
          const head = sample.head.clone().add(carrier.origin).add(current);
          assert.ok(
            head.distanceTo(contact.clone().add(current)) < 0.2,
            'the continuous spray must remain attached to the current real tire',
          );
          assert.ok(
            sample.head.distanceTo(sample.tail) > 45 &&
              sample.head.distanceTo(sample.tail) < 85,
            'contact spray should stream tens of metres, not become another enormous cloud',
          );
          assert.ok(
            sample.position.distanceTo(
              sample.head.clone().add(sample.tail).multiplyScalar(0.5),
            ) < 1e-9,
          );
        }
      }
      if (particle.kind === 'spray') continue;
      // Rolling billows are born at the tire, including on companion rigs.
      const birth = particle.life * (4 - particle.phase) + 1e-8;
      const sample = sampleNomadDustParticle(track, carrier, particle, birth);
      assert.ok(sample.age < 1e-6);
      const foot = sample.position
        .clone()
        .add(carrier.origin)
        .add(sampleCarrierMotion(carrier, birth).translation)
        .addScaledVector(normal, -sample.height * 0.72);
      const wheelNow = contact
        .clone()
        .add(sampleCarrierMotion(carrier, birth).translation);
      assert.ok(foot.distanceTo(wheelNow) < 1e-5);
    }
    assert.equal(found.size, wheels.length);
  }
  assert.ok(
    oldestDistance > 500 && oldestDistance < 850,
    'the fast convoy needs large wakes without quadrupling their old extent',
  );
});

test('all-phase shader-expanded wakes are grounded, outside the central road and within conservative culling bounds', () => {
  const track = fixture();
  const dust = createNomadDust({ track });
  const matrix = new T.Matrix4(),
    centre = new T.Vector3(),
    point = new T.Vector3();
  let maximumRelativeTop = 0;
  try {
    for (const time of [0, 0.8, 3.7, 9.2, 17.8, 27.5, 38, 102.5]) {
      track.presentationTime = time;
      dust.update({ settings: { quality: 'high' } });
      for (const [carrierIndex, mesh] of dust.group.children.entries()) {
        const carrier = track.carriers[carrierIndex];
        const field = createNomadDustField(track, carrier);
        assert.equal(mesh.castShadow, false);
        assert.equal(mesh.receiveShadow, false);
        assert.equal(mesh.userData.aoExclude, true);
        assert.equal(mesh.userData.reflectionExclude, true);
        for (let index = 0; index < mesh.count; index++) {
          const particle = field.particles[index];
          mesh.getMatrixAt(index, matrix);
          centre.setFromMatrixPosition(matrix);
          const width = matrix.elements[0];
          const axis = new T.Vector3().setFromMatrixColumn(matrix, 1);
          const height = axis.length();
          axis.normalize();
          const worldCentre = centre.clone().add(mesh.position);
          const lift = planeDistance(track, worldCentre);
          if (particle.kind === 'wake')
            assert.ok(
              lift < height && lift > 0,
              'each rolling lobe must intersect the salt instead of floating above it',
            );
          maximumRelativeTop = Math.max(
            maximumRelativeTop,
            (lift + height) / (carrier.scale.x * particle.radius),
          );
          assert.ok(
            particle.side * centre.x - width - Math.abs(axis.x * height) >
              carrier.scale.x * 65,
            'the central cargo-road corridor must remain clear at every camera azimuth',
          );
          for (const angle of [0, Math.PI / 3, Math.PI / 2, Math.PI]) {
            const side = new T.Vector3(Math.cos(angle), 0, Math.sin(angle));
            side.addScaledVector(axis, -side.dot(axis)).normalize();
            for (const sx of [-1, 1])
              for (const sy of [-1, 1]) {
                point
                  .copy(centre)
                  .addScaledVector(side, sx * width)
                  .addScaledVector(axis, sy * height);
                assert.ok(
                  mesh.boundingBox.containsPoint(point),
                  'billboard escapes its box',
                );
                assert.ok(
                  mesh.boundingSphere.containsPoint(point),
                  'billboard escapes its sphere',
                );
              }
          }
        }
      }
    }
    assert.ok(
      maximumRelativeTop > 3.1 && maximumRelativeTop < 4.4,
      `giant-truck plumes need a large but road-conscious vertical extent: ${maximumRelativeTop}`,
    );
  } finally {
    dust.dispose();
  }
});

test('pause, arbitrary replay restore and reduced motion reproduce the same field without redundant uploads', () => {
  const track = fixture();
  const dust = createNomadDust({ track });
  const mesh = dust.group.children[0];
  const snapshot = () => ({
    matrices: Array.from(mesh.instanceMatrix.array),
    state: Array.from(mesh.geometry.attributes.dustState.array),
  });
  try {
    track.presentationTime = 7;
    dust.update({ settings: { quality: 'high' } });
    const saved = snapshot();
    const version = mesh.instanceMatrix.version;
    dust.update({ mode: 'paused', dt: 0, settings: { quality: 'high' } });
    assert.deepEqual(snapshot(), saved);
    assert.equal(mesh.instanceMatrix.version, version);
    track.presentationTime = 73;
    dust.update({ settings: { quality: 'low' } });
    track.presentationTime = 7;
    dust.update({ reset: true, settings: { quality: 'high' } });
    assert.deepEqual(snapshot(), saved);
    dust.update({ settings: { quality: 'low', reducedMotion: true } });
    const reduced = snapshot();
    const root = mesh.position.clone();
    const reducedVersion = mesh.instanceMatrix.version;
    track.presentationTime = 19;
    dust.update({ settings: { quality: 'low', reducedMotion: true } });
    assert.deepEqual(snapshot(), reduced);
    assert.equal(mesh.instanceMatrix.version, reducedVersion);
    assert.ok(
      mesh.position.distanceTo(root) > 1,
      'real carrier motion still carries frozen decoration',
    );
    track.presentationTime = 0;
    dust.update({
      reset: true,
      settings: { quality: 'high', reducedMotion: false },
    });
    const fresh = createNomadDust({ track });
    try {
      assert.deepEqual(
        snapshot().matrices,
        Array.from(fresh.group.children[0].instanceMatrix.array),
      );
      assert.deepEqual(
        snapshot().state,
        Array.from(fresh.group.children[0].geometry.attributes.dustState.array),
      );
    } finally {
      fresh.dispose();
    }
  } finally {
    dust.dispose();
  }
});

test('quality and distance LOD retain both complete wheel rows, cull offscreen work and bound the render cost', () => {
  const track = fixture();
  track.carriers = [track.carriers[0]];
  const carrier = track.carriers[0];
  const dust = createNomadDust({ track });
  const mesh = dust.group.children[0];
  const camera = new T.PerspectiveCamera(60, 16 / 10, 1, 20000);
  const look = carrier.origin.clone().add(new T.Vector3(0, 30, -200));
  const view = (x, quality = 'high', away = false) => {
    camera.position.copy(look).add(new T.Vector3(x, 80, 0));
    camera.lookAt(
      away ? camera.position.clone().add(new T.Vector3(100, 0, 0)) : look,
    );
    camera.updateMatrixWorld(true);
    dust.update({ camera, settings: { quality } });
  };
  try {
    view(400);
    assert.equal(mesh.visible, true);
    const nearCount = mesh.count;
    view(400, 'low');
    assert.ok(mesh.count < nearCount);
    const lowCount = mesh.count;
    view(2100);
    assert.ok(mesh.count <= lowCount);
    view(3900);
    assert.ok(mesh.count < lowCount);
    const field = createNomadDustField(track, carrier);
    for (const count of [nearCount, lowCount, mesh.count]) {
      const retained = new Set(
        field.particles.slice(0, count).map((particle) => particle.wheel),
      );
      assert.equal(
        retained.size,
        wheels.length,
        'LOD drops a wheel or one entire side',
      );
    }
    const version = mesh.instanceMatrix.version;
    track.presentationTime = 1;
    view(3900, 'high', true);
    assert.equal(mesh.visible, false);
    assert.equal(
      mesh.instanceMatrix.version,
      version,
      'offscreen instances should not upload',
    );
    view(8000);
    assert.equal(mesh.visible, false);
    view(400);
    assert.equal(mesh.visible, true);
    assert.ok(mesh.instanceMatrix.version > version);
    assert.ok((nearCount * mesh.geometry.index.count) / 3 <= 108);
    const texture = mesh.material.uniforms.turbulence.value;
    assert.ok(texture.image.data.byteLength <= 65536);
    assert.equal(texture.wrapS, T.RepeatWrapping);
    assert.equal(texture.wrapT, T.RepeatWrapping);
    assert.equal(mesh.material.depthWrite, false);
  } finally {
    dust.dispose();
  }
});

test('dust releases its owned GPU resources once, leaving carriers and borrowed scene objects intact', () => {
  const track = fixture();
  const dust = createNomadDust({ track });
  const first = dust.group.children[0];
  const counts = { material: 0, texture: 0, geometry: 0, instance: 0 };
  first.material.addEventListener('dispose', () => counts.material++);
  first.material.uniforms.turbulence.value.addEventListener(
    'dispose',
    () => counts.texture++,
  );
  for (const mesh of dust.group.children) {
    mesh.geometry.addEventListener('dispose', () => counts.geometry++);
    mesh.addEventListener('dispose', () => counts.instance++);
  }
  const parent = new T.Group(),
    borrowed = new T.Object3D();
  parent.add(dust.group, borrowed);
  dust.dispose();
  dust.dispose();
  dust.update();
  assert.deepEqual(counts, {
    material: 1,
    texture: 1,
    geometry: track.carriers.length,
    instance: track.carriers.length,
  });
  assert.deepEqual(parent.children, [borrowed]);
  assert.equal(dust.group.children.length, 0);
  assert.equal(track.carriers.length, 13);
});

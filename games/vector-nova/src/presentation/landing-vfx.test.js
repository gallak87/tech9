import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createLandingVfx } from './landing-vfx.js';

function fixture() {
  let samples = 0;
  const track = {
    // A banked tube floor, rather than a flat centreline frame. The footprint
    // must follow both the receiving bank and its transverse curvature.
    sampleSurface(distance, lateral) {
      samples++;
      const angle = 0.6 + lateral / 22;
      const quaternion = new T.Quaternion().setFromAxisAngle(
        new T.Vector3(0, 0, 1),
        angle,
      );
      return {
        position: new T.Vector3(
          Math.sin(angle) * 22,
          (1 - Math.cos(angle)) * 22,
          distance,
        ),
        quaternion,
        right: new T.Vector3(1, 0, 0).applyQuaternion(quaternion),
        up: new T.Vector3(0, 1, 0).applyQuaternion(quaternion),
      };
    },
  };
  const support = track.sampleSurface(120, 3);
  const group = new T.Group();
  group.userData.dimensionsMetres = { width: 9, length: 12, height: 2.2 };
  group.position.copy(support.position).addScaledVector(support.up, 1);
  group.quaternion.copy(support.quaternion);
  const frame = {
    mode: 'racing',
    settings: { quality: 'high', reducedMotion: false },
    state: { distance: 120, lateral: 3, speed: 110 },
    ship: { group },
    landing: { clock: 1, supported: true, contact: null, burst: null },
  };
  return { track, frame, samples: () => samples };
}

test('ordinary contact and seating burst use neutral color without a Freestyle score or grade', () => {
  const { track, frame } = fixture();
  const effect = createLandingVfx({ track });
  try {
    effect.update(frame);
    assert.equal(effect.group.visible, false);
    frame.landing.contact = { id: 'jump-1', at: 1 };
    effect.update(frame);
    const wash = effect.group.getObjectByName('Landing / landing color wash');
    const corners = effect.group.getObjectByName(
      'Landing / inward seating clamps',
    );
    assert.equal(effect.getPresentation().activeSparks, 0);
    assert.equal(wash.material.uniforms.color.value.getHex(), 0x68e9e0);
    assert.equal(wash.material.uniforms.strength.value, 0.38);
    const matrix = new T.Matrix4();
    corners.getMatrixAt(0, matrix);
    const open = Math.abs(matrix.elements[12]);
    frame.landing.clock += 0.06;
    effect.update(frame);
    corners.getMatrixAt(0, matrix);
    assert.ok(
      Math.abs(matrix.elements[12]) < open,
      'clamps click onto the road',
    );

    frame.landing.burst = { id: 'jump-1', at: frame.landing.clock };
    effect.update(frame);
    assert.equal(wash.material.uniforms.strength.value, 0.88);
    assert.equal(effect.getPresentation().activeSparks, 24);
    assert.equal(effect.getPresentation().drawCalls, 4);
    assert.equal(effect.getPresentation().triangles, 496);
    assert.equal('grade' in effect.getPresentation(), false);
    assert.equal('score' in effect.getPresentation(), false);
    assert.equal(corners.material.color.getHex(), 0x68e9e0);
    assert.ok(
      effect.group.quaternion.angleTo(track.sampleSurface(120, 3).quaternion) <
        1e-6,
    );
    assert.ok(
      wash.geometry
        .getAttribute('position')
        .array.some((value, i) => i % 3 === 1 && value > 0.2),
      'wash wraps the actual tube floor instead of floating on a flat plane',
    );

    const frozen = [...corners.instanceMatrix.array];
    frame.mode = 'paused';
    effect.update(frame);
    assert.deepEqual([...corners.instanceMatrix.array], frozen);
  } finally {
    effect.dispose();
  }
});

test('unsupported, expired and rewound ordinary events never draw or sample a false receiving road', () => {
  const { track, frame, samples } = fixture();
  const effect = createLandingVfx({ track });
  try {
    frame.landing.burst = { id: 'jump-2', at: 1 };
    effect.update(frame);
    assert.equal(effect.group.visible, true);
    const wash = effect.group.getObjectByName('Landing / landing color wash');
    const version = wash.geometry.getAttribute('position').version;
    const before = samples();

    frame.landing.supported = false;
    effect.update(frame);
    assert.equal(effect.group.visible, false);
    assert.equal(effect.getPresentation().contactId, null);
    assert.equal(effect.getPresentation().drawCalls, 0);
    assert.equal(effect.getPresentation().activeSparks, 0);
    assert.equal(
      samples(),
      before,
      'airborne craft have no magnetic floor wash',
    );

    frame.landing.supported = true;
    frame.landing.clock = 2;
    effect.update(frame);
    frame.landing.clock = 0;
    effect.update(frame);
    assert.equal(effect.group.visible, false);
    assert.equal(samples(), before);
    assert.equal(wash.geometry.getAttribute('position').version, version);

    frame.landing.clock = 0.1;
    frame.landing.burst = { id: 'fresh-jump', at: 0.1, strength: 0.7 };
    effect.update(frame);
    assert.equal(
      effect.group.visible,
      true,
      'a fresh landing after restart renders',
    );
    assert.equal(wash.material.uniforms.strength.value, 0.7);
    effect.reset();
    assert.equal(effect.group.visible, false);
    assert.equal(effect.getPresentation().age, null);
  } finally {
    effect.dispose();
  }
});

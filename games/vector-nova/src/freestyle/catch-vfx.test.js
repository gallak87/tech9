import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createFreestyleCatchVfx } from './catch-vfx.js';
import { FREESTYLE_GRADES } from './arcade.js';

function fixture() {
  const quaternion = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 0, 1),
    0.65,
  );
  const right = new T.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const up = new T.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const tangent = new T.Vector3(0, 0, 1);
  const track = {
    sample(distance) {
      return {
        position: new T.Vector3(0, 0, distance),
        quaternion: quaternion.clone(),
        right: right.clone(),
        up: up.clone(),
        tangent: tangent.clone(),
      };
    },
    sampleSurface(distance, lateral) {
      const sample = this.sample(distance);
      sample.position
        .addScaledVector(right, lateral)
        .addScaledVector(up, lateral * lateral * 0.008);
      return sample;
    },
  };
  const ship = new T.Group();
  ship.userData.dimensionsMetres = { width: 9, length: 12, height: 2.2 };
  ship.position
    .copy(track.sampleSurface(120, 3).position)
    .addScaledVector(up, 1);
  ship.quaternion.copy(quaternion);
  const frame = {
    mode: 'racing',
    settings: { quality: 'high', reducedMotion: false },
    state: { distance: 120, lateral: 3, speed: 110 },
    ship: { group: ship },
    motion: { freestyle: { clock: 1, pendingLanding: null, legs: [] } },
  };
  return { track, frame, fs: frame.motion.freestyle };
}

test('magnetic catch waits for real contact and separates contact from graded banking', () => {
  const { track, frame, fs } = fixture();
  const effect = createFreestyleCatchVfx({ track });
  try {
    effect.update(frame);
    assert.equal(effect.group.visible, false);
    fs.pendingLanding = { id: 'transfer-1', elapsed: 0.02 };
    effect.update(frame);
    assert.equal(effect.group.visible, true);
    assert.equal(effect.getPresentation().grade, null);
    assert.equal(effect.getPresentation().activeSparks, 0);
    const corners = effect.group.getObjectByName(
      'Freestyle / inward seating clamps',
    );
    const matrix = new T.Matrix4();
    corners.getMatrixAt(0, matrix);
    const openingWidth = Math.abs(matrix.elements[12]);
    fs.clock += 0.06;
    fs.pendingLanding.elapsed += 0.06;
    effect.update(frame);
    corners.getMatrixAt(0, matrix);
    assert.ok(
      Math.abs(matrix.elements[12]) < openingWidth,
      'corners visibly click inward',
    );
    fs.clock = 1.3;
    fs.pendingLanding = null;
    fs.legs = [
      { id: 'transfer-1', at: 1.3, landed: true, clean: true, perfect: false },
    ];
    effect.update(frame);
    assert.equal(effect.getPresentation().grade, 'great');
    assert.equal(effect.getPresentation().activeSparks, 24);
    assert.equal(effect.getPresentation().drawCalls, 4);
    assert.equal(effect.getPresentation().triangles, 496);
    assert.ok(
      effect.group.quaternion.angleTo(track.sample(120).quaternion) < 1e-6,
    );
    assert.equal(corners.material.color.getHex(), FREESTYLE_GRADES.great.hex);
    const wash = effect.group.getObjectByName('Freestyle / landing color wash');
    assert.ok(
      wash.geometry
        .getAttribute('position')
        .array.some((value, i) => i % 3 === 1 && value > 0.1),
      'the footprint follows transverse receiver curvature rather than cutting through it',
    );
    const paused = [...corners.instanceMatrix.array];
    frame.mode = 'paused';
    effect.update(frame);
    assert.deepEqual(
      [...corners.instanceMatrix.array],
      paused,
      'pause freezes the seating envelope',
    );
    fs.clock = 2.2;
    effect.update(frame);
    assert.equal(effect.group.visible, false);
    fs.clock = 0;
    fs.legs = [];
    effect.update(frame);
    assert.equal(
      effect.getPresentation().grade,
      null,
      'rewind drops stale landing feedback',
    );
    assert.equal(effect.group.visible, false);
  } finally {
    effect.dispose();
  }
});

test('each genuine grade colors the catch while misses never produce a landing burst', () => {
  const { track, frame, fs } = fixture();
  const effect = createFreestyleCatchVfx({ track });
  try {
    for (const [grade, clean, perfect] of [
      ['good', false, false],
      ['great', true, false],
      ['perfect', true, true],
    ]) {
      effect.reset();
      fs.legs = [{ id: grade, at: fs.clock, landed: true, clean, perfect }];
      effect.update(frame);
      assert.equal(effect.getPresentation().grade, grade);
      assert.equal(
        effect.group
          .getObjectByName('Freestyle / landing color wash')
          .material.uniforms.color.value.getHex(),
        FREESTYLE_GRADES[grade].hex,
      );
    }
    effect.reset();
    fs.pendingLanding = { id: 'miss', elapsed: 0.1 };
    fs.legs = [];
    effect.update(frame);
    fs.clock += 0.05;
    fs.pendingLanding = null;
    fs.legs = [{ id: 'miss', at: fs.clock, landed: false, clean: false }];
    effect.update(frame);
    assert.equal(effect.group.visible, false);
    assert.equal(effect.getPresentation().activeSparks, 0);
  } finally {
    effect.dispose();
  }
});

test('Low bounds the shower and reduced motion holds a quiet static seat without ties or particles', () => {
  const { track, frame, fs } = fixture();
  const effect = createFreestyleCatchVfx({ track });
  try {
    fs.legs = [{ id: 'transfer-1', at: 0.95, landed: true, clean: true }];
    frame.settings.quality = 'low';
    effect.update(frame);
    assert.equal(effect.getPresentation().activeSparks, 12);
    assert.equal(effect.getPresentation().drawCalls, 3);
    assert.equal(effect.getPresentation().triangles, 304);
    frame.settings.reducedMotion = true;
    effect.update(frame);
    assert.equal(effect.getPresentation().activeSparks, 0);
    assert.equal(effect.getPresentation().drawCalls, 2);
    const corners = effect.group.getObjectByName(
      'Freestyle / inward seating clamps',
    );
    const paused = [...corners.instanceMatrix.array];
    fs.clock += 0.1;
    effect.update(frame);
    assert.deepEqual([...corners.instanceMatrix.array], paused);
    assert.equal(
      effect.group.getObjectByName('Freestyle / four contracting magnetic ties')
        .visible,
      false,
    );
    assert.equal(
      effect.group.getObjectByName('Freestyle / directional landing burst')
        .visible,
      false,
    );
  } finally {
    effect.dispose();
  }
});

test('catch presentation owns and disposes its small pool exactly once without modifying the ship', () => {
  const { track, frame, fs } = fixture();
  const effect = createFreestyleCatchVfx({ track });
  const shipPose = {
    position: frame.ship.group.position.toArray(),
    quaternion: frame.ship.group.quaternion.toArray(),
    scale: frame.ship.group.scale.toArray(),
  };
  const geometries = new Set();
  const materials = new Set();
  effect.group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  let geometryDisposals = 0;
  let materialDisposals = 0;
  geometries.forEach((geometry) =>
    geometry.addEventListener('dispose', () => geometryDisposals++),
  );
  materials.forEach((material) =>
    material.addEventListener('dispose', () => materialDisposals++),
  );
  fs.legs = [{ id: 'transfer-1', at: 1, landed: true, clean: true }];
  effect.update(frame);
  assert.deepEqual(frame.ship.group.position.toArray(), shipPose.position);
  assert.deepEqual(frame.ship.group.quaternion.toArray(), shipPose.quaternion);
  assert.deepEqual(frame.ship.group.scale.toArray(), shipPose.scale);
  effect.dispose();
  effect.dispose();
  assert.equal(geometryDisposals, 2);
  assert.equal(materialDisposals, 4);
  assert.equal(effect.group.children.length, 0);
});

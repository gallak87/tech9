import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCameraRig } from '../src/camera/index.js';
import { createSafeFrame } from '../src/camera/safe-frame.js';
import { validateDefinition } from '../src/levels/contract.js';

const rectangle = { left: -0.9, right: 0.9, bottom: -0.85, top: 0.9 };
const bounds = new T.Box3(
  new T.Vector3(-1.7, -0.04, -3.3),
  new T.Vector3(1.7, 1.4, 3.7),
);
const corners = [];
for (const x of [bounds.min.x, bounds.max.x])
  for (const y of [bounds.min.y, bounds.max.y])
    for (const z of [bounds.min.z, bounds.max.z])
      corners.push(new T.Vector3(x, y, z));
const track = {
  sample(distance) {
    return {
      position: new T.Vector3(0, 0, distance),
      tangent: new T.Vector3(0, 0, 1),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      quaternion: new T.Quaternion(),
    };
  },
};
const camera = () => new T.PerspectiveCamera(64, 1.6, 0.2, 14000);
const descriptor = (safeFrame) => ({
  version: 'test',
  createTrack() {},
  createRoad() {},
  createEnvironment() {},
  createBackdrop() {},
  camera: { safeFrame },
});

test('safe-frame contract rejects inverted, missing and nonfinite screen bounds', () => {
  assert.doesNotThrow(() => validateDefinition(descriptor(undefined)));
  assert.doesNotThrow(() => validateDefinition(descriptor(rectangle)));
  for (const frame of [
    null,
    {},
    [],
    false,
    { ...rectangle, left: 1 },
    { ...rectangle, bottom: 0.95 },
    { ...rectangle, top: Infinity },
    { ...rectangle, right: 1.2 },
  ])
    assert.throws(
      () => validateDefinition(descriptor(frame)),
      /camera safeFrame/,
    );
  assert.throws(
    () => createCameraRig(camera(), { safeFrame: null }, bounds),
    /camera safeFrame/,
  );
  assert.throws(
    () => createSafeFrame(rectangle, new T.Box3()),
    /finite local subject bounds/,
  );
});

test('projected subject fitting changes only orientation and stops once inside the rectangle', () => {
  const c = camera();
  c.position.set(0, 5, -13);
  c.lookAt(0, 14, 25);
  const subject = new T.Object3D();
  subject.position.set(-8, 0.72, 0);
  subject.rotation.set(0.05, -0.1, 0.35);
  const fit = createSafeFrame(rectangle, bounds);
  const before = {
    position: c.position.toArray(),
    fov: c.fov,
    subjectPosition: subject.position.toArray(),
    subjectQuaternion: subject.quaternion.toArray(),
  };
  fit(c, subject);
  for (const corner of corners) {
    const p = corner.clone().applyMatrix4(subject.matrixWorld).project(c);
    assert.ok(p.x >= rectangle.left - 1e-7 && p.x <= rectangle.right + 1e-7);
    assert.ok(p.y >= rectangle.bottom - 1e-7 && p.y <= rectangle.top + 1e-7);
  }
  assert.deepEqual(c.position.toArray(), before.position);
  assert.equal(c.fov, before.fov);
  assert.deepEqual(subject.position.toArray(), before.subjectPosition);
  assert.deepEqual(subject.quaternion.toArray(), before.subjectQuaternion);
  const rotation = c.quaternion.clone();
  fit(c, subject);
  assert.ok(c.quaternion.angleTo(rotation) < 1e-7);
});

test('ordinary in-frame chase and non-chase views retain their exact default camera behavior', () => {
  for (const mode of ['chase', 'vista', 'inspection']) {
    const plain = camera(),
      fitted = camera();
    const base = createCameraRig(plain);
    const guarded = createCameraRig(fitted, { safeFrame: rectangle }, bounds);
    const subject = new T.Object3D();
    for (let frame = 0; frame < 120; frame += 1) {
      const state = { distance: frame * 0.8, lateral: 0, speed: 48 };
      subject.position.set(mode === 'chase' ? 0 : 100, 0.72, state.distance);
      base.update(track, state, 1 / 60, { mode, subject });
      guarded.update(track, state, 1 / 60, { mode, subject });
      assert.deepEqual(fitted.position.toArray(), plain.position.toArray());
      assert.deepEqual(fitted.quaternion.toArray(), plain.quaternion.toArray());
      assert.deepEqual(fitted.up.toArray(), plain.up.toArray());
      assert.equal(fitted.fov, plain.fov);
    }
  }
});

test('responsive safe frames follow aspect changes and validate returned bounds', () => {
  const c = camera();
  c.position.set(0, 5, -13);
  const subject = new T.Object3D();
  subject.position.set(-8, 0.72, 0);
  const responsive = (aspect) =>
    aspect > 1.7
      ? { left: -0.15, right: 0.45, bottom: -0.62, top: 0.45 }
      : rectangle;
  assert.doesNotThrow(() => validateDefinition(descriptor(responsive)));
  const fit = createSafeFrame(responsive, bounds);
  for (const aspect of [1.6, 2.2, 1.8, 1.6]) {
    c.aspect = aspect;
    c.updateProjectionMatrix();
    c.lookAt(0, 14, 25);
    fit(c, subject);
    const target = responsive(aspect);
    for (const corner of corners) {
      const p = corner.clone().applyMatrix4(subject.matrixWorld).project(c);
      assert.ok(p.x >= target.left - 1e-6 && p.x <= target.right + 1e-6);
      assert.ok(p.y >= target.bottom - 1e-6 && p.y <= target.top + 1e-6);
    }
  }
  assert.throws(
    () =>
      createSafeFrame(() => ({ ...rectangle, left: 2 }), bounds)(c, subject),
    /camera safeFrame/,
  );
});

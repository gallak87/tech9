import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { resolveCameraBoom } from '../src/CameraBoom.js';
import { FollowCamera } from '../src/FollowCamera.js';

const origin = { x: 0, y: 2, z: 0 };
const behind = { x: 0, y: 4, z: 10 };

test('boom preserves a clear endpoint without mutating shared inputs', () => {
  const target = Object.freeze({ ...origin });
  const desired = Object.freeze({ ...behind });
  assert.deepEqual(resolveCameraBoom(target, desired), desired);
  assert.notEqual(resolveCameraBoom(target, desired), desired);
});

test('boom stops before terrain and retains camera floor clearance', () => {
  const groundHeight = (_x, z) => (z >= 4 ? 20 : 0);
  const p = resolveCameraBoom(origin, behind, { groundHeight });
  assert.ok(p.z < 4 && p.z > 3.5);
  assert.ok(p.y >= groundHeight(p.x, p.z) + 0.55);
  const lifted = resolveCameraBoom(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { groundHeight: () => 2 },
  );
  assert.equal(lifted.y, 2.55);
});

test('boom catches thin solids between samples and conservative overhead discs', () => {
  const collider = Object.freeze({ x: 0, z: 4.17, radius: 0.01 });
  const p = resolveCameraBoom(origin, behind, {
    colliders: Object.freeze([collider]),
    clearance: 0,
  });
  assert.ok(p.z < 4.16 && p.z > 4.15);
  const high = resolveCameraBoom(
    { x: 0, y: 100, z: 0 },
    { x: 0, y: 100, z: 10 },
    { colliders: [collider] },
  );
  assert.ok(high.z < 4);
  const blockedAnchor = resolveCameraBoom(origin, behind, {
    colliders: [{ x: 0, z: 0, radius: 1 }],
  });
  assert.deepEqual(blockedAnchor, origin);
});

test('boom rejects bad queries, geometry and unbounded sample work', () => {
  for (const config of [
    { sampleSpacing: 0 },
    { clearance: -1 },
    { maxSamples: Infinity },
    { maxSamples: 20000 },
    { maxSamples: 2 },
    { colliders: [{ x: 0, z: 0, radius: -1 }] },
    { groundHeight: () => NaN },
  ])
    assert.throws(() => resolveCameraBoom(origin, behind, config));
  assert.throws(() => resolveCameraBoom(origin, { ...behind, y: NaN }));
});

test('follow resolver protects desired and interpolated camera positions', () => {
  const camera = new PerspectiveCamera();
  let subject = { x: -8, y: 0, z: 0, heading: 0 };
  const phases = [];
  const rig = new FollowCamera(camera, {
    getTarget: () => subject,
    follow: { distance: 10, height: 4 },
    resolvePosition: (position, current, phase) => {
      phases.push(phase);
      return resolveCameraBoom({ x: current.x, y: 2, z: current.z }, position, {
        colliders: [{ x: 3, z: 5, radius: 1 }],
      });
    },
    mounted: { getPose: () => ({ position: [0, 2, 0], target: [0, 2, -1] }) },
  });
  rig.update(0);
  subject = { x: 8, y: 0, z: 0, heading: 0 };
  rig.update(0.1);
  assert.deepEqual(phases, [
    'desired',
    'interpolated',
    'desired',
    'interpolated',
  ]);
  const checked = resolveCameraBoom({ x: 8, y: 2, z: 0 }, camera.position, {
    colliders: [{ x: 3, z: 5, radius: 1 }],
  });
  assert.ok(camera.position.distanceTo(checked) < 1e-5);
  assert.ok(camera.position.z > 3 && camera.position.z < 5);
  rig.setMode('mounted');
  rig.update(1 / 60);
  assert.deepEqual(camera.position.toArray(), [0, 2, 0]);
  assert.equal(phases.length, 4);
  rig.setMode('follow');
  rig.update(0);
  assert.equal(camera.position.x, 8);
  assert.equal(phases.length, 6);
  rig.dispose();
});

test('follow rejects invalid collision callbacks and returned poses', () => {
  const camera = new PerspectiveCamera();
  const getTarget = () => ({ x: 0, z: 0, heading: 0 });
  assert.throws(
    () => new FollowCamera(camera, { getTarget, resolvePosition: 1 }),
  );
  const rig = new FollowCamera(camera, {
    getTarget,
    resolvePosition: () => ({ x: NaN, y: 0, z: 0 }),
  });
  assert.throws(() => rig.update(1 / 60), /resolver/);
  assert.deepEqual(camera.position.toArray(), [0, 0, 0]);
});

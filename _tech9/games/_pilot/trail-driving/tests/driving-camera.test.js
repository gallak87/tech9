import test from 'node:test';
import assert from 'node:assert/strict';
import { clearCameraBoom } from '../src/game/DrivingCamera.js';
test('camera boom shortens before scenery between target and desired camera', () => {
  const world = { height: () => 0, colliders: [{ x: 0, z: 5, radius: 1 }] };
  const p = clearCameraBoom({ x: 0, y: 2, z: 0 }, { x: 0, y: 4, z: 10 }, world);
  assert.ok(p.z < 3.5);
  assert.ok(Math.hypot(p.x, p.z - 5) > 1.5);
  assert.ok(p.y >= 0.55);
});
test('camera keeps its full boom in open space and avoids terrain crest', () => {
  const target = { x: 0, y: 2, z: 0 },
    desired = { x: 0, y: 4, z: 10 };
  assert.deepEqual(
    clearCameraBoom(target, desired, { height: () => 0, colliders: [] }),
    desired,
  );
  const p = clearCameraBoom(target, desired, {
    height: (_x, z) => (z > 4 ? 8 : 0),
    colliders: [],
  });
  assert.ok(p.z <= 4);
  assert.ok(p.y >= 0.55);
});

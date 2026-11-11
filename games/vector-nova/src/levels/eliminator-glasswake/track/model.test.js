import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlasswakeEliminatorTrack } from './model.js';
import { createEliminatorRoad } from '../../../events/eliminator-road.js';
import { createEliminatorDevices } from '../../../events/eliminator-course.js';

test('Fracture is a wide seamless supported circuit with a real climb and descent', () => {
  const track = createGlasswakeEliminatorTrack();
  assert.ok(Math.abs(track.length - 4900) < 0.1);
  assert.equal(track.closed, true);
  assert.equal(track.jumps.length, 0);
  assert.ok(track.width >= 48);
  assert.ok(
    track.sample(0).position.distanceTo(track.sample(track.length).position) <
      1e-6,
  );
  assert.ok(
    track
      .sample(0.001)
      .tangent.dot(track.sample(track.length - 0.001).tangent) > 0.99999,
  );
  const heights = [];
  for (let s = 0; s < track.length; s += 5) {
    const frame = track.sample(s);
    assert.ok(frame.position.toArray().every(Number.isFinite));
    assert.ok(Math.abs(frame.right.dot(frame.up)) < 1e-6);
    assert.ok(Math.abs(frame.bank) <= 0.441);
    heights.push(frame.position.y);
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 220);
  for (let s = 0; s < track.length; s += 0.25)
    assert.ok(
      track.sample(s).up.angleTo(track.sample(s + 0.25).up) < 0.008,
      'banking stays smooth across curve knots and the closed seam',
    );
  for (const device of createEliminatorDevices(track))
    assert.ok(Math.abs(device.lateral) + device.width / 2 < track.width / 2);
  const road = createEliminatorRoad({ track, shape: true });
  try {
    assert.ok(road.group.children.some((mesh) => mesh.userData.drivingSurface));
  } finally {
    road.dispose();
  }
});

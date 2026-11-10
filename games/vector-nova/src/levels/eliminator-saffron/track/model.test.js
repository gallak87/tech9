import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaffronEliminatorTrack } from './model.js';
import { createGlasswakeEliminatorTrack } from '../../eliminator-glasswake/track/model.js';
import { createEliminatorDevices } from '../../../events/eliminator-course.js';

test('Ossuary is its own supported fossil circuit with smooth banks and broad combat lanes', () => {
  const track = createSaffronEliminatorTrack(),
    glasswake = createGlasswakeEliminatorTrack();
  assert.equal(track.closed, true);
  assert.equal(track.jumps.length, 0);
  assert.ok(Math.abs(track.length - 5600) < 0.1);
  assert.ok(track.width >= 46);
  assert.notEqual(track.id, glasswake.id);
  assert.ok(
    track
      .sample(track.length * 0.4)
      .position.distanceTo(glasswake.sample(glasswake.length * 0.4).position) >
      100,
  );
  const heights = [];
  for (let s = 0; s < track.length; s += 0.5) {
    const frame = track.sample(s);
    assert.ok(frame.position.toArray().every(Number.isFinite));
    assert.ok(frame.up.angleTo(track.sample(s + 0.5).up) < 0.016);
    heights.push(frame.position.y);
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 330);
  assert.ok(track.sample(0).up.dot(track.sample(track.length).up) > 0.99999);
  for (const device of createEliminatorDevices(track))
    assert.ok(Math.abs(device.lateral) + device.width / 2 < track.width / 2);
});

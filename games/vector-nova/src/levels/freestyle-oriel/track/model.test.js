import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrielFreestyleTrack } from './model.js';
import { createLaunchworksTrack } from '../../launchworks/track/model.js';
import { createLaunchworksRoad } from '../../launchworks/track/road.js';

test('Sunvault retains proven generous flights, smooth releases and three real pipe catches', () => {
  const track = createOrielFreestyleTrack(),
    source = createLaunchworksTrack();
  assert.equal(track.jumps.length, 5);
  assert.equal(track.tubes.length, 3);
  assert.notEqual(track.id, source.id);
  assert.ok(track.width > source.width);
  for (const [i, jump] of track.jumps.entries()) {
    assert.equal(jump.takeoff, source.jumps[i].takeoff);
    assert.equal(jump.landingStart, source.jumps[i].landingStart);
    assert.ok(jump.catchWidth >= track.width * 0.9);
    assert.ok(jump.landingEnd - jump.landingStart > 530);
    const release = track.sample(jump.takeoff - 2);
    if (jump.releaseLength)
      assert.ok(
        release.tangent.dot(track.sample(jump.takeoff - 160).tangent) > 0.9999,
      );
    for (let s = jump.takeoff; s < jump.landingEnd; s += 60)
      assert.ok(
        Math.abs(
          track.sample(s).position.y - source.sample(s).position.y + 2300,
        ) < 0.002,
      );
  }
  for (const tube of track.tubes) {
    const s = (tube.entryEnd + tube.exitStart) / 2;
    assert.ok(track.sampleSurface(s, 0));
    assert.ok(track.sampleSurface(s, Math.PI * tube.radius));
  }
  const road = createLaunchworksRoad({ track, shape: true });
  try {
    assert.ok(road.group.children.some((mesh) => mesh.userData.drivingSurface));
  } finally {
    road.dispose();
  }
});

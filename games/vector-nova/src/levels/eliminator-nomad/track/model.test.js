import test from 'node:test';
import assert from 'node:assert/strict';
import createNomadLevel from '../../nomad/index.js';
import createLevel from '../index.js';
import { createNomadEliminatorTrack } from './model.js';
import { sampleCarrierMotion } from '../../nomad/motion.js';

test('Last Convoy retains the complete native moving-deck stack under a separate Eliminator identity', () => {
  const original = createNomadLevel(),
    level = createLevel();
  const track = createNomadEliminatorTrack();
  assert.equal(level.event.type, 'eliminator');
  assert.equal(level.event.finishAtCourseEnd, true);
  assert.equal(level.createRuntime, original.createRuntime);
  assert.equal(level.createDynamics, original.createDynamics);
  assert.equal(level.createCollisionWorld, original.createCollisionWorld);
  assert.equal(track.id, 'nomad-last-convoy');
  assert.equal(original.createTrack().id, 'nomad-procession');
  assert.equal(track.closed, false);
  assert.equal(track.movingSurfaces, true);
  assert.equal(track.carriers.length, 11);
  assert.equal(track.roadRuns.length, 11);
  assert.equal(track.jumps.length, 10);
  assert.ok(track.finishDistance < track.length);
  for (const jump of track.jumps) {
    assert.equal(
      track.surfaceCoverage((jump.takeoff + jump.landingStart) / 2),
      0,
      'transfers remain real open space between physical carrier decks',
    );
    assert.notEqual(jump.departureCarrierId, jump.receivingCarrierId);
  }
});

test('Every displayed deck follows the same physical carrier clock and the receivers move relative to departures', () => {
  const level = createLevel(),
    track = level.createTrack();
  const road = level.createRoad({ track, shape: true, collisionOnly: true });
  try {
    const at = 11;
    track.presentationTime = at;
    road.update();
    for (const carrier of track.carriers) {
      const motion = sampleCarrierMotion(carrier, at);
      assert.ok(
        road.owners.get(carrier.id).position.distanceTo(motion.translation) <
          1e-7,
        'visible deck and native rigid support share the carrier translation',
      );
      const s = (carrier.start + carrier.end) / 2;
      const nominal = track.nominalSample(s).position;
      assert.ok(
        track
          .frameAtTime(s, at)
          .position.clone()
          .sub(nominal)
          .distanceTo(motion.translation) < 1e-7,
      );
    }
    const departure = sampleCarrierMotion(track.carriers[5], at);
    const receiver = sampleCarrierMotion(track.carriers[6], at);
    assert.ok(
      departure.translation.distanceTo(receiver.translation) > 5,
      'the passing transfer is a genuinely moving interception, not a static scenery animation',
    );
  } finally {
    road.dispose();
  }
});

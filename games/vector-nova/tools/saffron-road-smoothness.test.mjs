import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/saffron/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { getRacerControl } from '../src/race/racers.js';

test('Saffron native launch ride follows the supported opening bank without facet drops', async (t) => {
  const level = createLevel({});
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const native = await level.createDynamics({
    track,
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  let actor;
  const dynamics = {
    ...native,
    createActor(...args) {
      actor = native.createActor(...args);
      return actor;
    },
  };
  const runtime = level.createRuntime({
    track,
    collisionWorld,
    dynamics,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    native.dispose();
    collisionWorld.dispose();
  });
  const state = createVehicleState();
  runtime.reset({ reason: 'initialize', state, seed: 7 });
  let before = runtime.pose(1).position.clone();
  for (let tick = 0; tick < 480; tick++) {
    const input = getRacerControl(state, track, {
      runtime,
      difficulty: 'easy',
    });
    const events = runtime.advance(state, input, 1 / 120);
    const body = actor.read();
    const frame = track.sample(state.distance);
    // Measure real chassis motion along the road normal, rather than only
    // height relative to a changing route frame. The former broad triangles
    // created actual 8–10 cm drops while support and contact flags stayed valid.
    const normalStep = body.position.clone().sub(before).dot(frame.up);
    assert.ok(
      Math.abs(normalStep) < 0.02,
      `physical opening-bank step ${normalStep}m at tick ${tick}, ${state.distance}m`,
    );
    assert.ok(
      body.support && runtime.pose(1).grounded,
      `lost opening support at tick ${tick}`,
    );
    assert.equal(
      body.contacts.some(({ shape }) => shape.kind === 'deck'),
      false,
    );
    assert.ok(
      !events.some(({ type }) => ['impact', 'road-departure'].includes(type)),
    );
    before = body.position.clone();
  }
  assert.ok(
    state.distance > 200,
    'the probe traverses the first bank at racing speed',
  );
});

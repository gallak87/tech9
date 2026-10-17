import test from 'node:test';
import assert from 'node:assert/strict';
import createLevel from '../src/levels/zephyr/index.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createVehicleState } from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';

const DT = 1 / 120;
const DRIVE = {
  throttle: 1,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
};
const copy = (value) => JSON.parse(JSON.stringify(value));

function geometry(t) {
  const level = createLevel();
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  t.after(() => collisionWorld.dispose());
  return { level, track, collisionWorld };
}

test('Zephyr receiving road keeps authored curbs without taller duplicate walls', (t) => {
  const { track, collisionWorld } = geometry(t);
  const world = withMagneticBoundaries(track, collisionWorld);
  const authored = collisionWorld.triangles.filter((face) => face.roadBoundary);
  assert.ok(authored.length > 0);
  assert.ok(authored.every((face) => world.triangles.includes(face)));
  const generated = world.triangles.filter((face) =>
    face.id.startsWith('magnetic-edge-'),
  );
  assert.equal(
    generated.filter((face) => face.start < 1200 && face.end > 1080).length,
    0,
  );
  assert.ok(
    generated.some((face) => face.start < track.jumps[0].takeoff - 200),
    'uncollected ordinary roads retain their safety walls',
  );
});

for (const approach of [
  { distance: 1120, lateral: -18, height: 3.6, speed: 112 },
  { distance: 1120, lateral: -18, height: 3.6, speed: 157 },
  { distance: 1080, lateral: -19, height: 4.2, speed: 112, scrape: true },
]) {
  test(`Zephyr returning over the left curb lands without a reset (${approach.distance}m / ${approach.speed}m/s)`, async (t) => {
    const { level, track, collisionWorld } = geometry(t);
    const dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track, collisionWorld),
    });
    const runtime = level.createRuntime({
      track,
      collisionWorld,
      dynamics,
      playtest: { type: 'jump' },
      settings: { steeringAssist: 0.3 },
    });
    t.after(() => {
      runtime.dispose();
      dynamics.dispose();
    });
    const state = createVehicleState();
    runtime.reset({ state });
    const frame = track.sample(approach.distance);
    const jump = track.jumps[0];
    runtime.launch(state, {
      jump: jump.id,
      position: frame.position
        .clone()
        .addScaledVector(frame.right, approach.lateral)
        .addScaledVector(frame.up, approach.height)
        .toArray(),
      quaternion: frame.quaternion.toArray(),
      velocity: frame.tangent
        .clone()
        .multiplyScalar(approach.speed)
        .addScaledVector(frame.up, -1)
        .addScaledVector(frame.right, 10)
        .toArray(),
    });
    // Save in flight, before the old invisible wall caught the hull. Recovery
    // is disabled, so only a genuine supported landing can satisfy this test.
    const checkpoint = copy({
      state,
      runtime: runtime.snapshot(),
      dynamics: dynamics.snapshot(),
    });
    const land = () => {
      const events = [];
      for (let tick = 0; tick < 180; tick++) {
        const emitted = runtime.advance(state, DRIVE, DT);
        events.push(...emitted);
        if (emitted.some(({ type }) => type === 'jump-transfer')) break;
      }
      return copy({ state, runtime: runtime.snapshot(), events });
    };
    const result = land();
    const transfer = result.events.find(({ type }) => type === 'jump-transfer');
    assert.equal(transfer?.payload.outcome, 'landed');
    assert.equal(transfer.payload.id, jump.id);
    assert.equal(result.runtime.mode, 'magnetic');
    assert.ok(
      state.distance >= jump.landingStart && state.distance <= jump.landingEnd,
    );
    assert.ok(
      state.speed > approach.speed * 0.75,
      'forward momentum survives the return',
    );
    assert.ok(!result.events.some(({ type }) => type === 'jump-miss'));
    if (approach.scrape)
      assert.ok(
        result.events.some(
          ({ type, payload }) =>
            type === 'impact' &&
            payload.contactKind === 'rail' &&
            payload.collider &&
            !payload.collider.startsWith('magnetic-edge-'),
        ),
        'the visible curb remains solid',
      );
    Object.assign(state, checkpoint.state);
    runtime.restore(checkpoint.runtime);
    dynamics.restore(checkpoint.dynamics);
    assert.deepEqual(
      land(),
      result,
      'restored flight reproduces the same contacts and landing',
    );
    const landedAt = state.distance;
    for (let tick = 0; tick < 60; tick++)
      runtime.advance(
        state,
        {
          ...DRIVE,
          steer: getRacerControl(state, track, {
            runtime,
            difficulty: 'hard',
            lane: state.lateral,
          }).steer,
        },
        DT,
      );
    assert.equal(runtime.snapshot().mode, 'magnetic');
    assert.ok(
      state.distance > landedAt + 35,
      'the ship keeps driving after capture',
    );
    assert.ok(
      state.speed > 60,
      'capture does not turn into a stationary rail perch',
    );
  });
}

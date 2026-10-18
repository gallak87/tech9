import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVehicleState } from '../src/physics/index.js';
import { createMagneticBody } from '../src/physics/magnetic-body.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { SHIPS } from '../src/ships/catalog.js';

const DT = 1 / 120;
const track = {
  id: 'handling-runway',
  length: 10000,
  width: 1000,
  closed: false,
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    quaternion: new T.Quaternion(),
    tangent: new T.Vector3(0, 0, 1),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    curvature: 0,
  }),
};
async function run({
  shipId = 'kestrel',
  speed = 170,
  steer = 1,
  airbrake = false,
  surface,
  shove = 0,
  ticks = 60,
} = {}) {
  const world = await createRapierWorld(),
    actor = world.createActor(),
    body = createMagneticBody({ track, dynamics: world, actor });
  const state = { ...createVehicleState(shipId), speed };
  try {
    body.reset(state);
    if (shove) {
      body.stage(state, { throttle: 1, steer: 0 }, DT);
      world.step(DT);
      body.finish(state);
      actor.setVelocity(new T.Vector3(shove, 0, state.speed));
    }
    for (let i = 0; i < ticks; i++) {
      body.stage(state, { throttle: 1, steer, airbrake }, DT, { surface });
      world.step(DT);
      body.finish(state);
    }
    const solved = actor.read(),
      direction = Math.atan2(solved.velocity.x, solved.velocity.z);
    return {
      state,
      velocity: solved.velocity,
      slip: Math.abs(
        Math.atan2(
          Math.sin(state.heading - direction),
          Math.cos(state.heading - direction),
        ),
      ),
    };
  } finally {
    world.dispose();
  }
}

test('boost speed preserves turning grip for every handling profile and steering direction', async () => {
  for (const { id: shipId } of SHIPS)
    for (const steer of [-1, 1]) {
      const cruise = await run({ shipId, speed: 112, steer }),
        boost = await run({ shipId, speed: 220, steer });
      assert.ok(
        boost.slip < 0.2,
        `${shipId}: boosted travel trails the nose by ${boost.slip} radians`,
      );
      assert.ok(
        Math.abs(boost.slip - cruise.slip) < 0.025,
        'boost must not substantially lengthen the grip response',
      );
      assert.ok(
        Math.abs(boost.state.lateral) > Math.abs(cruise.state.lateral) * 1.3,
        'faster travel keeps its steering authority',
      );
    }
});

test('normal grip keeps approved yaw while airbraking and slippery surfaces retain their drift', async () => {
  const normal = await run(),
    airbrake = await run({ airbrake: true }),
    slick = await run({ surface: { grip: 0.5 } });
  assert.ok(
    Math.abs(normal.state.heading + 0.5725) < 0.015,
    'grip correction must not change the 0.3-assist yaw response',
  );
  assert.ok(
    airbrake.slip > normal.slip * 1.5,
    'airbraking still permits a wider slide',
  );
  assert.ok(
    slick.slip > normal.slip * 1.5,
    'authored low-grip surfaces still affect handling',
  );
});

test('grip gradually dissipates a lateral shove instead of replacing collision velocity', async () => {
  const first = await run({ steer: 0, shove: 20, ticks: 1 }),
    settled = await run({ steer: 0, shove: 20, ticks: 60 });
  assert.ok(
    first.velocity.x > 18 && first.velocity.x < 20,
    'the next handling tick retains most of the shove',
  );
  assert.ok(
    first.state.lateral > 0,
    'earned contact momentum changes the accepted path',
  );
  assert.ok(
    settled.velocity.x > 0 && settled.velocity.x < 1,
    'grip settles without reversing the shove',
  );
});

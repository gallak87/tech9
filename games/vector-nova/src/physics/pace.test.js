import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createVehicleState,
  getVehiclePace,
  stepVehicle,
  STEERING_ASSIST,
} from './index.js';
import { SHIPS } from '../ships/catalog.js';
import { SHATTERLINE_PACE } from '../levels/shatterline/pace.js';
import { getRacerControl } from '../race/racers.js';

const dt = 1 / 120;
const idle = { throttle: 0, brake: 0, airbrake: false, boost: false, steer: 0 };
const plane = (grade = 0, curvature = 0) => ({
  width: 5000,
  length: 100000,
  sample: () => ({
    tangent: { x: 0, y: grade, z: Math.sqrt(1 - grade ** 2) },
    right: { x: 1, y: 0, z: 0 },
    curvature,
  }),
});
const advance = (
  state,
  controls,
  seconds,
  road = plane(),
  pace = SHATTERLINE_PACE,
) => {
  const events = [];
  for (let tick = 0; tick < seconds * 120; tick++)
    events.push(
      ...stepVehicle(state, { ...idle, ...controls }, road, dt, { pace }),
    );
  return events;
};
function baselineSequence(pace) {
  const results = [];
  for (const ship of SHIPS) {
    const state = { ...createVehicleState(ship.id), speed: 85 },
      events = [];
    for (let tick = 0; tick < 1200; tick++)
      events.push(
        ...stepVehicle(
          state,
          {
            throttle: tick < 800 ? 1 : 0,
            boost: tick >= 180 && tick < 500,
            brake: tick >= 1000 ? 0.7 : 0,
            airbrake: tick >= 850 && tick < 1000,
            steer: Math.sin(tick / 77) * 0.2,
          },
          plane(-0.55),
          dt,
          {
            ...(tick >= 600 && tick < 650
              ? { propulsion: { cruiseSpeed: 166, thrust: 1800 } }
              : {}),
            pace,
          },
        ),
      );
    results.push({ state, events });
  }
  return results;
}

test('omitted and neutral pace reproduce the committed fleet controls exactly', () => {
  const baseline = baselineSequence();
  // Captured from committed 7c115c94 before adding the optional contract.
  assert.equal(
    createHash('sha256').update(JSON.stringify(baseline)).digest('hex'),
    'cb46f2f66e659eacf89244fb0c2189a4bbc3d97bd8f8b4a3d4ae3a8af030c222',
  );
  assert.deepEqual(baselineSequence({}), baseline);
  assert.deepEqual(
    baselineSequence({
      cruiseScale: 1,
      boostScale: 1,
      aerodynamicDragScale: 1,
      overspeedDeceleration: 1,
    }),
    baseline,
  );
  assert.equal(STEERING_ASSIST, 0.3);
});

test('course pace preserves distinct fleet equilibria, reserve costs and launch thrust', () => {
  for (const ship of SHIPS) {
    const pace = getVehiclePace(ship.id, SHATTERLINE_PACE);
    for (const boost of [false, true]) {
      const speed = boost ? pace.boostSpeed : pace.cruiseSpeed;
      const state = { ...createVehicleState(ship.id), speed };
      advance(state, { throttle: 1, boost }, 1);
      assert.ok(
        Math.abs(state.speed - speed) < 1e-9,
        `${ship.id} maintains its flat-road equilibrium`,
      );
      assert.ok(
        Math.abs(
          state.energy - (boost ? 100 - ship.handling.boostDrain : 100),
        ) < 1e-9,
      );
    }
    const normal = createVehicleState(ship.id),
      paced = createVehicleState(ship.id);
    advance(normal, { throttle: 1 }, dt, plane(), null);
    advance(paced, { throttle: 1 }, dt);
    assert.equal(
      paced.speed,
      normal.speed,
      'higher equilibrium does not grant a launch impulse',
    );
  }
});

test('earned downhill speed carries smoothly, coasts passively and obeys both brakes', () => {
  for (const ship of SHIPS) {
    const start = { ...createVehicleState(ship.id), speed: 220 };
    const powered = { ...start },
      coast = { ...start },
      brake = { ...start },
      airbrake = { ...start };
    advance(powered, { throttle: 1 }, 2, plane(-0.75));
    advance(coast, {}, 2, plane(-0.75));
    advance(brake, { throttle: 1, boost: true, brake: 1 }, 2, plane(-0.75));
    advance(airbrake, { airbrake: true }, 2, plane(-0.75));
    assert.ok(
      powered.speed > coast.speed &&
        coast.speed > airbrake.speed &&
        airbrake.speed > brake.speed,
      `${ship.id} distinguishes engine, passive carry, airbrake and wheel brake`,
    );
    assert.ok(
      powered.speed < start.speed &&
        powered.speed > getVehiclePace(ship.id, SHATTERLINE_PACE).cruiseSpeed,
    );
    assert.equal(brake.boosting, false, 'brake overrides requested boost');
    advance(brake, { brake: 1 }, 10, plane(-0.75));
    assert.equal(brake.speed, 0);
    const distance = brake.distance;
    advance(brake, {}, 2, plane(-0.75));
    assert.equal(
      brake.distance,
      distance,
      'a parked craft remains held on a steep grade',
    );
    const next = { ...start };
    advance(next, { throttle: 1 }, dt, plane(-0.75));
    assert.ok(
      start.speed - next.speed < 0.5,
      'boost release does not clamp retained speed',
    );
  }
});

test('pace has stable long-grade speed and deterministic control replay', () => {
  for (const ship of SHIPS) {
    const state = { ...createVehicleState(ship.id), speed: 220 };
    advance(state, { throttle: 1 }, 120, plane(-0.8));
    const before = state.speed;
    advance(state, { throttle: 1 }, 30, plane(-0.8));
    assert.ok(
      Math.abs(state.speed - before) < 0.001,
      'powered descent converges rather than accelerating without limit',
    );
    assert.ok(
      state.speed < 240 &&
        state.speed > getVehiclePace(ship.id, SHATTERLINE_PACE).cruiseSpeed,
    );
    const saved = structuredClone(state);
    const events = advance(
      state,
      { throttle: 1, boost: true, steer: 0.01 },
      2,
      plane(-0.8),
    );
    const repeat = structuredClone(saved);
    assert.deepEqual(
      advance(
        repeat,
        { throttle: 1, boost: true, steer: 0.01 },
        2,
        plane(-0.8),
      ),
      events,
    );
    assert.deepEqual(repeat, state);
  }
});

test('rivals use the same pace on straights and still brake for real corners', () => {
  for (const ship of SHIPS) {
    const pace = getVehiclePace(ship.id, SHATTERLINE_PACE);
    const state = {
      ...createVehicleState(ship.id),
      speed: (pace.cruiseSpeed + ship.handling.cruiseSpeed) / 2,
      energy: 0,
    };
    const straight = { ...plane(), width: 50, pace: SHATTERLINE_PACE };
    const controls = getRacerControl(state, straight);
    assert.equal(
      controls.throttle,
      1,
      'rival continues toward the course cruise speed',
    );
    assert.equal(controls.brake, 0);
    const corner = getRacerControl(
      { ...state, speed: 180 },
      { ...straight, ...plane(0, 0.006) },
      { difficulty: 'hard' },
    );
    assert.ok(
      corner.brake > 0.3,
      'the profile does not erase meaningful corner braking',
    );
    assert.equal(corner.boost, false);
  }
});

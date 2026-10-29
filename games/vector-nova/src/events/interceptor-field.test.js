import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInterceptorField,
  INTERCEPTOR_CRUISE_KPH,
} from './interceptor-field.js';
import { createInterceptorTrack } from '../levels/interceptor/track/model.js';
import { createInterceptorDevices } from '../levels/interceptor/devices.js';
import { createRacers } from '../race/racers.js';
import { createVehicleState } from '../physics/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createMagneticRuntime } from '../core/session-runtime.js';
import { createDeviceRuntime } from '../pickups/runtime.js';

test('the pursuit driver uses brakes to govern the courier and anticipate the large hull', () => {
  const field = createInterceptorField(),
    track = createInterceptorTrack();
  const target = {
    ...createVehicleState('bastion'),
    chassisId: 'goliath',
    distance: 400,
    speed: INTERCEPTOR_CRUISE_KPH / 3.6,
  };
  const state = { ...createVehicleState(), distance: 350, speed: 130 };
  const hunter = field.control({
    opponent: { specification: field.opponents[1], state },
    track,
    devices: [],
    nearby: [target, state],
  });
  assert.equal(hunter.boost, false);
  assert.equal(hunter.throttle, 0);
  assert.ok(hunter.brake > 0.5, 'brake well before reaching the 40m hull');
  const fastTarget = { ...target, speed: target.speed + 12 };
  const courier = field.control({
    opponent: { specification: field.opponents[0], state: fastTarget },
    track,
    nearby: [fastTarget],
  });
  assert.equal(courier.boost, false);
  assert.equal(courier.throttle, 0);
  assert.ok(
    courier.brake > 0,
    'the speed limit is earned through physical braking',
  );
});

test('real shared courier physics cruises at 300kph while allies retain firing distance for a full lap', async () => {
  const track = createInterceptorTrack(),
    devices = createInterceptorDevices(track);
  const field = createInterceptorField();
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track),
  });
  const impacts = [];
  const racers = createRacers({
    track,
    devices,
    field,
    dynamics,
    continuous: true,
    createRuntime(specification) {
      const runtime = createDeviceRuntime({
        track,
        devices:
          specification.id === 'goliath'
            ? devices.filter((entry) => entry.type === 'aegis')
            : devices,
        combatId: specification.id,
        motion: createMagneticRuntime({ track, dynamics, equipment: true }),
      });
      const finish = runtime.finishAdvance.bind(runtime);
      runtime.finishAdvance = (state) => {
        const events = finish(state);
        for (const event of events)
          if (event.type === 'impact')
            impacts.push({ id: specification.id, ...event.payload });
        return events;
      };
      return runtime;
    },
  });
  const target = racers.opponents[0];
  let minimum = Infinity,
    maximum = 0,
    closest = Infinity;
  try {
    racers.reset();
    assert.equal(target.state.distance, 240);
    for (let tick = 0; tick < 55 * 120; tick++) {
      racers.advance(1 / 120);
      if (tick >= 10 * 120) {
        const speed = target.state.speed * 3.6;
        minimum = Math.min(minimum, speed);
        maximum = Math.max(maximum, speed);
        for (const ally of racers.opponents.slice(1))
          closest = Math.min(
            closest,
            target.state.distance - ally.state.distance,
          );
      }
    }
    assert.ok(
      target.state.distance > track.length,
      'the physical hull completes the whole course',
    );
    assert.ok(minimum > 295, `cruise minimum ${minimum.toFixed(1)}kph`);
    assert.ok(maximum < 302, `cruise maximum ${maximum.toFixed(1)}kph`);
    assert.ok(
      closest > 65,
      `allies retain a ${closest.toFixed(1)}m firing gap`,
    );
    assert.equal(
      impacts.filter((event) => event.id === 'goliath').length,
      0,
      'courier has no rail or ally collision',
    );
  } finally {
    racers.dispose();
    dynamics.dispose();
  }
});

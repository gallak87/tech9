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
import createHelionBreach from '../levels/interceptor-helion/index.js';
import { createInterceptorMotion } from './interceptor-motion.js';
import { createInterceptorEvent } from './interceptor.js';

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

test('course pursuit paths version field replay identity without changing ordinary boss identities', () => {
  const track = createInterceptorTrack();
  for (const bossId of ['goliath', 'bulwark'])
    assert.equal(
      createInterceptorField({ bossId, track }).id,
      createInterceptorField({ bossId }).id,
    );
  const helion = createHelionBreach().createTrack();
  const field = createInterceptorField({ bossId: 'wraith', track: helion });
  assert.ok(
    field.id.includes(
      helion.pursuitPath.id + '-v' + helion.pursuitPath.version,
    ),
  );
  assert.ok(field.id.length <= 160);
  assert.equal(helion.pursuitPath.intervals.length, 2);
  for (const [index, interval] of helion.pursuitPath.intervals.entries()) {
    const jump = helion.jumps[index];
    assert.ok(
      interval.settled < jump.takeoff - 20,
      'the nose clears the separator before the lip',
    );
    assert.ok(interval.release >= jump.recovery);
    assert.ok(interval.lane <= -4.5 && interval.lane >= -10.5);
  }
  const changed = structuredClone(helion.pursuitPath);
  changed.intervals[0].lane -= 0.1;
  assert.notEqual(
    field.id,
    createInterceptorField({
      bossId: 'wraith',
      track: { ...helion, pursuitPath: changed },
    }).id,
  );
  changed.intervals[0].lane = 0;
  assert.throws(
    () =>
      createInterceptorField({
        bossId: 'wraith',
        track: { ...helion, pursuitPath: changed },
      }),
    /Invalid course pursuit interval/,
  );
});

test('the real Helion field clears both physical dividers with its thermal boss and allied chase offsets', async () => {
  const level = createHelionBreach(),
    track = level.createTrack();
  const devices = level.racing.createDevices(track);
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await createRapierWorld({ collisionWorld });
  const mission = createInterceptorEvent({
    bossId: 'wraith',
    targetId: 'wraith',
    routeLength: track.length,
    escapeDistance: track.length * 2,
    difficulty: 'easy',
  });
  const field = createInterceptorField({
    track,
    bossId: 'wraith',
    getCounterattack: () => mission.snapshot().counterattack,
  });
  const dividerHits = [];
  const racers = createRacers({
    track,
    devices,
    field,
    dynamics,
    continuous: true,
    createRuntime(specification) {
      const context = {
        track,
        collisionWorld,
        dynamics,
        settings: { steeringAssist: 0.3 },
        presentation: false,
      };
      const runtime = createDeviceRuntime({
        track,
        devices:
          specification.id === 'wraith'
            ? devices.filter((entry) => entry.type === 'aegis')
            : devices,
        combatId: specification.id,
        motion:
          specification.id === 'wraith'
            ? createInterceptorMotion(context, {
                createMotion: level.racing.createMotion,
                getYaw: () => mission.snapshot().counterattack.yaw,
              })
            : level.racing.createMotion(context),
      });
      const finish = runtime.finishAdvance.bind(runtime);
      runtime.finishAdvance = (state) => {
        const events = finish(state);
        for (const event of events)
          if (
            event.type === 'impact' &&
            JSON.stringify(event).includes('split-lane')
          )
            dividerHits.push({ id: specification.id, ...event.payload });
        return events;
      };
      return runtime;
    },
  });
  const target = racers.opponents[0];
  const crossed = new Set();
  let blasts = 0;
  try {
    racers.reset();
    for (
      let tick = 0;
      tick < 100 * 120 && target.state.distance < track.jumps[1].recovery + 450;
      tick++
    ) {
      racers.advance(1 / 120);
      blasts += mission
        .step(1 / 120, {
          targetDistance: target.state.distance,
          playerDistance: target.state.distance - 100,
        })
        .filter((event) => event.type === 'interceptor-fire').length;
      for (const jump of track.jumps)
        if (
          target.state.distance >= jump.takeoff &&
          target.state.distance < jump.landingStart
        ) {
          crossed.add(jump.id);
          assert.ok(
            target.state.speed > 10,
            'boss makes real forward progress through the supported branch',
          );
          assert.ok(
            target.state.lateral < -5 && target.state.lateral > -11,
            'large contact hull stays clear of both physical curbs',
          );
        }
    }
    assert.equal(crossed.size, 2);
    assert.ok(
      target.state.distance > track.jumps[1].recovery + 400,
      `boss continued to ${target.state.distance.toFixed(1)}m`,
    );
    for (const ally of racers.opponents.slice(1))
      assert.ok(
        ally.state.distance > track.jumps[1].landingStart + 80,
        `${ally.specification.id} also clears the second divider`,
      );
    assert.equal(dividerHits.length, 0, JSON.stringify(dividerHits));
    assert.ok(
      blasts > 0,
      'the same physical traversal still reaches and performs its signature counterattack',
    );
  } finally {
    racers.dispose();
    dynamics.dispose();
  }
});

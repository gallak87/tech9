import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  captureInitial,
  createMagneticRuntime,
  restoreReplayInitial,
} from '../src/core/session-runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';
import { createMagneticBody } from '../src/physics/magnetic-body.js';

const DT = 1 / 120;
function track(bank = 0) {
  const quaternion = new T.Quaternion().setFromAxisAngle(
    new T.Vector3(0, 0, 1),
    bank,
  );
  return {
    id: 'contact-straight',
    length: 4000,
    width: 24,
    closed: false,
    sample: (distance) => ({
      position: new T.Vector3(0, 0, distance),
      quaternion: quaternion.clone(),
      tangent: new T.Vector3(0, 0, 1),
      right: new T.Vector3(1, 0, 0).applyQuaternion(quaternion),
      up: new T.Vector3(0, 1, 0).applyQuaternion(quaternion),
      curvature: 0,
    }),
  };
}

test('a hull stranded across a boundary loses support and recovers without gaining progress', async (t) => {
  for (const bank of [0, Math.PI / 2, Math.PI]) {
    const course = track(bank);
    const dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(course),
    });
    t.after(() => dynamics.dispose());
    const actor = dynamics.createActor();
    const body = createMagneticBody({ track: course, dynamics, actor });
    const state = { ...createVehicleState(), distance: 100, lateral: 11.5 };
    const frame = course.sample(state.distance);
    body.stage(state, {}, DT);
    dynamics.step(DT);
    body.finish(state);
    actor.setPose({
      position: frame.position
        .clone()
        .addScaledVector(frame.right, 11.5)
        .addScaledVector(frame.up, 5),
      quaternion: frame.quaternion,
    });
    actor.setVelocity(new T.Vector3());
    body.adopt(state);
    let contacts = 0,
      departure,
      recovered,
      checkpoint;
    const advance = () => {
      body.stage(state, { throttle: 1 }, DT);
      dynamics.step(DT);
      const events = body.finish(state);
      contacts += actor
        .read()
        .contacts.filter((hit) => hit.shape.roadBoundary).length;
      departure ??= events.find(({ type }) => type === 'road-departure');
      recovered ??= events.find(({ type }) => type === 'road-recovery');
      if (body.pose().recovering) {
        assert.equal(
          actor.read().support,
          null,
          'no magnetic plane outside the road',
        );
        assert.equal(body.pose().grounded, false);
        assert.equal(
          state.distance,
          departure.payload.distance,
          'falling cannot advance the course',
        );
      }
      return {
        state: { ...state },
        motion: body.snapshot(),
        pose: body.pose(),
        events,
      };
    };
    for (let tick = 0; tick < 480 && !recovered; tick++) {
      advance();
      if (!checkpoint && body.pose().recovering)
        checkpoint = {
          state: { ...state },
          motion: body.snapshot(),
          dynamics: dynamics.snapshot(),
        };
    }
    assert.ok(
      contacts > 0 && departure,
      'the physical rail traps the actual hull',
    );
    assert.ok(recovered, `bank ${bank} recovers within four seconds`);
    assert.equal(state.distance, departure.payload.distance);
    assert.equal(state.lateral, 0);
    assert.equal(state.speed, 0);
    assert.equal(body.snapshot().roadRecovery, null);
    for (let tick = 0; tick < 120; tick++) advance();
    assert.ok(
      state.speed > 20 && state.distance > departure.payload.distance + 10,
      'throttle drives away after recovery',
    );
    const restore = () => {
      Object.assign(state, checkpoint.state);
      body.restore(checkpoint.motion);
      dynamics.restore(checkpoint.dynamics);
    };
    restore();
    const expected = Array.from({ length: 200 }, advance);
    restore();
    assert.deepEqual(
      Array.from({ length: 200 }, advance),
      expected,
      'fall and recovery restore deterministically',
    );
  }
});

test('an unsupported stationary ship falls under gravity, even without pilot input', async (t) => {
  for (const automaticRecovery of [true, false]) {
    const course = track();
    const dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(course),
    });
    t.after(() => dynamics.dispose());
    const actor = dynamics.createActor();
    const body = createMagneticBody({
      track: course,
      dynamics,
      actor,
      automaticRecovery,
    });
    const state = { ...createVehicleState(), distance: 100, lateral: 25 };
    let startY, recovery;
    for (let tick = 0; tick < 240; tick++) {
      body.stage(state, {}, DT);
      startY ??= actor.read().position.y;
      dynamics.step(DT);
      const events = body.finish(state);
      recovery ??= events.find(({ type }) => type === 'road-recovery');
      assert.equal(state.distance, 100, 'no free route progress');
      if (tick === 59) {
        assert.equal(actor.read().support, null);
        assert.equal(body.pose().grounded, false);
        assert.ok(
          actor.read().position.y < startY - 2,
          'gravity moves the hull down',
        );
        assert.ok(actor.read().velocity.y < -10);
      }
    }
    assert.equal(Boolean(recovery), automaticRecovery);
    assert.equal(body.pose().recovering, !automaticRecovery);
    if (automaticRecovery) assert.equal(state.lateral, 0);
    else
      assert.ok(
        actor.read().position.y < startY - 40,
        'manual playtests keep falling',
      );
  }
});
async function fixture(
  t,
  course = track(),
  entries = [{ distance: -12, speed: 40, lateral: 0.9 }, { distance: 0 }],
) {
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(course),
  });
  const racers = entries.map((entry) => ({
    state: { ...createVehicleState(), ...entry },
    runtime: createMagneticRuntime({ track: course, dynamics }),
  }));
  t.after(() => {
    racers.forEach(({ runtime }) => runtime.dispose());
    dynamics.dispose();
  });
  return {
    course,
    dynamics,
    racers,
    step(input = {}, modifiers) {
      racers.forEach(({ runtime, state }) =>
        runtime.beginAdvance(state, input, DT, modifiers),
      );
      dynamics.step(DT);
      return racers.map(({ runtime, state }) => runtime.finishAdvance(state));
    },
  };
}

test('restarting after physical driving recreates the exact validated replay initial state', async (t) => {
  const f = await fixture(t);
  const starts = f.racers.map(({ state }) => ({ ...state }));
  // The frontend binds each selected chassis while initializing the session,
  // before its first competitive reset and replay capture.
  f.racers.forEach(({ runtime, state }) => runtime.reset({ state }));
  const reset = () => {
    f.dynamics.reset();
    f.racers.forEach(({ runtime, state }, index) => {
      Object.assign(state, starts[index]);
      runtime.reset({ state });
    });
  };
  const capture = () =>
    f.racers.map(({ state, runtime }, index) =>
      captureInitial(state, runtime, index === 0 ? f.dynamics : null),
    );
  reset();
  const expected = capture();
  for (let tick = 0; tick < 60; tick++) f.step({ throttle: 1 });
  assert.ok(
    f.racers.some(({ state }, index) => state.speed !== starts[index].speed),
  );
  reset();
  const actual = capture();
  assert.deepEqual(
    actual,
    expected,
    'pilot history and native handles cannot leak into a fresh run',
  );
  const player = f.racers[0];
  assert.doesNotThrow(() =>
    restoreReplayInitial(
      expected[0],
      actual[0],
      player.state,
      player.runtime,
      f.dynamics,
    ),
  );
});

test('rear contact transfers speed and yaw through driving ticks without repeated manifold damage', async (t) => {
  const f = await fixture(t);
  let collision;
  for (let i = 0; i < 120 && !collision; i++) {
    const events = f.step();
    if (
      events.some((list) =>
        list.some((event) => event.payload?.contactKind === 'racer'),
      )
    )
      collision = events;
  }
  assert.ok(collision, 'real hulls meet');
  for (const events of collision)
    assert.equal(
      events.filter((e) => e.type === 'impact').length,
      1,
      'one energy charge per collider, not per manifold point',
    );
  const recipient = f.racers[1];
  assert.ok(
    recipient.state.speed > 3,
    'stationary racer receives the incoming momentum',
  );
  const distance = recipient.state.distance;
  for (let i = 0; i < 30; i++) f.step();
  assert.ok(
    recipient.state.distance > distance + 0.5,
    'driving controller retains the shove',
  );
  assert.ok(
    f.racers.some(({ state }) => Math.abs(state.heading) > 0.005),
    'off-centre contact changes physical yaw',
  );
});

test('a shield affects reserve loss while both bodies still separate physically', async (t) => {
  const f = await fixture(t);
  let impacts = [];
  for (let i = 0; i < 100 && !impacts.length; i++)
    impacts = f
      .step({}, { shield: true })
      .flat()
      .filter((event) => event.type === 'impact');
  assert.ok(impacts.length);
  assert.ok(
    impacts.every(
      ({ payload }) => payload.shielded && payload.energyCost === 0,
    ),
  );
  assert.ok(f.racers[1].state.speed > 3);
  assert.equal(f.racers[0].state.energy, 100);
});

test('a centred racer bump separates on impact rather than sticking together', async (t) => {
  const f = await fixture(t, track(), [
    { distance: -12, speed: 40 },
    { distance: 0 },
  ]);
  let hit = false;
  for (let i = 0; i < 120; i++) {
    hit = f
      .step()
      .flat()
      .some((event) => event.payload?.contactKind === 'racer');
    if (hit) break;
  }
  assert.ok(hit);
  const [striker, recipient] = f.racers;
  // Contact may first occur on a sloped prow; finish its short solver response.
  for (let i = 0; i < 3; i++) f.step();
  assert.ok(
    recipient.state.speed - striker.state.speed > 2,
    `immediate relative separating speed: ${recipient.state.speed} - ${striker.state.speed}`,
  );
  assert.ok(
    striker.state.speed > 0 && recipient.state.speed > 0,
    'both retain forward momentum',
  );
  assert.ok(
    striker.state.speed ** 2 + recipient.state.speed ** 2 <= 40 ** 2 * 1.05,
    'support constraints must not inject energy into the collision',
  );
});

test('every chassis can turn out of a stopped sideways heading within 2.6 seconds', async (t) => {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    const f = await fixture(t, track(), [
      { shipId, distance: 100, heading: Math.PI / 2 },
    ]);
    const racer = f.racers[0];
    let elapsed = 0;
    while (Math.abs(racer.state.heading) > 0.15 && elapsed < 2.6) {
      f.step({ steer: 1 });
      elapsed += DT;
    }
    assert.ok(
      Math.abs(racer.state.heading) <= 0.15,
      `${shipId} reorients through physical yaw torque in ${elapsed}s`,
    );
  }
});

test('grounded contacts preserve banked and inverted support while allowing yaw', async (t) => {
  for (const bank of [1.2, Math.PI]) {
    const f = await fixture(t, track(bank));
    let impacts = 0;
    for (let i = 0; i < 120; i++) {
      impacts += f
        .step()
        .flat()
        .filter((e) => e.payload?.contactKind === 'racer').length;
      for (const { state, runtime } of f.racers) {
        const pose = runtime.pose(),
          frame = f.course.sample(state.distance);
        const height = pose.position.clone().sub(frame.position).dot(frame.up);
        const vertices = getCollisionHull(state.shipId).vertices;
        let bottom = Infinity;
        for (let vertex = 0; vertex < vertices.length; vertex += 3)
          bottom = Math.min(
            bottom,
            new T.Vector3()
              .fromArray(vertices, vertex)
              .applyQuaternion(pose.quaternion)
              .dot(frame.up),
          );
        assert.ok(
          height + bottom >= -0.03,
          `physical hull clearance ${height + bottom}`,
        );
        assert.ok(
          Math.abs(height - 0.72) < 0.08,
          `magnetic support height ${height}`,
        );
      }
    }
    assert.ok(impacts > 0);
  }
});

test('grounded engine snapshot repeats contact response, state and event cooldowns exactly', async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 4; i++) f.step();
  const saved = JSON.parse(
    JSON.stringify({
      dynamics: f.dynamics.snapshot(),
      racers: f.racers.map(({ state, runtime }) => ({
        state,
        motion: runtime.snapshot(),
      })),
    }),
  );
  const run = () => {
    const events = [];
    for (let i = 0; i < 120; i++) events.push(f.step());
    return JSON.stringify({
      events,
      states: f.racers.map(({ state, runtime }) => ({
        state,
        pose: runtime.snapshot(),
      })),
    });
  };
  const expected = run();
  f.racers.forEach(({ state, runtime }, index) => {
    Object.assign(state, saved.racers[index].state);
    runtime.restore(saved.racers[index].motion);
  });
  f.dynamics.restore(saved.dynamics);
  assert.equal(run(), expected);
});

test('physical road bounds resist a sustained outward input without route-coordinate clipping', async (t) => {
  const f = await fixture(t, track(), [
    { distance: 100, lateral: 7, speed: 60 },
  ]);
  let contacts = 0,
    furthest = -Infinity,
    worstTick = 0;
  for (let i = 0; i < 360; i++) {
    contacts += f
      .step({ throttle: 1, steer: -1 })
      .flat()
      .filter((e) => e.payload?.contactKind === 'rail').length;
    const { state, runtime } = f.racers[0];
    assert.ok(Number.isFinite(state.speed));
    assert.equal(
      runtime.snapshot().roadRecovery,
      null,
      'ordinary wall pressure does not count as a stranded hull',
    );
    const pose = runtime.pose();
    const vertices = getCollisionHull(state.shipId).vertices;
    for (let vertex = 0; vertex < vertices.length; vertex += 3) {
      const x = new T.Vector3()
        .fromArray(vertices, vertex)
        .applyQuaternion(pose.quaternion)
        .add(pose.position).x;
      if (x > furthest) {
        furthest = x;
        worstTick = i;
      }
    }
  }
  assert.ok(contacts > 0);
  assert.ok(
    furthest <= 12.05,
    `physical hull extends to ${furthest} at tick ${worstTick}`,
  );
});

test('ordinary steering can escape a nose-on contact while throttle stays held', async (t) => {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    const nose = getCollisionHull(shipId).bounds.max[2];
    const f = await fixture(t, track(), [
      {
        shipId,
        distance: 100,
        lateral: 12 - nose - 0.01,
        heading: Math.PI / 2,
      },
    ]);
    const racer = f.racers[0];
    for (let i = 0; i < 3.5 * 120 && racer.state.heading > 0.15; i++)
      f.step({ throttle: 1, steer: 1 });
    assert.ok(
      racer.state.heading < 0.15,
      `${shipId} steering turns out of contact under thrust: ${JSON.stringify(racer.state)} ${JSON.stringify(racer.runtime.pose())}`,
    );
    for (let i = 0; i < 120; i++) f.step({ throttle: 1 });
    assert.ok(
      racer.state.distance > 110 && racer.state.speed > 10,
      `${shipId} drives away from contact`,
    );
  }
});

test('steering turns away from a high-speed glancing contact within 0.7 seconds', async (t) => {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle']) {
    const heading = 0.246;
    const quaternion = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      heading,
    );
    const vertices = getCollisionHull(shipId).vertices;
    let extent = -Infinity;
    for (let i = 0; i < vertices.length; i += 3)
      extent = Math.max(
        extent,
        new T.Vector3().fromArray(vertices, i).applyQuaternion(quaternion).x,
      );
    const f = await fixture(t, track(), [
      {
        shipId,
        distance: 100,
        lateral: 12 - extent - 0.01,
        heading,
        speed: 170 / Math.cos(heading),
        lateralSpeed: 8,
      },
    ]);
    const { state } = f.racers[0];
    let contacts = 0;
    for (let i = 0; i < 0.7 * 120 && state.heading > -0.05; i++)
      contacts += f
        .step({ throttle: 1, steer: 1 })
        .flat()
        .filter((event) => event.payload?.contactKind === 'rail').length;
    assert.ok(contacts > 0, `${shipId} makes physical contact`);
    assert.ok(
      state.heading <= -0.05,
      `${shipId} can turn away under thrust: ${state.heading}`,
    );
    assert.ok(state.speed > 100, `${shipId} retains racing momentum`);
  }
});

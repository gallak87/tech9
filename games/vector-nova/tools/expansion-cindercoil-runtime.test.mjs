import test from 'node:test';
import assert from 'node:assert/strict';
import { createCindercoilTrack } from '../src/levels/cindercoil/track/model.js';
import * as T from 'three';
import { createFlightModel } from '../src/physics/flight.js';
import {
  CINDERCOIL_FLIGHT_RULES,
  createCindercoilRuntime,
} from '../src/levels/cindercoil/runtime.js';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createRace } from '../src/race/index.js';
import {
  compatibleRuntime,
  runtimeIdentity,
} from '../src/core/session-runtime.js';

const track = createCindercoilTrack();
const idle = { throttle: 0, brake: 0, steer: 0, boost: false, airbrake: false };
const dt = 1 / 120;
const stateAt = (distance, speed = 0, time = 0, lateral = 0) => ({
  ...createVehicleState(),
  distance,
  speed,
  time,
  lateral,
});
function cross(speed, time) {
  const runtime = createCindercoilRuntime({ track });
  const state = stateAt(track.jumps[0].takeoff - 0.01, speed, time);
  runtime.reset({ state, seed: 77 });
  const race = createRace(track, { rulesId: runtime.rulesId });
  race.placeScenario(state.distance);
  race.valid = true;
  const events = [];
  for (let tick = 0; tick < 1400; tick++) {
    const previous = state.distance;
    const next = runtime.advance(state, idle, dt);
    events.push(...next);
    race.step(previous, state.distance, dt, next);
    if (events.some((event) => event.type === 'jump-transfer')) break;
  }
  runtime.dispose();
  return {
    state,
    race,
    events,
    transfer: events.find((event) => event.type === 'jump-transfer'),
  };
}

test('clean and erupting vent flights land with real world motion and one ordered checkpoint', () => {
  for (const time of [0, 3, 7]) {
    for (const speed of [70, 85, 102, 112]) {
      const result = cross(speed, time);
      assert.equal(
        result.transfer?.payload.outcome,
        'landed',
        `${time}/${speed}`,
      );
      assert.ok(result.race.valid);
      assert.equal(
        result.race.checkpoint,
        track.checkpoints.findIndex(
          (cp) => cp.distance === track.jumps[0].landingStart,
        ),
      );
    }
  }
  const calm = cross(102, 7),
    eruption = cross(102, 3);
  assert.ok(
    eruption.state.distance - calm.state.distance > 40,
    'eruption has physical consequence',
  );
});

test('slow and excessive eruption approaches recover with time cost and correct order', () => {
  for (const [speed, time, reason] of [
    [45, 7, 'short'],
    [150, 7, 'long'],
    [130, 3, 'long'],
  ]) {
    const result = cross(speed, time);
    assert.equal(result.transfer?.payload.outcome, 'recovered');
    assert.equal(
      result.events.find((event) => event.type === 'jump-miss')?.payload.reason,
      reason,
    );
    assert.equal(result.state.distance, track.jumps[0].recovery);
    assert.ok(result.state.time - time >= 1.5);
    assert.ok(result.race.valid);
  }
});

test('undeclared road preserves baseline handling and stationary slope hold', () => {
  for (const name of ['staging', 'bank-rest', 'slope-rest']) {
    const a = { ...createVehicleState(), ...track.scenarios[name] },
      b = { ...a };
    const runtime = createCindercoilRuntime({ track });
    for (let tick = 0; tick < 120; tick++) {
      runtime.advance(a, idle, dt);
      stepVehicle(b, idle, track, dt);
    }
    assert.deepEqual(a, b);
    assert.equal(a.speed, 0);
    runtime.dispose();
  }
});

test('declared lava contact reduces speed and reserve; protected line and settings preserve rules', () => {
  const zone = track.surgeZones[0];
  const states = [];
  for (const side of [-1, 1]) {
    const state = stateAt(zone.start + 12, 45, 4, side * zone.side * 8.5);
    const runtime = createCindercoilRuntime({ track });
    const events = [];
    for (let tick = 0; tick < 30; tick++)
      events.push(...runtime.advance(state, idle, dt));
    states.push({ state, snapshot: runtime.snapshot(), events });
    runtime.dispose();
  }
  assert.equal(states[0].snapshot.contactSeconds, 0);
  assert.ok(states[1].snapshot.contactSeconds > 0.2);
  assert.ok(states[0].state.speed - states[1].state.speed > 4);
  assert.ok(states[1].state.energy < states[0].state.energy);
  assert.equal(
    states[1].events.filter((e) => e.type === 'lava-contact').length,
    1,
  );
  const hi = createCindercoilRuntime({ track, settings: { quality: 'high' } });
  const low = createCindercoilRuntime({
    track,
    settings: { quality: 'low', reducedMotion: true },
  });
  assert.deepEqual(runtimeIdentity(hi), runtimeIdentity(low));
  assert.equal(
    compatibleRuntime(hi, { ...runtimeIdentity(low), rulesId: 'stale' }),
    false,
  );
  hi.dispose();
  low.dispose();
});

test('midflight snapshot restores exact continuation and reset/dispose clears owned state', () => {
  const a = createCindercoilRuntime({ track }),
    b = createCindercoilRuntime({ track });
  const stateA = stateAt(track.jumps[0].takeoff - 0.01, 102, 3);
  for (let tick = 0; tick < 70; tick++) a.advance(stateA, idle, dt);
  assert.equal(a.snapshot().flight.mode, 'flight');
  assert.ok(
    a.pose(1).position.distanceTo(track.sample(stateA.distance).position) > 30,
  );
  const stateB = { ...stateA };
  b.restore(JSON.parse(JSON.stringify(a.snapshot())));
  for (let tick = 0; tick < 350; tick++)
    assert.deepEqual(a.advance(stateA, idle, dt), b.advance(stateB, idle, dt));
  assert.deepEqual(stateA, stateB);
  assert.deepEqual(a.snapshot(), b.snapshot());
  a.reset({ state: stateA, seed: 77 });
  assert.equal(a.pose(1), null);
  assert.equal(a.snapshot().contactSeconds, 0);
  assert.equal(a.snapshot().flight.mode, 'magnetic');
  a.dispose();
  a.dispose();
  b.dispose();
  const retained = { ...stateA };
  assert.deepEqual(a.advance(stateA, idle, dt), []);
  assert.deepEqual(stateA, retained);
});

test('ordered numerical lap traverses every district, full coil and vent without rail contact', () => {
  const state = createVehicleState();
  const runtime = createCindercoilRuntime({ track });
  const race = createRace(track, { rulesId: runtime.rulesId });
  let impacts = 0;
  let landed = 0;
  for (let tick = 0; tick < 120 * 100 && race.lastLap === null; tick++) {
    const frame = track.sample(state.distance);
    const targetHeading = (frame.curvature * state.speed * 0.75) / 7.2;
    const steer = Math.max(
      -1,
      Math.min(
        1,
        (-frame.curvature * state.speed) / 1.5 +
          (state.heading - targetHeading) * 1.7 +
          state.lateral * 0.012 +
          state.lateralSpeed * 0.007,
      ),
    );
    const jump = track.jumps[0];
    const targetSpeed =
      state.distance > jump.takeoff - 220 && state.distance < jump.recovery
        ? 95
        : 65;
    const previous = state.distance;
    const events = runtime.advance(
      state,
      {
        throttle: state.speed < targetSpeed ? 1 : 0,
        brake: state.speed > targetSpeed + 3 ? 0.25 : 0,
        steer,
        boost: false,
        airbrake: false,
      },
      dt,
    );
    race.step(previous, state.distance, dt, events);
    impacts += events.filter((event) => event.type === 'impact').length;
    landed += events.filter(
      (event) =>
        event.type === 'jump-transfer' && event.payload.outcome === 'landed',
    ).length;
  }
  assert.ok(
    race.lastLap > 40 && race.lastLap < 100,
    'ordered lap completes in bounded simulation time',
  );
  assert.equal(race.valid, true);
  assert.equal(impacts, 0);
  assert.equal(landed, 1);
  runtime.dispose();
});

test('outboard receiving barriers catch supported top and side hits without extending the deck', () => {
  const model = createFlightModel(CINDERCOIL_FLIGHT_RULES);
  const jump = track.jumps[0];
  const poseAt = (frame, x, y) => ({
    position: frame.position
      .clone()
      .addScaledVector(frame.right, x)
      .addScaledVector(frame.up, y),
    quaternion: frame.quaternion.clone(),
  });
  for (const offset of [40, 42, 44, 100, 200])
    for (const side of [-1, 1]) {
      const frame = track.sample(jump.landingStart + offset);
      const top = model.sweptRail(
        track,
        jump,
        poseAt(frame, side * 17.3, 6),
        poseAt(frame, side * 17.3, 1),
      );
      assert.ok(top, `top ${offset}/${side}`);
      assert.ok(
        Math.abs(
          top.position.clone().sub(frame.position).dot(frame.up) - 4.08,
        ) < 0.005,
      );
      assert.ok(
        model.sweptRail(
          track,
          jump,
          poseAt(frame, side * 14, 2.8),
          poseAt(frame, side * 18, 2.8),
        ),
      );
      assert.equal(
        model.sweptLanding(
          track,
          jump,
          poseAt(frame, side * 17.3, 12),
          poseAt(frame, side * 17.3, -12),
          frame.up.clone().multiplyScalar(-100),
        ),
        null,
      );
      for (const [x, fromY, toY] of [
        [17.31, 6, 1],
        [14, -2, 2],
        [14, 20, 18],
      ])
        assert.equal(
          model.sweptRail(
            track,
            jump,
            poseAt(frame, side * x, fromY),
            poseAt(frame, side * x, toY),
          ),
          null,
        );
      const wrong = frame.quaternion
        .clone()
        .multiply(
          new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI),
        );
      const before = poseAt(frame, side * 17.3, 6),
        after = poseAt(frame, side * 17.3, 1);
      before.quaternion = wrong;
      after.quaternion = wrong;
      assert.equal(model.sweptRail(track, jump, before, after), null);
    }
});

test('imperfect vent approaches reuse one inward edge bounce and land with ordered checkpoint credit', () => {
  for (const side of ['left', 'right'])
    for (const coarse of [1 / 120, 1 / 30]) {
      const runtime = createCindercoilRuntime({ track });
      const state = {
        ...createVehicleState(),
        ...runtime.scenarios[`vent-edge-${side}`].state,
      };
      const race = createRace(track, { rulesId: runtime.rulesId });
      race.placeScenario(state.distance);
      race.valid = true;
      const events = [];
      let replay;
      for (let i = 0; i < 1200; i++) {
        const previous = state.distance;
        const next = runtime.advance(state, idle, coarse);
        events.push(...next);
        race.step(previous, state.distance, coarse, next);
        if (!replay && next.some((e) => e.type === 'impact'))
          replay = {
            state: { ...state },
            snapshot: JSON.parse(JSON.stringify(runtime.snapshot())),
          };
        if (next.some((e) => e.type === 'jump-transfer')) break;
      }
      const impacts = events.filter((e) => e.type === 'impact');
      assert.equal(impacts.length, 1);
      assert.equal(impacts[0].payload.source, 'cindercoil-volcanic-edge-catch');
      assert.equal(impacts[0].payload.speedRetention, 0.95);
      assert.equal(impacts[0].payload.energyCost, 2);
      assert.equal(
        events.find((e) => e.type === 'jump-transfer').payload.outcome,
        'landed',
      );
      assert.equal(
        race.checkpoint,
        track.checkpoints.findIndex(
          (cp) => cp.distance === track.jumps[0].landingStart,
        ),
      );
      assert.equal(race.valid, true);
      assert.ok(Math.abs(state.lateral) < 13);
      const copy = createCindercoilRuntime({ track });
      copy.restore(replay.snapshot);
      const replayState = replay.state;
      const continuation = [];
      for (let i = 0; i < 1200; i++) {
        const next = copy.advance(replayState, idle, coarse);
        continuation.push(...next);
        if (next.some((e) => e.type === 'jump-transfer')) break;
      }
      assert.deepEqual(replayState, state);
      assert.equal(continuation.filter((e) => e.type === 'impact').length, 0);
      runtime.dispose();
      copy.dispose();
    }
});

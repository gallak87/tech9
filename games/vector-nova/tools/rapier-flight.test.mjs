import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../src/levels/saffron/index.js';
import { createVehicleState } from '../src/physics/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { createRace } from '../src/race/index.js';
import { advanceSession } from '../src/core/session-runtime.js';
import { createRacers } from '../src/race/racers.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createFlightModel } from '../src/physics/flight.js';
import { projectedHullExtent } from '../src/physics/hull.js';

const DT = 1 / 120;
const input = (throttle) => ({
  throttle,
  brake: 0,
  steer: 0,
  boost: false,
  airbrake: false,
});
const DRIVE = input(1);
const COAST = input(0);
const copy = (value) => JSON.parse(JSON.stringify(value));

async function fixture(t, scenario, playtest = null) {
  const level = createLevel({});
  const track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await level.createDynamics({ track, collisionWorld });
  const runtime = createDeviceRuntime({
    track,
    devices: level.racing.createDevices(track),
    motion: level.createRuntime({
      track,
      collisionWorld,
      dynamics,
      playtest,
      presentation: false,
      settings: { steeringAssist: 0.3 },
    }),
  });
  const state = { ...createVehicleState(), ...track.scenarios[scenario] };
  runtime.reset({ state, scenario, seed: 17 });
  const context = {
    track,
    dynamics,
    runtime,
    state,
    race: createRace(track, { rulesId: runtime.rulesId, untimed: true }),
    jump: track.jumps.find(({ id }) => id === 'second-vertebra'),
  };
  context.race.placeScenario(state.distance);
  context.step = (controls) => {
    const emitted = [];
    advanceSession({
      state,
      runtime,
      dynamics,
      race: context.race,
      input: controls,
      dt: DT,
      emit: (event) => emitted.push(event),
    });
    return emitted;
  };
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  return context;
}

function assertFiniteFlight(snapshot) {
  if (!snapshot.currentPose) return;
  assert.ok(snapshot.currentPose.position.every(Number.isFinite));
  const quaternion = new T.Quaternion().fromArray(
    snapshot.currentPose.quaternion,
  );
  assert.ok(Math.abs(quaternion.length() - 1) < 1e-5);
  assert.ok(snapshot.flight.velocity.every(Number.isFinite));
  assert.ok(snapshot.flight.angularVelocity.every(Number.isFinite));
}

test('Saffron second-vertebra from rest lands through actual throttle, Vector devices and shared Rapier advance', async (t) => {
  const { step, state, runtime, jump } = await fixture(t, 'jump-playtest');
  assert.equal(state.speed, 0);
  assert.ok(Math.abs(state.distance - (jump.takeoff - 320)) < 1e-8);
  const events = [];
  for (let tick = 0; tick < 120 * 12; tick++) {
    const completed = step(DRIVE);
    events.push(...completed);
    const snapshot = runtime.snapshot();
    if (snapshot.flight) assertFiniteFlight(snapshot);
    if (completed.some(({ type }) => type === 'jump-transfer')) break;
  }
  assert.ok(
    events.some(
      ({ type, payload }) =>
        type === 'pickup-activate' && payload.deviceId === 'spine-two-vector',
    ),
    'the authored approach strip accelerates the real vehicle',
  );
  const launch = events.find(({ type }) => type === 'jump-launch');
  assert.equal(launch?.payload.id, jump.id);
  assert.ok(
    launch.payload.speed > 140,
    'launch speed comes from the supported approach and device',
  );
  const transfer = events.find(({ type }) => type === 'jump-transfer');
  assert.equal(transfer?.payload.id, jump.id);
  assert.equal(transfer.payload.outcome, 'landed');
  assert.ok(
    state.distance >= jump.landingStart && state.distance <= jump.landingEnd,
  );
  assert.equal(runtime.snapshot().mode, 'magnetic');
  assert.ok(!events.some(({ type }) => type === 'jump-miss'));
});

test('Saffron short launch rotates and keeps physical contacts throughout falling recovery', async (t) => {
  const { step, state, runtime, jump } = await fixture(t, 'jump3-short');
  const events = [];
  let recoveryFrames = 0;
  let contactFrames = 0;
  let rotatingContactFrames = 0;
  let peakRecoverySpin = 0;
  for (let tick = 0; tick < 120 * 8; tick++) {
    const before = runtime.snapshot();
    const completed = step(COAST);
    events.push(...completed);
    const snapshot = runtime.snapshot();
    if (snapshot.flight) assertFiniteFlight(snapshot);
    if (snapshot.mode === 'recovery') {
      recoveryFrames++;
      peakRecoverySpin = Math.max(
        peakRecoverySpin,
        new T.Vector3(...snapshot.flight.angularVelocity).length(),
      );
      if (snapshot.flight.contacts > (before.flight?.contacts ?? 0)) {
        contactFrames++;
        if (
          before.currentPose &&
          new T.Quaternion()
            .fromArray(before.currentPose.quaternion)
            .angleTo(
              new T.Quaternion().fromArray(snapshot.currentPose.quaternion),
            ) > 0.001
        )
          rotatingContactFrames++;
      }
    }
    if (snapshot.flight)
      assert.ok(
        Math.abs(state.distance - jump.takeoff) < 1e-8,
        'physical falling motion holds route progress at takeoff',
      );
    if (completed.some(({ type }) => type === 'jump-transfer')) break;
  }
  const impacts = events.filter(({ type }) => type === 'impact');
  assert.ok(
    impacts.some(({ payload }) => payload.contactKind === 'terrain'),
    'the short hull hits real desert geometry',
  );
  assert.ok(events.some(({ type }) => type === 'jump-miss'));
  assert.ok(
    recoveryFrames >= 120,
    `timed falling recovery is exercised: ${recoveryFrames}`,
  );
  assert.ok(
    contactFrames >= 3,
    `recovery keeps detecting real contacts: ${contactFrames}`,
  );
  assert.ok(
    rotatingContactFrames >= 2,
    `orientation evolves during repeated contact: ${rotatingContactFrames}`,
  );
  assert.ok(
    peakRecoverySpin > 0.2,
    `physical recovery spin is measurable: ${peakRecoverySpin}`,
  );
  assert.equal(
    events.find(({ type }) => type === 'jump-transfer')?.payload.outcome,
    'recovered',
  );
  assert.ok(
    !events.some(
      ({ type, payload }) =>
        type === 'jump-transfer' && payload.outcome === 'landed',
    ),
  );
  for (const { payload } of impacts) {
    assert.ok(payload.position.every(Number.isFinite));
    assert.ok(Math.abs(new T.Vector3(...payload.normal).length() - 1) < 1e-5);
  }
});

test('jump contact playtest keeps falling beyond the racing recovery delay until manual reset', async (t) => {
  const { step, state, runtime, dynamics, jump, track } = await fixture(
    t,
    'jump3-short',
    { automaticRecovery: false },
  );
  const events = [];
  for (
    let tick = 0;
    tick < 120 * 3 && runtime.snapshot().mode !== 'recovery';
    tick++
  )
    events.push(...step(COAST));
  assert.equal(runtime.snapshot().mode, 'recovery');
  const contacts = runtime.snapshot().flight.contacts;
  for (let tick = 0; tick < 120 * 4; tick++) events.push(...step(COAST));
  const snapshot = runtime.snapshot();
  assert.equal(snapshot.mode, 'recovery');
  assert.equal(snapshot.flight.manualRecovery, true);
  assert.ok(
    snapshot.flight.contacts > contacts,
    'collision checks continue while observing the fall',
  );
  assert.equal(state.distance, jump.takeoff);
  assert.ok(
    !events.some(({ type }) => type === 'jump-transfer'),
    'no automatic teleport or checkpoint transfer',
  );
  assertFiniteFlight(snapshot);
  Object.assign(state, createVehicleState(), track.scenarios['jump-playtest']);
  dynamics.reset();
  runtime.reset({ state, scenario: 'jump-playtest' });
  assert.equal(runtime.snapshot().mode, 'magnetic');
  assert.equal(runtime.snapshot().flight, null);
  assert.equal(state.distance, jump.takeoff - 320);
});

test('Saffron vehicle, device runtime and engine snapshots repeat recovery contacts and transfer exactly', async (t) => {
  const context = await fixture(t, 'jump3-short');
  const { step, state, runtime, dynamics } = context;
  for (
    let tick = 0;
    tick < 120 * 5 && runtime.snapshot().mode !== 'recovery';
    tick++
  )
    step(COAST);
  assert.equal(runtime.snapshot().mode, 'recovery');
  assert.ok(
    runtime.snapshot().flight.contacts > 0,
    'checkpoint follows a real engine collision',
  );
  const saved = copy({
    vehicle: state,
    runtime: runtime.snapshot(),
    dynamics: dynamics.snapshot(),
    race: context.race,
  });
  const continueRecovery = () => {
    const trace = [];
    const events = [];
    for (let tick = 0; tick < 210; tick++) {
      const emitted = step(COAST);
      events.push(...emitted);
      trace.push({
        vehicle: { ...state },
        runtime: runtime.snapshot(),
        emitted,
      });
    }
    return copy({ trace, events, race: context.race });
  };
  const expected = continueRecovery();
  assert.ok(
    expected.events.some(({ type }) => type === 'impact'),
    'continuation includes further impacts',
  );
  assert.ok(
    expected.events.some(
      ({ type, payload }) =>
        type === 'jump-transfer' && payload.outcome === 'recovered',
    ),
  );
  Object.assign(state, saved.vehicle);
  runtime.restore(saved.runtime);
  dynamics.restore(saved.dynamics);
  context.race = Object.assign(
    createRace(context.track, { rulesId: runtime.rulesId, untimed: true }),
    saved.race,
  );
  assert.deepEqual(
    continueRecovery(),
    expected,
    'shared advance repeats every vehicle pose, spin, contact counter, event and race state',
  );
});

test('simultaneous player and rival flight shares one engine tick and exact session continuation', async (t) => {
  const definition = createLevel({});
  const track = definition.createTrack();
  const collisionWorld = definition.createCollisionWorld({ track });
  const nativeDynamics = await definition.createDynamics({
    track,
    collisionWorld,
  });
  let stepCalls = 0;
  const dynamics = {
    ...nativeDynamics,
    step(dt) {
      stepCalls++;
      nativeDynamics.step(dt);
    },
  };
  const devices = definition.racing.createDevices(track);
  const createRuntime = () =>
    createDeviceRuntime({
      track,
      devices,
      motion: definition.createRuntime({
        track,
        collisionWorld,
        dynamics,
        presentation: false,
      }),
    });
  const runtime = createRuntime();
  const racers = createRacers({ track, devices, dynamics, createRuntime });
  t.after(() => {
    racers.dispose();
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  const start = {
    distance: track.jumps[2].takeoff - 0.1,
    lateral: 0,
    speed: 160,
  };
  const state = { ...createVehicleState(), ...start };
  const race = createRace(track, { rulesId: runtime.rulesId });
  dynamics.reset();
  racers.reset({ enabled: true });
  runtime.reset({ state });
  race.placeScenario(start.distance);
  for (const opponent of racers.opponents) {
    Object.assign(opponent.state, start);
    opponent.prev = { ...opponent.state };
    opponent.runtime.reset({ state: opponent.state });
    opponent.race.placeScenario(start.distance);
  }
  const advance = () =>
    advanceSession({
      state,
      input: { throttle: 1, brake: 0, steer: 0, boost: false, airbrake: false },
      dt: DT,
      runtime,
      race,
      racers,
      dynamics,
      emit() {},
    });
  advance();
  assert.equal(stepCalls, 1);
  assert.equal(runtime.snapshot().mode, 'flight');
  assert.ok(
    racers.opponents.every(
      (opponent) => opponent.runtime.snapshot().mode === 'flight',
    ),
  );
  assert.equal(
    dynamics.snapshot().actors.filter((actor) => actor.active).length,
    4,
  );
  advance();
  assert.equal(stepCalls, 2);
  for (const vehicle of [
    state,
    ...racers.opponents.map((opponent) => opponent.state),
  ])
    assert.ok(Math.abs(vehicle.time - 2 * DT) < 1e-12);
  assert.equal(race.elapsed, 2 * DT);
  assert.equal(racers.serialize().elapsed, 2 * DT);

  const snapshot = () =>
    copy({
      vehicle: state,
      runtime: runtime.snapshot(),
      race,
      racers: racers.serialize(),
      dynamics: dynamics.snapshot(),
    });
  const retained = snapshot();
  advance();
  const expected = snapshot();
  Object.assign(state, retained.vehicle);
  Object.assign(race, retained.race);
  runtime.restore(retained.runtime);
  racers.restore(retained.racers);
  dynamics.restore(retained.dynamics);
  advance();
  assert.equal(stepCalls, 4);
  assert.deepEqual(snapshot(), expected);
});

const jump = {
  id: 'jump',
  takeoff: 100,
  landingStart: 200,
  landingEnd: 500,
  recovery: 550,
  halfWidth: 16,
};
const track = {
  id: 'traction-proof',
  length: 1000,
  width: 32,
  jumps: [jump],
  checkpoints: [{ distance: 0 }, { distance: 200 }, { distance: 700 }],
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    quaternion: new T.Quaternion(),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    tangent: new T.Vector3(0, 0, 1),
    curvature: 0,
    bank: 0,
  }),
};

async function tractionFixture(t, kind = 'deck') {
  const geometry = new T.BoxGeometry(32, 12, 0.2);
  const wall = indexedTriangles(
    geometry.attributes.position.array,
    geometry.index.array,
    { id: 'wall', kind: 'structure' },
    new T.Matrix4().makeTranslation(0, 6, 250),
  );
  geometry.dispose();
  const source = createCollisionWorld({
    id: 'traction',
    version: 1,
    geometryId: `traction-${kind}-v1`,
    triangles: [
      {
        id: 'floor',
        kind,
        start: 200,
        end: 500,
        points: [
          [-16, 0, 200],
          [-16, 0, 500],
          [16, 0, 200],
        ],
      },
      {
        id: 'floor',
        kind,
        start: 200,
        end: 500,
        points: [
          [-16, 0, 500],
          [16, 0, 500],
          [16, 0, 200],
        ],
      },
      ...wall,
    ],
  });
  const dynamics = await createRapierWorld({ collisionWorld: source });
  const runtime = createFlightModel().createRuntime(
    { track, collisionWorld: source, dynamics },
    {
      id: 'traction',
      version: 1,
      rulesId: 'traction-proof-v1',
      automaticRecovery: false,
    },
  );
  const state = { ...createVehicleState(), distance: 99.8, speed: 100 };
  runtime.advance(state, {}, DT);
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    source.dispose();
  });
  const place = (position, velocity, mode = 'flight') => {
    const snapshot = runtime.snapshot();
    snapshot.mode = mode;
    snapshot.currentPose = snapshot.previousPose = {
      position,
      quaternion: [0, 0, 0, 1],
    };
    Object.assign(snapshot.flight, {
      velocity,
      angularVelocity: [0, 0, 0],
      elapsed: 0.5,
      remaining: 0,
      hitAt: -1,
      dynamicsStarted: true,
      ...(mode === 'recovery' ? { manualRecovery: true } : {}),
    });
    runtime.restore(snapshot);
  };
  return { runtime, state, place };
}

test('wall rebound onto the receiving deck restores traction and stays grounded under throttle', async (t) => {
  const { runtime, state, place } = await tractionFixture(t);
  place([0, 3, 242], [0, 0, 30]);
  const events = [];
  let recoveryFrames = 0;
  for (let tick = 0; tick < 360; tick++) {
    events.push(...runtime.advance(state, {}, DT));
    if (runtime.snapshot().mode === 'recovery') recoveryFrames++;
    if (events.some(({ type }) => type === 'jump-transfer')) break;
  }
  assert.ok(
    events.some(
      ({ type, payload }) =>
        type === 'impact' && payload.contactKind === 'structure',
    ),
    'hits the real wall first',
  );
  assert.ok(
    recoveryFrames > 0,
    'wall collision starts physical falling recovery',
  );
  const transfer = events.find(({ type }) => type === 'jump-transfer');
  assert.equal(transfer?.payload.outcome, 'landed');
  assert.equal(transfer.payload.tractionRestored, true);
  assert.ok(
    state.distance >= jump.landingStart && state.distance <= jump.landingEnd,
  );
  assert.equal(runtime.snapshot().mode, 'magnetic');
  assert.equal(runtime.snapshot().flight, null);
  const landedDistance = state.distance;
  for (let tick = 0; tick < 240; tick++) {
    const emitted = runtime.advance(state, { throttle: 1 }, DT);
    assert.ok(
      !emitted.some(
        ({ type }) => type === 'jump-launch' || type === 'jump-miss',
      ),
    );
    assert.equal(runtime.snapshot().mode, 'magnetic');
    const pose = runtime.pose();
    if (pose) {
      assert.equal(pose.grounded, true);
      const clearance =
        pose.position.y -
        projectedHullExtent(pose.quaternion, new T.Vector3(0, 1, 0));
      assert.ok(
        clearance >= -1e-5 && clearance <= 0.061,
        'the tilted hull stays supported with at most the 6 cm cosmetic bounce',
      );
    }
  }
  assert.ok(
    state.distance > landedDistance + 10,
    'throttle drives back along the deck',
  );
});

test('falling recovery does not regain road traction from terrain or a deck underside', async (t) => {
  for (const kind of ['terrain', 'deck']) {
    await t.test(kind, async (t) => {
      const { runtime, state, place } = await tractionFixture(t, kind);
      place(
        kind === 'deck' ? [0, -3, 235] : [0, 3, 235],
        kind === 'deck' ? [0, 25, 0] : [0, -12, 0],
        'recovery',
      );
      const events = [];
      for (let tick = 0; tick < 120; tick++) {
        events.push(...runtime.advance(state, {}, DT));
        if (events.some(({ type }) => type === 'impact')) break;
      }
      assert.ok(
        events.some(
          ({ type, payload }) =>
            type === 'impact' && payload.contactKind === kind,
        ),
        'guard is exercised by real engine contact',
      );
      assert.equal(runtime.snapshot().mode, 'recovery');
      assert.ok(!events.some(({ type }) => type === 'jump-transfer'));
    });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from '../src/levels/saffron/index.js';
import createCindercoilLevel from '../src/levels/cindercoil/index.js';
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
import { projectedHullExtent, VEHICLE_HULL } from '../src/physics/hull.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';

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
// A physical capture may lift the centre while a tilted hull rotates clear of
// the deck. Its maximum transient clearance follows the hull's bounding radius;
// after the constraint settles it must return to ordinary hovering clearance.
const captureClearance =
  Math.hypot(
    VEHICLE_HULL.halfWidth,
    VEHICLE_HULL.halfLength,
    VEHICLE_HULL.hover,
  ) -
  VEHICLE_HULL.hover +
  0.05;
const captureTicks = 30;
const testHull = {
  id: 'abstract-traction-cuboid',
  hullSha256: 'abstract-traction-cuboid-v1',
  vertices: [-1, 1].flatMap((x) =>
    [-1, 1].flatMap((y) =>
      [-1, 1].flatMap((z) => [
        x * VEHICLE_HULL.halfWidth,
        y * VEHICLE_HULL.hover,
        z * VEHICLE_HULL.halfLength,
      ]),
    ),
  ),
};

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

test('jump contact playtest defaults to manual recovery without a level-specific flag', async (t) => {
  const { step, state, runtime, dynamics, jump, track } = await fixture(
    t,
    'jump3-short',
    {},
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
  // The field now interacts physically: start in a real two-wide grid instead
  // of placing every hull at the same point, as the old ghost-racer test did.
  state.lateral = 4;
  runtime.reset({ state });
  for (const [index, opponent] of racers.opponents.entries()) {
    const slot = index + 1;
    Object.assign(opponent.state, start, {
      distance: start.distance - Math.floor(slot / 2) * 12,
      lateral: slot % 2 === 0 ? 4 : -4,
    });
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
  for (
    let tick = 0;
    tick < 90 &&
    racers.opponents.some(
      (opponent) => opponent.runtime.snapshot().mode !== 'flight',
    );
    tick++
  )
    advance();
  assert.ok(
    racers.opponents.every(
      (opponent) => opponent.runtime.snapshot().mode === 'flight',
    ),
  );
  assert.equal(
    dynamics.snapshot().actors.filter((actor) => actor.active).length,
    racers.opponents.length + 1,
  );
  const launchTicks = stepCalls;
  advance();
  assert.equal(stepCalls, launchTicks + 1);
  for (const vehicle of [
    state,
    ...racers.opponents.map((opponent) => opponent.state),
  ])
    assert.ok(Math.abs(vehicle.time - (launchTicks + 1) * DT) < 1e-12);
  assert.ok(Math.abs(race.elapsed - (launchTicks + 1) * DT) < 1e-12);
  assert.ok(
    Math.abs(racers.serialize().elapsed - (launchTicks + 1) * DT) < 1e-12,
  );

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
  assert.equal(stepCalls, launchTicks + 3);
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
  let actor;
  const runtime = createFlightModel().createRuntime(
    {
      track,
      collisionWorld: source,
      dynamics: {
        ...dynamics,
        createActor: (options) => (actor = dynamics.createActor(options)),
      },
    },
    {
      id: 'traction',
      version: 1,
      rulesId: 'traction-proof-v1',
      testLaunch: true,
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
    // These local contact fixtures exercise an explicit abstract cuboid. The
    // production cases below separately exercise each rendered chassis proxy.
    actor.setContactShape(testHull);
  };
  return { runtime, state, place, dynamics, actor };
}

test('simultaneous deck and racer capture retains solver momentum and one impact across relatching and restore', async (t) => {
  const { runtime, state, place, dynamics, actor } = await tractionFixture(t);
  place([0, 1.1, 300], [35, -90, 90]);
  const rival = dynamics.createActor();
  rival.reset({
    pose: {
      position: new T.Vector3(4.4, 0.72, 301),
      quaternion: new T.Quaternion(),
    },
    velocity: new T.Vector3(-10, 0, 90),
    support: {
      position: new T.Vector3(0, 0.72, 0),
      quaternion: new T.Quaternion(),
    },
    active: true,
  });
  runtime.beginAdvance(state, COAST, DT);
  dynamics.step(DT);
  const solved = actor.read();
  assert.ok(solved.contacts.some(({ shape }) => shape.kind === 'deck'));
  assert.ok(solved.contacts.some(({ shape }) => shape.kind === 'racer'));
  const peak = (kind) =>
    Math.max(
      ...solved.contacts
        .filter(({ shape }) => shape.kind === kind)
        .map(({ incomingSpeed }) => incomingSpeed),
    );
  assert.ok(
    peak('deck') > peak('racer'),
    'the stronger deck impact cannot hide the rival hit, regardless of substep order',
  );
  const events = runtime.finishAdvance(state);
  const impacts = events.filter(({ type }) => type === 'impact');
  assert.equal(
    impacts.length,
    1,
    'all manifold points from the rival emit one event before capture',
  );
  assert.equal(impacts[0].payload.contactKind, 'racer');
  assert.equal(
    events.find(({ type }) => type === 'jump-transfer')?.payload.outcome,
    'landed',
  );
  assert.deepEqual(
    actor.read().velocity,
    solved.velocity,
    'landing retains every component of the contact impulse',
  );
  assert.deepEqual(
    actor.read().angularVelocity,
    solved.angularVelocity,
    'capture retains contact spin',
  );
  assert.ok(state.impact > 0, 'landing does not clear the impact effect');
  const checkpoint = copy({
    state,
    runtime: runtime.snapshot(),
    dynamics: dynamics.snapshot(),
  });
  const continueCapture = () => {
    const emitted = [];
    for (let tick = 0; tick < 8; tick++)
      emitted.push(...runtime.advance(state, COAST, DT));
    return copy({ events: emitted, state, runtime: runtime.snapshot() });
  };
  const expected = continueCapture();
  assert.ok(
    !expected.events.some(
      ({ type, payload }) =>
        type === 'impact' && payload.contactKind === 'racer',
    ),
    'relatching cannot charge the same collision again',
  );
  Object.assign(state, checkpoint.state);
  runtime.restore(checkpoint.runtime);
  dynamics.restore(checkpoint.dynamics);
  assert.deepEqual(continueCapture(), expected);
});

test('an airborne pile-up reports each rival once and spends only one shield', async (t) => {
  const { runtime, state, place, dynamics } = await tractionFixture(t);
  place([0, 10, 300], [0, 0, 90]);
  for (const sign of [-1, 1]) {
    const rival = dynamics.createActor();
    rival.reset({
      pose: {
        position: new T.Vector3(sign * 4.4, 10, 301),
        quaternion: new T.Quaternion(),
      },
      velocity: new T.Vector3(-sign * 35, 0, 90),
      active: true,
    });
  }
  const events = runtime.advance(state, COAST, DT, { shield: true });
  const impacts = events.filter(({ type }) => type === 'impact');
  assert.equal(impacts.length, 2);
  assert.equal(new Set(impacts.map(({ payload }) => payload.collider)).size, 2);
  assert.equal(impacts.filter(({ payload }) => payload.shielded).length, 1);
  assert.equal(
    impacts.filter(({ payload }) => payload.energyCost > 0).length,
    1,
  );
  assert.ok(impacts.every(({ payload }) => payload.source === 'racer-contact'));
  const continuing = [];
  for (let tick = 0; tick < 8; tick++)
    continuing.push(...runtime.advance(state, COAST, DT));
  assert.ok(
    !continuing.some(({ type }) => type === 'impact'),
    'sustained contact cannot repeat the reserve charge',
  );
});

test('airborne impact spin remains physical and attitude torque resumes after the brief recovery delay', async (t) => {
  const { runtime, state, place, actor } = await tractionFixture(t);
  place([0, 20, 300], [0, 0, 90]);
  const snapshot = runtime.snapshot();
  snapshot.flight.hitAt = snapshot.flight.elapsed;
  snapshot.flight.angularVelocity = [0, 4, 0];
  runtime.restore(snapshot);
  let previous = actor.read().quaternion;
  for (let tick = 0; tick < 50; tick++) {
    runtime.advance(state, COAST, DT);
    const body = actor.read();
    assert.ok(
      previous.angleTo(body.quaternion) < 0.05,
      'recovery never snaps heading',
    );
    if (tick === 17)
      assert.ok(
        body.angularVelocity.y > 3.2,
        'the initial impact spin retains its natural damping before recovery torque',
      );
    previous = body.quaternion;
  }
  assert.equal(runtime.snapshot().mode, 'flight');
  assert.ok(
    actor.read().angularVelocity.y < 0,
    'active torque is already counter-steering the spin before half a second',
  );
});

test('clean high-speed deck capture preserves forward momentum and settles promptly', async (t) => {
  const { runtime, state, place } = await tractionFixture(t);
  place([0, 2.2, 300], [0, -90, 190]);
  let transfer;
  for (let tick = 0; tick < 30 && !transfer; tick++) {
    transfer = runtime
      .advance(state, { throttle: 1 }, DT)
      .find(({ type }) => type === 'jump-transfer');
  }
  assert.equal(transfer?.payload.outcome, 'landed');
  assert.ok(
    Math.abs(state.speed - 190) < 0.1,
    'absorbing downward impact must not scrub forward hover speed',
  );
  const landedAt = state.time;
  for (let tick = 0; tick < 120; tick++) {
    const previousDistance = state.distance;
    runtime.advance(state, { throttle: 1 }, DT);
    assert.equal(runtime.snapshot().mode, 'magnetic');
    assert.ok(
      state.distance > previousDistance,
      'driving continues while settling',
    );
    if (state.time - landedAt >= 0.17)
      assert.equal(runtime.snapshot().landingSettle, null);
  }
});

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
        clearance >= -0.02 &&
          clearance <= (tick < captureTicks ? captureClearance : 0.061),
        `physical capture clears the deck and settles back to hover (tick ${tick}, clearance ${clearance})`,
      );
    }
  }
  const resting = runtime.pose();
  const front =
    resting.position.z +
    projectedHullExtent(resting.quaternion, new T.Vector3(0, 0, 1));
  assert.ok(
    front >= 249.8 && front <= 249.92,
    `throttle returns to the solid wall without crossing it (front ${front})`,
  );
  assert.ok(
    Math.abs(state.speed) < 1,
    'the grounded hull remains blocked by the wall',
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

test('Cindercoil production wall rebound uses shared deck traction and stays supported under throttle', async (t) => {
  const definition = createCindercoilLevel({});
  const track = definition.createTrack();
  const collisionWorld = definition.createCollisionWorld({ track });
  const dynamics = await definition.createDynamics({ track, collisionWorld });
  const runtime = createDeviceRuntime({
    track,
    devices: definition.racing.createDevices(track),
    motion: definition.createRuntime({
      track,
      collisionWorld,
      dynamics,
      playtest: definition.playtests.jump,
      presentation: false,
    }),
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  const state = {
    ...createVehicleState(),
    ...runtime.scenarios['vent-clean'].state,
  };
  runtime.reset({ state, scenario: 'vent-clean' });
  const jump = track.jumps[0],
    frame = track.sample(jump.landingStart + 80);
  runtime.launch(state, {
    jump: jump.id,
    position: frame.position
      .clone()
      .addScaledVector(frame.right, 12.4)
      .addScaledVector(frame.up, 2)
      .toArray(),
    velocity: frame.right
      .clone()
      .multiplyScalar(25)
      .addScaledVector(frame.up, -5)
      .addScaledVector(frame.tangent, 18)
      .toArray(),
    quaternion: frame.quaternion.toArray(),
  });
  const race = createRace(track, { untimed: true });
  race.placeScenario(state.distance);
  const events = [];
  const step = () =>
    advanceSession({
      state,
      runtime,
      dynamics,
      race,
      input: DRIVE,
      dt: DT,
      emit: (event) => events.push(event),
    });
  for (
    let i = 0;
    i < 600 && !events.some(({ type }) => type === 'jump-transfer');
    i++
  )
    step();
  assert.ok(
    events.some(
      ({ type, payload }) =>
        type === 'impact' && /edge-cap|wall/.test(payload.collider),
    ),
  );
  const transfer = events.find(({ type }) => type === 'jump-transfer');
  assert.equal(transfer?.payload.outcome, 'landed');
  assert.equal(transfer.payload.edgeCaught, true);
  for (let i = 0; i < 100; i++) {
    step();
    assert.equal(
      runtime.snapshot().motion.flight.mode,
      'magnetic',
      'rebound must not throw the craft off the supported road again',
    );
  }
  assert.equal(events.filter(({ type }) => type === 'jump-transfer').length, 1);
});

test('Cindercoil forgiving contacts recover steered barriers and inverted deck landings while rejecting undersides', async (t) => {
  const definition = createCindercoilLevel({});
  const track = definition.createTrack();
  const collisionWorld = definition.createCollisionWorld({ track });
  const dynamics = await definition.createDynamics({ track, collisionWorld });
  const runtime = createDeviceRuntime({
    track,
    devices: definition.racing.createDevices(track),
    motion: definition.createRuntime({
      track,
      collisionWorld,
      dynamics,
      playtest: definition.playtests.jump,
      presentation: false,
    }),
  });
  t.after(() => {
    runtime.dispose();
    dynamics.dispose();
    collisionWorld.dispose();
  });
  const jump = track.jumps[0];
  const cases = [
    {
      id: 'left barrier / mild outward steering',
      scenario: 'vent-edge-left',
      steer: 0.35,
      wall: true,
    },
    {
      id: 'right barrier / mild outward steering',
      scenario: 'vent-edge-right',
      steer: -0.35,
      wall: true,
    },
    { id: 'ordinary clean crossing', scenario: 'vent-clean' },
    {
      id: 'inverted deck landing',
      height: 6,
      velocity: [0, -22, 45],
      inverted: true,
    },
    {
      id: 'keel underside',
      height: -13,
      velocity: [0, 32, 10],
      underside: true,
    },
  ];
  for (const entry of cases) {
    await t.test(entry.id, () => {
      dynamics.reset();
      const scenario = entry.scenario ?? 'vent-clean';
      const state = {
        ...createVehicleState(),
        ...runtime.scenarios[scenario].state,
      };
      runtime.reset({ state, scenario });
      if (!entry.scenario) {
        const frame = track.sample(jump.landingStart + 80);
        const quaternion = frame.quaternion.clone();
        if (entry.inverted)
          quaternion.multiply(
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(0, 0, 1),
              Math.PI,
            ),
          );
        runtime.launch(state, {
          jump: jump.id,
          position: frame.position
            .clone()
            .addScaledVector(frame.up, entry.height)
            .toArray(),
          velocity: frame.right
            .clone()
            .multiplyScalar(entry.velocity[0])
            .addScaledVector(frame.up, entry.velocity[1])
            .addScaledVector(frame.tangent, entry.velocity[2])
            .toArray(),
          quaternion: quaternion.toArray(),
        });
      }
      const race = createRace(track, { untimed: true });
      race.placeScenario(state.distance);
      const events = [];
      const step = (control) =>
        advanceSession({
          state,
          runtime,
          dynamics,
          race,
          input: control,
          dt: DT,
          emit: (event) => events.push(event),
        });
      for (
        let i = 0;
        i < 720 && !events.some(({ type }) => type === 'jump-transfer');
        i++
      )
        step({ ...COAST, steer: entry.steer ?? 0 });
      if (entry.underside) {
        assert.ok(
          events.some(
            ({ type, payload }) =>
              type === 'impact' &&
              payload.collider === 'deep-beveled-ceramic-box-keel',
          ),
        );
        assert.ok(!events.some(({ type }) => type === 'jump-transfer'));
        assert.equal(runtime.snapshot().motion.flight.mode, 'recovery');
        return;
      }
      const transfer = events.find(({ type }) => type === 'jump-transfer');
      assert.equal(transfer?.payload.outcome, 'landed');
      assert.ok(
        !events.some(({ type }) => type === 'jump-miss'),
        'supported return should keep driving without a crash/recovery transition',
      );
      if (entry.wall) {
        assert.ok(
          events.some(
            ({ type, payload }) =>
              type === 'impact' &&
              /edge-cap|wall/.test(payload.collider) &&
              payload.response === 'deflection',
          ),
        );
        assert.equal(transfer.payload.edgeCaught, true);
      }
      const landedDistance = state.distance;
      const collisionHull = getCollisionHull(state.chassisId ?? state.shipId);
      const settledClearance = VEHICLE_HULL.hover + collisionHull.bounds.min[1];
      for (let i = 0; i < 100; i++) {
        step(DRIVE);
        assert.equal(runtime.snapshot().motion.flight.mode, 'magnetic');
        const pose = runtime.pose();
        if (pose) {
          const frame = track.sample(state.distance);
          let clearance = Infinity;
          for (
            let vertex = 0;
            vertex < collisionHull.vertices.length;
            vertex += 3
          ) {
            const point = new T.Vector3()
              .fromArray(collisionHull.vertices, vertex)
              .applyQuaternion(pose.quaternion)
              .add(pose.position);
            clearance = Math.min(
              clearance,
              point.sub(frame.position).dot(frame.up),
            );
          }
          assert.ok(
            clearance >= -0.02 &&
              clearance <=
                settledClearance +
                  (i < captureTicks ? captureClearance : 0.061),
            `actual chassis clears the deck and settles back to hover (tick ${i}, clearance ${clearance})`,
          );
          if (i >= captureTicks)
            assert.ok(
              clearance >= settledClearance - 0.061,
              'the chassis returns to its authored hover clearance',
            );
        }
      }
      assert.ok(state.distance > landedDistance + 5);
      assert.equal(
        events.filter(({ type }) => type === 'jump-transfer').length,
        1,
      );
    });
  }
});

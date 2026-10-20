import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createFlightModel } from '../src/physics/flight.js';
import { landingZoneEnd } from '../src/physics/landing-zone.js';
import { createVehicleState } from '../src/physics/index.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createRace } from '../src/race/index.js';
import createCindercoil from '../src/levels/cindercoil/index.js';

const DT = 1 / 120;
const jump = {
  id: 'gap',
  takeoff: 100,
  landingStart: 200,
  landingEnd: 250,
  recovery: 260,
  halfWidth: 15,
};
const track = {
  length: 1000,
  width: 30,
  jumps: [jump],
  checkpoints: [0, 200, 300, 700].map((distance) => ({ distance })),
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    quaternion: new T.Quaternion(),
    tangent: new T.Vector3(0, 0, 1),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    curvature: 0,
    bank: 0,
  }),
};

async function fixture(t, engine, setup, deckStation = [200, 600]) {
  const world =
    engine === 'sampled'
      ? null
      : createCollisionWorld({
          id: 'runout',
          version: 1,
          geometryId: 'deck',
          triangles: [
            [
              [-15, 0, 200],
              [-15, 0, 600],
              [15, 0, 200],
            ],
            [
              [-15, 0, 600],
              [15, 0, 600],
              [15, 0, 200],
            ],
          ].map((points) => ({
            id: 'deck',
            kind: 'deck',
            start: deckStation[0],
            end: deckStation[1],
            points,
          })),
        });
  const dynamics =
    engine === 'rapier'
      ? await createRapierWorld({ collisionWorld: world })
      : null;
  const runtime = createFlightModel().createRuntime(
    { track, collisionWorld: world, dynamics },
    { id: 'runout', version: 1, rulesId: 'runout', testLaunch: true },
  );
  const state = createVehicleState();
  runtime.launch(state, { jump: jump.id, ...setup });
  const race = createRace(track);
  race.placeScenario(state.distance);
  race.valid = true;
  t.after(() => {
    runtime.dispose();
    dynamics?.dispose();
    world?.dispose();
  });
  const events = [];
  function step(ticks) {
    for (let i = 0; i < ticks; i++) {
      const previous = state.distance;
      const next = runtime.advance(state, {}, DT);
      events.push(...next);
      race.step(previous, state.distance, DT, next);
      if (next.some(({ type }) => type === 'jump-transfer')) break;
    }
  }
  return { state, runtime, race, events, step };
}

for (const engine of ['sampled', 'collision', 'rapier']) {
  test(`${engine}: overshoot stays airborne until real touchdown and credits the runout checkpoint`, async (t) => {
    const f = await fixture(t, engine, {
      position: [0, 30, 240],
      velocity: [0, -5, 100],
    });
    f.step(36);
    assert.ok(f.runtime.pose().position.z > jump.landingEnd + 18);
    assert.ok(f.runtime.pose().position.y > 20, 'no magnetic pull to the road');
    assert.equal(f.runtime.snapshot().mode, 'flight');
    assert.equal(
      f.state.distance,
      jump.takeoff,
      'progress waits for touchdown',
    );
    assert.deepEqual(f.events, []);
    f.step(300);
    assert.equal(
      f.events.find(({ type }) => type === 'jump-transfer')?.payload.outcome,
      'landed',
    );
    assert.ok(f.state.distance > 300 && f.state.distance < 400);
    assert.ok(f.state.speed > 90, 'touchdown preserves forward momentum');
    assert.equal(f.race.checkpoint, 2);
    assert.equal(f.race.valid, true);
    assert.ok(!f.events.some(({ type }) => type === 'jump-miss'));
  });

  test(`${engine}: exceeding the extra runout still triggers recovery`, async (t) => {
    const f = await fixture(t, engine, {
      position: [0, 30, 430],
      velocity: [0, -5, 100],
    });
    f.step(120);
    assert.equal(f.runtime.snapshot().mode, 'recovery');
    assert.equal(
      f.events.find(({ type }) => type === 'jump-miss')?.payload.reason,
      'long',
    );
    assert.ok(!f.events.some(({ type }) => type === 'jump-transfer'));
  });
}

for (const engine of ['collision', 'rapier']) {
  test(`${engine}: another road branch and the underside cannot become a runout landing`, async (t) => {
    for (const [setup, station] of [
      [{ position: [0, 3, 320], velocity: [0, -5, 20] }, [700, 900]],
      [{ position: [0, -3, 320], velocity: [0, 12, 20] }, [200, 600]],
    ]) {
      const f = await fixture(t, engine, setup, station);
      f.step(100);
      assert.ok(f.events.some(({ type }) => type === 'jump-miss'));
      assert.ok(!f.events.some(({ type }) => type === 'jump-transfer'));
    }
  });
}

test('runout stops at another jump or finish and cannot credit a transfer beyond it', () => {
  for (const [variant, end] of [
    [{ ...track, jumps: [jump, { takeoff: 340 }] }, 340],
    [{ ...track, finishDistance: 360 }, 360],
    [{ ...track, length: 380 }, 380],
  ]) {
    assert.equal(landingZoneEnd(variant, jump), end);
    const race = createRace(variant);
    race.placeScenario(jump.takeoff);
    race.valid = true;
    race.step(jump.takeoff, end + 1, DT, [
      {
        type: 'jump-transfer',
        payload: {
          id: jump.id,
          from: jump.takeoff,
          to: end + 1,
          outcome: 'landed',
        },
      },
    ]);
    assert.equal(race.valid, false);
  }
});

test('Cindercoil boosted production flights land past the apron without the recovery camera', async (t) => {
  const level = createCindercoil({});
  const course = level.createTrack();
  const world = level.createCollisionWorld({ track: course });
  const dynamics = await level.createDynamics({
    track: course,
    collisionWorld: world,
  });
  t.after(() => {
    dynamics.dispose();
    world.dispose();
  });
  const vent = course.jumps[0];
  for (const [speed, time] of [
    [130, 3],
    [150, 3],
    [130, 7],
    [150, 7],
    [170, 7],
  ]) {
    const runtime = level.createRuntime({
      track: course,
      collisionWorld: world,
      dynamics,
      presentation: false,
    });
    const state = {
      ...createVehicleState(),
      distance: vent.takeoff - 0.01,
      speed,
      time,
    };
    runtime.reset({ state });
    const race = createRace(course);
    race.placeScenario(state.distance);
    race.valid = true;
    const events = [];
    let transfer;
    for (let tick = 0; tick < 600 && !transfer; tick++) {
      const previous = state.distance;
      const next = runtime.advance(state, { throttle: 1, boost: true }, DT);
      race.step(previous, state.distance, DT, next);
      events.push(...next);
      transfer = next.find(({ type }) => type === 'jump-transfer');
      assert.equal(
        runtime.pose()?.recovering ?? false,
        false,
        `${speed}/${time}`,
      );
    }
    assert.equal(transfer?.payload.outcome, 'landed', `${speed}/${time}`);
    assert.ok(
      state.distance > vent.landingEnd &&
        state.distance < vent.landingEnd + 150,
    );
    assert.ok(!events.some(({ type }) => type === 'jump-miss'));
    assert.ok(state.speed > 80);
    assert.equal(race.valid, true);
    assert.equal(
      race.checkpoint,
      course.checkpoints.findLastIndex(
        ({ distance }) => distance <= state.distance,
      ),
    );
    runtime.dispose();
    dynamics.reset();
  }
});

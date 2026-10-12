import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFlightModel } from '../src/physics/flight.js';
import { createVehicleState } from '../src/physics/index.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { SHIPS } from '../src/ships/catalog.js';

const DT = 1 / 120;
const BOOST = { throttle: 1, boost: true };
const track = {
  id: 'air-boost',
  length: 2000,
  width: 40,
  checkpoints: [0, 200, 1000].map((distance) => ({ distance })),
  jumps: [
    {
      id: 'gap',
      takeoff: 100,
      landingStart: 200,
      landingEnd: 900,
      recovery: 920,
      halfWidth: 20,
    },
  ],
  sample: (distance) => ({
    position: new THREE.Vector3(0, 0, distance),
    quaternion: new THREE.Quaternion(),
    tangent: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    curvature: 0,
    bank: 0,
  }),
};

async function fixture(t, solver, shipId = 'kestrel') {
  const collisionWorld =
    solver === 'rapier'
      ? createCollisionWorld({
          id: 'air-boost',
          version: 1,
          geometryId: 'receiving-deck',
          triangles: [
            {
              id: 'deck',
              kind: 'deck',
              start: 200,
              end: 900,
              points: [
                [-20, 0, 200],
                [-20, 0, 900],
                [20, 0, 200],
              ],
            },
            {
              id: 'deck',
              kind: 'deck',
              start: 200,
              end: 900,
              points: [
                [-20, 0, 900],
                [20, 0, 900],
                [20, 0, 200],
              ],
            },
          ],
        })
      : null;
  const dynamics = collisionWorld
    ? await createRapierWorld({ collisionWorld })
    : null;
  const runtime = createFlightModel().createRuntime(
    { track, collisionWorld, dynamics },
    { id: 'air-boost', version: 1, rulesId: 'air-boost', testLaunch: true },
  );
  const state = createVehicleState(shipId);
  runtime.launch(state, {
    jump: 'gap',
    position: [0, 100, 100],
    velocity: [0, 0, 150],
  });
  t.after(() => {
    runtime.dispose();
    dynamics?.dispose();
    collisionWorld?.dispose();
  });
  const step = (input, ticks = 1) => {
    const events = [];
    for (let i = 0; i < ticks; i++)
      events.push(...runtime.advance(state, input, DT));
    return events;
  };
  return { state, runtime, step };
}

for (const solver of ['ballistic', 'rapier']) {
  test(`${solver}: every ship can engage boost midair, spend reserve and release without losing momentum`, async (t) => {
    for (const ship of SHIPS) {
      const boosted = await fixture(t, solver, ship.id);
      const coast = await fixture(t, solver, ship.id);
      boosted.step({}, 30);
      coast.step({}, 30);
      assert.equal(boosted.state.boosting, false);
      const events = boosted.step(BOOST, 60);
      coast.step({}, 60);
      assert.deepEqual(events, [{ type: 'boost', payload: { active: true } }]);
      assert.equal(boosted.runtime.snapshot().mode, 'flight');
      assert.ok(
        boosted.state.speed > coast.state.speed + 7,
        `${ship.id} gains actual speed`,
      );
      assert.ok(
        boosted.runtime.pose().position.z >
          coast.runtime.pose().position.z + 1.5,
      );
      assert.ok(
        Math.abs(
          boosted.state.energy - (100 - ship.handling.boostDrain * 0.5),
        ) < 1e-8,
      );
      const before = boosted.runtime.snapshot().flight.velocity;
      const released = boosted.step({ throttle: 1 });
      assert.deepEqual(released, [
        { type: 'boost', payload: { active: false } },
      ]);
      const after = boosted.runtime.snapshot().flight.velocity;
      assert.ok(
        Math.abs(after[2] - before[2]) < 0.001,
        'release preserves forward momentum',
      );
      assert.ok(
        Math.abs(after[1] - before[1] + 26 * DT) < 0.001,
        'gravity continues after release',
      );
    }
  });

  test(`${solver}: airborne boost respects brakes, throttle, depletion and recovery`, async (t) => {
    const { state, runtime, step } = await fixture(t, solver);
    step(BOOST);
    step({ ...BOOST, brake: 1 });
    assert.equal(state.boosting, false);
    step({ boost: true });
    assert.equal(
      state.boosting,
      false,
      'boost requires throttle just as on the road',
    );
    state.energy = 12;
    step(BOOST);
    assert.equal(
      state.boosting,
      false,
      'starting boost requires more than 12% reserve',
    );
    state.energy = 1;
    state.boosting = true;
    const events = step(BOOST, 60);
    assert.deepEqual(events, [{ type: 'boost', payload: { active: false } }]);
    assert.ok(
      state.energy > 0 && state.energy < 3,
      'empty held boost recharges without chattering',
    );
    state.energy = 80;
    step(BOOST);
    const recovery = runtime.snapshot();
    recovery.mode = 'recovery';
    recovery.flight.remaining = 1;
    runtime.restore(recovery);
    const energy = state.energy;
    const stopped = step(BOOST);
    assert.deepEqual(stopped, [{ type: 'boost', payload: { active: false } }]);
    assert.ok(
      state.energy > energy,
      'recovery recharges instead of spending boost',
    );
  });

  test(`${solver}: held boost stays active across a real takeoff and deck landing`, async (t) => {
    const { state, runtime, step } = await fixture(t, solver);
    runtime.reset();
    Object.assign(state, {
      distance: 99.5,
      speed: 100,
      energy: 10,
      boosting: true,
    });
    const events = step(BOOST);
    assert.ok(events.some(({ type }) => type === 'jump-launch'));
    assert.ok(
      !events.some(({ type }) => type === 'boost'),
      'the lip must not switch boost off and back on',
    );
    assert.equal(
      state.boosting,
      true,
      'an active low-reserve boost survives takeoff',
    );
    runtime.launch(state, {
      jump: 'gap',
      position: [0, 2, 300],
      velocity: [0, -4, 140],
    });
    const landingEvents = [];
    for (let i = 0; i < 60; i++) {
      landingEvents.push(...step(BOOST));
      if (runtime.snapshot().mode === 'magnetic') break;
    }
    assert.ok(
      landingEvents.some(
        ({ type, payload }) =>
          type === 'jump-transfer' && payload.outcome === 'landed',
      ),
    );
    assert.ok(
      !landingEvents.some(({ type }) => type === 'boost'),
      'deck capture must not drop active boost',
    );
    assert.equal(state.boosting, true);
    assert.equal(
      step(BOOST).filter(({ type }) => type === 'boost').length,
      0,
      'grounded driving keeps the same boost',
    );
  });
}

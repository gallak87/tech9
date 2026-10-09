import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createFlightModel } from '../src/physics/flight.js';
import { createVehicleState } from '../src/physics/index.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';

const DT = 1 / 120;
const model = createFlightModel();
const jump = {
  id: 'transfer',
  takeoff: 100,
  landingStart: 200,
  landingEnd: 500,
  recovery: 550,
  halfWidth: 10,
};
const track = {
  id: 'recovery-grace',
  length: 1000,
  width: 20,
  jumps: [jump],
  checkpoints: [{ distance: 0 }, { distance: 200 }, { distance: 700 }],
  sample(distance) {
    return {
      position: new T.Vector3(0, 0, distance),
      quaternion: new T.Quaternion(),
      tangent: new T.Vector3(0, 0, 1),
      right: new T.Vector3(1, 0, 0),
      up: new T.Vector3(0, 1, 0),
      curvature: 0,
      bank: 0,
    };
  },
};

async function fixture(t, engine, { boundary = true, manual = false } = {}) {
  const rail = new T.BoxGeometry(0.6, 3, 300);
  const world = createCollisionWorld({
    id: 'recovery-grace',
    version: 1,
    geometryId: `grace-${boundary}`,
    triangles: [
      {
        id: 'deck',
        kind: 'deck',
        start: 200,
        end: 500,
        points: [
          [-10, 0, 200],
          [-10, 0, 500],
          [10, 0, 200],
        ],
      },
      {
        id: 'deck',
        kind: 'deck',
        start: 200,
        end: 500,
        points: [
          [-10, 0, 500],
          [10, 0, 500],
          [10, 0, 200],
        ],
      },
      ...indexedTriangles(
        rail.attributes.position.array,
        rail.index.array,
        {
          id: 'rail',
          kind: 'rail',
          roadBoundary: boundary,
          start: 200,
          end: 500,
        },
        new T.Matrix4().makeTranslation(10, 1.5, 350),
      ),
    ],
  });
  rail.dispose();
  const dynamics =
    engine === 'rapier'
      ? await createRapierWorld({ collisionWorld: world })
      : null;
  const runtime = model.createRuntime(
    { track, collisionWorld: world, dynamics, playtest: manual ? {} : null },
    {
      id: 'recovery-grace',
      version: 1,
      rulesId: 'fixture',
      forgivingContacts: true,
    },
  );
  const state = { ...createVehicleState(), distance: 99.8, speed: 100 };
  runtime.advance(state, {}, DT);
  const snapshot = runtime.snapshot();
  snapshot.mode = 'recovery';
  snapshot.currentPose = snapshot.previousPose = {
    position: [7.44, 2, 300],
    quaternion: [0, 0, 0, 1],
  };
  Object.assign(snapshot.flight, {
    velocity: [30, 0, 30],
    elapsed: 1.9,
    remaining: DT / 2,
    lastImpactAt: -1,
    ...(dynamics ? { angularVelocity: [0, 0, 0], dynamicsStarted: true } : {}),
    ...(manual ? { remaining: 0, manualRecovery: true } : {}),
  });
  runtime.restore(snapshot);
  t.after(() => {
    runtime.dispose();
    dynamics?.dispose();
    world.dispose();
  });
  return { runtime, state, dynamics };
}

for (const engine of ['swept', 'rapier']) {
  test(`${engine}: a last-tick inward rail bounce gets time to land instead of teleporting`, async (t) => {
    const { runtime, state, dynamics } = await fixture(t, engine);
    const events = runtime.advance(state, {}, DT);
    assert.equal(runtime.snapshot().mode, 'recovery');
    assert.ok(runtime.snapshot().flight.remaining > 1.4);
    assert.ok(
      runtime.snapshot().flight.velocity[0] < 0,
      'rail sends the ship inward',
    );
    assert.ok(!events.some(({ type }) => type === 'jump-transfer'));
    const saved = {
      vehicle: { ...state },
      motion: runtime.snapshot(),
      engine: dynamics?.snapshot(),
    };
    const finish = () => {
      const output = [];
      for (
        let tick = 0;
        tick < 180 && runtime.snapshot().mode !== 'magnetic';
        tick++
      )
        output.push(...runtime.advance(state, {}, DT));
      return { output, state: { ...state }, motion: runtime.snapshot() };
    };
    const expected = finish();
    const transfers = expected.output.filter(
      ({ type }) => type === 'jump-transfer',
    );
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0].payload.outcome, 'landed');
    assert.equal(transfers[0].payload.tractionRestored, true);
    assert.ok(
      state.distance >= jump.landingStart && state.distance < jump.landingEnd,
    );
    Object.assign(state, saved.vehicle);
    runtime.restore(saved.motion);
    if (dynamics) dynamics.restore(saved.engine);
    assert.deepEqual(
      finish(),
      expected,
      'the extended timer restores deterministically',
    );
  });

  test(`${engine}: recovery grace cannot be renewed by another rail contact`, async (t) => {
    const { runtime, state } = await fixture(t, engine);
    const before = runtime.snapshot();
    runtime.advance(state, {}, DT);
    assert.ok(runtime.snapshot().flight.remaining > 1.4);
    // Keep the consumed grace in a restored snapshot, then reproduce the
    // same physical contact at the end of the new window.
    const repeated = runtime.snapshot();
    repeated.currentPose = before.currentPose;
    repeated.previousPose = before.previousPose;
    Object.assign(repeated.flight, {
      velocity: before.flight.velocity,
      remaining: DT / 2,
      ...(engine === 'rapier' ? { angularVelocity: [0, 0, 0] } : {}),
    });
    runtime.restore(repeated);
    const events = runtime.advance(state, {}, DT);
    assert.equal(
      events.find(({ type }) => type === 'jump-transfer')?.payload.outcome,
      'recovered',
    );
  });

  test(`${engine}: being above the road, unmarked obstacles and undersides do not extend recovery`, async (t) => {
    for (const scenario of ['above', 'unmarked', 'underside', 'resting']) {
      await t.test(scenario, async (t) => {
        const { runtime, state } = await fixture(t, engine, {
          boundary: scenario !== 'unmarked',
        });
        if (scenario !== 'unmarked') {
          const saved = runtime.snapshot();
          const position =
            scenario === 'above'
              ? [0, 8, 300]
              : scenario === 'underside'
                ? [7.44, -0.73, 300]
                : [7.45, 2, 300];
          saved.currentPose = saved.previousPose = {
            position,
            quaternion: [0, 0, 0, 1],
          };
          saved.flight.velocity =
            scenario === 'underside' ? [0, 30, 0] : [0, 0, 0];
          runtime.restore(saved);
        }
        const events = runtime.advance(state, {}, DT);
        assert.equal(
          events.find(({ type }) => type === 'jump-transfer')?.payload.outcome,
          'recovered',
        );
      });
    }
  });

  test(`${engine}: manual contact playtests keep automatic recovery disabled`, async (t) => {
    const { runtime, state } = await fixture(t, engine, { manual: true });
    runtime.advance(state, {}, DT);
    assert.equal(runtime.snapshot().mode, 'recovery');
    assert.equal(runtime.snapshot().flight.remaining, 0);
  });
}

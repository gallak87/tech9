import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createCombatSimulation } from '../src/pickups/combat.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import {
  createMagneticRuntime,
  advanceSession,
} from '../src/core/session-runtime.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';

const track = {
  id: 'combat-road',
  length: 2000,
  width: 28,
  closed: false,
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    quaternion: new T.Quaternion(),
    tangent: new T.Vector3(0, 0, 1),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    curvature: 0,
  }),
};
for (const shield of [false, true])
  test('shared physical pulse, shield=' + shield, async (t) => {
    const dynamics = await createRapierWorld({
      collisionWorld: withMagneticBoundaries(track),
    });
    t.after(() => dynamics.dispose());
    const combat = createCombatSimulation({ track });
    const devices = [
      {
        id: 'pulse',
        type: 'repulsor',
        distance: 100,
        lateral: 0,
        width: 5,
        length: 10,
      },
      ...(shield
        ? [
            {
              id: 'shield',
              type: 'aegis',
              distance: 130,
              lateral: 3,
              width: 5,
              length: 8,
            },
          ]
        : []),
    ];
    const make = (combatId) =>
      createDeviceRuntime({
        track,
        devices,
        combat,
        combatId,
        motion: createMagneticRuntime({ track, dynamics }),
      });
    const runtime = make('player'),
      rival = make('rival');
    const state = { ...createVehicleState(), distance: 90, speed: 100 };
    const other = {
      ...createVehicleState(),
      distance: 112,
      lateral: 3,
      speed: 100,
    };
    runtime.reset({ state });
    rival.reset({ state: other });
    const race = { runoutControl: (_s, input) => input, step: () => [] };
    const racers = {
      enabled: true,
      beginAdvance: (dt) => rival.beginAdvance(other, { throttle: 1 }, dt),
      finishAdvance: () => rival.finishAdvance(other),
    };
    const tick = () =>
      advanceSession({
        state,
        input: { throttle: 1 },
        dt: 1 / 120,
        runtime,
        race,
        dynamics,
        racers,
        emit() {},
      });
    for (let i = 0; i < 30; i++) tick();
    const saved = {
      state: structuredClone(state),
      other: structuredClone(other),
      runtime: runtime.snapshot(),
      rival: rival.snapshot(),
      dynamics: dynamics.snapshot(),
    };
    for (let i = 0; i < 52; i++) tick();
    const expected = {
      state: structuredClone(state),
      other: structuredClone(other),
      combat: combat.snapshot(),
    };
    if (shield) {
      assert.equal(rival.snapshot().aegisRemaining, 0);
      assert.ok(
        Math.abs(other.lateralSpeed) < 0.1,
        'shield blocks the physical shove',
      );
    } else
      assert.ok(
        other.lateralSpeed > 0.4,
        'shove persists in the actual physics actor',
      );
    Object.assign(state, saved.state);
    Object.assign(other, saved.other);
    runtime.restore(saved.runtime);
    rival.restore(saved.rival);
    dynamics.restore(saved.dynamics);
    for (let i = 0; i < 52; i++) tick();
    assert.deepEqual({ state, other, combat: combat.snapshot() }, expected);
    runtime.setEnabled(false);
    assert.equal(combat.view().wakes.length, 0);
    assert.deepEqual(combat.view().emitters, {});
    assert.deepEqual(runtime.advanceInteractions(0.1), []);
    runtime.dispose();
    rival.dispose();
  });

test('combat occlusion queries stop at static cover and ignore racer proxies', async (t) => {
  const world = await createRapierWorld({
    collisionWorld: {
      id: 'cover',
      version: 1,
      rulesId: 'cover-v1',
      triangles: [
        {
          id: 'wall',
          kind: 'structure',
          points: [
            [-20, -5, 80],
            [20, -5, 80],
            [20, 20, 80],
          ],
        },
        {
          id: 'wall',
          kind: 'structure',
          points: [
            [-20, -5, 80],
            [20, 20, 80],
            [-20, 20, 80],
          ],
        },
      ],
    },
  });
  t.after(() => world.dispose());
  const actor = world.createActor();
  actor.reset({
    active: true,
    pose: { position: new T.Vector3(0, 1, 20), quaternion: new T.Quaternion() },
  });
  world.step(1 / 120);
  assert.ok(
    Math.abs(
      world.occlusionFraction(
        new T.Vector3(0, 1, 0),
        new T.Vector3(0, 1, 100),
      ) - 0.8,
    ) < 0.001,
  );
  assert.equal(
    world.occlusionFraction(new T.Vector3(0, 1, 0), new T.Vector3(0, 1, 50)),
    1,
  );
});

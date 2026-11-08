import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createVehicleState, stepVehicle } from '../src/physics/index.js';
import { createFlightModel } from '../src/physics/flight.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import { sampleHazardSurface } from '../src/physics/hazard-surface.js';
import { SHIPS } from '../src/ships/catalog.js';
import { sampleCrossfeed } from '../src/levels/colossus/mechanics.js';
import createHelion from '../src/levels/helion/index.js';
import createCindercoil from '../src/levels/cindercoil/index.js';
import createSaffron from '../src/levels/saffron/index.js';
import createVesperForest from '../src/levels/vesper-forest/index.js';
import createColossus from '../src/levels/colossus/index.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';
import { sampleSaffronDeposits } from '../src/levels/saffron/track/sand.js';
import {
  runtimeIdentity,
  compatibleRuntime,
} from '../src/core/session-runtime.js';

const DT = 1 / 120;
const drive = { throttle: 1, brake: 0, steer: 0, boost: true, airbrake: false };
const frame = (s) => ({
  position: new T.Vector3(0, 0, s),
  tangent: new T.Vector3(0, 0, 1),
  right: new T.Vector3(1, 0, 0),
  up: new T.Vector3(0, 1, 0),
  quaternion: new T.Quaternion(),
  curvature: 0,
  bank: 0,
});
const flat = {
  id: 'hazard-force-fixture',
  geometryVersion: 'straight-v1',
  width: 40,
  length: 10000,
  checkpoints: [{ distance: 0 }],
  jumps: [],
  sample: frame,
};

// Isolate exposure from banks, rail impacts and machine sideways transport.
// This guards the user's normalized reference without retuning Colossus.
test('full hazard bite matches the established Colossus forward resistance at all speeds', () => {
  const conveyor = {
    length: 1000,
    belts: [{ id: 'reference', start: 0, end: 400, side: 1 }],
  };
  for (const speed of [0, 5, 30, 70, 120, 180]) {
    const reference = sampleCrossfeed(conveyor, 100, 10, 0, speed);
    const response = sampleHazardSurface(speed, 1);
    assert.equal(response.drag, -reference.forwardAcceleration);
    assert.equal(response.thrustScale, reference.thrustScale);
  }
});

for (const physical of [false, true])
  test(`${physical ? 'shared physical' : 'coordinate'} hazards resist every hull under throttle and boost, and leave an escape`, async () => {
    const dynamics = physical ? await createRapierWorld() : null;
    try {
      for (const ship of SHIPS)
        for (const boost of [false, true]) {
          const speeds = [];
          for (const severity of [0, 0.5, 0.75, 1]) {
            let exposure = 1;
            const state = { ...createVehicleState(ship.id), speed: 120 };
            const runtime = createFlightModel().createRuntime(
              { track: flat, dynamics },
              {
                id: 'hazard-force-fixture',
                version: 1,
                rulesId: 'calibration-v1',
                groundOptions: ({ state }) => ({
                  surface: sampleHazardSurface(state.speed, severity, exposure),
                }),
              },
            );
            try {
              runtime.reset({ state });
              for (let i = 0; i < 120; i++)
                runtime.advance(state, { ...drive, boost }, DT);
              speeds.push(state.speed);
              assert.ok(state.speed > 15, 'contact must not trap the ship');
              assert.equal(state.resetCount, 0);
              exposure = 0;
              for (let i = 0; i < 720; i++)
                runtime.advance(state, { ...drive, boost: false }, DT);
              assert.ok(
                state.speed > 85,
                'clear road restores ordinary acceleration',
              );
            } finally {
              runtime.dispose();
            }
          }
          for (const [index, maximum] of [
            [1, 0.75],
            [2, 0.56],
            [3, 0.41],
          ])
            assert.ok(
              speeds[index] < speeds[0] * maximum,
              `${ship.id} boost=${boost}: ${speeds}`,
            );
          assert.ok(
            speeds[0] > speeds[1] &&
              speeds[1] > speeds[2] &&
              speeds[2] > speeds[3],
          );
        }
    } finally {
      dynamics?.dispose();
    }
  });

const definitions = [
  [
    'helion',
    createHelion,
    (track, active) => {
      const zone = track.thermalZones.find(
        (zone) => zone.id === 'radiator-sweep',
      );
      return {
        distance: zone.start + 12,
        lateral: active ? 5.3 : -10,
        time: 5 - zone.phase,
      };
    },
    0.55,
  ],
  [
    'cindercoil',
    createCindercoil,
    (track, active) => {
      const zone = track.surgeZones[0];
      return {
        distance: zone.start + 12,
        lateral: (active ? 1 : -1) * zone.side * 8.5,
        time: 4 - zone.phaseOffset,
      };
    },
    0.6,
  ],
  [
    'saffron',
    createSaffron,
    (track, active) => {
      const zone = sampleSaffronDeposits(track, 0).find(
        (zone) => zone.id === 'amber-drift',
      );
      return {
        distance: zone.start + 20,
        lateral: active ? zone.lateral : -12,
        time: 0,
      };
    },
    0.75,
  ],
  ...[['vesper-forest', createVesperForest]].map(([id, create]) => [
    id,
    create,
    (track, active) => {
      const zone = track.sapZones[1];
      return {
        distance: zone.start + 12,
        lateral: active ? 0 : zone.resinCenter,
        time: 0,
      };
    },
    0.75,
  ]),
];

for (const [id, create, start, maximum] of definitions)
  for (const physical of [false, true])
    test(`${id}: ${physical ? 'shared physical' : 'coordinate'} active and protected lanes, player/rival parity and contact replay`, async () => {
      const level = create({ shape: true });
      // Keep the production samplers, time, dimensions and lateral boundaries;
      // a straight test surface removes corner/rail losses from the measurement.
      const track = {
        ...level.createTrack(),
        sample: frame,
        sampleSurface: undefined,
      };
      const collisionWorld = createCollisionWorld({
        id: `${id}-force-fixture`,
        version: 1,
        geometryId: 'flat',
        triangles: [],
      });
      const dynamics = physical
        ? await createRapierWorld({ collisionWorld })
        : null;
      const outputs = [];
      try {
        for (const active of [false, true]) {
          const runtime = level.racing.createMotion({
            track,
            dynamics,
            collisionWorld,
            presentation: false,
          });
          const state = {
            ...createVehicleState(),
            ...start(track, active),
            speed: 120,
          };
          const control = { ...state };
          const step = () => {
            if (!physical) return runtime.advance(state, drive, DT);
            runtime.beginAdvance(state, drive, DT);
            dynamics.step(DT);
            return runtime.finishAdvance(state);
          };
          try {
            runtime.reset({ state });
            const identity = runtimeIdentity(runtime);
            const player = level.createRuntime({
              track,
              collisionWorld,
              dynamics,
              presentation: false,
            });
            assert.equal(
              compatibleRuntime(player, identity),
              true,
              'player and rival share consequence rules',
            );
            player.dispose();
            assert.equal(
              compatibleRuntime(runtime, {
                ...identity,
                rulesId: 'old-hazard-rules',
              }),
              false,
            );
            for (let i = 0; i < 36; i++) step();
            const saved = {
              state: { ...state },
              runtime: structuredClone(runtime.snapshot()),
              dynamics: dynamics?.snapshot(),
            };
            const continuation = () => {
              const events = [];
              for (let i = 0; i < 84; i++) events.push(...step());
              return {
                state: { ...state },
                runtime: structuredClone(runtime.snapshot()),
                events,
              };
            };
            const expected = continuation();
            Object.assign(state, saved.state);
            runtime.restore(saved.runtime);
            if (physical) dynamics.restore(saved.dynamics);
            assert.deepEqual(continuation(), expected);
            assert.equal(state.resetCount, 0);
            assert.equal(
              expected.events.some((event) => event.type === 'impact'),
              false,
            );
            if (!active && !physical) {
              for (let i = 0; i < 120; i++)
                stepVehicle(control, drive, track, DT);
              assert.deepEqual(
                state,
                control,
                'protected path preserves baseline physics exactly',
              );
            }
            const paused = structuredClone(runtime.snapshot());
            runtime.advance(state, drive, 0);
            assert.deepEqual(runtime.snapshot(), paused);
            outputs.push({ speed: state.speed, energy: state.energy });
          } finally {
            runtime.dispose();
          }
        }
        assert.ok(
          outputs[1].speed < outputs[0].speed * maximum,
          JSON.stringify(outputs),
        );
        assert.ok(outputs[1].speed > 20);
        if (id === 'cindercoil')
          assert.ok(outputs[0].energy - outputs[1].energy >= 17.9);
        else
          assert.ok(
            Math.abs(outputs[0].energy - outputs[1].energy) < 1e-8,
            'sand, sap and fire do not invent reserve damage',
          );
      } finally {
        dynamics?.dispose();
        collisionWorld.dispose();
      }
    });

const poweredHazards = [
  ...definitions,
  [
    'colossus',
    createColossus,
    (track, active) => {
      const belt = track.belts[0];
      return {
        distance: (belt.start + belt.end) / 2,
        lateral: belt.side * (active ? 16 : -24),
        time: 0,
      };
    },
  ],
];
function hazardContact(id, snapshot) {
  if (id === 'helion') return snapshot.contactDuration;
  if (id === 'cindercoil') return snapshot.contactId !== null;
  if (id === 'saffron') return snapshot.saffron.sandExposure;
  if (id === 'vesper-forest') return snapshot.surface.id === 'sap';
  return snapshot.crossfeedContact.contact !== null;
}
for (const [id, create, start] of poweredHazards)
  test(`${id}: powered hops ignore ground hazards from activation through flight and resume contact on touchdown`, async () => {
    const level = create({ shape: true });
    const track = {
      ...level.createTrack(),
      sample: frame,
      sampleSurface: undefined,
    };
    const collisionWorld = createCollisionWorld({
      id: `${id}-powered-hazard-fixture`,
      version: 1,
      geometryId: 'flat',
      triangles: [],
    });
    const dynamics = await createRapierWorld({ collisionWorld });
    const outputs = [];
    try {
      for (const active of [false, true]) {
        const motion = level.racing.createMotion({
          track,
          collisionWorld,
          dynamics,
          presentation: false,
        });
        const runtime = createDeviceRuntime({ track, devices: [], motion });
        const state = {
          ...createVehicleState('kestrel'),
          ...start(track, active),
          speed: 0,
          energy: 60,
          equipment: ['jump'],
        };
        try {
          runtime.reset({ state });
          let airborne = false,
            landed = false;
          const airEnergy = [];
          for (let tick = 0; tick < 300; tick++) {
            runtime.beginAdvance(
              state,
              {
                ...drive,
                throttle: 0,
                boost: false,
                equipment1: tick === 0,
              },
              DT,
            );
            dynamics.step(DT);
            runtime.finishAdvance(state);
            const grounded = runtime.pose(1)?.grounded !== false;
            if (!grounded) {
              airborne = true;
              assert.equal(
                Boolean(hazardContact(id, motion.snapshot())),
                false,
                `airborne contact on tick ${tick}`,
              );
              if (id === 'helion')
                assert.equal(
                  motion.snapshot().heat,
                  0,
                  'takeoff cannot add one final heat tick',
                );
              airEnergy.push(state.energy);
            } else if (airborne) {
              landed = true;
              assert.equal(
                Boolean(hazardContact(id, motion.snapshot())),
                active,
                'contact returns on the supported touchdown tick',
              );
              break;
            }
          }
          assert.ok(
            airborne && landed,
            'the equipment input must launch and physically land',
          );
          runtime.beginAdvance(state, { ...drive, boost: false }, DT);
          dynamics.step(DT);
          runtime.finishAdvance(state);
          outputs.push({ airEnergy, speed: state.speed, energy: state.energy });
        } finally {
          runtime.dispose();
        }
      }
      assert.deepEqual(
        outputs[1].airEnergy,
        outputs[0].airEnergy,
        'ground contact cannot drain reserve in flight',
      );
      assert.ok(
        outputs[1].speed < outputs[0].speed,
        'the first grounded drive step has the normal hazard resistance',
      );
      if (id === 'cindercoil')
        assert.ok(
          outputs[1].energy < outputs[0].energy,
          'lava reserve drain resumes on landing',
        );
    } finally {
      dynamics.dispose();
      collisionWorld.dispose();
    }
  });

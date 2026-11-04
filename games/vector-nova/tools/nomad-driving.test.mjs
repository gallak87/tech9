import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as T from 'three';
import { createCameraRig } from '../src/camera/index.js';
import { NOMAD_CAMERA } from '../src/levels/nomad/camera.js';
import createLevel from '../src/levels/nomad/index.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';
import { getRacerControl } from '../src/race/racers.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';

// Bounded production encounters: every carrier transfer is approached over real
// ground with ordinary thrust/steering and then driven after physical landing.
// No airborne pose placement, target-seeking force, or automated full lap.
let definition, track, devices, collisionWorld, dynamics, crownWorld;
before(async () => {
  definition = createLevel();
  track = definition.createTrack();
  devices = definition.racing.createDevices(track);
  collisionWorld = await definition.createCollisionWorld({ track });
  dynamics = await definition.createDynamics({ track, collisionWorld });
  crownWorld = createCollisionWorld({
    id: 'nomad-receiver-camera-regression',
    version: 1,
    geometryId: collisionWorld.rulesId,
    triangles: collisionWorld.triangles.filter((triangle) =>
      triangle.id.endsWith('/receiving-cargo-crown'),
    ),
  });
  assert.ok(
    crownWorld.triangleCount > 0,
    'the actual retained receiver crown is present',
  );
});
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
  crownWorld?.dispose();
});
const DT = 1 / 120;
const profiles = [
  ...['kestrel', 'shrike', 'bastion', 'needle'].map((shipId) => ({
    shipId,
    mode: 'cruise',
  })),
  { shipId: 'kestrel', mode: 'nominal' },
  { shipId: 'kestrel', mode: 'boost' },
  { shipId: 'needle', mode: 'boost' },
];
const makeMotion = (presentation = true) =>
  definition.createRuntime({ track, collisionWorld, dynamics, presentation });
const makeRuntime = () =>
  createDeviceRuntime({ track, devices, motion: makeMotion() });
const controls = (state, runtime, mode) => ({
  ...getRacerControl(state, track, {
    lane: 0,
    difficulty: 'hard',
    devices,
    runtime,
  }),
  ...(mode === 'boost' ? {} : { throttle: 1, brake: 0, boost: false }),
});

test('rejected Nomad reset and delegated restore preserve snapshots and presentation clocks', () => {
  const runtime = makeMotion();
  const state = {
    ...createVehicleState(),
    ...track.scenarios['cargo-entry'],
    time: 9,
  };
  try {
    dynamics.reset();
    runtime.reset({ state });
    runtime.advance(state, controls(state, runtime, 'cruise'), DT);
    runtime.pose(0.25);
    const snapshot = () => ({
      motion: structuredClone(runtime.snapshot()),
      world: dynamics.snapshot(),
      presentationTime: track.presentationTime,
    });
    const before = snapshot();
    for (const time of [NaN, Infinity, -1]) {
      assert.throws(
        () => runtime.reset({ state: { ...state, time } }),
        /reset time/,
      );
      assert.deepEqual(
        snapshot(),
        before,
        'rejected reset cannot change any carrier clock or actor',
      );
    }
    for (const motion of [
      { ...before.motion.motion, mode: 'invalid' },
      { ...before.motion.motion, flight: { id: 'unknown-jump' } },
    ]) {
      assert.throws(() =>
        runtime.restore({
          ...before.motion,
          time: 30,
          previousTime: 29,
          motion,
        }),
      );
      assert.deepEqual(
        snapshot(),
        before,
        'delegated rejection restores the exact interpolated presentation clock',
      );
    }
    runtime.reset();
    assert.equal(
      runtime.snapshot().time,
      0,
      'reset without a state retains its original zero-clock default',
    );
    assert.equal(track.presentationTime, 0);
  } finally {
    runtime.dispose();
  }
});

test('rejected Nomad native intervals preserve group poses and velocities before placement', () => {
  dynamics.reset();
  dynamics.setNomadTime(9);
  dynamics.step(DT);
  const before = dynamics.snapshot();
  for (const interval of [undefined, NaN, Infinity, 0, -DT, 0.100001]) {
    assert.throws(() => dynamics.step(interval), /finite fixed-step duration/);
    assert.deepEqual(
      dynamics.snapshot(),
      before,
      'rejected intervals cannot rewrite collision group velocity',
    );
  }
  dynamics.step(0.1);
  const after = dynamics.snapshot();
  assert.ok(
    Math.abs(after.convoyTime - before.convoyTime - 0.1) < 1e-12,
    'the native accepted maximum remains available',
  );
  for (const carrier of track.carriers) {
    const group = after.world.motionGroups.find(
      (entry) => entry.id === carrier.id,
    );
    const expected = track.motionAt(
      carrier.start + 0.1,
      after.convoyTime,
    ).translation;
    assert.ok(
      Math.hypot(
        group.translation.x - expected.x,
        group.translation.y - expected.y,
        group.translation.z - expected.z,
      ) < 1e-8,
      'valid placement still integrates exact analytic endpoints',
    );
  }
});

for (let index = 0; index < 10; index++)
  test(`production moving transfer ${index + 1}: four motion phases, fleet cruise and fast approaches`, () => {
    const jump = track.jumps[index];
    assert.ok(jump, 'the complete authored convoy transfer exists');
    const carrier = track.carriers.find(
      (entry) => entry.id === jump.receivingCarrierId,
    );
    const failures = [];
    let cruiseStandout = 0;
    for (const quarter of [0, 1, 2, 3])
      for (const profile of profiles) {
        const context = `${jump.id}/phase${quarter}/${profile.shipId}/${profile.mode}`;
        const runtime = makeRuntime();
        try {
          dynamics.reset();
          const pace = getVehiclePace(profile.shipId, track.pace);
          const state = {
            ...createVehicleState(profile.shipId),
            distance: jump.takeoff - 250,
            speed:
              profile.mode === 'nominal'
                ? jump.targetSpeed
                : profile.mode === 'boost'
                  ? pace.boostSpeed
                  : pace.cruiseSpeed,
            time: (quarter * carrier.motion.period) / 4,
          };
          runtime.reset({ state });
          assert.equal(
            runtime.pose(1).grounded,
            true,
            `${context}: real grounded approach`,
          );
          let launchTime = null,
            launchSpeed = null,
            landingTime = null,
            landingDistance = null;
          const camera = jump.hero
            ? new T.PerspectiveCamera(61, 16 / 9, 0.1, 40000)
            : null;
          const hull = getCollisionHull(profile.shipId);
          const subject = new T.Group();
          const rig =
            camera &&
            createCameraRig(
              camera,
              NOMAD_CAMERA,
              new T.Box3(
                new T.Vector3().fromArray(hull.bounds.min),
                new T.Vector3().fromArray(hull.bounds.max),
              ),
            );
          let previousEye = null;
          for (let tick = 0; tick < 1500; tick++) {
            const events = runtime.advance(
              state,
              controls(state, runtime, profile.mode),
              DT,
            );
            if (events.some((event) => event.type === 'jump-launch')) {
              launchTime = state.time;
              launchSpeed = state.speed;
            }
            const transfer = events.find(
              (event) => event.type === 'jump-transfer',
            );
            const pose = runtime.pose(1);
            if (rig) {
              subject.position.copy(pose.position);
              subject.quaternion.copy(pose.quaternion);
              rig.update(track, state, DT, {
                worldPose: pose,
                subject,
                reducedMotion: false,
              });
              // The real native hull already proves ship clearance. Reuse its
              // actual path to prove the production eye and sightline clear the
              // moving crown, expressed in the crown's nominal rigid frame.
              const offset = track.motionAt(
                jump.landingStart,
                state.time,
              ).translation;
              const eye = {
                position: camera.position.clone().sub(offset),
                quaternion: camera.quaternion.clone(),
              };
              const craft = {
                position: pose.position.clone().sub(offset),
                quaternion: pose.quaternion,
              };
              if (previousEye)
                assert.equal(
                  crownWorld.sweepHull(previousEye, eye, {
                    halfWidth: 3,
                    hover: 3,
                    halfLength: 3,
                  }),
                  null,
                  `${context}: continuous 3 m crown eye clearance`,
                );
              assert.equal(
                crownWorld.sweepHull(eye, craft, {
                  halfWidth: 0.25,
                  hover: 0.25,
                  halfLength: 0.25,
                }),
                null,
                `${context}: crown cannot hide the craft`,
              );
              previousEye = eye;
            }
            assert.ok(
              pose.position.toArray().every(Number.isFinite),
              `${context}: finite native hull`,
            );
            assert.ok(
              !events.some((event) =>
                ['jump-miss', 'road-departure', 'road-recovery'].includes(
                  event.type,
                ),
              ),
              `${context}: ${JSON.stringify(events)}`,
            );
            if (transfer) {
              assert.equal(transfer.payload.id, jump.id, context);
              assert.equal(transfer.payload.outcome, 'landed', context);
              landingTime = state.time;
              landingDistance = state.distance;
              break;
            }
          }
          assert.ok(
            launchTime !== null && landingTime !== null,
            `${context}: crossed the lip and intercepted its moving receiver`,
          );
          assert.ok(
            landingTime - launchTime > (jump.bigAir ? 3 : 0.5) &&
              landingTime - launchTime < (jump.bigAir ? 7 : 4),
            `${context}: actual bounded ballistic flight`,
          );
          if (
            profile.mode === 'cruise' &&
            launchSpeed >= pace.cruiseSpeed * 0.9
          )
            cruiseStandout = Math.max(cruiseStandout, landingTime - launchTime);
          for (let tick = 0; tick < 120; tick++) {
            const events = runtime.advance(
              state,
              controls(state, runtime, profile.mode),
              DT,
            );
            assert.equal(
              runtime.pose(1).grounded,
              true,
              `${context}: immediate native traction`,
            );
            assert.ok(
              !events.some((event) =>
                ['road-departure', 'road-recovery', 'jump-miss'].includes(
                  event.type,
                ),
              ),
              context,
            );
          }
          assert.ok(
            state.distance > landingDistance + 40,
            `${context}: useful driven receiver runway`,
          );
          assert.ok(state.speed > 30, `${context}: supported racing continues`);
        } catch (error) {
          failures.push({ context, message: error.message });
        } finally {
          runtime.dispose();
        }
      }
    assert.deepEqual(failures, []);
    if (jump.hero)
      assert.ok(
        cruiseStandout >= 5,
        `a production cruise ship has at least five seconds of actual hero flight (${cruiseStandout})`,
      );
  });

test('every complete supported carrier road is drivable, including four phases of each roof catch and Saltwind', () => {
  for (const carrier of track.carriers)
    for (const quarter of carrier.mode === 'roof' ||
    carrier.id === 'nomad-saltwind'
      ? [0, 1, 2, 3]
      : [0]) {
      const context = `${carrier.id}/phase${quarter}`;
      const runtime = makeRuntime();
      try {
        dynamics.reset();
        const state = {
          ...createVehicleState(),
          distance: Math.max(0, carrier.start) + 30,
          speed: getVehiclePace('kestrel', track.pace).cruiseSpeed,
          time: (quarter * carrier.motion.period) / 4,
        };
        runtime.reset({ state });
        const target = carrier.end - 12;
        for (let tick = 0; tick < 2400 && state.distance < target; tick++) {
          const events = runtime.advance(
            state,
            getRacerControl(state, track, {
              lane: 0,
              difficulty: 'hard',
              devices,
              runtime,
            }),
            DT,
          );
          assert.equal(
            runtime.pose(1).grounded,
            true,
            `${context}: continuous physical road support`,
          );
          assert.ok(
            !events.some((event) =>
              [
                'impact',
                'jump-launch',
                'jump-miss',
                'road-departure',
                'road-recovery',
              ].includes(event.type),
            ),
            `${context}: ${JSON.stringify(events)}`,
          );
        }
        assert.ok(
          state.distance >= target,
          `${context}: traversed the complete supported road`,
        );
        assert.ok(
          state.speed > 30,
          `${context}: useful racing speed after sustained turns`,
        );
      } finally {
        runtime.dispose();
      }
    }
});

test('the full Saltwind hall, loaded portal, outboard climb and final big-air catch support the fleet at four phases', () => {
  const jump = track.jumps.at(-1);
  const departure = track.carriers.find(
    (carrier) => carrier.id === jump.departureCarrierId,
  );
  const receiver = track.carriers.find(
    (carrier) => carrier.id === jump.receivingCarrierId,
  );
  for (const quarter of [0, 1, 2, 3])
    for (const profile of profiles) {
      const context = `Saltwind/phase${quarter}/${profile.shipId}/${profile.mode}`;
      const runtime = makeRuntime();
      try {
        dynamics.reset();
        const pace = getVehiclePace(profile.shipId, track.pace);
        const state = {
          ...createVehicleState(profile.shipId),
          distance: departure.start + 30,
          speed:
            profile.mode === 'nominal'
              ? jump.targetSpeed
              : profile.mode === 'boost'
                ? pace.boostSpeed
                : pace.cruiseSpeed,
          time: (quarter * receiver.motion.period) / 4,
        };
        runtime.reset({ state });
        let launchTime = null,
          landed = false;
        const input = () =>
          getRacerControl(state, track, {
            lane: 0,
            difficulty: 'hard',
            devices,
            runtime,
          });
        for (let tick = 0; tick < 2400 && !landed; tick++) {
          const events = runtime.advance(state, input(), DT);
          assert.ok(
            !events.some((event) =>
              [
                'impact',
                'jump-miss',
                'road-departure',
                'road-recovery',
              ].includes(event.type),
            ),
            `${context}: ${JSON.stringify(events)}`,
          );
          if (events.some((event) => event.type === 'jump-launch'))
            launchTime = state.time;
          const transfer = events.find(
            (event) => event.type === 'jump-transfer',
          );
          if (transfer) {
            assert.equal(transfer.payload.id, jump.id, context);
            assert.equal(transfer.payload.outcome, 'landed', context);
            landed = true;
          }
        }
        assert.equal(
          landed,
          true,
          `${context}: genuine moving roof catch after driving the whole hall`,
        );
        assert.ok(
          state.time - launchTime > 3 && state.time - launchTime < 7,
          `${context}: substantial physical flight`,
        );
        const atLanding = state.distance;
        for (let tick = 0; tick < 120; tick++) {
          const events = runtime.advance(state, input(), DT);
          assert.equal(runtime.pose(1).grounded, true, context);
          assert.ok(
            !events.some((event) =>
              [
                'impact',
                'jump-miss',
                'road-departure',
                'road-recovery',
              ].includes(event.type),
            ),
            context,
          );
        }
        assert.ok(
          state.distance > atLanding + 40,
          `${context}: useful driven roof after landing`,
        );
      } finally {
        runtime.dispose();
      }
    }
});

test('the generous open-roof catch supports sustained boost for two ships across all four phases', () => {
  for (const { shipId, initialSpeed } of [
    { shipId: 'kestrel', initialSpeed: 185 },
    { shipId: 'needle', initialSpeed: 175 },
  ])
    for (const quarter of [0, 1, 2, 3]) {
      const jump = track.jumps[1],
        carrier = track.carriers.find(
          (entry) => entry.id === jump.receivingCarrierId,
        );
      const context = `${jump.id}/${shipId}/phase${quarter}`;
      const runtime = makeRuntime();
      try {
        dynamics.reset();
        const state = {
          ...createVehicleState(shipId),
          distance: jump.takeoff - 140,
          speed: initialSpeed,
          time: (quarter * carrier.motion.period) / 4,
        };
        runtime.reset({ state });
        let launchSpeed = null,
          launchTime = null,
          landed = false;
        for (let tick = 0; tick < 900 && !landed; tick++) {
          const input = controls(state, runtime, 'cruise');
          const events = runtime.advance(
            state,
            { ...input, throttle: 1, brake: 0, boost: true },
            DT,
          );
          const launch = events.find((event) => event.type === 'jump-launch');
          if (launch) {
            launchSpeed = launch.payload.speed;
            launchTime = state.time;
          }
          const transfer = events.find(
            (event) => event.type === 'jump-transfer',
          );
          if (transfer) {
            assert.equal(transfer.payload.outcome, 'landed', context);
            landed = true;
          }
          assert.ok(
            !events.some((event) =>
              ['jump-miss', 'road-departure', 'road-recovery'].includes(
                event.type,
              ),
            ),
            `${context}: ${JSON.stringify(events)}`,
          );
        }
        assert.ok(
          launchSpeed > 175 && launchSpeed < 190,
          `${context}: real fast launch ${launchSpeed}`,
        );
        assert.equal(landed, true);
        assert.equal(runtime.pose(1).grounded, true);
        assert.ok(
          state.time - launchTime > 4 && state.time - launchTime < 6,
          `${context}: sustained boost retains a substantial physical arc`,
        );
        const atLanding = state.distance;
        for (
          let tick = 0;
          tick < 240 && state.distance < atLanding + 50;
          tick++
        ) {
          // After the powered catch, brake/steer through the same ordinary
          // driver rather than blindly holding boost into the following gap.
          const events = runtime.advance(
            state,
            controls(state, runtime, 'boost'),
            DT,
          );
          assert.equal(
            runtime.pose(1).grounded,
            true,
            `${context}: supported postlanding drive`,
          );
          assert.ok(
            !events.some((event) =>
              [
                'impact',
                'jump-miss',
                'road-departure',
                'road-recovery',
              ].includes(event.type),
            ),
            `${context}: ${JSON.stringify(events)}`,
          );
        }
        assert.ok(
          state.distance >= atLanding + 50,
          `${context}: useful roof runway after the powered catch`,
        );
      } finally {
        runtime.dispose();
      }
    }
});

test('excessive unbraked speed has a real hull impact and bounded normal Practice recovery', () => {
  const runtime = makeRuntime(),
    jump = track.jumps[0];
  try {
    dynamics.reset();
    const state = {
      ...createVehicleState(),
      distance: jump.takeoff - 140,
      speed: 230,
      time: 0,
    };
    runtime.reset({ state });
    let missedAt = null,
      recoveredAt = null,
      physicalHullHit = false;
    for (let tick = 0; tick < 900 && recoveredAt === null; tick++) {
      const events = runtime.advance(
        state,
        controls(state, runtime, 'cruise'),
        DT,
      );
      physicalHullHit ||= events.some(
        (event) =>
          event.type === 'impact' &&
          event.payload.contactKind === 'structure' &&
          event.payload.collider.endsWith('/structural-hull'),
      );
      if (events.some((event) => event.type === 'jump-miss'))
        missedAt = state.time;
      const transfer = events.find((event) => event.type === 'jump-transfer');
      if (transfer) {
        assert.equal(transfer.payload.outcome, 'recovered');
        recoveredAt = state.time;
      }
    }
    assert.equal(
      physicalHullHit,
      true,
      'the overshoot contacts the actual moving carrier, not a trigger volume',
    );
    assert.ok(missedAt !== null && recoveredAt !== null);
    assert.ok(recoveredAt - missedAt >= 1.5 - DT - 1e-9);
    assert.ok(Math.abs(state.distance - jump.recovery) < 1e-8);
    assert.equal(runtime.pose(1).grounded, true);
    assert.equal(state.speed, 0);
  } finally {
    runtime.dispose();
  }
});

test('Nomad replay restores the moving world, and rival/presentation clocks remain independent', () => {
  const runtime = makeMotion();
  const rival = makeMotion(false);
  const state = {
    ...createVehicleState(),
    ...track.scenarios['cargo-entry'],
    time: 9,
  };
  try {
    dynamics.reset();
    runtime.reset({ state });
    for (let tick = 0; tick < 30; tick++)
      runtime.advance(state, controls(state, runtime, 'cruise'), DT);
    runtime.pose(0.5);
    const presentationTime = track.presentationTime;
    rival.reset({ state: { ...state, time: 24 } });
    rival.pose(0.3);
    assert.equal(track.presentationTime, presentationTime);
    const savedState = { ...state },
      savedRuntime = structuredClone(runtime.snapshot()),
      savedWorld = dynamics.snapshot();
    const advance = () => {
      for (let tick = 0; tick < 48; tick++)
        runtime.advance(state, controls(state, runtime, 'cruise'), DT);
      return {
        state: { ...state },
        runtime: runtime.snapshot(),
        world: dynamics.snapshot(),
      };
    };
    const expected = advance();
    Object.assign(state, savedState);
    runtime.restore(savedRuntime);
    dynamics.restore(savedWorld);
    assert.deepEqual(advance(), expected);
    const before = structuredClone(runtime.snapshot());
    for (const invalid of [0, -DT, NaN, 0.1])
      assert.throws(
        () => runtime.beginAdvance(state, {}, invalid),
        /fixed step/,
      );
    assert.deepEqual(
      runtime.snapshot(),
      before,
      'invalid staging cannot advance the carrier clock',
    );
  } finally {
    rival.dispose();
    runtime.dispose();
  }
});

test('the Nomad interception pilot changes steering through ordinary inputs and leaves approved tracks opt-out', () => {
  const runtime = makeMotion(false);
  try {
    const jump = track.jumps.find((entry) => entry.hero);
    const state = {
      ...createVehicleState(),
      distance: jump.takeoff - 110,
      speed: 150,
      time: 11,
    };
    const ordinary = getRacerControl(
      state,
      { ...track, aiLaunchTarget: undefined },
      { difficulty: 'hard' },
    );
    const target = track.aiLaunchTarget(state, jump);
    assert.ok(target.toArray().every(Number.isFinite));
    const aimed = getRacerControl(state, track, { difficulty: 'hard' });
    assert.ok(Math.abs(aimed.steer - ordinary.steer) > 0.01);
    assert.deepEqual(
      { ...aimed, steer: 0 },
      { ...ordinary, steer: 0 },
      'the predictor supplies steering, never propulsion or hidden air force',
    );
    const priorTime = track.presentationTime;
    try {
      track.presentationTime = 0;
      const earlyView = getRacerControl(state, track, { difficulty: 'hard' });
      track.presentationTime = 100000;
      assert.deepEqual(
        getRacerControl(state, track, { difficulty: 'hard' }),
        earlyView,
        'a rival plans against its own simulation clock rather than the player camera clock',
      );
    } finally {
      track.presentationTime = priorTime;
    }
  } finally {
    runtime.dispose();
  }
});

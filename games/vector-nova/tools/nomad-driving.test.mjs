import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import * as T from 'three';
import { createCameraRig } from '../src/camera/index.js';
import { NOMAD_CAMERA } from '../src/levels/nomad/camera.js';
import { nomadLaunchTarget } from '../src/levels/nomad/pilot.js';
import createLevel from '../src/levels/nomad/index.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { createCollisionWorld } from '../src/physics/collision-world.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';
import { getRacerControl } from '../src/race/racers.js';
import { sprintRunoutControl } from '../src/race/course.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';

// Bounded production encounters: every carrier transfer is approached over real
// ground with ordinary thrust/steering and then driven after physical landing.
// No airborne pose placement, target-seeking force, or automated full lap.
let definition,
  track,
  devices,
  collisionWorld,
  dynamics,
  crownWorld,
  coastControlTrack;
before(async () => {
  definition = createLevel();
  track = definition.createTrack();
  coastControlTrack = Object.assign(Object.create(track), {
    aiLaunchTarget: (state, jump) =>
      nomadLaunchTarget(track, state, jump, { boost: false }),
    aiFlightBoost: () => false,
  });
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
  // Retain the unassisted geometry/driver baseline, including deliberate misses.
  // The player's experimental launch assistance has its own bounded suite.
  definition.createRuntime({
    track,
    collisionWorld,
    dynamics,
    presentation,
    launchAssist: false,
  });
const makeRuntime = () =>
  createDeviceRuntime({ track, devices, motion: makeMotion() });
// Profile modes choose the initial speed only. Every main encounter then uses
// the actual production driver, including its ordinary grounded boost/braking.
// Explicit unpowered flights are covered separately with matching coast intent.
const controls = (state, runtime) =>
  getRacerControl(state, track, {
    lane: 0,
    difficulty: 'hard',
    devices,
    runtime,
  });

// Additional bounded input profiles use the same production world and actual
// grounded approaches. A private pilot view may declare the intended boost
// pulse for grounded steering; it cannot alter the physical runtime track.
function transferEncounter({
  jump,
  shipId = 'kestrel',
  quarter = 0,
  difficulty = 'hard',
  empty = false,
  pulse = null,
  approach = 250,
  speed = null,
}) {
  const carrier = track.carriers.find(
    (entry) => entry.id === jump.receivingCarrierId,
  );
  const runtime = empty ? makeMotion() : makeRuntime();
  const controlTrack =
    pulse === null
      ? empty
        ? coastControlTrack
        : track
      : Object.assign(Object.create(track), {
          aiLaunchTarget: (state, target) =>
            nomadLaunchTarget(track, state, target, {
              boost: true,
              boostDuration: pulse,
            }),
        });
  const context = `${jump.id}/${shipId}/phase${quarter}/${difficulty}/${empty ? 'empty-coast' : pulse === null ? 'production' : 'boost-pulse'}`;
  try {
    dynamics.reset();
    const state = {
      ...createVehicleState(shipId),
      distance: jump.takeoff - approach,
      speed: speed ?? getVehiclePace(shipId, track.pace).cruiseSpeed,
      time: (quarter * carrier.motion.period) / 4,
      ...(empty ? { energy: 0 } : {}),
    };
    runtime.reset({ state });
    if (empty)
      assert.equal(state.energy, 0, `${context}: initially empty reserve`);
    let launch = null,
      landed = null,
      airBoostTicks = 0;
    const input = () => {
      const ordinary = getRacerControl(state, controlTrack, {
        difficulty,
        devices: empty ? [] : devices,
        runtime,
      });
      if (empty) return { ...ordinary, boost: false };
      if (pulse !== null && launch !== null)
        return { ...ordinary, boost: state.time - launch.time < pulse };
      return ordinary;
    };
    for (let tick = 0; tick < 2400 && !landed; tick++) {
      const airborne = runtime.pose(1).grounded === false;
      const events = runtime.advance(state, input(), DT);
      if (airborne && state.boosting) airBoostTicks++;
      assert.ok(
        !events.some((event) =>
          ['impact', 'jump-miss', 'road-departure', 'road-recovery'].includes(
            event.type,
          ),
        ),
        `${context}: ${JSON.stringify(events)}`,
      );
      if (events.some((event) => event.type === 'jump-launch'))
        launch = { time: state.time, energy: state.energy, speed: state.speed };
      const transfer = events.find((event) => event.type === 'jump-transfer');
      if (transfer) {
        assert.equal(transfer.payload.id, jump.id, context);
        assert.equal(transfer.payload.outcome, 'landed', context);
        landed = { time: state.time, distance: state.distance };
      }
    }
    assert.ok(launch && landed, `${context}: actual moving catch`);
    assert.ok(
      landed.time - launch.time > 3 && landed.time - launch.time < 9,
      `${context}: bounded real big-air flight`,
    );
    for (
      let tick = 0;
      tick < 240 && state.distance < landed.distance + 50;
      tick++
    ) {
      const events = runtime.advance(
        state,
        getRacerControl(state, track, {
          difficulty,
          devices: empty ? [] : devices,
          runtime,
        }),
        DT,
      );
      assert.equal(
        runtime.pose(1).grounded,
        true,
        `${context}: supported catch runway`,
      );
      assert.ok(
        !events.some((event) =>
          ['impact', 'jump-miss', 'road-departure', 'road-recovery'].includes(
            event.type,
          ),
        ),
        `${context}: ${JSON.stringify(events)}`,
      );
    }
    assert.ok(
      state.distance >= landed.distance + 50,
      `${context}: continued actual driving`,
    );
    return { launch, landed, airBoostTicks };
  } finally {
    runtime.dispose();
  }
}

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
  test(`production moving transfer ${index + 1}: four motion phases, fleet cruise and fast speed seeds`, () => {
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
            // The 199 m/s Needle seed needs a real roof run-up before Shoulder
            // Ascent's last bend. Other profiles retain the closer approach.
            distance:
              jump.takeoff -
              (index === 1 &&
              profile.mode === 'boost' &&
              profile.shipId === 'needle'
                ? 500
                : 250),
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
            const input = controls(state, runtime, profile.mode);
            if (!jump.bigAir && runtime.pose(1).grounded === false)
              assert.equal(
                input.boost,
                false,
                `${context}: technical transfer coasts`,
              );
            const events = runtime.advance(state, input, DT);
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
                [
                  'impact',
                  'jump-miss',
                  'road-departure',
                  'road-recovery',
                ].includes(event.type),
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
            launchSpeed > 60 && launchSpeed < 260,
            `${context}: measured ordinary-physics launch speed ${launchSpeed}`,
          );
          assert.ok(
            landingTime - launchTime > (jump.bigAir ? 3 : 0.5) &&
              landingTime - launchTime < (jump.bigAir ? 9 : 4),
            `${context}: actual bounded ballistic flight`,
          );
          if (profile.mode === 'cruise')
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
                [
                  'impact',
                  'road-departure',
                  'road-recovery',
                  'jump-miss',
                ].includes(event.type),
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
        cruiseStandout >= 6,
        `a production cruise approach earns at least six seconds of actual hero flight (${cruiseStandout})`,
      );
  });

test('a fast Needle approach uses ordinary braking and the rounded Shoulder run-up for a clean moving catch', () => {
  const runtime = makeRuntime();
  const jump = track.jumps[1];
  try {
    dynamics.reset();
    const state = {
      ...createVehicleState('needle'),
      distance: jump.takeoff - 250,
      speed: getVehiclePace('needle', track.pace).boostSpeed,
      time: 0,
    };
    runtime.reset({ state });
    let landed = false,
      landingDistance = null;
    for (let tick = 0; tick < 1500 && !landed; tick++) {
      const events = runtime.advance(
        state,
        controls(state, runtime, 'boost'),
        DT,
      );
      assert.ok(
        !events.some((event) =>
          ['impact', 'jump-miss', 'road-departure', 'road-recovery'].includes(
            event.type,
          ),
        ),
        JSON.stringify(events),
      );
      landed = events.some(
        (event) =>
          event.type === 'jump-transfer' && event.payload.outcome === 'landed',
      );
      if (landed) landingDistance = state.distance;
    }
    assert.equal(
      landed,
      true,
      'the enlarged and rounded receiving line permits a real moving catch',
    );
    for (
      let tick = 0;
      tick < 240 && state.distance < landingDistance + 45;
      tick++
    ) {
      const events = runtime.advance(state, controls(state, runtime), DT);
      assert.equal(runtime.pose(1).grounded, true);
      assert.ok(
        !events.some((event) =>
          ['impact', 'jump-miss', 'road-departure', 'road-recovery'].includes(
            event.type,
          ),
        ),
        JSON.stringify(events),
      );
    }
    assert.ok(state.distance >= landingDistance + 45);
  } finally {
    runtime.dispose();
  }
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

test('sixteen named viable empty-reserve coast lines retain clean catches at four moving phases', () => {
  const failures = [];
  let cases = 0;
  for (const { index, ships } of [
    { index: 1, ships: ['kestrel', 'shrike'] },
    { index: 2, ships: ['kestrel'] },
    { index: 5, ships: ['kestrel'] },
  ])
    for (const shipId of ships)
      for (const quarter of [0, 1, 2, 3]) {
        try {
          const result = transferEncounter({
            jump: track.jumps[index],
            shipId,
            quarter,
            empty: true,
          });
          assert.equal(
            result.airBoostTicks,
            0,
            'no flight power substitutes for coast geometry',
          );
          cases++;
        } catch (error) {
          failures.push(error.message);
        }
      }
  assert.deepEqual(failures, []);
  assert.equal(cases, 16);
});

test('an initially empty 140 m/s final-straight coast catches cleanly at two opposite motion phases', () => {
  for (const quarter of [0, 2]) {
    const result = transferEncounter({
      jump: track.jumps.at(-1),
      quarter,
      empty: true,
      approach: 60,
      speed: 140,
    });
    assert.equal(result.airBoostTicks, 0);
    assert.ok(result.launch.speed > 138 && result.launch.speed < 141);
  }
});

test('easy and medium production drivers coast through the four large moving encounters', () => {
  for (const jump of track.jumps.filter((entry) => entry.bigAir))
    for (const difficulty of ['easy', 'medium']) {
      const result = transferEncounter({ jump, difficulty });
      assert.equal(
        result.airBoostTicks,
        0,
        'these ordinary difficulty profiles retain no airborne boost',
      );
    }
});

test('a deliberate brief boost pulse physically extends three broad-roof flights and retains supported driving', () => {
  for (const index of [1, 5, 9])
    for (const quarter of [0, 1, 2, 3]) {
      const result = transferEncounter({
        jump: track.jumps[index],
        quarter,
        pulse: 0.35,
      });
      assert.ok(
        result.airBoostTicks >= 20,
        'the real ordinary boost thrust was active in flight',
      );
    }
});

test('four authored player lines accept held airborne boost and leave real supported braking room', (t) => {
  for (const jump of track.jumps.filter((entry) => entry.bigAir)) {
    const runtime = makeRuntime();
    const receiver = track.carriers.find(
      (entry) => entry.id === jump.receivingCarrierId,
    );
    const context = `${jump.id}/manual-held-boost`;
    try {
      dynamics.reset();
      const state = {
        ...createVehicleState('kestrel'),
        distance: jump.takeoff - 60,
        speed: getVehiclePace('kestrel', track.pace).boostSpeed,
        time: 0,
      };
      runtime.reset({ state });
      let launch = null,
        landing = null;
      const clean = (events) =>
        assert.ok(
          !events.some((event) =>
            ['impact', 'jump-miss', 'road-departure', 'road-recovery'].includes(
              event.type,
            ),
          ),
          `${context}: ${JSON.stringify(events)}`,
        );
      for (let tick = 0; tick < 1500 && landing === null; tick++) {
        const airborne = runtime.pose(1).grounded === false;
        // The ground line and release tangent are authored. This deliberately
        // uses no interception target, launch oracle, or midair steering.
        const events = runtime.advance(
          state,
          {
            throttle: 1,
            brake: 0,
            steer: 0,
            boost: airborne,
            airbrake: false,
          },
          DT,
        );
        clean(events);
        if (events.some((event) => event.type === 'jump-launch'))
          launch = { time: state.time, speed: state.speed };
        const transfer = events.find((event) => event.type === 'jump-transfer');
        if (transfer) {
          assert.equal(transfer.payload.id, jump.id, context);
          assert.equal(transfer.payload.outcome, 'landed', context);
          landing = {
            time: state.time,
            speed: state.speed,
            distance: state.distance,
          };
        }
      }
      assert.ok(launch && landing, `${context}: physical moving catch`);
      assert.ok(
        launch.speed > 170,
        `${context}: actual boosted approach speed`,
      );
      assert.ok(
        landing.time - launch.time > (jump.hero ? 6 : 4),
        `${context}: substantial true airtime`,
      );
      assert.ok(
        landing.time - launch.time < 9,
        `${context}: bounded real flight`,
      );
      for (
        let tick = 0;
        tick < 240 && state.distance < landing.distance + 45;
        tick++
      ) {
        clean(
          runtime.advance(
            state,
            getRacerControl(state, track, {
              difficulty: 'hard',
              devices,
              runtime,
            }),
            DT,
          ),
        );
        assert.equal(
          runtime.pose(1).grounded,
          true,
          `${context}: supported post-catch driving`,
        );
      }
      assert.ok(state.distance >= landing.distance + 45, context);
      for (
        let tick = 0;
        tick < 600 && state.speed > 150 && state.distance < receiver.end - 5;
        tick++
      ) {
        const ordinary = getRacerControl(state, track, {
          difficulty: 'hard',
          devices,
          runtime,
        });
        clean(
          runtime.advance(
            state,
            {
              ...ordinary,
              throttle: 0,
              brake: 1,
              boost: false,
              airbrake: false,
            },
            DT,
          ),
        );
        assert.equal(
          runtime.pose(1).grounded,
          true,
          `${context}: braking stays on the receiving deck`,
        );
      }
      assert.ok(
        state.speed <= 150,
        `${context}: useful actual braking before another departure`,
      );
      assert.ok(
        state.distance < receiver.end - 40,
        `${context}: receiving runway retains margin after braking`,
      );
      t.diagnostic(
        `${jump.id}: ${launch.speed.toFixed(2)} m/s launch, ${(landing.time - launch.time).toFixed(3)} s air, ${landing.speed.toFixed(2)} m/s catch, ${(receiver.end - state.distance).toFixed(1)} m supported after braking`,
      );
    } finally {
      runtime.dispose();
    }
  }
});

test('the enlarged hero roof catches the formerly excessive held-power approach without an invisible limit', () => {
  const jump = track.jumps.find((entry) => entry.hero);
  const controlTrack = Object.assign(Object.create(track), {
    aiLaunchTarget: (state, target) =>
      nomadLaunchTarget(track, state, target, { boost: true }),
  });
  const runtime = makeRuntime();
  try {
    dynamics.reset();
    const state = {
      ...createVehicleState(),
      distance: jump.takeoff - 140,
      speed: 210,
      time: 0,
    };
    runtime.reset({ state });
    let landedAt = null,
      landingDistance = null,
      airBoostTicks = 0;
    for (let tick = 0; tick < 2400 && landedAt === null; tick++) {
      const airborne = runtime.pose(1).grounded === false;
      const ordinary = getRacerControl(state, controlTrack, {
        difficulty: 'hard',
        devices,
        runtime,
      });
      const events = runtime.advance(
        state,
        { ...ordinary, throttle: 1, brake: 0, boost: true },
        DT,
      );
      if (airborne && state.boosting) airBoostTicks++;
      assert.ok(
        !events.some((event) =>
          ['impact', 'jump-miss', 'road-departure', 'road-recovery'].includes(
            event.type,
          ),
        ),
        JSON.stringify(events),
      );
      const transfer = events.find((event) => event.type === 'jump-transfer');
      if (transfer) {
        assert.equal(
          transfer.payload.outcome,
          'landed',
          'the added physical roof now receives this real powered trajectory',
        );
        landedAt = state.time;
        landingDistance = state.distance;
      }
    }
    assert.ok(
      airBoostTicks > 60,
      'sustained actual engine power contributes to the flight',
    );
    assert.ok(landedAt !== null);
    assert.equal(runtime.pose(1).grounded, true);
    assert.ok(state.speed > 250, 'real high-speed momentum is preserved');
    for (
      let tick = 0;
      tick < 240 && state.distance < landingDistance + 45;
      tick++
    ) {
      const events = runtime.advance(state, controls(state, runtime), DT);
      assert.equal(runtime.pose(1).grounded, true);
      assert.ok(
        !events.some((event) =>
          ['impact', 'jump-miss', 'road-departure', 'road-recovery'].includes(
            event.type,
          ),
        ),
        JSON.stringify(events),
      );
    }
    assert.ok(state.distance >= landingDistance + 45);
  } finally {
    runtime.dispose();
  }
});

function recoveringEmptyCoast({
  jump = track.jumps.at(-1),
  shipId = 'kestrel',
  quarter = 0,
  entrySpeed = 120,
} = {}) {
  const runtime = makeMotion();
  const receiver = track.carriers.find(
    (entry) => entry.id === jump.receivingCarrierId,
  );
  try {
    dynamics.reset();
    const state = {
      ...createVehicleState(shipId),
      distance: jump.takeoff - 250,
      speed: entrySpeed,
      energy: 0,
      time: (quarter * receiver.motion.period) / 4,
    };
    runtime.reset({ state });
    assert.equal(state.energy, 0);
    let launchSpeed = null,
      miss = null,
      transfer = null,
      physicalHit = false;
    for (let tick = 0; tick < 2400 && transfer === null; tick++) {
      const airborne = runtime.pose(1).grounded === false;
      const ordinary = getRacerControl(state, coastControlTrack, {
        difficulty: 'hard',
        devices: [],
        runtime,
      });
      const input = { ...ordinary, boost: false };
      const events = runtime.advance(state, input, DT);
      if (airborne)
        assert.equal(
          state.boosting,
          false,
          'no regenerated reserve supplies an airborne assist',
        );
      for (const event of events) {
        if (event.type === 'jump-launch') launchSpeed = state.speed;
        if (
          event.type === 'impact' &&
          ['deck', 'rail', 'structure'].includes(event.payload.contactKind)
        )
          physicalHit = true;
        if (event.type === 'jump-miss') {
          const from = track.frameAtTime(jump.takeoff, state.time).position;
          const delta = track
            .frameAtTime(jump.landingStart, state.time)
            .position.sub(from)
            .setY(0);
          const travel = runtime.pose(1).position.clone().sub(from).setY(0);
          miss = {
            time: state.time,
            ...event.payload,
            progress: travel.dot(delta) / Math.max(1, delta.lengthSq()),
          };
        }
        if (event.type === 'jump-transfer')
          transfer = { time: state.time, ...event.payload };
      }
    }
    assert.ok(
      launchSpeed > 0,
      'the unsafe attempt still releases with real ground momentum',
    );
    assert.equal(
      physicalHit,
      true,
      `${jump.id}/${shipId}/phase${quarter}: the unsafe line contacts real steel`,
    );
    assert.ok(miss && transfer);
    assert.equal(miss.id, jump.id);
    assert.equal(transfer.id, jump.id);
    assert.equal(transfer.outcome, 'recovered');
    assert.ok(Math.abs(transfer.time - miss.time - miss.delay) <= DT + 1e-9);
    const expected =
      miss.progress < 0.65
        ? Math.max(
            track.carrierAt(jump.takeoff - 1).start + 20,
            jump.takeoff - 220,
          )
        : jump.recovery;
    assert.ok(
      Math.abs(state.distance - expected) < 1e-8,
      `${jump.id}/${shipId}/phase${quarter}: ${miss.progress.toFixed(3)} horizontal progress selects the proper recovery side`,
    );
    assert.equal(runtime.pose(1).grounded, true);
    assert.equal(state.speed, 100);
    return { launchSpeed, miss, transfer };
  } finally {
    runtime.dispose();
  }
}

test('a slow depleted final coast strikes real steel and uses bounded moving-carrier recovery', () => {
  const { launchSpeed } = recoveringEmptyCoast();
  assert.ok(
    launchSpeed > 100 && launchSpeed < 135,
    'the unpowered climb leaves a genuinely insufficient final launch speed',
  );
});

test('sixteen named unsafe depleted lines preserve real misses and select a run-up or receiving deck', () => {
  let cases = 0;
  // These grounded entry speeds retain actual steel strikes: smoother ramps
  // turn some former misses into catches, while overly slow lines hit only salt.
  for (const { index, attempts } of [
    { index: 2, attempts: [{ shipId: 'shrike', entrySpeed: 130 }] },
    { index: 5, attempts: [{ shipId: 'shrike', entrySpeed: 115 }] },
    {
      index: 9,
      attempts: [
        { shipId: 'kestrel', entrySpeed: 120 },
        { shipId: 'shrike', entrySpeed: 140 },
      ],
    },
  ])
    for (const { shipId, entrySpeed } of attempts)
      for (const quarter of [0, 1, 2, 3]) {
        recoveringEmptyCoast({
          jump: track.jumps[index],
          shipId,
          quarter,
          entrySpeed,
        });
        cases++;
      }
  assert.equal(cases, 16);
});

test('ordinary cargo steering preserves the real ship footprint from both 90-percent lane approaches', () => {
  for (const carrier of track.carriers.filter(
    (entry) => entry.mode === 'cargo',
  ))
    for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle'])
      for (const side of [-1, 1]) {
        const runtime = makeMotion();
        const context = `${carrier.id}/${shipId}/edge${side}`;
        try {
          dynamics.reset();
          const start = carrier.start + 250;
          const state = {
            ...createVehicleState(shipId),
            distance: start,
            lateral: side * track.halfWidthAt(start) * 0.9,
            speed: getVehiclePace(shipId, track.pace).cruiseSpeed,
            time: 0,
          };
          runtime.reset({ state });
          for (
            let tick = 0;
            tick < 160 && state.distance < start + 160;
            tick++
          ) {
            const input = getRacerControl(state, track, {
              difficulty: 'hard',
              lane: side * track.halfWidthAt(state.distance) * 0.9,
              runtime,
            });
            const events = runtime.advance(state, input, DT);
            assert.equal(runtime.pose(1).grounded, true, context);
            assert.ok(
              !events.some(
                (event) =>
                  ['jump-miss', 'road-departure', 'road-recovery'].includes(
                    event.type,
                  ) ||
                  (event.type === 'impact' &&
                    event.payload.contactKind === 'structure'),
              ),
              `${context}: ${JSON.stringify(events)}`,
            );
          }
          assert.ok(
            state.distance > start + 90,
            `${context}: useful actual near-edge travel`,
          );
        } finally {
          runtime.dispose();
        }
      }
});

test('ordinary finish braking parks every ship on the steep supported 600 m runout', () => {
  for (const shipId of ['kestrel', 'shrike', 'bastion', 'needle'])
    for (const speed of [getVehiclePace(shipId, track.pace).boostSpeed, 240])
      for (const time of [0, 20]) {
        const runtime = makeMotion();
        const context = `${shipId}/finish${speed}/clock${time}`;
        try {
          dynamics.reset();
          const state = {
            ...createVehicleState(shipId),
            distance: track.finishDistance,
            speed,
            time,
          };
          runtime.reset({ state });
          for (let tick = 0; tick < 2400 && state.speed > 0.5; tick++) {
            const events = runtime.advance(
              state,
              sprintRunoutControl(track, state),
              DT,
            );
            assert.equal(runtime.pose(1).grounded, true, context);
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
            assert.ok(
              state.distance < track.length - 12,
              `${context}: stops before the real road ends`,
            );
          }
          assert.ok(
            state.speed <= 0.5,
            `${context}: actual physical braking reaches a parked speed`,
          );
          for (let tick = 0; tick < 120; tick++)
            runtime.advance(state, sprintRunoutControl(track, state), DT);
          assert.ok(
            state.speed <= 0.5 && state.distance < track.length - 12,
            `${context}: ordinary brakes hold against the real downhill grade`,
          );
        } finally {
          runtime.dispose();
        }
      }
});

test('an unaligned unbraked approach hits the moving hull, loses momentum and physically catches before recovery', () => {
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
      landedAt = null,
      launchSpeed = null,
      recoveryDelay = null,
      physicalHullHit = false;
    for (let tick = 0; tick < 900 && landedAt === null; tick++) {
      const events = runtime.advance(
        state,
        { throttle: 1, brake: 0, steer: 0, boost: false, airbrake: false },
        DT,
      );
      physicalHullHit ||= events.some(
        (event) =>
          event.type === 'impact' &&
          event.payload.contactKind === 'structure' &&
          event.payload.collider.endsWith('/structural-hull'),
      );
      if (events.some((event) => event.type === 'jump-launch'))
        launchSpeed = state.speed;
      const miss = events.find((event) => event.type === 'jump-miss');
      if (miss) {
        missedAt = state.time;
        recoveryDelay = miss.payload.delay;
      }
      const transfer = events.find((event) => event.type === 'jump-transfer');
      if (transfer) {
        assert.equal(transfer.payload.outcome, 'landed');
        assert.equal(transfer.payload.tractionRestored, true);
        landedAt = state.time;
      }
    }
    assert.equal(
      physicalHullHit,
      true,
      'the overshoot contacts the actual moving carrier, not a trigger volume',
    );
    assert.ok(launchSpeed !== null && missedAt !== null && landedAt !== null);
    assert.ok(landedAt > missedAt && landedAt - missedAt < recoveryDelay);
    assert.ok(
      state.distance >= jump.landingStart && state.distance <= jump.landingEnd,
    );
    assert.equal(runtime.pose(1).grounded, true);
    assert.ok(state.speed > 0 && state.speed < launchSpeed * 0.5);
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
      distance: jump.takeoff - 60,
      speed: 150,
      time: 11,
      heading: 0.05,
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

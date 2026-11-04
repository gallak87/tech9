import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import createLevel from '../src/levels/nomad/index.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';
import { createDeviceRuntime } from '../src/pickups/runtime.js';

// Bounded production encounters: every carrier transfer is approached over real
// ground with ordinary thrust/steering and then driven after physical landing.
// No airborne pose placement, target-seeking force, or automated full lap.
let definition, track, devices, collisionWorld, dynamics;
before(async () => {
  definition = createLevel();
  track = definition.createTrack();
  devices = definition.racing.createDevices(track);
  collisionWorld = await definition.createCollisionWorld({ track });
  dynamics = await definition.createDynamics({ track, collisionWorld });
});
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
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

for (let index = 0; index < 10; index++)
  test(`production moving transfer ${index + 1}: four motion phases, fleet cruise and fast approaches`, () => {
    const jump = track.jumps[index];
    assert.ok(jump, 'the complete authored convoy transfer exists');
    const carrier = track.carriers.find(
      (entry) => entry.id === jump.receivingCarrierId,
    );
    const failures = [];
    for (const quarter of [0, 1, 2, 3])
      for (const profile of profiles) {
        const context = `${jump.id}/phase${quarter}/${profile.shipId}/${profile.mode}`;
        const runtime = makeRuntime();
        try {
          dynamics.reset();
          const pace = getVehiclePace(profile.shipId, track.pace);
          const state = {
            ...createVehicleState(profile.shipId),
            distance: jump.takeoff - 140,
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
            landingTime = null,
            landingDistance = null;
          for (let tick = 0; tick < 1500; tick++) {
            const events = runtime.advance(
              state,
              controls(state, runtime, profile.mode),
              DT,
            );
            if (events.some((event) => event.type === 'jump-launch'))
              launchTime = state.time;
            const transfer = events.find(
              (event) => event.type === 'jump-transfer',
            );
            const pose = runtime.pose(1);
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
            landingTime - launchTime > 0.5 && landingTime - launchTime < 4,
            `${context}: actual bounded ballistic flight`,
          );
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
  });

test('long receiving cargo halls support controlled full-boost flights across all four phases', () => {
  for (const index of [3, 7])
    for (const quarter of [0, 1, 2, 3]) {
      const jump = track.jumps[index],
        carrier = track.carriers.find(
          (entry) => entry.id === jump.receivingCarrierId,
        );
      const runtime = makeRuntime();
      try {
        dynamics.reset();
        const state = {
          ...createVehicleState(),
          distance: jump.takeoff - 140,
          speed: 185,
          time: (quarter * carrier.motion.period) / 4,
        };
        runtime.reset({ state });
        let launchSpeed = null,
          landed = false;
        for (let tick = 0; tick < 900 && !landed; tick++) {
          const input = controls(state, runtime, 'cruise');
          const events = runtime.advance(
            state,
            { ...input, throttle: 1, brake: 0, boost: true },
            DT,
          );
          const launch = events.find((event) => event.type === 'jump-launch');
          if (launch) launchSpeed = launch.payload.speed;
          const transfer = events.find(
            (event) => event.type === 'jump-transfer',
          );
          if (transfer) {
            assert.equal(transfer.payload.outcome, 'landed');
            landed = true;
          }
          assert.ok(
            !events.some((event) =>
              ['jump-miss', 'road-departure', 'road-recovery'].includes(
                event.type,
              ),
            ),
          );
        }
        assert.ok(
          launchSpeed > 175 && launchSpeed < 190,
          `${jump.id}/${quarter}: real fast launch ${launchSpeed}`,
        );
        assert.equal(landed, true);
        assert.equal(runtime.pose(1).grounded, true);
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

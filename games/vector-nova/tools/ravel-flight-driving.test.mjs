import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Vector3 } from 'three';
import createLevel from '../src/levels/ravel/index.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';
import { getRacerControl } from '../src/race/racers.js';

// Bounded production-physics segments: real fixed skins, native chassis queries,
// ordinary thrust/brake/steering and authored takeoff/landing acceptance. These
// checks do not teleport a vehicle after placement or run a scripted full lap.
let definition, track, collisionWorld, dynamics;
before(async () => {
  definition = createLevel();
  track = definition.createTrack();
  collisionWorld = await definition.createCollisionWorld({ track });
  dynamics = await definition.createDynamics({ track, collisionWorld });
});
after(() => {
  dynamics?.dispose();
  collisionWorld?.dispose();
});
const makeRuntime = () =>
  definition.createRuntime({ track, collisionWorld, dynamics });
const step = 1 / 120;
const mandatory = [
  'tension-break',
  'shuttle-crossing',
  'sundiver',
  'lower-seam',
  'return-cut',
  'crown-gap',
];

for (const jumpId of mandatory)
  test(`production physical transfer: ${jumpId}, fleet cruise, target and fast boost`, () => {
    const jump = track.jumps.find((entry) => entry.id === jumpId);
    assert.ok(jump && !jump.optional);
    const profiles = [
      ...['kestrel', 'shrike', 'bastion', 'needle'].map((shipId) => ({
        shipId,
        mode: 'cruise',
      })),
      { shipId: 'kestrel', mode: 'target' },
      { shipId: 'kestrel', mode: 'boost' },
      { shipId: 'needle', mode: 'boost' },
    ];
    for (const { shipId, mode } of profiles) {
      const runtime = makeRuntime();
      try {
        const pace = getVehiclePace(shipId, track.pace);
        const speed =
          mode === 'target'
            ? jump.targetSpeed
            : mode === 'boost'
              ? pace.boostSpeed
              : pace.cruiseSpeed;
        const state = {
          ...createVehicleState(shipId),
          distance: jump.takeoff - 0.08,
          speed,
        };
        runtime.reset({ state });
        const events = [];
        let launchedAt = null;
        let landedAt = null;
        for (let tick = 0; tick < 1500; tick++) {
          const batch = runtime.advance(
            state,
            { throttle: 1, steer: 0, brake: 0, boost: mode === 'boost' },
            step,
          );
          events.push(...batch);
          if (batch.some((event) => event.type === 'jump-launch'))
            launchedAt = state.time;
          const transfer = batch.find(
            (event) => event.type === 'jump-transfer',
          );
          const pose = runtime.pose(1);
          assert.ok(
            pose.position.toArray().every(Number.isFinite),
            `${shipId}/${mode}: finite flight pose`,
          );
          if (transfer) {
            landedAt = state.time;
            break;
          }
        }
        const context = `${jumpId}/${shipId}/${mode}`;
        const transfer = events.find((event) => event.type === 'jump-transfer');
        assert.ok(launchedAt !== null, `${context}: physically crossed lip`);
        assert.ok(transfer, `${context}: transfer completed`);
        assert.equal(transfer.payload.id, jump.id, context);
        assert.equal(
          transfer.payload.outcome,
          'landed',
          `${context}: ${JSON.stringify(events.filter((event) => event.type.includes('jump')))}`,
        );
        assert.ok(
          !events.some(
            (event) =>
              event.type === 'jump-miss' ||
              event.type === 'road-departure' ||
              event.type === 'road-recovery',
          ),
          context,
        );
        assert.equal(runtime.pose(1).grounded, true, context);
        assert.ok(
          Math.abs(state.lateral) < (track.roadHalfWidth ?? 50),
          `${context}: inside real receiver`,
        );
        if (jump.hero)
          assert.ok(
            landedAt - launchedAt > 4,
            `${context}: giant sustained flight`,
          );
      } finally {
        runtime.dispose();
      }
    }
  });

for (const rollId of [
  'first-screw',
  'reverse-screw',
  'return-screw',
  'crown-screw',
])
  test(`production magnetic adhesion: ${rollId}, Kestrel/Needle cruise and fast approaches`, () => {
    const roll = track.rolls.find((entry) => entry.id === rollId);
    for (const shipId of ['kestrel', 'needle'])
      for (const boostedApproach of [false, true]) {
        const runtime = makeRuntime();
        try {
          const speed = getVehiclePace(shipId, track.pace)[
            boostedApproach ? 'boostSpeed' : 'cruiseSpeed'
          ];
          // The existing supported receiving shelf provides the real braking
          // runway. A 199m/s Needle needs this distance before the reverse bend.
          const state = {
            ...createVehicleState(shipId),
            distance: roll.start - 240,
            speed,
          };
          runtime.reset({ state });
          let minUp = 1;
          let previousQuaternion = runtime.pose(1).quaternion.clone();
          const events = [];
          for (
            let tick = 0;
            tick < 2400 && state.distance < roll.end + 8;
            tick++
          ) {
            const input = getRacerControl(state, track, {
              runtime,
              pace: 1,
              difficulty: 'hard',
            });
            const batch = runtime.advance(state, input, step);
            events.push(...batch);
            const pose = runtime.pose(1);
            const context = `${rollId}/${shipId}/${boostedApproach ? 'fast' : 'cruise'}`;
            assert.equal(pose.grounded, true, `${context}: adhesion`);
            assert.equal(
              Boolean(pose.recovering),
              false,
              `${context}: no off-road recovery`,
            );
            assert.ok(
              pose.quaternion.angleTo(previousQuaternion) < 0.35,
              `${context}: continuous orientation`,
            );
            const surface = track.surfaceAtTime(
              state.distance,
              state.lateral,
              state.time,
            );
            const clearance = pose.position
              .clone()
              .sub(surface.position)
              .dot(surface.up);
            assert.ok(
              clearance > 0 && clearance < 5,
              `${context}: real-skin clearance ${clearance}`,
            );
            previousQuaternion = pose.quaternion.clone();
            if (state.distance >= roll.start && state.distance <= roll.end) {
              // A roll on a steep climbing axis need not point its normal at
              // world-down. Compare against the same axis before authored roll.
              const reference = track.sample(state.distance);
              const unrolledUp = reference.up
                .clone()
                .applyAxisAngle(reference.tangent, -reference.roll);
              minUp = Math.min(
                minUp,
                new Vector3(0, 1, 0)
                  .applyQuaternion(pose.quaternion)
                  .dot(unrolledUp),
              );
            }
          }
          const context = `${rollId}/${shipId}/${boostedApproach ? 'fast' : 'cruise'}`;
          assert.ok(
            state.distance >= roll.end + 8,
            `${context}: completed whole corkscrew`,
          );
          assert.ok(
            minUp < -0.65,
            `${context}: actual inverted hull orientation ${minUp}`,
          );
          assert.ok(
            !events.some(
              (event) =>
                event.type === 'impact' ||
                event.type === 'road-departure' ||
                event.type === 'jump-launch',
            ),
            `${context}: clean physical traversal`,
          );
        } finally {
          runtime.dispose();
        }
      }
  });

for (const direction of ['climb', 'dive'])
  test(`production support follows the large vertical ${direction}`, () => {
    let selected = null;
    for (let distance = 150; distance < track.length - 150; distance += 5) {
      if (
        track.jumps.some(
          (jump) =>
            distance + 110 > jump.takeoff && distance - 110 < jump.landingStart,
        )
      )
        continue;
      const grade = track.sample(distance).tangent.y;
      if (
        !selected ||
        (direction === 'climb'
          ? grade > selected.grade
          : grade < selected.grade)
      )
        selected = { distance, grade };
    }
    assert.ok(
      direction === 'climb' ? selected.grade > 0.8 : selected.grade < -0.75,
      `substantial supported ${direction}`,
    );
    for (const shipId of ['kestrel', 'needle']) {
      const runtime = makeRuntime();
      try {
        const state = {
          ...createVehicleState(shipId),
          distance: selected.distance - 100,
          speed: getVehiclePace(shipId, track.pace).cruiseSpeed,
        };
        runtime.reset({ state });
        const startY = runtime.pose(1).position.y;
        const events = [];
        let sawSteep = false;
        for (
          let tick = 0;
          tick < 1200 && state.distance < selected.distance + 100;
          tick++
        ) {
          events.push(
            ...runtime.advance(
              state,
              getRacerControl(state, track, {
                runtime,
                pace: 1,
                difficulty: 'hard',
              }),
              step,
            ),
          );
          const pose = runtime.pose(1),
            surface = track.surfaceAtTime(
              state.distance,
              state.lateral,
              state.time,
            );
          assert.equal(pose.grounded, true, `${shipId}: vertical adhesion`);
          assert.equal(Boolean(pose.recovering), false, `${shipId}: no fall`);
          const clearance = pose.position
            .clone()
            .sub(surface.position)
            .dot(surface.up);
          assert.ok(
            clearance > 0 && clearance < 5,
            `${shipId}: supported hull clearance`,
          );
          if (
            direction === 'climb'
              ? surface.tangent.y > 0.8
              : surface.tangent.y < -0.75
          )
            sawSteep = true;
        }
        assert.ok(state.distance >= selected.distance + 100);
        assert.ok(sawSteep);
        const verticalTravel = runtime.pose(1).position.y - startY;
        assert.ok(
          direction === 'climb' ? verticalTravel > 80 : verticalTravel < -80,
          `${shipId}: actual vertical travel ${verticalTravel}`,
        );
        assert.ok(
          !events.some(
            (event) =>
              event.type === 'impact' ||
              event.type === 'road-departure' ||
              event.type === 'jump-launch',
          ),
        );
      } finally {
        runtime.dispose();
      }
    }
  });

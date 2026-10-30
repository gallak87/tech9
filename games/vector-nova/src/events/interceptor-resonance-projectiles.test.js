import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { projectMagneticBody } from '../physics/magnetic-body.js';
import createHelion from '../levels/interceptor-helion/index.js';
import { createCombatSimulation, COMBAT_RULES } from '../pickups/combat.js';
import { aimWraithScissors } from './interceptor-aim.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createVehicleState } from '../physics/index.js';
import { createInterceptorMotion } from './interceptor-motion.js';
import { createInterceptorChaseMotion } from './interceptor-chase.js';
import { createInterceptorField } from './interceptor-field.js';
import { getRacerControl } from '../race/racers.js';
import { createInterceptorEvent } from './interceptor.js';
import { interceptorBoss } from './interceptor-bosses.js';

const dt = 1 / 120;
const speed = 300 / 3.6;

test('real Wraith scissors intercept failed frozen lanes and safely miss countered supported lines across both stations, muzzles and chase gaps', async () => {
  const level = createHelion(),
    track = level.createTrack();
  const collisionWorld = withMagneticBoundaries(track);
  const dynamics = await createRapierWorld({ collisionWorld });
  const cases = [],
    failures = [];
  const responses = [
    { response: 'stay', lockedLane: 0, heldBoost: false },
    { response: 'dodge', lockedLane: 0, heldBoost: false },
    ...[-13, 0, 13].flatMap((lockedLane) =>
      [false, true].map((heldBoost) => ({
        response: 'counter',
        lockedLane,
        heldBoost,
      })),
    ),
  ];
  try {
    for (const sourceKph of [200, 300])
      for (const station of [1900, 3500])
        for (const shotIndex of [0, 1])
          for (const gap of [32, 120, 240, 350]) {
            const field = createInterceptorField({
              track,
              bossId: 'wraith',
              getCounterattack: () => ({
                phase: sourceKph === 200 ? 'firing' : 'idle',
              }),
            });
            for (const { response, lockedLane, heldBoost } of responses) {
              const side = shotIndex === 0 ? -1 : 1;
              const countered = response === 'counter';
              const aimLane = lockedLane + side * (countered ? 10 : 2.5);
              const lane = countered
                ? lockedLane
                : aimLane + (response === 'dodge' ? -side * 8 : 0);
              const state = {
                ...createVehicleState('bastion'),
                chassisId: 'wraith',
                distance: station + (2 + shotIndex * 0.45) * speed,
                speed: sourceKph / 3.6,
              };
              const player = {
                ...createVehicleState('shrike'),
                distance: state.distance - gap,
                lateral: lane,
                speed,
                energy: response === 'dodge' ? 0 : 100,
              };
              const context = {
                track,
                dynamics,
                settings: { steeringAssist: 0.3 },
                presentation: false,
              };
              const target = createInterceptorMotion(context, {
                getYaw: () => Math.PI,
                createMotion: level.racing.createMotion,
              });
              const hunter = createInterceptorChaseMotion(context, {
                createMotion: level.racing.createMotion,
                getTarget: () => ({ state, runtime: target }),
              });
              const hits = [];
              const combat = createCombatSimulation({
                track,
                dynamics,
                collisionWorld,
                onHit: (hit) => hits.push(hit),
              });
              try {
                target.reset({ state });
                hunter.reset({ state: player });
                const bind = () => {
                  combat.bind('wraith', {
                    state,
                    team: 'quarry',
                    hitBounds: field.opponents[0].hitBounds,
                    pose: () => target.pose(1),
                    hit: () => false,
                    notify() {},
                  });
                  combat.bind('player', {
                    state: player,
                    team: 'hunters',
                    pose: () => hunter.pose(1),
                    hit: () => false,
                    notify() {},
                  });
                };
                bind();
                const solution = aimWraithScissors({
                  track,
                  bossPose: target.pose(1),
                  muzzle: [side * 2.2, 0.48, 8.75],
                  player,
                  aimLane,
                  sourceSpeed: state.speed,
                });
                assert.ok(
                  [
                    ...solution.position.toArray(),
                    ...solution.quaternion.toArray(),
                    ...solution.destination.toArray(),
                    solution.receiveDistance,
                    solution.flightTime,
                  ].every(Number.isFinite),
                );
                assert.ok(
                  solution.flightTime >= 0 &&
                    solution.flightTime <= COMBAT_RULES.arcLifetime,
                );
                assert.equal(
                  combat.fireArc('wraith', {
                    pose: solution,
                    signature: 'wraith-scissor',
                  }),
                  true,
                );
                const initial = combat.snapshot();
                assert.deepEqual(
                  initial.shots[0].position,
                  solution.position.toArray(),
                );
                assert.equal(
                  initial.shots[0].target,
                  null,
                  'a frozen signature never acquires ordinary forward homing',
                );
                assert.equal(initial.shots[0].heavy, undefined);
                combat.restore(initial);
                const forged = structuredClone(initial);
                forged.shots[0].heavy = true;
                assert.throws(() => combat.restore(forged));
                assert.deepEqual(combat.snapshot(), initial);
                let termination = null,
                  unsupported = false;
                for (
                  let tick = 0;
                  tick <= Math.ceil(COMBAT_RULES.arcLifetime / dt);
                  tick++
                ) {
                  const bossControl = field.control({
                    opponent: {
                      specification: field.opponents[0],
                      state,
                      runtime: target,
                    },
                    track,
                    devices: [],
                    nearby: [state, player],
                  });
                  const control = getRacerControl(player, track, {
                    difficulty: 'hard',
                    lane,
                  });
                  control.boost = heldBoost;
                  target.beginAdvance(state, bossControl, dt);
                  hunter.beginAdvance(player, control, dt);
                  dynamics.step(dt);
                  target.finishAdvance(state);
                  hunter.finishAdvance(player);
                  unsupported ||=
                    hunter.pose(1).grounded === false ||
                    hunter.pose(1).recovering === true;
                  const live = combat.view().shots[0];
                  const before = live && {
                    ...live,
                    position: [...live.position],
                    velocity: [...live.velocity],
                  };
                  bind();
                  combat.step(dt);
                  if (before && combat.view().shots.length === 0) {
                    const a = new T.Vector3().fromArray(before.position);
                    const b = a
                      .clone()
                      .addScaledVector(
                        new T.Vector3().fromArray(before.velocity),
                        dt,
                      );
                    const projected = projectMagneticBody(
                      track,
                      b,
                      before.distance,
                      before.lateral,
                    );
                    termination = {
                      age: before.age + dt,
                      previousLateral: before.lateral,
                      nextLateral: projected.lateral,
                      occlusion: dynamics.occlusionFraction(a, b),
                    };
                  }
                }
                const contacts = hits.filter(
                  (hit) => hit.source === 'wraith' && hit.target === 'player',
                );
                const result = {
                  sourceKph,
                  station,
                  shotIndex,
                  gap,
                  response,
                  lockedLane,
                  heldBoost,
                  aimLane,
                  hits: contacts.length,
                  finalLane: player.lateral,
                  unsupported,
                  flightTime: solution.flightTime,
                };
                cases.push(result);
                // A distant first-station chord leaves the authored road before it
                // reaches the wall-riding pilot. Shared world bounds remain real
                // cover; every reachable frozen-lane shot must still strike.
                const boundaryCover =
                  response === 'stay' &&
                  station === 1900 &&
                  gap >= 240 &&
                  contacts.length === 0 &&
                  termination &&
                  Math.abs(termination.nextLateral) > track.width / 2 &&
                  termination.age < solution.flightTime;
                if (
                  (!boundaryCover &&
                    contacts.length !== (response === 'stay' ? 1 : 0)) ||
                  (response === 'counter' && unsupported)
                )
                  failures.push({ ...result, termination });
                for (const hit of contacts) {
                  assert.equal(hit.kind, 'arc');
                  assert.equal(hit.signature, 'wraith-scissor');
                }
              } finally {
                hunter.dispose();
                target.dispose();
              }
            }
          }
    assert.deepEqual(
      failures,
      [],
      `physical Wraith fairness failures among ${cases.length} actual moving cases:\n${JSON.stringify(failures, null, 2)}`,
    );
  } finally {
    dynamics.dispose();
  }
});

test('an empty-reserve pilot can steer clear after the lock on real Helion physics without a resonance bonus', async () => {
  const level = createHelion(),
    track = level.createTrack();
  const collisionWorld = withMagneticBoundaries(track);
  const dynamics = await createRapierWorld({ collisionWorld });
  const field = createInterceptorField({ track, bossId: 'wraith' });
  const virtualMarker = interceptorBoss('wraith').attack.markers[0] * 1000;
  try {
    for (const station of [1900, 3500]) {
      const mission = createInterceptorEvent({
        bossId: 'wraith',
        allies: [],
        difficulty: 'hard',
        routeLength: 1000,
        escapeDistance: 2000,
      });
      const state = {
        ...createVehicleState('bastion'),
        chassisId: 'wraith',
        distance: station,
        speed,
      };
      const player = {
        ...createVehicleState('shrike'),
        distance: station - 32,
        speed,
        energy: 0,
      };
      const context = {
        track,
        dynamics,
        settings: { steeringAssist: 0.3 },
        presentation: false,
      };
      const target = createInterceptorMotion(context, {
        getYaw: () => mission.snapshot().counterattack.yaw,
        createMotion: level.racing.createMotion,
      });
      const hunter = createInterceptorChaseMotion(context, {
        createMotion: level.racing.createMotion,
        getTarget: () => ({ state, runtime: target }),
      });
      const hits = [];
      const combat = createCombatSimulation({
        track,
        dynamics,
        collisionWorld,
        onHit: (hit) => hits.push(hit),
      });
      try {
        target.reset({ state });
        hunter.reset({ state: player });
        const bind = () => {
          combat.bind('wraith', {
            state,
            team: 'quarry',
            hitBounds: field.opponents[0].hitBounds,
            pose: () => target.pose(1),
            hit: () => false,
            notify() {},
          });
          combat.bind('player', {
            state: player,
            team: 'hunters',
            pose: () => hunter.pose(1),
            hit: () => false,
            notify() {},
          });
        };
        mission.step(dt, {
          targetDistance: virtualMarker,
          playerDistance: virtualMarker - 32,
          playerLateral: player.lateral,
        });
        const shots = [];
        let previousLane = player.lateral,
          maxLateralStep = 0;
        for (let tick = 0; tick < 3.45 / dt; tick++) {
          const elapsed = mission.snapshot().counterattack.elapsed;
          const control = getRacerControl(player, track, {
            difficulty: 'hard',
            lane: elapsed >= 1 ? 8 : 0,
          });
          control.boost = false;
          const bossControl = field.control({
            opponent: {
              specification: field.opponents[0],
              state,
              runtime: target,
            },
            track,
            devices: [],
            nearby: [state, player],
          });
          target.beginAdvance(state, bossControl, dt);
          hunter.beginAdvance(player, control, dt);
          dynamics.step(dt);
          target.finishAdvance(state);
          hunter.finishAdvance(player);
          maxLateralStep = Math.max(
            maxLateralStep,
            Math.abs(player.lateral - previousLane),
          );
          previousLane = player.lateral;
          bind();
          combat.step(dt);
          const events = mission.step(dt, {
            targetDistance: virtualMarker + state.distance - station,
            playerDistance: virtualMarker + player.distance - station,
            playerLateral: player.lateral,
            targetLateral: state.lateral,
            playerBoost: false,
            playerBoosting: player.boosting,
          });
          for (const event of events) {
            if (
              event.type !== 'interceptor-fire' ||
              event.payload.source !== 'wraith'
            )
              continue;
            const command = event.payload;
            const solution = aimWraithScissors({
              track,
              bossPose: target.pose(1),
              muzzle: command.muzzle,
              player,
              aimLane: command.aimLane,
              sourceSpeed: state.speed,
            });
            bind();
            assert.equal(
              combat.fireArc('wraith', {
                pose: solution,
                signature: 'wraith-scissor',
              }),
              true,
              `station ${station}, elapsed ${elapsed}`,
            );
            shots.push({ lane: player.lateral, aim: command.aimLane });
          }
        }
        assert.equal(shots.length, 2);
        assert.equal(
          hits.filter(
            (hit) => hit.source === 'wraith' && hit.target === 'player',
          ).length,
          0,
          JSON.stringify({ station, shots }),
        );
        assert.equal(mission.snapshot().counterattack.countered, false);
        assert.equal(mission.snapshot().counterattack.phase, 'recovered');
        assert.ok(
          maxLateralStep < 0.5,
          `steering stays physical: ${maxLateralStep}`,
        );
      } finally {
        hunter.dispose();
        target.dispose();
      }
    }
  } finally {
    dynamics.dispose();
  }
});

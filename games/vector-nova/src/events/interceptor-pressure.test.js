import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { createInterceptorEvent } from './interceptor.js';
import { interceptorBoss } from './interceptor-bosses.js';
import { createCombatSimulation } from '../pickups/combat.js';
import { ARC_SHOT_HEIGHT } from '../pickups/rules.js';
import createDispatch from '../levels/interceptor/index.js';
import { createRapierWorld } from '../physics/rapier-world.js';
import { withMagneticBoundaries } from '../physics/magnetic-boundaries.js';
import { createVehicleState } from '../physics/index.js';
import { createInterceptorMotion } from './interceptor-motion.js';
import { createInterceptorChaseMotion } from './interceptor-chase.js';
import { createInterceptorField } from './interceptor-field.js';
import { getRacerControl } from '../race/racers.js';

const dt = 1 / 120;
const track = {
  id: 'pressure-live-projectile',
  width: 44,
  length: 2000,
  closed: false,
  sample: (distance) => ({
    position: new T.Vector3(0, 0, distance),
    tangent: new T.Vector3(0, 0, 1),
    right: new T.Vector3(1, 0, 0),
    up: new T.Vector3(0, 1, 0),
    quaternion: new T.Quaternion(),
    curvature: 0,
  }),
};
const fireCommands = (events) =>
  events.filter(
    (event) =>
      event.type === 'interceptor-fire' && event.payload.source === 'goliath',
  );

function commands() {
  const event = createInterceptorEvent({
    bossId: 'goliath',
    allies: [],
    difficulty: 'hard',
    routeLength: 1000,
    escapeDistance: 2000,
  });
  const phase = interceptorBoss('goliath').attack;
  const progress = (playerLateral) => ({
    targetDistance: 150,
    playerDistance: 118,
    playerLateral,
  });
  event.step(1, progress(-8));
  event.step(phase.telegraph, progress(-8));
  const locked = event.snapshot().counterattack.aimLanes;
  const first = fireCommands(event.step(phase.turn, progress(12)))[0].payload;
  const second = fireCommands(event.step(phase.shotInterval, progress(-12)))[0]
    .payload;
  assert.deepEqual(locked, [-8, 0]);
  assert.equal(first.aimLane, locked[0]);
  assert.equal(second.aimLane, locked[1]);
  return [first, second];
}

function harness(playerLane, reversed = true, onHit) {
  const hits = [];
  const combat = createCombatSimulation({
    track,
    onHit: (hit) => {
      hits.push(hit);
      onHit?.(hit);
    },
  });
  const actor = (id, distance, lateral, team, yaw = 0) => {
    const state = { distance, lateral, speed: 300 / 3.6 };
    return {
      state,
      team,
      pose: () => ({
        position: new T.Vector3(state.lateral, 0.72, state.distance),
        quaternion: new T.Quaternion().setFromAxisAngle(
          new T.Vector3(0, 1, 0),
          yaw,
        ),
        grounded: true,
      }),
      hit() {
        return false;
      },
      notify() {},
      id,
    };
  };
  const boss = actor('goliath', 500, 0, 'quarry', reversed ? Math.PI : 0);
  boss.hitBounds = { half: [8, 3, 20], center: [0, 2.8, 0] };
  const player = actor('player', reversed ? 468 : 560, playerLane, 'hunters');
  const bind = () => {
    combat.bind('goliath', boss);
    combat.bind('player', player);
  };
  bind();
  const step = () => {
    boss.state.distance += boss.state.speed * dt;
    player.state.distance += player.state.speed * dt;
    bind();
    combat.step(dt);
  };
  return { combat, hits, boss, player, step };
}

function discharge(h, command) {
  const physical = h.boss.pose();
  const position = new T.Vector3()
    .fromArray(command.muzzle)
    .applyQuaternion(physical.quaternion)
    .add(physical.position);
  // Longitudinal compensation follows the pilot's physical road station;
  // lateral aim remains the command's old lock after the committed dodge.
  const target = track
    .sample(h.player.state.distance)
    .position.addScaledVector(
      track.sample(h.player.state.distance).right,
      command.aimLane,
    )
    .addScaledVector(track.sample(h.player.state.distance).up, 1.8);
  const quaternion = new T.Quaternion().setFromUnitVectors(
    new T.Vector3(0, 0, 1),
    target.sub(position).normalize(),
  );
  assert.equal(
    h.combat.fireLance('goliath', {
      pose: { position, quaternion },
      signature: 'goliath-pressure',
    }),
    true,
  );
  assert.deepEqual(h.combat.view().shots[0].position, position.toArray());
  return position;
}

test('each frozen pressure lane produces a real hit while a committed dodge avoids that same shot', () => {
  for (const command of commands()) {
    for (const dodge of [false, true]) {
      const h = harness(dodge ? command.aimLane + 12 : command.aimLane);
      discharge(h, command);
      for (let tick = 0; tick < 30; tick++) h.step();
      const contacts = h.hits.filter(
        (hit) => hit.source === 'goliath' && hit.target === 'player',
      );
      assert.equal(
        contacts.length,
        dodge ? 0 : 1,
        `shot ${command.shotIndex + 1}, locked lane ${command.aimLane}, dodge=${dodge}`,
      );
      if (!dodge) {
        assert.equal(contacts[0].equipment, 'lance');
        assert.equal(contacts[0].signature, 'goliath-pressure');
      }
    }
  }
});

test('a pressure projectile starts at its physical offset muzzle and travels continuously from there', () => {
  const h = harness(18);
  const origin = discharge(h, commands()[0]);
  h.step();
  const shot = h.combat.view().shots[0];
  assert.ok(shot, 'the first swept movement is still in flight');
  const movement = new T.Vector3().fromArray(shot.position).distanceTo(origin);
  assert.ok(
    movement > 0 && movement < 6,
    `one physical tick travels ${movement.toFixed(3)} m rather than snapping to the boss centre`,
  );
  assert.ok(
    shot.position[2] < origin.z,
    'rear cannon immediately travels toward pursuers',
  );
});

test('ordinary Lance fire retains its central muzzle height, default projectile and forward hit', () => {
  const h = harness(0, false);
  const pose = h.boss.pose();
  assert.equal(h.combat.fireLance('goliath'), true);
  const initial = h.combat.view().shots[0];
  assert.deepEqual(
    initial.position,
    pose.position
      .clone()
      .add(new T.Vector3(0, ARC_SHOT_HEIGHT, 0))
      .toArray(),
  );
  assert.equal(initial.signature, undefined);
  for (let tick = 0; tick < 30; tick++) h.step();
  assert.equal(h.hits.filter((hit) => hit.target === 'player').length, 1);
});

test('the ordinary horizontal Lance can reach the exposed moving rear core without vertical aim assistance', () => {
  const mission = createInterceptorEvent({
    bossId: 'goliath',
    allies: [],
    difficulty: 'hard',
    routeLength: 1000,
    escapeDistance: 2000,
  });
  mission.step(1, { targetDistance: 150, playerDistance: 118 });
  mission.step(5, { targetDistance: 500, playerDistance: 468 });
  assert.equal(mission.snapshot().counterattack.phase, 'breach');
  const scored = [];
  const h = harness(0, false, (hit) => {
    if (hit.target !== 'goliath') return;
    const target = h.boss.pose();
    const hitLocal = new T.Vector3()
      .fromArray(hit.position)
      .sub(target.position)
      .applyQuaternion(target.quaternion.clone().invert())
      .toArray();
    scored.push({
      hitLocal,
      events: mission.hit({
        ...hit,
        hitLocal,
        key: String(hit.hitId),
      }),
    });
  });
  h.player.state.distance = 468;
  assert.equal(h.combat.fireLance('player'), true);
  for (let tick = 0; tick < 30; tick++) {
    h.step();
    mission.step(dt, {
      targetDistance: h.boss.state.distance,
      playerDistance: h.player.state.distance,
    });
  }
  assert.equal(scored.length, 1);
  assert.ok(
    scored[0].hitLocal[1] < 0.7,
    'the existing ground-height cannon reaches the low core, not an invented vertical aim',
  );
  assert.ok(
    scored[0].hitLocal[2] < -20 && scored[0].hitLocal[2] > -21.2,
    'the moving target leaves bounded swept-contact lag at its real stern',
  );
  assert.equal(scored[0].events[0].payload.damage, 54);
  assert.equal(scored[0].events[0].payload.weakPoint, true);
});

test('real pressure shots retain their locked lane through Dispatch plunge and bank geometry while a deliberate dodge escapes', async () => {
  const level = createDispatch(),
    route = level.createTrack();
  const collisionWorld = withMagneticBoundaries(route);
  const dynamics = await createRapierWorld({ collisionWorld });
  const specification = interceptorBoss('goliath').attack;
  const field = createInterceptorField({ track: route, bossId: 'goliath' });
  try {
    for (const marker of specification.markers) {
      for (const command of commands()) {
        for (const dodge of [false, true]) {
          const state = createVehicleState('bastion');
          state.chassisId = 'goliath';
          state.distance =
            marker * route.length +
            ((specification.telegraph +
              specification.turn +
              command.shotIndex * specification.shotInterval) *
              300) /
              3.6;
          state.speed = 300 / 3.6;
          const player = createVehicleState('shrike');
          const lane = command.aimLane + (dodge ? 12 : 0);
          player.distance = state.distance - 32;
          player.lateral = lane;
          player.speed = 300 / 3.6;
          const context = {
            track: route,
            dynamics,
            settings: { steeringAssist: 0.3 },
          };
          const target = createInterceptorMotion(context, {
            getYaw: () => Math.PI,
          });
          const hunter = createInterceptorChaseMotion(context, {
            getTarget: () => ({ state, runtime: target }),
          });
          const hits = [];
          const combat = createCombatSimulation({
            track: route,
            dynamics,
            collisionWorld,
            onHit: (hit) => hits.push(hit),
          });
          try {
            target.reset({ state });
            hunter.reset({ state: player });
            const bind = () => {
              combat.bind('goliath', {
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
            const physical = target.pose(1);
            const origin = new T.Vector3()
              .fromArray(command.muzzle)
              .applyQuaternion(physical.quaternion)
              .add(physical.position);
            const receive = route.sample(player.distance);
            const destination = receive.position
              .clone()
              .addScaledVector(receive.right, command.aimLane)
              .addScaledVector(receive.up, 1.8);
            const quaternion = new T.Quaternion().setFromUnitVectors(
              new T.Vector3(0, 0, 1),
              destination.sub(origin).normalize(),
            );
            assert.equal(
              combat.fireLance('goliath', {
                pose: { position: origin, quaternion },
                signature: 'goliath-pressure',
              }),
              true,
            );
            for (let tick = 0; tick < 30; tick++) {
              const bossControl = field.control({
                opponent: {
                  specification: field.opponents[0],
                  state,
                  runtime: target,
                },
                track: route,
                devices: [],
                nearby: [state, player],
              });
              const controls = getRacerControl(player, route, {
                difficulty: 'hard',
                lane,
              });
              controls.boost = false;
              target.beginAdvance(state, bossControl, dt);
              hunter.beginAdvance(player, controls, dt);
              dynamics.step(dt);
              target.finishAdvance(state);
              hunter.finishAdvance(player);
              bind();
              combat.step(dt);
            }
            const contacts = hits.filter(
              (hit) => hit.source === 'goliath' && hit.target === 'player',
            );
            assert.equal(
              contacts.length,
              dodge ? 0 : 1,
              `station ${marker}, shot ${command.shotIndex}, lane ${command.aimLane}, dodge=${dodge}`,
            );
          } finally {
            hunter.dispose();
            target.dispose();
          }
        }
      }
    }
  } finally {
    dynamics.dispose();
  }
});

test('a pilot can react to the plunge lock using real steering inputs rather than an instant lane change', async () => {
  const level = createDispatch(),
    route = level.createTrack();
  const collisionWorld = withMagneticBoundaries(route);
  const dynamics = await createRapierWorld({ collisionWorld });
  const attack = interceptorBoss('goliath').attack;
  const mission = createInterceptorEvent({
    bossId: 'goliath',
    allies: [],
    difficulty: 'hard',
    routeLength: route.length,
    escapeDistance: route.length * 2,
  });
  // Seed a completed first beat, then drive the actual second approach from
  // physical poses. No vehicle coordinate is rewritten after runtime.reset.
  mission.step(1, {
    targetDistance: attack.markers[0] * route.length,
    playerDistance: attack.markers[0] * route.length - 32,
  });
  mission.step(8, {
    targetDistance: attack.markers[0] * route.length + 500,
    playerDistance: attack.markers[0] * route.length + 468,
  });
  const state = createVehicleState('bastion');
  state.chassisId = 'goliath';
  state.distance = attack.markers[1] * route.length - 5;
  state.speed = 300 / 3.6;
  const player = createVehicleState('shrike');
  player.distance = state.distance - 32;
  player.lateral = 7.7;
  player.speed = 300 / 3.6;
  const context = {
    track: route,
    dynamics,
    collisionWorld,
    settings: { steeringAssist: 0.3 },
  };
  const target = createInterceptorMotion(context, {
    getYaw: () => mission.snapshot().counterattack.yaw,
  });
  const hunter = createInterceptorChaseMotion(context, {
    getTarget: () => ({ state, runtime: target }),
  });
  const field = createInterceptorField({ track: route, bossId: 'goliath' });
  const hits = [],
    pending = [],
    shotPositions = [];
  const combat = createCombatSimulation({
    track: route,
    dynamics,
    collisionWorld,
    onHit(hit) {
      hits.push(hit);
      mission.hit({ ...hit, key: String(hit.hitId) });
    },
  });
  let reactAt = null,
    firstLock = null,
    maxLateralStep = 0,
    previousLateral = player.lateral;
  try {
    target.reset({ state });
    hunter.reset({ state: player });
    for (let tick = 0; tick < 8 * 120; tick++) {
      const phase = mission.snapshot().counterattack;
      if (phase.attackIndex === 1 && phase.locked && reactAt === null) {
        firstLock = phase.aimLanes[0];
        reactAt = mission.snapshot().elapsed + 0.1;
      }
      const lane =
        reactAt !== null && mission.snapshot().elapsed >= reactAt ? -13 : 7.7;
      const bossControl = field.control({
        opponent: { specification: field.opponents[0], state, runtime: target },
        track: route,
        devices: [],
        nearby: [state, player],
      });
      const control = getRacerControl(player, route, {
        difficulty: 'hard',
        pace: 1,
        lane,
        devices: [],
        nearby: [],
        runtime: hunter,
      });
      control.boost =
        state.distance - player.distance > 36 && player.energy > 10;
      target.beginAdvance(state, bossControl, dt);
      hunter.beginAdvance(player, control, dt);
      dynamics.step(dt);
      target.finishAdvance(state);
      hunter.finishAdvance(player);
      maxLateralStep = Math.max(
        maxLateralStep,
        Math.abs(player.lateral - previousLateral),
      );
      previousLateral = player.lateral;
      combat.bind('goliath', {
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
      for (const command of pending.splice(0)) {
        const pose = target.pose(1);
        const position = new T.Vector3()
          .fromArray(command.muzzle)
          .applyQuaternion(pose.quaternion)
          .add(pose.position);
        const receive = route.sample(player.distance);
        const destination = receive.position
          .clone()
          .addScaledVector(receive.right, command.aimLane)
          .addScaledVector(receive.up, 1.8);
        combat.fireLance('goliath', {
          signature: 'goliath-pressure',
          pose: {
            position,
            quaternion: new T.Quaternion().setFromUnitVectors(
              new T.Vector3(0, 0, 1),
              destination.sub(position).normalize(),
            ),
          },
        });
        shotPositions.push({ lane: player.lateral, locked: command.aimLane });
      }
      combat.step(dt);
      pending.push(
        ...fireCommands(
          mission.step(dt, {
            targetDistance: state.distance,
            playerDistance: player.distance,
            targetLateral: state.lateral,
            playerLateral: player.lateral,
          }),
        ).map((event) => event.payload),
      );
      const after = mission.snapshot().counterattack;
      if (
        after.attackIndex === 1 &&
        ['breach', 'recovered'].includes(after.phase) &&
        after.phaseElapsed > 0.2
      )
        break;
    }
    assert.ok(firstLock > 6, `the reproduced off-centre lock is ${firstLock}`);
    assert.equal(shotPositions.length, 2);
    assert.ok(
      Math.abs(shotPositions[0].lane - firstLock) > 4.3,
      `the pilot physically cleared the first lane: ${JSON.stringify(shotPositions)}`,
    );
    assert.ok(
      maxLateralStep < 0.5,
      `steering remains continuous: ${maxLateralStep.toFixed(3)}m/tick`,
    );
    assert.equal(
      hits.filter((hit) => hit.source === 'goliath' && hit.target === 'player')
        .length,
      0,
    );
    assert.equal(mission.snapshot().counterattack.phase, 'breach');
  } finally {
    hunter.dispose();
    target.dispose();
    dynamics.dispose();
  }
});

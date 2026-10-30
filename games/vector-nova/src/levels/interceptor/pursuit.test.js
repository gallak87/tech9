import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import createLevel from './index.js';
import { createRacers } from '../../race/racers.js';
import { createRapierWorld } from '../../physics/rapier-world.js';
import { withMagneticBoundaries } from '../../physics/magnetic-boundaries.js';
import { createInterceptorMotion } from '../../events/interceptor-motion.js';
import { createInterceptorField } from '../../events/interceptor-field.js';
import { createInterceptorEvent } from '../../events/interceptor.js';
import { createDeviceRuntime } from '../../pickups/runtime.js';
import { getBossHull } from '../../ships/boss-hulls.js';
import { projectMagneticBody } from '../../physics/magnetic-body.js';

const dt = 1 / 120;

test('the actual Goliath squad turns and discharges at all three course stations on both laps without deck contact or teleporting', async () => {
  const level = createLevel(),
    track = level.createTrack();
  const devices = level.racing.createDevices(track);
  const collisionWorld = level.createCollisionWorld?.({ track }) ?? null;
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  const mission = createInterceptorEvent({
    bossId: 'goliath',
    difficulty: 'hard',
    routeLength: track.length,
    escapeDistance: track.length * 2,
  });
  const field = createInterceptorField({
    track,
    bossId: 'goliath',
    getCounterattack: () => mission.snapshot().counterattack,
  });
  const impacts = [];
  const racers = createRacers({
    track,
    devices,
    field,
    dynamics,
    continuous: true,
    createRuntime(specification) {
      const context = {
        track,
        collisionWorld,
        dynamics,
        settings: { steeringAssist: 0.3 },
        presentation: false,
      };
      const runtime = createDeviceRuntime({
        track,
        devices:
          specification.id === 'goliath'
            ? devices.filter((device) => device.type === 'aegis')
            : devices,
        combatId: specification.id,
        motion:
          specification.id === 'goliath'
            ? createInterceptorMotion(context, {
                createMotion: level.racing.createMotion,
                getYaw: () => mission.snapshot().counterattack.yaw,
              })
            : level.racing.createMotion(context),
      });
      const finish = runtime.finishAdvance.bind(runtime);
      runtime.finishAdvance = (state) => {
        const events = finish(state);
        if (specification.id === 'goliath')
          for (const event of events)
            if (event.type === 'impact')
              impacts.push({ distance: state.distance, ...event.payload });
        return events;
      };
      return runtime;
    },
  });
  const hull = getBossHull('goliath');
  const bottom = [];
  for (let i = 0; i < hull.vertices.length; i += 3)
    if (hull.vertices[i + 1] <= 0.25)
      bottom.push(new T.Vector3().fromArray(hull.vertices, i));
  const commands = [];
  let previous = null,
    minCruise = Infinity,
    maxStep = 0,
    minDeckClearance = Infinity;
  try {
    racers.reset();
    const boss = racers.opponents[0];
    for (
      let tick = 0;
      tick < 130 * 120 && boss.state.distance < track.length * 2;
      tick++
    ) {
      racers.advance(dt);
      const pose = boss.runtime.pose(1),
        frame = track.sample(boss.state.distance);
      if (previous)
        maxStep = Math.max(maxStep, pose.position.distanceTo(previous));
      previous = pose.position.clone();
      if (tick > 10 * 120) minCruise = Math.min(minCruise, boss.state.speed);
      const events = mission.step(dt, {
        targetDistance: boss.state.distance,
        playerDistance: boss.state.distance - 32,
        playerLateral: 0,
        targetLateral: boss.state.lateral,
      });
      for (const event of events) {
        if (
          event.type !== 'interceptor-fire' ||
          event.payload.source !== 'goliath' ||
          event.payload.kind !== 'lance'
        )
          continue;
        const nose = new T.Vector3(0, 0, 1)
          .applyQuaternion(pose.quaternion)
          .dot(frame.tangent);
        assert.ok(
          nose < -0.8,
          `physical hull faces the squad for attack ${event.payload.attackIndex}: ${nose}`,
        );
        commands.push(event.payload);
      }
      if (tick % 30 === 0 && mission.snapshot().counterattack.warning) {
        for (const local of bottom) {
          const point = local
            .clone()
            .applyQuaternion(pose.quaternion)
            .add(pose.position);
          const projected = projectMagneticBody(
            track,
            point,
            boss.state.distance,
            boss.state.lateral,
          );
          const clearance = point
            .clone()
            .sub(projected.frame.position)
            .dot(projected.frame.up);
          minDeckClearance = Math.min(minDeckClearance, clearance);
        }
      }
    }
    assert.ok(
      boss.state.distance >= track.length * 2,
      `courier reached ${boss.state.distance.toFixed(2)}m`,
    );
    for (const ally of racers.opponents.slice(1))
      assert.ok(
        ally.state.distance > track.length * 1.9,
        `${ally.specification.id} completed the full pursuit`,
      );
    assert.ok(minCruise > 70, `minimum cruise ${minCruise.toFixed(2)}m/s`);
    assert.ok(maxStep < 1.5, `continuous maximum step ${maxStep.toFixed(3)}m`);
    assert.ok(
      minDeckClearance > -0.35,
      `whole compound hull stays above the deck: ${minDeckClearance.toFixed(3)}m`,
    );
    assert.equal(impacts.length, 0, JSON.stringify(impacts));
    assert.equal(commands.length, 12);
    assert.deepEqual(
      commands
        .filter((command) => command.shotIndex === 0)
        .map((command) => [command.lap, command.beat]),
      [
        [1, 1],
        [1, 2],
        [1, 3],
        [2, 1],
        [2, 2],
        [2, 3],
      ],
    );
    assert.deepEqual(
      mission.snapshot().counterattacks.map((attack) => attack.shots),
      [2, 2, 2, 2, 2, 2],
    );
  } finally {
    racers.dispose();
    dynamics.dispose();
  }
});

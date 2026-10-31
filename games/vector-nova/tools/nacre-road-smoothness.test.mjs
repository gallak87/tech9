import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import { createNacreCollisionWorld } from '../src/levels/nacre/collision.js';
import { createNacreRuntime } from '../src/levels/nacre/track/runtime.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { getShip } from '../src/ships/catalog.js';

test('Nacre panel seams carry native chassis smoothly at cruise and boost', async (t) => {
  const track = createLevel3Track();
  const collisionWorld = createNacreCollisionWorld({ track });
  const native = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  let actor;
  const dynamics = {
    ...native,
    createActor(...args) {
      actor = native.createActor(...args);
      return actor;
    },
  };
  const runtime = createNacreRuntime({
    track,
    collisionWorld,
    dynamics,
    settings: { steeringAssist: 0.3 },
  });
  t.after(() => {
    runtime.dispose();
    native.dispose();
    collisionWorld.dispose();
  });
  // Four real panel joins on the authored receiving straight, away from
  // takeoff, touchdown, rails and devices. Use production triangles and hulls.
  const start = track.jumps[1].landingStart + 45;
  const up = new Vector3(0, 1, 0);
  for (const shipId of ['kestrel', 'shrike'])
    for (const lateral of [-4, 0, 4])
      for (const boost of [false, true]) {
        const speed =
          getShip(shipId).handling[boost ? 'boostSpeed' : 'cruiseSpeed'];
        const label = `${shipId} lane ${lateral}, ${speed}m/s`;
        const state = {
          ...createVehicleState(shipId),
          distance: start,
          lateral,
          speed,
        };
        native.reset();
        runtime.reset({ reason: 'initialize', state, seed: 7 });
        let minimum = Infinity,
          maximum = -Infinity,
          previousHeight,
          covered = 0,
          ticks = 0;
        for (; ticks < 120 && state.distance < start + 80; ticks++) {
          const before = state.speed;
          const events = runtime.advance(
            state,
            { throttle: 1, steer: 0, boost },
            1 / 120,
          );
          const body = actor.read();
          const reference = track.sample(state.distance);
          const surface = native.sampleRoadSurface(
            state.distance,
            state.lateral,
            reference,
          );
          if (surface) covered++;
          const height = body.position
            .clone()
            .sub(reference.position)
            .dot(reference.up);
          minimum = Math.min(minimum, height);
          maximum = Math.max(maximum, height);
          if (previousHeight !== undefined)
            assert.ok(
              Math.abs(height - previousHeight) < 0.008,
              `${label}: panel join raises the hull by ${height - previousHeight}m`,
            );
          previousHeight = height;
          const tilt = up
            .clone()
            .applyQuaternion(body.quaternion)
            .angleTo(reference.up);
          assert.ok(tilt < 0.003, `${label}: panel join pitches the hull`);
          assert.ok(body.support && runtime.pose(1).grounded, label);
          assert.equal(
            body.contacts.some(({ shape }) => shape.kind === 'deck'),
            false,
            `${label}: supporting panels cannot also hit the chassis`,
          );
          assert.equal(
            events.some(({ type }) =>
              ['road-departure', 'jump-miss', 'jump-transfer'].includes(type),
            ),
            false,
            label,
          );
          assert.ok(before - state.speed < 0.015, `${label}: seam braking`);
        }
        assert.ok(state.distance >= start + 80, `${label}: forward progress`);
        assert.ok(covered > ticks * 0.9, `${label}: actual road skins sampled`);
        assert.ok(maximum - minimum < 0.012, `${label}: repeated seam bobbing`);
        assert.ok(state.speed > speed * 0.99, `${label}: retained momentum`);
      }
});

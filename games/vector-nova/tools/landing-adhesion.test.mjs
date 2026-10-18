import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { loadLevel } from './level-checks/level-contract.mjs';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { createVehicleState } from '../src/physics/index.js';
import { magneticFrame } from '../src/physics/magnetic-body.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';

const DT = 1 / 120;
const up = new T.Vector3(0, 1, 0);

// Real tilted touchdown on Umbra's authored first receiving road, including
// its tidal force. Steering starts on the tick immediately after touchdown.
test('Umbra Wide landing restores traction immediately and smooths only presentation', async (t) => {
  const { createLevel } = await loadLevel('umbra-wide');
  const level = await createLevel({}),
    track = level.createTrack();
  const collisionWorld = level.createCollisionWorld({ track });
  const dynamics = await createRapierWorld({
    collisionWorld: withMagneticBoundaries(track, collisionWorld),
  });
  t.after(() => {
    dynamics.dispose();
    collisionWorld.dispose();
  });
  for (const scenario of ['jump1-success', 'jump1-imperfect']) {
    const headings = new Map();
    for (const steer of [-1, 0, 1]) {
      let actor;
      const runtime = level.createRuntime({
        track,
        collisionWorld,
        dynamics: {
          ...dynamics,
          createActor: (...args) => (actor = dynamics.createActor(...args)),
        },
        presentation: false,
      });
      const state = { ...createVehicleState(), ...track.scenarios[scenario] };
      runtime.reset({ state });
      try {
        let landed = null,
          initialTilt,
          previousHeight,
          previousTilt;
        for (let tick = 0; tick < 600; tick++) {
          const events = runtime.advance(
            state,
            { throttle: 1, steer: landed === null ? 0 : steer },
            DT,
          );
          const transfer = events.find(({ type }) => type === 'jump-transfer');
          if (transfer) {
            assert.equal(transfer.payload.outcome, 'landed');
            landed = tick;
          }
          if (landed === null) continue;
          const age = tick - landed,
            body = actor.read(),
            view = runtime.pose(1);
          const frame = magneticFrame(
            track,
            state.distance,
            state.lateral,
            dynamics.sampleRoadSurface,
          );
          const tilt = up
            .clone()
            .applyQuaternion(view.quaternion)
            .angleTo(frame.up);
          const height = view.position
            .clone()
            .sub(frame.position)
            .dot(frame.up);
          if (age === 0) {
            initialTilt = tilt;
            assert.ok(tilt > 0.2, 'the real touchdown exercises a tilted hull');
            assert.deepEqual(
              view.position,
              body.position,
              'the contact pose is preserved',
            );
            assert.ok(view.quaternion.angleTo(body.quaternion) < 1e-7);
          } else {
            assert.ok(
              body.support,
              'the first grounded tick already has normal support',
            );
            const normal = up.clone().applyQuaternion(body.support.quaternion);
            assert.ok(
              up.clone().applyQuaternion(body.quaternion).dot(normal) >
                1 - 1e-8,
              'physical pitch/roll settle immediately',
            );
            assert.ok(
              Math.abs(body.velocity.dot(normal)) < 1e-6,
              'no residual vertical bounce',
            );
            assert.ok(
              body.angularVelocity.clone().cross(normal).length() < 1e-6,
              'only yaw spin remains',
            );
            assert.ok(
              Math.abs(height - previousHeight) < 0.15,
              `visible height pop at ${age}: ${previousHeight} -> ${height}`,
            );
            assert.ok(
              tilt <= previousTilt + 0.001,
              'visible tilt decays without alternating amplification',
            );
          }
          const vertices = getCollisionHull(state.shipId).vertices;
          for (let i = 0; i < vertices.length; i += 3) {
            const clearance = new T.Vector3()
              .fromArray(vertices, i)
              .applyQuaternion(view.quaternion)
              .add(view.position)
              .sub(frame.position)
              .dot(frame.up);
            assert.ok(
              clearance > -0.005,
              'visible hull remains above the receiving deck',
            );
          }
          assert.equal(
            events.some(({ type }) =>
              ['road-departure', 'jump-miss'].includes(type),
            ),
            false,
          );
          assert.ok(state.speed > 75, 'landing retains forward momentum');
          if (age === 12) {
            headings.set(steer, state.heading);
            assert.ok(
              tilt < initialTilt * 0.4,
              'visual alignment is already mostly complete by 100ms',
            );
          }
          if (age >= 20) {
            assert.ok(view.quaternion.angleTo(body.quaternion) < 1e-7);
            assert.ok(
              view.position.distanceTo(body.position) < 1e-7,
              'visual smoothing ends within 160ms plus one tick',
            );
            break;
          }
          previousHeight = height;
          previousTilt = tilt;
        }
        assert.notEqual(landed, null, `${scenario} must reach touchdown`);
      } finally {
        runtime.dispose();
      }
    }
    assert.ok(
      headings.get(-1) - headings.get(0) > 0.1,
      'left input already turns during visual smoothing',
    );
    assert.ok(
      headings.get(0) - headings.get(1) > 0.1,
      'right input already turns during visual smoothing',
    );
  }
});

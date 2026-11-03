import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, MathUtils } from 'three';
import { createLevel3Track } from '../src/levels/nacre/track/model.js';
import { createNacreCollisionWorld } from '../src/levels/nacre/collision.js';
import { createNacreRuntime } from '../src/levels/nacre/track/runtime.js';
import { createVehicleState } from '../src/physics/index.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { withMagneticBoundaries } from '../src/physics/magnetic-boundaries.js';
import { projectMagneticBody } from '../src/physics/magnetic-body.js';
import { getCollisionHull } from '../src/ships/collision-hulls.js';
import { vehicleHandling } from '../src/ships/catalog.js';

const DT = 1 / 120;
const CONTACT_TOLERANCE = 0.03;

function assertHullClearance(track, dynamics, guide, pose, hull, label) {
  const frame = guide.frame;
  const vertex = new Vector3();
  let covered = 0;
  for (let i = 0; i < hull.vertices.length; i += 3) {
    vertex.fromArray(hull.vertices, i).applyQuaternion(pose.quaternion);
    const along = vertex.dot(frame.tangent) / (frame.longitudinalMetric ?? 1);
    const lateral =
      guide.lateral +
      (vertex.dot(frame.right) - (frame.longitudinalShear ?? 0) * along) /
        (frame.lateralMetric ?? 1);
    // Overhanging wings may be beyond the finite deck. Check every vertex
    // whose road coordinate actually has a production skin beneath it.
    if (Math.abs(lateral) > track.width / 2 - 0.02) continue;
    const distance = MathUtils.euclideanModulo(
      guide.distance + along,
      track.length,
    );
    const surface = dynamics.sampleRoadSurface(
      distance,
      lateral,
      track.sample(distance),
    );
    if (!surface) continue;
    covered++;
    const clearance = vertex
      .add(pose.position)
      .sub(surface.position)
      .dot(surface.up);
    assert.ok(
      clearance >= -CONTACT_TOLERANCE,
      `${label}: hull vertex penetrates the actual deck by ${-clearance}m at ${distance}/${lateral}`,
    );
  }
  return covered;
}

test('Nacre Jump Drive lands at both production deck edges without physical or visual hull penetration', async (t) => {
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
  t.after(() => {
    native.dispose();
    collisionWorld.dispose();
  });
  // This receiving straight has real ceramic panels, gills and curbs in the
  // production collision world. Nacre retains this actual running skin around
  // the full course, including both inboard edge-landing positions.
  const distance = track.jumps[1].landingStart + 45;
  let landed = 0;
  for (const shipId of ['kestrel', 'shrike'])
    for (const side of [-1, 1])
      for (const inset of [1, 2, 5])
        for (const boost of [false, true]) {
          const label = `${shipId}, side ${side}, inset ${inset}m, boost ${boost}`;
          const runtime = createNacreRuntime({
            track,
            collisionWorld,
            dynamics,
            settings: { steeringAssist: 0.3 },
          });
          try {
            native.reset();
            const state = {
              ...createVehicleState(shipId),
              distance,
              lateral: side * (track.width / 2 - inset),
            };
            state.speed =
              vehicleHandling(state)[boost ? 'boostSpeed' : 'cruiseSpeed'];
            const input = { throttle: 1, steer: 0, boost };
            runtime.reset({ reason: 'initialize', state, seed: 7 });
            runtime.advance(state, input, DT);
            assert.ok(
              runtime.jump(state),
              `${label}: Jump Drive did not launch`,
            );
            const hull = getCollisionHull(shipId);
            let guide = { distance: state.distance, lateral: state.lateral };
            let landTick = null;
            let settled = false;
            for (let tick = 0; tick < 540; tick++) {
              const events = runtime.advance(state, input, DT);
              const transfer = events.find(
                ({ type }) => type === 'jump-transfer',
              );
              if (transfer) {
                assert.equal(
                  transfer.payload.outcome,
                  'landed',
                  `${label}: recovered instead of landing`,
                );
                assert.equal(landTick, null, `${label}: repeated touchdown`);
                landTick = tick;
              }
              const body = actor.read();
              const visual = runtime.pose(1);
              guide = projectMagneticBody(
                track,
                body.position,
                guide.distance,
                guide.lateral,
                native.sampleRoadSurface,
              );
              assert.ok(
                Math.abs(guide.lateral) <= track.width / 2,
                `${label}: centre departed the road at tick ${tick}`,
              );
              for (const [kind, pose] of [
                ['physical', body],
                ['visual', visual],
              ]) {
                const covered = assertHullClearance(
                  track,
                  native,
                  guide,
                  pose,
                  hull,
                  `${label}, ${kind}, tick ${tick}`,
                );
                assert.ok(
                  covered > 0,
                  `${label}, ${kind}, tick ${tick}: no production skin beneath the hull`,
                );
              }
              if (landTick !== null && tick >= landTick + 24) {
                assert.equal(
                  visual.grounded,
                  true,
                  `${label}: lost adhesion after touchdown`,
                );
                settled = true;
                break;
              }
            }
            assert.ok(
              settled,
              `${label}: landing and 24 settling ticks did not complete`,
            );
            landed++;
          } finally {
            runtime.dispose();
          }
        }
  assert.equal(landed, 24);
});

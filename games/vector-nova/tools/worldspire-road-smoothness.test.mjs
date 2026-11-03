import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldspireTrack } from '../src/levels/worldspire/track/model.js';
import { createWorldspireRoad } from '../src/levels/worldspire/track/road.js';
import { createWorldspireRuntime } from '../src/levels/worldspire/runtime.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';

function runningSkin(track) {
  const triangles = [];
  const road = createWorldspireRoad({
    track,
    collectSolid({ name, geometry, ...info }) {
      if (info.kind !== 'deck') return;
      for (const triangle of indexedTriangles(
        geometry.attributes.position.array,
        geometry.index.array,
        { id: name, ...info },
        null,
        geometry.attributes.roadCoord,
      ))
        triangles.push(triangle);
    },
  });
  road.dispose();
  return triangles;
}

async function nativeRide(t, track) {
  // Use the actual rendered/solid skin; intentional rails and scenery contacts
  // do not belong to this measurement of the road's ride quality.
  const collisionWorld = createCollisionWorld({
    id: 'worldspire-running-skin-test',
    version: 1,
    geometryId: track.geometryVersion,
    triangles: runningSkin(track),
  });
  const native = await createRapierWorld({ collisionWorld });
  let actor;
  const dynamics = {
    ...native,
    createActor(...args) {
      actor = native.createActor(...args);
      return actor;
    },
  };
  const runtime = createWorldspireRuntime({
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
  return { native, runtime, readBody: () => actor.read() };
}

test('Worldspire full corkscrews keep native and visible hull ripple below 1.5 centimetres', async (t) => {
  const track = createWorldspireTrack();
  const { native, runtime, readBody } = await nativeRide(t, track);
  const peaks = [];
  for (const roll of track.inversions) {
    const peak = { roll: roll.id, body: 0, visual: 0, windows: 0 };
    for (const shipId of ['kestrel', 'shrike'])
      for (const boost of [false, true])
        for (const lateral of [-12, 4, 12]) {
          const pace = getVehiclePace(shipId, track.pace);
          const speed = boost ? pace.boostSpeed : pace.cruiseSpeed;
          let covered = roll.start;
          // Overlapping windows sample the entire roll without steering a
          // neutral craft around a complete turn or running a real-time lap.
          for (let start = roll.start - 24; start < roll.end; start += 24) {
            const label = `${roll.id}, ${shipId}, lane ${lateral}, ${boost ? 'boost' : 'cruise'}, window ${start.toFixed(2)}m`;
            const state = {
              ...createVehicleState(shipId),
              distance: start,
              lateral,
              speed,
            };
            native.reset();
            runtime.reset({ reason: 'initialize', state, seed: 7 });
            const heights = [];
            for (let tick = 0; tick < 30; tick++) {
              const events = runtime.advance(
                state,
                { throttle: 1, steer: 0, boost },
                1 / 120,
              );
              const body = readBody();
              const visual = runtime.pose(1);
              const skin = native.sampleRoadSurface(
                state.distance,
                state.lateral,
                track.sample(state.distance),
              );
              assert.ok(skin, `${label}: missing actual running skin`);
              assert.ok(
                body.support && visual.grounded,
                `${label}: lost support`,
              );
              assert.equal(
                body.contacts.some(({ shape }) => shape.kind === 'deck'),
                false,
                `${label}: false deck contact`,
              );
              assert.equal(state.resetCount, 0, `${label}: recovered`);
              assert.ok(
                events.every(
                  ({ type }) =>
                    ![
                      'road-departure',
                      'road-recovery',
                      'jump-launch',
                      'jump-miss',
                    ].includes(type),
                ),
                `${label}: departed or recovered`,
              );
              heights.push({
                distance: state.distance,
                body: body.position.clone().sub(skin.position).dot(skin.up),
                visual: visual.position.clone().sub(skin.position).dot(skin.up),
              });
            }
            assert.ok(
              state.distance >= start + 24,
              `${label}: overlapping forward coverage`,
            );
            covered = Math.max(covered, state.distance);
            peak.windows++;
            // The centered five-tap residual rejects repeated facet bobbing
            // without treating slow, legitimate whole-hull clearance as jitter.
            for (let i = 2; i < heights.length - 2; i++)
              for (const kind of ['body', 'visual']) {
                const average =
                  heights
                    .slice(i - 2, i + 3)
                    .reduce((sum, row) => sum + row[kind], 0) / 5;
                const residual = Math.abs(heights[i][kind] - average);
                assert.ok(
                  Number.isFinite(residual),
                  `${label}: nonfinite ${kind} height`,
                );
                if (residual > peak[kind]) {
                  peak[kind] = residual;
                  peak[`${kind}At`] =
                    `${label}, station ${heights[i].distance.toFixed(2)}m`;
                }
              }
          }
          assert.ok(covered >= roll.end, `${roll.id}: full roll coverage`);
        }
    peaks.push(peak);
    t.diagnostic(JSON.stringify(peak));
  }
  for (const peak of peaks)
    for (const kind of ['body', 'visual'])
      assert.ok(
        peak[kind] < 0.015,
        `${peak[`${kind}At`]}: ${kind} five-tap ripple ${(peak[kind] * 1000).toFixed(2)}mm exceeds 15mm`,
      );
});

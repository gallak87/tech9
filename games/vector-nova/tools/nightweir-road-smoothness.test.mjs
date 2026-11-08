import test from 'node:test';
import assert from 'node:assert/strict';
import { createNightweirTrack } from '../src/levels/nightweir/track/model.js';
import { createNightweirRoad } from '../src/levels/nightweir/track/road.js';
import { createNightweirRuntime } from '../src/levels/nightweir/runtime.js';
import {
  createCollisionWorld,
  indexedTriangles,
} from '../src/physics/collision-world.js';
import { createRoadSurface } from '../src/physics/road-surface.js';
import { createRapierWorld } from '../src/physics/rapier-world.js';
import { createVehicleState, getVehiclePace } from '../src/physics/index.js';

function runningSkin(track) {
  const triangles = [];
  const road = createNightweirRoad({
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
    id: 'nightweir-running-skin-test',
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
  const runtime = createNightweirRuntime({
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

test('Nightweir banked running faces and its grid extension stay close to the authored sheet', () => {
  const track = createNightweirTrack();
  const sample = createRoadSurface(runningSkin(track));
  try {
    assert.ok(
      track.sample(-10).up.distanceTo(track.sample(0.00001).up) < 1e-4,
      'the first positive station cannot introduce a sudden bank',
    );
    for (let s = 0; s < track.length; s += 2.1) {
      if (track.isGap(s)) continue;
      const reference = track.sample(s);
      for (const lateral of [-18, -9, 0, 9, 18]) {
        const face = sample(s, lateral, reference);
        assert.ok(face, `supported skin missing at ${s}, ${lateral}`);
        const error = Math.abs(
          face.position.clone().sub(reference.position).dot(reference.up),
        );
        assert.ok(
          error < 0.05,
          `banked panel rises ${error}m at ${s}, ${lateral}`,
        );
      }
    }
  } finally {
    sample.dispose();
  }
});

test('Nightweir native chassis stays still on the grid and crosses banked facets without large bobs', async (t) => {
  const track = createNightweirTrack();
  const { native, runtime, readBody } = await nativeRide(t, track);
  const idle = createVehicleState();
  runtime.reset({ reason: 'initialize', state: idle, seed: 7 });
  const placement = runtime.pose(1);
  for (let tick = 0; tick < 360; tick++) {
    runtime.advance(idle, {}, 1 / 120);
    assert.ok(
      runtime.pose(1).position.distanceTo(placement.position) < 1e-5,
      `starting chassis bobbed at tick ${tick}`,
    );
  }
  for (const distance of [50, 1650, 11069.5])
    for (const lateral of [-8, 0, 8])
      for (const boost of [false, true]) {
        const label = `${distance}m, lane ${lateral}, ${boost ? 'boost' : 'cruise'}`;
        const state = {
          ...createVehicleState(),
          distance,
          lateral,
          speed: boost ? 168 : 118,
        };
        native.reset();
        runtime.reset({ reason: 'initialize', state, seed: 7 });
        let previousHeight;
        // Keep neutral-yaw probes within the actual supported corridor.
        const ticks = distance === 1650 ? 40 : 60;
        for (let tick = 0; tick < ticks; tick++) {
          runtime.advance(state, { throttle: 1, steer: 0, boost }, 1 / 120);
          const body = readBody();
          const reference = track.sample(state.distance);
          const height = body.position
            .clone()
            .sub(reference.position)
            .dot(reference.up);
          if (previousHeight !== undefined)
            assert.ok(
              Math.abs(height - previousHeight) <
                (distance === 50 ? 0.005 : 0.04),
              `${label}: a facet changed support height by ${height - previousHeight}m`,
            );
          previousHeight = height;
          assert.ok(
            body.support && runtime.pose(1).grounded,
            `${label}: lost support`,
          );
          assert.equal(
            body.contacts.some(({ shape }) => shape.kind === 'deck'),
            false,
            `${label}: support skin also collided with the chassis`,
          );
        }
        assert.ok(
          state.distance > distance + 30,
          `${label}: retained forward travel`,
        );
      }
});

test('Nightweir full corkscrews keep native and visible hull ripple below one centimetre', async (t) => {
  const track = createNightweirTrack();
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
        peak[kind] < 0.01,
        `${peak[`${kind}At`]}: ${kind} five-tap ripple ${(peak[kind] * 1000).toFixed(2)}mm exceeds 10mm`,
      );
});
